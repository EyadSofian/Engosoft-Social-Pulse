import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { createSeed } from '../src/services/demo/seed.js';
import { addComment, createContent, mentionsIn, transitionContent } from '../src/features/workspace/actions.js';
import { allowedTransitions, canSeeContent } from '../src/features/workspace/permissions.js';
import { allPlanProgress, companyCompletion, isOverdue, reviewQueue, scheduledThisWeek, visibleContent } from '../src/features/workspace/selectors.js';
import type { WorkspaceState } from '../src/features/workspace/state.js';

const zone = 'Africa/Cairo';
const monday = DateTime.fromISO('2026-10-26T09:00', { zone }).toMillis();
const nowIso = new Date(monday).toISOString();
const user = (state: WorkspaceState, id: string) => state.users.find((entry) => entry.id === id)!;
const item = (state: WorkspaceState, id: string) => state.content.find((entry) => entry.id === id)!;

test('seeded marketing home matches the agreed sample numbers', () => {
  const state = createSeed(monday);
  const mariam = user(state, 'u-mariam');
  const mine = visibleContent(state, mariam);
  assert.equal(reviewQueue(state).length, 12);
  assert.equal(scheduledThisWeek(mine, monday).length, 7);
  assert.equal(mine.filter((entry) => isOverdue(entry, monday)).length, 3);
  const progress = allPlanProgress(state, monday);
  assert.deepEqual(
    progress.map((row) => `${row.departmentId} ${row.published}/${row.target}`),
    ['marketing 10/12', 'operations 7/8', 'education 4/4', 'hr 1/2', 'corporate 2/2'],
  );
  assert.equal(Math.round(companyCompletion(progress).completion ?? -1), 86);
});

test('monthly plan progress still counts this month on the 1st', () => {
  const first = DateTime.fromISO('2026-11-01T09:00', { zone }).toMillis();
  const progress = allPlanProgress(createSeed(first), first);
  assert.equal(companyCompletion(progress).published, 24);
});

test('seeded published records never sit in the future', () => {
  for (const day of ['2026-11-01T00:30', '2026-11-15T08:00', '2026-10-31T23:30']) {
    const now = DateTime.fromISO(day, { zone }).toMillis();
    const state = createSeed(now);
    for (const entry of state.content.filter((record) => record.status === 'published'))
      assert.ok(Date.parse(entry.publishAt!) <= now, `${entry.id} published at ${entry.publishAt} after ${day}`);
  }
});

test('only Marketing can approve; the department that wrote the item cannot', () => {
  const state = createSeed(monday);
  const content = item(state, 'ci-cfm-starts');
  assert.equal(content.status, 'ready_for_review');
  const ahmed = user(state, 'u-ahmed');
  const mariam = user(state, 'u-mariam');
  assert.ok(!allowedTransitions(ahmed, content).some((move) => move.to === 'approved'));
  assert.deepEqual(transitionContent(state, ahmed, content.id, { to: 'approved' }, nowIso), { ok: false, error: 'permission' });
  const approved = transitionContent(state, mariam, content.id, { to: 'approved' }, nowIso);
  assert.ok(approved.ok);
  assert.equal(item(approved.state, content.id).status, 'approved');
  const decision = approved.state.approvals.filter((entry) => entry.contentId === content.id).at(-1)!;
  assert.equal(decision.status, 'approved');
  assert.equal(decision.decidedById, 'u-mariam');
  assert.ok(approved.state.notifications.some((entry) => entry.userId === 'u-ahmed' && entry.category === 'approved'));
});

test('requesting changes needs a note and opens a revision task for the designer', () => {
  const state = createSeed(monday);
  const mariam = user(state, 'u-mariam');
  assert.deepEqual(transitionContent(state, mariam, 'ci-cfm-starts', { to: 'changes_requested' }, nowIso), { ok: false, error: 'note_required' });
  const result = transitionContent(state, mariam, 'ci-cfm-starts', { to: 'changes_requested', note: 'Use the new brand frame.', revisionAssigneeId: 'u-youssef' }, nowIso);
  assert.ok(result.ok);
  const revision = result.state.tasks.find((task) => task.link?.kind === 'content' && task.link.id === 'ci-cfm-starts' && task.kind === 'revision');
  assert.ok(revision, 'a revision task is created');
  assert.equal(revision.assigneeId, 'u-youssef');
  assert.equal(item(result.state, 'ci-cfm-starts').assigneeId, 'u-youssef');
  assert.ok(result.state.activity.some((entry) => entry.entity.id === 'ci-cfm-starts' && entry.action === 'changes_requested'));
});

