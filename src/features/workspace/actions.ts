/**
 * Workflow operations as pure functions: (state, actor, input) → next state.
 * The provider applies them in memory today; the same functions describe what
 * the future API endpoints must do (see MIGRATION_PLAN.md).
 */
import type { ActivityLog, ContentItem, ContentStatus, ContentType } from '../../domain/content';
import { TRANSITIONS } from '../../domain/content';
import type { AppNotification } from '../../domain/management';
import type { StudentAchievement } from '../../domain/planning';
import type { Channel, Priority } from '../../domain/shared';
import type { DepartmentId, User } from '../../domain/users';
import type { Approval, Task, TaskKind, TaskStatus } from '../../domain/workflow';
import type { Asset, AssetKind } from '../../domain/assets';
import { canEditContent, hasPermission, transitionBlock } from './permissions';
import type { WorkspaceState } from './state';

export type Result = { ok: true; state: WorkspaceState; id?: string } | { ok: false; error: ActionError };
export type ActionError = 'not_found' | 'permission' | 'ownership' | 'invalid' | 'live' | 'note_required' | 'time_required' | 'proof_required' | 'title_required';

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function logged(state: WorkspaceState, entry: Omit<ActivityLog, 'id'>): WorkspaceState {
  return { ...state, activity: [...state.activity, { ...entry, id: newId('act') }] };
}

function notified(state: WorkspaceState, entries: Omit<AppNotification, 'id' | 'read' | 'provenance'>[]): WorkspaceState {
  if (!entries.length) return state;
  return { ...state, notifications: [...entries.map((entry) => ({ ...entry, id: newId('nt'), read: false, provenance: 'demo' as const })), ...state.notifications] };
}

const reviewers = (state: WorkspaceState) => state.users.filter((user) => user.status === 'active' && hasPermission(user, 'content.approve') && user.role !== 'admin');

export interface TransitionInput {
  to: ContentStatus;
  note?: string;
  publishAt?: string;
  proofUrl?: string;
  /** With "changes requested": open a revision task for this person. */
  revisionAssigneeId?: string;
  revisionDueAt?: string;
}

