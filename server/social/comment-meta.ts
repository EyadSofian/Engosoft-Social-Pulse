import { randomUUID } from 'node:crypto';
import type { CommentPlatform } from '../../src/domain/social-comments.js';
import { db, defineSchema } from '../db.js';
import { graphBase, graphRead, metaPages } from './accounts.js';
import { metaCommentApp } from './credentials.js';
import { headers, request, ProviderError } from './http.js';
import { accountId, listAccounts, loadSecret, saveSecret } from './store.js';
import type { Credential, SocialAccount } from './types.js';

defineSchema(`CREATE TABLE IF NOT EXISTS social_comment_grants (
 account_id TEXT PRIMARY KEY, credential_id TEXT NOT NULL, expires_at INTEGER NOT NULL, authorized_at INTEGER NOT NULL
)`);

export const metaId = (value: unknown): value is string => typeof value === 'string' && /^\d+(?:_\d+)?$/.test(value) && value.length <= 100;
export const isFacebookPostParent = (parent: string, post: string) => parent === post || (post.includes('_') && parent === post.split('_')[1]);
const commentScopes = {
  facebook: ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content', 'pages_manage_engagement'],
  instagram: ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_manage_comments'],
};
export const commentOAuthScopes = (platform: CommentPlatform) => [...commentScopes[platform], 'pages_manage_metadata'];

export async function saveCommentGrants(platform: CommentPlatform, token: Credential) {
  const appId = metaCommentApp().client;
  if (!appId) throw new Error('Meta comment app is not configured.');
  const { scopes, pages } = await metaPages(token.accessToken);
  if (!commentScopes[platform].every(scope => scopes.includes(scope))) throw new Error('Comment permissions were not granted.');
  const linked = new Set((await listAccounts(platform)).filter(a => a.verifiedAt && a.status !== 'disconnected').map(a => a.id));
  let count = 0;
  for (const page of pages) {
    const externalId = platform === 'facebook' ? page.id : page.instagram_business_account?.id;
    if (!metaId(externalId) || !metaId(page.id) || !page.access_token) continue;
    const id = accountId(platform, externalId);
    if (!linked.has(id)) continue;
    if (platform === 'facebook' && !page.tasks?.some((task: string) => ['MODERATE', 'MODERATE_COMMUNITY', 'PROFILE_PLUS_MODERATE', 'PROFILE_PLUS_MODERATE_DELEGATE_COMMUNITY', 'PROFILE_PLUS_FULL_CONTROL'].includes(task))) continue;
    const secret = `meta:comments:${randomUUID()}`;
    await saveSecret(secret, { accessToken: page.access_token, expiresAt: token.expiresAt, scopes, pageId: page.id, appId });
    await db.run(`INSERT INTO social_comment_grants (account_id,credential_id,expires_at,authorized_at) VALUES (?,?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET credential_id=excluded.credential_id,expires_at=excluded.expires_at,authorized_at=excluded.authorized_at`,
    [id, secret, token.expiresAt, Date.now()]);
    count++;
  }
  if (!count) throw new Error('None of the authorized accounts are connected for comments.');
}

export const grantFor = (a: SocialAccount) => db.get<{credential_id: string; expires_at: number}>(
  'SELECT credential_id,expires_at FROM social_comment_grants WHERE account_id=? AND (expires_at=0 OR expires_at>?)', [a.id, Date.now()],
);
async function commentGrant(a: SocialAccount) {
  if (!a.verifiedAt || a.status === 'disconnected' || a.status === 'authorization_required') throw new ProviderError(403, 'comment_reconnect');
  const grant = await grantFor(a);
  const token = grant && await loadSecret<Credential & { pageId: string; appId: string }>(grant.credential_id);
  if (!token?.accessToken || token.appId !== metaCommentApp().client) throw new ProviderError(403, 'comment_reconnect');
  return token;
}
export const commentToken = async (a: SocialAccount) => (await commentGrant(a)).accessToken;

async function commentSubscription(a: SocialAccount) {
  const grant = await commentGrant(a);
  const app = metaCommentApp().client;
  if (!app || !metaId(grant.pageId) || !grant.scopes.includes('pages_manage_metadata')) throw new ProviderError(403, 'comment_reconnect');
  const result = await graphRead(`${grant.pageId}/subscribed_apps`, grant.accessToken, { limit: '100' });
  if (!Array.isArray(result.data)) throw new ProviderError(502, 'comment_subscription_unavailable');
  const subscription = result.data.find((row: { id?: string }) => row?.id === app);
  if ((subscription && !Array.isArray(subscription.subscribed_fields)) || (!subscription && result.paging?.next)) {
    throw new ProviderError(502, 'comment_subscription_fields_unavailable');
  }
  const fields: string[] = (subscription?.subscribed_fields ?? []).filter((field: unknown) => typeof field === 'string');
  return { fields, pageId: grant.pageId, token: grant.accessToken };
}
export const hasCommentSubscription = async (a: SocialAccount) => (await commentSubscription(a)).fields.includes('feed');

