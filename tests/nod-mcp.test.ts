import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import express from 'express';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'engosoft-mcp-')), 'test.sqlite');
process.env.DATABASE_URL = '';
const auth = await import('../server/auth');
const { initDb } = await import('../server/db');
const { registerAuthRoutes, registerWorkspaceRoutes } = await import('../server/workspace-routes');
const { registerNodMcpRoute } = await import('../server/nod-mcp');
await initDb();
await auth.createUser({ email: 'nod@test.local', name: 'Nod', role: 'admin', departmentId: 'marketing', password: 'NodPass123456' });

const TOKEN = 'pulse-mcp-test-token-0123456789';
process.env.NOD_MCP_TOKEN = TOKEN;
process.env.NOD_MCP_USER_EMAIL = 'nod@test.local';

// The same order as server/index.ts: MCP before the sign-in gate, then the gate, then the routes.
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
registerNodMcpRoute(app);
registerAuthRoutes(app);
app.use('/api', auth.requireUser);
registerWorkspaceRoutes(app);
const rows = Array.from({ length: 300 }, (_, i) => ({ id: i, title: `post ${i}` }));
app.get('/api/dashboard', (req, res) => { res.json({ who: req.user?.email, posts: rows }); });
app.get('/api/social/accounts/:id/analytics', (req, res) => { res.json({ account: req.params.id }); });
app.get('/api/creatives/:requestId/:file', (_req, res) => { res.type('png').send(Buffer.from([1, 2, 3])); });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const port = (server.address() as { port: number }).port;
process.env.PORT = String(port);
const base = `http://127.0.0.1:${port}`;
after(() => { server.close(); });

async function rpc(method: string, params: Record<string, unknown> = {}, token = TOKEN) {
  const res = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const { body } = await rpc('tools/call', { name, arguments: args });
  const text: string = body.result?.content?.[0]?.text ?? '';
  let json: Record<string, any> | null = null;
  try { json = JSON.parse(text); } catch { /* tool error text */ }
  return { result: body.result, text, json };
}

test('the token is required', async () => {
  assert.equal((await rpc('tools/list', {}, 'wrong')).status, 401);
});

test('lists the full-read tools beside the existing ones', async () => {
  const { body } = await rpc('tools/list');
  const names = body.result.tools.map((tool: { name: string }) => tool.name);
  for (const name of ['pulse_overview', 'pulse_list_endpoints', 'pulse_get', 'pulse_create_draft']) assert.ok(names.includes(name), name);
});

test('catalogues the live routes and leaves files and sign-in out', async () => {
  const { json } = await call('pulse_list_endpoints');
  const all = Object.values(json!.tabs as Record<string, { endpoints: string[] }>).flatMap((tab) => tab.endpoints);
  assert.ok(all.includes('/api/dashboard'));
  assert.ok(all.includes('/api/social/accounts/:id/analytics'));
  assert.ok(!all.some((path) => path.startsWith('/api/creatives/') || path.startsWith('/api/auth') || path === '/api/mcp'));
});

test('reads a tab as the MCP account and pages it without dropping rows', async () => {
  const first = await call('pulse_get', { endpoint: '/api/dashboard', path: 'posts', limit: 250 });
  assert.equal(first.json!.httpStatus, 200);
  assert.equal(first.json!.total, 300);
  const second = await call('pulse_get', { endpoint: '/api/dashboard', path: 'posts', offset: first.json!.nextOffset, limit: 250 });
  assert.equal(first.json!.returned + second.json!.returned, 300);
  assert.equal(second.json!.nextOffset, undefined);
  const who = await call('pulse_get', { endpoint: '/api/dashboard', path: 'who' });
  assert.equal(who.json!.data, 'nod@test.local');
});

test('fills route parameters with real ids', async () => {
  const { json } = await call('pulse_get', { endpoint: '/api/social/accounts/abc-1/analytics' });
  assert.deepEqual(json!.data, { account: 'abc-1' });
});

test('refuses files, sign-in, other hosts and traversal', async () => {
  for (const endpoint of ['/api/creatives/r1/a.png', '/api/auth/me', '/api/mcp', 'https://evil.example/api/dashboard', '/api/../api/users', '/api/social/accounts/:id/analytics']) {
    const { result } = await call('pulse_get', { endpoint });
    assert.equal(result.isError, true, endpoint);
  }
});

test('an outside request cannot pose as the internal caller', async () => {
  const res = await fetch(`${base}/api/dashboard`, { headers: { 'x-engosoft-internal-key': 'guess', 'x-engosoft-internal-user': 'x' } });
  assert.equal(res.status, 401);
});
