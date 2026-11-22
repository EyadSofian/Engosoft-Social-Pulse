import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import express from 'express';

const directory = mkdtempSync(join(tmpdir(), 'engosoft-comments-platforms-'));
Object.assign(process.env, {
  DATA_FILE: join(directory, 'tests.sqlite'), DATABASE_URL: '',
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), APP_URL: 'http://127.0.0.1:4100',
  META_APP_ID: '', META_APP_SECRET: '', META_COMMENTS_APP_ID: '', META_COMMENTS_APP_SECRET: '',
  OPENAI_API_KEY: 'fixture-ai-key',
});
const auth = await import('../server/auth');
const { db, initDb } = await import('../server/db');
const { registerAccount } = await import('../server/social/accounts');
const { saveSecret } = await import('../server/social/store');
const { registerSocialRoutes } = await import('../server/social/routes');
const { pollSocialComments, runCommentQueue } = await import('../server/social/comments');
const { YOUTUBE_COMMENT_SCOPE } = await import('../server/social/comment-providers');
const { oauthScopes } = await import('../server/social/oauth');
const { saveConnectorResult } = await import('../server/store');
const { blankMetrics } = await import('../server/types');
const { flushUsage } = await import('../server/usage');
await initDb();

const manager = await auth.createUser({ name: 'Manager', email: 'manager@example.test', password: 'test-password-123', role: 'marketing_manager', departmentId: 'marketing' });
const cookie = `${auth.SESSION_COOKIE}=${(await auth.createSession(manager.id)).token}`;
const readonly = 'https://www.googleapis.com/auth/youtube.readonly';

await saveSecret('zernio:linkedin:fixture', { apiKey: 'zernio-key' });
await saveSecret('zernio:route:fixture', { apiKey: 'zernio-key' });
await saveSecret('oauth:youtube:fixture', { accessToken: 'youtube-token', expiresAt: 0, scopes: [readonly, YOUTUBE_COMMENT_SCOPE] });
await saveSecret('oauth:youtube:readonly', { accessToken: 'youtube-readonly', expiresAt: 0, scopes: [readonly] });
const linkedin = await registerAccount('linkedin', '555', 'Engosoft', manager.id, 'zernio:linkedin:fixture', ['r_organization_social'], { zernioAccountId: 'zl1' });
const tiktok = await registerAccount('tiktok', 'open-777', 'engosoft', manager.id, 'oauth:tiktok:fixture', ['video.list']);
await db.run(`INSERT INTO social_publishing_routes (account_id,service,target_id,username,credential_id,enabled,verified_at,status)
  VALUES (?,?,?,?,?,1,?,'connected')`, [tiktok.id, 'zernio', 'zt1', 'engosoft', 'zernio:route:fixture', new Date().toISOString()]);
const channel = 'UCengosoftchannel000001';
await registerAccount('youtube', channel, 'Engosoft', manager.id, 'oauth:youtube:fixture', [readonly, YOUTUBE_COMMENT_SCOPE]);
await registerAccount('youtube', 'UCreadonlychannel000001', 'Engosoft 2', manager.id, 'oauth:youtube:readonly', [readonly]);
const caption = 'Information about the current course';
for (const [platform, accountId, ids] of [
  ['linkedin', '555', ['urn:li:share:100', 'urn:li:activity:101']], ['tiktok', 'open-777', ['7000']],
  ['youtube', channel, ['vid123abc45', 'vidQuota0001']], ['youtube', 'UCreadonlychannel000001', ['vidOther0001']],
] as const) {
  await saveConnectorResult({ platform, status: 'connected', message: '', posts: ids.map(externalId => ({
    accountId, platform, accountName: 'Engosoft', externalId, permalink: '', title: caption,
    publishedAt: new Date().toISOString(), contentType: 'post', thumbnail: '', metrics: blankMetrics(),
  })) });
}

