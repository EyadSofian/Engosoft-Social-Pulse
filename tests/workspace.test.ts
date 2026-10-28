import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// A throwaway database; store.ts reads DATA_FILE when first imported.
process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'sp-test-')), 'test.sqlite');
const auth = await import('../server/auth');
const ws = await import('../server/workspace');
const store = await import('../server/store');
await (await import('../server/db')).initDb();

const ops = await auth.createUser({ email: 'ops@engosoft.test', name: 'Ops Lead', role: 'creator', departmentId: 'operations', password: 'ops-password-1' });
const other = await auth.createUser({ email: 'hr@engosoft.test', name: 'HR', role: 'creator', departmentId: 'hr', password: 'hr-password-12' });
const marketing = await auth.createUser({ email: 'mm@engosoft.test', name: 'Marketing', role: 'marketing_manager', departmentId: 'marketing', password: 'mm-password-12' });
const creative = { requestId: '00000000-0000-0000-0000-000000000000', directionId: 'd1', imageUrl: '/api/creatives/00000000-0000-0000-0000-000000000000/d1.png' };

test('passwords are hashed, verified, and sessions resolve to the user', async () => {
  const hash = auth.hashPassword('a-long-password');
  assert.ok(hash.startsWith('scrypt$') && !hash.includes('a-long-password'));
  assert.equal(auth.verifyPassword('a-long-password', hash), true);
  assert.equal(auth.verifyPassword('wrong-password', hash), false);
  assert.equal((await auth.authenticate('OPS@engosoft.test', 'ops-password-1'))?.id, ops.id);
  assert.equal(await auth.authenticate('ops@engosoft.test', 'nope'), undefined);
  assert.equal(await auth.authenticate('nobody@engosoft.test', 'whatever-123'), undefined);
  const session = await auth.createSession(ops.id);
  assert.equal((await auth.userForToken(session.token))?.id, ops.id);
  await auth.endSession(session.token);
  assert.equal(await auth.userForToken(session.token), undefined);
  await assert.rejects(() => auth.createUser({ email: 'x@y.test', name: 'X', role: 'creator', departmentId: 'hr', password: 'short' }));
});

test('suspending a user ends their sessions', async () => {
  const session = await auth.createSession(other.id);
  await auth.updateUser(other.id, { status: 'suspended' });
  assert.equal(await auth.userForToken(session.token), undefined);
  await auth.updateUser(other.id, { status: 'active' });
});

test('operations work reaches marketing: draft → review → approve → schedule, with visibility by department', async () => {
  const item = await ws.createContent(ops, { title: 'CFM launch', channels: ['facebook', 'instagram', 'whatsapp'], captions: { facebook: 'cap' }, creative });
  assert.equal(item.status, 'draft');
  assert.equal(item.departmentId, 'operations');
  assert.equal((await ws.listVersions(item.id)).length, 1);
  assert.ok((await ws.listContent(marketing)).some((c) => c.id === item.id), 'marketing sees every department');
  assert.ok(!(await ws.listContent(other)).some((c) => c.id === item.id), 'HR does not see operations drafts');

  await assert.rejects(() => ws.transition(ops, item.id, 'approved', {}), /متاحة/);
  await ws.transition(ops, item.id, 'ready_for_review', {});
  await assert.rejects(() => ws.transition(marketing, item.id, 'changes_requested', {}), /سبب/);
  await ws.transition(marketing, item.id, 'changes_requested', { note: 'Shorter headline' });
  await ws.transition(ops, item.id, 'ready_for_review', {});
  await ws.transition(marketing, item.id, 'approved', {});
  await assert.rejects(() => ws.transition(marketing, item.id, 'scheduled', { scheduledAt: '2020-01-01T00:00:00Z' }), /المستقبل/);
  const when = new Date(Date.now() + 86_400_000).toISOString();
  const scheduled = await ws.transition(marketing, item.id, 'scheduled', { scheduledAt: when });
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.planIds.length, 2, 'facebook + instagram get calendar plans; whatsapp is not trackable');
  const plans = await Promise.all(scheduled.planIds.map(async (id) => (await store.getPlan(id))!));
  assert.deepEqual(plans.map((p) => p.platform).sort(), ['facebook', 'instagram']);
  assert.ok(plans.every((p) => p.scheduledAt === when && p.notes === `content:${item.id}`));
  const kinds = (await ws.listEvents(item.id)).map((e) => `${e.kind}:${e.to ?? ''}`);
  assert.deepEqual(kinds, ['created:', 'version:', 'transition:ready_for_review', 'transition:changes_requested', 'transition:ready_for_review', 'transition:approved', 'transition:scheduled']);
});

test('content cannot go to review without a design, and publish is never a manual move', async () => {
  const item = await ws.createContent(ops, { title: 'No design yet', channels: ['facebook'], captions: {}, creative: null });
  await assert.rejects(() => ws.transition(ops, item.id, 'ready_for_review', {}), /التصميم/);
  assert.ok(ws.allowedMoves(marketing, item).every((m) => m.to !== 'published'));
});

test('a scheduled item becomes published when sync matches its plan to a real post', async () => {
  const item = await ws.createContent(ops, { title: 'Proof', channels: ['facebook'], captions: {}, creative });
  await ws.transition(ops, item.id, 'ready_for_review', {});
  await ws.transition(marketing, item.id, 'approved', {});
  const scheduled = await ws.transition(marketing, item.id, 'scheduled', { scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
  const plan = (await store.getPlan(scheduled.planIds[0]))!;
  await store.savePlan({ ...plan, externalId: 'fb_123' });
  await store.db.run('INSERT INTO observed_posts (platform,account_id,account_name,external_id,permalink,title,published_at,content_type,thumbnail,metrics_json,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ['facebook', '', 'Engosoft', 'fb_123', 'https://facebook.com/p/1', 'Proof', new Date().toISOString(), 'post', '', JSON.stringify({ views: 900, reach: 700, impressions: null, likes: 40, comments: 3, shares: 2, saves: null, clicks: null, engagement: null }), new Date().toISOString()]);
  const proven = (await ws.getContent(item.id))!;
  assert.equal(proven.status, 'published');
  assert.equal(proven.published?.[0].metrics.views, 900);
});

test('withdrawing a scheduled post cancels its old plans before a new approval round', async () => {
  const item = await ws.createContent(ops, { title: 'Withdraw schedule', channels: ['facebook'], captions: {}, creative });
  await ws.transition(ops, item.id, 'ready_for_review', {});
  await ws.transition(marketing, item.id, 'approved', {});
  const scheduled = await ws.transition(marketing, item.id, 'scheduled', { scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
  const withdrawn = await ws.transition(marketing, item.id, 'approved', {});
  assert.equal(withdrawn.scheduledAt, null);
  assert.deepEqual(withdrawn.planIds, []);
  assert.equal((await store.getPlan(scheduled.planIds[0]))?.status, 'cancelled');
  await assert.rejects(() => ws.updateContent(ops, item.id, { title: 'Unreviewed change' }), /المعتمد/);
  await ws.transition(marketing, item.id, 'changes_requested', { note: 'Revise first' });
  assert.equal((await ws.updateContent(ops, item.id, { title: 'Revised copy' })).title, 'Revised copy');
});
