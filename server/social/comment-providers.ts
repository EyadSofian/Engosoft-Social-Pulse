import { db } from '../db.js';
import type { CommentPlatform, CommentSetup } from '../../src/domain/social-comments.js';
import { commentToken, grantFor, isFacebookPostParent, listMetaComments, metaId, readMetaComment, readOwnedMetaPost, sendMetaPostComment, sendMetaReply } from './comment-meta.js';
import { accessToken } from './credentials.js';
import { headers, ProviderError } from './http.js';
import { loadSecret } from './store.js';
import type { SocialAccount } from './types.js';

/**
 * One adapter per platform. The queue, policies, deduplication and the browser API in comments.ts
 * stay platform-neutral; every provider call goes through the adapter for the account's platform.
 */
export interface ProviderComment {
  id: string; text: string; author: string; createdAt: string;
  knownAuthor: boolean; own: boolean; canReply: boolean; replyCount: number | null;
}
export type ThreadStatus = 'answered' | 'unanswered' | 'unknown';
/** `token` is sent to the provider. `identity` changes only when the account is re-authorized or re-linked. */
export interface CommentSession { token: string; identity: string }
export interface CommentPageResult { comments: ProviderComment[]; next: string | null }

export interface CommentAdapter {
  setup: CommentSetup;
  /** True when the top-level listing is newest first, so a scan can stop at the first old comment. */
  newestFirst: boolean;
  validAccount(id: string): boolean;
  validPost(id: string): boolean;
  validComment(id: string): boolean;
  authorized(a: SocialAccount): Promise<boolean>;
  session(a: SocialAccount): Promise<CommentSession>;
  list(a: SocialAccount, s: CommentSession, postId: string, parent?: string, cursor?: string): Promise<CommentPageResult>;
  /** Reads one comment and reports whether it is a top-level comment on `postId`. */
  read(a: SocialAccount, s: CommentSession, postId: string, commentId: string): Promise<ProviderComment & { topLevel: boolean }>;
  thread(a: SocialAccount, s: CommentSession, postId: string, commentId: string): Promise<ThreadStatus>;
  /** The post text when the account owns the post, otherwise undefined. */
  caption(a: SocialAccount, s: CommentSession, postId: string): Promise<string | undefined>;
  reply(a: SocialAccount, s: CommentSession, postId: string, commentId: string, message: string, key: string): Promise<string>;
  comment(a: SocialAccount, s: CommentSession, postId: string, message: string, key: string): Promise<string>;
}

const safeId = (value: unknown, max = 300): value is string => typeof value === 'string' && value.length <= max && /^[\w:(),.=-]+$/.test(value);
const pages = 5;

// ---------------------------------------------------------------- Meta (Graph API, own comment grant)

const meta: CommentAdapter = {
  setup: 'meta',
  // Facebook asks for reverse chronological order. Instagram does not take an order parameter, so the scan
  // treats both as unordered and stops only when a whole page is older than the activation time.
  newestFirst: false,
  validAccount: metaId, validPost: metaId, validComment: metaId,
  authorized: async a => Boolean(await grantFor(a)),
  session: async a => { const token = await commentToken(a); return { token, identity: token }; },
  list: (a, s, postId, parent, cursor) => listMetaComments(a, s.token, parent ?? postId, cursor, Boolean(parent)),
  async read(a, s, postId, commentId) {
    const comment = await readMetaComment(a, s.token, commentId);
    const topLevel = a.provider === 'instagram' ? !comment.parentId && comment.mediaId === postId
      : !comment.parentId || isFacebookPostParent(comment.parentId, postId);
    return { ...comment, topLevel };
  },
  async thread(a, s, _postId, commentId) {
    let after: string | undefined;
    for (let page = 0; page < 4; page++) {
      const replies = await listMetaComments(a, s.token, commentId, after, true);
      if (replies.comments.some(reply => reply.own)) return 'answered';
      if (replies.comments.some(reply => !reply.knownAuthor)) return 'unknown';
      if (!replies.next) return 'unanswered';
      after = replies.next;
    }
    return 'unknown';
  },
  caption: (a, s, postId) => readOwnedMetaPost(a, s.token, postId),
  reply: (a, s, _postId, commentId, message) => sendMetaReply(a, s.token, commentId, message),
  comment: (_a, s, postId, message) => sendMetaPostComment(s.token, postId, message),
};

// ---------------------------------------------------------------- Zernio Inbox (LinkedIn, TikTok)

const zernioEndpoint = 'https://zernio.com/api/v1';
interface ZernioComment {
  id?: unknown; message?: string; text?: string; createdTime?: string;
  from?: { id?: string; name?: string; username?: string; isOwner?: boolean };
  replyCount?: number; canReply?: boolean; isHidden?: boolean; replies?: ZernioComment[];
}

