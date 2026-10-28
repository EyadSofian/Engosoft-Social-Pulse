import { contentMedia } from './social/media.js';
import { cancelQueued, hasPendingPublication, moveQueued } from './social/store.js';
/**
 * Stored content pipeline shared by every department: posts, their creative versions, review rounds,
 * comments and an activity log. Scheduling creates rows in the existing `plans` table, so the calendar,
 * publish alerts and sync-based publish proof keep working unchanged.
 */
import { randomUUID } from 'node:crypto';
import { TRANSITIONS, type ContentStatus } from '../src/domain/content.js';
import type { Permission } from '../src/domain/users.js';
import { userCan, type AuthUser } from './auth.js';
import { matchingPost, newPlan } from './domain.js';
import { db, defineColumn, defineSchema } from './db.js';
import { isGoal, type Goal } from '../src/domain/goals.js';
import { getObserved, getPlan, getPlans, savePlan } from './store.js';
import type { ObservedPost, Platform } from './types.js';

defineSchema(`
CREATE TABLE IF NOT EXISTS content_items (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, department_id TEXT, owner_id TEXT NOT NULL,
 channels_json TEXT NOT NULL DEFAULT '[]', captions_json TEXT NOT NULL DEFAULT '{}', creative_json TEXT,
 scheduled_at TEXT, plan_ids_json TEXT NOT NULL DEFAULT '[]', template_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_versions (
 id TEXT PRIMARY KEY, content_id TEXT NOT NULL, image_url TEXT NOT NULL, story_url TEXT, studio_json TEXT,
 note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_events (
 id TEXT PRIMARY KEY, content_id TEXT NOT NULL, actor_id TEXT NOT NULL, kind TEXT NOT NULL,
 from_status TEXT, to_status TEXT, body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_events_by_item ON content_events(content_id, created_at);
CREATE INDEX IF NOT EXISTS content_versions_by_item ON content_versions(content_id, created_at);
`);
/** Why the post exists (reach, engagement, leads, traffic). */
defineColumn('content_items', 'goal', "TEXT NOT NULL DEFAULT ''");
/** The day the post is planned for before anyone schedules it; the calendar shows the post there meanwhile. */
defineColumn('content_items', 'planned_for', 'TEXT');
/** The calendar plan row this post was made for. */
defineColumn('content_items', 'slot_id', 'TEXT');

export type Channel = 'facebook' | 'instagram' | 'whatsapp' | 'linkedin' | 'tiktok' | 'snapchat' | 'youtube' | 'website';
/** Channels the sync can prove published; the others are tracked by status only. */
const TRACKED: Partial<Record<Channel, Platform>> = { facebook: 'facebook', instagram: 'instagram', tiktok: 'tiktok', snapchat: 'snapchat', youtube: 'youtube' };

export interface CreativeRef { requestId: string; directionId: string; imageUrl: string; storyUrl?: string; landscapeUrl?: string; youtubeUrl?: string; model?: string; directionName?: string; svgTemplate?: { id: string; values: Record<string, string>; format?: 'feed' | 'square' | 'story' | 'landscape'; context?: string; outputPreset?: string } }
export interface StoredContent {
  id: string; title: string; status: ContentStatus; departmentId: string | null; ownerId: string;
  channels: Channel[]; captions: Partial<Record<Channel, string>>; creative: CreativeRef | null;
  scheduledAt: string | null; planIds: string[]; templateId: string | null; createdAt: string; updatedAt: string;
  goal: Goal | null; plannedFor: string | null; slotId: string | null;
  /** Filled when sync has matched a scheduled plan with a real published post. */
  published?: { platform: string; permalink: string; publishedAt: string; metrics: Record<string, number | null> }[];
}
export interface ContentEvent { id: string; contentId: string; actorId: string; kind: 'created' | 'transition' | 'comment' | 'version' | 'caption'; from: string | null; to: string | null; body: string; createdAt: string }
export interface ContentVersion { id: string; contentId: string; imageUrl: string; storyUrl: string | null; studio: unknown; note: string; createdBy: string; createdAt: string }

const parse = <T>(value: unknown, fallback: T): T => { try { return value ? JSON.parse(String(value)) as T : fallback; } catch { return fallback; } };
const toContent = (r: Record<string, unknown>): StoredContent => ({
  id: String(r.id), title: String(r.title), status: r.status as ContentStatus, departmentId: (r.department_id as string | null) ?? null,
  ownerId: String(r.owner_id), channels: parse(r.channels_json, []), captions: parse(r.captions_json, {}), creative: parse(r.creative_json, null),
  scheduledAt: (r.scheduled_at as string | null) ?? null, planIds: parse(r.plan_ids_json, []), templateId: (r.template_id as string | null) ?? null,
  createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  goal: isGoal(r.goal) ? r.goal : null, plannedFor: (r.planned_for as string | null) ?? null, slotId: (r.slot_id as string | null) ?? null,
});

