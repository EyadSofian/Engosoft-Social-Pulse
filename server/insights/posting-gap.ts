import { DateTime } from 'luxon';
import { db, defineColumn, defineSchema } from '../db.js';
import '../google/store.js';
import '../social/store.js';
import '../store.js';

defineSchema(`
CREATE TABLE IF NOT EXISTS insights (
 id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 detail_json TEXT NOT NULL DEFAULT '{}', image TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS insights_by_date ON insights(created_at);
`);
defineColumn('insights', 'resolved_at', 'TEXT');

export const insightsZone = () => process.env.BUSINESS_TIME_ZONE?.trim() || 'Africa/Cairo';
const utc = (time: DateTime) => time.toUTC().toISO()!;
export type SheetSchedule = 'clear' | 'blocked' | 'unavailable';

/** Calendar plans for a sheet post can survive a rejected edit. Its queue holds the actual schedule. */
export async function getPostingSchedule(now: Date, zone: string) {
  const today = DateTime.fromJSDate(now, { zone }).startOf('day');
  const nextDay = utc(today.plus({ days: 1 }));
  const currentTime = now.toISOString();
  const [plans, publications, sources] = await Promise.all([
    db.all<{ status: string }>(`
      SELECT p.status FROM plans p WHERE p.scheduled_at>=? AND p.scheduled_at<?
      AND (p.status='published' OR (p.status IN ('scheduled','approved') AND p.scheduled_at>=?
        AND NOT EXISTS (SELECT 1 FROM google_calendar_rows r WHERE p.notes='content:' || r.content_id)))`,
    [utc(today), nextDay, currentTime]),
    db.all<{ content_id: string; state: string; publish_at: string }>(`
      SELECT q.content_id, q.state, q.publish_at FROM social_publish_queue q
      LEFT JOIN social_publish_jobs j ON j.id=q.job_id
      WHERE q.publish_at>=? AND q.publish_at<?
      AND (q.state IN ('queued','sending') OR (q.state='sent' AND j.state IN ('processing','published')))`,
    [utc(today), nextDay]),
    db.all<{ blocked_publish_dates_json: string | null; last_sync_at: number | null; error: string | null }>(
      'SELECT blocked_publish_dates_json,last_sync_at,error FROM google_calendar_sources WHERE enabled=1'),
  ]);
  const scheduledLaterToday = plans.filter(p => p.status !== 'published').length
    + new Set(publications.filter(q => q.state === 'queued' && q.publish_at >= currentTime).map(q => q.content_id)).size;
  const sheetSchedule: SheetSchedule = sources.some(s => s.error || !s.blocked_publish_dates_json || !s.last_sync_at || s.last_sync_at <= now.getTime() - 120_000)
    ? 'unavailable'
    : sources.some(s => (JSON.parse(s.blocked_publish_dates_json!) as (string | null)[]).some(date => date === null || date === today.toISODate()))
      ? 'blocked'
      : 'clear';
  return { scheduledLaterToday, hasPostingToday: Boolean(plans.length || publications.length), sheetSchedule };
}

/** Keep the original key for deduplication, but remove the resolved alert from both feeds. */
export async function resolvePostingGap(now = new Date(), zone = insightsZone(), hasPostingToday?: boolean) {
  if (hasPostingToday === false) return;
  const today = DateTime.fromJSDate(now, { zone }).startOf('day');
  const key = `gap-today:${today.toISODate()}`;
  if (hasPostingToday === undefined) {
    if (!await db.get('SELECT id FROM insights WHERE key=? AND resolved_at IS NULL', [key])) return;
    const [schedule, published] = await Promise.all([
      getPostingSchedule(now, zone),
      db.get('SELECT 1 FROM observed_posts WHERE published_at>=? AND published_at<? LIMIT 1', [utc(today), utc(today.plus({ days: 1 }))]),
    ]);
    if (!schedule.hasPostingToday && !published) return;
  }
  await db.run('UPDATE insights SET resolved_at=? WHERE key=? AND resolved_at IS NULL', [now.toISOString(), key]);
}
