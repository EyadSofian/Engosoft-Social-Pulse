/**
 * Turns each Apify actor's items into one post shape. Only what the platform shows publicly: reactions, comments,
 * shares and (TikTok) views. A count the actor did not return stays null; it is never turned into zero.
 */
import type { Competitor, RadarPlatform } from './competitors.js';

export type PostFormat = 'image' | 'carousel' | 'video' | 'reel' | 'document' | 'article' | 'text' | 'slideshow';

export interface RadarPostInput {
  id: string;
  platform: RadarPlatform;
  competitorId: string;
  author: string;
  authorType: 'page' | 'person';
  url: string;
  postedAt: string;
  text: string;
  format: PostFormat;
  imageUrl: string;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
}

export interface FollowerCount { competitorId: string; platform: RadarPlatform; followers: number }

type Item = Record<string, unknown>;
const obj = (value: unknown): Item => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Item) : {});
const arr = (value: unknown): Item[] => (Array.isArray(value) ? value.filter((v): v is Item => Boolean(v) && typeof v === 'object') : []);
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);
const iso = (value: unknown): string => {
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  const parsed = Date.parse(str(value));
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString();
};
/** "22,957 followers" → 22957. */
export const followersFromText = (text: string): number | null => {
  const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([KkMm])?/);
  if (!match) return null;
  const n = Number(match[1]) * (match[2]?.toLowerCase() === 'k' ? 1e3 : match[2]?.toLowerCase() === 'm' ? 1e6 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
};

export function normalizeLinkedIn(items: Item[], competitor: Competitor): { posts: RadarPostInput[]; followers: FollowerCount[] } {
  const posts: RadarPostInput[] = [];
  let followers: number | null = null;
  for (const x of items) {
    const id = str(x.id);
    const author = obj(x.author);
    const postedAt = iso(obj(x.postedAt).date ?? obj(x.postedAt).timestamp);
    if (!id || !postedAt) continue;
    const isPage = str(author.type) === 'company';
    if (isPage && followers == null) followers = followersFromText(str(author.info));
    const images = arr(x.postImages);
    const video = obj(x.postVideo);
    const format: PostFormat = x.postVideo ? 'video' : x.document ? 'document' : x.article ? 'article' : images.length > 1 ? 'carousel' : images.length ? 'image' : 'text';
    const e = obj(x.engagement);
    posts.push({
      id: `linkedin:${id}`, platform: 'linkedin', competitorId: competitor.id, author: str(author.name), authorType: isPage ? 'page' : 'person',
      url: str(x.linkedinUrl), postedAt, text: str(x.content), format, imageUrl: str(images[0]?.url) || str(video.thumbnailUrl),
      reactions: count(e.likes), comments: count(e.comments), shares: count(e.shares), views: null,
    });
  }
  return { posts, followers: followers == null ? [] : [{ competitorId: competitor.id, platform: 'linkedin', followers }] };
}

export function normalizeFacebook(items: Item[], competitor: Competitor): { posts: RadarPostInput[]; followers: FollowerCount[] } {
  const posts: RadarPostInput[] = [];
  for (const x of items) {
    const id = str(x.postId);
    const postedAt = iso(x.time ?? x.timestamp);
    if (!id || !postedAt) continue;
    const media = arr(x.media);
    const isVideo = media.some((m) => str(m.__typename) === 'Video' || m.is_playable === true);
    const format: PostFormat = isVideo ? 'video' : media.length > 1 ? 'carousel' : media.length ? 'image' : 'text';
    const image = media.map((m) => str(m.thumbnail) || str(obj(m.photo_image).uri)).find(Boolean) ?? '';
    posts.push({
      id: `facebook:${id}`, platform: 'facebook', competitorId: competitor.id, author: str(x.pageName) || str(obj(x.user).name), authorType: 'page',
      url: str(x.url), postedAt, text: str(x.text), format, imageUrl: image,
      reactions: count(x.likes), comments: count(x.comments), shares: count(x.shares), views: null,
    });
  }
  return { posts, followers: [] };
}

/** apify/facebook-pages-scraper: one item per page. */
export function normalizeFacebookPages(items: Item[], competitor: Competitor): FollowerCount[] {
  const followers = count(items[0]?.followers);
  return followers == null ? [] : [{ competitorId: competitor.id, platform: 'facebook', followers }];
}

export function normalizeInstagram(items: Item[], competitor: Competitor): { posts: RadarPostInput[]; followers: FollowerCount[] } {
  const posts: RadarPostInput[] = [];
  const handle = competitor.accounts.instagram.toLowerCase();
  for (const x of items) {
    const code = str(x.shortCode) || str(x.id);
    const postedAt = iso(x.timestamp);
    if (!code || !postedAt) continue;
    const owner = str(x.ownerUsername);
    const type = str(x.type);
    posts.push({
      id: `instagram:${code}`, platform: 'instagram', competitorId: competitor.id, author: owner, authorType: owner.toLowerCase() === handle ? 'page' : 'person',
      url: str(x.url), postedAt, text: str(x.caption), format: type === 'Video' ? 'reel' : type === 'Sidecar' ? 'carousel' : 'image', imageUrl: str(x.displayUrl),
      reactions: count(x.likesCount), comments: count(x.commentsCount), shares: null, views: count(x.videoViewCount ?? x.videoPlayCount),
    });
  }
  return { posts, followers: [] };
}

/** apify/instagram-profile-scraper: one item per profile. */
export function normalizeInstagramProfiles(items: Item[], competitor: Competitor): FollowerCount[] {
  const followers = count(items[0]?.followersCount);
  return followers == null ? [] : [{ competitorId: competitor.id, platform: 'instagram', followers }];
}

export function normalizeTikTok(items: Item[], competitor: Competitor): { posts: RadarPostInput[]; followers: FollowerCount[] } {
  const posts: RadarPostInput[] = [];
  let followers: number | null = null;
  for (const x of items) {
    const id = str(x.id);
    const postedAt = iso(x.createTimeISO ?? x.createTime);
    if (!id || !postedAt) continue;
    const author = obj(x.authorMeta);
    followers ??= count(author.fans);
    posts.push({
      id: `tiktok:${id}`, platform: 'tiktok', competitorId: competitor.id, author: str(author.name), authorType: 'page',
      url: str(x.webVideoUrl), postedAt, text: str(x.text), format: x.isSlideshow ? 'slideshow' : 'video', imageUrl: str(obj(x.videoMeta).coverUrl),
      reactions: count(x.diggCount), comments: count(x.commentCount), shares: count(x.shareCount), views: count(x.playCount),
    });
  }
  return { posts, followers: followers == null ? [] : [{ competitorId: competitor.id, platform: 'tiktok', followers }] };
}

/** Reactions + comments + shares; null when the platform returned none of the three. */
export const interactionsOf = (p: Pick<RadarPostInput, 'reactions' | 'comments' | 'shares'>): number | null =>
  p.reactions == null && p.comments == null && p.shares == null ? null : (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
