import type express from 'express';
import { existsSync } from 'node:fs';
import { requirePermission } from '../auth.js';
import { mediaDir } from '../paths.js';
import { readOdooAgenda } from '../odoo.js';
import { COMPETITORS } from './competitors.js';
import { buildMetrics, scorePosts } from './metrics.js';
import { WINDOW_DAYS, ownPosts, radarRunning, startRadarRun } from './run.js';
import { apifySpendThisMonth, getPosts, lastPostDates, latestBrief, latestFollowers, recentRuns } from './store.js';
import type { RadarBrief } from './brief.js';

const DAY = 86400000;

export function registerRadarRoutes(app: express.Express) {
  app.get('/api/radar', requirePermission('analytics.view'), async (req, res) => {
    const days = [7, 30, 60].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const now = Date.now();
    const since = new Date(now - WINDOW_DAYS * DAY).toISOString();
    const scored = scorePosts(await getPosts(since), now);
    const followers = await latestFollowers();
    const metrics = buildMetrics({ posts: scored, followers, ours: await ownPosts(since), windowDays: days, lastPosts: await lastPostDates(), now });
    const windowStart = now - days * DAY;
    const posts = scored.filter((p) => Date.parse(p.postedAt) >= windowStart).map((p) => ({
      id: p.id, platform: p.platform, competitorId: p.competitorId, author: p.author, authorType: p.authorType, url: p.url, postedAt: p.postedAt,
      text: p.text.slice(0, 700), format: p.format, picture: p.thumb && p.thumb !== '-' ? `/api/radar/picture/${encodeURIComponent(p.thumb)}` : null,
      reactions: p.reactions, comments: p.comments, shares: p.shares, views: p.views, interactions: p.interactions, groupMedian: p.groupMedian, level: p.level, analysis: p.analysis,
    }));
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      configured: Boolean(process.env.APIFY_API_TOKEN?.trim()),
      budgetUsd: Number(process.env.RADAR_MONTHLY_USD) > 0 ? Number(process.env.RADAR_MONTHLY_USD) : 4.5,
      spentUsd: Math.round((await apifySpendThisMonth()) * 100) / 100,
      running: radarRunning(),
      runs: await recentRuns(5),
      competitors: COMPETITORS,
      brief: await latestBrief<RadarBrief>(),
      agenda: await readOdooAgenda().catch(() => ({ status: 'error' as const, lectures: [], events: [] })),
      metrics,
      posts,
    });
  });

  // A run spends Apify and AI credit, so it is for the people who manage the connected accounts.
  app.post('/api/radar/run', requirePermission('connections.manage'), (_req, res) => {
    if (!process.env.APIFY_API_TOKEN?.trim()) return res.status(409).json({ error: 'أضف APIFY_API_TOKEN على الخادم الأول.' });
    const already = radarRunning();
    void startRadarRun('manual').catch((error) => console.error('Radar run failed:', error instanceof Error ? error.message : error));
    res.status(202).json({ started: !already, running: true });
  });

  app.get('/api/radar/picture/:file', requirePermission('analytics.view'), (req, res) => {
    const file = String(req.params.file);
    if (!/^[a-z0-9-]+\.jpg$/i.test(file)) return res.status(404).end();
    const path = mediaDir('radar', file);
    if (!existsSync(path)) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(path);
  });
}
