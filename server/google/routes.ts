import { createHash, randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { getUser, readCookie, requirePermission, userCan } from '../auth.js';
import { equalState } from '../social/oauth.js';
import { loadSecret, saveSecret, listAccounts, cancelQueued, contentQueue } from '../social/store.js';
import { request } from '../social/http.js';
import type { Credential } from '../social/types.js';
import { GOOGLE_SCOPES, GoogleClient, googleConfig, googleReference, googleSecret } from './client.js';
import { getSource, sourceRows } from './store.js';
import { rowOutcome, syncGoogleSource } from './calendar-sync.js';
import { getContent } from '../workspace.js';
import { validatePreparedPublication } from '../social/queue.js';
import { getJob } from '../social/publishing.js';
import { readSheet } from 'read-excel-file/node';
import { parse as parseCsv } from 'csv-parse/sync';
import { headersOf } from './format.js';
import type { GoogleValues } from './client.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const sourceSchema = z.object({ spreadsheetUrl: z.string().max(2048), tab: z.string().trim().min(1).max(100), targets: z.partialRecord(z.enum(['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'snapchat']), z.string().max(200)), enabled: z.boolean(), consent: z.literal(true) });
const mustManage: express.RequestHandler = (req, res, next) => {
  if (!['connections.manage', 'content.create', 'content.edit_own', 'content.schedule', 'content.publish'].every(p => userCan(req.user!, p as never))) return res.status(403).json({ error: 'يلزم تفويض الربط والإنشاء والجدولة والنشر.' });
  next();
};
export function registerGoogleCalendarRoutes(app: express.Express) {
  app.use('/api/google-calendar', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.header('origin')) {
      try { const origin = new URL(req.header('origin')!); if (origin.origin !== new URL(process.env.APP_URL || 'http://127.0.0.1:4100').origin && origin.host !== req.header('host')) return res.status(403).json({ error: 'Cross-origin request refused.' }); } catch { return res.status(403).end(); }
    }
    next();
  }, requirePermission('connections.manage'));
  app.get('/api/oauth/drive/start', mustManage, async (req, res) => {
    try {
      const config = googleConfig(), state = randomBytes(32).toString('base64url');
      await db.run('DELETE FROM social_oauth_states WHERE expires_at<?', [Date.now()]);
      await db.run('INSERT INTO social_oauth_states(hash,provider,owner_id,mode,expires_at) VALUES(?,?,?,?,?)', [hash(state), 'drive', req.user!.id, 'calendar', Date.now() + 600_000]);
      res.cookie('google_calendar_state', state, { httpOnly: true, secure: config.redirect.startsWith('https:'), sameSite: 'lax', maxAge: 600_000, path: '/api/oauth/drive' });
      const query = new URLSearchParams({ client_id: config.client!, redirect_uri: config.redirect, response_type: 'code', scope: GOOGLE_SCOPES.join(' '), state, access_type: 'offline', prompt: 'consent' });
      res.setHeader('Cache-Control', 'no-store'); res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
    } catch (e) { res.status(503).json({ error: e instanceof Error ? e.message : 'Google OAuth is not configured.' }); }
  });
  app.get('/api/oauth/drive/callback', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookie = readCookie(req, 'google_calendar_state');
    res.clearCookie('google_calendar_state', { httpOnly: true, secure: process.env.APP_URL?.startsWith('https:'), sameSite: 'lax', path: '/api/oauth/drive' });
    if (!equalState(state, cookie)) return res.status(400).send('Invalid OAuth state.');
    const saved = await db.get<{ owner_id: string }>('DELETE FROM social_oauth_states WHERE hash=? AND provider=? AND expires_at>=? RETURNING owner_id', [hash(state), 'drive', Date.now()]);
    const user = saved ? await getUser(saved.owner_id) : undefined;
    if (!user || user.status !== 'active' || !userCan(user, 'connections.manage')) return res.status(403).send('Authorization expired.');
    if (req.query.error || typeof req.query.code !== 'string') return res.redirect('/calendar?google=denied');
    try {
      const config = googleConfig();
      const value = await request<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: req.query.code, client_id: config.client!, client_secret: config.secret!, redirect_uri: config.redirect }) });
      if (!value.access_token || !value.refresh_token || !GOOGLE_SCOPES.every(s => (value.scope || '').split(' ').includes(s))) throw new Error('Missing offline consent.');
      const credential: Credential = { accessToken: value.access_token, refreshToken: value.refresh_token, expiresAt: Date.now() + value.expires_in * 1000, scopes: value.scope!.split(' ') };
      await saveSecret(googleSecret(user.id), credential);
      res.redirect('/calendar?google=connected');
    } catch { res.redirect('/calendar?google=failed'); }
  });
  app.get('/api/google-calendar', async (req, res) => {
    let oauthConfigured = true; try { googleConfig(); } catch { oauthConfigured = false; }
    let connected = false; try { const secret = await loadSecret(googleSecret(req.user!.id)); connected = Boolean(secret?.refreshToken && GOOGLE_SCOPES.every(s => secret.scopes.includes(s))); } catch {}
    const sources = await db.all("SELECT id,spreadsheet_id,tab,targets_json,enabled,last_sync_at,error,validation_errors_json FROM google_calendar_sources WHERE owner_id=? AND spreadsheet_id NOT LIKE 'native:%'", [req.user!.id]);
    const rows = [];
    for (const source of sources) for (const row of await sourceRows(String(source.id))) rows.push({ sourceId: source.id, postId: row.post_id, contentId: row.content_id, ...await rowOutcome(row) });
    res.json({ oauthConfigured, connected, callbackUrl: `${new URL(process.env.APP_URL || 'http://127.0.0.1:4100').origin}/api/oauth/drive/callback`, sources: sources.map(s => ({ ...s, targets: JSON.parse(String(s.targets_json)), targets_json: undefined, validationErrors: JSON.parse(String(s.validation_errors_json)), validation_errors_json: undefined })), rows,
      accounts: (await listAccounts()).filter(a => a.status === 'connected').map(a => ({ id: a.id, provider: a.provider, name: a.name })) });
  });
  app.post('/api/google-calendar/inspect', mustManage, async (req, res) => {
    try { const ref = googleReference(String(req.body.spreadsheetUrl || ''), 'sheet'); res.json(await new GoogleClient(req.user!.id).metadata(ref.id)); }
    catch (e) { res.status(409).json({ error: e instanceof Error ? e.message : 'تعذّر فتح الشيت.' }); }
  });
  app.post('/api/google-calendar/import', mustManage, express.raw({ type: 'application/octet-stream', limit: '8mb' }), async (req, res) => {
    try {
      const filename = decodeURIComponent(req.header('X-Filename') || '').slice(0, 120);
      const input = sourceSchema.parse({ spreadsheetUrl: 'upload', tab: 'Calendar', targets: JSON.parse(req.header('X-Targets') || '{}'), enabled: req.header('X-Autopublish') === 'true', consent: req.header('X-Consent') === 'true' });
      if (!Buffer.isBuffer(req.body)) throw new Error('ارفع ملف CSV أو XLSX.');
      let values: unknown[][];
      if (filename.toLowerCase().endsWith('.csv')) values = parseCsv(req.body.toString('utf8').replace(/^\uFEFF/, ''), { skip_empty_lines: true, relax_column_count: true });
      else if (filename.toLowerCase().endsWith('.xlsx')) values = await readSheet(req.body, 'Calendar').catch(() => readSheet(req.body, 1)) as unknown[][];
      else throw new Error('ارفع ملف CSV أو XLSX.');
      const names = (values[0] || []).map(v => String(v).trim().toLowerCase());
      const normalized = values.map(row => row.map((v, i) => v instanceof Date ? (names[i] === 'time' ? v.toISOString().slice(11, 16) : v.toISOString().slice(0, 10)) : v)) as GoogleValues;
      headersOf(normalized);
      if (normalized.length > 2000) throw new Error('الحد 1999 بوست لكل ملف.');
      for (const [provider, accountId] of Object.entries(input.targets)) if (!(await listAccounts()).some(a => a.id === accountId && a.provider === provider && a.status === 'connected')) throw new Error('حساب نشر غير متصل أو لا يطابق المنصة.');
      const spreadsheetId = `upload:${req.user!.id}`;
      const existing = await db.get<{ id: string }>('SELECT id FROM google_calendar_sources WHERE spreadsheet_id=? AND tab=?', [spreadsheetId, 'Calendar']);
      if (existing && (await getSource(existing.id))!.lock_until > Date.now()) throw new Error('انتظر انتهاء المزامنة قبل رفع نسخة جديدة.');
      const id = existing?.id || randomUUID();
      await db.run('INSERT INTO google_calendar_sources(id,spreadsheet_id,tab,owner_id,targets_json,enabled,snapshot_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET targets_json=excluded.targets_json,enabled=excluded.enabled,snapshot_json=excluded.snapshot_json,last_sync_at=NULL,revision=google_calendar_sources.revision+1', [id, spreadsheetId, 'Calendar', req.user!.id, JSON.stringify(input.targets), Number(input.enabled), JSON.stringify(normalized)]);
      if (!input.enabled) for (const row of await sourceRows(id)) await cancelQueued(row.content_id, 'Automatic posting disabled.');
      res.json({ id });
    } catch (e) { res.status(400).json({ error: e instanceof z.ZodError ? 'أكّد اختيارات الربط والنشر قبل الرفع.' : e instanceof Error ? e.message : 'تعذّرت قراءة الملف.' }); }
  });
  app.post('/api/google-calendar', mustManage, async (req, res) => {
    const parsed = sourceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اختر الشيت والتابة وحسابات النشر وأكّد الإعدادات.' });
    try {
      const ref = googleReference(parsed.data.spreadsheetUrl, 'sheet'), client = new GoogleClient(req.user!.id);
      const metadata = await client.metadata(ref.id);
      if (!metadata.sheets.some(s => s.properties.title === parsed.data.tab)) throw new Error('اسم التابة غير موجود.');
      for (const [provider, accountId] of Object.entries(parsed.data.targets)) if (!(await listAccounts()).some(a => a.id === accountId && a.provider === provider && a.status === 'connected')) throw new Error('حساب النشر المحدد غير متصل أو لا يطابق المنصة.');
      const existing = await db.get<{ id: string; owner_id: string }>('SELECT id,owner_id FROM google_calendar_sources WHERE spreadsheet_id=? AND tab=?', [ref.id, parsed.data.tab]);
      if (existing && existing.owner_id !== req.user!.id) throw new Error('الشيت مربوط بمسؤول آخر؛ افصل الربط السابق أولًا.');
      if (existing && (await getSource(existing.id))!.lock_until > Date.now()) throw new Error('انتظر انتهاء المزامنة قبل تعديل الإعدادات.');
      const id = existing?.id || randomUUID();
      await db.run('INSERT INTO google_calendar_sources(id,spreadsheet_id,tab,owner_id,targets_json,enabled) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET targets_json=excluded.targets_json,enabled=excluded.enabled,last_sync_at=NULL,revision=google_calendar_sources.revision+1', [id, ref.id, parsed.data.tab, req.user!.id, JSON.stringify(parsed.data.targets), Number(parsed.data.enabled)]);
      // Invalidate the previous snapshot immediately; a settings change cannot send the old target selection.
      if (!parsed.data.enabled) for (const row of await sourceRows(id)) await cancelQueued(row.content_id, 'Automatic posting disabled.');
      res.json({ id });
    } catch (e) { res.status(409).json({ error: e instanceof Error ? e.message : 'تعذّر حفظ الربط.' }); }
  });
  app.post('/api/google-calendar/:id/sync', mustManage, async (req, res) => {
    const source = await getSource(String(req.params.id));
    if (!source || source.owner_id !== req.user!.id) return res.status(404).end();
    try { res.json(await syncGoogleSource(source.id)); } catch (e) { res.status(409).json({ error: e instanceof Error ? e.message : 'تعذّرت المزامنة.' }); }
  });
  app.post('/api/google-calendar/:id/pause', mustManage, async (req, res) => {
    const source = await getSource(String(req.params.id));
    if (!source || source.owner_id !== req.user!.id) return res.status(404).end();
    await db.run('UPDATE google_calendar_sources SET enabled=0,last_sync_at=NULL,revision=revision+1 WHERE id=?', [source.id]);
    for (const row of await sourceRows(source.id)) await cancelQueued(row.content_id, 'Google source paused.');
    res.json({ paused: true });
  });
  app.post('/api/google-calendar/:id/recheck', mustManage, async (req, res) => {
    const source = await getSource(String(req.params.id));
    if (!source || source.owner_id !== req.user!.id) return res.status(404).end();
    if (source.lock_until > Date.now()) return res.status(409).json({ error: 'انتظر انتهاء المزامنة.' });
    // Recheck blocked setup, never replay accounts which have started a remote publication.
    await db.run("UPDATE google_calendar_rows SET fingerprint='' WHERE source_id=? AND status='blocked' AND NOT EXISTS (SELECT 1 FROM social_publish_jobs j WHERE j.content_id=google_calendar_rows.content_id)", [source.id]);
    try { res.json(await syncGoogleSource(source.id)); } catch (e) { res.status(409).json({ error: e instanceof Error ? e.message : 'تعذّرت المراجعة.' }); }
  });
  app.post('/api/google-calendar/:id/rows/:postId/retry', mustManage, async (req, res) => {
    const source = await getSource(String(req.params.id));
    if (!source || source.owner_id !== req.user!.id) return res.status(404).end();
    if (!source.enabled || source.lock_until > Date.now() || source.error || !source.last_sync_at || source.last_sync_at < Date.now() - 120_000) return res.status(409).json({ error: 'فعّل الربط وحدّث الشيت أولًا.' });
    const mapping = (await sourceRows(source.id)).find(r => r.post_id === String(req.params.postId));
    if (!mapping) return res.status(404).end();
    try {
      const queue = await contentQueue(mapping.content_id); let retried = 0;
      for (const row of queue.filter(q => ['failed', 'sent'].includes(q.state))) {
        const job = row.jobId ? await getJob(row.jobId) : undefined;
        if (job && job.state !== 'failed' || row.state === 'sent' && !job) continue;
        if (!await getContent(row.contentId)) continue;
        const input = { ...row.options, contentId: row.contentId, accountId: row.accountId, kind: row.kind, media: row.media as never, mode: 'direct' as const, consent: true as const, retry: true };
        await validatePreparedPublication(req.user!, input);
        retried += (await db.run("UPDATE social_publish_queue SET state='queued',publish_at=?,options_json=?,error=NULL,updated_at=? WHERE id=? AND state=?", [new Date().toISOString(), JSON.stringify({ ...row.options, retry: true }), new Date().toISOString(), row.id, row.state])).changes;
      }
      res.json({ retried });
    } catch (e) { res.status(409).json({ error: e instanceof Error ? e.message : 'تعذّرت إعادة المحاولة.' }); }
  });
  app.post('/api/google-calendar/disconnect', mustManage, async (req, res) => {
    const sources = await db.all<{ id: string }>("SELECT id FROM google_calendar_sources WHERE owner_id=? AND spreadsheet_id NOT LIKE 'native:%'", [req.user!.id]);
    await db.run("UPDATE google_calendar_sources SET enabled=0,last_sync_at=NULL,revision=revision+1 WHERE owner_id=? AND spreadsheet_id NOT LIKE 'native:%'", [req.user!.id]);
    for (const s of sources) for (const row of await sourceRows(s.id)) await cancelQueued(row.content_id, 'Google disconnected.');
    await db.run('DELETE FROM social_credentials WHERE id=?', [googleSecret(req.user!.id)]);
    res.json({ disconnected: true });
  });
}
