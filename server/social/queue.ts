/**
 * The simple publishing flow: an approved post goes to the chosen Facebook Pages, Instagram accounts and LinkedIn pages now,
 * or at its calendar time. Each publication still runs through `publish`, so approval, consent, duplicate
 * protection and published-evidence rules are the same as the full publish panel. TikTok, YouTube and
 * Snapchat keep their own options and stay on the post page.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { getUser, userCan, type AuthUser } from '../auth.js';
import { approveForPublishing, canSee, getContent, transition, WorkspaceError, type StoredContent } from '../workspace.js';
import { capabilities } from './capabilities.js';
import { contentMedia } from './media.js';
import { imageForChannel } from '../../src/domain/output-presets.js';
import { publish, recentJobs } from './publishing.js';
import { contentQueue, getAccount, listAccounts, toQueued, type QueuedPublication } from './store.js';
import type { PublishJob, SocialAccount, SocialProvider } from './types.js';
import { PRE_APPROVAL } from '../../src/domain/content.js';
import { sourceCanPublish } from '../google/store.js';
import { resolveMedia, validateMedia } from './media.js';
import { requiredCapability } from './capabilities.js';
import { hybridConfigured, hybridRoutes, validateHybrid } from './hybrid.js';
import type { PublishInput } from './types.js';
import { reelCoverFor } from '../../src/domain/reel-covers.js';

/** Platforms whose publishing needs no extra per-post choices. */
export const AUTO_PROVIDERS: SocialProvider[] = ['facebook', 'instagram', 'linkedin'];
/** A publication missed by more than this (the server was down) waits for a person instead of going out late. */
const LATE_LIMIT_MS = 6 * 3600_000;

export interface PublishTarget { accountId: string; provider: SocialProvider; name: string; ready: boolean; reason: string | null; kind: QueuedPublication['kind'] | null }

