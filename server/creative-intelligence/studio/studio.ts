/**
 * Studio: turn a generated post into editable layers, edit regions with AI, and render the result.
 *
 * decompose: original (no logo) → inspect text boxes → masked edit removes text → paste only the masked regions
 *            back onto the original → diff original vs clean plate gives exact text pixels → color, size, lines
 * aiEdit:    masked edit of a user-drawn region on the current base, pasted back the same way
 * render:    base + text layers as brand-font outlines (HarfBuzz) + logo resolved on the final pixels
 */
import { randomUUID } from 'node:crypto';
import { mediaDir } from '../../paths.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { inspectCreative } from '../criticism/inspect.js';
import { OpenAIImageProvider } from '../generation/provider.js';
import { compositeLogo, verifyComposite } from '../logo-resolution/compositor.js';
import { resolveLogo } from '../logo-resolution/resolver.js';
import type { ContentZone } from '../logo-resolution/validator.js';
import { outlineText } from '../typography/text-outline.js';
import type { LogoVariantId } from '../brand/registry.js';

export const STUDIO_VERSION = 'studio:v1';
const STUDIO_DIR = mediaDir('studio');
const EDIT_SIZE = { feed: { w: 1088, h: 1360 }, story: { w: 1088, h: 1936 }, landscape: { w: 1520, h: 800 } } as const;

export interface Box { x: number; y: number; width: number; height: number }
export interface TextLayer { id: string; text: string; x: number; y: number; width: number; size: number; color: string; weight: number; align: 'start' | 'center' | 'end'; lineHeight: number }
export interface StudioDoc {
  version: typeof STUDIO_VERSION;
  width: number; height: number;
  /** Image under the layers: the clean plate after decomposition, or the original. */
  baseFile: string;
  layers: TextLayer[];
  /** Faces and subjects found by the inspector, kept so the logo never lands on them. */
  zones: ContentZone[];
  logo: { variantId: LogoVariantId; x: number; y: number; width: number } | null;
}

export const studioPath = (file: string) => {
  if (!/^[0-9a-f-]{36}\.png$/.test(file)) throw new Error('Invalid studio file');
  return resolve(STUDIO_DIR, file);
};
function saveStudioImage(png: Buffer): string {
  mkdirSync(STUDIO_DIR, { recursive: true });
  const file = `${randomUUID()}.png`;
  writeFileSync(resolve(STUDIO_DIR, file), png);
  return file;
}
export const studioUrl = (file: string) => `/api/studio/${file}`;

/** The generated image without the logo, at platform size: the starting point for any edit. */
export async function originalWithoutLogo(requestId: string, directionId: string, size: { width: number; height: number }): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}$/.test(requestId) || !/^d\d(-story|-feed|-landscape)?$/.test(directionId)) throw new Error('Invalid creative reference');
  const dir = mediaDir('creatives', requestId);
  const raw = [`${directionId}-repaired-raw.png`, `${directionId}-raw.png`].map((f) => resolve(dir, f)).find((f) => existsSync(f));
  if (!raw) throw new Error('The original image for this design is not available on this server');
  return sharp(readFileSync(raw)).resize(size.width, size.height, { fit: 'cover' }).png().toBuffer();
}