async function log(contentId: string, actorId: string, kind: ContentEvent['kind'], body = '', from: string | null = null, to: string | null = null) {
  await db.run('INSERT INTO content_events (id,content_id,actor_id,kind,from_status,to_status,body,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [randomUUID(), contentId, actorId, kind, from, to, body, new Date().toISOString()]);
}

/** Marketing roles see everything; everyone else sees their own work and their department's. */
export function canSee(user: AuthUser, item: StoredContent): boolean {
  if (userCan(user, 'content.edit_any') || userCan(user, 'plans.view_all')) return true;
  if (item.ownerId === user.id) return true;
  return item.departmentId !== null && item.departmentId === user.departmentId;
}
export function canEdit(user: AuthUser, item: StoredContent): boolean {
  if (userCan(user, 'content.edit_any')) return true;
  if (item.ownerId === user.id) return userCan(user, 'content.edit_own');
  return userCan(user, 'content.edit_department') && item.departmentId === user.departmentId;
}

/** Approval covers the exact copy and image; marketing must return decided work before it changes. */
export const contentIsMutable = (item: StoredContent) => !['approved', 'scheduled', 'published', 'archived', 'cancelled'].includes(item.status);
function requireMutable(item: StoredContent) {
  if (!contentIsMutable(item)) throw new WorkspaceError(409, 'أعد المنشور للتعديل قبل تغيير التصميم أو النص المعتمد.');
}

/** Scheduled items whose plans the sync has matched to a real post become Published, with live metrics. */
async function withPublishProof(item: StoredContent, posts: () => Promise<ObservedPost[]>): Promise<StoredContent> {
  if (!item.planIds.length || !['scheduled', 'published'].includes(item.status)) return item;
  const observed = await posts();
  const plans = await Promise.all(item.planIds.map((id) => getPlan(id)));
  const published = plans.flatMap((plan) => {
    const post = plan ? matchingPost(plan, observed) : undefined;
    return post ? [{ platform: post.platform, permalink: post.permalink, publishedAt: post.publishedAt, metrics: post.metrics as unknown as Record<string, number | null> }] : [];
  });
  if (!published.length) return item;
  if (item.status === 'scheduled') {
    await db.run('UPDATE content_items SET status=?, updated_at=? WHERE id=?', ['published', new Date().toISOString(), item.id]);
    await log(item.id, 'system', 'transition', 'Matched with the published post by sync', 'scheduled', 'published');
  }
  return { ...item, status: 'published', published };
}
/** Observed posts are loaded at most once per request, and only when some item needs publish proof. */
const lazyPosts = () => {
  let loaded: Promise<ObservedPost[]> | null = null;
  return () => (loaded ??= getObserved());
};

export async function getContent(id: string): Promise<StoredContent | undefined> {
  const row = await db.get('SELECT * FROM content_items WHERE id=?', [id]);
  return row ? withPublishProof(toContent(row), lazyPosts()) : undefined;
}
export async function listContent(user: AuthUser): Promise<StoredContent[]> {
  const posts = lazyPosts();
  const rows = await db.all('SELECT * FROM content_items ORDER BY updated_at DESC LIMIT 500');
  return Promise.all(rows.map(toContent).filter((item) => canSee(user, item)).map((item) => withPublishProof(item, posts)));
}

export interface PostPlanInput { goal?: Goal | null; plannedFor?: string | null; slotId?: string | null }

/**
 * A plan row (an imported or typed calendar line) that nobody has made yet. Making a post for it links the two:
 * the row stops counting as "not made", and the post inherits its day and goal unless the person chose others.
 */
async function openSlot(slotId: string) {
  const slot = await getPlan(slotId);
  if (!slot || slot.status === 'cancelled') throw new WorkspaceError(400, 'خانة الخطة غير موجودة.');
  if (slot.notes.startsWith('content:')) throw new WorkspaceError(409, 'هذه الخانة لها منشور بالفعل.');
  return slot;
}

export async function createContent(user: AuthUser, input: { title: string; channels: Channel[]; captions: Partial<Record<Channel, string>>; creative: CreativeRef | null; templateId?: string | null } & PostPlanInput): Promise<StoredContent> {
  const id = randomUUID(), now = new Date().toISOString();
  const slot = input.slotId ? await openSlot(input.slotId) : null;
  const goal = input.goal ?? (isGoal(slot?.goal) ? slot.goal : null);
  const plannedFor = input.plannedFor ?? slot?.scheduledAt ?? null;
  await db.run('INSERT INTO content_items (id,title,status,department_id,owner_id,channels_json,captions_json,creative_json,template_id,created_at,updated_at,goal,planned_for,slot_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, input.title, 'draft', user.departmentId, user.id, JSON.stringify(input.channels), JSON.stringify(input.captions), input.creative ? JSON.stringify(input.creative) : null, input.templateId ?? null, now, now, goal ?? '', plannedFor, slot?.id ?? null]);
  // One spreadsheet line for several platforms is one row per platform: the post takes all the rows it covers.
  if (slot) for (const row of (await getPlans()).filter((plan) => plan.id === slot.id || (plan.title === slot.title && plan.scheduledAt === slot.scheduledAt && plan.status !== 'cancelled' && !plan.notes.startsWith('content:') && input.channels.includes(plan.platform as Channel))))
    await savePlan({ ...row, notes: `content:${id}` });
  await log(id, user.id, 'created', input.title);
  if (input.creative) await addVersion(user, id, { imageUrl: input.creative.imageUrl, storyUrl: input.creative.storyUrl ?? null, studio: null, note: input.creative.directionName ?? 'AI creative' });
  return (await getContent(id))!;
}

export async function updateContent(user: AuthUser, id: string, patch: { title?: string; channels?: Channel[]; captions?: Partial<Record<Channel, string>>; creative?: CreativeRef; goal?: Goal | null; plannedFor?: string | null }): Promise<StoredContent> {
  const item = await getContent(id);
  if (!item) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  if (!canEdit(user, item) && !userCan(user, 'content.schedule')) throw new WorkspaceError(403, 'لا تملك صلاحية تعديل هذا المحتوى.');
  // Goal and planned day are planning, not the approved design: the owner or a planner may change them until the post is scheduled.
  if (patch.goal !== undefined || patch.plannedFor !== undefined) {
    if (['scheduled', 'published', 'archived', 'cancelled'].includes(item.status)) throw new WorkspaceError(409, 'المنشور مجدول بالفعل؛ غيّر موعده من النشر.');
    await db.run('UPDATE content_items SET goal=?, planned_for=?, updated_at=? WHERE id=?', [patch.goal === undefined ? item.goal ?? '' : patch.goal ?? '', patch.plannedFor === undefined ? item.plannedFor : patch.plannedFor, new Date().toISOString(), id]);
    if (patch.title === undefined && patch.channels === undefined && patch.captions === undefined && patch.creative === undefined) return (await getContent(id))!;
  }
  if (!canEdit(user, item)) throw new WorkspaceError(403, 'لا تملك صلاحية تعديل هذا المحتوى.');
  requireMutable(item);
  await db.run('UPDATE content_items SET title=?, channels_json=?, captions_json=?, creative_json=?, updated_at=? WHERE id=?', [
    patch.title ?? item.title, JSON.stringify(patch.channels ?? item.channels), JSON.stringify(patch.captions ?? item.captions),
    JSON.stringify(patch.creative ?? item.creative), new Date().toISOString(), id]);
  if (patch.captions) await log(id, user.id, 'caption', 'Caption updated');
  return (await getContent(id))!;
}

export async function addVersion(user: AuthUser, contentId: string, input: { imageUrl: string; storyUrl: string | null; studio: unknown; note: string }): Promise<ContentVersion> {
  const current = await getContent(contentId);
  if (!current || !canEdit(user, current)) throw new WorkspaceError(403, 'لا تملك صلاحية تعديل هذا المحتوى.');
  requireMutable(current);
  const version: ContentVersion = { id: randomUUID(), contentId, imageUrl: input.imageUrl, storyUrl: input.storyUrl, studio: input.studio, note: input.note, createdBy: user.id, createdAt: new Date().toISOString() };
  await db.run('INSERT INTO content_versions (id,content_id,image_url,story_url,studio_json,note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [version.id, contentId, version.imageUrl, version.storyUrl, input.studio ? JSON.stringify(input.studio) : null, version.note, user.id, version.createdAt]);
  const row = await db.get('SELECT * FROM content_items WHERE id=?', [contentId]);
  const item = row ? toContent(row) : undefined;
  // A template post's version carries the field values it was exported with, so reopening it edits the latest copy.
  const svgTemplate = (input.studio as { svgTemplate?: CreativeRef['svgTemplate'] } | null)?.svgTemplate;
  if (item) await db.run('UPDATE content_items SET creative_json=?, updated_at=? WHERE id=?', [JSON.stringify({ ...(item.creative ?? { requestId: '', directionId: '' }), ...(svgTemplate ? { svgTemplate, ...(svgTemplate.format ? { directionId: svgTemplate.format } : {}) } : {}), imageUrl: version.imageUrl, ...(version.storyUrl ? { storyUrl: version.storyUrl } : {}) }), version.createdAt, contentId]);
  await log(contentId, user.id, 'version', input.note);
  return version;
}
export const listVersions = async (contentId: string): Promise<ContentVersion[]> => (await db.all('SELECT * FROM content_versions WHERE content_id=? ORDER BY created_at DESC', [contentId]))
  .map((r) => ({ id: String(r.id), contentId: String(r.content_id), imageUrl: String(r.image_url), storyUrl: (r.story_url as string | null) ?? null, studio: parse(r.studio_json, null), note: String(r.note), createdBy: String(r.created_by), createdAt: String(r.created_at) }));
export const listEvents = async (contentId: string): Promise<ContentEvent[]> => (await db.all('SELECT * FROM content_events WHERE content_id=? ORDER BY created_at', [contentId]))
  .map((r) => ({ id: String(r.id), contentId: String(r.content_id), actorId: String(r.actor_id), kind: r.kind as ContentEvent['kind'], from: (r.from_status as string | null) ?? null, to: (r.to_status as string | null) ?? null, body: String(r.body), createdAt: String(r.created_at) }));

export async function addComment(user: AuthUser, contentId: string, body: string) {
  const item = await getContent(contentId);
  if (!item || !canSee(user, item)) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  await log(contentId, user.id, 'comment', body.trim().slice(0, 2000));
}

export class WorkspaceError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Which moves this user may make now. A scheduled post can also be moved to a new time (scheduled → scheduled). */
export function allowedMoves(user: AuthUser, item: StoredContent): { to: ContentStatus; needsNote: boolean }[] {
  const moves = TRANSITIONS[item.status].filter((move) => move.permission ? userCan(user, move.permission as Permission) : canEdit(user, item))
    .filter((move) => move.to !== 'published') // publish is proven by sync, never clicked
    .map((move) => ({ to: move.to, needsNote: move.needs === 'note' }));
  if (item.status === 'scheduled' && userCan(user, 'content.schedule')) moves.unshift({ to: 'scheduled', needsNote: false });
  return moves;
}

async function cancelPlans(item: StoredContent) {
  for (const planId of item.planIds) {
    const plan = await getPlan(planId);
    if (plan) await savePlan({ ...plan, status: 'cancelled' });
  }
}

/** Puts a post on the calendar: one plan per trackable channel, so the calendar, alerts and sync matching cover it. */
function publishTime(scheduledAt: string | undefined): Date {
  const when = scheduledAt ? new Date(scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) throw new WorkspaceError(400, 'اختر موعد نشر في المستقبل.');
  return when;
}

async function schedulePlans(user: AuthUser, item: StoredContent, scheduledAt: string | undefined): Promise<Date> {
  const when = publishTime(scheduledAt);
  await cancelPlans(item);
  // The post's own calendar rows replace the plan rows it was made for.
  if (item.slotId) for (const row of (await getPlans()).filter((plan) => plan.notes === `content:${item.id}` && plan.status !== 'cancelled' && !item.planIds.includes(plan.id)))
    await savePlan({ ...row, status: 'cancelled' });
  const planIds: string[] = [];
  for (const channel of item.channels) {
    const platform = TRACKED[channel];
    if (!platform) continue;
    const plan = await savePlan(newPlan({ platform, title: item.title, caption: item.captions[channel] ?? '', scheduledAt: when.toISOString(), status: 'scheduled', owner: user.name, contentType: 'post', goal: item.goal ?? '', campaign: item.id, notes: `content:${item.id}` }));
    planIds.push(plan.id);
  }
  await db.run('UPDATE content_items SET scheduled_at=?, plan_ids_json=? WHERE id=?', [when.toISOString(), JSON.stringify(planIds), item.id]);
  return when;
}

/**
 * Moves a post along the pipeline. Approving can take a publish time, which approves and schedules in one step
 * when the approver may schedule. Scheduling a scheduled post moves it to the new time; going back to approved
 * takes it off the calendar.
 */
export async function transition(user: AuthUser, id: string, to: ContentStatus, input: { note?: string; scheduledAt?: string }): Promise<StoredContent> {
  const item = await getContent(id);
  if (!item || !canSee(user, item)) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  if(await hasPendingPublication(item.id))throw new WorkspaceError(409, 'يوجد طلب نشر قيد المعالجة؛ تحقق من نتيجته قبل تغيير المحتوى أو سحب اعتماده.');
  const move = allowedMoves(user, item).find((entry) => entry.to === to);
  if (!move) throw new WorkspaceError(403, 'هذه الخطوة غير متاحة لك الآن.');
  if (move.needsNote && !input.note?.trim()) throw new WorkspaceError(400, 'اكتب سبب أو ملاحظة.');
  if (to === 'ready_for_review' && !item.creative && !(await contentMedia(item.id)).length) throw new WorkspaceError(400, 'أضف التصميم أولًا قبل إرساله للمراجعة.');
  const andSchedule = to === 'approved' && item.status === 'ready_for_review' && Boolean(input.scheduledAt);
  if (andSchedule && !userCan(user, 'content.schedule')) throw new WorkspaceError(403, 'لا تملك صلاحية جدولة النشر؛ اعتمد المنشور فقط.');
  // Nothing changes when the time is wrong.
  if (to === 'scheduled' || andSchedule) publishTime(input.scheduledAt);

  if (item.status === 'scheduled' && to !== 'scheduled') {
    await cancelPlans(item);
    await cancelQueued(id, 'The post was taken off the calendar.');
    await db.run('UPDATE content_items SET scheduled_at=NULL, plan_ids_json=? WHERE id=?', ['[]', id]);
  }
  if (to === 'scheduled') {
    const when = await schedulePlans(user, item, input.scheduledAt);
    const rescheduled = item.status === 'scheduled';
    if (rescheduled) await moveQueued(id, when.toISOString());
    await db.run('UPDATE content_items SET status=?, updated_at=? WHERE id=?', [to, new Date().toISOString(), id]);
    await log(id, user.id, 'transition', input.note?.trim() || (rescheduled ? 'تغيّر موعد النشر' : ''), item.status, to);
    return (await getContent(id))!;
  }
  await db.run('UPDATE content_items SET status=?, updated_at=? WHERE id=?', [to, new Date().toISOString(), id]);
  await log(id, user.id, 'transition', input.note?.trim() ?? '', item.status, to);
  if (andSchedule) {
    const approved = (await getContent(id))!;
    await schedulePlans(user, approved, input.scheduledAt);
    await db.run('UPDATE content_items SET status=?, updated_at=? WHERE id=?', ['scheduled', new Date().toISOString(), id]);
    await log(id, user.id, 'transition', '', 'approved', 'scheduled');
  }
  return (await getContent(id))!;
}

/**
 * Editing an approved or scheduled post: it goes back to "changes requested" with the reason, leaves the
 * calendar and the automatic-publishing queue, and keeps its day as the planned day. It must be approved again
 * before it can publish, so the owner, anyone who may edit it, or an approver can do this.
 */
export async function reopenContent(user: AuthUser, id: string, note: string): Promise<StoredContent> {
  const item = await getContent(id);
  if (!item || !canSee(user, item)) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  if (!['approved', 'scheduled'].includes(item.status)) throw new WorkspaceError(409, 'المنشور مفتوح للتعديل بالفعل.');
  if (!canEdit(user, item) && item.ownerId !== user.id && !userCan(user, 'content.approve')) throw new WorkspaceError(403, 'لا تملك صلاحية تعديل هذا المنشور.');
  if (!note.trim()) throw new WorkspaceError(400, 'اكتب سبب التعديل.');
  if (await hasPendingPublication(item.id)) throw new WorkspaceError(409, 'يوجد طلب نشر قيد المعالجة؛ تحقق من نتيجته قبل تعديل المنشور.');
  if (item.status === 'scheduled') {
    await cancelPlans(item);
    await cancelQueued(id, 'The post was reopened for changes.');
  }
  await db.run('UPDATE content_items SET status=?, scheduled_at=NULL, plan_ids_json=?, planned_for=COALESCE(?, planned_for), updated_at=? WHERE id=?', ['changes_requested', item.status === 'scheduled' ? '[]' : JSON.stringify(item.planIds), item.scheduledAt, new Date().toISOString(), id]);
  await log(id, user.id, 'transition', note.trim().slice(0, 2000), item.status, 'changes_requested');
  return (await getContent(id))!;
}

/** Counts by status for the people a user can see, used by navigation badges and the overview. */
export async function pipelineCounts(user: AuthUser): Promise<Record<string, number>> {
  return (await listContent(user)).reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {});
}
