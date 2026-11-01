/**
 * Reads a campaign image the way a designer would: marketing uploads whatever they have (often a finished post
 * with the slogan sticker on it, not a clean transparent PNG) and the vision model finds the slogan lockup,
 * reads the slogan and hashtag, and describes the campaign's look. The lockup is then cut out in code — cropped
 * and its flat background removed — so the stamp placed on AI designs is the sticker alone, never a tiny copy
 * of the whole post.
 */
import sharp from 'sharp';
import { openAIJson } from './creative-intelligence/generation/provider.js';
import { STAMP_CORNERS, type StampCorner } from './creative-intelligence/logo-resolution/campaign-stamp.js';

export interface Box { x: number; y: number; width: number; height: number }
export interface CampaignDetection {
  name: string; slogan: string; hashtag: string;
  /** The slogan lockup (sticker, badge or wordmark of the campaign), as fractions of the image; null when there is none. */
  lockup: Box | null;
  /** Where the lockup sits on the image, used as the stamp's preferred corner. */
  corner: StampCorner;
  palette: string[];
  /** Layout, typography and colour treatment of the campaign, for the strategist. */
  style: string;
}
export interface CampaignAnalysis extends Omit<CampaignDetection, 'lockup'> {
  /** The cut-out lockup as a PNG data URL, or null when no lockup was found. */
  stamp: string | null;
  /** How the stamp's background was handled. */
  background: 'transparent' | 'removed' | 'kept' | 'none';
  /** True when the upload was a whole design (the lockup is only part of it): a good key visual. */
  wholeDesign: boolean;
}

const box = { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } } };
const schema = {
  type: 'object', additionalProperties: false, required: ['name', 'slogan', 'hashtag', 'hasLockup', 'lockup', 'corner', 'palette', 'style'],
  properties: {
    name: { type: 'string' }, slogan: { type: 'string' }, hashtag: { type: 'string' },
    hasLockup: { type: 'boolean' }, lockup: box,
    corner: { type: 'string', enum: STAMP_CORNERS }, palette: { type: 'array', items: { type: 'string' } }, style: { type: 'string' },
  },
};

/** The vision call. Swappable in tests. */
export async function detectWithModel(png: Buffer, env: NodeJS.ProcessEnv = process.env): Promise<CampaignDetection> {
  const jpeg = await sharp(png).flatten({ background: '#ffffff' }).resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const found = await openAIJson<Omit<CampaignDetection, 'lockup'> & { hasLockup: boolean; lockup: Box }>({
    apiKey: env.OPENAI_API_KEY ?? '', model: env.OPENAI_VISION_MODEL?.trim() || 'gpt-5.5', reasoning: 'low',
    schemaName: 'engosoft_campaign_image', schema,
    instructions: [
      'You read a marketing image for an Engosoft campaign (engineering training, Saudi Arabia and Egypt). It may be a finished social post, a key visual, or just the campaign sticker.',
      'lockup: the campaign\'s own slogan lockup — the sticker, badge or styled wordmark that carries the campaign name, slogan and/or hashtag (e.g. a green sticker reading «الجمعة البيضاء … جمعة تغير مسارك»). Box it tightly with a small margin, as fractions of the image (0..1) from the top-left. It is NOT the Engosoft company logo, a website URL, a headline about a course, or a photo. hasLockup false (and a zero box) when there is none; if the whole image is the lockup, box the whole image.',
      'slogan: the campaign slogan exactly as written (Arabic stays Arabic, keep the wording; no hashtag sign). hashtag: the campaign hashtag exactly as written, starting with #, words joined by underscores; empty if none is visible. name: the campaign name if written (e.g. الجمعة البيضاء), else a short name from the slogan.',
      'corner: the corner of the image nearest the lockup (bottom-right if it is centred).',
      'palette: up to 5 dominant campaign colours as #RRGGBB, most important first.',
      'style: 2-4 sentences a designer can follow to make new posts that belong to this campaign: background treatment, colour use, typography feel, graphic devices, composition and mood. Describe, do not transcribe the text.',
    ].join(' '),
    content: [{ type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'high' }, { type: 'input_text', text: 'Read this campaign image.' }],
  });
  const { hasLockup, lockup, ...rest } = found;
  return { ...rest, lockup: hasLockup && lockup.width > 0.01 && lockup.height > 0.01 ? lockup : null };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Removes the flat background around a lockup: the colour of the crop's border is flood-filled away from the
 * edges inward (so the same colour inside the sticker survives), with soft alpha at the edge. Images that already
 * have transparency are only trimmed; a busy, non-flat border is kept as it is.
 */
export async function cutOut(png: Buffer): Promise<{ png: Buffer; background: 'transparent' | 'removed' | 'kept' }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, n = w * h;
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 200) clear++;
  if (clear > 0.04 * n) return { png: await sharp(png).trim().png().toBuffer().catch(() => png), background: 'transparent' };

  // The border ring: its mean colour is the background, its spread says whether it is flat.
  const ring: number[] = [];
  const t = Math.max(1, Math.round(Math.min(w, h) * 0.01));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < t || y < t || x >= w - t || y >= h - t) ring.push(y * w + x);
  const mean = [0, 1, 2].map((c) => ring.reduce((s, p) => s + data[p * 4 + c], 0) / ring.length);
  const dist = (p: number) => Math.hypot(data[p * 4] - mean[0], data[p * 4 + 1] - mean[1], data[p * 4 + 2] - mean[2]);
  const spread = ring.reduce((s, p) => s + dist(p), 0) / ring.length;
  if (spread > 38) return { png, background: 'kept' };

  // Flood fill from the border through pixels close to the background colour (gradients and glows included).
  const hard = clamp(spread * 2.4 + 26, 34, 80), soft = hard + 40;
  const alpha = new Uint8ClampedArray(n).fill(255);
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (const p of ring) if (dist(p) < hard && !seen[p]) { seen[p] = 1; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++];
    alpha[p] = 0;
    const x = p % w, y = (p - x) / w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
      if (q < 0 || seen[q]) continue;
      const d = dist(q);
      if (d < hard) { seen[q] = 1; queue[tail++] = q; }
      else if (d < soft) { seen[q] = 1; alpha[q] = Math.min(alpha[q], Math.round(((d - hard) / (soft - hard)) * 255)); }
    }
  }
  if (tail < 0.05 * n) return { png, background: 'kept' };
  for (let p = 0; p < n; p++) data[p * 4 + 3] = Math.min(data[p * 4 + 3], alpha[p]);
  const out = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return { png: await sharp(out).trim().png().toBuffer().catch(() => out), background: 'removed' };
}

