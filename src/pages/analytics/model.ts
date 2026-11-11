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

export interface Scope {
  period: Period;
  platform: Platform | 'all';
  account: string;
}

/** The five headline numbers, each with its change against the period before. */
export type KpiKey = 'posts' | 'reach' | 'views' | 'interactions' | 'rate';

export interface Kpi {
  key: KpiKey;
  value: number | null;
  previous: number | null;
  /** Percent change for counts, percentage points for the rate; null when there is nothing to compare. */
  change: number | null;
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
  /** Platforms that published in the window, busiest first. */
  platforms: GroupRow[];
  accountOptions: AccountOption[];
  lastCheck: number;
}

function kpisOf(current: Summary, previous: Summary): Kpi[] {
  const pair = (key: KpiKey, value: number | null, before: number | null): Kpi => ({
    key,
    value,
    previous: before,
    change: key === 'rate' ? (value == null || before == null ? null : value - before) : change(value, before),
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
    const scoped = scopePosts(data.posts, scope).filter((post) => post.platform !== 'website');
    const { current, previous } = splitByPeriod(scoped, scope.period, todayNum);
    const summary = summarize(current);
    return {
      todayNum,
      scope,
      posts: [...current].sort((a, b) => b.ts - a.ts),
      summary,
      kpis: kpisOf(summary, summarize(previous)),
      trend: buildTrend(current, scope.period, todayNum),
      weekly: scope.period > 120,
      platforms: byPlatform(current)
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count),
      accountOptions: accountsOf(data.posts, scope.platform),
      lastCheck: data.connectors.reduce((latest, entry) => Math.max(latest, entry.checkedAt ? Date.parse(entry.checkedAt) : 0), 0),
    };
    // The scope object is rebuilt on every render; its three fields are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, scope.period, scope.platform, scope.account, todayNum]);

  return { ...model, now };
}
