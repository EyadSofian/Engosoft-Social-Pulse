/** Email + password sign-in. Admins create users; passwords are scrypt-hashed; sessions are HTTP-only cookies. */
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type express from 'express';
import { can, DEPARTMENTS, ROLES } from '../src/domain/catalog.js';
import { ALL_PERMISSIONS, type DepartmentId, type Permission, type RoleId } from '../src/domain/users.js';
import { db, defineColumn, defineMigration, defineSchema } from './db.js';

defineSchema(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, role TEXT NOT NULL,
 department_id TEXT, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL, last_active_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
`);

defineColumn('users', 'permission_overrides', "TEXT NOT NULL DEFAULT '{}'");
export interface AuthUser { id: string; email: string; name: string; role: RoleId; departmentId: DepartmentId | null; title: string; status: 'active' | 'suspended'; lastActiveAt: string | null; permissionOverrides?: Partial<Record<Permission, boolean>> }
const overridesFrom = (value: unknown): AuthUser['permissionOverrides'] => { try { const parsed = JSON.parse(String(value || '{}')); return Object.fromEntries(Object.entries(parsed).filter(([k,v]) => ALL_PERMISSIONS.includes(k as Permission) && typeof v === 'boolean')); } catch { return {}; } };

/** Roles from before the five-role model (2026-10-28) and what each allowed. */
const LEGACY_ROLES: Record<string, { to: RoleId; permissions: Permission[] }> = {
  publisher: { to: 'supervisor', permissions: ['design.free', 'content.create', 'content.edit_own', 'content.edit_any', 'content.schedule', 'content.publish', 'task.assign', 'analytics.view', 'analytics.view_all', 'credits.view', 'plans.view_all'] },
  department_manager: { to: 'supervisor', permissions: ['design.free', 'content.create', 'content.edit_own', 'content.edit_department', 'task.assign', 'analytics.view', 'credits.view'] },
  employee: { to: 'creator', permissions: ['design.free', 'content.create', 'content.edit_own', 'analytics.view'] },
  designer: { to: 'creator', permissions: ['design.free', 'content.edit_own'] },
  media_editor: { to: 'creator', permissions: ['design.free', 'content.edit_own'] },
  lecturer: { to: 'creator', permissions: ['design.free', 'content.create', 'content.edit_own'] },
  freelancer: { to: 'creator', permissions: ['design.free', 'content.create', 'content.edit_own'] },
  operations: { to: 'creator', permissions: ['content.create', 'content.edit_own'] },
};
/** Moves stored accounts onto the new roles. Overrides keep each person's effective permissions exactly as they were. */
export async function migrateLegacyRoles(): Promise<number> {
  let moved = 0;
  for (const row of await db.all<{ id: string; role: string; permission_overrides: string }>('SELECT id, role, permission_overrides FROM users')) {
    const legacy = LEGACY_ROLES[row.role];
    if (!legacy) continue;
    const old = overridesFrom(row.permission_overrides) ?? {};
    const effective = (p: Permission) => old[p] ?? legacy.permissions.includes(p);
    const overrides = Object.fromEntries(ALL_PERMISSIONS.filter((p) => effective(p) !== can(legacy.to, p)).map((p) => [p, effective(p)]));
    const result = await db.run('UPDATE users SET role=?, permission_overrides=? WHERE id=? AND role=?', [legacy.to, JSON.stringify(overrides), row.id, row.role]);
    moved += result.changes;
  }
  return moved;
}
defineMigration(migrateLegacyRoles);
export const SESSION_COOKIE = 'sp_session';
const SESSION_DAYS = 14;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 64).toString('base64')}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}
export const passwordProblem = (password: string) => password.length < 10 ? 'يجب ألا تقل كلمة المرور عن 10 أحرف.' : null;

const toUser = (r: Record<string, unknown>): AuthUser => ({
  permissionOverrides: overridesFrom(r.permission_overrides),
  id: String(r.id), email: String(r.email), name: String(r.name), role: r.role as RoleId,
  departmentId: (r.department_id as DepartmentId | null) ?? null, title: String(r.title ?? ''),
  status: r.status === 'suspended' ? 'suspended' : 'active', lastActiveAt: (r.last_active_at as string | null) ?? null,
});
export const listUsers = async () => (await db.all('SELECT * FROM users ORDER BY created_at')).map(toUser);
export const getUser = async (id: string) => { const r = await db.get('SELECT * FROM users WHERE id=?', [id]); return r ? toUser(r) : undefined; };

export const isRole = (value: unknown): value is RoleId => typeof value === 'string' && value in ROLES;
export const isDepartment = (value: unknown): value is DepartmentId => DEPARTMENTS.some((d) => d.id === value);

export async function createUser(input: { email: string; name: string; role: RoleId; departmentId: DepartmentId | null; title?: string; password: string }): Promise<AuthUser> {
  const problem = passwordProblem(input.password);
  if (problem) throw new Error(problem);
  const id = randomUUID();
  await db.run('INSERT INTO users (id,email,name,role,department_id,title,status,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, input.email.trim().toLowerCase(), input.name.trim(), input.role, input.departmentId, input.title ?? '', 'active', hashPassword(input.password), new Date().toISOString()]);
  return (await getUser(id))!;
}
export async function updateUser(id: string, patch: Partial<{ name: string; role: RoleId; departmentId: DepartmentId | null; title: string; status: 'active' | 'suspended'; password: string }>): Promise<AuthUser | undefined> {
  const user = await getUser(id);
  if (!user) return undefined;
  if (patch.password !== undefined) {
    const problem = passwordProblem(patch.password);
    if (problem) throw new Error(problem);
    await db.run('UPDATE users SET password_hash=? WHERE id=?', [hashPassword(patch.password), id]);
    await db.run('DELETE FROM sessions WHERE user_id=?', [id]);
  }
  await db.run('UPDATE users SET name=?, role=?, department_id=?, title=?, status=? WHERE id=?',
    [patch.name ?? user.name, patch.role ?? user.role, patch.departmentId === undefined ? user.departmentId : patch.departmentId, patch.title ?? user.title, patch.status ?? user.status, id]);
  if (patch.status === 'suspended') await db.run('DELETE FROM sessions WHERE user_id=?', [id]);
  return getUser(id);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function createSession(userId: string): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;
  await db.run('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)', [tokenHash(token), userId, expiresAt, new Date().toISOString()]);
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  return { token, expiresAt };
}
export const endSession = async (token: string) => { await db.run('DELETE FROM sessions WHERE token_hash=?', [tokenHash(token)]); };
export async function userForToken(token: string): Promise<AuthUser | undefined> {
  const row = await db.get<{ user_id: string; expires_at: number }>('SELECT user_id, expires_at FROM sessions WHERE token_hash=?', [tokenHash(token)]);
  if (!row || row.expires_at < Date.now()) return undefined;
  const user = await getUser(row.user_id);
  if (!user || user.status !== 'active') return undefined;
  return user;
}

export async function authenticate(email: string, password: string): Promise<AuthUser | undefined> {
  const row = await db.get('SELECT * FROM users WHERE lower(email)=?', [email.trim().toLowerCase()]);
  // Hash even when the user does not exist so response time does not reveal registered emails.
  const ok = verifyPassword(password, row ? String(row.password_hash) : 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(88));
  if (!row || !ok || row.status !== 'active') return undefined;
  await db.run('UPDATE users SET last_active_at=? WHERE id=?', [new Date().toISOString(), row.id]);
  return toUser(row);
}

/** First start: create the admin from ADMIN_EMAIL / ADMIN_PASSWORD when no user exists yet. */
export async function bootstrapAdmin(env = process.env): Promise<AuthUser | null> {
  const count = Number((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))?.n ?? 0);
  if (count > 0 || !env.ADMIN_EMAIL?.trim() || !env.ADMIN_PASSWORD) return null;
  return createUser({ email: env.ADMIN_EMAIL, name: env.ADMIN_NAME?.trim() || 'Admin', role: 'admin', departmentId: 'marketing', password: env.ADMIN_PASSWORD });
}

export const userCan = (user: AuthUser, permission: Permission) => user.role === 'admin' || (user.permissionOverrides?.[permission] ?? can(user.role, permission));

export function readCookie(req: express.Request, name: string): string {
  return (req.header('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}
export async function sessionUser(req: express.Request): Promise<AuthUser | undefined> {
  const token = readCookie(req, SESSION_COOKIE);
  return token ? userForToken(decodeURIComponent(token)) : undefined;
}

declare module 'express-serve-static-core' { interface Request { user?: AuthUser } }

/** Attach the signed-in user; reject when there is none. */
export const requireUser: express.RequestHandler = async (req, res, next) => {
  // Routes that already passed the /api gate reuse the user it found.
  const user = req.user ?? await sessionUser(req);
  if (!user) { res.status(401).json({ error: 'سجّل الدخول أولًا.', code: 'unauthenticated' }); return; }
  req.user = user;
  next();
};
export const requirePermission = (permission: Permission): express.RequestHandler => (req, res, next) => {
  if (!req.user || !userCan(req.user, permission)) { res.status(403).json({ error: 'لا تملك صلاحية تنفيذ هذه العملية.', code: 'forbidden' }); return; }
  next();
};

const attempts = new Map<string, number[]>();
/** Five failed logins per email+IP per 15 minutes. */
export function loginBlocked(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((at) => now - at < 15 * 60_000);
  attempts.set(key, recent);
  return recent.length >= 5;
}
export const recordFailedLogin = (key: string) => attempts.set(key, [...(attempts.get(key) || []), Date.now()]);
export const clearFailedLogins = (key: string) => attempts.delete(key);