export function transitionContent(state: WorkspaceState, actor: User, id: string, input: TransitionInput, now: string): Result {
  const item = state.content.find((entry) => entry.id === id);
  if (!item) return { ok: false, error: 'not_found' };
  const block = transitionBlock(actor, item, input.to);
  if (block) return { ok: false, error: block as ActionError };
  const move = TRANSITIONS[item.status].find((entry) => entry.to === input.to);
  if (move?.needs === 'note' && !input.note?.trim()) return { ok: false, error: 'note_required' };
  if (move?.needs === 'publish_time' && !input.publishAt) return { ok: false, error: 'time_required' };
  if (move?.needs === 'publish_proof' && !input.proofUrl?.trim()) return { ok: false, error: 'proof_required' };

  const from = item.status;
  const patch: Partial<ContentItem> = { status: input.to, updatedAt: now };
  if (input.to === 'scheduled') patch.publishAt = input.publishAt ?? item.publishAt;
  if (input.to === 'published') patch.publishedUrl = input.proofUrl?.trim() ?? '';
  let next: WorkspaceState = { ...state, content: state.content.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) };

  const pending = [...state.approvals].reverse().find((entry) => entry.contentId === id && entry.status === 'pending');
  const decide = (status: Approval['status']) =>
    pending
      ? next.approvals.map((entry) => (entry.id === pending.id ? { ...entry, status, decidedById: actor.id, decidedAt: now, reviewerId: entry.reviewerId ?? actor.id, note: input.note?.trim() ?? '' } : entry))
      : next.approvals;
  const people = [...new Set([item.ownerId, item.assigneeId].filter((value): value is string => Boolean(value) && value !== actor.id))];

  if (input.to === 'ready_for_review') {
    const round = state.approvals.filter((entry) => entry.contentId === id).length + 1;
    next = { ...next, approvals: [...next.approvals, { id: newId('ap'), contentId: id, round, requestedById: actor.id, requestedAt: now, reviewerId: null, status: 'pending', decidedById: null, decidedAt: null, note: '' }] };
    next = logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'submitted_for_review', detail: round > 1 ? `round ${round}` : '', at: now });
    next = notified(
      next,
      reviewers(next)
        .filter((user) => user.id !== actor.id)
        .map((user) => ({ userId: user.id, category: 'review_required' as const, title: { en: 'Review required', ar: 'مطلوب مراجعة' }, body: item.title, at: now, groupKey: 'review-queue', href: `/content/${id}` })),
    );
  } else if (from === 'ready_for_review' && input.to === 'approved') {
    next = { ...next, approvals: decide('approved') };
    next = logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'approved', detail: input.note?.trim() ?? '', at: now });
    next = notified(next, people.map((userId) => ({ userId, category: 'approved' as const, title: { en: 'Approved by Marketing', ar: 'اعتمدها التسويق' }, body: item.title, at: now, groupKey: `approved-${id}`, href: `/content/${id}` })));
  } else if (input.to === 'changes_requested') {
    next = { ...next, approvals: decide('changes_requested') };
    next = logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'changes_requested', detail: input.note?.trim() ?? '', at: now });
    next = notified(next, people.map((userId) => ({ userId, category: 'changes_requested' as const, title: { en: 'Changes requested', ar: 'مطلوب تعديلات' }, body: item.title, at: now, groupKey: `changes-${id}`, href: `/content/${id}` })));
    if (input.revisionAssigneeId) {
      const created = createTask(next, actor, { title: `Revision: ${item.title}`, description: input.note?.trim() ?? '', kind: 'revision', assigneeId: input.revisionAssigneeId, dueAt: input.revisionDueAt ?? null, priority: item.priority, link: { kind: 'content', id } }, now);
      if (created.ok) next = { ...created.state, content: created.state.content.map((entry) => (entry.id === id ? { ...entry, assigneeId: input.revisionAssigneeId ?? entry.assigneeId } : entry)) };
    }
  } else if (from === 'ready_for_review' && input.to === 'cancelled') {
    next = { ...next, approvals: decide('rejected') };
    next = logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'rejected', detail: input.note?.trim() ?? '', at: now });
  } else if (input.to === 'scheduled') {
    next = logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'scheduled', detail: patch.publishAt ?? '', at: now });
  } else if (input.to === 'published') {
    next = logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'published_recorded', detail: patch.publishedUrl ?? '', at: now });
  } else {
    next = logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'status_changed', detail: `${from}→${input.to}`, at: now });
  }
  return { ok: true, state: next };
}

export interface NewContentInput {
  title: string;
  type: ContentType;
  departmentId: DepartmentId;
  channels: Channel[];
  templateId: string | null;
  courseId: string | null;
  dueAt: string | null;
  caption: string;
  status: 'idea' | 'draft';
  assigneeId: string | null;
  priority: Priority;
  planTargetId?: string | null;
  designDocumentId?: string;
}

export function createContent(state: WorkspaceState, actor: User, input: NewContentInput, now: string): Result {
  if (!hasPermission(actor, 'content.create')) return { ok: false, error: 'permission' };
  if (!input.title.trim()) return { ok: false, error: 'title_required' };
  const id = newId('ci');
  const record: ContentItem = {
    id,
    title: input.title.trim(),
    type: input.type,
    departmentId: input.departmentId,
    campaignId: null,
    ownerId: actor.id,
    assigneeId: input.assigneeId,
    channels: input.channels,
    status: input.status,
    priority: input.priority,
    dueAt: input.dueAt,
    publishAt: null,
    templateId: input.templateId,
    caption: input.caption,
    versions: [],
    designDocumentId: input.designDocumentId,
    assetIds: [],
    ai: { used: false, credits: 0, tools: [] },
    publishedUrl: '',
    courseId: input.courseId,
    achievementId: null,
    planTargetId: input.planTargetId ?? null,
    origin: input.templateId ? 'template' : 'manual',
    provenance: 'demo',
    createdAt: now,
    updatedAt: now,
  };
  let next: WorkspaceState = {
    ...state,
    content: [record, ...state.content],
    templates: input.templateId ? state.templates.map((template) => (template.id === input.templateId ? { ...template, usageCount: template.usageCount + 1 } : template)) : state.templates,
  };
  next = logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'created', detail: input.templateId ?? '', at: now });
  if (input.assigneeId && input.assigneeId !== actor.id)
    next = notified(next, [{ userId: input.assigneeId, category: 'task_assigned', title: { en: 'Content assigned to you', ar: 'محتوى مسند إليك' }, body: record.title, at: now, groupKey: `assigned-${id}`, href: `/content/${id}` }]);
  return { ok: true, state: next, id };
}

