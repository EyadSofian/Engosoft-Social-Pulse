/**
 * One radar run: pull the competitors' recent posts from Apify, keep a small copy of each picture, read new posts
 * with AI, then write the day's brief. Runs every morning at 07:00 Riyadh; a manual run does the same.
 * Spend is capped per actor run and per month (RADAR_MONTHLY_USD, default $4.5, under Apify's free $5).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchThumbnail } from '../post-thumbnails.js';
import { mediaDir } from '../paths.js';
import { readOdooAgenda } from '../odoo.js';
import { withStorage } from '../storage.js';
import { withUsage } from '../usage.js';
import { db } from '../db.js';
import { runActor } from './apify.js';
import { analyzePost } from './analyze.js';
import { writeBrief } from './brief.js';
import { COMPETITORS, RADAR_PLATFORMS, type Competitor, type RadarPlatform } from './competitors.js';
import { buildMetrics, scorePosts, type OwnPost } from './metrics.js';
import { normalizeFacebook, normalizeFacebookPages, normalizeInstagram, normalizeInstagramProfiles, normalizeLinkedIn, normalizeTikTok, type FollowerCount, type RadarPostInput } from './normalize.js';
import {
  apifySpendThisMonth, failStaleRuns, finishRun, getPosts, lastPostDates, latestFollowers, postsWithoutAnalysis, postsWithoutThumb, recentRuns, saveAnalysis, saveBrief, saveFollowers, savePosts, saveThumb, startRun,
} from './store.js';

const DAY = 86400000;
export const WINDOW_DAYS = 60;
const riyadhDay = (at = new Date()) => new Date(at.getTime() + 3 * 3600000).toISOString().slice(0, 10);
const riyadhHour = (at = new Date()) => new Date(at.getTime() + 3 * 3600000).getUTCHours();
const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Price per item on Apify's free plan, used to cap each run (the cap is a ceiling, the charge is per item). */
const ACTORS = {
  linkedin: { actor: 'harvestapi/linkedin-company-posts', perItem: 0.002 },
  facebook: { actor: 'apify/facebook-posts-scraper', perItem: 0.005 },
  instagram: { actor: 'apify/instagram-post-scraper', perItem: 0.0017 },
  tiktok: { actor: 'clockworks/tiktok-scraper', perItem: 0.0037 },
  facebookPages: { actor: 'apify/facebook-pages-scraper', perItem: 0.012 },
  instagramProfiles: { actor: 'apify/instagram-profile-scraper', perItem: 0.0026 },
} as const;

function postsInput(platform: RadarPlatform, c: Competitor, since: string, max: number): unknown {
  const a = c.accounts[platform];
  if (platform === 'linkedin') return { targetUrls: [a], maxPosts: max, includeReposts: false, postedLimitDate: since };
  if (platform === 'facebook') return { startUrls: [{ url: a }], resultsLimit: max, onlyPostsNewerThan: since };
  if (platform === 'instagram') return { username: [a], resultsLimit: max, skipPinnedPosts: true, dataDetailLevel: 'basicData', onlyPostsNewerThan: since };
  return { profiles: [a], resultsPerPage: max, profileSorting: 'latest', excludePinnedPosts: true, oldestPostDateUnified: since };
}
const NORMALIZE = { linkedin: normalizeLinkedIn, facebook: normalizeFacebook, instagram: normalizeInstagram, tiktok: normalizeTikTok } as const;

export interface RunReport { id: string; status: 'done' | 'partial' | 'failed'; message: string; apifyUsd: number; postsNew: number; postsUpdated: number; analysed: number }

let running: Promise<RunReport> | null = null;
export const radarRunning = () => Boolean(running);

/** Starts a run unless one is going; returns the running one otherwise. */
export function startRadarRun(kind: 'daily' | 'manual', env: NodeJS.ProcessEnv = process.env): Promise<RunReport> {
  running ??= runRadar(kind, env).finally(() => { running = null; });
  return running;
}

