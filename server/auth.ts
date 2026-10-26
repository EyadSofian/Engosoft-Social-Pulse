/** Email + password sign-in. Admins create users; passwords are scrypt-hashed; sessions are HTTP-only cookies. */
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type express from 'express';
import { can, DEPARTMENTS, ROLES } from '../src/domain/catalog.js';
import type { DepartmentId, Permission, RoleId } from '../src/domain/users.js';
import { db } from './store.js';

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, role TEXT NOT NULL,
 department_id TEXT, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL, last_active_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
`);

export interface AuthUser { id: string; email: string; name: string; role: RoleId; departmentId: DepartmentId | null; title: string; status: 'active' | 'suspended'; lastActiveAt: string | null }
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
  id: String(r.id), email: String(r.email), name: String(r.name), role: r.role as RoleId,
  departmentId: (r.department_id as DepartmentId | null) ?? null, title: String(r.title ?? ''),
  status: r.status === 'suspended' ? 'suspended' : 'active', lastActiveAt: (r.last_active_at as string | null) ?? null,
});
export const listUsers = () => (db.prepare('SELECT * FROM users ORDER BY created_at').all() as Record<string, unknown>[]).map(toUser);
export const getUser = (id: string) => { const r = db.prepare('SELECT * FROM users WHERE id=?').get(id) as Record<string, unknown> | undefined; return r ? toUser(r) : undefined; };

export const isRole = (value: unknown): value is RoleId => typeof value === 'string' && value in ROLES;
export const isDepartment = (value: unknown): value is DepartmentId => DEPARTMENTS.some((d) => d.id === value);

export function createUser(input: { email: string; name: string; role: RoleId; departmentId: DepartmentId | null; title?: string; password: string }): AuthUser {
  const problem = passwordProblem(input.password);
  if (problem) throw new Error(problem);
  const id = randomUUID();
  db.prepare('INSERT INTO users (id,email,name,role,department_id,title,status,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, input.email.trim().toLowerCase(), input.name.trim(), input.role, input.departmentId, input.title ?? '', 'active', hashPassword(input.password), new Date().toISOString());
  return getUser(id)!;
}
export function updateUser(id: string, patch: Partial<{ name: string; role: RoleId; departmentId: DepartmentId | null; title: string; status: 'active' | 'suspended'; password: string }>): AuthUser | undefined {
  const user = getUser(id);
  if (!user) return undefined;
  if (patch.password !== undefined) {
    const problem = passwordProblem(patch.password);
    if (problem) throw new Error(problem);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(patch.password), id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  }
  db.prepare('UPDATE users SET name=?, role=?, department_id=?, title=?, status=? WHERE id=?')
    .run(patch.name ?? user.name, patch.role ?? user.role, patch.departmentId === undefined ? user.departmentId : patch.departmentId, patch.title ?? user.title, patch.status ?? user.status, id);
  if (patch.status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  return getUser(id);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;
  db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(tokenHash(token), userId, expiresAt, new Date().toISOString());
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  return { token, expiresAt };
}
export const endSession = (token: string) => { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token)); };
export function userForToken(token: string): AuthUser | undefined {
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash=?').get(tokenHash(token)) as { user_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return undefined;
  const user = getUser(row.user_id);
  if (!user || user.status !== 'active') return undefined;
  return user;
}

export function authenticate(email: string, password: string): AuthUser | undefined {
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  // Hash even when the user does not exist so response time does not reveal registered emails.
  const ok = verifyPassword(password, row ? String(row.password_hash) : 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(88));
  if (!row || !ok || row.status !== 'active') return undefined;
  db.prepare('UPDATE users SET last_active_at=? WHERE id=?').run(new Date().toISOString(), row.id);
  return toUser(row);
}

/** First start: create the admin from ADMIN_EMAIL / ADMIN_PASSWORD when no user exists yet. */
export function bootstrapAdmin(env = process.env): AuthUser | null {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (count > 0 || !env.ADMIN_EMAIL?.trim() || !env.ADMIN_PASSWORD) return null;
  return createUser({ email: env.ADMIN_EMAIL, name: env.ADMIN_NAME?.trim() || 'Admin', role: 'admin', departmentId: 'marketing', password: env.ADMIN_PASSWORD });
}

export const userCan = (user: AuthUser, permission: Permission) => can(user.role, permission);

export function readCookie(req: express.Request, name: string): string {
  return (req.header('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}
export function sessionUser(req: express.Request): AuthUser | undefined {
  const token = readCookie(req, SESSION_COOKIE);
  return token ? userForToken(decodeURIComponent(token)) : undefined;
}

declare module 'express-serve-static-core' { interface Request { user?: AuthUser } }

/** Attach the signed-in user; reject when there is none. */
export const requireUser: express.RequestHandler = (req, res, next) => {
  const user = sessionUser(req);
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
