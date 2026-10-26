/** Places the exact approved logo file on a finished creative. Nothing else on the canvas changes. */
import sharp from 'sharp';
import { getLogoVariant, logoHeightFor, type LogoVariantId } from '../brand/registry.js';
import { loadApprovedLogo } from '../brand/integrity.js';
import { MODULE_VERSIONS } from '../versions.js';

export interface LogoPlacement { variantId: LogoVariantId; x: number; y: number; width: number; height?: number }
export interface CompositedLogo {
  variantId: LogoVariantId;
  assetSha256: string;
  x: number; y: number; width: number; height: number;
  compositorVersion: typeof MODULE_VERSIONS.logoCompositor;
}

export class LogoPlacementError extends Error {
  constructor(public code: 'out_of_canvas' | 'invalid_size', message: string) { super(message); }
}

/** Rasterize the approved SVG at an exact width; height always follows the artwork's ratio. */
export async function rasterizeLogo(variantId: LogoVariantId, width: number): Promise<{ png: Buffer; width: number; height: number }> {
  const variant = getLogoVariant(variantId);
  const w = Math.round(width);
  if (!Number.isFinite(w) || w < 8) throw new LogoPlacementError('invalid_size', `Logo width ${width} is not renderable`);
  const h = logoHeightFor(variant, w);
  // Supersample 2× then reduce, so thin tagline strokes stay crisp.
  const density = 72 * (2 * w) / variant.width;
  const png = await sharp(loadApprovedLogo(variantId), { density }).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  return { png, width: w, height: h };
}

export async function compositeLogo(creative: Buffer, placement: LogoPlacement): Promise<{ image: Buffer; record: CompositedLogo }> {
  const { width: canvasWidth = 0, height: canvasHeight = 0 } = await sharp(creative).metadata();
  const logo = await rasterizeLogo(placement.variantId, placement.width);
  const x = Math.round(placement.x), y = Math.round(placement.y);
  if (x < 0 || y < 0 || x + logo.width > canvasWidth || y + logo.height > canvasHeight) {
    throw new LogoPlacementError('out_of_canvas', `Logo ${logo.width}×${logo.height} at ${x},${y} does not fit a ${canvasWidth}×${canvasHeight} canvas`);
  }
  const image = await sharp(creative).composite([{ input: logo.png, left: x, top: y }]).png().toBuffer();
  const variant = getLogoVariant(placement.variantId);
  return {
    image,
    record: { variantId: variant.id, assetSha256: variant.sha256, x, y, width: logo.width, height: logo.height, compositorVersion: MODULE_VERSIONS.logoCompositor },
  };
}

/**
 * Prove a composite is honest: pixels outside the logo box are untouched (no plate, no tint), and the
 * logo box equals a fresh render of the approved artwork over the original background.
 */
export async function verifyComposite(before: Buffer, after: Buffer, record: CompositedLogo): Promise<string[]> {
  const problems: string[] = [];
  const a = await sharp(before).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(after).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return ['Canvas size changed during compositing'];
  const variant = getLogoVariant(record.variantId);
  if (record.assetSha256 !== variant.sha256) problems.push('Record does not reference the approved asset hash');
  if (Math.abs(record.height - record.width / variant.aspectRatio) > 1) return [...problems, 'Logo aspect ratio was altered'];
  const { width, height } = a.info;
  let outside = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= record.x && x < record.x + record.width && y >= record.y && y < record.y + record.height) continue;
      const i = (y * width + x) * 4;
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) outside++;
    }
  }
  if (outside) problems.push(`${outside} pixels outside the logo box changed`);
  const fresh = await rasterizeLogo(record.variantId, record.width);
  const expected = await sharp(before).extract({ left: record.x, top: record.y, width: record.width, height: record.height })
    .composite([{ input: fresh.png, left: 0, top: 0 }]).ensureAlpha().raw().toBuffer();
  const actual = await sharp(after).extract({ left: record.x, top: record.y, width: record.width, height: record.height }).ensureAlpha().raw().toBuffer();
  let worst = 0;
  for (let i = 0; i < expected.length; i++) worst = Math.max(worst, Math.abs(expected[i] - actual[i]));
  if (worst > 2) problems.push(`Logo pixels differ from the approved artwork (max channel difference ${worst})`);
  return problems;
}