async function runRadar(kind: 'daily' | 'manual', env: NodeJS.ProcessEnv): Promise<RunReport> {
  const id = randomUUID();
  const now = Date.now();
  await startRun(id, kind, new Date(now).toISOString());
  const token = env.APIFY_API_TOKEN?.trim();
  const budget = Number(env.RADAR_MONTHLY_USD) > 0 ? Number(env.RADAR_MONTHLY_USD) : 4.5;
  const errors: string[] = [];
  let spent = await apifySpendThisMonth();
  let apifyUsd = 0, postsNew = 0, postsUpdated = 0;
  const today = riyadhDay();
  const weekly = !(await recentRuns(40)).some((r) => r.status !== 'failed' && r.finishedAt && now - Date.parse(r.startedAt) < 6.5 * DAY && r.message.includes('[weekly]'));

  if (!token) errors.push('APIFY_API_TOKEN مش متضاف على الخادم.');
  else {
    const known = new Set((await db.all<{ k: string }>("SELECT competitor_id || ':' || platform AS k FROM radar_posts GROUP BY competitor_id, platform")).map((r) => r.k));
    const jobs: (() => Promise<void>)[] = [];
    for (const c of COMPETITORS) for (const platform of RADAR_PLATFORMS) jobs.push(async () => {
      // First pull of an account goes back 60 days; then 4 days daily (to refresh young posts) and 21 days weekly.
      const first = !known.has(`${c.id}:${platform}`);
      const days = first ? WINDOW_DAYS : weekly ? 21 : 4;
      const max = first ? 25 : weekly ? 15 : 8;
      const { actor, perItem } = ACTORS[platform];
      const cap = Math.round((max * perItem + 0.01) * 1000) / 1000;
      if (spent + cap > budget) { errors.push(`${c.name} ${platform}: وقفنا عشان ميزانية الشهر (${budget}$).`); return; }
      spent += cap;
      try {
        const result = await runActor(actor, postsInput(platform, c, dateOnly(now - days * DAY), max), { token, maxUsd: cap });
        spent += result.usd - cap; apifyUsd += result.usd;
        const { posts, followers } = NORMALIZE[platform](result.items, c);
        const recent = posts.filter((p: RadarPostInput) => Date.parse(p.postedAt) >= now - (days + 1) * DAY);
        const saved = await savePosts(recent);
        postsNew += saved.added.length; postsUpdated += saved.updated;
        await saveFollowers(followers, today);
      } catch (error) { errors.push(`${c.name} ${platform}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240)); }
    });
    if (weekly) for (const c of COMPETITORS) jobs.push(async () => {
      for (const [key, input, normalize] of [
        ['facebookPages', { startUrls: [{ url: c.accounts.facebook }] }, normalizeFacebookPages],
        ['instagramProfiles', { usernames: [c.accounts.instagram] }, normalizeInstagramProfiles],
      ] as const) {
        const { actor, perItem } = ACTORS[key];
        if (spent + perItem > budget) return;
        try {
          const result = await runActor(actor, input, { token, maxUsd: perItem * 2 });
          spent += result.usd; apifyUsd += result.usd;
          await saveFollowers((normalize as (items: Record<string, unknown>[], c: Competitor) => FollowerCount[])(result.items, c), today);
        } catch (error) { errors.push(`${c.name} ${key}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240)); }
      }
    });
    await pool(jobs, 4);
  }

  await keepPictures();
  const analysed = await analyseNew(env, now).catch((error) => { errors.push(`AI: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240)); return 0; });
  try { await refreshBrief(env, now); } catch (error) { errors.push(`الملخص: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240)); }

  const failedAll = !postsNew && !postsUpdated && errors.length > 0;
  const status: RunReport['status'] = failedAll ? 'failed' : errors.length ? 'partial' : 'done';
  const message = `${weekly ? '[weekly] ' : ''}${errors.join(' • ')}`.trim();
  await finishRun({ id, status, finishedAt: new Date().toISOString(), message, apifyUsd: Math.round(apifyUsd * 10000) / 10000, postsNew, postsUpdated });
  return { id, status, message, apifyUsd, postsNew, postsUpdated, analysed };
}