/** Provider text is never forwarded to the browser; only a stable code is kept. */
async function zernio(key: string, path: string, body?: Record<string, unknown>, idempotencyKey?: string) {
  let response: Response;
  try {
    response = await fetch(zernioEndpoint + path, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(body ? 60_000 : 25_000),
      headers: { ...headers(key), ...(body ? { 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new ProviderError(0, 'transport_error'); }
  const data = await response.json().catch(() => ({})) as Record<string, any>;
  if (response.ok) return data;
  const detail = `${data.code ?? ''} ${data.error?.code ?? ''} ${typeof data.error === 'string' ? data.error : data.error?.message ?? ''} ${data.message ?? ''}`;
  const retryAfter = Math.min(3600, Math.max(0, Number(response.headers.get('retry-after')) || 0));
  if (response.status === 429) throw new ProviderError(429, 'rate_limit_exceeded', true, retryAfter);
  if (response.status === 403 && /inbox/i.test(detail)) throw new ProviderError(403, 'inbox_addon_required');
  if (/PLATFORM_LIMITATION/i.test(detail)) throw new ProviderError(409, 'platform_limitation');
  if (response.status === 401 || response.status === 403) throw new ProviderError(response.status, 'comment_reconnect');
  if (response.status === 404) throw new ProviderError(404, 'comment_not_found');
  // A failed write may still have reached the platform. Callers treat 0 and 5xx as unconfirmed.
  throw new ProviderError(response.status, 'request_failed');
}

interface ZernioTarget { key: string; target: string; credential: string }
async function zernioTarget(a: SocialAccount): Promise<ZernioTarget | undefined> {
  if (a.provider === 'linkedin') {
    const target = String(a.metadata.zernioAccountId || '');
    if (!a.credentialSource.startsWith('zernio:') || !safeId(target, 100)) return;
    const saved = await loadSecret<{ apiKey: string }>(a.credentialSource);
    return saved?.apiKey ? { key: saved.apiKey, target, credential: a.credentialSource } : undefined;
  }
  const route = await db.get<{ target_id: string; credential_id: string }>(
    "SELECT target_id,credential_id FROM social_publishing_routes WHERE account_id=? AND service='zernio' AND enabled=1", [a.id]);
  if (!route || !safeId(route.target_id, 100)) return;
  const saved = await loadSecret<{ apiKey: string }>(route.credential_id);
  return saved?.apiKey ? { key: saved.apiKey, target: route.target_id, credential: route.credential_id } : undefined;
}

function zernioAdapter(setup: 'zernio_linkedin' | 'zernio_tiktok', validPost: (id: string) => boolean, nativeReplies: boolean): CommentAdapter {
  const normalize = (row: ZernioComment): ProviderComment => {
    const id = typeof row.id === 'number' ? String(row.id) : row.id;
    if (!safeId(id)) throw new ProviderError(502, 'invalid_comment_id');
    return {
      id, text: row.message ?? row.text ?? '', author: row.from?.name || row.from?.username || '',
      createdAt: row.createdTime ?? '', knownAuthor: Boolean(row.from?.id || row.from?.username),
      own: row.from?.isOwner === true, canReply: row.canReply !== false && row.isHidden !== true,
      replyCount: typeof row.replyCount === 'number' ? row.replyCount : null,
    };
  };
  const target = async (s: CommentSession) => {
    const [credential, ...rest] = s.identity.split('|');
    return { credential, target: rest.join('|') };
  };
  const page = async (s: CommentSession, postId: string, extra: Record<string, string> = {}) => {
    const { target: accountId } = await target(s);
    const data = await zernio(s.token, `/inbox/comments/${encodeURIComponent(postId)}?${new URLSearchParams({ accountId, limit: '25', ...extra })}`);
    if (!Array.isArray(data.comments)) throw new ProviderError(502, 'invalid_comment_page');
    const next = data.pagination?.hasMore === true && typeof data.pagination.cursor === 'string' ? data.pagination.cursor : null;
    return { rows: data.comments as ZernioComment[], next };
  };
  /** Zernio has no single-comment read for every platform, so a comment is found in the post's top-level listing. */
  const find = async (s: CommentSession, postId: string, commentId: string) => {
    let cursor: string | undefined;
    for (let i = 0; i < pages; i++) {
      const result = await page(s, postId, cursor ? { cursor } : {});
      const row = result.rows.find(item => String(item.id) === commentId);
      if (row) return row;
      if (!result.next) return;
      cursor = result.next;
    }
  };
  const write = async (s: CommentSession, postId: string, message: string, key: string, commentId?: string) => {
    const { target: accountId } = await target(s);
    const data = await zernio(s.token, `/inbox/comments/${encodeURIComponent(postId)}`, { accountId, message, ...(commentId ? { commentId } : {}) }, key);
    const id = data.data?.commentId ?? data.commentId;
    if (!safeId(typeof id === 'number' ? String(id) : id)) throw new ProviderError(0, 'missing_reply_id');
    return String(id);
  };
  return {
    setup, newestFirst: false, validPost,
    validAccount: id => safeId(id, 200), validComment: id => safeId(id),
    authorized: async a => Boolean(await zernioTarget(a)),
    async session(a) {
      const found = await zernioTarget(a);
      if (!found) throw new ProviderError(403, 'comment_reconnect');
      return { token: found.key, identity: `${found.credential}|${found.target}` };
    },
    async list(_a, s, postId, parent, cursor) {
      if (!parent) {
        const result = await page(s, postId, cursor ? { cursor } : {});
        return { comments: result.rows.map(normalize), next: result.next };
      }
      if (nativeReplies) {
        const result = await page(s, postId, { commentId: parent, ...(cursor ? { cursor } : {}) });
        return { comments: result.rows.map(normalize), next: result.next };
      }
      const row = await find(s, postId, parent);
      return { comments: (row?.replies ?? []).map(normalize), next: null };
    },
    async read(_a, s, postId, commentId) {
      const row = await find(s, postId, commentId);
      if (!row) throw new ProviderError(404, 'comment_not_found');
      return { ...normalize(row), topLevel: true };
    },
    async thread(_a, s, postId, commentId) {
      const row = await find(s, postId, commentId);
      if (!row) return 'unknown';
      const replies = (row.replies ?? []).map(normalize);
      if (replies.some(reply => reply.own)) return 'answered';
      if (replies.some(reply => !reply.knownAuthor)) return 'unknown';
      const total = typeof row.replyCount === 'number' ? row.replyCount : null;
      if (total === 0 || (total !== null && replies.length >= total)) return 'unanswered';
      if (!nativeReplies) return 'unknown';
      let cursor: string | undefined;
      for (let i = 0; i < 4; i++) {
        const result = await page(s, postId, { commentId, ...(cursor ? { cursor } : {}) });
        const rows = result.rows.map(normalize);
        if (rows.some(reply => reply.own)) return 'answered';
        if (rows.some(reply => !reply.knownAuthor)) return 'unknown';
        if (!result.next) return 'unanswered';
        cursor = result.next;
      }
      return 'unknown';
    },
    // Zernio scopes every call to the connected account, and the post comes from that account's own sync.
    caption: async (a, _s, postId) => (await db.get<{ title: string }>(
      'SELECT title FROM observed_posts WHERE platform=? AND account_id=? AND external_id=?', [a.provider, a.externalId, postId]))?.title,
    reply: (_a, s, postId, commentId, message, key) => write(s, postId, message, key, commentId),
    comment: (_a, s, postId, message, key) => write(s, postId, message, key),
  };
}

// ---------------------------------------------------------------- YouTube Data API (own Google consent)

export const YOUTUBE_COMMENT_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
const youtubeBase = 'https://www.googleapis.com/youtube/v3/';
interface YouTubeSnippet { textDisplay?: string; authorDisplayName?: string; authorChannelId?: { value?: string }; publishedAt?: string; parentId?: string }
interface YouTubeThread { id?: string; snippet?: { videoId?: string; canReply?: boolean; totalReplyCount?: number; topLevelComment?: { id?: string; snippet?: YouTubeSnippet } } }

async function youtube(token: string, path: string, params: Record<string, string>, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`${youtubeBase}${path}?${new URLSearchParams(params)}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { ...headers(token), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new ProviderError(0, 'transport_error'); }
  const data = await response.json().catch(() => ({})) as Record<string, any>;
  if (response.ok) return data;
  const reason = String(data.error?.errors?.[0]?.reason ?? '');
  // The daily quota resets at midnight Pacific time; pause the account for an hour rather than retrying.
  if (reason === 'quotaExceeded') throw new ProviderError(429, 'rate_limit_exceeded', false, 3600);
  if (response.status === 429 || /rateLimitExceeded/.test(reason)) throw new ProviderError(429, 'rate_limit_exceeded', true, 60);
  if (reason === 'commentsDisabled') throw new ProviderError(409, 'comments_disabled');
  if (response.status === 401 || response.status === 403) throw new ProviderError(response.status, 'comment_reconnect');
  if (response.status === 404) throw new ProviderError(404, 'comment_not_found');
  throw new ProviderError(response.status, 'request_failed');
}

function youtubeComment(a: SocialAccount, id: unknown, snippet: YouTubeSnippet | undefined, canReply: boolean, replyCount: number | null): ProviderComment {
  if (!safeId(id, 200)) throw new ProviderError(502, 'invalid_comment_id');
  const author = snippet?.authorChannelId?.value;
  return {
    id, text: snippet?.textDisplay ?? '', author: snippet?.authorDisplayName ?? '', createdAt: snippet?.publishedAt ?? '',
    knownAuthor: Boolean(author), own: author === a.externalId, canReply, replyCount,
  };
}
const fromThread = (a: SocialAccount, thread: YouTubeThread) => youtubeComment(a, thread.snippet?.topLevelComment?.id ?? thread.id,
  thread.snippet?.topLevelComment?.snippet, thread.snippet?.canReply !== false, thread.snippet?.totalReplyCount ?? null);

const youtubeAdapter: CommentAdapter = {
  setup: 'youtube', newestFirst: true,
  validAccount: id => /^[\w-]{1,64}$/.test(id), validPost: id => /^[\w-]{6,20}$/.test(id), validComment: id => safeId(id, 200),
  authorized: async a => a.credentialSource.startsWith('oauth:') && a.scopes.includes(YOUTUBE_COMMENT_SCOPE),
  async session(a) {
    if (!await youtubeAdapter.authorized(a)) throw new ProviderError(403, 'comment_reconnect');
    return { token: await accessToken(a), identity: a.credentialSource };
  },
  async list(a, s, postId, parent, cursor) {
    const common = { part: 'snippet', maxResults: '25', textFormat: 'plainText', ...(cursor ? { pageToken: cursor } : {}) };
    const data = parent ? await youtube(s.token, 'comments', { ...common, parentId: parent })
      : await youtube(s.token, 'commentThreads', { ...common, videoId: postId, order: 'time' });
    if (!Array.isArray(data.items)) throw new ProviderError(502, 'invalid_comment_page');
    const comments = parent ? data.items.map((row: { id?: string; snippet?: YouTubeSnippet }) => youtubeComment(a, row.id, row.snippet, false, 0))
      : data.items.map((row: YouTubeThread) => fromThread(a, row));
    return { comments, next: typeof data.nextPageToken === 'string' ? data.nextPageToken : null };
  },
  async read(a, s, postId, commentId) {
    const data = await youtube(s.token, 'commentThreads', { part: 'snippet', id: commentId, textFormat: 'plainText' });
    const thread = Array.isArray(data.items) ? data.items[0] as YouTubeThread | undefined : undefined;
    if (!thread) throw new ProviderError(404, 'comment_not_found');
    const comment = fromThread(a, thread);
    if (comment.id !== commentId) throw new ProviderError(502, 'comment_identity_mismatch');
    return { ...comment, topLevel: thread.snippet?.videoId === postId };
  },
  async thread(a, s, postId, commentId) {
    let cursor: string | undefined;
    for (let i = 0; i < 4; i++) {
      const replies = await youtubeAdapter.list(a, s, postId, commentId, cursor);
      if (replies.comments.some(reply => reply.own)) return 'answered';
      if (replies.comments.some(reply => !reply.knownAuthor)) return 'unknown';
      if (!replies.next) return 'unanswered';
      cursor = replies.next;
    }
    return 'unknown';
  },
  async caption(a, s, postId) {
    const data = await youtube(s.token, 'videos', { part: 'snippet', id: postId });
    const video = Array.isArray(data.items) ? data.items[0] : undefined;
    if (video?.id !== postId || video.snippet?.channelId !== a.externalId) return;
    return [video.snippet.title, video.snippet.description].filter(Boolean).join('\n');
  },
  async reply(_a, s, _postId, commentId, message) {
    const data = await youtube(s.token, 'comments', { part: 'snippet' }, { snippet: { parentId: commentId, textOriginal: message } });
    if (!safeId(data.id, 200)) throw new ProviderError(0, 'missing_reply_id');
    return data.id;
  },
  async comment(a, s, postId, message) {
    const data = await youtube(s.token, 'commentThreads', { part: 'snippet' },
      { snippet: { channelId: a.externalId, videoId: postId, topLevelComment: { snippet: { textOriginal: message } } } });
    if (!safeId(data.id, 200)) throw new ProviderError(0, 'missing_reply_id');
    return data.id;
  },
};

const adapters: Record<CommentPlatform, CommentAdapter> = {
  facebook: meta,
  instagram: meta,
  // Zernio reads LinkedIn comments on share and ugcPost URNs. Bare activity IDs return nothing.
  linkedin: zernioAdapter('zernio_linkedin', id => /^urn:li:(share|ugcPost):\d{1,30}$/.test(id), false),
  tiktok: zernioAdapter('zernio_tiktok', id => /^\d{1,30}$/.test(id), true),
  youtube: youtubeAdapter,
};
export const commentAdapter = (platform: CommentPlatform) => adapters[platform];
