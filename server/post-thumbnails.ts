import type express from 'express';
import sharp from 'sharp';
import { requirePermission } from './auth.js';
import { db } from './db.js';

/**
 * The picture of a measured post, served from this app so an export can hold it.
 * The platforms' image hosts do not allow the browser to read the bytes (no CORS), so the
 * analytics report asks for them here. Only the address the sync stored for that post is
 * fetched, never one the caller sends, and the result is a small JPEG.
 */

const WIDTH = 480;
const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

async function storedThumbnail(platform: string, externalId: string): Promise<string | undefined> {
  const row = await db.get<{ thumbnail: string }>('SELECT thumbnail FROM observed_posts WHERE platform=? AND external_id=?', [platform, externalId]);
  return row?.thumbnail || undefined;
}

export async function fetchThumbnail(url: string, fetcher: typeof fetch = fetch): Promise<Buffer | undefined> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:') return undefined;
  const response = await fetcher(parsed, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'image/*', 'User-Agent': 'Mozilla/5.0 (compatible; SocialPulse/1.0)' } }).catch(() => undefined);
  if (!response?.ok) return undefined;
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_BYTES) return undefined;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return undefined;
  try {
    return await sharp(bytes, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: WIDTH, height: WIDTH * 2, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  } catch {
    return undefined;
  }
}

export function registerPostThumbnailRoutes(app: express.Express) {
  app.get('/api/analytics/thumbnail/:platform/:externalId', requirePermission('analytics.view'), async (req, res) => {
    const url = await storedThumbnail(String(req.params.platform), String(req.params.externalId));
    const image = url ? await fetchThumbnail(url) : undefined;
    if (!image) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ error: 'صورة المنشور مش متاحة.' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(image);
  });
}
