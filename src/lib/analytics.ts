import type {
  ApiDashboard,
  Connector,
  Dashboard,
  Plan,
  PlanPatch,
  PlanState,
  Platform,
  Post,
  WebsiteDay,
  WebsitePageDay,
} from '../types';
import { dayKeyOf, dayNumber, inZone, parseTimestamp, setBusinessZone, zoneNow } from './format';
import { PLATFORMS } from './platforms';

export type Period = 7 | 30 | 90 | 365;
export const PERIODS: { value: Period; label: string; long: string; previous: string }[] = [
  { value: 7, label: '7 أيام', long: 'آخر 7 أيام', previous: 'عن الـ7 أيام السابقة' },
  { value: 30, label: '30 يوم', long: 'آخر 30 يومًا', previous: 'عن الـ30 يومًا السابقة' },
  { value: 90, label: '90 يوم', long: 'آخر 90 يومًا', previous: 'عن الـ90 يومًا السابقة' },
  { value: 365, label: 'سنة', long: 'آخر 12 شهرًا', previous: 'عن الـ12 شهرًا السابقة' },
];
export const periodLong = (period: Period) => PERIODS.find((item) => item.value === period)?.long ?? '';
export const periodPrevious = (period: Period) => PERIODS.find((item) => item.value === period)?.previous ?? '';

export interface Filters {
  platform: Platform | 'all';
  account: string;
  period: Period;
}

/* ── Normalisation ─────────────────────────────────────────────────── */

export function normalize(raw: ApiDashboard): Dashboard {
  setBusinessZone(raw.timeZone);
  const posts: Post[] = raw.posts.map((post) => {
    const parsed = parseTimestamp(post.publishedAt);
    const ts = Number.isFinite(parsed) ? parsed : 0;
    const local = inZone(ts);
    const dayNum = dayNumber(ts);
    const parts = [post.metrics.likes, post.metrics.comments, post.metrics.shares, post.metrics.saves];
    return {
      ...post,
      key: `${post.platform}:${post.externalId}`,
      ts,
      dayNum,
      day: dayKeyOf(dayNum),
      month: local.toFormat('yyyy-LL'),
      hour: local.hour,
      weekday: local.weekday,
      measured: parts.some((value) => value != null),
      interactions: parts.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    };
  });
  const plans: Plan[] = raw.plans.map((plan) => {
    const ts = parseTimestamp(plan.scheduledAt);
    const dayNum = dayNumber(ts);
    return { ...plan, ts, dayNum, day: dayKeyOf(dayNum) };
  });
  const connectors: Connector[] = PLATFORMS.map(
    (platform) =>
      raw.connectors.find((item) => item.platform === platform) ?? {
        platform,
        status: 'needs_setup',
        message: 'لم تتم المزامنة بعد.',
        checkedAt: '',
      },
  );
  return { ...raw, posts, plans, connectors };
}

export const EMPTY_DASHBOARD: Dashboard = normalize({
  generatedAt: '',
  timeZone: 'Africa/Cairo',
  posts: [],
  plans: [],
  alerts: [],
  connectors: [],
  website: [],
  websitePages: [],
});

/* ── Scoping ───────────────────────────────────────────────────────── */

export interface AccountOption {
  id: string;
  name: string;
  platform: Platform;
  count: number;
}

