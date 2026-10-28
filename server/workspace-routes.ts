import { fitCaption } from './captions.js';
import type { Channel } from '../src/domain/shared.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { publishingPreset } from '../src/domain/output-presets.js';
import { z } from 'zod';
import { DEPARTMENTS, ROLES } from '../src/domain/catalog.js';
import { CONTENT_STATUSES, type ContentStatus } from '../src/domain/content.js';
import { ALL_PERMISSIONS, type Permission } from '../src/domain/users.js';
import {
  authenticate, clearFailedLogins, createSession, createUser, endSession, isDepartment, isRole, listUsers, loginBlocked,
  readCookie, recordFailedLogin, requirePermission, requireUser, SESSION_COOKIE, updateUser, userCan, getUser, type AuthUser,
} from './auth.js';
import {
  addComment, addVersion, allowedMoves, canEdit, canSee, contentIsMutable, createContent, getContent, listContent, listEvents, listVersions, transition, updateContent, WorkspaceError, type StoredContent,
} from './workspace.js';
import { db, defineSchema } from './db.js';
import { notifyContent } from './notify.js';
import { getTemplate } from './svg-templates.js';

const CHANNELS = ['facebook', 'instagram', 'whatsapp', 'linkedin', 'tiktok', 'snapchat', 'youtube', 'website'] as const;
const creativeUrl = z.string().regex(/^\/api\/creatives\/[0-9a-f-]{36}\/[a-z0-9.-]+\.png$|^\/api\/studio\/[0-9a-f-]{36}\.png$|^\/api\/uploads\/[0-9a-f-]{36}\.png$/);
const svgTemplateRef = z.object({ id: z.string().uuid(), values: z.record(z.string().max(40), z.string().max(2000)), format: z.enum(['feed', 'square', 'story', 'landscape']).optional(), context: z.string().max(800).optional(), outputPreset: z.string().max(80).optional() });
const creativeRef = z.object({ requestId: z.string().max(60), directionId: z.string().max(40), imageUrl: creativeUrl, storyUrl: creativeUrl.optional(), landscapeUrl: creativeUrl.optional(), youtubeUrl: creativeUrl.optional(), model: z.string().max(60).optional(), directionName: z.string().max(200).optional(), svgTemplate: svgTemplateRef.optional() });
const captions = z.partialRecord(z.enum(CHANNELS), z.string().max(5000));

const publicUser = (user: AuthUser) => ({ id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId, title: user.title, status: user.status, lastActiveAt: user.lastActiveAt, permissionOverrides: user.permissionOverrides });
const withMoves = (user: AuthUser) => (item: StoredContent) => ({ ...item, moves: allowedMoves(user, item), editable: canEdit(user, item) && contentIsMutable(item), canSchedule: userCan(user, 'content.schedule') });

async function checkTemplate(ref: z.infer<typeof svgTemplateRef>) {
  if (ref.outputPreset && (!publishingPreset(ref.outputPreset) || publishingPreset(ref.outputPreset)!.format !== ref.format)) throw new WorkspaceError(400, 'مقاس النشر غير صالح أو لا يطابق التصميم.');
  const template = await getTemplate(ref.id);
  if (!template) throw new WorkspaceError(400, 'القالب غير موجود؛ اختر قالبًا من المكتبة.');
  if (Object.keys(ref.values).some((key) => !template.fields.some((field) => field.key === key))) throw new WorkspaceError(400, 'حقول القالب غير صالحة.');
  for (const field of template.fields.filter((f) => f.type === 'image')) {
    const value = ref.values[field.key];
    if (value && !/^\/post-assets\/[a-z0-9-]+\.(jpg|png|webp)$|^\/api\/uploads\/[a-f0-9-]{36}\.png$/.test(value)) throw new WorkspaceError(400, 'استخدم صورة مرفوعة داخل القالب.');
  }
}

function fail(res: express.Response, error: unknown) {
  if (error instanceof WorkspaceError) return res.status(error.status).json({ error: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'البيانات غير صالحة.' });
  return res.status(400).json({ error: error instanceof Error ? error.message : 'حدث خطأ.' });
}

