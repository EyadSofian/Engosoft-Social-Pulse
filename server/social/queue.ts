/**
 * The simple publishing flow: an approved post goes to the chosen Facebook Pages and Instagram accounts now,
 * or at its calendar time. Each publication still runs through `publish`, so approval, consent, duplicate
 * protection and published-evidence rules are the same as the full publish panel. TikTok, YouTube and
 * Snapchat keep their own options and stay on the post page.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { getUser, userCan, type AuthUser } from '../auth.js';
import { canSee, getContent, transition, WorkspaceError, type StoredContent } from '../workspace.js';
import { capabilities } from './capabilities.js';
import { contentMedia } from './media.js';
import { publish, recentJobs } from './publishing.js';
import { contentQueue, getAccount, listAccounts, toQueued, type QueuedPublication } from './store.js';
import type { PublishJob, SocialAccount, SocialProvider } from './types.js';

/** Platforms whose publishing needs no extra per-post choices. */
export const AUTO_PROVIDERS: SocialProvider[] = ['facebook', 'instagram'];
/** A publication missed by more than this (the server was down) waits for a person instead of going out late. */
const LATE_LIMIT_MS = 6 * 3600_000;

export interface PublishTarget { accountId: string; provider: SocialProvider; name: string; ready: boolean; reason: string | null; kind: QueuedPublication['kind'] | null }

/** What one account would publish for this post, or why it cannot. */
async function plan(item: StoredContent, account: SocialAccount): Promise<Omit<PublishTarget, 'accountId' | 'provider' | 'name'> & { media: { url: string }[] }> {
  const no = (reason: string) => ({ ready: false, reason, kind: null, media: [] });
  if (!AUTO_PROVIDERS.includes(account.provider)) return no('advanced');
  if (account.status !== 'connected') return no('disconnected');
  const video = (await contentMedia(item.id)).find((m) => m.type === 'video');
  const choice = video ? { kind: 'video' as const, media: [{ url: video.url }] }
    : item.creative?.imageUrl ? { kind: 'image' as const, media: [{ url: item.creative.imageUrl }] }
    : account.provider === 'facebook' && item.captions.facebook?.trim() ? { kind: 'text' as const, media: [] }
    : null;
  if (!choice) return no('no_media');
  if (capabilities(account.provider, account)[`publish_${choice.kind}`] !== 'available') return no('authorization');
  return { ready: true, reason: null, ...choice };
}

/** Connected accounts for the post's platforms, with whether each can publish it from here. */
export async function publishTargets(item: StoredContent): Promise<PublishTarget[]> {
  const accounts = (await listAccounts()).filter((a) => a.status !== 'disconnected' && item.channels.includes(a.provider));
  return Promise.all(accounts.map(async (a) => {
    const { media: _media, ...result } = await plan(item, a);
    return { accountId: a.id, provider: a.provider, name: a.name, ...result };
  }));
}

async function readyTargets(item: StoredContent, accountIds: string[]) {
  if (!accountIds.length) throw new WorkspaceError(400, 'اختر حسابًا واحدًا على الأقل.');
  const targets = [];
  for (const id of new Set(accountIds)) {
    const account = await getAccount(id);
    if (!account || !item.channels.includes(account.provider)) throw new WorkspaceError(400, 'الحساب غير مربوط أو ليس من منصات هذا المنشور.');
    const result = await plan(item, account);
    if (!result.ready) throw new WorkspaceError(409, `لا يمكن النشر على ${account.name} من هنا الآن.`);
    targets.push({ account, ...result });
  }
  return targets;
}

/** Publishes an approved post to the chosen accounts right away. Each account reports its own result. */
export async function publishNow(user: AuthUser, contentId: string, accountIds: string[]) {
  if (!userCan(user, 'content.publish')) throw new WorkspaceError(403, 'لا تملك صلاحية النشر.');
  const item = await getContent(contentId);
  if (!item || !canSee(user, item)) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  if (!['approved', 'scheduled'].includes(item.status)) throw new WorkspaceError(409, 'يُنشر المحتوى المعتمد فقط.');
  const targets = await readyTargets(item, accountIds);
  const results: { accountId: string; job?: PublishJob; error?: string }[] = [];
  for (const target of targets) {
    try {
      const job = await publish(user, { contentId, accountId: target.account.id, kind: target.kind!, media: target.media as never, mode: 'direct', consent: true });
      // Sent by hand: a waiting automatic publication to the same account has nothing left to do.
      await db.run("UPDATE social_publish_queue SET state='cancelled', error=?, job_id=?, updated_at=? WHERE content_id=? AND account_id=? AND state='queued'", ['Published manually.', job.id, new Date().toISOString(), contentId, target.account.id]);
      results.push({ accountId: target.account.id, job });
    }
    catch (error) { results.push({ accountId: target.account.id, error: error instanceof Error ? error.message : 'تعذّر النشر.' }); }
  }
  return results;
}

/**
 * Puts an approved post on the calendar at `at` and queues its automatic publication to the chosen accounts.
 * Choosing again replaces the waiting set; a post already scheduled moves to the new time.
 */