async function pool(jobs: (() => Promise<void>)[], size: number) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, async () => { while (next < jobs.length) await jobs[next++](); }));
}

/** Platform picture links expire within days, so each post keeps a small JPEG of its own. */
export async function keepPictures(limit = 150) {
  const posts = await postsWithoutThumb(limit);
  if (!posts.length) return;
  await mkdir(mediaDir('radar'), { recursive: true });
  for (const p of posts) {
    const image = await fetchThumbnail(p.imageUrl);
    if (!image) { await saveThumb(p.id, '-'); continue; }
    const file = `${p.id.replace(/[^a-z0-9]+/gi, '-')}.jpg`;
    await withStorage(image.length, () => writeFile(mediaDir('radar', file), image));
    await saveThumb(p.id, file);
  }
}

export async function analyseNew(env: NodeJS.ProcessEnv, now: number): Promise<number> {
  if (!env.OPENAI_API_KEY?.trim()) return 0;
  const todo = await postsWithoutAnalysis(150);
  if (!todo.length) return 0;
  const peers = scorePosts(await getPosts(new Date(now - WINDOW_DAYS * DAY).toISOString()), now);
  const byId = new Map(peers.map((p) => [p.id, p]));
  let done = 0;
  const failures: string[] = [];
  await pool(todo.map((post) => async () => {
    const scored = byId.get(post.id) ?? scorePosts([post], now)[0];
    try { await saveAnalysis(post.id, await withUsage(null, 'radar_analysis', () => analyzePost(scored, peers, env))); done++; }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }), 6);
  if (!done && failures.length) throw new Error(failures[0]);
  return done;
}

export async function ownPosts(sinceIso: string): Promise<OwnPost[]> {
  const rows = await db.all<{ platform: string; published_at: string; metrics_json: string }>('SELECT platform, published_at, metrics_json FROM observed_posts WHERE published_at >= ?', [sinceIso]);
  return rows.map((r) => {
    let m: Record<string, unknown> = {};
    try { m = JSON.parse(r.metrics_json) as Record<string, unknown>; } catch { m = {}; }
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return { platform: r.platform, publishedAt: r.published_at, likes: n(m.likes), comments: n(m.comments), shares: n(m.shares) };
  });
}

export async function refreshBrief(env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const since = new Date(now - WINDOW_DAYS * DAY).toISOString();
  const posts = scorePosts(await getPosts(since), now);
  const metrics = buildMetrics({ posts, followers: await latestFollowers(), ours: await ownPosts(since), windowDays: 30, lastPosts: await lastPostDates(), now });
  const schedule = await readOdooAgenda(env).catch(() => ({ status: 'error' as const, events: [], lectures: [] }));
  const brief = await withUsage(null, 'radar_brief', () => writeBrief({ posts: posts.filter((p) => now - Date.parse(p.postedAt) <= 30 * DAY), metrics, schedule, today: riyadhDay(new Date(now)), env }));
  await saveBrief(brief.date, brief);
  return brief;
}

/**
 * Checked every 10 minutes: one daily run after 07:00 Riyadh, unless today's already finished. Only the production
 * server (Postgres) runs it on its own, so a local copy with the token never spends the same Apify credit twice;
 * RADAR_AUTO=true turns it on elsewhere.
 */
export async function radarTick(env: NodeJS.ProcessEnv = process.env) {
  if (env.RADAR_DISABLED === 'true' || !env.APIFY_API_TOKEN?.trim() || running) return;
  if (db.kind !== 'pg' && env.RADAR_AUTO !== 'true') return;
  await failStaleRuns(new Date(Date.now() - 2 * 3600000).toISOString());
  if (riyadhHour() < 7) return;
  const today = riyadhDay();
  const runs = await recentRuns(5);
  if (runs.some((r) => r.status === 'running' || (r.kind === 'daily' && riyadhDay(new Date(r.startedAt)) === today))) return;
  await startRadarRun('daily', env);
}
