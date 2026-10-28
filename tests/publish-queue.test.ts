import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
const directory = mkdtempSync(join(tmpdir(), 'publish-queue-'));
process.env.DATA_FILE = join(directory, 'test.sqlite');
process.env.MEDIA_DIR = directory;
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.APP_URL = 'http://127.0.0.1:4100';
const auth = await import('../server/auth');
const ws = await import('../server/workspace');
const store = await import('../server/social/store');
const accounts = await import('../server/social/accounts');
const queue = await import('../server/social/queue');
const { db, initDb } = await import('../server/db');
await initDb();

const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await db.close(); rmSync(directory, { recursive: true, force: true }); });

const admin = await auth.createUser({ name: 'Admin', email: 'queue-admin@example.test', password: 'test-password-123', role: 'admin', departmentId: 'marketing' });
const supervisor = await auth.createUser({ name: 'Supervisor', email: 'queue-supervisor@example.test', password: 'test-password-123', role: 'supervisor', departmentId: 'marketing' });
const creator = await auth.createUser({ name: 'Creator', email: 'queue-creator@example.test', password: 'test-password-123', role: 'creator', departmentId: 'operations' });
const page = await accounts.registerAccount('facebook', 'page-1', 'Engosoft', admin.id, 'fb-queue', ['pages_manage_posts']);
await store.saveSecret('fb-queue', { accessToken: 'page-token', expiresAt: Date.now() + 3600_000, scopes: ['pages_manage_posts'] });
const tiktok = await accounts.registerAccount('tiktok', 'tt-1', '@engosoft', admin.id, 'tt-queue', ['video.list']);

// The approved creative the platform receives.
mkdirSync(join(directory, 'creatives', 'req'), { recursive: true });
await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#0046ff' } }).png().toFile(join(directory, 'creatives', 'req', 'feed.png'));
const creative = { requestId: 'req', directionId: 'feed', imageUrl: '/api/creatives/req/feed.png' };

/** Records Graph writes; every read reports the post as published. */
function facebook() {
  const writes: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'POST') { writes.push(String(url)); return Response.json({ id: 'photo-1', post_id: 'page-1_post-1' }); }
    return Response.json({ id: 'page-1_post-1', is_published: true, permalink_url: 'https://facebook.com/page-1_post-1' });
  };
  return writes;
}

async function approved(title: string, channels: ('facebook' | 'tiktok' | 'whatsapp')[] = ['facebook']) {
  const item = await ws.createContent(creator, { title, channels, captions: { facebook: `${title} caption` }, creative });
  await ws.transition(creator, item.id, 'ready_for_review', {});
  await ws.transition(admin, item.id, 'approved', {});
  return item.id;
}
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

test('targets show which accounts can publish the post from the simple flow', async () => {
  const id = await approved('Targets', ['facebook', 'tiktok']);
  const targets = await queue.publishTargets((await ws.getContent(id))!);
  assert.deepEqual(targets.find((t) => t.accountId === page.id), { accountId: page.id, provider: 'facebook', name: 'Engosoft', ready: true, reason: null, kind: 'image' });
  assert.equal(targets.find((t) => t.accountId === tiktok.id)?.reason, 'advanced');
});

test('scheduling puts the post on the calendar and publishes it once when its time comes', async () => {
  const id = await approved('Scheduled post');
  const writes = facebook();
  const at = inMinutes(30);
  const rows = await queue.schedulePublication(supervisor, id, [page.id], at);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'queued');
  const item = (await ws.getContent(id))!;
  assert.equal(item.status, 'scheduled');
  assert.equal(item.scheduledAt, at);
  assert.equal(item.planIds.length, 1, 'the calendar plan exists for alerts and sync');

  assert.equal(await queue.runDuePublications(new Date()), 0, 'nothing goes out early');
  assert.equal(writes.length, 0);
  const due = new Date(Date.parse(at) + 30_000);
  assert.equal(await queue.runDuePublications(due), 1);
  assert.equal(await queue.runDuePublications(due), 0, 'a sent row is not sent again');
  assert.equal(writes.length, 1);
  assert.match(writes[0], /page-1\/photos/);
  const [row] = await store.contentQueue(id);
  assert.equal(row.state, 'sent');
  assert.ok(row.jobId);
  assert.equal((await ws.getContent(id))?.status, 'published');
});

