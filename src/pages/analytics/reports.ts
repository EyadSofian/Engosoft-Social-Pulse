import { byAccount, MATURITY_DAYS, reachBasis, summarize, WEEK_ORDER, type GroupRow, type Summary } from '../../lib/analytics';
import { PLATFORMS } from '../../lib/platforms';
import type { Platform, Post } from '../../types';
import type { Text } from '../../domain/shared';

/**
 * The reports under the headline numbers: best and worst posts on each platform, and how
 * content type, day, hour and the kind of interaction relate to results. Pure functions over
 * the posts already in scope, so the page and both exports read the same numbers.
 */

export type RankBy = 'rate' | 'interactions' | 'reach';
export const RANK_BY: RankBy[] = ['rate', 'interactions', 'reach'];
export const isRankBy = (value: string | null): value is RankBy => RANK_BY.includes(value as RankBy);

/** Best and worst posts shown for each platform. */
export const RANK_PER_PLATFORM = 3;

/**
 * A post seen by a handful of people can show a huge rate from two likes. For the rate,
 * a post has to reach at least this share of the platform's typical post to be ranked.
 */
const RATE_FLOOR = 0.25;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Interactions ÷ reach (or views, then impressions) × 100, the same way the period's rate is worked out. */
export function postRate(post: Post): number | null {
  const basis = reachBasis(post);
  return post.measured && basis != null && basis > 0 ? (post.interactions / basis) * 100 : null;
}

export function rankValue(post: Post, by: RankBy): number | null {
  if (by === 'interactions') return post.measured ? post.interactions : null;
  if (by === 'reach') return reachBasis(post) ?? null;
  return postRate(post);
}

export interface Ranked {
  post: Post;
  value: number;
  /** The post's value ÷ the platform's median post; null when the median is zero. */
  vsMedian: number | null;
}

export interface PlatformRanking {
  platform: Platform;
  /** The middle post's value among the ranked posts. */
  median: number | null;
  ranked: number;
  /** Posts left out: too new to have settled, no number from the platform, or (for the rate) seen by too few people. */
  unranked: number;
  best: Ranked[];
  worst: Ranked[];
}

/**
 * Each platform ranked on its own, because the platforms count differently (YouTube gives views,
 * Facebook gives reach). Posts younger than two days are left out: their numbers are still growing.
 */
export function bestAndWorst(posts: Post[], todayNum: number, by: RankBy, limit = RANK_PER_PLATFORM): PlatformRanking[] {
  return PLATFORMS.flatMap((platform) => {
    const own = posts.filter((post) => post.platform === platform);
    if (!own.length) return [];
    const settled = own.filter((post) => todayNum - post.dayNum >= MATURITY_DAYS);
    let pool = settled.flatMap((post) => {
      const value = rankValue(post, by);
      return value == null ? [] : [{ post, value }];
    });
    if (by === 'rate') {
      const typical = median(pool.map((entry) => reachBasis(entry.post) ?? 0));
      if (typical) pool = pool.filter((entry) => (reachBasis(entry.post) ?? 0) >= typical * RATE_FLOOR);
    }
    pool.sort((a, b) => b.value - a.value || b.post.ts - a.post.ts);
    const middle = median(pool.map((entry) => entry.value));
    const withMedian = (entry: { post: Post; value: number }): Ranked => ({ ...entry, vsMedian: middle ? entry.value / middle : null });
    const bestCount = Math.min(limit, Math.ceil(pool.length / 2));
    const worstCount = Math.min(limit, pool.length - bestCount);
    return [
      {
        platform,
        median: middle,
        ranked: pool.length,
        unranked: own.length - pool.length,
        best: pool.slice(0, bestCount).map(withMedian),
        worst: pool.slice(pool.length - worstCount).reverse().map(withMedian),
      },
    ];
  });
}

/* ── Content type ───────────────────────────────────────────────────── */

const TYPE_ALIASES: Record<string, string> = { carousel_album: 'carousel', multi_image: 'carousel', '': 'post', text: 'post' };
export const contentTypeOf = (post: Post) => {
  const raw = post.contentType.trim().toLowerCase();
  return TYPE_ALIASES[raw] ?? raw;
};

export interface TypeRow extends Summary {
  platform: Platform;
  type: string;
  /** Interactions on the middle post; less swayed by one viral post than the average. */
  medianInteractions: number | null;
}

export function byContentType(posts: Post[]): TypeRow[] {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const key = `${post.platform}|${contentTypeOf(post)}`;
    const list = groups.get(key);
    if (list) list.push(post);
    else groups.set(key, [post]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const [platform, type] = key.split('|') as [Platform, string];
      return { platform, type, ...summarize(list), medianInteractions: median(list.filter((post) => post.measured).map((post) => post.interactions)) };
    })
    .sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform) || b.count - a.count);
}

/* ── Days and hours ─────────────────────────────────────────────────── */

export interface TimeRow extends Summary {
  /** Luxon weekday (1 = Monday) for days; the first hour of the block for hours. */
  key: number;
  /** The highest interactions per post among rows with at least two measured posts. */
  best: boolean;
}

/** Hours of the day in four-hour blocks, in the business timezone. */
export const HOUR_BLOCK = 4;

function markBest(rows: TimeRow[]): TimeRow[] {
  const candidates = rows.filter((row) => row.measured >= 2 && row.average != null);
  const top = candidates.reduce<TimeRow | null>((best, row) => (!best || (row.average ?? 0) > (best.average ?? 0) ? row : best), null);
  return rows.map((row) => ({ ...row, best: top != null && row === top && (top.average ?? 0) > 0 }));
}

