import type { Text } from '../../domain/shared';
import { summarize, type Summary } from '../../lib/analytics';
import { PLATFORMS } from '../../lib/platforms';
import type { Platform, Post, Reach } from '../../types';
import { contentTypeOf } from './reports';

export const REACH_KINDS: Reach[] = ['organic', 'paid'];

export const REACH_LABEL: Record<Reach, Text> = {
  organic: { en: 'Organic', ar: 'أورجانيك' },
  paid: { en: 'Paid', ar: 'ممول' },
};

/** True when the post passes the organic/paid and content-type filters. */
export const inScope = (post: Post, scope: { reach: Reach | 'all'; type: string }) =>
  (scope.reach === 'all' || post.reachKind === scope.reach) && (scope.type === 'all' || contentTypeOf(post) === scope.type);

export const isReach = (value: string | null): value is Reach => value === 'organic' || value === 'paid';

/** One side of the split: the usual summary of its posts, plus what the ads behind them delivered and cost. */
export interface ReachGroup extends Summary {
  kind: Reach;
  /** Views that came from ads, and the rest, over the posts that reported the split. */
  paidViews: number | null;
  organicViews: number | null;
  /** Summed over the ads that used these posts (ads accounts only). */
  adReach: number | null;
  adImpressions: number | null;
  adClicks: number | null;
  spend: number | null;
  /** The ads accounts' currency; empty when none, "mixed" when the accounts differ. */
  currency: string;
}

export interface ReachSplitRow {
  platform: Platform;
  organic: ReachGroup;
  paid: ReachGroup;
}

export interface ReachSplit {
  organic: ReachGroup;
  paid: ReachGroup;
  /** Platforms with at least one post, in the platform order. */
  platforms: ReachSplitRow[];
  /** Posts whose kind nobody could tell (counted as organic). */
  unknown: number;
}

const add = (total: number | null, value: number | null | undefined) => (value == null ? total : (total ?? 0) + value);

export function reachGroup(posts: Post[], kind: Reach): ReachGroup {
  const mine = posts.filter((post) => post.reachKind === kind);
  let paidViews: number | null = null;
  let organicViews: number | null = null;
  let adReach: number | null = null;
  let adImpressions: number | null = null;
  let adClicks: number | null = null;
  let spend: number | null = null;
  const currencies = new Set<string>();
  for (const post of mine) {
    const promotion = post.promotion;
    if (!promotion) continue;
    paidViews = add(paidViews, promotion.paidViews);
    organicViews = add(organicViews, promotion.organicViews);
    adReach = add(adReach, promotion.adReach);
    adImpressions = add(adImpressions, promotion.adImpressions);
    adClicks = add(adClicks, promotion.adClicks);
    spend = add(spend, promotion.spend);
    if (promotion.spend != null && promotion.currency) currencies.add(promotion.currency);
  }
  return {
    kind,
    ...summarize(mine),
    paidViews,
    organicViews,
    adReach,
    adImpressions,
    adClicks,
    spend,
    currency: currencies.size > 1 ? 'mixed' : ([...currencies][0] ?? ''),
  };
}

/** Organic posts against paid posts, overall and on each platform. */
export function buildReachSplit(posts: Post[]): ReachSplit {
  return {
    organic: reachGroup(posts, 'organic'),
    paid: reachGroup(posts, 'paid'),
    platforms: PLATFORMS.flatMap((platform) => {
      const mine = posts.filter((post) => post.platform === platform);
      return mine.length ? [{ platform, organic: reachGroup(mine, 'organic'), paid: reachGroup(mine, 'paid') }] : [];
    }),
    unknown: posts.filter((post) => post.reachKindBy === 'unknown').length,
  };
}

/** "SAR 1,250" (Latin digits, like every number in the app); the bare number when the currency is unknown or mixed. */
export function money(value: number | null, currency: string): string {
  if (value == null) return '—';
  if (currency && currency !== 'mixed') {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(value);
    } catch {
      /* Not an ISO currency code: fall through to the number. */
    }
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
