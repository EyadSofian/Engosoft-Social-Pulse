import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import express from 'express';

const directory = mkdtempSync(join(tmpdir(), 'engosoft-comments-'));
Object.assign(process.env, {
  DATA_FILE: join(directory, 'tests.sqlite'), DATABASE_URL: '',
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), APP_URL: 'http://127.0.0.1:4100',
  META_APP_ID: '456', META_APP_SECRET: 'fixture-signing-secret', META_COMMENTS_VERIFY_TOKEN: 'fixture-verify-token',
  OPENAI_API_KEY: 'fixture-ai-key',
});
const auth = await import('../server/auth');
const { db, initDb } = await import('../server/db');
const { registerAccount } = await import('../server/social/accounts');
const { saveCommentGrants } = await import('../server/social/comment-meta');
const { parseMetaCommentEvents, registerMetaCommentWebhook } = await import('../server/social/comment-routes');
const { registerSocialRoutes } = await import('../server/social/routes');
const { pollSocialComments, runCommentQueue } = await import('../server/social/comments');
const { saveConnectorResult } = await import('../server/store');
const { blankMetrics } = await import('../server/types');
const { flushUsage } = await import('../server/usage');
const { oauthScopes } = await import('../server/social/oauth');
await initDb();

const manager = await auth.createUser({ name: 'Manager', email: 'manager@example.test', password: 'test-password-123', role: 'marketing_manager', departmentId: 'marketing' });
const employee = await auth.createUser({ name: 'Viewer', email: 'viewer@example.test', password: 'test-password-123', role: 'creator', departmentId: 'hr' });
await db.run('UPDATE users SET permission_overrides=? WHERE id=?', [JSON.stringify({ 'analytics.view': true }), employee.id]);
const session = async (id: string) => `${auth.SESSION_COOKIE}=${(await auth.createSession(id)).token}`;
const managerCookie = await session(manager.id);
const employeeCookie = await session(employee.id);
const fb = await registerAccount('facebook', '12', 'Engosoft Page', manager.id, 'publishing-fixture', ['pages_manage_posts']);
const ig = await registerAccount('instagram', '45', 'engosoft', manager.id, 'ig-publishing-fixture', ['instagram_content_publish']);
const caption = 'Information about the current course';
for (const [account, postIds] of [[fb, ['12_34', '12_35']], [ig, ['67']]] as const) {
  await saveConnectorResult({ platform: account.provider, status: 'connected', message: '', posts: postIds.map(externalId => ({
    accountId: account.externalId, platform: account.provider, accountName: account.name, externalId, permalink: '', title: caption,
    publishedAt: new Date().toISOString(), contentType: 'post', thumbnail: '', metrics: blankMetrics(),
  })) });
}

const app = express();
registerMetaCommentWebhook(app);
app.use(express.json());
app.use('/api', auth.requireUser);
registerSocialRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const originalFetch = globalThis.fetch;
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const fbPost = '/api/social/comments/facebook/12/posts/12_34';
const otherPost = '/api/social/comments/facebook/12/posts/12_35';
const igPost = '/api/social/comments/instagram/45/posts/67';
const accountSettings = '/api/social/comments/facebook/12/settings';
const webhook = '/api/webhooks/meta/comments';