export function assignContent(state: WorkspaceState, actor: User, id: string, assigneeId: string | null, now: string): Result {
  const item = state.content.find((entry) => entry.id === id);
  if (!item) return { ok: false, error: 'not_found' };
  if (item.provenance === 'live') return { ok: false, error: 'live' };
  if (!hasPermission(actor, 'task.assign') && item.ownerId !== actor.id) return { ok: false, error: 'permission' };
  let next: WorkspaceState = { ...state, content: state.content.map((entry) => (entry.id === id ? { ...entry, assigneeId, updatedAt: now } : entry)) };
  next = logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'assigned', detail: assigneeId ?? '', at: now });
  if (assigneeId && assigneeId !== actor.id)
    next = notified(next, [{ userId: assigneeId, category: 'task_assigned', title: { en: 'Content assigned to you', ar: 'محتوى مسند إليك' }, body: item.title, at: now, groupKey: `assigned-${id}`, href: `/content/${id}` }]);
  return { ok: true, state: next };
}

/** "@Mariam" mentions match an active user's first name. */
export function mentionsIn(body: string, users: User[]): string[] {
  const names = [...body.matchAll(/@([\p{L}.]+)/gu)].map((match) => match[1].toLowerCase());
  return users.filter((user) => names.some((name) => user.name.toLowerCase().replace(/^(dr|eng)\.\s*/, '').split(' ')[0] === name)).map((user) => user.id);
}

export function addComment(state: WorkspaceState, actor: User, entity: { kind: 'content' | 'task'; id: string }, body: string, now: string): Result {
  const text = body.trim();
  if (!text) return { ok: false, error: 'invalid' };
  const mentions = mentionsIn(text, state.users).filter((id) => id !== actor.id);
  let next: WorkspaceState = { ...state, comments: [...state.comments, { id: newId('cm'), entity, authorId: actor.id, body: text, mentions, createdAt: now }] };
  next = logged(next, { entity, actorId: actor.id, action: 'commented', detail: text, at: now });
  const title = entity.kind === 'content' ? state.content.find((entry) => entry.id === entity.id)?.title : state.tasks.find((entry) => entry.id === entity.id)?.title;
  const href = entity.kind === 'content' ? `/content/${entity.id}` : `/tasks?task=${entity.id}`;
  next = notified(next, mentions.map((userId) => ({ userId, category: 'mention' as const, title: { en: `${actor.name} mentioned you`, ar: `${actor.name} أشار إليك` }, body: title ?? '', at: now, groupKey: `mention-${entity.id}`, href })));
  return { ok: true, state: next };
}

export interface NewTaskInput {
  title: string;
  description: string;
  kind: TaskKind;
  assigneeId: string;
  dueAt: string | null;
  priority: Priority;
  link: Task['link'];
}

export function createTask(state: WorkspaceState, actor: User, input: NewTaskInput, now: string): Result {
  if (!input.title.trim()) return { ok: false, error: 'title_required' };
  const assignee = state.users.find((user) => user.id === input.assigneeId);
  if (!assignee) return { ok: false, error: 'not_found' };
  if (assignee.id !== actor.id && !hasPermission(actor, 'task.assign') && !hasPermission(actor, 'content.approve')) return { ok: false, error: 'permission' };
  const id = newId('tk');
  const task: Task = {
    id,
    title: input.title.trim(),
    description: input.description,
    kind: input.kind,
    status: 'todo',
    priority: input.priority,
    ownerId: actor.id,
    assigneeId: assignee.id,
    departmentId: assignee.departmentId ?? 'marketing',
    dueAt: input.dueAt,
    link: input.link,
    dependsOn: [],
    attachmentIds: [],
    createdAt: now,
    completedAt: null,
  };
  let next: WorkspaceState = { ...state, tasks: [task, ...state.tasks] };
  next = logged(next, { entity: { kind: 'task', id }, actorId: actor.id, action: 'task_created', detail: '', at: now });
  if (input.link?.kind === 'content') next = logged(next, { entity: { kind: 'content', id: input.link.id }, actorId: actor.id, action: 'task_created', detail: task.title, at: now });
  if (assignee.id !== actor.id)
    next = notified(next, [{ userId: assignee.id, category: 'task_assigned', title: { en: 'New task assigned', ar: 'مهمة جديدة' }, body: task.title, at: now, groupKey: `task-${id}`, href: `/tasks?task=${id}` }]);
  return { ok: true, state: next, id };
}