/** Analyses an uploaded campaign image: the texts and style from the model, the stamp cut out in code. */
export async function analyzeCampaignImage(dataUrl: string, env: NodeJS.ProcessEnv = process.env, detect: (png: Buffer, env: NodeJS.ProcessEnv) => Promise<CampaignDetection> = detectWithModel): Promise<CampaignAnalysis> {
  const input = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  const png = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const meta = await sharp(png).metadata();
  const W = meta.width!, H = meta.height!;
  const found = await detect(png, env);
  const base = { name: found.name.trim(), slogan: found.slogan.trim().replace(/^#/, ''), hashtag: normaliseHashtag(found.hashtag), corner: STAMP_CORNERS.includes(found.corner) ? found.corner : 'bottom-right' as StampCorner, palette: found.palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5), style: found.style.trim() };
  if (!found.lockup) return { ...base, stamp: null, background: 'none', wholeDesign: true };
  // Vision boxes are estimates: pad them, then let the background removal and trim find the real edge.
  const pad = 0.035;
  const x0 = clamp(found.lockup.x - pad, 0, 1), y0 = clamp(found.lockup.y - pad, 0, 1);
  const x1 = clamp(found.lockup.x + found.lockup.width + pad, 0, 1), y1 = clamp(found.lockup.y + found.lockup.height + pad, 0, 1);
  const left = Math.round(x0 * W), top = Math.round(y0 * H);
  const width = Math.max(8, Math.min(W - left, Math.round((x1 - x0) * W))), height = Math.max(8, Math.min(H - top, Math.round((y1 - y0) * H)));
  const crop = await sharp(png).extract({ left, top, width, height }).png().toBuffer();
  const cut = await cutOut(crop);
  const wholeDesign = (x1 - x0) * (y1 - y0) < 0.6;
  return { ...base, stamp: `data:image/png;base64,${cut.png.toString('base64')}`, background: cut.background, wholeDesign };
}

export const normaliseHashtag = (tag: string) => {
  const clean = tag.trim().replace(/\s+/g, '_');
  return clean && !clean.startsWith('#') ? `#${clean}` : clean;
};