export async function subscribeCommentPage(a: SocialAccount) {
  const { fields, pageId, token } = await commentSubscription(a);
  if (fields.includes('feed')) return;
  const result = await graphWrite(`${pageId}/subscribed_apps`, token, { subscribed_fields: [...fields, 'feed'].join(',') });
  if (result.success !== true) throw new ProviderError(502, 'comment_subscription_unconfirmed');
}


interface MetaComment {
  id?: string; text?: string; message?: string; created_time?: string; timestamp?: string;
  from?: { id?: string; username?: string; name?: string }; username?: string; user?: { id?: string }; can_comment?: boolean;
  hidden?: boolean; is_hidden?: boolean; parent_id?: string; parent?: { id?: string }; media?: { id?: string };
  comment_count?: number;
}
const fields = (a: SocialAccount) => a.provider === 'facebook'
  ? 'id,message,from,created_time,can_comment,is_hidden,comment_count,parent{id}'
  : 'id,text,from,username,user,timestamp,hidden,parent_id,media{id}';

function normalize(a: SocialAccount, row: MetaComment) {
  if (!metaId(row.id)) throw new ProviderError(502, 'invalid_comment_id');
  const username = row.from?.username || row.username;
  const authorId = row.user?.id || row.from?.id;
  return {
    id: row.id, text: row.message ?? row.text ?? '', author: row.from?.name ?? username ?? '',
    createdAt: row.created_time ?? row.timestamp ?? '', knownAuthor: Boolean(authorId || username),
    own: authorId === a.externalId || (a.provider === 'instagram' && Boolean(username) && username!.toLowerCase() === a.name.toLowerCase()),
    canReply: row.can_comment !== false && !row.is_hidden && !row.hidden, replyCount: row.comment_count ?? null,
    parentId: row.parent?.id ?? row.parent_id, mediaId: row.media?.id,
  };
}

export async function listMetaComments(a: SocialAccount, token: string, id: string, after?: string, replies = false) {
  const edge = a.provider === 'instagram' && replies ? 'replies' : 'comments';
  const page = await graphRead(`${id}/${edge}`, token, {
    fields: fields(a), limit: '25', ...(after ? { after } : {}),
    ...(a.provider === 'facebook' && !replies ? { filter: 'toplevel', order: 'reverse_chronological' } : {}),
  });
  if (!Array.isArray(page.data)) throw new ProviderError(502, 'invalid_comment_page');
  const next = page.paging?.next && page.paging?.cursors?.after;
  return { comments: (page.data as MetaComment[]).map(row => normalize(a, row)), next: typeof next === 'string' ? next : null };
}

export async function readMetaComment(a: SocialAccount, token: string, id: string) {
  const row = await graphRead(id, token, { fields: fields(a) });
  const comment = normalize(a, row);
  if (comment.id !== id) throw new ProviderError(502, 'comment_identity_mismatch');
  return comment;
}

export async function readOwnedMetaPost(a: SocialAccount, token: string, postId: string) {
  const post = await graphRead(postId, token, { fields: a.provider === 'facebook' ? 'id,from{id},message,is_published' : 'id,owner{id},caption,media_product_type' });
  if (post.id !== postId) return;
  if (a.provider === 'facebook' && post.from?.id === a.externalId && post.is_published === true) return String(post.message ?? '');
  if (a.provider === 'instagram' && post.owner?.id === a.externalId && ['FEED', 'REELS'].includes(post.media_product_type)) return String(post.caption ?? '');
}

const graphWrite = (path: string, token: string, values: Record<string, string>) =>
  request(`${graphBase()}/${path}`, { method: 'POST', headers: headers(token), body: new URLSearchParams(values) });

export async function sendMetaReply(a: SocialAccount, token: string, id: string, message: string) {
  const edge = a.provider === 'facebook' ? 'comments' : 'replies';
  const result = await graphWrite(`${id}/${edge}`, token, { message });
  if (!metaId(result.id)) throw new ProviderError(0, 'missing_reply_id');
  return result.id;
}
