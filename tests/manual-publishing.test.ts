import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'manual-publishing-'));
process.env.DATA_FILE = join(directory, 'test.sqlite');
process.env.MEDIA_DIR = directory;
const auth = await import('../server/auth');
const ws = await import('../server/workspace');
const { db, initDb } = await import('../server/db');
const { plainError } = await import('../src/features/publishing/PublishComposer');
await initDb();

const creator = await auth.createUser({ email: 'maker@engosoft.test', name: 'Maker', role: 'creator', departmentId: 'operations', password: 'maker-password-12' });
const manager = await auth.createUser({ email: 'boss@engosoft.test', name: 'Boss', role: 'marketing_manager', departmentId: 'marketing', password: 'boss-password-123' });
const creative = { requestId: 'r', directionId: 'd', imageUrl: '/api/creatives/00000000-0000-4000-a000-000000000001/feed.png' };
after(async () => { await db.close(); rmSync(directory, { recursive: true, force: true }); });

const approvedPost = async () => {
  const item = await ws.createContent(creator, { title: 'PMP', channels: ['facebook', 'linkedin', 'x', 'whatsapp'], captions: { linkedin: 'نص', x: 'نص', whatsapp: 'نص' }, creative });
  await ws.transition(creator, item.id, 'ready_for_review', {});
  await ws.transition(manager, item.id, 'approved', {});
  return item;
};

test('a post published by hand is recorded per platform, with a link on the platform itself', async () => {
  const item = await approvedPost();
  assert.deepEqual(await ws.manualPublications(item.id), []);
  const recorded = await ws.recordManualPublication(manager, item.id, 'x', 'https://x.com/engosoft/status/1');
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].channel, 'x');
  assert.equal(recorded[0].url, 'https://x.com/engosoft/status/1');
  assert.equal(recorded[0].by, manager.id);
  // LinkedIn short links and sub-domains are the platform too; recording again keeps the latest.
  await ws.recordManualPublication(manager, item.id, 'linkedin', 'https://www.linkedin.com/posts/engosoft_1');
  await ws.recordManualPublication(manager, item.id, 'linkedin', 'https://lnkd.in/abc');
  const all = await ws.manualPublications(item.id);
  assert.equal(all.length, 2);
  assert.equal(all.find((m) => m.channel === 'linkedin')?.url, 'https://lnkd.in/abc');
  // WhatsApp has no post link: recorded without one.
  assert.equal((await ws.recordManualPublication(manager, item.id, 'whatsapp')).find((m) => m.channel === 'whatsapp')?.url, null);
});

test('links off the platform, platforms with an API or outside the post, and drafts are refused', async () => {
  const item = await approvedPost();
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'x', 'https://example.com/x.com/post'), /المنصة نفسها/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'x', 'http://x.com/engosoft/status/1'), /https/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'x', 'https://evilx.com/post'), /المنصة نفسها/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'whatsapp', 'https://wa.me/1'), /واتساب/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'website'), /ليست من منصات/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'facebook' as never), /ليست من منصات/);
  await assert.rejects(() => ws.recordManualPublication(creator, item.id, 'x'), /صلاحية النشر/);
  const draft = await ws.createContent(creator, { title: 'Draft', channels: ['x'], captions: {}, creative });
  await assert.rejects(() => ws.recordManualPublication(manager, draft.id, 'x'), /المعتمد فقط/);
  assert.deepEqual(await ws.manualPublications(item.id), []);
});

test('platform refusals are explained in words the team can act on', () => {
  const t = (_en: string, ar: string) => ar;
  assert.match(plainError('Provider request failed (HTTP 401, reconnect_required).', t)!, /إعادة ربط/);
  assert.match(plainError('Rate limit reached (HTTP 429)', t)!, /نستنى/);
  assert.match(plainError('Provider request failed (HTTP 503)', t)!, /قبل ما تحاول/);
  assert.equal(plainError('Video exceeds the maximum length', t), null);
});
