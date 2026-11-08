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

test('links off the platform and platforms with an API or outside the post are refused; a publisher recording a draft approves it', async () => {
  const item = await approvedPost();
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'x', 'https://example.com/x.com/post'), /المنصة نفسها/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'x', 'http://x.com/engosoft/status/1'), /https/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'x', 'https://evilx.com/post'), /المنصة نفسها/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'whatsapp', 'https://wa.me/1'), /واتساب/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'website'), /ليست من منصات/);
  await assert.rejects(() => ws.recordManualPublication(manager, item.id, 'facebook' as never), /ليست من منصات/);
  await assert.rejects(() => ws.recordManualPublication(creator, item.id, 'x'), /صلاحية النشر/);
  assert.deepEqual(await ws.manualPublications(item.id), []);
  const draft = await ws.createContent(creator, { title: 'Draft', channels: ['x'], captions: {}, creative });
  await assert.rejects(() => ws.recordManualPublication(creator, draft.id, 'x'), /صلاحية النشر/);
  assert.equal((await ws.manualPublications(draft.id)).length, 0);
  await ws.recordManualPublication(manager, draft.id, 'x');
  // X was its only platform: recording it approves the draft and completes it.
  assert.equal((await ws.getContent(draft.id))!.status, 'published');
  assert.ok((await ws.listEvents(draft.id)).some((event) => event.to === 'approved' && event.actorId === manager.id));
  assert.equal((await ws.manualPublications(draft.id)).length, 1);
});

test('platform refusals are explained in words the team can act on', () => {
  const t = (_en: string, ar: string) => ar;
  assert.match(plainError('Provider request failed (HTTP 401, reconnect_required).', t)!, /إعادة ربط/);
  assert.match(plainError('Rate limit reached (HTTP 429)', t)!, /نستنى/);
  assert.match(plainError('Provider request failed (HTTP 503)', t)!, /قبل ما تحاول/);
  assert.equal(plainError('Video exceeds the maximum length', t), null);
});

test('a post is published once every platform is, including the ones posted by hand', async () => {
  const item = await ws.createContent(creator, { title: 'WhatsApp and X', channels: ['x', 'whatsapp'], captions: { x: 'نص', whatsapp: 'نص' }, creative });
  await ws.transition(creator, item.id, 'ready_for_review', {});
  await ws.transition(manager, item.id, 'approved', {});
  await ws.recordManualPublication(manager, item.id, 'x', 'https://x.com/engosoft/status/9');
  assert.equal((await ws.getContent(item.id))!.status, 'approved', 'WhatsApp is still to go');
  await ws.recordManualPublication(manager, item.id, 'whatsapp');
  assert.equal((await ws.getContent(item.id))!.status, 'published');
});

test('the publisher edits the caption in the publish window until the post is scheduled; a creator cannot after approval', async () => {
  const item = await ws.createContent(creator, { title: 'Caption rule', channels: ['facebook'], captions: { facebook: 'قديم' }, creative });
  await ws.transition(creator, item.id, 'ready_for_review', {});
  await ws.transition(manager, item.id, 'approved', {});
  await assert.rejects(() => ws.updateContent(creator, item.id, { captions: { facebook: 'من المنشئ' } }), /أعد المنشور|صلاحية/);
  const edited = await ws.updateContent(manager, item.id, { captions: { facebook: 'من المسؤول عن النشر' } });
  assert.equal(edited.captions.facebook, 'من المسؤول عن النشر');
  assert.equal(edited.status, 'approved', 'editing the caption keeps the publisher’s approval');
  await ws.transition(manager, item.id, 'scheduled', { scheduledAt: new Date(Date.now() + 3600_000).toISOString() });
  assert.equal(ws.canEditCaptions(manager, (await ws.getContent(item.id))!), false);
});
