/**
 * Runs the performance notifications: every 10 minutes it works out what is due (see compute.ts), stores what is new,
 * and tells everyone who can see analytics, in the app and on their phone. Each insight has its own page entry at
 * /insights, which the notification opens.
 */
import { randomUUID } from 'node:crypto';
import type express from 'express';
import { DateTime } from 'luxon';
import { listUsers, requirePermission, requireUser, userCan } from '../auth.js';
import { latestBrief } from '../competitor-radar/store.js';
import { db } from '../db.js';
import { notifyUsers } from '../notify.js';
import { pushToUsers } from '../push/index.js';
import { getObserved } from '../store.js';
import { buildInsights, type Insight, type RadarIdea } from './compute.js';
import { getPostingSchedule, insightsZone, resolvePostingGap } from './posting-gap.js';

async function radarIdeas(): Promise<{ ideas: RadarIdea[]; date?: string }> {
  try {
    const latest = await latestBrief<{ ideas?: RadarIdea[] }>();
    return { ideas: latest?.brief.ideas ?? [], date: latest?.date };
  } catch {
    return { ideas: [] };
  }
}

/** Who hears about performance: active people who can open Analytics. */
async function recipients(): Promise<string[]> {
  return (await listUsers()).filter((u) => u.status === 'active' && userCan(u, 'analytics.view')).map((u) => u.id);
}

/** Works out what is due and sends what was not sent before. Returns the new insights. */
export async function runInsights(now = new Date()): Promise<Insight[]> {
  const zone = insightsZone();
  const [posts, schedule, radar] = await Promise.all([getObserved(), getPostingSchedule(now, zone), radarIdeas()]);
  const today = DateTime.fromJSDate(now, { zone }).toISODate();
  const publishedToday = posts.some(post => DateTime.fromISO(post.publishedAt, { zone }).toISODate() === today);
  await resolvePostingGap(now, zone, schedule.hasPostingToday || publishedToday);
  const due = buildInsights({ posts, now, zone, ...schedule, radarIdeas: radar.ideas, radarDate: radar.date });
  if (!due.length) return [];
  const known = new Set((await db.all<{ key: string }>(`SELECT key FROM insights WHERE key IN (${due.map(() => '?').join(',')})`, due.map((i) => i.key))).map((r) => r.key));
  const fresh = due.filter((i) => !known.has(i.key));
  if (!fresh.length) return [];
  const people = await recipients();
  // Many at once (the first run, or after a pause): each still lands in the app, and the phone gets one summary.
  const bundle = fresh.length > MAX_SEPARATE_PUSHES;
  const sent: Insight[] = [];
  for (const insight of fresh) {
    const id = randomUUID();
    const added = await db.run('INSERT INTO insights (id,key,kind,title,body,detail_json,image,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(key) DO NOTHING',
      [id, insight.key, insight.kind, insight.title, insight.body, JSON.stringify(insight.detail), insight.image ?? '', new Date().toISOString()]);
    if (!added.changes) continue;
    sent.push(insight);
    await notifyUsers(people, insight.kind, insight.title, insight.body, `/insights?id=${id}`, bundle ? false : { image: insight.image, tag: insight.key });
  }
  if (bundle && sent.length) {
    // Grouped under the most important kind present, so each person's switches still apply.
    const kind = (['insight_alert', 'insight_daily', 'insight_best', 'insight_idea', 'insight_tip'] as const).find((k) => sent.some((i) => i.kind === k))!;
    await pushToUsers(people, kind, { title: `${sent.length} تنبيهات جديدة عن الأداء`, body: sent.slice(0, 3).map((i) => i.title).join(' · '), url: '/insights', tag: 'insights-bundle' });
  }
  return sent;
}

let running = false;
const MAX_SEPARATE_PUSHES = 3;
/** Every 10 minutes. Production (Postgres) runs on its own; elsewhere INSIGHTS_AUTO=true turns it on. */
export async function insightsTick(env: NodeJS.ProcessEnv = process.env) {
  if (running || env.INSIGHTS_DISABLED === 'true') return;
  if (db.kind !== 'pg' && env.INSIGHTS_AUTO !== 'true') return;
  running = true;
  try {
    const sent = await runInsights();
    if (sent.length) console.log(`Performance notifications sent: ${sent.map((i) => i.key).join(', ')}`);
  } finally {
    running = false;
  }
}

export function registerInsightRoutes(app: express.Express) {
  app.get('/api/insights', requireUser, requirePermission('analytics.view'), async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    await resolvePostingGap();
    const rows = await db.all<{ id: string; key: string; kind: string; title: string; body: string; detail_json: string; image: string; created_at: string }>('SELECT * FROM insights WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT ?', [limit]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      timeZone: insightsZone(),
      items: rows.map((r) => {
        let detail = {};
        try { detail = JSON.parse(r.detail_json); } catch { detail = {}; }
        return { id: r.id, key: r.key, kind: r.kind, title: r.title, body: r.body, image: r.image || null, detail, createdAt: r.created_at };
      }),
    });
  });

  // "Check now": works out today's notifications on demand (still once per day or week each).
  app.post('/api/insights/run', requireUser, requirePermission('analytics.view'), async (_req, res) => {
    if (running) return res.status(409).json({ error: 'التحليل شغال بالفعل.' });
    running = true;
    try {
      const sent = await runInsights();
      res.json({ sent: sent.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'تعذّر التحليل.' });
    } finally {
      running = false;
    }
  });
}
