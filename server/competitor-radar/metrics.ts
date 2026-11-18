/**
 * Every number on the radar, computed by code from the stored counts. The AI reads these numbers; it never makes them.
 * A post's level compares it with the median of the same account on the same platform.
 */
import { COMPETITORS, RADAR_PLATFORMS, type RadarPlatform } from './competitors.js';
import { interactionsOf } from './normalize.js';
import type { RadarPost } from './store.js';

export type Level = 'breakout' | 'high' | 'normal' | 'low';
const DAY = 86400000;

export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Level against the account median. A post younger than two days is still collecting reactions, so it is not judged low. */
export function levelOf(interactions: number | null, groupMedian: number | null, ageDays: number): Level | null {
  if (interactions == null) return null;
  const m = groupMedian ?? 0;
  const ratio = m > 0 ? interactions / m : interactions >= 3 ? 2 : 1;
  if (ratio >= 3 && interactions >= 5) return 'breakout';
  if (ratio >= 1.5 && interactions >= 2) return 'high';
  if (ratio <= 0.5 && ageDays >= 2) return 'low';
  return 'normal';
}

export interface ScoredPost extends RadarPost { interactions: number | null; groupMedian: number | null; level: Level | null; ageDays: number }

/** Adds interactions, the account median (over the posts given) and the level to each post. */
export function scorePosts(posts: RadarPost[], now = Date.now()): ScoredPost[] {
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    const i = interactionsOf(p);
    if (i == null) continue;
    const key = `${p.competitorId}:${p.platform}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return posts.map((p) => {
    const interactions = interactionsOf(p);
    const groupMedian = median(groups.get(`${p.competitorId}:${p.platform}`) ?? []);
    const ageDays = (now - Date.parse(p.postedAt)) / DAY;
    return { ...p, interactions, groupMedian, ageDays, level: levelOf(interactions, groupMedian, ageDays) };
  });
}

export interface AccountSummary {
  competitorId: string;
  platform: RadarPlatform;
  posts: number;
  perWeek: number;
  medianInteractions: number | null;
  medianViews: number | null;
  best: { id: string; interactions: number } | null;
  salesShare: number | null;
  followers: number | null;
  followersChange: number | null;
  lastPostAt: string | null;
}

export interface MixRow { key: string; posts: number; medianInteractions: number | null; medianPer1k: number | null }

export interface OwnSummary { platform: RadarPlatform; posts: number; perWeek: number; medianInteractions: number | null }

export interface RadarMetrics {
  windowDays: number;
  accounts: AccountSummary[];
  byPurpose: MixRow[];
  byCategory: MixRow[];
  byFormat: MixRow[];
  ours: OwnSummary[];
}

function mix(posts: ScoredPost[], key: (p: ScoredPost) => string | undefined, followers: Map<string, number>): MixRow[] {
  const groups = new Map<string, ScoredPost[]>();
  for (const p of posts) {
    const k = key(p);
    if (!k || p.interactions == null) continue;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()].map(([k, list]) => {
    const per1k = list.flatMap((p) => { const f = followers.get(`${p.competitorId}:${p.platform}`); return f ? [(1000 * (p.interactions ?? 0)) / f] : []; });
    const m = median(per1k);
    return { key: k, posts: list.length, medianInteractions: median(list.map((p) => p.interactions ?? 0)), medianPer1k: m == null ? null : Math.round(m * 100) / 100 };
  }).sort((a, b) => (b.medianInteractions ?? -1) - (a.medianInteractions ?? -1));
}

/** Engosoft's own published posts, from the connectors' observed_posts rows. */
export interface OwnPost { platform: string; publishedAt: string; likes: number | null; comments: number | null; shares: number | null }

export function buildMetrics(input: {
  posts: ScoredPost[];
  followers: { competitorId: string; platform: RadarPlatform; followers: number; before: number | null }[];
  ours: OwnPost[];
  windowDays: number;
  /** Newest stored post per "competitor:platform"; falls back to the posts given. */
  lastPosts?: Record<string, string>;
  now?: number;
}): RadarMetrics {
  const now = input.now ?? Date.now();
  const since = now - input.windowDays * DAY;
  const weeks = input.windowDays / 7;
  const inWindow = input.posts.filter((p) => Date.parse(p.postedAt) >= since);
  const followerMap = new Map(input.followers.map((f) => [`${f.competitorId}:${f.platform}`, f.followers]));
  const accounts: AccountSummary[] = [];
  for (const c of COMPETITORS) {
    for (const platform of RADAR_PLATFORMS) {
      const all = input.posts.filter((p) => p.competitorId === c.id && p.platform === platform);
      const list = inWindow.filter((p) => p.competitorId === c.id && p.platform === platform);
      const counted = list.filter((p) => p.interactions != null);
      const best = [...counted].sort((a, b) => (b.interactions ?? 0) - (a.interactions ?? 0))[0];
      const analysed = list.filter((p) => p.analysis);
      const f = input.followers.find((x) => x.competitorId === c.id && x.platform === platform);
      accounts.push({
        competitorId: c.id, platform, posts: list.length, perWeek: Math.round((list.length / weeks) * 10) / 10,
        medianInteractions: median(counted.map((p) => p.interactions ?? 0)),
        medianViews: median(list.flatMap((p) => (p.views == null ? [] : [p.views]))),
        best: best ? { id: best.id, interactions: best.interactions ?? 0 } : null,
        salesShare: analysed.length ? Math.round((100 * analysed.filter((p) => p.analysis!.hasPrice).length) / analysed.length) : null,
        followers: f?.followers ?? null, followersChange: f && f.before != null ? f.followers - f.before : null,
        lastPostAt: input.lastPosts?.[`${c.id}:${platform}`] ?? all.map((p) => p.postedAt).sort().at(-1) ?? null,
      });
    }
  }
  const ours: OwnSummary[] = RADAR_PLATFORMS.map((platform) => {
    const list = input.ours.filter((p) => p.platform === platform && Date.parse(p.publishedAt) >= since);
    const counted = list.flatMap((p) => (p.likes == null && p.comments == null && p.shares == null ? [] : [(p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0)]));
    return { platform, posts: list.length, perWeek: Math.round((list.length / weeks) * 10) / 10, medianInteractions: median(counted) };
  });
  return {
    windowDays: input.windowDays,
    accounts,
    byPurpose: mix(inWindow, (p) => p.analysis?.purpose, followerMap),
    byCategory: mix(inWindow, (p) => p.analysis?.category, followerMap),
    byFormat: mix(inWindow, (p) => p.format, followerMap),
    ours,
  };
}
