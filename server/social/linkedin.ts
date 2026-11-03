import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { blankMetrics, type ConnectorResult, type ObservedPost } from '../types.js';
import { getContent } from '../workspace.js';
import { listAccounts, loadSecret, putAccount, saveSecret } from './store.js';
import { publicMediaUrl, type PreparedMedia } from './media.js';
import { PublicationValidationError } from './publish-providers.js';
import type { PublishInput, PublishJob, PublishResult, SocialAccount } from './types.js';

const endpoint = 'https://zernio.com/api/v1';
const phase = 'linkedin:zernio';
interface RemoteAccount { _id: string; platform: string; platformUserId: string; displayName?: string; username: string; isActive: boolean; needsReconnection?: boolean }
interface Health { accountId: string; platform: string; tokenStatus: { valid: boolean; expiresAt?: string }; permissions: { canPost: boolean; canFetchAnalytics: boolean; posting?: { scope: string; granted: boolean }[]; analytics?: { scope: string; granted: boolean }[]; optional?: { scope: string; granted: boolean }[] } }
class ZernioError extends Error {
  constructor(public code: string, public status = 0, public uncertain = false) { super(`LinkedIn / Zernio: ${code}`); }
}

/** No provider payload or credential is reflected to the browser, including upstream error text. */
async function api(key: string, path: string, body?: unknown, idempotencyKey?: string): Promise<any> {
  let response: Response;
  try {
    response = await fetch(endpoint + path, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(body ? 90_000 : 25_000),
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey! } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new ZernioError('transport_unconfirmed', 0, Boolean(body)); }
  let data: any;
  try { data = await response.json(); } catch { throw new ZernioError('invalid_response', response.status, Boolean(body)); }
  if (!response.ok) {
    // An upstream failure or duplicate may already have created a post. Never retry the write automatically.
    const uncertain = Boolean(body) && (response.status >= 500 || response.status === 409 || data.type === 'platform_error' || Boolean(data.platformError));
    throw new ZernioError(response.status === 403 ? 'permission_required' : response.status === 401 ? 'reconnect_required' : response.status === 429 ? 'rate_limited' : 'request_rejected', response.status, uncertain);
  }
  return data;
}
async function keyFor(credentialId: string) {
  const saved = await loadSecret<{ apiKey: string }>(credentialId);
  if (!saved?.apiKey) throw new ZernioError('api_key_required', 401);
  return saved.apiKey;
}
/** Reuse only an explicitly configured Zernio credential; never assume an environment token is suitable. */
export async function linkedInCredential() {
  const existing = (await listAccounts('linkedin')).find(a => a.credentialSource.startsWith('zernio:linkedin:'));
  if (existing) return existing.credentialSource;
  const dedicated = await db.get<{ id: string }>("SELECT id FROM social_credentials WHERE id LIKE 'zernio:linkedin:%' ORDER BY updated_at DESC LIMIT 1");
  if (dedicated) return dedicated.id;
  return (await db.get<{ credential_id: string }>("SELECT credential_id FROM social_publishing_routes WHERE service='zernio' AND enabled=1 ORDER BY verified_at DESC LIMIT 1"))?.credential_id;
}
const organizationId = (a: RemoteAccount) => /^urn:li:organization:(\d+)$/.exec(a.platformUserId)?.[1];
async function remoteAccounts(key: string): Promise<RemoteAccount[]> {
  const data = await api(key, '/accounts?platform=linkedin');
  if (!Array.isArray(data.accounts)) throw new ZernioError('invalid_accounts');
  return data.accounts.filter((a: RemoteAccount) => a.platform === 'linkedin' && a.isActive === true && !a.needsReconnection && organizationId(a));
}
export async function linkedInCandidates() {
  const credentialId = await linkedInCredential();
  if (!credentialId) return [];
  return (await remoteAccounts(await keyFor(credentialId))).map(a => ({ targetId: a._id, organizationId: organizationId(a)!, name: a.displayName || a.username }));
}
function granted(health: Health) {
  return [...health.permissions.posting || [], ...health.permissions.analytics || [], ...health.permissions.optional || []].filter(s => s.granted).map(s => s.scope);
}
async function verifyTarget(key: string, targetId: string, expectedOrganization: string) {
  const target = (await remoteAccounts(key)).find(a => a._id === targetId && organizationId(a) === expectedOrganization);
  if (!target) throw new ZernioError('organization_identity_changed', 409);
  const health: Health = await api(key, `/accounts/${encodeURIComponent(targetId)}/health`);
  if (health.accountId !== targetId || health.platform !== 'linkedin' || !health.tokenStatus?.valid) throw new ZernioError('reconnect_required', 401);
  return { target, health, scopes: granted(health) };
}

