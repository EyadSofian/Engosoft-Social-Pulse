/**
 * Phone notifications. Each person turns them on from the app installed on their home screen; every browser or phone
 * they turn it on from is one subscription. Each person picks which kinds reach the phone.
 */
import type express from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db, defineSchema } from '../db.js';
import { getSetting, setSetting } from '../settings.js';
import { generateVapidKeys, sendWebPush, validSubscription, type PushSubscriptionJson, type VapidKeys } from './webpush.js';

defineSchema(`
CREATE TABLE IF NOT EXISTS push_subscriptions (
 endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, device TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, last_ok_at TEXT, failures INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subscriptions_by_user ON push_subscriptions(user_id);
`);

/** What a person can turn on or off. `work`: posts and reviews; the rest are the performance notifications. */
export const PUSH_TOPICS = ['work', 'daily', 'best', 'alerts', 'tips', 'ideas'] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number];
export type PushPrefs = Record<PushTopic, boolean>;
const DEFAULT_PREFS: PushPrefs = { work: true, daily: true, best: true, alerts: true, tips: true, ideas: true };
export const getPushPrefs = (userId: string) => getSetting<PushPrefs>(`push_prefs:${userId}`, DEFAULT_PREFS);

/** Notification kind → the switch that controls it. */
export function topicOf(kind: string): PushTopic {
  if (kind === 'insight_daily') return 'daily';
  if (kind === 'insight_best') return 'best';
  if (kind === 'insight_alert') return 'alerts';
  if (kind === 'insight_tip') return 'tips';
  if (kind === 'insight_idea') return 'ideas';
  return 'work';
}

/** Keys from the environment when set; otherwise made once and kept in the database, so nothing needs configuring. */
let cachedKeys: VapidKeys | null = null;
export async function vapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;
  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim(), envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPublic && envPrivate) return (cachedKeys = { publicKey: envPublic, privateKey: envPrivate });
  const stored = await getSetting<Partial<VapidKeys>>('push_vapid', {});
  if (stored.publicKey && stored.privateKey) return (cachedKeys = stored as VapidKeys);
  const fresh = generateVapidKeys();
  await setSetting('push_vapid', fresh);
  return (cachedKeys = fresh);
}
const subject = () => process.env.VAPID_SUBJECT?.trim() || (process.env.APP_URL?.trim() || 'https://web-production-d07de.up.railway.app').replace(/\/$/, '');

export interface PushMessage { title: string; body: string; url: string; tag?: string; image?: string }

/** Sends to every phone of these people that wants this kind; dead subscriptions are removed. Never throws. */
export async function pushToUsers(userIds: string[], kind: string, message: PushMessage): Promise<number> {
  try {
    const ids = [...new Set(userIds)];
    if (!ids.length) return 0;
    const topic = topicOf(kind);
    const allowed: string[] = [];
    for (const id of ids) if ((await getPushPrefs(id))[topic]) allowed.push(id);
    if (!allowed.length) return 0;
    const rows = await db.all<{ endpoint: string; user_id: string; p256dh: string; auth: string; failures: number }>(
      `SELECT endpoint,user_id,p256dh,auth,failures FROM push_subscriptions WHERE user_id IN (${allowed.map(() => '?').join(',')})`, allowed);
    if (!rows.length) return 0;
    const keys = await vapidKeys();
    let sent = 0;
    await Promise.all(rows.map(async (row) => {
      const result = await sendWebPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, { ...message, tag: message.tag ?? kind }, keys, subject(), { topic: message.tag, urgency: topic === 'work' ? 'high' : 'normal' });
      if (result.ok) {
        sent++;
        await db.run('UPDATE push_subscriptions SET last_ok_at=?, failures=0 WHERE endpoint=?', [new Date().toISOString(), row.endpoint]);
      } else if (result.gone || row.failures >= 9) {
        await db.run('DELETE FROM push_subscriptions WHERE endpoint=?', [row.endpoint]);
      } else {
        await db.run('UPDATE push_subscriptions SET failures=failures+1 WHERE endpoint=?', [row.endpoint]);
        console.error(`Push failed (${result.status}): ${result.message}`);
      }
    }));
    return sent;
  } catch (error) {
    console.error('Push failed:', error instanceof Error ? error.message : error);
    return 0;
  }
}

