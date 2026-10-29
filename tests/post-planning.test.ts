import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
const directory = mkdtempSync(join(tmpdir(), 'post-planning-'));
process.env.DATA_FILE = join(directory, 'test.sqlite');
process.env.MEDIA_DIR = directory;
const auth = await import('../server/auth');
const ws = await import('../server/workspace');
const store = await import('../server/store');
const { parseCalendar } = await import('../server/calendar');
const { registerWorkspaceRoutes } = await import('../server/workspace-routes');
const { goalFromText, goalResult } = await import('../src/domain/goals');
const { db, initDb } = await import('../server/db');
await initDb();

const planner = await auth.createUser({ email: 'planner@engosoft.test', name: 'Planner', role: 'supervisor', departmentId: 'marketing', password: 'planner-password-1' });
const creator = await auth.createUser({ email: 'maker@engosoft.test', name: 'Maker', role: 'creator', departmentId: 'operations', password: 'maker-password-12' });
const manager = await auth.createUser({ email: 'boss@engosoft.test', name: 'Boss', role: 'marketing_manager', departmentId: 'marketing', password: 'boss-password-123' });
const creative = { requestId: 'r', directionId: 'd', imageUrl: '/api/creatives/00000000-0000-4000-a000-000000000001/feed.png' };
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

let acting = creator;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = acting; next(); });
registerWorkspaceRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const post = (body: unknown) => fetch(`${base}/api/content`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await db.close(); rmSync(directory, { recursive: true, force: true }); });

test('goal words from spreadsheets map to the four goals', () => {
  assert.equal(goalFromText('وصول'), 'reach');
  assert.equal(goalFromText('Engagement'), 'engagement');
  assert.equal(goalFromText('تسجيلات'), 'leads');
  assert.equal(goalFromText('زيارات للموقع'), 'traffic');
  assert.equal(goalFromText(''), null);
  assert.equal(goalResult('reach', { reach: null, views: 900 }), 900);
  assert.equal(goalResult('engagement', { likes: 5, comments: 2 }), 7);
  assert.equal(goalResult('leads', {}), null, 'a missing number stays missing, never zero');
});

test('an imported plan row is a planned slot with its goal, not a scheduled post', async () => {
  const csv = 'التاريخ,الوقت,المنصة,العنوان,الهدف\n2030-01-05,10:00,facebook,دورة CFM,تفاعل\n';
  const { plans, errors } = await parseCalendar(Buffer.from(csv), 'plan.csv');
  assert.deepEqual(errors, []);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].status, 'draft');
  assert.equal(plans[0].goal, 'engagement');
});

test('plan rows accept Arabic platform names, LinkedIn and X, and a bad row names the cell to fix', async () => {
  const csv = 'التاريخ,الوقت,المنصة,العنوان\n2030-01-05,10:00,"فيسبوك، انستجرام",عرض\n2030-01-06,10:00,"linkedin, تويتر",مقال\n2030-01-07,10:00,pinterest,بنترست\n05-01-2030,10:00,facebook,تاريخ غلط\n';
  const { plans, errors } = await parseCalendar(Buffer.from(csv), 'plan.csv');
  assert.deepEqual(plans.map((plan) => plan.platform), ['facebook', 'instagram', 'linkedin', 'x']);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /صف 4: المنصة «pinterest» غير معروفة/);
  assert.match(errors[1], /صف 5: التاريخ «05-01-2030»/);
});

test('the downloadable plan templates import cleanly', async () => {
  const { readFileSync } = await import('node:fs');
  for (const name of ['mobde3-plan-template.xlsx', 'mobde3-plan-template.csv']) {
    const { plans, errors } = await parseCalendar(readFileSync(new URL(`../public/templates/${name}`, import.meta.url)), name);
    assert.deepEqual(errors, [], name);
    assert.equal(plans.length, 14, name);
    assert.ok(plans.every((plan) => plan.status === 'draft' && plan.goal), name);
  }
});

test('a post made for a plan row inherits its day and goal, and the row is then taken', async () => {
  const slot = await store.savePlan((await import('../server/domain')).newPlan({ platform: 'instagram', title: 'جدول الأسبوع', scheduledAt: future(3), status: 'draft', goal: 'reach' }));
  const item = await ws.createContent(creator, { title: 'جدول الأسبوع', channels: ['instagram'], captions: {}, creative, slotId: slot.id });
  assert.equal(item.goal, 'reach');
  assert.equal(item.plannedFor, slot.scheduledAt);
  assert.equal(item.slotId, slot.id);
  assert.equal((await store.getPlan(slot.id))?.notes, `content:${item.id}`);
  await assert.rejects(() => ws.createContent(creator, { title: 'Second', channels: ['instagram'], captions: {}, creative, slotId: slot.id }), /منشور بالفعل/);

  // A planner can move the planned day and change the goal while the post is not scheduled yet.
  const moved = await ws.updateContent(planner, item.id, { goal: 'engagement', plannedFor: future(4) });
  assert.equal(moved.goal, 'engagement');

  // Scheduling replaces the plan row with the post's own calendar rows.
  await ws.transition(creator, item.id, 'ready_for_review', {});
  await ws.transition(manager, item.id, 'approved', {});
  await ws.transition(planner, item.id, 'scheduled', { scheduledAt: future(4) });
  assert.equal((await store.getPlan(slot.id))?.status, 'cancelled');
  const scheduled = (await ws.getContent(item.id))!;
  assert.equal((await store.getPlan(scheduled.planIds[0]))?.goal, 'engagement');
  await assert.rejects(() => ws.updateContent(planner, item.id, { plannedFor: future(6) }), /مجدول/);
});

