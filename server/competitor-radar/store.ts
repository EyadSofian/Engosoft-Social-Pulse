/** Radar tables: competitor posts with their latest public counts and AI reading, daily follower counts, runs and daily briefs. */
import { db, defineSchema } from '../db.js';
import type { RadarPlatform } from './competitors.js';
import type { FollowerCount, PostFormat, RadarPostInput } from './normalize.js';

defineSchema(`
CREATE TABLE IF NOT EXISTS radar_posts (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL, competitor_id TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', author_type TEXT NOT NULL DEFAULT 'page',
 url TEXT NOT NULL DEFAULT '', posted_at TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', format TEXT NOT NULL DEFAULT 'image',
 image_url TEXT NOT NULL DEFAULT '', thumb TEXT NOT NULL DEFAULT '', reactions INTEGER, comments INTEGER, shares INTEGER, views INTEGER,
 analysis_json TEXT NOT NULL DEFAULT '', analyzed_at TEXT NOT NULL DEFAULT '', first_seen_at TEXT NOT NULL, fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS radar_posts_posted ON radar_posts(posted_at);
CREATE TABLE IF NOT EXISTS radar_followers (competitor_id TEXT NOT NULL, platform TEXT NOT NULL, date TEXT NOT NULL, followers INTEGER NOT NULL, PRIMARY KEY(competitor_id, platform, date));
CREATE TABLE IF NOT EXISTS radar_runs (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL DEFAULT '',
 message TEXT NOT NULL DEFAULT '', apify_usd REAL NOT NULL DEFAULT 0, posts_new INTEGER NOT NULL DEFAULT 0, posts_updated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS radar_briefs (date TEXT PRIMARY KEY, brief_json TEXT NOT NULL, created_at TEXT NOT NULL);
`);

export interface PostAnalysis {
  purpose: 'engagement' | 'sales' | 'lead_gen' | 'trust' | 'awareness' | 'recruitment';
  category: 'offer' | 'course_promo' | 'educational' | 'proof' | 'people' | 'event_webinar' | 'saudi_market' | 'occasion' | 'partnership' | 'hiring' | 'other';
  idea: string;
  hook: string;
  cta: 'comment_keyword' | 'link' | 'dm_whatsapp' | 'register' | 'question' | 'none';
  dialect: 'saudi' | 'egyptian' | 'msa' | 'english' | 'mixed';
  hasPrice: boolean;
  design: string;
  why: string;
  lesson: string;
  lessonKind: 'copy' | 'avoid' | 'adapt';
  model: string;
}

export interface RadarPost extends RadarPostInput {
  thumb: string;
  analysis: PostAnalysis | null;
  firstSeenAt: string;
  fetchedAt: string;
}

const toPost = (r: Record<string, unknown>): RadarPost => {
  let analysis: PostAnalysis | null = null;
  try { analysis = r.analysis_json ? (JSON.parse(String(r.analysis_json)) as PostAnalysis) : null; } catch { analysis = null; }
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: String(r.id), platform: r.platform as RadarPlatform, competitorId: String(r.competitor_id), author: String(r.author), authorType: r.author_type === 'person' ? 'person' : 'page',
    url: String(r.url), postedAt: String(r.posted_at), text: String(r.text), format: r.format as PostFormat, imageUrl: String(r.image_url), thumb: String(r.thumb),
    reactions: n(r.reactions), comments: n(r.comments), shares: n(r.shares), views: n(r.views), analysis, firstSeenAt: String(r.first_seen_at), fetchedAt: String(r.fetched_at),
  };
};

/** Inserts new posts and refreshes the counts of known ones. A count missing from this fetch keeps the earlier value. */
export async function savePosts(posts: RadarPostInput[], now = new Date().toISOString()): Promise<{ added: string[]; updated: number }> {
  const added: string[] = [];
  let updated = 0;
  await db.tx(async (tx) => {
    for (const p of posts) {
      const known = await tx.get<{ id: string }>('SELECT id FROM radar_posts WHERE id=?', [p.id]);
      if (!known) {
        await tx.run(`INSERT INTO radar_posts (id,platform,competitor_id,author,author_type,url,posted_at,text,format,image_url,reactions,comments,shares,views,first_seen_at,fetched_at)
          VALUES (@id,@platform,@competitorId,@author,@authorType,@url,@postedAt,@text,@format,@imageUrl,@reactions,@comments,@shares,@views,@now,@now)`, { ...p, now });
        added.push(p.id);
      } else {
        await tx.run(`UPDATE radar_posts SET author=@author, url=@url, text=@text, format=@format, image_url=CASE WHEN @imageUrl != '' THEN @imageUrl ELSE image_url END,
          reactions=COALESCE(@reactions,reactions), comments=COALESCE(@comments,comments), shares=COALESCE(@shares,shares), views=COALESCE(@views,views), fetched_at=@now WHERE id=@id`, { ...p, now });
        updated++;
      }
    }
  });
  return { added, updated };
}

export async function saveFollowers(counts: FollowerCount[], date: string): Promise<void> {
  for (const c of counts) await db.run(`INSERT INTO radar_followers (competitor_id,platform,date,followers) VALUES (?,?,?,?)
    ON CONFLICT(competitor_id,platform,date) DO UPDATE SET followers=excluded.followers`, [c.competitorId, c.platform, date, c.followers]);
}

