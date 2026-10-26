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
import { db, getObserved, getPlan, savePlan } from './store.js';
import type { Platform } from './types.js';

db.exec(`
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

export type Channel = 'facebook' | 'instagram' | 'whatsapp' | 'linkedin' | 'tiktok' | 'snapchat';
/** Channels the sync can prove published; the others are tracked by status only. */
const TRACKED: Partial<Record<Channel, Platform>> = { facebook: 'facebook', instagram: 'instagram', tiktok: 'tiktok', snapchat: 'snapchat' };

export interface CreativeRef { requestId: string; directionId: string; imageUrl: string; storyUrl?: string; model?: string; directionName?: string }
export interface StoredContent {
  id: string; title: string; status: ContentStatus; departmentId: string | null; ownerId: string;
  channels: Channel[]; captions: Partial<Record<Channel, string>>; creative: CreativeRef | null;
  scheduledAt: string | null; planIds: string[]; templateId: string | null; createdAt: string; updatedAt: string;
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
});

function log(contentId: string, actorId: string, kind: ContentEvent['kind'], body = '', from: string | null = null, to: string | null = null) {
  db.prepare('INSERT INTO content_events (id,content_id,actor_id,kind,from_status,to_status,body,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(randomUUID(), contentId, actorId, kind, from, to, body, new Date().toISOString());
}

/** Marketing roles see everything; managers and staff see their department; production roles their own work. */
export function canSee(user: AuthUser, item: StoredContent): boolean {
  if (userCan(user, 'content.edit_any') || userCan(user, 'plans.view_all')) return true;
  if (item.ownerId === user.id) return true;
  if (['designer', 'media_editor', 'freelancer'].includes(user.role)) return false;
  return item.departmentId !== null && item.departmentId === user.departmentId;
}
export function canEdit(user: AuthUser, item: StoredContent): boolean {
  if (userCan(user, 'content.edit_any')) return true;
  if (item.ownerId === user.id) return userCan(user, 'content.edit_own');
  return userCan(user, 'content.edit_department') && item.departmentId === user.departmentId;
}

/** Scheduled items whose plans the sync has matched to a real post become Published, with live metrics. */
function withPublishProof(item: StoredContent): StoredContent {
  if (!item.planIds.length || !['scheduled', 'published'].includes(item.status)) return item;
  const posts = getObserved();
  const published = item.planIds.map((id) => getPlan(id)).flatMap((plan) => {
    const post = plan ? matchingPost(plan, posts) : undefined;
    return post ? [{ platform: post.platform, permalink: post.permalink, publishedAt: post.publishedAt, metrics: post.metrics as unknown as Record<string, number | null> }] : [];
  });
  if (!published.length) return item;
  if (item.status === 'scheduled') {
    db.prepare('UPDATE content_items SET status=?, updated_at=? WHERE id=?').run('published', new Date().toISOString(), item.id);
    log(item.id, 'system', 'transition', 'Matched with the published post by sync', 'scheduled', 'published');
  }
  return { ...item, status: 'published', published };
}

export function getContent(id: string): StoredContent | undefined {
  const row = db.prepare('SELECT * FROM content_items WHERE id=?').get(id) as Record<string, unknown> | undefined;
  return row ? withPublishProof(toContent(row)) : undefined;
}
export function listContent(user: AuthUser): StoredContent[] {
  return (db.prepare('SELECT * FROM content_items ORDER BY updated_at DESC LIMIT 500').all() as Record<string, unknown>[])
    .map(toContent).filter((item) => canSee(user, item)).map(withPublishProof);
}

export function createContent(user: AuthUser, input: { title: string; channels: Channel[]; captions: Partial<Record<Channel, string>>; creative: CreativeRef | null; templateId?: string | null }): StoredContent {
  const id = randomUUID(), now = new Date().toISOString();
  db.prepare('INSERT INTO content_items (id,title,status,department_id,owner_id,channels_json,captions_json,creative_json,template_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, input.title, 'draft', user.departmentId, user.id, JSON.stringify(input.channels), JSON.stringify(input.captions), input.creative ? JSON.stringify(input.creative) : null, input.templateId ?? null, now, now);
  log(id, user.id, 'created', input.title);
  if (input.creative) addVersion(user, id, { imageUrl: input.creative.imageUrl, storyUrl: input.creative.storyUrl ?? null, studio: null, note: input.creative.directionName ?? 'AI creative' });
  return getContent(id)!;
}

export function updateContent(user: AuthUser, id: string, patch: { title?: string; channels?: Channel[]; captions?: Partial<Record<Channel, string>>; creative?: CreativeRef }): StoredContent {
  const item = getContent(id);
  if (!item) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  if (!canEdit(user, item)) throw new WorkspaceError(403, 'مش من حقك تعدّل المحتوى ده.');
  if (['published', 'archived', 'cancelled'].includes(item.status)) throw new WorkspaceError(409, 'المحتوى ده اتقفل.');
  db.prepare('UPDATE content_items SET title=?, channels_json=?, captions_json=?, creative_json=?, updated_at=? WHERE id=?').run(
    patch.title ?? item.title, JSON.stringify(patch.channels ?? item.channels), JSON.stringify(patch.captions ?? item.captions),
    JSON.stringify(patch.creative ?? item.creative), new Date().toISOString(), id);
  if (patch.captions) log(id, user.id, 'caption', 'Caption updated');
  return getContent(id)!;
}

export function addVersion(user: AuthUser, contentId: string, input: { imageUrl: string; storyUrl: string | null; studio: unknown; note: string }): ContentVersion {
  const version: ContentVersion = { id: randomUUID(), contentId, imageUrl: input.imageUrl, storyUrl: input.storyUrl, studio: input.studio, note: input.note, createdBy: user.id, createdAt: new Date().toISOString() };
  db.prepare('INSERT INTO content_versions (id,content_id,image_url,story_url,studio_json,note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(version.id, contentId, version.imageUrl, version.storyUrl, input.studio ? JSON.stringify(input.studio) : null, version.note, user.id, version.createdAt);
  const item = getContent(contentId);
  if (item) db.prepare('UPDATE content_items SET creative_json=?, updated_at=? WHERE id=?').run(JSON.stringify({ ...(item.creative ?? { requestId: '', directionId: '' }), imageUrl: version.imageUrl, ...(version.storyUrl ? { storyUrl: version.storyUrl } : {}) }), version.createdAt, contentId);
  log(contentId, user.id, 'version', input.note);
  return version;
}
export const listVersions = (contentId: string): ContentVersion[] => (db.prepare('SELECT * FROM content_versions WHERE content_id=? ORDER BY created_at DESC').all(contentId) as Record<string, unknown>[])
  .map((r) => ({ id: String(r.id), contentId: String(r.content_id), imageUrl: String(r.image_url), storyUrl: (r.story_url as string | null) ?? null, studio: parse(r.studio_json, null), note: String(r.note), createdBy: String(r.created_by), createdAt: String(r.created_at) }));
export const listEvents = (contentId: string): ContentEvent[] => (db.prepare('SELECT * FROM content_events WHERE content_id=? ORDER BY created_at').all(contentId) as Record<string, unknown>[])
  .map((r) => ({ id: String(r.id), contentId: String(r.content_id), actorId: String(r.actor_id), kind: r.kind as ContentEvent['kind'], from: (r.from_status as string | null) ?? null, to: (r.to_status as string | null) ?? null, body: String(r.body), createdAt: String(r.created_at) }));

export function addComment(user: AuthUser, contentId: string, body: string) {
  const item = getContent(contentId);
  if (!item || !canSee(user, item)) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  log(contentId, user.id, 'comment', body.trim().slice(0, 2000));
}

export class WorkspaceError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Which moves this user may make now. */
export function allowedMoves(user: AuthUser, item: StoredContent): { to: ContentStatus; needsNote: boolean }[] {
  return TRANSITIONS[item.status].filter((move) => move.permission ? userCan(user, move.permission as Permission) : canEdit(user, item))
    .filter((move) => move.to !== 'published') // publish is proven by sync, never clicked
    .map((move) => ({ to: move.to, needsNote: move.needs === 'note' }));
}

export function transition(user: AuthUser, id: string, to: ContentStatus, input: { note?: string; scheduledAt?: string }): StoredContent {
  const item = getContent(id);
  if (!item || !canSee(user, item)) throw new WorkspaceError(404, 'المحتوى غير موجود.');
  const move = allowedMoves(user, item).find((entry) => entry.to === to);
  if (!move) throw new WorkspaceError(403, 'الخطوة دي مش متاحة ليك دلوقتي.');
  if (move.needsNote && !input.note?.trim()) throw new WorkspaceError(400, 'اكتب سبب أو ملاحظة.');
  if (to === 'ready_for_review' && !item.creative) throw new WorkspaceError(400, 'ضيف التصميم الأول قبل ما تبعته للمراجعة.');
  let planIds = item.planIds;
  if (to === 'scheduled') {
    const when = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (!when || Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) throw new WorkspaceError(400, 'اختار ميعاد نشر في المستقبل.');
    // One plan per trackable channel, so the calendar, alerts and sync matching cover this post.
    planIds = item.channels.flatMap((channel) => {
      const platform = TRACKED[channel];
      if (!platform) return [];
      const plan = savePlan(newPlan({ platform, title: item.title, caption: item.captions[channel] ?? '', scheduledAt: when.toISOString(), status: 'scheduled', owner: user.name, contentType: 'post', campaign: item.id, notes: `content:${item.id}` }));
      return [plan.id];
    });
    db.prepare('UPDATE content_items SET scheduled_at=?, plan_ids_json=? WHERE id=?').run(when.toISOString(), JSON.stringify(planIds), id);
  }
  db.prepare('UPDATE content_items SET status=?, updated_at=? WHERE id=?').run(to, new Date().toISOString(), id);
  log(id, user.id, 'transition', input.note?.trim() ?? '', item.status, to);
  return getContent(id)!;
}

/** Counts by status for the people a user can see, used by navigation badges and the overview. */
export function pipelineCounts(user: AuthUser): Record<string, number> {
  return listContent(user).reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {});
}