export function setTaskStatus(state: WorkspaceState, actor: User, id: string, status: TaskStatus, now: string): Result {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task) return { ok: false, error: 'not_found' };
  if (task.assigneeId !== actor.id && task.ownerId !== actor.id && !hasPermission(actor, 'task.assign')) return { ok: false, error: 'permission' };
  let next: WorkspaceState = {
    ...state,
    tasks: state.tasks.map((entry) => (entry.id === id ? { ...entry, status, completedAt: status === 'done' ? now : null } : entry)),
  };
  next = logged(next, { entity: { kind: 'task', id }, actorId: actor.id, action: status === 'done' ? 'task_completed' : 'status_changed', detail: `${task.status}→${status}`, at: now });
  if (status === 'done' && task.link?.kind === 'content') {
    next = logged(next, { entity: { kind: 'content', id: task.link.id }, actorId: actor.id, action: 'task_completed', detail: task.title, at: now });
    if (task.ownerId !== actor.id)
      next = notified(next, [{ userId: task.ownerId, category: 'task_assigned', title: { en: 'Task completed', ar: 'اكتملت مهمة' }, body: task.title, at: now, groupKey: `task-done-${id}`, href: `/tasks?task=${id}` }]);
  }
  return { ok: true, state: next };
}

export function markNotificationsRead(state: WorkspaceState, userId: string, groupKey?: string): WorkspaceState {
  return {
    ...state,
    notifications: state.notifications.map((entry) => ((entry.userId === userId || entry.userId === 'all') && (!groupKey || entry.groupKey === groupKey) ? { ...entry, read: true } : entry)),
  };
}

export function setAchievementStep(state: WorkspaceState, actor: User, id: string, step: keyof StudentAchievement['steps'], value: boolean): Result {
  const record = state.achievements.find((entry) => entry.id === id);
  if (!record) return { ok: false, error: 'not_found' };
  if (record.responsibleId !== actor.id && !hasPermission(actor, 'content.approve') && actor.role !== 'department_manager') return { ok: false, error: 'permission' };
  return { ok: true, state: { ...state, achievements: state.achievements.map((entry) => (entry.id === id ? { ...entry, steps: { ...entry.steps, [step]: value } } : entry)) } };
}

export type ContentPatch = Partial<Pick<ContentItem, 'title' | 'caption' | 'channels' | 'priority' | 'dueAt' | 'versions' | 'campaignId' | 'designDocumentId'>>;

export function editContent(state: WorkspaceState, actor: User, id: string, patch: ContentPatch, now: string): Result {
  const item = state.content.find((entry) => entry.id === id);
  if (!item) return { ok: false, error: 'not_found' };
  if (item.provenance === 'live') return { ok: false, error: 'live' };
  if (!canEditContent(actor, item)) return { ok: false, error: 'ownership' };
  if (patch.title !== undefined && !patch.title.trim()) return { ok: false, error: 'title_required' };
  const next: WorkspaceState = { ...state, content: state.content.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: now } : entry)) };
  return { ok: true, state: logged(next, { entity: { kind: 'content', id }, actorId: actor.id, action: 'status_changed', detail: `edited:${Object.keys(patch).join(',')}`, at: now }) };
}

export interface NewAssetInput {
  name: string;
  kind: AssetKind;
  mime: string;
  sizeBytes: number;
  contentId: string | null;
}

