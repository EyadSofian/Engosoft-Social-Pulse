import express from 'express';
import { z } from 'zod';
import { DEPARTMENTS, ROLES } from '../src/domain/catalog.js';
import { CONTENT_STATUSES, type ContentStatus } from '../src/domain/content.js';
import { ALL_PERMISSIONS } from '../src/domain/users.js';
import {
  authenticate, clearFailedLogins, createSession, createUser, endSession, isDepartment, isRole, listUsers, loginBlocked,
  readCookie, recordFailedLogin, requirePermission, requireUser, SESSION_COOKIE, updateUser, userCan, type AuthUser,
} from './auth.js';
import {
  addComment, addVersion, allowedMoves, canEdit, createContent, getContent, listContent, listEvents, listVersions, transition, updateContent, WorkspaceError,
} from './workspace.js';

const CHANNELS = ['facebook', 'instagram', 'whatsapp', 'linkedin', 'tiktok', 'snapchat'] as const;
const creativeUrl = z.string().regex(/^\/api\/creatives\/[0-9a-f-]{36}\/[a-z0-9.-]+\.png$|^\/api\/studio\/[0-9a-f-]{36}\.png$/);
const creativeRef = z.object({ requestId: z.string().max(60), directionId: z.string().max(40), imageUrl: creativeUrl, storyUrl: creativeUrl.optional(), model: z.string().max(60).optional(), directionName: z.string().max(200).optional() });
const captions = z.partialRecord(z.enum(CHANNELS), z.string().max(5000));

const publicUser = (user: AuthUser) => ({ id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId, title: user.title, status: user.status, lastActiveAt: user.lastActiveAt });
const withMoves = (user: AuthUser) => <T extends ReturnType<typeof getContent>>(item: NonNullable<T>) => ({ ...item, moves: allowedMoves(user, item), editable: canEdit(user, item) });

function fail(res: express.Response, error: unknown) {
  if (error instanceof WorkspaceError) return res.status(error.status).json({ error: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'البيانات غير صالحة.' });
  return res.status(400).json({ error: error instanceof Error ? error.message : 'حصل خطأ.' });
}

export function registerAuthRoutes(app: express.Express) {
  app.post('/api/auth/login', (req, res) => {
    const parsed = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اكتب الإيميل وكلمة المرور.' });
    const key = `${parsed.data.email.toLowerCase()}|${req.ip}`;
    if (loginBlocked(key)) return res.status(429).json({ error: 'محاولات كتير. استنى ربع ساعة وجرّب تاني.' });
    const user = authenticate(parsed.data.email, parsed.data.password);
    if (!user) { recordFailedLogin(key); return res.status(401).json({ error: 'الإيميل أو كلمة المرور غلط.' }); }
    clearFailedLogins(key);
    const session = createSession(user.id);
    res.cookie(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', expires: new Date(session.expiresAt) });
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) endSession(decodeURIComponent(token));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/auth/me', requireUser, (req, res) => {
    const user = req.user!;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      user: publicUser(user),
      permissions: ALL_PERMISSIONS.filter((p) => userCan(user, p)),
      roles: Object.values(ROLES).map((r) => ({ id: r.id, name: r.name })),
      departments: DEPARTMENTS.map((d) => ({ id: d.id, name: d.name })),
    });
  });
}

export function registerWorkspaceRoutes(app: express.Express) {
  app.get('/api/users', requireUser, (req, res) => {
    const all = listUsers();
    res.json(userCan(req.user!, 'users.manage') ? all.map(publicUser) : all.filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.name, departmentId: u.departmentId, role: u.role })));
  });
  const userInput = z.object({ email: z.string().email().max(200), name: z.string().trim().min(2).max(120), role: z.string().refine(isRole), departmentId: z.string().refine(isDepartment).nullable(), title: z.string().max(120).optional(), password: z.string().min(10).max(200) });
  app.post('/api/users', requireUser, requirePermission('users.manage'), (req, res) => {
    try {
      const input = userInput.parse(req.body);
      res.status(201).json(publicUser(createUser({ ...input, role: input.role as never, departmentId: input.departmentId as never })));
    } catch (error) {
      if (error instanceof Error && /UNIQUE/.test(error.message)) return res.status(409).json({ error: 'الإيميل ده مستخدم قبل كده.' });
      fail(res, error);
    }
  });
  app.patch('/api/users/:id', requireUser, requirePermission('users.manage'), (req, res) => {
    try {
      const patch = userInput.omit({ email: true }).partial().extend({ status: z.enum(['active', 'suspended']).optional() }).parse(req.body);
      if (req.params.id === req.user!.id && (patch.status === 'suspended' || (patch.role && patch.role !== 'admin'))) return res.status(400).json({ error: 'مينفعش توقف أو تغيّر دور حسابك أنت.' });
      const user = updateUser(String(req.params.id), patch as never);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });
      res.json(publicUser(user));
    } catch (error) { fail(res, error); }
  });

  app.get('/api/content', requireUser, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(listContent(req.user!).map(withMoves(req.user!)));
  });
  app.post('/api/content', requireUser, requirePermission('content.create'), (req, res) => {
    try {
      const input = z.object({ title: z.string().trim().min(2).max(300), channels: z.array(z.enum(CHANNELS)).min(1).max(6), captions: captions.default({}), creative: creativeRef.nullable(), templateId: z.string().max(80).nullable().optional() }).parse(req.body);
      res.status(201).json(withMoves(req.user!)(createContent(req.user!, input)));
    } catch (error) { fail(res, error); }
  });
  app.get('/api/content/:id', requireUser, (req, res) => {
    const item = getContent(String(req.params.id));
    if (!item || !listContent(req.user!).some((entry) => entry.id === item.id)) return res.status(404).json({ error: 'المحتوى غير موجود.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...withMoves(req.user!)(item), versions: listVersions(item.id), events: listEvents(item.id) });
  });
  app.patch('/api/content/:id', requireUser, (req, res) => {
    try {
      const patch = z.object({ title: z.string().trim().min(2).max(300).optional(), channels: z.array(z.enum(CHANNELS)).min(1).max(6).optional(), captions: captions.optional() }).parse(req.body);
      res.json(withMoves(req.user!)(updateContent(req.user!, String(req.params.id), patch)));
    } catch (error) { fail(res, error); }
  });
  app.post('/api/content/:id/transition', requireUser, (req, res) => {
    try {
      const input = z.object({ to: z.enum(CONTENT_STATUSES as [ContentStatus, ...ContentStatus[]]), note: z.string().max(2000).optional(), scheduledAt: z.iso.datetime().optional() }).parse(req.body);
      res.json(withMoves(req.user!)(transition(req.user!, String(req.params.id), input.to, input)));
    } catch (error) { fail(res, error); }
  });
  app.post('/api/content/:id/comments', requireUser, (req, res) => {
    try {
      const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
      addComment(req.user!, String(req.params.id), body);
      res.status(201).json({ events: listEvents(String(req.params.id)) });
    } catch (error) { fail(res, error); }
  });
  app.post('/api/content/:id/versions', requireUser, (req, res) => {
    try {
      const item = getContent(String(req.params.id));
      if (!item || !canEdit(req.user!, item)) return res.status(404).json({ error: 'المحتوى غير موجود.' });
      const input = z.object({ imageUrl: creativeUrl, storyUrl: creativeUrl.nullable().default(null), studio: z.unknown().optional(), note: z.string().max(300).default('Studio edit') }).parse(req.body);
      res.status(201).json(addVersion(req.user!, item.id, { ...input, studio: input.studio ?? null }));
    } catch (error) { fail(res, error); }
  });
}