test('resubmitting after changes opens a new review round', () => {
  let state = createSeed(monday);
  const mariam = user(state, 'u-mariam');
  const ahmed = user(state, 'u-ahmed');
  const asked = transitionContent(state, mariam, 'ci-cfm-starts', { to: 'changes_requested', note: 'Fix the date.' }, nowIso);
  assert.ok(asked.ok);
  state = asked.state;
  const again = transitionContent(state, ahmed, 'ci-cfm-starts', { to: 'ready_for_review' }, nowIso);
  assert.ok(again.ok);
  const rounds = again.state.approvals.filter((entry) => entry.contentId === 'ci-cfm-starts');
  assert.equal(rounds.at(-1)!.status, 'pending');
  assert.equal(rounds.at(-1)!.round, rounds.length);
});

test('scheduling requires a time; publishing requires the post link', () => {
  const state = createSeed(monday);
  const mariam = user(state, 'u-mariam');
  const approved = transitionContent(state, mariam, 'ci-cfm-starts', { to: 'approved' }, nowIso);
  assert.ok(approved.ok);
  assert.deepEqual(transitionContent(approved.state, mariam, 'ci-cfm-starts', { to: 'scheduled' }, nowIso), { ok: false, error: 'time_required' });
  const publishAt = DateTime.fromMillis(monday).plus({ days: 1 }).toUTC().toISO()!;
  const scheduled = transitionContent(approved.state, mariam, 'ci-cfm-starts', { to: 'scheduled', publishAt }, nowIso);
  assert.ok(scheduled.ok);
  assert.equal(item(scheduled.state, 'ci-cfm-starts').publishAt, publishAt);
  assert.deepEqual(transitionContent(scheduled.state, mariam, 'ci-cfm-starts', { to: 'published' }, nowIso), { ok: false, error: 'proof_required' });
});

test('records from the live calendar cannot be moved through the demo workflow', () => {
  const state = createSeed(monday);
  const live = { ...item(state, 'ci-cfm-starts'), id: 'live-1', provenance: 'live' as const };
  const withLive = { ...state, content: [...state.content, live] };
  assert.deepEqual(allowedTransitions(user(state, 'u-mariam'), live), []);
  assert.deepEqual(transitionContent(withLive, user(state, 'u-mariam'), 'live-1', { to: 'approved' }, nowIso), { ok: false, error: 'live' });
});

test('content creators see their own and their department’s work, not other departments’', () => {
  const state = createSeed(monday);
  const nour = user(state, 'u-nour');
  const operations = state.content.find((entry) => entry.departmentId === 'operations')!;
  const hr = state.content.find((entry) => entry.departmentId === 'hr' && entry.ownerId !== nour.id && entry.assigneeId !== nour.id)!;
  assert.equal(canSeeContent(nour, operations, new Set()), true);
  assert.equal(canSeeContent(nour, hr, new Set()), false);
});

test('creating content checks permission and title; mentions resolve to people', () => {
  const state = createSeed(monday);
  const ahmed = user(state, 'u-ahmed');
  const base = { type: 'post' as const, departmentId: 'operations' as const, channels: ['facebook' as const], templateId: null, courseId: null, dueAt: null, caption: '', status: 'draft' as const, assigneeId: null, priority: 'normal' as const };
  assert.deepEqual(createContent(state, ahmed, { ...base, title: '  ' }, nowIso), { ok: false, error: 'title_required' });
  const created = createContent(state, ahmed, { ...base, title: 'Primavera P6 starts next week' }, nowIso);
  assert.ok(created.ok);
  assert.equal(item(created.state, created.id!).ownerId, 'u-ahmed');

  assert.deepEqual(mentionsIn('@Mariam please check, cc @Youssef', state.users).sort(), ['u-mariam', 'u-youssef']);
  const commented = addComment(state, ahmed, { kind: 'content', id: 'ci-cfm-starts' }, 'Updated the link @Mariam', nowIso);
  assert.ok(commented.ok);
  assert.ok(commented.state.notifications.some((entry) => entry.userId === 'u-mariam' && entry.category === 'mention'));
});