/** Registers an asset's metadata. File storage arrives with the media backend; until then `hasFile` stays false. */
export function addAsset(state: WorkspaceState, actor: User, input: NewAssetInput, now: string): Result {
  if (!input.name.trim()) return { ok: false, error: 'invalid' };
  const id = newId('as');
  const record: Asset = {
    id,
    name: input.name.trim(),
    kind: input.kind,
    mime: input.mime || 'application/octet-stream',
    sizeBytes: input.sizeBytes,
    departmentId: actor.departmentId ?? 'marketing',
    uploadedById: actor.id,
    uploadedAt: now,
    contentIds: input.contentId ? [input.contentId] : [],
    tags: [],
    hasFile: false,
  };
  let next: WorkspaceState = { ...state, assets: [record, ...state.assets] };
  if (input.contentId) {
    next = { ...next, content: next.content.map((entry) => (entry.id === input.contentId ? { ...entry, assetIds: [...entry.assetIds, id] } : entry)) };
    next = logged(next, { entity: { kind: 'content', id: input.contentId }, actorId: actor.id, action: 'asset_attached', detail: record.name, at: now });
  }
  return { ok: true, state: next, id };
}

export function linkAsset(state: WorkspaceState, actor: User, assetId: string, contentId: string, now: string): Result {
  const asset = state.assets.find((entry) => entry.id === assetId);
  const item = state.content.find((entry) => entry.id === contentId);
  if (!asset || !item) return { ok: false, error: 'not_found' };
  if (!canEditContent(actor, item)) return { ok: false, error: 'ownership' };
  if (asset.contentIds.includes(contentId)) return { ok: true, state };
  let next: WorkspaceState = {
    ...state,
    assets: state.assets.map((entry) => (entry.id === assetId ? { ...entry, contentIds: [...entry.contentIds, contentId] } : entry)),
    content: state.content.map((entry) => (entry.id === contentId ? { ...entry, assetIds: [...entry.assetIds, assetId], updatedAt: now } : entry)),
  };
  next = logged(next, { entity: { kind: 'content', id: contentId }, actorId: actor.id, action: 'asset_attached', detail: asset.name, at: now });
  return { ok: true, state: next };
}

export type UserPatch = Partial<Pick<User, 'role' | 'departmentId' | 'status'>>;

export function updateUser(state: WorkspaceState, actor: User, id: string, patch: UserPatch, now: string): Result {
  if (!hasPermission(actor, 'users.manage')) return { ok: false, error: 'permission' };
  const user = state.users.find((entry) => entry.id === id);
  if (!user) return { ok: false, error: 'not_found' };
  // An admin cannot remove their own access by accident.
  if (id === actor.id && ((patch.role && patch.role !== 'admin') || (patch.status && patch.status !== 'active'))) return { ok: false, error: 'invalid' };
  const next: WorkspaceState = { ...state, users: state.users.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) };
  return { ok: true, state: logged(next, { entity: { kind: 'user', id }, actorId: actor.id, action: 'status_changed', detail: JSON.stringify(patch), at: now }) };
}

export interface NewAchievementInput {
  studentName: string;
  kind: StudentAchievement['kind'];
  certification: string;
  courseTitle: string;
  achievedAt: string;
  historical: boolean;
}

export function addAchievement(state: WorkspaceState, actor: User, input: NewAchievementInput): Result {
  if (!input.studentName.trim() || !input.certification.trim() || !input.achievedAt) return { ok: false, error: 'invalid' };
  const id = newId('sa');
  const done = input.historical;
  const record: StudentAchievement = {
    id,
    studentName: input.studentName.trim(),
    kind: input.kind,
    certification: input.certification.trim(),
    courseTitle: input.courseTitle.trim(),
    achievedAt: input.achievedAt,
    photo: false,
    linkedinUrl: '',
    responsibleId: actor.id,
    historical: input.historical,
    hallOfFame: input.historical,
    reward: null,
    steps: { certificateUploaded: done, congratulated: done, linkedinPosted: false, engosoftMentioned: false, reviewCollected: false, employeeCommented: false, reposted: false, rewardIssued: false },
  };
  return { ok: true, state: { ...state, achievements: [record, ...state.achievements] }, id };
}

export function setHallOfFame(state: WorkspaceState, actor: User, id: string, value: boolean): Result {
  if (!hasPermission(actor, 'content.approve') && actor.departmentId !== 'operations') return { ok: false, error: 'permission' };
  if (!state.achievements.some((entry) => entry.id === id)) return { ok: false, error: 'not_found' };
  return { ok: true, state: { ...state, achievements: state.achievements.map((entry) => (entry.id === id ? { ...entry, hallOfFame: value } : entry)) } };
}