test('creators cannot publish, and drafts cannot be scheduled', async () => {
  const id = await approved('Permissions');
  await assert.rejects(() => queue.schedulePublication(creator, id, [page.id], inMinutes(30)), /صلاحيت/);
  await assert.rejects(() => queue.publishNow(creator, id, [page.id]), /صلاحية/);
  const draft = await ws.createContent(creator, { title: 'Draft', channels: ['facebook'], captions: {}, creative });
  await assert.rejects(() => queue.schedulePublication(admin, draft.id, [page.id], inMinutes(30)), /المعتمدة/);
  await assert.rejects(() => queue.schedulePublication(admin, id, [tiktok.id], inMinutes(30)), /منصات هذا المنشور/);
  const both = await approved('Both platforms', ['facebook', 'tiktok']);
  await assert.rejects(() => queue.schedulePublication(admin, both, [tiktok.id], inMinutes(30)), /من هنا/, 'TikTok keeps its own options on the post page');
});

test('rescheduling moves the publication; taking the post off the calendar cancels it', async () => {
  const id = await approved('Moved post');
  const writes = facebook();
  await queue.schedulePublication(admin, id, [page.id], inMinutes(30));
  const later = inMinutes(120);
  await ws.transition(admin, id, 'scheduled', { scheduledAt: later });
  assert.equal((await store.contentQueue(id))[0].publishAt, later);
  await ws.transition(admin, id, 'approved', {});
  assert.equal((await store.contentQueue(id))[0].state, 'cancelled');
  assert.equal(await queue.runDuePublications(new Date(Date.parse(later) + 60_000)), 0);
  assert.equal(writes.length, 0);
});

test('a publication the server missed by hours waits for a person instead of going out late', async () => {
  const id = await approved('Missed post');
  const writes = facebook();
  const at = inMinutes(30);
  await queue.schedulePublication(admin, id, [page.id], at);
  await queue.runDuePublications(new Date(Date.parse(at) + 7 * 3600_000));
  const [row] = await store.contentQueue(id);
  assert.equal(row.state, 'failed');
  assert.match(row.error ?? '', /manually/);
  assert.equal(writes.length, 0);
});

test('a scheduler who lost publishing permission does not publish', async () => {
  const id = await approved('Revoked');
  const writes = facebook();
  const at = inMinutes(30);
  await queue.schedulePublication(supervisor, id, [page.id], at);
  await db.run('UPDATE users SET permission_overrides=? WHERE id=?', [JSON.stringify({ 'content.publish': false }), supervisor.id]);
  try {
    await queue.runDuePublications(new Date(Date.parse(at) + 30_000));
    assert.equal((await store.contentQueue(id))[0].state, 'failed');
    assert.equal(writes.length, 0);
  } finally {
    await db.run('UPDATE users SET permission_overrides=? WHERE id=?', ['{}', supervisor.id]);
  }
});

test('publishing now replaces a waiting publication to the same account', async () => {
  const id = await approved('Now');
  const writes = facebook();
  await queue.schedulePublication(admin, id, [page.id], inMinutes(30));
  const [result] = await queue.publishNow(admin, id, [page.id]);
  assert.equal(result.job?.state, 'published');
  assert.equal((await store.contentQueue(id))[0].state, 'cancelled');
  assert.equal(await queue.runDuePublications(new Date(Date.now() + 3600_000)), 0);
  assert.equal(writes.length, 1);
});

test('the publishing board lists accounts and only the posts the person can see', async () => {
  const board = await queue.publishingBoard(supervisor);
  assert.ok(board.accounts.some((a) => a.id === page.id && a.auto));
  assert.ok(board.accounts.some((a) => a.id === tiktok.id && !a.auto));
  assert.ok(board.queue.length > 0);
  assert.ok(board.jobs.every((job) => !('remoteId' in job)));
});
