/**
 * One way to put a logo on a finished image, for every server path (the AI designer, followed designs, the Studio,
 * reference designs): the design's kit decides the file and the treatment (audit #16).
 *
 * - `official` with an exact box from the resolver: the approved SVG, flat, verified pixel for pixel afterwards.
 * - any kit at a design spot (fractions of the reference design): the kit's file at that spot on the design's own
 *   shape, in the same corner at the same share of the width on any other shape, inside the safe area and never past
 *   the kit's size cap. A `print` kit gets the background's grain and a soft deep-blue shadow, as on the campaign posts.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { brandKit, kitFile, maxDrawWidth, type BrandKitId } from '../../../src/domain/brand-kits.js';
import { compositeLogo, type CompositedLogo } from '../logo-resolution/compositor.js';
import type { LogoVariantId } from './registry.js';

type Box = { x: number; y: number; width: number; height: number };

export type LogoSpot =
  /** The official logo at a box the resolver measured. */
  | { kind: 'box'; variantId: LogoVariantId; x: number; y: number; width: number }
  /**
   * The kit's logo where the reference design has it (`place` in fractions of the design). `same` when the canvas has
   * the design's shape. `file` overrides the kit's file (a library design's own copy).
   */
  | { kind: 'design-spot'; place: Box; same: boolean; designAspect: number; safe?: { top?: number; left?: number }; file?: string; onDark?: boolean };

export interface PlacedLogo { image: Buffer; box: Box; kit: BrandKitId; record?: CompositedLogo }

/** Absolute path of a kit's file on disk (served from `public/`). */
export function kitFilePath(kitId: BrandKitId, onDark = true): string {
  return resolve(process.cwd(), 'public', kitFile(brandKit(kitId), { onDark }).src.replace(/^\//, ''));
}

export async function placeLogo(image: Buffer, kitId: BrandKitId, spot: LogoSpot): Promise<PlacedLogo | null> {
  if (spot.kind === 'box') {
    const { image: out, record } = await compositeLogo(image, { variantId: spot.variantId, x: spot.x, y: spot.y, width: spot.width });
    return { image: out, box: { x: record.x, y: record.y, width: record.width, height: record.height }, kit: 'official', record };
  }
  const kit = brandKit(kitId);
  const kf = kitFile(kit, { onDark: spot.onDark ?? true });
  const path = spot.file ?? resolve(process.cwd(), 'public', kf.src.replace(/^\//, ''));
  if (!existsSync(path)) return null;
  const { width: W = 0, height: H = 0 } = await sharp(image).metadata();
  if (!W || !H) return null;
  // A vector is rasterised large enough for any canvas; a raster is used as it is.
  const source = kf.vector ? await sharp(readFileSync(path), { density: 600 }).png().toBuffer() : readFileSync(path);
  const file = await sharp(source).trim().png().toBuffer({ resolveWithObject: true });
  const ratio = file.info.width / file.info.height;
  const basis = W / H > 1.15 ? Math.min(W, Math.round(H * 1.4)) : W;
  const cap = kf.vector ? Infinity : file.info.width * (kit.maxScale ?? 1);
  const width = Math.min(spot.place.width * basis, cap, maxDrawWidth(kit, kf));
  const area: Box = spot.same
    ? { x: spot.place.x * W, y: spot.place.y * H, width: spot.place.width * W, height: spot.place.height * H }
    : { x: Math.max(spot.place.x * basis, spot.safe?.left ?? 0), y: Math.max(spot.place.y * basis / spot.designAspect, spot.safe?.top ?? 0), width, height: width / ratio };
  const fitted = await sharp(file.data).resize(Math.max(8, Math.round(area.width)), Math.max(8, Math.round(area.height)), { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: false })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = Math.min(fitted.info.width, W), h = Math.min(fitted.info.height, H);
  const left = Math.max(0, Math.min(W - w, Math.round(area.x + (area.width - w) / 2)));
  const top = Math.max(0, Math.min(H - h, Math.round(area.y + (area.height - h) / 2)));
  const box = { x: left, y: top, width: w, height: h };
  const px = Buffer.from(fitted.data);
  if (kit.treatment === 'flat') {
    const mark = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    return { image: await sharp(image).composite([{ input: mark, left, top }]).png().toBuffer(), box, kit: kit.id };
  }
  // The background's own grain under the logo: its brightness minus a soft blur of it, added to the logo's pixels.
  const under = sharp(image).extract({ left, top, width: w, height: h }).greyscale();
  const fine = await under.clone().raw().toBuffer();
  const smooth = await under.clone().blur(1.5).raw().toBuffer();
  for (let i = 0; i < w * h; i++) {
    if (!px[i * 4 + 3]) continue;
    const grain = (fine[i] - smooth[i]) * 0.7;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, Math.round(px[i * 4 + c] + grain)));
  }
  const mark = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  // The shadow: the logo's shape in deep blue at 55%, softened, a little below it.
  const s = basis / 1080;
  const pad = Math.min(Math.ceil(9 * s), left, top, W - left - w, H - top - h);
  if (pad < 1) return { image: await sharp(image).composite([{ input: mark, left, top }]).png().toBuffer(), box, kit: kit.id };
  const shade = Buffer.alloc((w + 2 * pad) * (h + 2 * pad) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = ((y + pad) * (w + 2 * pad) + x + pad) * 4;
    shade[o] = 0x00; shade[o + 1] = 0x15; shade[o + 2] = 0x7a; shade[o + 3] = Math.round(px[(y * w + x) * 4 + 3] * 0.55);
  }
  const shadow = await sharp(shade, { raw: { width: w + 2 * pad, height: h + 2 * pad, channels: 4 } }).blur(Math.max(0.5, 3 * s)).png().toBuffer();
  const shadowTop = Math.min(H - (h + 2 * pad), top - pad + Math.round(3 * s));
  const out = await sharp(image).composite([{ input: shadow, left: left - pad, top: shadowTop }, { input: mark, left, top }]).png().toBuffer();
  return { image: out, box, kit: kit.id };
}