export function registerAuthRoutes(app: express.Express) {
  app.post('/api/auth/login', async (req, res) => {
    const parsed = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اكتب البريد الإلكتروني وكلمة المرور.' });
    const key = `${parsed.data.email.toLowerCase()}|${req.ip}`;
    if (loginBlocked(key)) return res.status(429).json({ error: 'محاولات كثيرة. انتظر ربع ساعة ثم حاول مرة أخرى.' });
    const user = await authenticate(parsed.data.email, parsed.data.password);
    if (!user) { recordFailedLogin(key); return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' }); }
    clearFailedLogins(key);
    const session = await createSession(user.id);
    res.cookie(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', expires: new Date(session.expiresAt) });
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await endSession(decodeURIComponent(token));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/auth/me', requireUser, async (req, res) => {
    const user = req.user!;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      user: publicUser(user),
      permissions: ALL_PERMISSIONS.filter((p) => userCan(user, p)),
      roles: Object.values(ROLES).map((r) => ({ id: r.id, name: r.name, description: r.description, permissions: r.permissions })),
      departments: DEPARTMENTS.map((d) => ({ id: d.id, name: d.name })),
    });
  });
}

defineSchema(`CREATE TABLE IF NOT EXISTS permission_changes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, actor_id TEXT NOT NULL, overrides_json TEXT NOT NULL, created_at TEXT NOT NULL)`);

