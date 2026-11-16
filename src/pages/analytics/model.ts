import { useMemo } from 'react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { useClock } from '../../features/workspace/hooks';
import {
  accountsOf,
  buildTrend,
  byPlatform,
  change,
  scopePosts,
  splitByPeriod,
  summarize,
  type AccountOption,
  type GroupRow,
  type Period,
  type Summary,
  type TrendPoint,
} from '../../lib/analytics';
import { dayNumber } from '../../lib/format';
import type { Platform, Post } from '../../types';
import { buildAudience, type PlatformAudience } from './audience';
import { contentTypeOf } from './reports';

export interface Scope {
  period: Period;
  platform: Platform | 'all';
  account: string;
  /** A content type from contentTypeOf (post, video, reel…), or 'all'. */
  type: string;
}

/** The five headline numbers, each with its change against the period before. */
export type KpiKey = 'posts' | 'reach' | 'views' | 'interactions' | 'rate';

export interface Kpi {
  key: KpiKey;
  value: number | null;
  previous: number | null;
  /** Percent change for counts, percentage points for the rate; null when there is nothing to compare. */
  change: number | null;
  /** The number in each bucket of the trend (day, or week for the year view); null where it was not reported. */
  series: (number | null)[];
}

/** Each KPI's value inside one bucket, from the same summary the headline uses. */
function seriesValue(key: KpiKey, summary: Summary): number | null {
  if (key === 'posts') return summary.count;
  if (key === 'reach') return summary.reachCount ? summary.reach : summary.count ? null : 0;
  if (key === 'views') return summary.viewsCount ? summary.views : summary.count ? null : 0;
  if (key === 'interactions') return summary.measured ? summary.interactions : summary.count ? null : 0;
  return summary.rate;
}

export interface AnalyticsModel {
  now: number;
  todayNum: number;
  scope: Scope;
  /** Posts published inside the window, after the platform and account filters, newest first. */
  posts: Post[];
  summary: Summary;
  kpis: Kpi[];
  trend: TrendPoint[];
  /** Weekly buckets for the year view, daily otherwise. */
  weekly: boolean;
  /** Days in the rolling window behind each point of the tiles' trend lines; 0 when each point is one bucket. */
  kpiWindow: number;
  /** Platforms that published in the window, busiest first. */
  platforms: GroupRow[];
  accountOptions: AccountOption[];
  /** Content types published on the platforms and accounts in scope, most used first. */
  typeOptions: string[];
  /** Followers and demographics for the platforms and accounts in scope. */
  audience: PlatformAudience[];
  lastCheck: number;
}

function kpisOf(current: Summary, previous: Summary, buckets: Summary[]): Kpi[] {
  const pair = (key: KpiKey, value: number | null, before: number | null): Kpi => ({
    key,
    value,
    previous: before,
    change: key === 'rate' ? (value == null || before == null ? null : value - before) : change(value, before),
    series: buckets.map((bucket) => seriesValue(key, bucket)),
  });
  return [
    pair('posts', current.count, previous.count),
    pair('reach', current.reachCount ? current.reach : null, previous.reachCount ? previous.reach : null),
    pair('views', current.viewsCount ? current.views : null, previous.viewsCount ? previous.views : null),
    pair('interactions', current.measured ? current.interactions : null, previous.measured ? previous.interactions : null),
    pair('rate', current.rate, previous.rate),
  ];
}

/**
 * Every number on the analytics page comes from here, computed once from one scope.
 * The page reads it and the exports write it out, so the screen and the file always agree.
 */
export function useAnalytics(scope: Scope): AnalyticsModel {
  const { store } = useLiveData();
  const now = useClock();
  const data = store.data;
  const todayNum = dayNumber(now);

  const model = useMemo(() => {
    const inPlatform = scopePosts(data.posts, scope).filter((post) => post.platform !== 'website');
    const scoped = scope.type === 'all' ? inPlatform : inPlatform.filter((post) => contentTypeOf(post) === scope.type);
    const typeCounts = new Map<string, number>();
    for (const post of inPlatform) typeCounts.set(contentTypeOf(post), (typeCounts.get(contentTypeOf(post)) ?? 0) + 1);
    const { current, previous } = splitByPeriod(scoped, scope.period, todayNum);
    const summary = summarize(current);
    const trend = buildTrend(current, scope.period, todayNum);
    // The tiles' trend lines: a day with no post would drop the line to zero, so 30 and 90 days use a rolling
    // 7-day window ending on each day (reaching into the period before for the first days); 7 days and the
    // year view (already weekly) use the trend's own buckets.
    const kpiWindow = scope.period > 7 && scope.period <= 120 ? 7 : 0;
    const bucketPosts = trend.map((point) => {
      const from = kpiWindow ? point.to - kpiWindow + 1 : point.from;
      return scoped.filter((post) => post.dayNum >= from && post.dayNum <= point.to);
    });
    return {
      todayNum,
      scope,
      posts: [...current].sort((a, b) => b.ts - a.ts),
      summary,
      kpis: kpisOf(summary, summarize(previous), bucketPosts.map(summarize)),
      trend,
      kpiWindow,
      weekly: scope.period > 120,
      platforms: byPlatform(current)
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count),
      accountOptions: accountsOf(data.posts, scope.platform),
      typeOptions: [...typeCounts.entries()].filter(([type]) => type).sort((a, b) => b[1] - a[1]).map(([type]) => type),
      audience: buildAudience(data.audience, scope, scope.period, todayNum),
      lastCheck: data.connectors.reduce((latest, entry) => Math.max(latest, entry.checkedAt ? Date.parse(entry.checkedAt) : 0), 0),
    };
    // The scope object is rebuilt on every render; its fields are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, scope.period, scope.platform, scope.account, scope.type, todayNum]);

  return { ...model, now };
}