/** Imports a selected, already authorized organization. Does not start OAuth or publish. */
export async function connectLinkedIn(targetId: string, expectedOrganization: string, ownerId: string, newKey?: string) {
  const current = await linkedInCredential(), key = newKey || (current ? await keyFor(current) : '');
  if (!key) throw new ZernioError('api_key_required', 401);
  const { target, health, scopes } = await verifyTarget(key, targetId, expectedOrganization);
  if (!health.permissions.canPost || !scopes.includes('w_organization_social')) throw new ZernioError('organization_publishing_permission_required', 403);
  const id = `linkedin:${expectedOrganization}`;
  if (await db.get("SELECT id FROM social_publish_jobs WHERE account_id=? AND state IN ('processing','unknown','awaiting_user') LIMIT 1", [id])) throw new Error('Resolve the pending LinkedIn publication before changing its connection.');
  // Probe the actual API-key permission, separately from the LinkedIn OAuth scopes.
  let metricsEnabled = false;
  try { await api(key, `/analytics?platform=linkedin&accountId=${encodeURIComponent(targetId)}&limit=1`); metricsEnabled = health.permissions.canFetchAnalytics && scopes.includes('r_organization_social'); }
  catch (error) { if (!(error instanceof ZernioError && error.status === 403)) throw error; }
  const credentialId = newKey ? `zernio:linkedin:${randomUUID()}` : current!;
  if (newKey) await saveSecret(credentialId, { apiKey: newKey, verifiedBy: ownerId });
  const account: SocialAccount = {
    id, provider: 'linkedin', externalId: expectedOrganization, name: target.displayName || target.username, ownerId, scopes,
    metadata: { zernioAccountId: targetId, metricsEnabled, tokenExpiresAt: health.tokenStatus.expiresAt || null, authorizationManagedBy: 'zernio', organizationUrl: `https://www.linkedin.com/company/${expectedOrganization}/` },
    credentialSource: credentialId, status: 'connected', verifiedAt: new Date().toISOString(), lastSyncAt: null, error: null,
  };
  await putAccount(account, true);
  return { id, name: account.name, metricsEnabled };
}

