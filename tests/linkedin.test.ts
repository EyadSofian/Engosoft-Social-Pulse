import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
const directory = mkdtempSync(join(tmpdir(), 'linkedin-'));
process.env.DATA_FILE = join(directory, 'db.sqlite');
process.env.MEDIA_DIR = directory;
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.APP_URL = 'https://app.example.test';
const auth = await import('../server/auth');
const ws = await import('../server/workspace');
const store = await import('../server/social/store');
const li = await import('../server/social/linkedin');
const publishing = await import('../server/social/publishing');
const queue = await import('../server/social/queue');
const { capabilities } = await import('../server/social/capabilities');
const { validateMedia } = await import('../server/social/media');
const { db, initDb } = await import('../server/db');
await initDb();
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await db.close(); rmSync(directory, { recursive: true, force: true }); });
const admin = await auth.createUser({ name: 'Admin', email: 'li@example.test', password: 'test-password-123', role: 'admin', departmentId: 'marketing' });
const targetId = '6ae9d68167115d66500cf7f0', org = '3488623', credentialId = 'zernio:linkedin:test';
await store.saveSecret(credentialId, { apiKey: 'test-linkedin-key' });
let switched = false, analyticsForbidden = false, writeMode: 'published' | 'processing' | 'network' | 'upstream' = 'published';
const writes: RequestInit[] = [];
let caption = '';
let externalPosts: unknown[] = [];
const health = () => ({ accountId: targetId, platform: 'linkedin', tokenStatus: { valid: true, expiresAt: '2027-01-02T12:00:00Z' }, permissions: { canPost: true, canFetchAnalytics: true, posting: [{ scope: 'w_member_social', granted: true }], analytics: [{ scope: 'r_organization_social', granted: true }], optional: [{ scope: 'w_organization_social', granted: true }] } });
const remotePost = () => ({ post: { _id: 'remote-1', content: caption, status: writeMode, platforms: [{ platform: 'linkedin', accountId: targetId, status: writeMode === 'processing' ? 'pending' : 'published', platformPostId: 'urn:li:share:12345', platformPostUrl: 'https://www.linkedin.com/feed/update/urn:li:share:12345/' }] } });
function mock() {
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    assert.equal(u.origin, 'https://zernio.com');
    if (init?.method === 'POST') {
      writes.push(init); caption = JSON.parse(String(init.body)).content;
      if (writeMode === 'network') throw new Error('connection lost after write');
      if (writeMode === 'upstream') return Response.json({ type: 'platform_error' }, { status: 400 });
      return Response.json(remotePost());
    }
    if (u.pathname.endsWith('/accounts')) return Response.json({ accounts: [{ _id: targetId, platform: 'linkedin', platformUserId: switched ? 'urn:li:person:someone' : `urn:li:organization:${org}`, displayName: 'Engosoft', username: 'Engosoft', isActive: true }, { _id: 'personal', platform: 'linkedin', platformUserId: 'urn:li:person:me', isActive: true }] });
    if (u.pathname.endsWith('/health')) return Response.json(health());
    if (u.pathname.endsWith('/analytics')) return analyticsForbidden ? Response.json({ error: 'private upstream details' }, { status: 403 }) : Response.json({ posts: [], pagination: { totalPages: 0 } });
    if (u.pathname.endsWith('/posts')) return Response.json({ posts: externalPosts, pagination: { pages: 1 } });
    if (u.pathname.endsWith('/posts/remote-1')) return Response.json(remotePost());
    throw new Error(`Unexpected request ${u.pathname}`);
  };
}
mock();
async function approved(title: string) {
  const item = await ws.createContent(admin, { title, channels: ['linkedin'], captions: { linkedin: title }, creative: {requestId:'text-review',directionId:'text-review',imageUrl:'/api/creatives/text-review/feed.png'} });
  await ws.transition(admin, item.id, 'ready_for_review', {});
  await ws.transition(admin, item.id, 'approved', {});
  return (await ws.getContent(item.id))!;
}
const input = (id: string) => ({ contentId: id, accountId: `linkedin:${org}`, kind: 'text' as const, media: [], mode: 'direct' as const, consent: true as const });

test('only organization pages are candidates; the exact numeric organization must match', async () => {
  assert.deepEqual(await li.linkedInCandidates(), [{ targetId, organizationId: org, name: 'Engosoft' }]);
  await assert.rejects(li.connectLinkedIn(targetId, '999', admin.id), /organization_identity_changed/);
  assert.equal((await store.listAccounts('linkedin')).length, 0);
  const result = await li.connectLinkedIn(targetId, org, admin.id);
  assert.equal(result.metricsEnabled, true);
  const account = (await store.getAccount(`linkedin:${org}`))!;
  assert.equal(account.credentialSource, credentialId);
  assert.equal(capabilities('linkedin', account).publish_carousel, 'available');
  assert.equal(capabilities('linkedin', account).upload_draft, 'unsupported');
});

test('missing API-key Analytics permission never masquerades as available metrics or blocks publishing', async () => {
  analyticsForbidden = true;
  try {
    await li.connectLinkedIn(targetId, org, admin.id);
    const account = (await store.getAccount(`linkedin:${org}`))!;
    assert.equal(capabilities('linkedin', account).read_metrics, 'authorization_required');
    assert.equal(capabilities('linkedin', account).publish_text, 'available');
    assert.equal((await li.syncLinkedIn(account)).partial, true);
  } finally { analyticsForbidden = false; await li.connectLinkedIn(targetId, org, admin.id); }
});

