/**
 * Campaigns and their identity: name, slogan, hashtag, the slogan stamp placed on every AI design made for the
 * campaign, and an optional key visual the strategist sees as a style reference. Marketing manages them;
 * anyone who creates posts can pick one.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import express from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import { requirePermission, requireUser, userCan } from './auth.js';
import { db, defineSchema } from './db.js';
import { mediaDir } from './paths.js';
import { STAMP_CORNERS, type CampaignIdentity, type StampCorner } from './creative-intelligence/logo-resolution/campaign-stamp.js';

defineSchema(`
CREATE TABLE IF NOT EXISTS campaigns (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, slogan TEXT NOT NULL DEFAULT '', hashtag TEXT NOT NULL DEFAULT '',
 stamp_file TEXT NOT NULL DEFAULT '', key_visual_file TEXT NOT NULL DEFAULT '', stamp_corner TEXT NOT NULL DEFAULT 'bottom-right',
 stamp_width REAL NOT NULL DEFAULT 0.3, starts_on TEXT, ends_on TEXT, status TEXT NOT NULL DEFAULT 'active',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
`);

export interface Campaign {
  id: string; name: string; slogan: string; hashtag: string; corner: StampCorner; width: number;
  startsOn: string | null; endsOn: string | null; status: 'active' | 'archived';
  stampUrl: string | null; keyVisualUrl: string | null; createdAt: string; updatedAt: string;
}

const fileOf = (name: string) => (name ? mediaDir('campaigns', name) : '');
const toCampaign = (r: Record<string, unknown>): Campaign => ({
  id: String(r.id), name: String(r.name), slogan: String(r.slogan), hashtag: String(r.hashtag),
  corner: STAMP_CORNERS.includes(r.stamp_corner as StampCorner) ? r.stamp_corner as StampCorner : 'bottom-right', width: Number(r.stamp_width) || 0.3,
  startsOn: (r.starts_on as string | null) || null, endsOn: (r.ends_on as string | null) || null, status: r.status === 'archived' ? 'archived' : 'active',
  stampUrl: r.stamp_file ? `/api/campaigns/${r.id}/stamp.png?v=${encodeURIComponent(String(r.updated_at))}` : null,
  keyVisualUrl: r.key_visual_file ? `/api/campaigns/${r.id}/key.png?v=${encodeURIComponent(String(r.updated_at))}` : null,
  createdAt: String(r.created_at), updatedAt: String(r.updated_at),
});

export const listCampaigns = async () => (await db.all('SELECT * FROM campaigns ORDER BY status, COALESCE(starts_on, created_at) DESC')).map(toCampaign);
export const getCampaign = async (id: string) => { const r = await db.get('SELECT * FROM campaigns WHERE id=?', [id]); return r ? toCampaign(r) : undefined; };

/** What the design pipeline needs: the texts, and the files by path. */
export async function campaignIdentity(id: string): Promise<CampaignIdentity | undefined> {
  const r = await db.get<Record<string, unknown>>('SELECT * FROM campaigns WHERE id=?', [id]);
  if (!r || r.status === 'archived') return undefined;
  const c = toCampaign(r);
  return { id: c.id, name: c.name, slogan: c.slogan, hashtag: c.hashtag, corner: c.corner, width: c.width, stampPath: fileOf(String(r.stamp_file)), keyVisualPath: fileOf(String(r.key_visual_file)) };
}

/**
 * Stores an uploaded image as PNG. The stamp keeps its transparency and loses empty transparent edges, so its
 * size on the design is the size of the lockup itself.
 */