const deviceName = (agent: string) => /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) ? 'iPad' : /Android/.test(agent) ? 'Android' : /Mac OS X/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : 'متصفح';

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});
const prefsSchema = z.object(Object.fromEntries(PUSH_TOPICS.map((t) => [t, z.boolean()])) as Record<PushTopic, z.ZodBoolean>);

export function registerPushRoutes(app: express.Express) {
  app.get('/api/push/key', requireUser, async (_req, res) => res.json({ publicKey: (await vapidKeys()).publicKey }));

  app.get('/api/push/status', requireUser, async (req, res) => {
    const devices = await db.all<{ endpoint: string; device: string; created_at: string; last_ok_at: string | null }>('SELECT endpoint,device,created_at,last_ok_at FROM push_subscriptions WHERE user_id=? ORDER BY created_at', [req.user!.id]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ prefs: await getPushPrefs(req.user!.id), devices: devices.map((d) => ({ endpoint: d.endpoint, device: d.device, createdAt: d.created_at, lastOkAt: d.last_ok_at })) });
  });

  app.post('/api/push/subscribe', requireUser, async (req, res) => {
    const parsed = z.object({ subscription: subscriptionSchema, replaces: z.string().max(2000).nullable().optional() }).safeParse(req.body);
    if (!parsed.success || !validSubscription(parsed.data.subscription as PushSubscriptionJson)) return res.status(400).json({ error: 'اشتراك الإشعارات غير صالح.' });
    const { subscription, replaces } = parsed.data;
    if (replaces) await db.run('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?', [replaces, req.user!.id]);
    // One phone belongs to whoever signed in on it last.
    await db.run('DELETE FROM push_subscriptions WHERE endpoint=?', [subscription.endpoint]);
    await db.run('INSERT INTO push_subscriptions (endpoint,user_id,p256dh,auth,device,created_at) VALUES (?,?,?,?,?,?)',
      [subscription.endpoint, req.user!.id, subscription.keys.p256dh, subscription.keys.auth, deviceName(String(req.headers['user-agent'] ?? '')), new Date().toISOString()]);
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', requireUser, async (req, res) => {
    const parsed = z.object({ endpoint: z.string().max(2000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'طلب غير صالح.' });
    await db.run('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?', [parsed.data.endpoint, req.user!.id]);
    res.json({ ok: true });
  });

  app.put('/api/push/prefs', requireUser, async (req, res) => {
    const parsed = prefsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'طلب غير صالح.' });
    res.json({ prefs: await setSetting(`push_prefs:${req.user!.id}`, parsed.data) });
  });

  app.post('/api/push/test', requireUser, async (req, res) => {
    const count = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=?', [req.user!.id]);
    if (!Number(count?.n)) return res.status(400).json({ error: 'الإشعارات مش متفعّلة على أي جهاز لسه.' });
    const rows = await db.all<{ endpoint: string; p256dh: string; auth: string }>('SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?', [req.user!.id]);
    const keys = await vapidKeys();
    const results = await Promise.all(rows.map((row) => sendWebPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, { title: 'إشعار تجريبي من مبدع', body: 'لو شايف الرسالة دي يبقى إشعارات الموبايل شغالة.', url: '/insights', tag: 'test' }, keys, subject())));
    for (const [i, result] of results.entries()) if (!result.ok && result.gone) await db.run('DELETE FROM push_subscriptions WHERE endpoint=?', [rows[i].endpoint]);
    const sent = results.filter((r) => r.ok).length;
    if (!sent) return res.status(502).json({ error: `تعذّر الإرسال: ${results.map((r) => (r.ok ? '' : `${r.status} ${r.message}`)).join(' · ').slice(0, 200)}` });
    res.json({ sent });
  });
}
