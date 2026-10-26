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

const ops = auth.createUser({ email: 'ops@engosoft.test', name: 'Ops Lead', role: 'department_manager', departmentId: 'operations', password: 'ops-password-1' });
const other = auth.createUser({ email: 'hr@engosoft.test', name: 'HR', role: 'employee', departmentId: 'hr', password: 'hr-password-12' });
const marketing = auth.createUser({ email: 'mm@engosoft.test', name: 'Marketing', role: 'marketing_manager', departmentId: 'marketing', password: 'mm-password-12' });
const creative = { requestId: '00000000-0000-0000-0000-000000000000', directionId: 'd1', imageUrl: '/api/creatives/00000000-0000-0000-0000-000000000000/d1.png' };

test('passwords are hashed, verified, and sessions resolve to the user', () => {
  const hash = auth.hashPassword('a-long-password');
  assert.ok(hash.startsWith('scrypt$') && !hash.includes('a-long-password'));
  assert.equal(auth.verifyPassword('a-long-password', hash), true);
  assert.equal(auth.verifyPassword('wrong-password', hash), false);
  assert.equal(auth.authenticate('OPS@engosoft.test', 'ops-password-1')?.id, ops.id);
  assert.equal(auth.authenticate('ops@engosoft.test', 'nope'), undefined);
  assert.equal(auth.authenticate('nobody@engosoft.test', 'whatever-123'), undefined);
  const session = auth.createSession(ops.id);
  assert.equal(auth.userForToken(session.token)?.id, ops.id);
  auth.endSession(session.token);
  assert.equal(auth.userForToken(session.token), undefined);
  assert.throws(() => auth.createUser({ email: 'x@y.test', name: 'X', role: 'employee', departmentId: 'hr', password: 'short' }));
});

test('suspending a user ends their sessions', () => {
  const session = auth.createSession(other.id);
  auth.updateUser(other.id, { status: 'suspended' });
  assert.equal(auth.userForToken(session.token), undefined);
  auth.updateUser(other.id, { status: 'active' });
});

test('operations work reaches marketing: draft → review → approve → schedule, with visibility by department', () => {
  const item = ws.createContent(ops, { title: 'CFM launch', channels: ['facebook', 'instagram', 'whatsapp'], captions: { facebook: 'cap' }, creative });
  assert.equal(item.status, 'draft');
  assert.equal(item.departmentId, 'operations');
  assert.equal(ws.listVersions(item.id).length, 1);
  assert.ok(ws.listContent(marketing).some((c) => c.id === item.id), 'marketing sees every department');
  assert.ok(!ws.listContent(other).some((c) => c.id === item.id), 'HR does not see operations drafts');

  assert.throws(() => ws.transition(ops, item.id, 'approved', {}), /متاحة/);
  ws.transition(ops, item.id, 'ready_for_review', {});
  assert.throws(() => ws.transition(marketing, item.id, 'changes_requested', {}), /سبب/);
  ws.transition(marketing, item.id, 'changes_requested', { note: 'Shorter headline' });
  ws.transition(ops, item.id, 'ready_for_review', {});
  ws.transition(marketing, item.id, 'approved', {});
  assert.throws(() => ws.transition(marketing, item.id, 'scheduled', { scheduledAt: '2020-01-01T00:00:00Z' }), /المستقبل/);
  const when = new Date(Date.now() + 86_400_000).toISOString();
  const scheduled = ws.transition(marketing, item.id, 'scheduled', { scheduledAt: when });
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.planIds.length, 2, 'facebook + instagram get calendar plans; whatsapp is not trackable');
  const plans = scheduled.planIds.map((id) => store.getPlan(id)!);
  assert.deepEqual(plans.map((p) => p.platform).sort(), ['facebook', 'instagram']);
  assert.ok(plans.every((p) => p.scheduledAt === when && p.notes === `content:${item.id}`));
  const kinds = ws.listEvents(item.id).map((e) => `${e.kind}:${e.to ?? ''}`);
  assert.deepEqual(kinds, ['created:', 'version:', 'transition:ready_for_review', 'transition:changes_requested', 'transition:ready_for_review', 'transition:approved', 'transition:scheduled']);
});

test('content cannot go to review without a design, and publish is never a manual move', () => {
  const item = ws.createContent(ops, { title: 'No design yet', channels: ['facebook'], captions: {}, creative: null });
  assert.throws(() => ws.transition(ops, item.id, 'ready_for_review', {}), /التصميم/);
  assert.ok(ws.allowedMoves(marketing, item).every((m) => m.to !== 'published'));
});

test('a scheduled item becomes published when sync matches its plan to a real post', () => {
  const item = ws.createContent(ops, { title: 'Proof', channels: ['facebook'], captions: {}, creative });
  ws.transition(ops, item.id, 'ready_for_review', {});
  ws.transition(marketing, item.id, 'approved', {});
  const scheduled = ws.transition(marketing, item.id, 'scheduled', { scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
  const plan = store.getPlan(scheduled.planIds[0])!;
  store.savePlan({ ...plan, externalId: 'fb_123' });
  store.db.prepare('INSERT INTO observed_posts (platform,account_id,account_name,external_id,permalink,title,published_at,content_type,thumbnail,metrics_json,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('facebook', '', 'Engosoft', 'fb_123', 'https://facebook.com/p/1', 'Proof', new Date().toISOString(), 'post', '', JSON.stringify({ views: 900, reach: 700, impressions: null, likes: 40, comments: 3, shares: 2, saves: null, clicks: null, engagement: null }), new Date().toISOString());
  const proven = ws.getContent(item.id)!;
  assert.equal(proven.status, 'published');
  assert.equal(proven.published?.[0].metrics.views, 900);
});
