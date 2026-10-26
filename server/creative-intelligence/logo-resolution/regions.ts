/** Pixel measurements of a canvas region: what sits under a candidate logo position. */
import sharp from 'sharp';
import type { BackgroundClass } from '../brand/registry.js';
import { classifyBackground, contrastFromLuminance, hexToRgb, hsl, relativeLuminance, type ColorStats } from './background-class.js';

export { contrastRatio, relativeLuminance, REGION_THRESHOLDS } from './background-class.js';

export interface Box { x: number; y: number; width: number; height: number }
export interface RasterImage { data: Buffer; width: number; height: number }

/** Decode to flat 8-bit RGB. Transparent areas are treated as white, as a published post would be. */
export async function decodeImage(input: Buffer): Promise<RasterImage> {
  const { data, info } = await sharp(input).flatten({ background: '#FFFFFF' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function clipBox(box: Box, width: number, height: number): Box {
  const x = Math.max(0, Math.floor(box.x)), y = Math.max(0, Math.floor(box.y));
  const right = Math.min(width, Math.ceil(box.x + box.width)), bottom = Math.min(height, Math.ceil(box.y + box.height));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
export const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
export const expandBox = (box: Box, by: number): Box => ({ x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by });

export interface RegionMeasurement extends ColorStats {
  box: Box;
  meanHex: string;
  backgroundClass: BackgroundClass;
}

export function measureRegion(image: RasterImage, region: Box): RegionMeasurement {
  const box = clipBox(region, image.width, image.height);
  if (!box.width || !box.height) throw new Error('Region lies outside the image');
  let r = 0, g = 0, b = 0, lum = 0, lumSq = 0, grad = 0, gradCount = 0;
  const gray = (x: number, y: number) => { const i = (y * image.width + x) * 3; return 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]; };
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = (y * image.width + x) * 3;
      r += image.data[i]; g += image.data[i + 1]; b += image.data[i + 2];
      const l = relativeLuminance(image.data[i], image.data[i + 1], image.data[i + 2]);
      lum += l; lumSq += l * l;
      const here = gray(x, y);
      if (x + 1 < box.x + box.width) { grad += Math.abs(gray(x + 1, y) - here); gradCount++; }
      if (y + 1 < box.y + box.height) { grad += Math.abs(gray(x, y + 1) - here); gradCount++; }
    }
  }
  const n = box.width * box.height;
  const mean = [r / n, g / n, b / n].map(Math.round) as [number, number, number];
  const meanLum = lum / n;
  const spread = Math.sqrt(Math.max(0, lumSq / n - meanLum * meanLum));
  const complexity = Math.min(1, (gradCount ? grad / gradCount : 0) / 255 * 4);
  const { h, s, l } = hsl(...mean);
  const chroma = (Math.max(...mean) - Math.min(...mean)) / 255;
  const base = { meanLuminance: relativeLuminance(...mean), luminanceSpread: spread, complexity, hue: h, saturation: s, lightness: l, chroma };
  return { box, meanHex: '#' + mean.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase(), ...base, backgroundClass: classifyBackground(base) };
}

/** How a fill color reads against every pixel of the region, not just the average. */
export function contrastProfile(image: RasterImage, region: Box, fillHex: string): { meanContrast: number; lowContrastShare: number } {
  const box = clipBox(region, image.width, image.height);
  const fill = relativeLuminance(...hexToRgb(fillHex));
  let low = 0, r = 0, g = 0, b = 0;
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = (y * image.width + x) * 3;
      r += image.data[i]; g += image.data[i + 1]; b += image.data[i + 2];
      if (contrastFromLuminance(fill, relativeLuminance(image.data[i], image.data[i + 1], image.data[i + 2])) < 3) low++;
    }
  }
  const n = box.width * box.height || 1;
  return { meanContrast: contrastFromLuminance(fill, relativeLuminance(Math.round(r / n), Math.round(g / n), Math.round(b / n))), lowContrastShare: low / n };
}