/** What one account would publish for this post, or why it cannot. */
async function plan(item: StoredContent, account: SocialAccount): Promise<Omit<PublishTarget, 'accountId' | 'provider' | 'name'> & { media: { url: string }[] }> {
  const no = (reason: string) => ({ ready: false, reason, kind: null, media: [] });
  if (!AUTO_PROVIDERS.includes(account.provider)) return no('advanced');
  if (account.status !== 'connected') return no('disconnected');
  const attachments = await contentMedia(item.id);
  const video = [...attachments].reverse().find((m) => m.type === 'video');
  // Each platform gets the size designed for it (a LinkedIn landscape, an Instagram 3:4…), else the main design.
  const originalImage = imageForChannel(account.provider, item.creative) || attachments.find(m => m.type === 'image')?.url;
  const original = attachments.find(m => m.url === originalImage);
  const variant = account.provider === 'instagram' && original
    ? (await contentMedia(item.id, true)).find(m => m.variantFor === 'instagram' && m.sourceAssetId === original.id) : undefined;
  const image = variant?.url || originalImage;
  const choice = video ? { kind: 'video' as const, media: [{ url: video.url }] }
    : image ? { kind: 'image' as const, media: [{ url: image }] }
    : ['facebook','linkedin'].includes(account.provider) && item.captions[account.provider]?.trim() ? { kind: 'text' as const, media: [] }
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

/**
 * Publishes a post to the chosen accounts right away. Each account reports its own result. The publisher's
 * decision is the approval, so a draft goes out without a separate approval step. A post already live on some
 * accounts can still go to the others.
 */
export async function publishNow(user: AuthUser, contentId: string, accountIds: string[]) {
  if (!userCan(user, 'content.publish')) throw new WorkspaceError(403, 'لا تملك صلاحية النشر.');
  let item = await getContent(contentId);
  if (!item || !canSee(user, item)) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  if (!['approved', 'scheduled', 'published', ...PRE_APPROVAL].includes(item.status)) throw new WorkspaceError(409, 'المنشور ده ملغي أو مؤرشف؛ رجّعه الأول.');
  const targets = await readyTargets(item, accountIds);
  item = await approveForPublishing(user, item);
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
  if (!['approved', 'scheduled', ...PRE_APPROVAL].includes(item.status)) throw new WorkspaceError(409, 'المنشور ده اتنشر أو اتلغى؛ مينفعش يتجدول.');
  const targets = await readyTargets(item, accountIds);
  item = await approveForPublishing(user, item);
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
  const due = (await db.all("SELECT * FROM social_publish_queue WHERE state='queued' AND publish_at<=? AND (source_id IS NULL OR EXISTS (SELECT 1 FROM google_calendar_sources s WHERE s.id=source_id AND s.enabled=1 AND s.error IS NULL AND s.lock_token IS NULL AND s.last_sync_at>?)) ORDER BY publish_at LIMIT 20", [now.toISOString(), Date.now()-120_000])).map(toQueued);
  let sent = 0;
  for (const row of due) {
    // A disconnected or stale Google source never sends an out-of-date spreadsheet snapshot.
    if (row.sourceId && !await sourceCanPublish(row.sourceId)) continue;
    const claimed = await db.run("UPDATE social_publish_queue SET state='sending', updated_at=? WHERE id=? AND state='queued'", [new Date().toISOString(), row.id]);
    if (!claimed.changes) continue;
    const finish = (state: 'sent' | 'failed', error: string | null, jobId: string | null = null) =>
      db.run('UPDATE social_publish_queue SET state=?, error=?, job_id=?, updated_at=? WHERE id=?', [state, error, jobId, new Date().toISOString(), row.id]);
    if (now.getTime() - Date.parse(row.publishAt) > LATE_LIMIT_MS) { await finish('failed', 'Missed its time by more than 6 hours (the server was unavailable). Publish it manually.'); continue; }
    const user = await getUser(row.createdBy);
    if (!user || user.status !== 'active' || !userCan(user, 'content.publish')) { await finish('failed', 'The person who scheduled it can no longer publish. Schedule it again.'); continue; }
    const item = await getContent(row.contentId);
    // Published counts too: one account going live first (or the sync finding it) must not cancel the others.
    if (!item || !['scheduled', 'published'].includes(item.status)) { await finish('failed', 'The post is no longer scheduled.'); continue; }
    try {
      const job = await publish(user, { ...row.options, contentId: row.contentId, accountId: row.accountId, kind: row.kind, media: row.media as never, mode: 'direct', consent: true });
      await finish(job.state === 'failed' ? 'failed' : 'sent', job.state === 'failed' ? job.error ?? 'The platform refused the post.' : null, job.id);
      sent++;
    } catch (error) {
      await finish('failed', error instanceof Error ? error.message : 'Publishing failed.');
    }
  }
  return sent;
}

/** Preflight an explicit spreadsheet selection without approving it or making a remote publication. */
export async function validatePreparedPublication(user: AuthUser, input: PublishInput) {
  if (!userCan(user, 'content.publish') || !userCan(user, 'content.schedule')) throw new WorkspaceError(403, 'يلزم تفويض الجدولة والنشر.');
  const item = await getContent(input.contentId), account = await getAccount(input.accountId);
  if (!item || !canSee(user, item) || !account || account.status !== 'connected' || !item.channels.includes(account.provider)) throw new Error('اختر حساب نشر متصلًا للمنصة.');
  const hybrid = account.provider === 'tiktok' && await hybridConfigured(account.id, input.kind);
  const capability = capabilities(account.provider, account)[requiredCapability(input.kind, 'direct')];
  if (!hybrid && capability !== 'available') throw new Error(capability === 'unsupported' ? 'نوع الميديا غير مدعوم على المنصة في الربط الحالي.' : 'صلاحية نشر نوع الميديا غير متاحة للحساب.');
  const media = await resolveMedia(item, input.media.map(m => m.url));
  validateMedia(account.provider, input, media, item.captions[account.provider] || '');
  const cover = input.kind === 'video' ? reelCoverFor(account.provider, item.creative) : undefined;
  if (cover) {
    const [preparedCover] = await resolveMedia(item, [cover.url]);
    if (preparedCover.type !== 'image') throw new Error('Thumbnail لازم يكون صورة.');
    if (account.provider === 'tiktok' && cover.timestampMs === undefined && (!hybrid || !(await hybridRoutes(account.id)).some(route => route.enabled && route.service === 'zernio'))) throw new Error('ربط TikTok الحالي يحتاج لقطة من الفيديو كغلاف؛ احذف Thumbnail أو استخدم ربطًا يدعم صورة غلاف مخصصة.');
  }
  if (account.provider === 'tiktok' && (!input.privacy || typeof input.isAiGenerated !== 'boolean')) throw new Error('أكمل TikTok Privacy وAI Generated في الشيت.');
  if (account.provider === 'snapchat' && !input.snapTarget) throw new Error('اختر Snapchat Target: story أو spotlight.');
  if (account.provider === 'snapchat' && input.snapTarget === 'spotlight' && (input.kind !== 'video' || (media[0]?.duration || 0) < 6 || (item.captions.snapchat || '').length > 160 || !input.locale)) throw new Error('Spotlight يحتاج فيديو 6–60 ثانية، ونصًا حتى160 حرفًا، وSnapchat Locale مثل ar_SA.');
  if (hybrid) validateHybrid(input, item.captions.tiktok || '', media, item.title);
}

/** Queue preflighted media/options; all publication writes still go through the existing evidence/duplicate guard. */
export async function schedulePreparedPublications(user: AuthUser, contentId: string, inputs: PublishInput[], at: string, sourceId: string) {
  for (const input of inputs) {
    if (input.contentId !== contentId || input.mode !== 'direct' || input.consent !== true) throw new Error('اختيار نشر غير صالح.');
    await validatePreparedPublication(user, input);
  }
  if (!inputs.length) return;
  if (new Date(at).getTime() <= Date.now()) throw new Error('ميعاد النشر مضى؛ اختر ميعادًا مستقبليًا.');
  let item = (await getContent(contentId))!;
  item = await approveForPublishing(user, item);
  if (item.status !== 'scheduled' || item.scheduledAt !== at) await transition(user, contentId, 'scheduled', { scheduledAt: at });
  await db.tx(async tx => {
    const now = new Date().toISOString();
    await tx.run("UPDATE social_publish_queue SET state='cancelled',updated_at=? WHERE content_id=? AND state='queued'", [now, contentId]);
    for (const input of inputs) {
      // No automatic retries of failures or uncertain remote outcomes on the next sheet poll.
      if (await tx.get("SELECT id FROM social_publish_jobs WHERE content_id=? AND account_id=? LIMIT 1", [contentId, input.accountId])) continue;
      const { media, contentId: _c, accountId, kind, ...options } = input;
      await tx.run('INSERT INTO social_publish_queue(id,content_id,account_id,kind,media_json,publish_at,state,created_by,created_at,updated_at,options_json,source_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [randomUUID(), contentId, accountId, kind, JSON.stringify(media.map(m => ({ url: m.url }))), at, 'queued', user.id, now, now, JSON.stringify(options), sourceId]);
    }
  });
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