const app = express();
app.use(express.json());
app.use('/api', auth.requireUser);
registerSocialRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const originalFetch = globalThis.fetch;
const api = (path: string, body?: unknown, method?: string) => originalFetch(base + path, {
  method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { cookie, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const liPost = `/api/social/comments/linkedin/555/posts/${encodeURIComponent('urn:li:share:100')}`;
const ttPost = '/api/social/comments/tiktok/open-777/posts/7000';
const ytPost = `/api/social/comments/youtube/${channel}/posts/vid123abc45`;

const future = new Date(Date.now() + 5000).toISOString();
const liComment = 'urn:li:comment:(urn:li:activity:100,1)';
const zernioComment = (id: string, extra: Record<string, unknown> = {}) => ({
  id, message: 'Is the course online?', createdTime: future, from: { id: 'person-' + id, name: 'Sara', isOwner: false },
  replyCount: 0, canReply: true, replies: [], ...extra,
});
const ytThread = (id: string, video = 'vid123abc45', author = 'UCviewer') => ({ id, snippet: { videoId: video, canReply: true, totalReplyCount: 0,
  topLevelComment: { id, snippet: { textDisplay: 'Is the course online?', authorDisplayName: 'Omar', authorChannelId: { value: author }, publishedAt: future } } } });

const writes: { host: string; path: string; body: Record<string, any>; key: string | null }[] = [];
let addonMissing = false;
let ytWriteFails = false;
const ytOwnReplies = new Set<string>();
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === 'api.openai.com') {
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ faq: 1, draft: 'Thanks for asking.' }) }] }] });
  }
  const auth = new Headers(init?.headers).get('authorization');
  if (url.hostname === 'zernio.com') {
    assert.equal(auth, 'Bearer zernio-key');
    if (addonMissing) return Response.json({ error: 'Inbox addon required' }, { status: 403 });
    const post = decodeURIComponent(url.pathname.replace('/api/v1/inbox/comments/', ''));
    if (init?.method === 'POST') {
      writes.push({ host: 'zernio', path: post, body: JSON.parse(String(init.body)), key: new Headers(init.headers).get('idempotency-key') });
      return Response.json({ success: true, data: { commentId: 'zernio-new-' + writes.length, isReply: true } });
    }
    const account = url.searchParams.get('accountId');
    if (post === 'urn:li:share:100') {
      assert.equal(account, 'zl1');
      return Response.json({ status: 'success', comments: [
        zernioComment(liComment, { replyCount: 1, replies: [{ id: 'urn:li:comment:(urn:li:activity:100,2)', message: 'Yes', createdTime: future, from: { id: 'org', name: 'Engosoft', isOwner: true } }] }),
        zernioComment('urn:li:comment:(urn:li:activity:100,3)'),
        zernioComment('urn:li:comment:(urn:li:activity:100,4)', { from: { id: 'org', name: 'Engosoft', isOwner: true } }),
      ], pagination: { hasMore: false } });
    }
    if (post === '7000') {
      assert.equal(account, 'zt1');
      if (url.searchParams.get('commentId')) return Response.json({ comments: [zernioComment('7100', { message: 'reply', from: { id: 'x', name: 'Ali' } })], pagination: { hasMore: false } });
      return Response.json({ comments: [zernioComment('7001', { replyCount: 1 })], pagination: { hasMore: false } });
    }
    throw new Error('Unexpected Zernio request ' + url.pathname);
  }
  if (url.hostname === 'www.googleapis.com') {
    assert.equal(auth, 'Bearer youtube-token');
    const resource = url.pathname.split('/').pop();
    if (init?.method === 'POST') {
      writes.push({ host: 'youtube', path: `${resource}`, body: JSON.parse(String(init.body)), key: null });
      if (ytWriteFails) throw new Error('Connection reset after write');
      return Response.json({ id: 'yt-new-' + writes.length });
    }
    if (url.searchParams.get('videoId') === 'vidQuota0001') return Response.json({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 });
    if (resource === 'commentThreads' && url.searchParams.get('videoId')) {
      assert.equal(url.searchParams.get('order'), 'time');
      return Response.json({ items: [ytThread('Ugw1'), ytThread('Ugw2'), ytThread('Ugw3', 'vid123abc45', channel)] });
    }
    if (resource === 'commentThreads' && url.searchParams.get('id')) return Response.json({ items: [ytThread(url.searchParams.get('id')!)] });
    if (resource === 'comments') {
      const parent = url.searchParams.get('parentId')!;
      return Response.json({ items: ytOwnReplies.has(parent) ? [{ id: parent + '.r1', snippet: { textDisplay: 'Answered', authorDisplayName: 'Engosoft', authorChannelId: { value: channel }, parentId: parent, publishedAt: future } }] : [] });
    }
    if (resource === 'videos') return Response.json({ items: [{ id: url.searchParams.get('id'), snippet: { channelId: channel, title: caption, description: '' } }] });
  }
  throw new Error('Unexpected request ' + url.href);
};
after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>(resolve => server.close(() => resolve()));
  await flushUsage();
  await db.close();
  rmSync(directory, { force: true, recursive: true });
});
const automatic = { mode: 'automatic', faqs: [{ question: 'Is it online?', answer: 'Yes. This course is online.' }] };