function api(path: string, { method, body, cookie = managerCookie }: { method?: string; body?: unknown; cookie?: string } = {}) {
  return originalFetch(base + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const future = new Date(Date.now() + 5000).toISOString();
const fbComment = (id: string) => ({ id, from: { id: '99', name: 'Student' }, message: 'Is the course online?', created_time: future, can_comment: true });
const igComment = (id: string) => ({ id, from: { id: '98', username: 'learner' }, text: 'Is the course online?', timestamp: future, media: { id: '67' } });
const writes: { id: string; message: string; edge: string }[] = [];
const json = (value: unknown, status = 200) => Response.json(value, { status });
let aiCalls = 0;
let faq: number | null = 1;
let uncertainId: string | undefined;
let subscribed = ['messages'];
let scanComments = false;
const polledPosts: string[] = [];
let limitingPost: string | undefined;
let beforeAi: (() => Promise<void>) | undefined;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const [, version, id, edge] = url.pathname.split('/');
  if (url.hostname === 'api.openai.com') {
    aiCalls++;
    await beforeAi?.();
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    return json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ faq, draft: 'Thanks for asking. Please check the course details.' }) }] }] });
  }
  assert.equal(url.hostname, 'graph.facebook.com');
  assert.ok(version);
  if (id === 'me' && edge === 'permissions') return json({
    data: [...new Set([...oauthScopes('facebook', 'comments'), ...oauthScopes('instagram', 'comments')])].map(permission => ({ permission, status: 'granted' })),
  });
  if (id === 'me' && edge === 'accounts') return json({
    data: [{ id: '12', access_token: 'page-comment-token', tasks: ['MODERATE'], instagram_business_account: { id: '45' } }],
  });
  assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer page-comment-token');
  if (edge === 'subscribed_apps') {
    assert.equal(id, '12');
    if (init?.method === 'POST') {
      subscribed = new URLSearchParams(String(init.body)).get('subscribed_fields')!.split(',');
      return json({ success: true });
    }
    return json({ data: [{ id: '456', subscribed_fields: subscribed }] });
  }
  if (init?.method === 'POST') {
    writes.push({ id, edge, message: new URLSearchParams(String(init.body)).get('message')! });
    if (id === uncertainId) throw new Error('Connection reset after write');
    return json({ id: '777' });
  }
  if (scanComments && edge === 'comments' && (id.startsWith('12_') || id === '67')) {
    polledPosts.push(id);
    if (id === limitingPost) return json({ error: { code: 4 } }, 403);
    if (id === '12_34') return json({ data: [
      fbComment('34_16'),
      { ...fbComment('34_17'), from: { id: '12' } },
      { ...fbComment('34_18'), created_time: new Date(Date.now() - 3 * 3600_000).toISOString() },
    ] });
    return json({ data: [] });
  }
  if (id === '12_34' && edge === 'comments') return json({ data: [fbComment('34_10'), fbComment('34_11')], paging: { next: 'https://not-used.invalid', cursors: { after: 'cursor' } } });
  if (id === '12_35' && edge === 'comments') return json({ data: [] });
  if (id === '67' && edge === 'comments') return json({ data: [igComment('681')] });
  if (id === '12_34' || id === '12_35') return json({ id, from: { id: '12' }, message: caption, is_published: true });
  if (id === '67') return json({ id, owner: { id: '45' }, caption, media_product_type: 'FEED' });
  if (edge === 'comments' || edge === 'replies') return json({ data: id === '34_13' ? [{ ...fbComment('34_120'), from: { id: '12' } }] : [] });
  if (id.startsWith('34_')) return json(fbComment(id));
  if (id === '681' || id === '682') return json(igComment(id));
  throw new Error(`Unexpected fixture request ${url.pathname}`);
};
after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>(resolve => server.close(() => resolve()));
  await flushUsage();
  await db.close();
  rmSync(directory, { force: true, recursive: true });
});