export async function schedulePublication(user: AuthUser, contentId: string, accountIds: string[], at: string) {
  if (!userCan(user, 'content.publish') || !userCan(user, 'content.schedule')) throw new WorkspaceError(403, 'الجدولة التلقائية تحتاج صلاحيتي الجدولة والنشر.');
  let item = await getContent(contentId);
  if (!item || !canSee(user, item)) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  if (!['approved', 'scheduled'].includes(item.status)) throw new WorkspaceError(409, 'تُجدول المنشورات المعتمدة فقط.');
  const targets = await readyTargets(item, accountIds);
  if (item.status === 'approved' || item.scheduledAt !== new Date(at).toISOString()) item = await transition(user, contentId, 'scheduled', { scheduledAt: at });
  const now = new Date().toISOString();
  await db.tx(async (tx) => {
    await tx.run("UPDATE social_publish_queue SET state='cancelled', error=?, updated_at=? WHERE content_id=? AND state='queued'", ['Replaced by a new choice of accounts.', now, contentId]);
    for (const target of targets) {
      await tx.run('INSERT INTO social_publish_queue (id,content_id,account_id,kind,media_json,publish_at,state,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [randomUUID(), contentId, target.account.id, target.kind, JSON.stringify(target.media), item!.scheduledAt, 'queued', user.id, now, now]);
    }
  });
  return contentQueue(contentId);
}

/** Stops the automatic publication; the post stays on the calendar for manual publishing. */
export async function cancelPublication(user: AuthUser, contentId: string) {
  if (!userCan(user, 'content.schedule')) throw new WorkspaceError(403, 'لا تملك صلاحية تعديل الجدولة.');
  const item = await getContent(contentId);
  if (!item || !canSee(user, item)) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  await db.run("UPDATE social_publish_queue SET state='cancelled', error=?, updated_at=? WHERE content_id=? AND state='queued'", [`Cancelled by ${user.name}.`, new Date().toISOString(), contentId]);
  return contentQueue(contentId);
}

/**
 * Sends every publication whose time has come. Rows are claimed with compare-and-set, so two server
 * processes never send the same row; `publish` itself refuses a second write to the same account.
 * The person who scheduled it must still be active and allowed to publish, and the post must still be
 * scheduled (approval withdrawn or rescheduled posts were already cancelled or moved).
 */
export async function runDuePublications(now = new Date()): Promise<number> {
  const due = (await db.all("SELECT * FROM social_publish_queue WHERE state='queued' AND publish_at<=? ORDER BY publish_at LIMIT 20", [now.toISOString()])).map(toQueued);
  let sent = 0;
  for (const row of due) {
    const claimed = await db.run("UPDATE social_publish_queue SET state='sending', updated_at=? WHERE id=? AND state='queued'", [new Date().toISOString(), row.id]);
    if (!claimed.changes) continue;
    const finish = (state: 'sent' | 'failed', error: string | null, jobId: string | null = null) =>
      db.run('UPDATE social_publish_queue SET state=?, error=?, job_id=?, updated_at=? WHERE id=?', [state, error, jobId, new Date().toISOString(), row.id]);
    if (now.getTime() - Date.parse(row.publishAt) > LATE_LIMIT_MS) { await finish('failed', 'Missed its time by more than 6 hours (the server was unavailable). Publish it manually.'); continue; }
    const user = await getUser(row.createdBy);
    if (!user || user.status !== 'active' || !userCan(user, 'content.publish')) { await finish('failed', 'The person who scheduled it can no longer publish. Schedule it again.'); continue; }
    const item = await getContent(row.contentId);
    if (!item || item.status !== 'scheduled') { await finish('failed', 'The post is no longer scheduled.'); continue; }
    try {
      const job = await publish(user, { contentId: row.contentId, accountId: row.accountId, kind: row.kind, media: row.media as never, mode: 'direct', consent: true });
      await finish(job.state === 'failed' ? 'failed' : 'sent', job.state === 'failed' ? job.error ?? 'The platform refused the post.' : null, job.id);
      sent++;
    } catch (error) {
      await finish('failed', error instanceof Error ? error.message : 'Publishing failed.');
    }
  }
  return sent;
}

/** Everything the Publishing page shows: accounts, the queue and recent results, limited to posts the person can see. */
export async function publishingBoard(user: AuthUser) {
  const accounts = (await listAccounts()).filter((a) => a.status !== 'disconnected').map((a) => ({
    id: a.id, provider: a.provider, name: a.name, status: a.status,
    auto: AUTO_PROVIDERS.includes(a.provider) && a.status === 'connected' && ['publish_image', 'publish_text', 'publish_video'].some((c) => capabilities(a.provider, a)[c as 'publish_image'] === 'available'),
  }));
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const queue = (await db.all("SELECT * FROM social_publish_queue WHERE state IN ('queued','sending') OR updated_at>=? ORDER BY publish_at DESC LIMIT 200", [since])).map(toQueued);
  const jobs = (await recentJobs(80)).filter((job) => job.updatedAt >= since);
  const visible = new Map<string, boolean>();
  const sees = async (contentId: string) => {
    if (!visible.has(contentId)) { const item = await getContent(contentId); visible.set(contentId, Boolean(item && canSee(user, item))); }
    return visible.get(contentId)!;
  };
  const filter = async <T extends { contentId: string }>(rows: T[]) => {
    const kept: T[] = [];
    for (const row of rows) if (await sees(row.contentId)) kept.push(row);
    return kept;
  };
  return { accounts, queue: await filter(queue), jobs: (await filter(jobs)).map(({ remoteId: _r, ...job }) => job) };
}