/** Grows a box by `by` px and clips it to the image. Model boxes can spill past an edge; the result always lies inside. */
const pad = (b: Box, by: number, w: number, h: number): Box => {
  const left = Math.max(0, Math.min(w - 1, Math.floor(b.x - by)));
  const top = Math.max(0, Math.min(h - 1, Math.floor(b.y - by)));
  const right = Math.max(left + 1, Math.min(w, Math.ceil(b.x + b.width + by)));
  const bottom = Math.max(top + 1, Math.min(h, Math.ceil(b.y + b.height + by)));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** Masked AI edit, then keep the model's pixels only inside the boxes so the rest of the design is untouched. */
async function editRegions(base: Buffer, boxes: Box[], instruction: string, format: 'feed' | 'story' | 'landscape', env: NodeJS.ProcessEnv): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(base).metadata();
  const size = EDIT_SIZE[format];
  const sx = size.w / width, sy = size.h / height;
  const scaled = await sharp(base).resize(size.w, size.h, { fit: 'fill' }).png().toBuffer();
  const holes = boxes.map((b) => `<rect x="${Math.round(b.x * sx)}" y="${Math.round(b.y * sy)}" width="${Math.round(b.width * sx)}" height="${Math.round(b.height * sy)}" fill="#fff"/>`).join('');
  const mask = await sharp({ create: { width: size.w, height: size.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}">${holes}</svg>`), blend: 'dest-out' }]).png().toBuffer();
  const provider = new OpenAIImageProvider(env.OPENAI_API_KEY ?? '', env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2.5-flare');
  const [edited] = await provider.edit({ prompt: instruction, size: `${size.w}x${size.h}`, quality: 'high', images: [{ data: scaled, mime: 'image/png' }], mask });
  const back = await sharp(edited.png).resize(width, height, { fit: 'fill' }).png().toBuffer();
  // Paste the edited pixels back only inside the boxes, with a soft 3px edge.
  const boxSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#000"/>${boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#fff"/>`).join('')}</svg>`);
  const alpha = await sharp(boxSvg).blur(3).toColourspace('b-w').extractChannel(0).raw().toBuffer();
  const patch = await sharp(back).removeAlpha().joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return sharp(base).composite([{ input: patch }]).png().toBuffer();
}

/** Text pixels are where the original differs from the clean plate; their median color is the text color. */
async function measureText(original: Buffer, clean: Buffer, box: Box): Promise<{ color: string; lines: { top: number; height: number }[]; density: number }> {
  const a = await sharp(original).extract({ left: box.x, top: box.y, width: box.width, height: box.height }).removeAlpha().raw().toBuffer();
  const b = await sharp(clean).extract({ left: box.x, top: box.y, width: box.width, height: box.height }).removeAlpha().raw().toBuffer();
  const rows = new Array(box.height).fill(0);
  const reds: number[] = [], greens: number[] = [], blues: number[] = [];
  let hits = 0;
  for (let i = 0, p = 0; i < a.length; i += 3, p++) {
    const diff = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (diff > 90) { hits++; rows[Math.floor(p / box.width)]++; if (diff > 160) { reds.push(a[i]); greens.push(a[i + 1]); blues.push(a[i + 2]); } }
  }
  const median = (values: number[]) => { const s = [...values].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 255; };
  const color = '#' + [median(reds), median(greens), median(blues)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  // Horizontal bands of text pixels are lines; small gaps inside a line (dots, descenders) are bridged.
  const threshold = Math.max(2, box.width * 0.01), lines: { top: number; height: number }[] = [];
  let start = -1, gap = 0;
  rows.forEach((count, y) => {
    if (count > threshold) { if (start < 0) start = y; gap = 0; }
    else if (start >= 0 && ++gap > Math.max(3, box.height * 0.04)) { lines.push({ top: start, height: y - gap - start + 1 }); start = -1; gap = 0; }
  });
  if (start >= 0) lines.push({ top: start, height: box.height - gap - start });
  return { color, lines: lines.filter((l) => l.height > 6), density: hits / (box.width * box.height) };
}

export async function decompose(input: { original: Buffer; format: 'feed' | 'story' | 'landscape'; approvedCopy: string[]; env?: NodeJS.ProcessEnv }): Promise<StudioDoc> {
  const env = input.env ?? process.env;
  const { width = 0, height = 0 } = await sharp(input.original).metadata();
  const inspection = await inspectCreative(input.original, 'Studio decomposition: find every text element precisely.', env, input.approvedCopy);
  // Boxes that fall (almost) entirely outside the image or are too small to hold a glyph are not text layers.
  const texts = inspection.texts
    .filter((t) => t.text.trim() && !/^[←→↑↓•|·]+$/.test(t.text.trim()))
    .filter((t) => t.box.x < 0.98 && t.box.y < 0.98 && t.box.x + t.box.width > 0.02 && t.box.y + t.box.height > 0.02 && t.box.width * width >= 8 && t.box.height * height >= 8);
  const boxes = texts.map((t) => pad({ x: t.box.x * width, y: t.box.y * height, width: t.box.width * width, height: t.box.height * height }, Math.round(width * 0.012), width, height));
  const clean = boxes.length
    ? await editRegions(input.original, boxes, 'Remove all text, letters and numbers inside the transparent masked areas. Recreate exactly what would be behind them: continue the background, panels, buttons and shapes naturally with the same colors, lighting and texture. Do not add any text, logo, icon or new object.', input.format, env)
    : input.original;
  // Prefer the approved spelling when the audit confirms a rendered string matches it.
  const fixSpelling = (rendered: string) => inspection.copyAudit.find((a) => a.rendered.replace(/\s+/g, ' ').trim() === rendered.replace(/\s+/g, ' ').trim() && a.exact)?.expected ?? rendered;
  const layers: TextLayer[] = [];
  for (const [index, text] of texts.entries()) {
    const box = boxes[index];
    const m = await measureText(input.original, clean, box);
    const lineCount = Math.max(1, m.lines.length);
    const lineHeightPx = m.lines.length ? m.lines.reduce((s, l) => s + l.height, 0) / m.lines.length : box.height / lineCount;
    const size = Math.max(14, Math.round(lineHeightPx / 1.15));
    const top = box.y + (m.lines[0]?.top ?? 0) - Math.round(size * 0.25);
    layers.push({
      id: `t${index + 1}`, text: fixSpelling(text.text), x: box.x, y: Math.max(0, top), width: box.width, size,
      color: m.color, weight: m.density > 0.22 || size > 60 ? 800 : m.density > 0.12 ? 700 : 400,
      align: 'start', lineHeight: lineCount > 1 ? Math.max(1.05, Math.min(1.6, ((m.lines.at(-1)!.top - m.lines[0].top) / (lineCount - 1)) / size)) : 1.3,
    });
  }
  const px = (b: { x: number; y: number; width: number; height: number }): Box => ({ x: b.x * width, y: b.y * height, width: b.width * width, height: b.height * height });
  return {
    version: STUDIO_VERSION, width, height, baseFile: saveStudioImage(clean), layers, logo: null,
    zones: [...inspection.faces.map((f) => ({ kind: 'face' as const, box: px(f) })), ...inspection.subjects.filter((s) => s.box.width * s.box.height < 0.45).map((s) => ({ kind: 'subject' as const, box: px(s.box), label: s.label }))],
  };
}

export async function aiEdit(doc: StudioDoc, box: Box, instruction: string, format: 'feed' | 'story' | 'landscape', env = process.env): Promise<StudioDoc> {
  const base = readFileSync(studioPath(doc.baseFile));
  const region = pad(box, 0, doc.width, doc.height);
  if (region.width < 16 || region.height < 16) throw new Error('Select a larger area');
  const edited = await editRegions(base, [region], `Change only the transparent masked area: ${instruction.slice(0, 600)}. Keep everything outside it exactly the same. Match the existing lighting, perspective, colors and style. Do not add any text, letters, logo or watermark.`, format, env);
  return { ...doc, baseFile: saveStudioImage(edited) };
}

/** Final image: base + exact brand-font text + the official logo placed on the result's pixels. */
export async function renderStudio(doc: StudioDoc, safeArea?: { top: number; right: number; bottom: number; left: number }): Promise<{ file: string; doc: StudioDoc; problems: string[] }> {
  const base = readFileSync(studioPath(doc.baseFile));
  const problems: string[] = [];
  const outlined = doc.layers.filter((l) => l.text.trim()).map((layer) => {
    const out = outlineText({ text: layer.text, x: layer.x, y: layer.y, width: layer.width, align: layer.align, style: { weight: layer.weight, size: layer.size, color: layer.color, lineHeight: layer.lineHeight }, id: layer.id });
    if (out.missingGlyphs.length) problems.push(`"${layer.text.slice(0, 30)}" uses characters the brand fonts do not have: ${out.missingGlyphs.join(' ')}`);
    return { layer, out };
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}">${outlined.map((o) => o.out.svg).join('')}</svg>`;
  const composed = await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  const textZones: ContentZone[] = outlined.map(({ layer, out }) => ({ kind: 'text', box: { x: layer.x, y: layer.y, width: layer.width, height: out.height + layer.size * 0.3 }, label: layer.text.slice(0, 30) }));
  const logo = await resolveLogo({ creative: composed, zones: [...doc.zones, ...textZones], preferredCorner: 'top-left', safeArea });
  if (logo.requiresCreativeRepair) {
    problems.push(`Logo: ${logo.reason}. Move a text layer away from a corner or use AI edit to clear one.`);
    return { file: saveStudioImage(composed), doc: { ...doc, logo: null }, problems };
  }
  const { image, record } = await compositeLogo(composed, { variantId: logo.variantId, x: logo.placement.x, y: logo.placement.y, width: logo.placement.width });
  problems.push(...(await verifyComposite(composed, image, record)).map((p) => `Logo composite: ${p}`));
  return { file: saveStudioImage(image), doc: { ...doc, logo: { variantId: logo.variantId, x: record.x, y: record.y, width: record.width } }, problems };
}