export function accountsOf(posts: Post[], platform: Platform | 'all'): AccountOption[] {
  const map = new Map<string, AccountOption>();
  for (const post of posts) {
    if (!post.accountId || (platform !== 'all' && post.platform !== platform)) continue;
    const hit = map.get(post.accountId);
    if (hit) hit.count++;
    else map.set(post.accountId, { id: post.accountId, name: post.accountName || post.accountId, platform: post.platform, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function scopePosts(posts: Post[], filters: Pick<Filters, 'platform' | 'account'>): Post[] {
  if (filters.platform === 'all' && filters.account === 'all') return posts;
  return posts.filter(
    (post) =>
      (filters.platform === 'all' || post.platform === filters.platform) &&
      (filters.account === 'all' || post.accountId === filters.account),
  );
}

export const todayNumber = (now: number) => dayNumber(now);

/** Current window = today and the `period - 1` days before it; previous = the same length right before. */
export function splitByPeriod(posts: Post[], period: number, todayNum: number) {
  const current: Post[] = [];
  const previous: Post[] = [];
  for (const post of posts) {
    const age = todayNum - post.dayNum;
    if (age < 0) continue;
    if (age < period) current.push(post);
    else if (age < period * 2) previous.push(post);
  }
  return { current, previous };
}

/* ── Summaries ─────────────────────────────────────────────────────── */

export interface Summary {
  count: number;
  measured: number;
  interactions: number;
  /** Interactions per measured post. */
  average: number | null;
  /** Share of posts that returned interaction metrics, 0–100. */
  coverage: number | null;
  reach: number;
  reachCount: number;
  views: number;
  viewsCount: number;
  rate: number | null;
}

export function summarize(posts: Post[]): Summary {
  let measured = 0;
  let interactions = 0;
  let reach = 0;
  let reachCount = 0;
  let views = 0;
  let viewsCount = 0;
  let rateSum = 0;
  let rateCount = 0;
  for (const post of posts) {
    if (post.measured) {
      measured++;
      interactions += post.interactions;
    }
    if (post.metrics.reach != null) {
      reach += post.metrics.reach;
      reachCount++;
    }
    if (post.metrics.views != null) {
      views += post.metrics.views;
      viewsCount++;
    }
    if (post.engagementRate != null) {
      rateSum += post.engagementRate;
      rateCount++;
    }
  }
  return {
    count: posts.length,
    measured,
    interactions,
    average: measured ? interactions / measured : null,
    coverage: posts.length ? (measured / posts.length) * 100 : null,
    reach,
    reachCount,
    views,
    viewsCount,
    rate: rateCount ? rateSum / rateCount : null,
  };
}

/** Percentage change; null when there is no baseline to compare against. */
export const change = (current: number | null, previous: number | null) =>
  current == null || previous == null || previous === 0 ? null : ((current - previous) / previous) * 100;

export interface TrendPoint {
  key: string;
  /** First and last business-day number covered by the bucket. */
  from: number;
  to: number;
  posts: number;
  interactions: number;
  measured: number;
}

/** Daily buckets, or weekly ones once the window is too long to read day by day. */
export function buildTrend(posts: Post[], period: number, todayNum: number): TrendPoint[] {
  const size = period > 120 ? 7 : 1;
  const count = Math.ceil(period / size);
  const points: TrendPoint[] = Array.from({ length: count }, (_, index) => {
    const to = todayNum - (count - 1 - index) * size;
    const from = to - size + 1;
    return { key: dayKeyOf(from), from, to, posts: 0, interactions: 0, measured: 0 };
  });
  for (const post of posts) {
    const age = todayNum - post.dayNum;
    if (age < 0) continue;
    const index = count - 1 - Math.floor(age / size);
    if (index < 0) continue;
    const point = points[index];
    point.posts++;
    if (post.measured) {
      point.measured++;
      point.interactions += post.interactions;
    }
  }
  return points;
}

export function topPosts(posts: Post[], limit: number): Post[] {
  return posts
    .filter((post) => post.measured)
    .sort((a, b) => b.interactions - a.interactions || b.ts - a.ts)
    .slice(0, limit);
}

export const latestPosts = (posts: Post[], limit: number) => [...posts].sort((a, b) => b.ts - a.ts).slice(0, limit);

export interface MonthRow extends Summary {
  key: string;
  start: number;
  isCurrent: boolean;
}

export function monthlyRows(posts: Post[], months: number, now: number): MonthRow[] {
  const first = zoneNow(now).startOf('month');
  const buckets = new Map<string, Post[]>();
  const order: { key: string; start: number }[] = [];
  for (let back = months - 1; back >= 0; back--) {
    const month = first.minus({ months: back });
    const key = month.toFormat('yyyy-LL');
    buckets.set(key, []);
    order.push({ key, start: month.toMillis() });
  }
  for (const post of posts) buckets.get(post.month)?.push(post);
  return order.map(({ key, start }, index) => ({
    key,
    start,
    isCurrent: index === order.length - 1,
    ...summarize(buckets.get(key) ?? []),
  }));
}

/** Luxon weekday numbers in display order: the business week starts on Saturday. */
export const WEEK_ORDER = [6, 7, 1, 2, 3, 4, 5];
export const WEEKDAY_NAMES: Record<number, string> = {
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
  7: 'الأحد',
};

export interface HeatCell {
  weekday: number;
  hour: number;
  count: number;
  interactions: number;
  measured: number;
}

export interface Heat {
  rows: { weekday: number; cells: HeatCell[]; total: number }[];
  max: number;
  total: number;
  best: HeatCell | null;
}

export function heatmap(posts: Post[]): Heat {
  const rows = WEEK_ORDER.map((weekday) => ({
    weekday,
    total: 0,
    cells: Array.from({ length: 24 }, (_, hour): HeatCell => ({ weekday, hour, count: 0, interactions: 0, measured: 0 })),
  }));
  const byWeekday = new Map(rows.map((row) => [row.weekday, row]));
  let max = 0;
  let best: HeatCell | null = null;
  for (const post of posts) {
    if (!post.ts) continue;
    const row = byWeekday.get(post.weekday);
    if (!row) continue;
    const cell = row.cells[post.hour];
    cell.count++;
    row.total++;
    if (post.measured) {
      cell.measured++;
      cell.interactions += post.interactions;
    }
    if (cell.count > max) {
      max = cell.count;
      best = cell;
    }
  }
  return { rows, max, total: posts.length, best };
}

export interface GroupRow extends Summary {
  id: string;
  name: string;
  platform: Platform;
}

export function byPlatform(posts: Post[]): GroupRow[] {
  return PLATFORMS.map((platform) => ({
    id: platform,
    name: platform,
    platform,
    ...summarize(posts.filter((post) => post.platform === platform)),
  }));
}

export function byAccount(posts: Post[]): GroupRow[] {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const key = `${post.platform}:${post.accountId}`;
    const list = groups.get(key);
    if (list) list.push(post);
    else groups.set(key, [post]);
  }
  return [...groups.entries()]
    .map(([id, list]) => ({ id, name: list[0].accountName || list[0].accountId || '—', platform: list[0].platform, ...summarize(list) }))
    .sort((a, b) => b.count - a.count);
}

/* ── Content plan ──────────────────────────────────────────────────── */

export interface PlanStats {
  total: number;
  published: number;
  attention: number;
  upcoming: number;
  draft: number;
  /** Confirmed ÷ (confirmed + due + missed), 0–100; null until something is due. */
  execution: number | null;
}

export function planStats(plans: Plan[]): PlanStats {
  const counts: Record<PlanState, number> = { published: 0, upcoming: 0, due: 0, missed: 0, draft: 0, cancelled: 0 };
  for (const plan of plans) counts[plan.computedState]++;
  const attention = counts.due + counts.missed;
  const settled = counts.published + attention;
  return {
    total: plans.length - counts.cancelled,
    published: counts.published,
    attention,
    upcoming: counts.upcoming,
    draft: counts.draft,
    execution: settled ? (counts.published / settled) * 100 : null,
  };
}

const ATTENTION_RANK: Record<PlanState, number> = { missed: 0, due: 1, upcoming: 2, draft: 3, published: 4, cancelled: 5 };

/** Overdue first, then what is coming next. */
export function radar(plans: Plan[], limit: number): Plan[] {
  return plans
    .filter((plan) => plan.computedState === 'missed' || plan.computedState === 'due' || plan.computedState === 'upcoming')
    .sort((a, b) => {
      const rank = ATTENTION_RANK[a.computedState] - ATTENTION_RANK[b.computedState];
      if (rank) return rank;
      return a.computedState === 'upcoming' ? a.ts - b.ts : b.ts - a.ts;
    })
    .slice(0, limit);
}

/**
 * Applies a calendar move or status change locally so the grid updates before the server answers.
 * The next dashboard load replaces it with the server's computed state.
 */
export function patchPlanLocally(plan: Plan, patch: PlanPatch, now: number, graceMinutes = 15): Plan {
  const next = { ...plan, ...patch };
  const ts = parseTimestamp(next.scheduledAt);
  const dayNum = dayNumber(ts);
  let state: PlanState;
  if (next.status === 'cancelled') state = 'cancelled';
  else if (next.status === 'published' || (plan.computedState === 'published' && next.status !== 'draft')) state = 'published';
  else if (next.status === 'draft') state = 'draft';
  else if (now < ts) state = 'upcoming';
  else state = now < ts + graceMinutes * 60_000 ? 'due' : 'missed';
  return { ...next, ts, dayNum, day: dayKeyOf(dayNum), computedState: state };
}

/* ── Best time to post ─────────────────────────────────────────────── */

export interface Slot {
  /** Luxon weekday, or 0 when the slot is an hour of any day. */
  weekday: number;
  hour: number;
  posts: number;
  /** Interactions per measured post in this slot. */
  average: number;
}

const SLOT_MINIMUM = 2;

function rankSlots(posts: Post[], keyOf: (post: Post) => number, weekdayOf: (post: Post) => number): Slot[] {
  const buckets = new Map<number, Slot>();
  for (const post of posts) {
    const key = keyOf(post);
    const hit = buckets.get(key);
    if (hit) {
      hit.average += post.interactions;
      hit.posts++;
    } else buckets.set(key, { weekday: weekdayOf(post), hour: post.hour, posts: 1, average: post.interactions });
  }
  return [...buckets.values()]
    .filter((slot) => slot.posts >= SLOT_MINIMUM)
    .map((slot) => ({ ...slot, average: slot.average / slot.posts }))
    .sort((a, b) => b.average - a.average || b.posts - a.posts);
}

/**
 * Slots ranked by average interactions on measured posts from the last year.
 * A slot needs at least two posts; when no weekday/hour slot has that many, hours of any day are ranked instead.
 */
export function bestSlots(posts: Post[], todayNum: number): Slot[] {
  const recent = posts.filter((post) => post.ts && post.measured && todayNum - post.dayNum <= 365);
  const byWeekday = rankSlots(recent, (post) => post.weekday * 24 + post.hour, (post) => post.weekday);
  return byWeekday.length ? byWeekday : rankSlots(recent, (post) => post.hour, () => 0);
}

export const slotDay = (slot: Slot) => (slot.weekday ? WEEKDAY_NAMES[slot.weekday] : 'أي يوم');

/** The strongest hour for each weekday, from `bestSlots`. */
export function bestHourByWeekday(slots: Slot[]): Map<number, Slot> {
  const map = new Map<number, Slot>();
  for (const slot of slots) {
    if (slot.average <= 0) continue;
    for (const weekday of slot.weekday ? [slot.weekday] : [1, 2, 3, 4, 5, 6, 7]) if (!map.has(weekday)) map.set(weekday, slot);
  }
  return map;
}

/* ── Website (GA4) ─────────────────────────────────────────────────── */

export function websiteTotals(days: WebsiteDay[], period: number, todayNum: number) {
  const since = dayKeyOf(todayNum - period + 1);
  const before = dayKeyOf(todayNum - period * 2 + 1);
  let views = 0;
  let sessions = 0;
  let previousViews = 0;
  let count = 0;
  for (const day of days) {
    if (day.date >= since) {
      views += day.views;
      sessions += day.sessions;
      count++;
    } else if (day.date >= before) previousViews += day.views;
  }
  return { views, sessions, previousViews, days: count };
}

export interface PageTotal {
  path: string;
  title: string;
  views: number;
  activeUsers: number;
  engagementSeconds: number;
}

export function websitePageTotals(pages: WebsitePageDay[], period: number, todayNum: number): PageTotal[] {
  const since = dayKeyOf(todayNum - period + 1);
  const byPath = new Map<string, PageTotal>();
  for (const page of pages) {
    if (page.date < since) continue;
    const hit = byPath.get(page.path);
    if (hit) {
      hit.views += page.views;
      hit.activeUsers += page.activeUsers;
      hit.engagementSeconds += page.engagementSeconds;
    } else byPath.set(page.path, { path: page.path, title: page.title, views: page.views, activeUsers: page.activeUsers, engagementSeconds: page.engagementSeconds });
  }
  return [...byPath.values()].sort((a, b) => b.views - a.views);
}

/* ── Alerts ────────────────────────────────────────────────────────── */

export type AlertPhase = 'missed' | 'due' | 'reminder';

/**
 * The server keeps a reminder ("خلال 40 دقيقة") after its post time has passed.
 * Re-derive the phase from the plan so the list never shows a stale countdown.
 */
export function alertPhase(kind: string, plan: Plan | undefined, now: number): AlertPhase {
  if (kind === 'missed') return 'missed';
  return plan && plan.ts <= now ? 'due' : 'reminder';
}