test('text pages appear in automatic publishing and publish once with native evidence and idempotency', async () => {
  const item = await approved('LinkedIn approved text');
  assert.equal((await queue.publishTargets(item))[0].ready, true);
  const before = writes.length;
  const first = await publishing.publish(admin, input(item.id));
  assert.equal(first.state, 'published');
  assert.equal(first.externalId, 'urn:li:share:12345');
  assert.equal((writes.at(-1)?.headers as Record<string,string>)['Idempotency-Key'], first.id);
  const body = JSON.parse(String(writes.at(-1)?.body));
  assert.deepEqual(body.platforms, [{ platform: 'linkedin', accountId: targetId }]);
  assert.equal(body.content, item.captions.linkedin);
  assert.equal((await publishing.publish(admin, input(item.id))).id, first.id);
  assert.equal(writes.length, before + 1);
  assert.equal((await ws.getContent(item.id))?.status, 'published');
});

test('a switch to personal posting is rejected before any publication write', async () => {
  const item = await approved('Wrong organization');
  const before = writes.length;
  switched = true;
  try {
    const result = await publishing.publish(admin, input(item.id));
    assert.equal(result.state, 'failed');
    assert.equal(writes.length, before);
  } finally { switched = false; }
});

test('ambiguous network and upstream failures are retained and never resubmitted', async () => {
  for (const mode of ['network', 'upstream'] as const) {
    const item = await approved(`Uncertain ${mode}`), before = writes.length;
    writeMode = mode;
    const result = await publishing.publish(admin, input(item.id));
    assert.equal(result.state, 'unknown');
    assert.equal((await publishing.publish(admin, { ...input(item.id), retry: true })).id, result.id);
    assert.equal(writes.length, before + 1);
  }
  writeMode = 'published';
});

test('processing keeps the remote handle and polls it, without another post', async () => {
  const item = await approved('Processing LinkedIn');
  writeMode = 'processing';
  const before = writes.length, first = await publishing.publish(admin, input(item.id));
  assert.equal(first.state, 'processing');
  assert.equal(first.remoteId, 'remote-1');
  await db.run('UPDATE social_publish_jobs SET updated_at=? WHERE id=?', ['2020-01-01T00:00:00.000Z', first.id]);
  writeMode = 'published';
  assert.equal((await publishing.checkJob(first.id)).state, 'published');
  assert.equal(writes.length, before + 1);
});

test('publication proof cannot come from another account, another caption or a foreign URL', () => {
  caption = 'Expected';
  const wrong = remotePost(); wrong.post.platforms[0].accountId = 'different';
  assert.equal(li.linkedInResult(wrong, targetId, caption).state, 'unknown');
  assert.equal(li.linkedInResult(remotePost(), targetId, 'different').state, 'unknown');
  const malicious = remotePost(); malicious.post.platforms[0].platformPostId = ''; malicious.post.platforms[0].platformPostUrl = 'https://linkedin.com.attacker.test/feed/update/urn:li:share:12345/';
  assert.notEqual(li.linkedInResult(malicious, targetId, caption).state, 'published');
});

test('analytics maps only the selected organization and preserves unknown or pending metrics', async () => {
  const account = (await store.getAccount(`linkedin:${org}`))!;
  const row = { postId: 'urn:li:share:55', status: 'published', content: 'A post', publishedAt: '2026-11-01T10:00:00Z', mediaType: 'image', analytics: { impressions: 999999 }, platformAnalytics: [{ platform: 'linkedin', accountId: targetId, status: 'published', syncStatus: 'synced', analytics: { impressions: 0, likes: 2, saves: 0, views: 0 } }] };
  const observed = li.linkedInObserved(row, account)!;
  assert.equal(observed.metrics.impressions, 0);
  assert.equal(observed.metrics.likes, 2);
  assert.equal(observed.metrics.reach, null);
  assert.equal(observed.metrics.views, null);
  assert.equal(observed.metrics.saves, null, 'organization saves are unsupported');
  row.platformAnalytics[0].syncStatus = 'pending';
  assert.equal(li.linkedInObserved(row, account)?.metrics.likes, null);
  row.platformAnalytics[0].accountId = 'another';
  assert.equal(li.linkedInObserved(row, account), undefined);
});

test('a newly connected page imports historical post metadata before analytics are ready', async () => {
  externalPosts = [{ platform:'linkedin', platformPostId:'urn:li:ugcPost:999', platformPostUrl:'https://www.linkedin.com/feed/update/urn:li:ugcPost:999/', content:'An old video', publishedAt:'2026-11-01T10:00:00Z', mediaType:'video', analytics:{views:0,likes:0} }];
  try {
    const result = await li.syncLinkedIn((await store.getAccount(`linkedin:${org}`))!);
    assert.equal(result.status, 'connected');
    assert.equal(result.partial, true);
    assert.equal(result.posts.length, 1);
    assert.equal(result.posts[0].externalId, 'urn:li:ugcPost:999');
    assert.equal(result.posts[0].metrics.views, null);
    assert.equal(result.posts[0].metrics.likes, null);
  } finally { externalPosts = []; }
});

test('LinkedIn validates caption length, photo-only carousels and direct delivery', () => {
  const text = input('unused');
  assert.doesNotThrow(() => validateMedia('linkedin', text, [], 'Valid'));
  assert.throws(() => validateMedia('linkedin', text, [], 'a'.repeat(3001)), /3,000/);
  assert.throws(() => validateMedia('linkedin', { ...text, mode: 'draft' }, [], 'Text'), /direct/);
  const video = { url: '/api/social/assets/v', type: 'video' as const, mimeType: 'video/mp4', bytes: 500, width: 1080, height: 1920, duration: 10 };
  assert.throws(() => validateMedia('linkedin', { ...text, kind: 'carousel' }, [video, video], 'Text'), /images only/);
});