/** The latest follower count per competitor and platform, with the count about 30 days before it when there is one. */
export async function latestFollowers(): Promise<{ competitorId: string; platform: RadarPlatform; followers: number; date: string; before: number | null }[]> {
  const rows = await db.all<{ competitor_id: string; platform: string; date: string; followers: number }>('SELECT competitor_id, platform, date, followers FROM radar_followers ORDER BY date DESC');
  const out = new Map<string, { competitorId: string; platform: RadarPlatform; followers: number; date: string; before: number | null }>();
  for (const r of rows) {
    const key = `${r.competitor_id}:${r.platform}`;
    const hit = out.get(key);
    if (!hit) out.set(key, { competitorId: r.competitor_id, platform: r.platform as RadarPlatform, followers: Number(r.followers), date: r.date, before: null });
    else if (hit.before == null && Date.parse(hit.date) - Date.parse(r.date) >= 28 * 86400000) hit.before = Number(r.followers);
  }
  return [...out.values()];
}

/** The newest post date per account, over everything stored (an account silent for months still has one). */
export async function lastPostDates(): Promise<Record<string, string>> {
  const rows = await db.all<{ competitor_id: string; platform: string; last: string }>('SELECT competitor_id, platform, MAX(posted_at) AS last FROM radar_posts GROUP BY competitor_id, platform');
  return Object.fromEntries(rows.map((r) => [`${r.competitor_id}:${r.platform}`, r.last]));
}

export const getPosts = async (sinceIso: string): Promise<RadarPost[]> =>
  (await db.all('SELECT * FROM radar_posts WHERE posted_at >= ? ORDER BY posted_at DESC', [sinceIso])).map(toPost);
export const getPost = async (id: string): Promise<RadarPost | undefined> => {
  const row = await db.get('SELECT * FROM radar_posts WHERE id=?', [id]);
  return row ? toPost(row) : undefined;
};
export const postsWithoutAnalysis = async (limit: number): Promise<RadarPost[]> =>
  (await db.all("SELECT * FROM radar_posts WHERE analysis_json = '' ORDER BY posted_at DESC LIMIT ?", [limit])).map(toPost);
export const postsWithoutThumb = async (limit: number): Promise<RadarPost[]> =>
  (await db.all("SELECT * FROM radar_posts WHERE thumb = '' AND image_url != '' ORDER BY posted_at DESC LIMIT ?", [limit])).map(toPost);
export const saveAnalysis = async (id: string, analysis: PostAnalysis) =>
  db.run('UPDATE radar_posts SET analysis_json=?, analyzed_at=? WHERE id=?', [JSON.stringify(analysis), new Date().toISOString(), id]);
export const saveThumb = async (id: string, file: string) => db.run('UPDATE radar_posts SET thumb=? WHERE id=?', [file, id]);

export interface RadarRun { id: string; kind: string; status: 'running' | 'done' | 'failed' | 'partial'; startedAt: string; finishedAt: string; message: string; apifyUsd: number; postsNew: number; postsUpdated: number }
const toRun = (r: Record<string, unknown>): RadarRun => ({
  id: String(r.id), kind: String(r.kind), status: r.status as RadarRun['status'], startedAt: String(r.started_at), finishedAt: String(r.finished_at), message: String(r.message),
  apifyUsd: Number(r.apify_usd), postsNew: Number(r.posts_new), postsUpdated: Number(r.posts_updated),
});
export const startRun = async (id: string, kind: string, at: string) =>
  db.run("INSERT INTO radar_runs (id,kind,status,started_at) VALUES (?,?,'running',?)", [id, kind, at]);
export const finishRun = async (run: Omit<RadarRun, 'startedAt' | 'kind'>) =>
  db.run('UPDATE radar_runs SET status=@status, finished_at=@finishedAt, message=@message, apify_usd=@apifyUsd, posts_new=@postsNew, posts_updated=@postsUpdated WHERE id=@id', { ...run });
export const recentRuns = async (limit = 10): Promise<RadarRun[]> => (await db.all('SELECT * FROM radar_runs ORDER BY started_at DESC LIMIT ?', [limit])).map(toRun);
/** Apify spend recorded by radar runs since the start of this calendar month (UTC). */
export async function apifySpendThisMonth(now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return Number((await db.get<{ total: number | null }>('SELECT SUM(apify_usd) AS total FROM radar_runs WHERE started_at >= ?', [start]))?.total ?? 0);
}
/** Marks runs a restart cut short as failed, so a new run can start. */
export const failStaleRuns = async (olderThanIso: string) =>
  db.run("UPDATE radar_runs SET status='failed', message='انقطع التشغيل (إعادة تشغيل الخادم).', finished_at=? WHERE status='running' AND started_at < ?", [new Date().toISOString(), olderThanIso]);

export const saveBrief = async (date: string, brief: unknown) =>
  db.run('INSERT INTO radar_briefs (date,brief_json,created_at) VALUES (?,?,?) ON CONFLICT(date) DO UPDATE SET brief_json=excluded.brief_json, created_at=excluded.created_at', [date, JSON.stringify(brief), new Date().toISOString()]);
export async function latestBrief<T>(): Promise<{ date: string; createdAt: string; brief: T } | null> {
  const row = await db.get<{ date: string; brief_json: string; created_at: string }>('SELECT * FROM radar_briefs ORDER BY date DESC LIMIT 1');
  if (!row) return null;
  try { return { date: row.date, createdAt: row.created_at, brief: JSON.parse(row.brief_json) as T }; } catch { return null; }
}
