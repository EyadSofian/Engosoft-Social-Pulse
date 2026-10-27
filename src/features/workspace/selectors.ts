import { DateTime } from 'luxon';
import { DEPARTMENTS } from '../../domain/catalog';
import type { ContentItem } from '../../domain/content';
import { isOpen } from '../../domain/content';
import type { CreditKind } from '../../domain/management';
import type { Course, MonthlyPlan } from '../../domain/planning';
import type { DepartmentId, User } from '../../domain/users';
import type { Approval, Task } from '../../domain/workflow';
import { WEEK_START } from '../../lib/calendar';
import { businessZone, parseTimestamp } from '../../lib/format';
import { canSeeContent } from './permissions';
import type { WorkspaceState } from './state';

const ms = (iso: string | null | undefined) => (iso ? parseTimestamp(iso) : NaN);
const zoned = (nowMs: number) => DateTime.fromMillis(nowMs, { zone: businessZone() });

/** Past its due time and not yet handed to publishing. */
export const isOverdue = (item: ContentItem, nowMs: number) => isOpen(item) && item.status !== 'scheduled' && ms(item.dueAt) < nowMs;
export const isTaskOverdue = (task: Task, nowMs: number) => (task.status === 'todo' || task.status === 'in_progress' || task.status === 'waiting') && ms(task.dueAt) < nowMs;
export const isTaskOpen = (task: Task) => task.status === 'todo' || task.status === 'in_progress' || task.status === 'waiting';

export function sameDay(iso: string | null, nowMs: number) {
  if (!iso) return false;
  return DateTime.fromMillis(ms(iso), { zone: businessZone() }).hasSame(zoned(nowMs), 'day');
}

/** The business week runs Saturday to Friday. */
export function weekRange(nowMs: number) {
  const now = zoned(nowMs).startOf('day');
  const start = now.minus({ days: (now.weekday - WEEK_START + 7) % 7 });
  return { start: start.toMillis(), end: start.plus({ days: 7 }).toMillis() };
}

export function monthKey(nowMs: number) {
  return zoned(nowMs).toFormat('yyyy-LL');
}

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';
export function dueBucket(iso: string | null, nowMs: number): DueBucket {
  if (!iso) return 'none';
  const due = ms(iso);
  if (due < nowMs && !sameDay(iso, nowMs)) return 'overdue';
  if (sameDay(iso, nowMs)) return due < nowMs ? 'overdue' : 'today';
  return due < weekRange(nowMs).end ? 'week' : 'later';
}

/* ── Content scopes ────────────────────────────────────────────────── */

export function taskContentIds(state: WorkspaceState, userId: string) {
  return new Set(state.tasks.filter((task) => task.assigneeId === userId && task.link?.kind === 'content').map((task) => task.link!.id));
}

export function visibleContent(state: WorkspaceState, user: User, items: ContentItem[] = state.content) {
  const linked = taskContentIds(state, user.id);
  return items.filter((item) => canSeeContent(user, item, linked));
}

export interface ReviewEntry {
  approval: Approval;
  item: ContentItem;
}

/** Pending reviews, oldest request first: Marketing works the queue in order. */
export function reviewQueue(state: WorkspaceState): ReviewEntry[] {
  const byId = new Map(state.content.map((item) => [item.id, item]));
  return state.approvals
    .filter((approval) => approval.status === 'pending')
    .map((approval) => ({ approval, item: byId.get(approval.contentId) }))
    .filter((entry): entry is ReviewEntry => Boolean(entry.item && entry.item.status === 'ready_for_review'))
    .sort((a, b) => ms(a.item.dueAt) - ms(b.item.dueAt) || ms(a.approval.requestedAt) - ms(b.approval.requestedAt));
}

export function scheduledThisWeek(items: ContentItem[], nowMs: number) {
  const { start, end } = weekRange(nowMs);
  return items.filter((item) => item.status === 'scheduled' && ms(item.publishAt) >= start && ms(item.publishAt) < end).sort((a, b) => ms(a.publishAt) - ms(b.publishAt));
}

/* ── Monthly plans ─────────────────────────────────────────────────── */

export interface TargetProgress {
  id: string;
  label: MonthlyPlan['targets'][number]['label'];
  target: number;
  published: number;
  inFlight: number;
  missing: number;
}

export interface PlanProgress {
  plan: MonthlyPlan;
  departmentId: DepartmentId;
  target: number;
  published: number;
  inFlight: number;
  missing: number;
  overdue: number;
  /** published ÷ target, 0–100. */
  completion: number;
  targets: TargetProgress[];
}

export function planProgress(state: WorkspaceState, plan: MonthlyPlan, nowMs: number): PlanProgress {
  const targets = plan.targets.map((target) => {
    const linked = state.content.filter((item) => item.planTargetId === target.id);
    const published = linked.filter((item) => item.status === 'published' && item.publishAt?.startsWith(plan.month.slice(0, 4)) && DateTime.fromISO(item.publishAt, { zone: businessZone() }).toFormat('yyyy-LL') === plan.month).length;
    const inFlight = linked.filter((item) => isOpen(item)).length;
    return { id: target.id, label: target.label, target: target.target, published, inFlight, missing: Math.max(0, target.target - published - inFlight) };
  });
  const linkedIds = new Set(plan.targets.map((target) => target.id));
  const overdue = state.content.filter((item) => item.planTargetId && linkedIds.has(item.planTargetId) && isOverdue(item, nowMs)).length;
  const target = targets.reduce((sum, entry) => sum + entry.target, 0);
  const published = targets.reduce((sum, entry) => sum + Math.min(entry.published, entry.target), 0);
  return {
    plan,
    departmentId: plan.departmentId,
    target,
    published,
    inFlight: targets.reduce((sum, entry) => sum + entry.inFlight, 0),
    missing: targets.reduce((sum, entry) => sum + entry.missing, 0),
    overdue,
    completion: target ? (published / target) * 100 : 0,
    targets,
  };
}

export function allPlanProgress(state: WorkspaceState, nowMs: number) {
  const month = monthKey(nowMs);
  const order = DEPARTMENTS.map((department) => department.id);
  return state.plans
    .filter((plan) => plan.month === month)
    .map((plan) => planProgress(state, plan, nowMs))
    .sort((a, b) => order.indexOf(a.departmentId) - order.indexOf(b.departmentId));
}

export function companyCompletion(progress: PlanProgress[]) {
  const target = progress.reduce((sum, entry) => sum + entry.target, 0);
  const published = progress.reduce((sum, entry) => sum + entry.published, 0);
  return { target, published, completion: target ? (published / target) * 100 : null };
}

/* ── People ────────────────────────────────────────────────────────── */

export interface Workload {
  user: User;
  open: number;
  overdue: number;
  dueToday: number;
  content: number;
}

export interface OperationalKpis {
  tasksCompleted: number;
  tasksOnTime: number | null;
  postsPublished: number;
  postsOnTime: number | null;
  reviewsCompleted: number;
  openOverdue: number;
}

/* ── Credits ───────────────────────────────────────────────────────── */

export interface CreditUsage {
  departmentId: DepartmentId;
  budget: number;
  used: number;
  available: number;
  share: number;
  byKind: Record<CreditKind, number>;
}

/* ── Course lifecycle ──────────────────────────────────────────────── */

export interface CourseSignals {
  startingSoon: Course[];
  startingToday: Course[];
  endingToday: Course[];
  running: Course[];
  /** Courses whose lifecycle post has no content item yet. */
  firstSessionNeeded: Course[];
  evaluationNeeded: Course[];
  missingInfo: Course[];
}
