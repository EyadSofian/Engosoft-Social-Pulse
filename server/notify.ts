/**
 * Notifications: when anyone in any department creates a post or sends one for review, the people and email
 * addresses the admin chose hear about it (in-app popup + email). Review outcomes go back to the post's owner.
 */
import { randomUUID } from 'node:crypto';
import type express from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { DEPARTMENTS } from '../src/domain/catalog.js';
import type { ContentStatus } from '../src/domain/content.js';
import { getUser, listUsers, requirePermission, requireUser, userCan, type AuthUser } from './auth.js';
import { getSetting, setSetting } from './settings.js';
import { db, defineSchema } from './db.js';

defineSchema(`
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
 link TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX IF NOT EXISTS notifications_by_user ON notifications(user_id, created_at);
`);

export interface NotifySettings { userIds: string[]; emails: string[]; onCreate: boolean; onReview: boolean; ownerUpdates: boolean }
const DEFAULTS: NotifySettings = { userIds: [], emails: [], onCreate: true, onReview: true, ownerUpdates: true };
export const getNotifySettings = () => getSetting<NotifySettings>('notify', DEFAULTS);

const smtpReady = () => Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
let transport: nodemailer.Transporter | null = null;
function mailer(): nodemailer.Transporter | null {
  if (!smtpReady()) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (Number(process.env.SMTP_PORT) || 465) === 465,
    auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASS!.trim() },
  });
  return transport;
}
const appUrl = () => (process.env.APP_URL?.trim() || 'https://web-production-d07de.up.railway.app').replace(/\/$/, '');
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function sendEmail(to: string[], subject: string, text: string, link: string) {
  const transporter = mailer();
  if (!transporter || !to.length) return { sent: false, reason: transporter ? 'no recipients' : 'SMTP is not configured' };
  const url = `${appUrl()}${link}`;
  await transporter.sendMail({
    from: process.env.MAIL_FROM?.trim() || `Mobde3 <${process.env.SMTP_USER!.trim()}>`,
    to: to.join(', '),
    subject,
    text: `${text}\n\n${url}`,
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;color:#17191c"><h2 style="color:#0046ff;margin:0 0 8px">${escape(subject)}</h2><p>${escape(text)}</p><p><a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#0046ff;color:#fff;text-decoration:none;font-weight:bold">افتح المنشور</a></p><p style="color:#8a94a6;font-size:12px">Engosoft · مبدع</p></div>`,
  });
  return { sent: true };
}

async function notifyUsers(userIds: string[], kind: string, title: string, body: string, link: string) {
  const now = new Date().toISOString();
  for (const userId of new Set(userIds)) await db.run('INSERT INTO notifications (id,user_id,kind,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)', [randomUUID(), userId, kind, title, body, link, now]);
}

/** A direct notification to one person (e.g. their design finished while they were on another page). */
export function notifyUser(userId: string, kind: string, title: string, body: string, link: string) {
  void notifyUsers([userId], kind, title, body, link).catch((error) => console.error('Notification failed:', error instanceof Error ? error.message : error));
}

const departmentName = (id: string | null) => DEPARTMENTS.find((d) => d.id === id)?.name.ar ?? '';

/** Called by the content routes after a post is created or moves; never throws into the request. */
export async function notifyContent(actor: AuthUser, item: { id: string; title: string; ownerId: string; departmentId: string | null }, event: 'created' | ContentStatus) {
  try {
    const settings = await getNotifySettings();
    const link = `/content/${item.id}`;
    const who = `${actor.name}${actor.departmentId ? ` (${departmentName(actor.departmentId)})` : ''}`;
    if (event === 'created' || event === 'ready_for_review') {
      if (event === 'created' && !settings.onCreate) return;
      if (event === 'ready_for_review' && !settings.onReview) return;
      const title = event === 'created' ? `منشور جديد من ${who}` : `${who} أرسل منشورًا للمراجعة`;
      // Without chosen recipients, the people who can approve hear about it.
      const chosen = settings.userIds.length ? settings.userIds : (await listUsers()).filter((u) => u.status === 'active' && userCan(u, 'content.approve')).map((u) => u.id);
      await notifyUsers(chosen.filter((id) => id !== actor.id), event === 'created' ? 'content_created' : 'content_review', title, item.title, link);
      if (settings.emails.length) void sendEmail(settings.emails, title, `«${item.title}»`, link).catch((error) => console.error('Notification email failed:', error instanceof Error ? error.message : error));
      return;
    }
    if (!settings.ownerUpdates || item.ownerId === actor.id) return;
    const outcome: Partial<Record<ContentStatus, string>> = { approved: 'اعتُمد', changes_requested: 'يحتاج إلى تعديل', cancelled: 'أُلغي', scheduled: 'جُدول للنشر', published: 'نُشر' };
    if (!outcome[event]) return;
    await notifyUsers([item.ownerId], `content_${event}`, `منشورك ${outcome[event]}`, `«${item.title}» — ${actor.name}`, link);
    const owner = await getUser(item.ownerId);
    if (owner?.email && smtpReady()) void sendEmail([owner.email], `منشورك ${outcome[event]}`, `«${item.title}» — ${actor.name}`, link).catch(() => {});
  } catch (error) {
    console.error('Notification failed:', error instanceof Error ? error.message : error);
  }
}

export function registerNotifyRoutes(app: express.Express) {
  app.get('/api/notifications', requireUser, async (req, res) => {
    const rows = await db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 60', [req.user!.id]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      unread: rows.filter((row) => !row.read_at).length,
      items: rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, link: row.link, createdAt: row.created_at, readAt: row.read_at })),
    });
  });
  app.post('/api/notifications/read', requireUser, async (req, res) => {
    const parsed = z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'طلب غير صالح.' });
    const now = new Date().toISOString();
    if (parsed.data.ids?.length) {
      for (const id of parsed.data.ids) await db.run('UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL', [now, id, req.user!.id]);
    } else await db.run('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL', [now, req.user!.id]);
    res.json({ ok: true });
  });

  app.get('/api/settings/notifications', requireUser, requirePermission('users.manage'), async (_req, res) => {
    res.json({ ...(await getNotifySettings()), smtpConfigured: smtpReady(), sender: process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || null });
  });
  app.put('/api/settings/notifications', requireUser, requirePermission('users.manage'), async (req, res) => {
    const parsed = z.object({
      userIds: z.array(z.string().max(80)).max(100), emails: z.array(z.string().email().max(200)).max(20),
      onCreate: z.boolean(), onReview: z.boolean(), ownerUpdates: z.boolean(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'تحقق من عناوين البريد: يجب أن تكون صحيحة.' });
    res.json({ ...(await setSetting('notify', parsed.data)), smtpConfigured: smtpReady() });
  });
  app.post('/api/settings/notifications/test', requireUser, requirePermission('users.manage'), async (req, res) => {
    const settings = await getNotifySettings();
    await notifyUsers([req.user!.id, ...settings.userIds], 'test', 'إشعار تجريبي', 'إذا ظهرت لك هذه الرسالة فالإشعارات تعمل.', '/settings');
    try {
      const result = await sendEmail(settings.emails, 'إشعار تجريبي من مبدع', 'إذا وصلك هذا البريد فإشعارات المنشورات الجديدة تعمل.', '/content');
      res.json({ inApp: true, email: result });
    } catch (error) {
      res.status(502).json({ inApp: true, error: `أُرسل الإشعار داخل التطبيق، لكن تعذّر إرسال البريد: ${error instanceof Error ? error.message : 'SMTP error'}` });
    }
  });
}