const automatic = { mode: 'automatic', faqs: [{ question: 'Is it online?', answer: 'Yes. This course is online.' }] };
const manual = { mode: 'manual', faqs: [] };
const feed = (id: string, post = '12_34', parent = post) => ({ object: 'page', entry: [{ id: '12', changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', post_id: post, parent_id: parent, comment_id: id } }] }] });
const instagram = (id: string, media: Record<string, string> = { id: '67', media_product_type: 'FEED' }) => ({ object: 'instagram', entry: [{ id: '45', changes: [{ field: 'comments', value: { comment_id: id, media } }] }] });
function sendEvent(event: unknown, signed = true) {
  const body = JSON.stringify(event);
  const signature = createHmac('sha256', process.env.META_APP_SECRET!).update(body).digest('hex');
  return originalFetch(base + webhook, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=' + (signed ? signature : 'invalid') }, body });
}
const state = async (commentId: string) => (await db.get<{ state: string }>('SELECT state FROM social_comment_events WHERE comment_id=?', [commentId]))?.state;

test('Meta comment grants are separate from publishing and require authorized linked identities', async () => {
  assert.ok(!oauthScopes('facebook', 'publishing').includes('pages_manage_engagement'));
  assert.equal((await api(fbPost)).status, 403);
  const token = { accessToken: 'grant-request', scopes: [], expiresAt: 0 };
  await saveCommentGrants('facebook', token);
  await saveCommentGrants('instagram', token);
  const stored = await db.get<{ credential_source: string; scopes_json: string }>('SELECT credential_source, scopes_json FROM social_accounts WHERE id=?', [fb.id]);
  assert.equal(stored?.credential_source, 'publishing-fixture');
  assert.deepEqual(JSON.parse(stored!.scopes_json), ['pages_manage_posts']);
  assert.equal((await api(fbPost + '/settings')).status, 200);
  assert.equal((await api(fbPost, { cookie: '' })).status, 401);
});

test('manual replies and drafts are scoped to the selected post and authorized publisher', async () => {
  const response = await api(fbPost);
  assert.equal(response.status, 200);
  const list = await response.json();
  assert.equal(list.next, 'cursor');
  const first = list.comments[0];
  const request = { reference: first.reference, message: 'Happy to help.' };
  assert.equal((await api(fbPost + '/34_10/replies', { body: request, cookie: employeeCookie })).status, 403);
  assert.equal((await api(otherPost + '/34_10/replies', { body: request })).status, 409);
  assert.equal((await api(fbPost + '/34_11/replies', { body: request })).status, 409);
  assert.equal((await api(fbPost + '/34_10/replies?reference=' + first.reference)).status, 200);
  const draft = await api(fbPost + '/34_10/draft', { body: { reference: first.reference } });
  assert.equal(draft.status, 200);
  assert.match((await draft.json()).draft, /Thanks/);
  const results = await Promise.all([api(fbPost + '/34_10/replies', { body: request }), api(fbPost + '/34_10/replies', { body: request })]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.deepEqual(writes.filter(w => w.id === '34_10'), [{ id: '34_10', edge: 'comments', message: request.message }]);
  assert.equal((await (await api(fbPost)).json()).comments[0].delivery.state, 'sent');
});

test('ambiguous Meta failures stay unconfirmed until the thread shows the reply is missing', async () => {
  const comment = (await (await api(fbPost)).json()).comments[1];
  const body = { reference: comment.reference, message: 'Reply may have been sent' };
  uncertainId = '34_11';
  const result = await api(fbPost + '/34_11/replies', { body });
  assert.equal(result.status, 409);
  assert.equal((await result.json()).code, 'reply_unconfirmed');
  const early = await api(fbPost + '/34_11/replies', { body });
  assert.equal(early.status, 409);
  assert.equal((await early.json()).code, 'reply_check_later');
  assert.equal(writes.filter(w => w.id === uncertainId).length, 1);
  assert.equal((await (await api(fbPost)).json()).comments[1].delivery.state, 'uncertain');
  // After two minutes an empty thread proves the first attempt did not land, so one resend is allowed.
  await db.run("UPDATE social_comment_deliveries SET updated_at=? WHERE comment_id='34_11'", [Date.now() - 3 * 60_000]);
  uncertainId = undefined;
  assert.equal((await api(fbPost + '/34_11/replies', { body })).status, 201);
  assert.equal(writes.filter(w => w.id === '34_11').length, 2);
  assert.equal((await (await api(fbPost)).json()).comments[1].delivery.state, 'sent');
  assert.equal((await api(fbPost + '/34_11/replies', { body })).status, 409);
});

test('webhook signatures, organic top-level events and disabled defaults', async () => {
  const verification = await originalFetch(base + webhook + '?hub.mode=subscribe&hub.verify_token=fixture-verify-token&hub.challenge=1234');
  assert.equal(await verification.text(), '1234');
  assert.equal((await sendEvent(feed('34_12'), false)).status, 403);
  assert.equal((await sendEvent(feed('34_12'))).status, 200);
  assert.equal(await state('34_12'), undefined);
  assert.deepEqual(parseMetaCommentEvents(feed('34_12', '12_34', '34_10')), []);
  assert.deepEqual(parseMetaCommentEvents(instagram('682', { id: '67', ad_id: '88' })), []);
  assert.deepEqual(parseMetaCommentEvents(instagram('682')), [{ platform: 'instagram', account: '45', post: '67', comment: '682' }]);
});

test('account defaults queue one approved reply, skip native replies, and obey a post override', async () => {
  const before = aiCalls;
  assert.equal((await api(accountSettings, { method: 'PATCH', body: automatic, cookie: employeeCookie })).status, 403);
  assert.equal((await api(accountSettings, { method: 'PATCH', body: automatic })).status, 200);
  assert.deepEqual(subscribed, ['messages']);
  assert.equal((await api(otherPost + '/settings', { method: 'PATCH', body: { policy: manual } })).status, 200);
  assert.equal((await api(igPost + '/settings', { method: 'PATCH', body: { policy: automatic } })).status, 200);
  assert.equal((await sendEvent([feed('34_12'), feed('34_12'), feed('34_13'), feed('35_12', '12_35'), instagram('682')])).status, 200);
  await Promise.all([runCommentQueue(), runCommentQueue()]);
  assert.deepEqual(writes.filter(w => w.id === '34_12' || w.id === '682').sort((a, b) => a.id.localeCompare(b.id)), [
    { id: '34_12', edge: 'comments', message: automatic.faqs[0].answer }, { id: '682', edge: 'replies', message: automatic.faqs[0].answer },
  ]);
  assert.equal(aiCalls - before, 2);
  await db.run('DELETE FROM social_comment_timers WHERE key=?', ['auto:facebook:12']);
  await db.run('UPDATE social_comment_events SET next_at=0 WHERE comment_id=?', ['34_13']);
  await runCommentQueue();
  assert.equal(await state('34_13'), 'done');
  assert.equal(await state('35_12'), undefined);
  await sendEvent(feed('34_12'));
  await runCommentQueue();
  assert.equal(writes.filter(w => w.id === '34_12').length, 1);
});

test('automation holds unmatched comments and honors disabling while the AI runs', async () => {
  await db.run('DELETE FROM social_comment_timers WHERE key=?', ['auto:facebook:12']);
  faq = null;
  await sendEvent(feed('34_14'));
  await runCommentQueue();
  assert.equal(await state('34_14'), 'review');
  assert.equal(writes.some(w => w.id === '34_14'), false);
  faq = 1;
  beforeAi = async () => {
    assert.equal((await api(fbPost + '/settings', { method: 'PATCH', body: { policy: manual } })).status, 200);
  };
  await sendEvent(feed('34_15'));
  await runCommentQueue();
  assert.equal(await state('34_15'), 'done');
  assert.equal(writes.some(w => w.id === '34_15'), false);
  assert.equal((await api(fbPost + '/settings', { method: 'PATCH', body: { policy: null } })).status, 200);
  assert.equal((await (await api(fbPost + '/settings')).json()).policy, null);
  beforeAi = undefined;
});

test('manual top-level comments use the post edge on both services and deduplicate retried requests', async () => {
  const fbInput = { requestId: randomUUID(), message: 'A new Page comment.' };
  const igInput = { requestId: randomUUID(), message: 'A new Instagram comment.' };
  assert.equal((await api(fbPost, { body: fbInput, cookie: employeeCookie })).status, 403);
  assert.equal((await api(fbPost, { body: fbInput })).status, 201);
  assert.equal((await api(fbPost, { body: fbInput })).status, 201);
  assert.equal((await api(fbPost, { body: { ...fbInput, message: 'Changed text' } })).status, 409);
  assert.equal((await api(igPost, { body: igInput })).status, 201);
  assert.deepEqual(writes.filter(w => w.id === '12_34' || w.id === '67'), [
    { id: '12_34', edge: 'comments', message: fbInput.message }, { id: '67', edge: 'comments', message: igInput.message },
  ]);
});

test('periodic scan needs no webhook, skips old and own comments, and claims one batch per five minutes', async () => {
  const token = process.env.META_COMMENTS_VERIFY_TOKEN;
  delete process.env.META_COMMENTS_VERIFY_TOKEN;
  scanComments = true;
  try {
    assert.equal((await api(fbPost + '/settings', { method: 'PATCH', body: { policy: automatic } })).status, 200);
    const now = Date.now();
    const results = await Promise.all([pollSocialComments(now), pollSocialComments(now)]);
    assert.deepEqual(results.sort(), [0, 2]);
    assert.equal(await pollSocialComments(now + 60_000), 0);
    assert.equal(await state('34_16'), 'queued');
    assert.equal(await state('34_17'), undefined);
    assert.equal(await state('34_18'), undefined);
    await runCommentQueue();
    assert.equal(await state('34_16'), 'done');
    assert.equal(writes.filter(row => row.id === '34_16').length, 1);
  } finally {
    process.env.META_COMMENTS_VERIFY_TOKEN = token;
    scanComments = false;
  }
});

test('scan batches stop at 14 posts and pause globally on a Meta app rate limit', async () => {
  scanComments = true;
  try {
    const more = Array.from({ length: 16 }, (_, i) => ({
      platform: 'facebook' as const, accountId: fb.externalId, accountName: fb.name, externalId: `12_${50 + i}`,
      permalink: '', title: caption, publishedAt: new Date(Date.now() + 10_000 + i).toISOString(),
      contentType: 'post', thumbnail: '', metrics: blankMetrics(),
    }));
    await saveConnectorResult({ platform: 'facebook', status: 'connected', message: '', posts: more });
    const now = Date.now();
    assert.equal(await pollSocialComments(now + 6 * 60_000), 14);
    const before = polledPosts.length;
    limitingPost = '67';
    const scanned = await pollSocialComments(now + 12 * 60_000);
    assert.equal(polledPosts.length - before, scanned);
    assert.equal(polledPosts.at(-1), limitingPost);
    assert.ok(scanned < 14);
    assert.equal((await api(fbPost)).status, 429);
    assert.equal(await pollSocialComments(now + 18 * 60_000), 0);
  } finally { scanComments = false; limitingPost = undefined; }
});