test('each platform reports its own comment setup, and YouTube needs the force-ssl consent', async () => {
  assert.ok(oauthScopes('youtube', 'comments').includes(YOUTUBE_COMMENT_SCOPE));
  assert.ok(!oauthScopes('youtube', 'publishing').includes(YOUTUBE_COMMENT_SCOPE));
  assert.equal((await api('/api/oauth/tiktok/start?mode=comments')).status, 400);
  const li = await (await api(liPost + '/settings')).json();
  assert.deepEqual([li.authorized, li.setup], [true, 'zernio_linkedin']);
  const tt = await (await api(ttPost + '/settings')).json();
  assert.deepEqual([tt.authorized, tt.setup], [true, 'zernio_tiktok']);
  const yt = await (await api(ytPost + '/settings')).json();
  assert.deepEqual([yt.authorized, yt.setup], [true, 'youtube']);
  const other = await (await api('/api/social/comments/youtube/UCreadonlychannel000001/posts/vidOther0001/settings')).json();
  assert.equal(other.authorized, false);
  const activity = await api(`/api/social/comments/linkedin/555/posts/${encodeURIComponent('urn:li:activity:101')}`);
  assert.equal(activity.status, 409);
  assert.equal((await activity.json()).code, 'comment_post_unsupported');
});

test('LinkedIn reads and replies through Zernio with an idempotency key', async () => {
  const page = await (await api(liPost)).json();
  assert.equal(page.comments.length, 3);
  assert.equal(page.comments[2].own, true);
  const first = page.comments[0];
  const replies = await (await api(`${liPost}/${encodeURIComponent(first.id)}/replies?reference=${first.reference}`)).json();
  assert.equal(replies.comments[0].own, true);
  const second = page.comments[1];
  const draft = await (await api(`${liPost}/${encodeURIComponent(second.id)}/draft`, { reference: second.reference })).json();
  assert.match(draft.draft, /Thanks/);
  const sent = await api(`${liPost}/${encodeURIComponent(second.id)}/replies`, { reference: second.reference, message: 'Yes, online.' });
  assert.equal(sent.status, 201);
  const write = writes.at(-1)!;
  assert.deepEqual(write.body, { accountId: 'zl1', message: 'Yes, online.', commentId: second.id });
  assert.equal(write.path, 'urn:li:share:100');
  assert.match(write.key!, /^[0-9a-f]{64}$/);
  const top = await api(liPost, { requestId: crypto.randomUUID(), message: 'New details are in the link.' });
  assert.equal(top.status, 201);
  assert.deepEqual(writes.at(-1)!.body, { accountId: 'zl1', message: 'New details are in the link.' });
});

test('TikTok reads replies with the comment id, and a missing Inbox add-on is explained', async () => {
  const page = await (await api(ttPost)).json();
  const replies = await (await api(`${ttPost}/7001/replies?reference=${page.comments[0].reference}`)).json();
  assert.equal(replies.comments[0].id, '7100');
  addonMissing = true;
  const blocked = await api(ttPost);
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, 'inbox_addon_required');
  addonMissing = false;
});