export function byWeekday(posts: Post[]): TimeRow[] {
  const dated = posts.filter((post) => post.ts);
  return markBest(WEEK_ORDER.map((weekday) => ({ key: weekday, best: false, ...summarize(dated.filter((post) => post.weekday === weekday)) })));
}

export function byHourBlock(posts: Post[]): TimeRow[] {
  const dated = posts.filter((post) => post.ts);
  const blocks = Array.from({ length: 24 / HOUR_BLOCK }, (_, index) => index * HOUR_BLOCK);
  return markBest(blocks.map((start) => ({ key: start, best: false, ...summarize(dated.filter((post) => post.hour >= start && post.hour < start + HOUR_BLOCK)) })));
}

/* ── Interaction mix ────────────────────────────────────────────────── */

export const MIX_KEYS = ['likes', 'comments', 'shares', 'saves', 'clicks'] as const;
export type MixKey = (typeof MIX_KEYS)[number];

export interface MixCell {
  /** Null when no post on this platform reported the number. */
  total: number | null;
  /** Per 100 people reached, over the posts that reported both; null without a basis. */
  rate: number | null;
}

export interface MixRow {
  platform: Platform;
  posts: number;
  cells: Record<MixKey, MixCell>;
}

/** What people did on each platform: likes, comments, shares, saves and clicks, and each per 100 reached. */
export function interactionMix(posts: Post[]): MixRow[] {
  return PLATFORMS.flatMap((platform) => {
    const own = posts.filter((post) => post.platform === platform);
    if (!own.length) return [];
    const cells = Object.fromEntries(
      MIX_KEYS.map((key) => {
        let total = 0;
        let reported = 0;
        let rated = 0;
        let basis = 0;
        for (const post of own) {
          const value = post.metrics[key];
          if (value == null) continue;
          total += value;
          reported++;
          const base = reachBasis(post);
          if (base != null && base > 0) {
            rated += value;
            basis += base;
          }
        }
        return [key, { total: reported ? total : null, rate: basis ? (rated / basis) * 100 : null }];
      }),
    ) as Record<MixKey, MixCell>;
    return [{ platform, posts: own.length, cells }];
  });
}

/* ── Everything together ───────────────────────────────────────────── */

export interface Reports {
  rankBy: RankBy;
  rankings: PlatformRanking[];
  types: TypeRow[];
  weekdays: TimeRow[];
  hours: TimeRow[];
  mix: MixRow[];
  /** Only filled when more than one account published in the period. */
  accounts: GroupRow[];
}

export function buildReports(posts: Post[], todayNum: number, rankBy: RankBy): Reports {
  const accounts = byAccount(posts);
  return {
    rankBy,
    rankings: bestAndWorst(posts, todayNum, rankBy),
    types: byContentType(posts),
    weekdays: byWeekday(posts),
    hours: byHourBlock(posts),
    mix: interactionMix(posts),
    accounts: accounts.length > 1 ? accounts : [],
  };
}

/* ── Names, shared by the page and both exports ─────────────────────── */


export const RANK_LABEL: Record<RankBy, Text> = {
  rate: { en: 'Engagement rate', ar: 'معدل التفاعل' },
  interactions: { en: 'Interactions', ar: 'التفاعلات' },
  reach: { en: 'Reach', ar: 'الوصول' },
};

const TYPE_LABEL: Record<string, Text> = {
  post: { en: 'Post', ar: 'منشور' },
  image: { en: 'Image', ar: 'صورة' },
  video: { en: 'Video', ar: 'فيديو' },
  carousel: { en: 'Carousel', ar: 'كاروسيل' },
  reel: { en: 'Reel', ar: 'ريلز' },
  reels: { en: 'Reel', ar: 'ريلز' },
  story: { en: 'Story', ar: 'ستوري' },
  spotlight: { en: 'Spotlight', ar: 'سبوتلايت' },
  article: { en: 'Article', ar: 'مقال' },
  document: { en: 'Document', ar: 'مستند' },
  poll: { en: 'Poll', ar: 'استطلاع' },
};

export const typeLabel = (type: string): Text => TYPE_LABEL[type] ?? { en: type.charAt(0).toUpperCase() + type.slice(1), ar: type };

export const WEEKDAY_LABEL: Record<number, Text> = {
  1: { en: 'Monday', ar: 'الاثنين' },
  2: { en: 'Tuesday', ar: 'الثلاثاء' },
  3: { en: 'Wednesday', ar: 'الأربعاء' },
  4: { en: 'Thursday', ar: 'الخميس' },
  5: { en: 'Friday', ar: 'الجمعة' },
  6: { en: 'Saturday', ar: 'السبت' },
  7: { en: 'Sunday', ar: 'الأحد' },
};

const pad = (hour: number) => String(hour % 24).padStart(2, '0');
export const hourBlockLabel = (start: number) => `${pad(start)}:00–${pad(start + HOUR_BLOCK)}:00`;

export const MIX_LABEL: Record<MixKey, Text> = {
  likes: { en: 'Likes', ar: 'إعجابات' },
  comments: { en: 'Comments', ar: 'تعليقات' },
  shares: { en: 'Shares', ar: 'مشاركات' },
  saves: { en: 'Saves', ar: 'حفظ' },
  clicks: { en: 'Clicks', ar: 'نقرات' },
};