export function registerWorkspaceRoutes(app: express.Express) {
  app.get('/api/permissions', requireUser, requirePermission('users.manage'), async (_req, res) => {
    res.json({ roles: Object.values(ROLES), permissions: ALL_PERMISSIONS, users: (await listUsers()).map(publicUser) });
  });
  app.patch('/api/users/:id/permissions', requireUser, requirePermission('users.manage'), async (req, res) => {
    const parsed = z.object({ overrides: z.partialRecord(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]), z.boolean()) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اختر صلاحيات صالحة.' });
    const target = await getUser(String(req.params.id));
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود.' });
    if (target.id === req.user!.id || target.role === 'admin') return res.status(400).json({ error: 'صلاحيات حساب المسؤول محمية؛ عدّل المستخدمين الآخرين.' });
    await db.run('UPDATE users SET permission_overrides=? WHERE id=?', [JSON.stringify(parsed.data.overrides), target.id]);
    await db.run('INSERT INTO permission_changes (id,user_id,actor_id,overrides_json,created_at) VALUES (?,?,?,?,?)', [randomUUID(), target.id, req.user!.id, JSON.stringify(parsed.data.overrides), new Date().toISOString()]);
    res.json(publicUser((await getUser(target.id))!));
  });

  app.get('/api/users', requireUser, async (req, res) => {
    const all = await listUsers();
    res.json(userCan(req.user!, 'users.manage') ? all.map(publicUser) : all.filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.name, departmentId: u.departmentId, role: u.role })));
  });
  const userInput = z.object({ email: z.string().email().max(200), name: z.string().trim().min(2).max(120), role: z.string().refine(isRole), departmentId: z.string().refine(isDepartment).nullable(), title: z.string().max(120).optional(), password: z.string().min(10).max(200) });
  app.post('/api/users', requireUser, requirePermission('users.manage'), async (req, res) => {
    try {
      const input = userInput.parse(req.body);
      res.status(201).json(publicUser(await createUser({ ...input, role: input.role as never, departmentId: input.departmentId as never })));
    } catch (error) {
      if (error instanceof Error && /UNIQUE/.test(error.message)) return res.status(409).json({ error: 'هذا البريد الإلكتروني مستخدم بالفعل.' });
      fail(res, error);
    }
  });
  app.patch('/api/users/:id', requireUser, requirePermission('users.manage'), async (req, res) => {
    try {
      const patch = userInput.omit({ email: true }).partial().extend({ status: z.enum(['active', 'suspended']).optional() }).parse(req.body);
      if (req.params.id === req.user!.id && (patch.status === 'suspended' || (patch.role && patch.role !== 'admin'))) return res.status(400).json({ error: 'لا يمكنك إيقاف حسابك أو تغيير دوره.' });
      const user = await updateUser(String(req.params.id), patch as never);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });
      res.json(publicUser(user));
    } catch (error) { fail(res, error); }
  });

  app.get('/api/content', requireUser, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json((await listContent(req.user!)).map(withMoves(req.user!)));
  });
  app.post('/api/content', requireUser, requirePermission('content.create'), async (req, res) => {
    try {
      const input = z.object({ title: z.string().trim().min(2).max(300), channels: z.array(z.enum(CHANNELS)).min(1).max(8), captions: captions.default({}), creative: creativeRef.nullable(), templateId: z.string().max(80).nullable().optional() }).parse(req.body);
      if (!userCan(req.user!, 'design.free') && !input.creative?.svgTemplate) return res.status(403).json({ error: 'تصمّم من القوالب المعتمدة فقط.', code: 'forbidden' });
      if (input.creative?.svgTemplate) await checkTemplate(input.creative.svgTemplate);
      // New posts start within each platform's rules (hashtag count, links, length).
      const fitted = Object.fromEntries(Object.entries(input.captions).map(([c, text]) => [c, text ? fitCaption(c as Channel, text) : text]));
      const item = await createContent(req.user!, { ...input, captions: fitted });
      void notifyContent(req.user!, item, 'created');
      res.status(201).json(withMoves(req.user!)(item));
    } catch (error) { fail(res, error); }
  });
  app.get('/api/content/:id', requireUser, async (req, res) => {
    const item = await getContent(String(req.params.id));
    if (!item || !canSee(req.user!, item)) return res.status(404).json({ error: 'المحتوى غير موجود.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...withMoves(req.user!)(item), versions: await listVersions(item.id), events: await listEvents(item.id) });
  });
  app.patch('/api/content/:id', requireUser, async (req, res) => {
    try {
      const patch = z.object({ title: z.string().trim().min(2).max(300).optional(), channels: z.array(z.enum(CHANNELS)).min(1).max(8).optional(), captions: captions.optional() }).parse(req.body);
      res.json(withMoves(req.user!)(await updateContent(req.user!, String(req.params.id), patch)));
    } catch (error) { fail(res, error); }
  });
  app.post('/api/content/:id/transition', requireUser, async (req, res) => {
    try {
      const input = z.object({ to: z.enum(CONTENT_STATUSES as [ContentStatus, ...ContentStatus[]]), note: z.string().max(2000).optional(), scheduledAt: z.iso.datetime().optional() }).parse(req.body);
      const item = await transition(req.user!, String(req.params.id), input.to, input);
      void notifyContent(req.user!, item, input.to);
      res.json(withMoves(req.user!)(item));
    } catch (error) { fail(res, error); }
  });
  app.post('/api/content/:id/comments', requireUser, async (req, res) => {
    try {
      const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
      await addComment(req.user!, String(req.params.id), body);
      res.status(201).json({ events: await listEvents(String(req.params.id)) });
    } catch (error) { fail(res, error); }
  });
  app.post('/api/content/:id/versions', requireUser, async (req, res) => {
    try {
      const item = await getContent(String(req.params.id));
      if (!item || !canEdit(req.user!, item)) return res.status(404).json({ error: 'المحتوى غير موجود.' });
      const input = z.object({ imageUrl: creativeUrl, storyUrl: creativeUrl.nullable().default(null), studio: z.unknown().optional().refine((v) => !(v && typeof v === 'object' && 'svgTemplate' in v) || svgTemplateRef.safeParse((v as { svgTemplate: unknown }).svgTemplate).success), note: z.string().max(300).default('Studio edit') }).parse(req.body);
      if (!userCan(req.user!, 'design.free') && !(input.studio && typeof input.studio === 'object' && 'svgTemplate' in input.studio)) return res.status(403).json({ error: 'تعدّل من القوالب المعتمدة فقط.', code: 'forbidden' });
      if (input.studio && typeof input.studio === 'object' && 'svgTemplate' in input.studio) await checkTemplate(svgTemplateRef.parse(input.studio.svgTemplate));
      res.status(201).json(await addVersion(req.user!, item.id, { ...input, studio: input.studio ?? null }));
    } catch (error) { fail(res, error); }
  });
}
