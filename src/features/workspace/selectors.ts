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

export function upcomingScheduled(items: ContentItem[], nowMs: number, days = 14) {
  const end = nowMs + days * 86_400_000;
  return items.filter((item) => item.status === 'scheduled' && ms(item.publishAt) >= nowMs - 3_600_000 && ms(item.publishAt) < end).sort((a, b) => ms(a.publishAt) - ms(b.publishAt));
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

export function teamWorkload(state: WorkspaceState, nowMs: number, users: User[] = state.users): Workload[] {
  return users
    .filter((user) => user.status === 'active')
    .map((user) => {
      const tasks = state.tasks.filter((task) => task.assigneeId === user.id && isTaskOpen(task));
      return {
        user,
        open: tasks.length,
        overdue: tasks.filter((task) => isTaskOverdue(task, nowMs)).length,
        dueToday: tasks.filter((task) => sameDay(task.dueAt, nowMs) && !isTaskOverdue(task, nowMs)).length,
        content: state.content.filter((item) => item.assigneeId === user.id && isOpen(item)).length,
      };
    })
    .filter((entry) => entry.open + entry.content > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}

export interface OperationalKpis {
  tasksCompleted: number;
  tasksOnTime: number | null;
  postsPublished: number;
  postsOnTime: number | null;
  reviewsCompleted: number;
  openOverdue: number;
}

/** Delivery measures for a person or department this month. Reach is deliberately absent. */
export function operationalKpis(state: WorkspaceState, nowMs: number, scope: { userId?: string; departmentId?: DepartmentId }): OperationalKpis {
  const month = monthKey(nowMs);
  const inMonth = (iso: string | null) => Boolean(iso) && DateTime.fromISO(iso!, { zone: businessZone() }).toFormat('yyyy-LL') === month;
  const tasks = state.tasks.filter((task) => (scope.userId ? task.assigneeId === scope.userId : true) && (scope.departmentId ? task.departmentId === scope.departmentId : true));
  const done = tasks.filter((task) => task.status === 'done' && inMonth(task.completedAt));
  const onTime = done.filter((task) => !task.dueAt || ms(task.completedAt) <= ms(task.dueAt) + 3_600_000);
  const items = state.content.filter((item) => (scope.userId ? item.ownerId === scope.userId : true) && (scope.departmentId ? item.departmentId === scope.departmentId : true));
  const published = items.filter((item) => item.status === 'published' && inMonth(item.publishAt));
  const publishedOnTime = published.filter((item) => !item.dueAt || ms(item.publishAt) <= ms(item.dueAt) + 86_400_000);
  const reviews = state.approvals.filter((approval) => approval.decidedAt && inMonth(approval.decidedAt) && (scope.userId ? approval.decidedById === scope.userId : true));
  return {
    tasksCompleted: done.length,
    tasksOnTime: done.length ? (onTime.length / done.length) * 100 : null,
    postsPublished: published.length,
    postsOnTime: published.length ? (publishedOnTime.length / published.length) * 100 : null,
    reviewsCompleted: scope.departmentId && scope.departmentId !== 'marketing' && !scope.userId ? 0 : reviews.length,
    openOverdue: tasks.filter((task) => isTaskOverdue(task, nowMs)).length + items.filter((item) => isOverdue(item, nowMs)).length,
  };
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

export function creditUsage(state: WorkspaceState, nowMs: number): CreditUsage[] {
  const month = monthKey(nowMs);
  return state.wallets
    .filter((wallet) => wallet.month === month)
    .map((wallet) => {
      const byKind: Record<CreditKind, number> = { text: 0, image: 0, video: 0 };
      for (const tx of state.transactions) if (tx.departmentId === wallet.departmentId && DateTime.fromISO(tx.at, { zone: businessZone() }).toFormat('yyyy-LL') === month) byKind[tx.kind] += tx.amount;
      const used = byKind.text + byKind.image + byKind.video;
      return { departmentId: wallet.departmentId, budget: wallet.budget, used, available: Math.max(0, wallet.budget - used), share: wallet.budget ? (used / wallet.budget) * 100 : 0, byKind };
    });
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

export function courseSignals(state: WorkspaceState, nowMs: number): CourseSignals {
  const today = zoned(nowMs).toISODate() ?? '';
  const inDays = (days: number) => zoned(nowMs).plus({ days }).toISODate() ?? '';
  const hasContent = (course: Course, templates: string[], publishedOnly = false) =>
    state.content.some((item) => item.courseId === course.id && item.templateId && templates.includes(item.templateId) && (publishedOnly ? item.status === 'published' : item.status !== 'cancelled'));
  const courses = [...state.courses].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return {
    startingSoon: courses.filter((course) => course.startDate > today && course.startDate <= inDays(7)),
    startingToday: courses.filter((course) => course.startDate === today),
    endingToday: courses.filter((course) => course.endDate === today),
    running: courses.filter((course) => course.startDate <= today && course.endDate >= today),
    firstSessionNeeded: courses.filter((course) => course.startDate >= today && course.startDate <= inDays(7) && !hasContent(course, ['t-first-session'])),
    // Ended in the last two weeks and the evaluation/finished post is not live yet.
    evaluationNeeded: courses.filter((course) => course.endDate <= today && course.endDate >= inDays(-14) && !hasContent(course, ['t-course-finished', 't-evaluation-video'], true)),
    missingInfo: courses.filter((course) => course.endDate >= today && (course.studentCount == null || !course.lecturerId)),
  };
}

export const userById = (state: WorkspaceState, id: string | null | undefined) => (id ? state.users.find((user) => user.id === id) ?? null : null);