export async function linkedInTokenHealth(a: SocialAccount) {
  const present = Boolean(await loadSecret<{ apiKey: string }>(a.credentialSource).catch(() => undefined));
  return { expiresAt: typeof a.metadata.tokenExpiresAt === 'string' ? a.metadata.tokenExpiresAt : null, refreshEnabled: false, state: present ? 'managed_by_zernio' : 'reconnect_required' };
}
function nativeId(value: unknown): string | undefined {
  return typeof value === 'string' && /^urn:li:(share|ugcPost|activity):\d+$/.test(value) ? value : undefined;
}
function postUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value));
    if (url.protocol === 'https:' && ['www.linkedin.com', 'linkedin.com'].includes(url.hostname) && !url.username && !url.password && (/^\/feed\/update\/urn:li:(share|ugcPost|activity):\d+\/?$/.test(url.pathname) || /^\/posts\/[^/]+_activity-\d+-[^/]+\/?$/.test(url.pathname))) return url.href;
  } catch { /* Not publication proof. */ }
}
export function linkedInResult(data: any, targetId: string, caption?: string): PublishResult {
  const post = data.post;
  const remoteId = typeof post?._id === 'string' ? post._id : typeof data.postId === 'string' ? data.postId : undefined;
  if (!post) return { state: remoteId ? 'processing' : 'unknown', remoteId, phase };
  if (!remoteId) return { state: 'unknown', errorCode: 'remote_handle_missing', phase };
  const entries = post.platforms;
  const entry = Array.isArray(entries) && entries.length === 1 ? entries[0] : undefined;
  if (!entry || entry.platform !== 'linkedin' || String(entry.accountId?._id || entry.accountId) !== targetId || caption !== undefined && post.content !== caption) return { state: 'unknown', remoteId, errorCode: 'publication_identity_mismatch', phase };
  const url = postUrl(entry.platformPostUrl), externalId = nativeId(entry.platformPostId) || nativeId(url ? decodeURIComponent(new URL(url).pathname).split('/')[3] : undefined);
  if (entry.status === 'published' && externalId) return { state: 'published', remoteId, externalId, url, phase };
  if (['failed', 'cancelled'].includes(entry.status) || ['draft', 'pending_approval', 'cancelled', 'failed'].includes(post.status)) return { state: 'unknown', remoteId, errorCode: 'publication_unconfirmed', error: 'Review the existing LinkedIn post in Zernio before retrying.', phase };
  return { state: 'processing', remoteId, phase };
}
export async function submitLinkedIn(a: SocialAccount, input: PublishInput, caption: string, media: PreparedMedia[], job: PublishJob, persist: (result: PublishResult) => Promise<void>): Promise<PublishResult> {
  const key = await keyFor(a.credentialSource), targetId = String(a.metadata.zernioAccountId || '');
  try {
    const { health, scopes } = await verifyTarget(key, targetId, a.externalId);
    if (!health.permissions.canPost || !scopes.includes('w_organization_social')) throw new Error('Organization publishing permission required.');
  } catch { throw new PublicationValidationError('LinkedIn organization identity or publishing permission could not be verified. Reconnect this exact page.'); }
  if (input.mode !== 'direct') throw new PublicationValidationError('LinkedIn supports direct publishing here.');
  try {
    const data = await api(key, '/posts', { content: caption, mediaItems: media.map(m => ({ type: m.type, url: publicMediaUrl(m.id) })), platforms: [{ platform: 'linkedin', accountId: targetId }], publishNow: true }, job.id);
    const result = linkedInResult(data, targetId, caption);
    // Save the handle before any further reads, even if the provider is still processing.
    await persist(result);
    return result;
  } catch (error) {
    if (error instanceof ZernioError && !error.uncertain && error.status >= 400 && error.status < 500) throw new PublicationValidationError(error.message);
    throw error;
  }
}
export async function pollLinkedIn(a: SocialAccount, job: PublishJob): Promise<PublishResult> {
  if (!job.remoteId) return { state: 'unknown', errorCode: 'remote_handle_missing', error: 'Check Zernio before retrying. The original submission may have succeeded.', phase };
  const key = await keyFor(a.credentialSource), targetId = String(a.metadata.zernioAccountId || '');
  await verifyTarget(key, targetId, a.externalId);
  const item = await getContent(job.contentId);
  if (!item) return { state: 'unknown', phase };
  return linkedInResult(await api(key, `/posts/${encodeURIComponent(job.remoteId)}`), targetId, item.captions.linkedin || '');
}
export async function verifyLinkedInEvidence(a: SocialAccount, externalId: string, job: PublishJob) {
  const result = await pollLinkedIn(a, job);
  if (result.state !== 'published' || result.externalId !== externalId) throw new Error('The saved Zernio publication does not verify that LinkedIn post.');
  return result;
}

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function linkedInObserved(row: any, a: SocialAccount): ObservedPost | undefined {
  const targetId = String(a.metadata.zernioAccountId || '');
  const entries = row.platformAnalytics;
  const entry = Array.isArray(entries) ? entries.find((e: any) => e.platform === 'linkedin' && String(e.accountId?._id || e.accountId) === targetId) : undefined;
  if (Array.isArray(entries) ? !entry : row.platform !== 'linkedin' || row.accountId && String(row.accountId?._id || row.accountId) !== targetId) return;
  if ((entry?.status || row.status) !== 'published') return;
  const url = postUrl(entry?.platformPostUrl || row.platformPostUrl);
  const externalId = nativeId(entry?.platformPostId) || nativeId(row.platformPostId) || nativeId(row.postId) || nativeId(url ? decodeURIComponent(new URL(url).pathname).split('/')[3] : undefined);
  if (!externalId || !row.publishedAt || !Number.isFinite(Date.parse(row.publishedAt))) return;
  const type = typeof row.mediaType === 'string' ? row.mediaType : 'post';
  const source = entry || row, raw = source.syncStatus && source.syncStatus !== 'synced' ? {} : source.analytics || {};
  const metrics = { ...blankMetrics(), impressions: number(raw.impressions), reach: number(raw.reach), likes: number(raw.likes), comments: number(raw.comments), shares: number(raw.shares), clicks: number(raw.clicks), views: type === 'video' ? number(raw.views) : null };
  return { platform: 'linkedin', accountId: a.externalId, accountName: a.name, externalId, permalink: url || '', title: String(row.content || ''), publishedAt: new Date(row.publishedAt).toISOString(), contentType: type, thumbnail: typeof row.thumbnailUrl === 'string' ? row.thumbnailUrl : '', metrics };
}
/** External posts exist before the provider has finished computing analytics. Import their metadata separately. */
export function linkedInExternalObserved(row: any, a: SocialAccount) {
  if (row.platform !== 'linkedin') return;
  return linkedInObserved({ ...row, status: 'published', syncStatus: 'pending', platformAnalytics: undefined }, a);
}
export async function syncLinkedIn(a: SocialAccount): Promise<ConnectorResult> {
  try {
    const key = await keyFor(a.credentialSource), targetId = String(a.metadata.zernioAccountId || '');
    const { health, scopes } = await verifyTarget(key, targetId, a.externalId);
    const posts = new Map<string, ObservedPost>();
    let partial = false, metricsEnabled = health.permissions.canFetchAnalytics && scopes.includes('r_organization_social');
    // External post metadata is available before the Analytics endpoint indexes a new connection.
    const fromDate = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    for (let page = 1; page <= 20; page++) {
      const data = await api(key, `/posts?source=external&platform=linkedin&accountId=${encodeURIComponent(targetId)}&fromDate=${fromDate}&limit=50&page=${page}`);
      if (!Array.isArray(data.posts)) throw new ZernioError('invalid_external_posts_response');
      for (const row of data.posts) { const post = linkedInExternalObserved(row, a); if (post) posts.set(post.externalId, post); }
      const totalPages = Number(data.pagination?.pages ?? data.pagination?.totalPages);
      if (data.posts.length < 50 || totalPages > 0 && page >= totalPages) break;
      if (page === 20) partial = true;
    }
    const measured = new Set<string>();
    // Bound each collection to 1,000 posts / 90 days. Nothing is downloaded; media remains a remote link.
    if (metricsEnabled) {
      try {
        for (let page = 1; page <= 20; page++) {
          const data = await api(key, `/analytics?platform=linkedin&accountId=${encodeURIComponent(targetId)}&source=all&limit=50&page=${page}`);
          if (!Array.isArray(data.posts)) throw new ZernioError('invalid_analytics_response');
          for (const row of data.posts) { const post = linkedInObserved(row, a); if (post) { posts.set(post.externalId, post); if (Object.values(post.metrics).some(v => v !== null)) measured.add(post.externalId); } if ((row.syncStatus && row.syncStatus !== 'synced') || row.platformAnalytics?.some((e: any) => e.platform === 'linkedin' && String(e.accountId?._id || e.accountId) === targetId && e.syncStatus && e.syncStatus !== 'synced')) partial = true; }
          const totalPages = Number(data.pagination?.pages ?? data.pagination?.totalPages);
          if (data.posts.length < 50 || totalPages > 0 && page >= totalPages) break;
          if (page === 20) partial = true;
        }
      } catch (error) {
        if (!(error instanceof ZernioError && error.status === 403)) throw error;
        metricsEnabled = false;
      }
    }
    if ([...posts.keys()].some(id => !measured.has(id))) partial = true;
    await putAccount({ ...a, scopes, status: 'connected', metadata: { ...a.metadata, metricsEnabled, tokenExpiresAt: health.tokenStatus.expiresAt || null }, lastSyncAt: new Date().toISOString(), error: null });
    return { platform: 'linkedin', status: 'connected', partial: partial || !metricsEnabled, message: metricsEnabled ? `LinkedIn via Zernio: ${posts.size} posts in the last 90 days. New connections may need time for Zernio to collect history and metrics.` : 'LinkedIn publishing is connected. Analytics requires the Zernio API-key Analytics group and organization read permission.', posts: [...posts.values()] };
  } catch {
    await putAccount({ ...a, status: 'sync_failed', error: 'LinkedIn sync could not be verified. Check the selected organization, Zernio key permissions and connection health.' });
    return { platform: 'linkedin', status: 'error', message: 'LinkedIn sync could not be verified. Check Zernio permissions and connection health.', posts: [] };
  }
}