async function saveImage(dataUrl: string, kind: 'stamp' | 'key'): Promise<string> {
  const input = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  let image = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  if (kind === 'stamp') image = image.trim({ threshold: 1 });
  const png = await image.resize({ width: kind === 'stamp' ? 1600 : 1400, height: 1600, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const dir = mediaDir('campaigns');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}-${kind}.png`;
  writeFileSync(mediaDir('campaigns', name), png);
  return name;
}

const imageData = z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(12_000_000);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const input = z.object({
  name: z.string().trim().min(2).max(120), slogan: z.string().trim().max(200).default(''),
  hashtag: z.string().trim().max(80).default('').transform((tag) => (tag && !tag.startsWith('#') ? `#${tag.replace(/\s+/g, '_')}` : tag.replace(/\s+/g, '_'))),
  corner: z.enum(STAMP_CORNERS as [StampCorner, ...StampCorner[]]).default('bottom-right'), width: z.number().min(0.12).max(0.5).default(0.3),
  startsOn: day.default(null), endsOn: day.default(null), status: z.enum(['active', 'archived']).default('active'),
  stamp: imageData.nullable().optional(), keyVisual: imageData.nullable().optional(),
});

export function registerCampaignRoutes(app: express.Express) {
  app.get('/api/campaigns', requireUser, async (req, res) => {
    if (!userCan(req.user!, 'content.create') && !userCan(req.user!, 'templates.manage')) return res.status(403).json({ error: 'لا تملك صلاحية عرض الحملات.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json(await listCampaigns());
  });
  app.post('/api/campaigns', requireUser, requirePermission('templates.manage'), async (req, res) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اكتب اسم الحملة، وارفع الشعار كصورة PNG أو JPEG أو WebP.' });
    try {
      const v = parsed.data, now = new Date().toISOString(), id = randomUUID();
      const stamp = v.stamp ? await saveImage(v.stamp, 'stamp') : '';
      const key = v.keyVisual ? await saveImage(v.keyVisual, 'key') : '';
      await db.run('INSERT INTO campaigns (id,name,slogan,hashtag,stamp_file,key_visual_file,stamp_corner,stamp_width,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, v.name, v.slogan, v.hashtag, stamp, key, v.corner, v.width, v.startsOn, v.endsOn, v.status, req.user!.id, now, now]);
      res.status(201).json(await getCampaign(id));
    } catch { res.status(400).json({ error: 'تعذّر قراءة الصورة.' }); }
  });
  app.patch('/api/campaigns/:id', requireUser, requirePermission('templates.manage'), async (req, res) => {
    const row = await db.get<Record<string, unknown>>('SELECT * FROM campaigns WHERE id=?', [String(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'الحملة غير موجودة.' });
    const parsed = input.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'بيانات الحملة غير صالحة.' });
    try {
      const v = parsed.data, current = toCampaign(row);
      // A new image replaces the old one; null removes it; leaving the field out keeps it.
      const stamp = v.stamp === undefined ? String(row.stamp_file) : v.stamp ? await saveImage(v.stamp, 'stamp') : '';
      const key = v.keyVisual === undefined ? String(row.key_visual_file) : v.keyVisual ? await saveImage(v.keyVisual, 'key') : '';
      await db.run('UPDATE campaigns SET name=?,slogan=?,hashtag=?,stamp_file=?,key_visual_file=?,stamp_corner=?,stamp_width=?,starts_on=?,ends_on=?,status=?,updated_at=? WHERE id=?',
        [v.name ?? current.name, v.slogan ?? current.slogan, v.hashtag ?? current.hashtag, stamp, key, v.corner ?? current.corner, v.width ?? current.width,
          v.startsOn === undefined ? current.startsOn : v.startsOn, v.endsOn === undefined ? current.endsOn : v.endsOn, v.status ?? current.status, new Date().toISOString(), current.id]);
      res.json(await getCampaign(current.id));
    } catch { res.status(400).json({ error: 'تعذّر قراءة الصورة.' }); }
  });
  for (const [route, column] of [['stamp.png', 'stamp_file'], ['key.png', 'key_visual_file']] as const) {
    app.get(`/api/campaigns/:id/${route}`, requireUser, async (req, res) => {
      const row = await db.get<Record<string, string>>(`SELECT ${column} AS file FROM campaigns WHERE id=?`, [String(req.params.id)]);
      if (!row?.file) return res.status(404).end();
      res.sendFile(mediaDir('campaigns', row.file), { headers: { 'Cache-Control': 'private, max-age=86400' } }, (error) => { if (error && !res.headersSent) res.status(404).end(); });
    });
  }
}
