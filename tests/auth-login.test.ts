import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import express from 'express';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'engosoft-login-')), 'test.sqlite');
process.env.DATABASE_URL = '';
const auth = await import('../server/auth');
const { db, initDb } = await import('../server/db');
const { registerAuthRoutes, registerWorkspaceRoutes } = await import('../server/workspace-routes');
await initDb();
const admin = await auth.createUser({ email: 'boss@test.local', name: 'Boss', role: 'admin', departmentId: 'marketing', password: 'BossPass12345' });
const adminToken = (await auth.createSession(admin.id)).token;

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
registerAuthRoutes(app);
registerWorkspaceRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
after(() => { server.close(); });

const call = async (path: string, body?: unknown, init: { method?: string; cookie?: string; ip?: string } = {}) => {
  const res = await fetch(base + path, {
    method: init.method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', cookie: init.cookie ?? '', 'x-forwarded-for': init.ip ?? '10.0.0.1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], body: await res.json().catch(() => ({})) as Record<string, any> };
};
const asAdmin = { cookie: `${auth.SESSION_COOKIE}=${adminToken}` };
const login = (email: string, password: string, ip?: string) => call('/api/auth/login', { email, password }, { ip });

test('a person the admin creates can sign in and load their session', async () => {
  const created = await call('/api/users', { name: 'Mona', email: '  Mona@Test.Local ', role: 'creator', departmentId: 'operations', password: 'Welcome2026x' }, asAdmin);
  assert.equal(created.status, 201);
  assert.equal(created.body.email, 'mona@test.local');
  const signedIn = await login('mona@test.local', 'Welcome2026x');
  assert.equal(signedIn.status, 200);
  const me = await call('/api/auth/me', undefined, { cookie: signedIn.cookie });
  assert.equal(me.status, 200);
  assert.ok(me.body.permissions.includes('content.create'));
});

test('sign-in tolerates how phones type emails and passwords', async () => {
  assert.equal((await login('Mona@Test.Local ', 'Welcome2026x')).status, 200, 'trailing space and capitals in the email');
  assert.equal((await login('mona@test.local', ' Welcome2026x ')).status, 200, 'spaces around the password');
  await call('/api/users', { name: 'Digits', email: 'digits@test.local', role: 'creator', departmentId: null, password: 'Engosoft2026' }, asAdmin);
  assert.equal((await login('digits@test.local', 'Engosoft٢٠٢٦')).status, 200, 'Arabic-Indic digits');
  assert.equal((await login('digits@test.local', 'Engosoft۲۰۲۶')).status, 200, 'Persian digits');
});

test('passwords stored before normalization still work', async () => {
  const id = (await auth.createUser({ email: 'legacy@test.local', name: 'Legacy', role: 'creator', departmentId: null, password: 'placeholder-123' })).id;
  // An old account whose password was hashed exactly as typed, with a space at the end.
  await db.run('UPDATE users SET password_hash=? WHERE id=?', [auth.hashPassword('OldPassword1 '), id]);
  assert.equal((await login('legacy@test.local', 'OldPassword1 ')).status, 200);
});

test('Arabic letters are refused in new passwords, with a clear reason', async () => {
  const created = await call('/api/users', { name: 'Arabic', email: 'arabic@test.local', role: 'creator', departmentId: null, password: 'كلمةسرطويلة123' }, asAdmin);
  assert.equal(created.status, 400);
  assert.match(created.body.error, /إنجليزية/);
});

test('a wrong password typed on an Arabic keyboard gets a hint', async () => {
  const failed = await login('mona@test.local', 'ضثمؤخةثرشسس', '10.0.0.9');
  assert.equal(failed.status, 401);
  assert.match(failed.body.error, /لوحة المفاتيح/);
});

test('an admin password reset lifts the lockout at once', async () => {
  const ip = '10.0.0.50';
  for (let i = 0; i < 5; i++) assert.equal((await login('mona@test.local', 'wrong-password', ip)).status, 401);
  assert.equal((await login('mona@test.local', 'Welcome2026x', ip)).status, 429, 'locked after five failures');
  const mona = (await auth.listUsers()).find((u) => u.email === 'mona@test.local')!;
  assert.equal((await call(`/api/users/${mona.id}`, { password: 'BrandNew2026' }, { ...asAdmin, method: 'PATCH' })).status, 200);
  assert.equal((await login('mona@test.local', 'BrandNew2026', ip)).status, 200);
});

test('a suspended person is told their account is suspended, only with the right password', async () => {
  const mona = (await auth.listUsers()).find((u) => u.email === 'mona@test.local')!;
  await call(`/api/users/${mona.id}`, { status: 'suspended' }, { ...asAdmin, method: 'PATCH' });
  const right = await login('mona@test.local', 'BrandNew2026', '10.0.0.60');
  assert.equal(right.status, 403);
  assert.match(right.body.error, /موقوف/);
  assert.equal((await login('mona@test.local', 'not-it-at-all', '10.0.0.60')).status, 401);
  await call(`/api/users/${mona.id}`, { status: 'active' }, { ...asAdmin, method: 'PATCH' });
  assert.equal((await login('mona@test.local', 'BrandNew2026', '10.0.0.60')).status, 200);
});