test('YouTube replies, top-level comments, quota pauses and unconfirmed writes', async () => {
  const page = await (await api(ytPost)).json();
  assert.equal(page.comments.length, 3);
  const [first, second] = page.comments;
  assert.equal((await api(`${ytPost}/${first.id}/replies`, { reference: first.reference, message: 'Yes.' })).status, 201);
  assert.deepEqual(writes.at(-1)!.body, { snippet: { parentId: 'Ugw1', textOriginal: 'Yes.' } });
  assert.equal((await api(ytPost, { requestId: crypto.randomUUID(), message: 'Welcome!' })).status, 201);
  assert.deepEqual(writes.at(-1)!.body, { snippet: { channelId: channel, videoId: 'vid123abc45', topLevelComment: { snippet: { textOriginal: 'Welcome!' } } } });

  ytWriteFails = true;
  const unsure = await api(`${ytPost}/${second.id}/replies`, { reference: second.reference, message: 'Maybe sent.' });
  assert.equal((await unsure.json()).code, 'reply_unconfirmed');
  ytWriteFails = false;
  ytOwnReplies.add(second.id);
  await db.run("UPDATE social_comment_deliveries SET updated_at=? WHERE comment_id=?", [Date.now() - 3 * 60_000, second.id]);
  const count = writes.length;
  const settled = await api(`${ytPost}/${second.id}/replies`, { reference: second.reference, message: 'Maybe sent.' });
  assert.equal((await settled.json()).code, 'reply_already_sent');
  assert.equal(writes.length, count);
  assert.equal((await (await api(ytPost)).json()).comments[1].delivery.state, 'sent');

  const quota = await api(`/api/social/comments/youtube/${channel}/posts/vidQuota0001`);
  assert.equal((await quota.json()).code, 'comment_rate_limited');
});

test('automatic replies post the approved answer on LinkedIn and YouTube', async () => {
  await db.run('DELETE FROM social_comment_timers');
  assert.equal((await api(liPost + '/settings', { policy: automatic }, 'PATCH')).status, 200);
  assert.equal((await api(`/api/social/comments/youtube/${channel}/posts/vid123abc45/settings`, { policy: automatic }, 'PATCH')).status, 200);
  const count = writes.length;
  assert.ok(await pollSocialComments() >= 2);
  await runCommentQueue();
  const automaticWrites = writes.slice(count);
  // LinkedIn: comment 1 already has an account reply and comment 4 is the account's own; comment 3 was answered
  // manually earlier. YouTube: Ugw1 and Ugw2 have deliveries, Ugw3 is the channel's own.
  assert.deepEqual(automaticWrites, []);
  const events = await db.all<{ comment_id: string; state: string }>('SELECT comment_id,state FROM social_comment_events ORDER BY comment_id');
  assert.ok(events.length >= 2);
  assert.ok(events.every(event => event.state === 'done' || event.state === 'review'));

  ytOwnReplies.clear();
  const third = 'urn:li:comment:(urn:li:activity:100,3)';
  await db.run("DELETE FROM social_comment_deliveries WHERE comment_id IN ('Ugw1',?)", [third]);
  await db.run("UPDATE social_comment_events SET state='queued',next_at=0 WHERE comment_id IN ('Ugw1',?)", [third]);
  await db.run('DELETE FROM social_comment_timers');
  await runCommentQueue();
  const bodies = writes.slice(count).map(write => write.body);
  assert.equal(bodies.length, 2);
  assert.ok(bodies.some(body => JSON.stringify(body) === JSON.stringify({ snippet: { parentId: 'Ugw1', textOriginal: 'Yes. This course is online.' } })));
  assert.ok(bodies.some(body => JSON.stringify(body) === JSON.stringify({ accountId: 'zl1', message: 'Yes. This course is online.', commentId: third })));
  const automaticRow = await db.get<{ automatic: number; state: string }>('SELECT automatic,state FROM social_comment_deliveries WHERE comment_id=?', [third]);
  assert.deepEqual(automaticRow, { automatic: 1, state: 'sent' });
});