test('a plan line for several platforms is one planned post: making it takes every platform row', async () => {
  const { newPlan } = await import('../server/domain');
  const at = future(8);
  const facebook = await store.savePlan(newPlan({ platform: 'facebook', title: 'Revit', scheduledAt: at, status: 'draft', goal: 'leads' }));
  const instagram = await store.savePlan(newPlan({ platform: 'instagram', title: 'Revit', scheduledAt: at, status: 'draft', goal: 'leads' }));
  const other = await store.savePlan(newPlan({ platform: 'tiktok', title: 'Revit', scheduledAt: at, status: 'draft', goal: 'leads' }));
  const item = await ws.createContent(creator, { title: 'Revit', channels: ['facebook', 'instagram'], captions: {}, creative, slotId: facebook.id });
  assert.equal((await store.getPlan(instagram.id))?.notes, `content:${item.id}`);
  assert.equal((await store.getPlan(other.id))?.notes, '', 'a platform the post does not cover stays planned');
  await ws.transition(creator, item.id, 'ready_for_review', {});
  await ws.transition(manager, item.id, 'approved', {});
  await ws.transition(planner, item.id, 'scheduled', { scheduledAt: at });
  assert.equal((await store.getPlan(facebook.id))?.status, 'cancelled');
  assert.equal((await store.getPlan(instagram.id))?.status, 'cancelled');
  const scheduled = (await ws.getContent(item.id))!;
  assert.equal(scheduled.planIds.length, 2);
  for (const id of scheduled.planIds) assert.equal((await store.getPlan(id))?.status, 'scheduled', 'the post’s own rows stay scheduled');
});

test('editing a scheduled post sends it back for changes, off the calendar and the queue, on its planned day', async () => {
  const item = await ws.createContent(creator, { title: 'Fix a typo', channels: ['facebook'], captions: {}, creative });
  await ws.transition(creator, item.id, 'ready_for_review', {});
  await ws.transition(manager, item.id, 'approved', {});
  const at = future(5);
  const scheduled = await ws.transition(planner, item.id, 'scheduled', { scheduledAt: at });
  await assert.rejects(() => ws.reopenContent(creator, item.id, ' '), /سبب/);
  const reopened = await ws.reopenContent(creator, item.id, 'Wrong course date');
  assert.equal(reopened.status, 'changes_requested');
  assert.equal(reopened.scheduledAt, null);
  assert.equal(reopened.plannedFor, at, 'it stays on its day as a planned post');
  for (const id of scheduled.planIds) assert.equal((await store.getPlan(id))?.status, 'cancelled');
  assert.equal((await ws.updateContent(creator, item.id, { title: 'Fixed typo' })).title, 'Fixed typo');
  await assert.rejects(() => ws.reopenContent(creator, item.id, 'again'), /مفتوح/);
});

test('each way of designing is its own permission', async () => {
  acting = (await auth.getUser(creator.id))!;
  const upload = { title: 'Uploaded', channels: ['facebook'], creative: { requestId: 'upload', directionId: 'upload', imageUrl: '/api/uploads/00000000-0000-4000-a000-000000000000.png' } };
  const first = await post(upload);
  assert.equal(first.status, 201, JSON.stringify(await first.clone().json()));
  await db.run('UPDATE users SET permission_overrides=? WHERE id=?', [JSON.stringify({ 'design.upload': false }), creator.id]);
  acting = (await auth.getUser(creator.id))!;
  const refused = await post(upload);
  assert.equal(refused.status, 403);
  assert.match((await refused.json()).error, /رفع/);
  assert.equal((await post({ ...upload, title: 'AI', creative })).status, 201, 'AI design stays allowed');
  await db.run('UPDATE users SET permission_overrides=? WHERE id=?', [JSON.stringify({ 'design.free': false }), creator.id]);
  acting = (await auth.getUser(creator.id))!;
  assert.equal((await post({ ...upload, title: 'AI', creative })).status, 403);
  assert.equal((await post({ ...upload, title: 'With goal', goal: 'leads', plannedFor: future(2) })).status, 201);
  assert.equal((await post({ ...upload, title: 'Bad goal', goal: 'fame' })).status, 400);
});
