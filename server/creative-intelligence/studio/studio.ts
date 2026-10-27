/**
 * Studio: turn a generated post into editable layers, edit regions with AI, and render the result.
 *
 * decompose: original (no logo) → vision pass finds texts, flat shapes and objects → every measurement is
 *            taken from the ORIGINAL pixels (text color/lines/size, shape edges/fill, icons on shapes) →
 *            one masked edit removes texts and shapes from the background → layers: shapes, their icons, texts
 * extract:   lift an object out of the background into a transparent image layer, and fill in behind it
 * aiEdit:    masked edit of a user-drawn region on the current background
 * render:    background + layers in order (shapes, images, brand-font text outlines) + the official logo
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { mediaDir } from '../../paths.js';
import { flipTransform, rotateTransform, shapeShadow, strokeOf, STUDIO_FILE, STUDIO_VERSION, textShadow, type Box, type ImageLayer, type ShapeLayer, type StudioDoc, type StudioLayer, type TextLayer } from '../../../src/domain/studio.js';
import { OpenAIImageProvider } from '../generation/provider.js';
import { compositeLogo, verifyComposite } from '../logo-resolution/compositor.js';
import { resolveLogo, type Corner } from '../logo-resolution/resolver.js';
import type { LogoMark } from '../brand/design-language.js';
import type { ContentZone } from '../logo-resolution/validator.js';
import { measureText, outlineText, paragraphDirection } from '../typography/text-outline.js';
import { analyzeForStudio, type StudioAnalysis } from './analyze.js';
import { clip, grow, keyGreen, liftDecor, measureShape, measureTextBox, renderedLines, toRaw, type InkLine, type TextMeasure } from './pixels.js';

export type { StudioDoc } from '../../../src/domain/studio.js';
export { STUDIO_VERSION };
const STUDIO_DIR = mediaDir('studio');
const EDIT_SIZE = { feed: { w: 1088, h: 1360 }, story: { w: 1088, h: 1936 }, landscape: { w: 1520, h: 800 } } as const;
type Format = keyof typeof EDIT_SIZE;

export const studioPath = (file: string) => {
  if (!STUDIO_FILE.test(file)) throw new Error('Invalid studio file');
  return resolve(STUDIO_DIR, file);
};
export function saveStudioImage(png: Buffer): string {
  mkdirSync(STUDIO_DIR, { recursive: true });
  const file = `${randomUUID()}.png`;
  writeFileSync(resolve(STUDIO_DIR, file), png);
  return file;
}
export const studioUrl = (file: string) => `/api/studio/${file}`;
const newId = (prefix: string) => `${prefix}${randomUUID().slice(0, 8)}`;

/** The generated image without the logo, at platform size: the starting point for any edit. */
export async function originalWithoutLogo(requestId: string, directionId: string, size: { width: number; height: number }): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}$/.test(requestId) || !/^d\d(-story|-feed|-landscape)?$/.test(directionId)) throw new Error('Invalid creative reference');
  const dir = mediaDir('creatives', requestId);
  const raw = [`${directionId}-repaired-raw.png`, `${directionId}-raw.png`].map((f) => resolve(dir, f)).find((f) => existsSync(f));
  if (!raw) throw new Error('The original image for this design is not available on this server');
  return sharp(readFileSync(raw)).resize(size.width, size.height, { fit: 'cover' }).png().toBuffer();
}

const provider = (env: NodeJS.ProcessEnv) => new OpenAIImageProvider(env.OPENAI_API_KEY ?? '', env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2.5-flare');

/** Masked AI edit, then keep the model's pixels only inside the boxes so the rest of the design is untouched. */
async function editRegions(base: Buffer, boxes: Box[], instruction: string, format: Format, env: NodeJS.ProcessEnv): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(base).metadata();
  const size = EDIT_SIZE[format];
  const sx = size.w / width, sy = size.h / height;
  const scaled = await sharp(base).resize(size.w, size.h, { fit: 'fill' }).png().toBuffer();
  const holes = boxes.map((b) => `<rect x="${Math.round(b.x * sx)}" y="${Math.round(b.y * sy)}" width="${Math.round(b.width * sx)}" height="${Math.round(b.height * sy)}" fill="#fff"/>`).join('');
  const mask = await sharp({ create: { width: size.w, height: size.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}">${holes}</svg>`), blend: 'dest-out' }]).png().toBuffer();
  const [edited] = await provider(env).edit({ prompt: instruction, size: `${size.w}x${size.h}`, quality: 'high', images: [{ data: scaled, mime: 'image/png' }], mask });
  return pasteInside(base, edited.png, boxes);
}

/** The edited image's pixels inside the boxes (soft 3px edge) over the base; everything else stays the base. */
export async function pasteInside(base: Buffer, edited: Buffer, boxes: Box[]): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(base).metadata();
  const back = await sharp(edited).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const boxSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#000"/>${boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#fff"/>`).join('')}</svg>`);
  const alpha = await sharp(boxSvg).blur(3).toColourspace('b-w').extractChannel(0).raw().toBuffer();
  // Interleave the mask as the patch's alpha by hand: joinChannel with a raw buffer silently produced an
  // opaque patch, which pasted the model's whole regenerated image over the design.
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) { rgba[p * 4] = back[p * 3]; rgba[p * 4 + 1] = back[p * 3 + 1]; rgba[p * 4 + 2] = back[p * 3 + 2]; rgba[p * 4 + 3] = alpha[p]; }
  const patch = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return sharp(base).composite([{ input: patch }]).png().toBuffer();
}

/* ── Text fitting ──────────────────────────────────────────────────── */

const WEIGHT = { light: 300, regular: 400, bold: 700, extrabold: 800 } as const;

/** A text layer rendered alone at the origin: its ink lines. */
async function renderAlone(layer: Pick<TextLayer, 'text' | 'width' | 'size' | 'weight' | 'align' | 'lineHeight'>) {
  const pad = Math.ceil(layer.size);
  const out = outlineText({ text: layer.text, x: pad, y: pad, width: layer.width, align: layer.align, preserveNewlines: true, style: { weight: layer.weight, size: layer.size, color: '#000000', lineHeight: layer.lineHeight } });
  const w = Math.ceil(layer.width + 2 * pad), h = Math.ceil(out.height + 2 * pad);
  const lines = await renderedLines(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${out.svg}</svg>`, w, h);
  return lines.map((l) => ({ top: l.top - pad, bottom: l.bottom - pad, left: l.left - pad, right: l.right - pad }));
}

const mid = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const edgeOf = (l: InkLine, side: 'left' | 'center' | 'right') => (side === 'left' ? l.left : side === 'right' ? l.right : (l.left + l.right) / 2);

/**
 * Size, line height and position for a text so that, rendered with the brand fonts, its ink lands on the
 * original ink: height and width of each line are matched against a test render, then offsets measured.
 */
export async function fitText(text: string, measure: TextMeasure, weight: number, visual: 'left' | 'center' | 'right', guess: Box, stretched = false): Promise<Omit<TextLayer, 'id' | 'kind' | 'color' | 'opacity'>> {
  const direction = paragraphDirection(text);
  const align: TextLayer['align'] = visual === 'center' ? 'center' : (direction === 'rtl') === (visual === 'right') ? 'start' : 'end';
  const S0 = 100;
  const lineCount = text.split('\n').length;
  // Wide enough that the probe never wraps; alignment does not matter for sizes.
  const natural = Math.max(...text.split('\n').map((line) => measureText(line, { weight, size: S0, color: '#000000' }, direction)), 1);
  const probe = await renderAlone({ text, width: Math.ceil(natural + 20), size: S0, weight, align: 'center', lineHeight: 1.3 });
  const found = measure.lines;
  const matched = found.length === probe.length && probe.length === lineCount;
  let size: number;
  if (found.length && probe.length) {
    const pairs = matched ? found.map((f, i) => [f, probe[i]] as const) : [[found[0], probe[0]] as const];
    const byHeight = mid(pairs.map(([f, p]) => (S0 * (f.bottom - f.top + 1)) / Math.max(1, p.bottom - p.top + 1)));
    const byWidth = matched
      ? mid(pairs.map(([f, p]) => (S0 * (f.right - f.left + 1)) / Math.max(1, p.right - p.left + 1)))
      : (S0 * (Math.max(...found.map((f) => f.right)) - Math.min(...found.map((f) => f.left)) + 1)) / Math.max(1, Math.max(...probe.map((p) => p.right)) - Math.min(...probe.map((p) => p.left)) + 1);
    // Width decides how much room the text takes, so it is the ruler; a stretched or respelled line, or a
    // width far from what the height says (stray ink), falls back to the height.
    size = !stretched && byWidth / byHeight > 0.75 && byWidth / byHeight < 1.33 ? byWidth : byHeight;
  } else size = guess.height / (lineCount * 1.3);
  size = Math.round(Math.max(10, Math.min(400, size)));

  let lineHeight = 1.3;
  if (matched && lineCount > 1) {
    const pitchFound = (found.at(-1)!.top - found[0].top) / (lineCount - 1);
    const drift = ((probe.at(-1)!.top - probe[0].top) / (lineCount - 1) - 1.3 * S0) * (size / S0);
    lineHeight = Math.max(0.8, Math.min(2.5, (pitchFound - drift) / size));
  }
  const probeWidest = Math.max(...probe.map((p) => p.right - p.left + 1), 1);
  const width = Math.ceil(((probeWidest * size) / S0) * 1.04 + 6);
  const placed = await renderAlone({ text, width, size, weight, align, lineHeight });
  let x = guess.x, y = guess.y;
  if (found.length && placed.length) {
    const pairs = found.length === placed.length ? found.map((f, i) => [f, placed[i]] as const) : [[found[0], placed[0]] as const];
    x = mid(pairs.map(([f, p]) => edgeOf(f, visual) - edgeOf(p, visual)));
    y = mid(pairs.map(([f, p]) => f.top - p.top));
  }
  return { text, x: Math.round(x), y: Math.round(y), width, size, weight, align, lineHeight: Math.round(lineHeight * 100) / 100 };
}

/** Same letters, ignoring spaces, line breaks, kashida and diacritics. */
const letters = (s: string) => s.replace(/[\sـً-ٰٟ]/g, '');
/** Letter edit distance (Levenshtein). */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const keep = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = keep; }
  }
  return row[b.length];
}

/**
 * The approved wording when the rendered text is a misspelling of it (a few letters off), broken into lines
 * where the rendered text broke. A block that shows only part of an approved string keeps its own words.
 * Kashida is dropped either way: the brand fonts set the words at their natural width.
 */
export function approvedWithBreaks(rendered: string, approved: string): string {
  const plain = rendered.replace(/\u0640+/g, '');
  const a = letters(plain), b = letters(approved);
  if (!b || a === b || distance(a, b) > Math.max(1, Math.round(b.length * 0.15))) return plain;
  const counts = plain.split('\n').map((l) => l.trim().split(/\s+/).filter(Boolean).length);
  const words = approved.trim().split(/\s+/);
  if (counts.reduce((x, y) => x + y, 0) !== words.length) return approved.trim();
  const out: string[] = [];
  let at = 0;
  for (const n of counts) { out.push(words.slice(at, at + n).join(' ')); at += n; }
  return out.join('\n');
}

/* ── Decompose ─────────────────────────────────────────────────────── */

const RADIUS = { square: 0, small: 0.12, large: 0.26, round: 0.5 } as const;
const SHAPE_NAME = { button: 'Button', pill: 'Pill', badge: 'Badge', panel: 'Panel', tag: 'Tag', bar: 'Bar' } as const;

/**
 * Free-standing lines of one headline are usually flush to one edge even when the model calls them centred:
 * compare ink edges with the lines just above and below. A lone off-centre line follows its script's start.
 */
function inferAlign(t: { align: 'left' | 'center' | 'right'; shape: number; text: string }, index: number, texts: { guess: Box; shape: number }[], measures: TextMeasure[], width: number): 'left' | 'center' | 'right' {
  const own = measures[index].ink;
  if (t.shape >= 0 || !own) return t.align;
  const near = texts.map((o, j) => ({ o, ink: measures[j].ink, j })).filter(({ o, ink, j }) => j !== index && o.shape < 0 && ink
    && Math.max(ink.y - (own.y + own.height), own.y - (ink.y + ink.height)) < 1.5 * Math.max(own.height, ink.height)
    && Math.min(own.x + own.width, ink.x + ink.width) > Math.max(own.x, ink.x));
  if (near.length) {
    const spread = (edge: (b: Box) => number) => near.reduce((sum, n) => sum + Math.abs(edge(n.ink!) - edge(own)), 0) / near.length;
    const options = [['right', spread((b) => b.x + b.width)], ['left', spread((b) => b.x)], ['center', spread((b) => b.x + b.width / 2)]] as const;
    const best = [...options].sort((a, b) => a[1] - b[1])[0];
    if (best[1] < width * 0.012) return best[0];
  }
  if (t.align === 'center' && Math.abs(own.x + own.width / 2 - width / 2) > width * 0.05) return paragraphDirection(t.text) === 'rtl' ? 'right' : 'left';
  return t.align;
}

export interface LayerPlan { layers: StudioLayer[]; holes: Box[]; objects: StudioDoc['objects']; zones: StudioDoc['zones'] }

/** Layers measured from the original pixels, and the areas to clear from the background. No AI calls. */
export async function planLayers(original: Buffer, analysis: StudioAnalysis): Promise<LayerPlan> {
  const raw = await toRaw(original);
  const { width, height } = raw;
  const P = (b: { x: number; y: number; width: number; height: number }) => clip({ x: b.x * width, y: b.y * height, width: b.width * width, height: b.height * height }, width, height);

  const texts = analysis.texts
    .filter((t) => t.text.trim() && !/^[←→↑↓•|·\s]+$/.test(t.text))
    .map((t) => ({ ...t, guess: P(t.box) }))
    .filter((t) => t.guess.width >= 6 && t.guess.height >= 6);
  // Shapes that cover a large part of the canvas stay in the background: repainting them is too risky.
  const shapes = analysis.shapes
    .map((s, index) => ({ ...s, index, guess: P(s.box) }))
    .filter((s) => s.guess.width >= 16 && s.guess.height >= 10 && (s.guess.width * s.guess.height) / (width * height) <= 0.3);

  // Search around the model's box: boxes drift, and a box narrower than its line would leave letters behind.
  const measures = texts.map((t) => {
    // Wide sideways reach is safe: a line only extends across word-sized gaps (see bands()).
    const side = t.guess.width * 0.3 + t.guess.height;
    const scan = clip({ x: t.guess.x - side, y: t.guess.y - t.guess.height * 0.25, width: t.guess.width + 2 * side, height: t.guess.height * 1.5 }, width, height);
    return measureTextBox(raw, clip(grow(t.guess, 2), width, height), scan);
  });
  const aligns = texts.map((t, i) => inferAlign(t, i, texts, measures, width));

  // Where each text is: the model's box and the measured ink, so nothing of a text is mistaken for an icon.
  const textArea = texts.map((t, i) => {
    const g = grow(t.guess, Math.max(3, t.guess.height * 0.12)), ink = measures[i].ink ? grow(measures[i].ink!, 4) : g;
    const x = Math.min(g.x, ink.x), y = Math.min(g.y, ink.y);
    return clip({ x, y, width: Math.max(g.x + g.width, ink.x + ink.width) - x, height: Math.max(g.y + g.height, ink.y + ink.height) - y }, width, height);
  });
  const layers: StudioLayer[] = [];
  const holes: Box[] = [];
  const groupOf = new Map<number, string>();

  for (const s of shapes) {
    // A text sits on this shape when most of its area overlaps it (model boxes rarely nest exactly).
    const within = (b: Box) => {
      const w = Math.min(b.x + b.width, s.guess.x + s.guess.width) - Math.max(b.x, s.guess.x), h = Math.min(b.y + b.height, s.guess.y + s.guess.height) - Math.max(b.y, s.guess.y);
      return w > 0 && h > 0 && (w * h) / (b.width * b.height) >= 0.6;
    };
    const innerIdx = textArea.map((b, i) => (within(b) ? i : -1)).filter((i) => i >= 0);
    const inner = innerIdx.map((i) => textArea[i]);
    const m = measureShape(raw, s.guess, inner);
    const id = newId('s');
    groupOf.set(s.index, id);
    const radius = Math.round(Math.min(m.box.width, m.box.height) * RADIUS[s.corners]);
    layers.push({ kind: 'shape', id, name: SHAPE_NAME[s.kind], group: id, x: m.box.x, y: m.box.y, width: m.box.width, height: m.box.height, fill: m.fill, fill2: m.fill2, radius, shadow: s.shadow, opacity: 1 } satisfies ShapeLayer);
    for (const decor of await liftDecor(raw, m, radius, innerIdx.map((i) => ({ box: textArea[i], ink: measures[i].inkColor, background: measures[i].background })))) {
      layers.push({ kind: 'image', id: newId('i'), name: decor.kind === 'line' ? 'Line' : 'Icon', group: id, file: saveStudioImage(decor.png), ...decor.box, opacity: 1 } satisfies ImageLayer);
    }
    holes.push(clip(grow(m.box, s.shadow ? Math.max(10, Math.min(m.box.width, m.box.height) * 0.35) : 6), width, height));
  }

  for (const [index, t] of texts.entries()) {
    const measure = measures[index];
    const text = approvedWithBreaks(t.text, t.approved);
    const stretched = /\u0640/.test(t.text) || letters(text) !== letters(t.text);
    const fitted = await fitText(text, measure, WEIGHT[t.weight], aligns[index], t.guess, stretched);
    const group = t.shape >= 0 ? groupOf.get(t.shape) : undefined;
    layers.push({ kind: 'text', id: newId('t'), group, color: measure.reliable ? measure.color : '#FFFFFF', opacity: 1, ...fitted } satisfies TextLayer);
    // The model's box and the measured ink together: marks above or below the letters (a damma) stay covered.
    holes.push(clip(grow(textArea[index], Math.max(6, fitted.size * 0.2)), width, height));
  }

  return {
    layers, holes,
    objects: analysis.objects.map((o) => ({ id: newId('o'), label: o.label.slice(0, 60), box: P(o.box) })).filter((o) => o.box.width >= 24 && o.box.height >= 24),
    zones: [...analysis.faces.map((f) => ({ kind: 'face' as const, box: P(f) })), ...analysis.objects.map((o) => ({ kind: 'subject' as const, box: P(o.box), label: o.label.slice(0, 40) }))],
  };
}

export async function decompose(input: { original: Buffer; format: Format; approvedCopy: string[]; analysis?: StudioAnalysis; env?: NodeJS.ProcessEnv }): Promise<StudioDoc> {
  const env = input.env ?? process.env;
  const { width = 0, height = 0 } = await sharp(input.original).metadata();
  const analysis = input.analysis ?? await analyzeForStudio(input.original, input.approvedCopy, env);
  const { layers, holes, objects, zones } = await planLayers(input.original, analysis);
  const clean = holes.length
    ? await editRegions(input.original, holes, 'Remove all text, letters, numbers, buttons, badges, panels, icons and their shadows inside the transparent masked areas. Recreate exactly what would be behind them: continue the background, scenery, lighting and texture naturally with the same colors. Do not add any text, logo, icon, shape or new object.', input.format, env)
    : input.original;

  return { version: STUDIO_VERSION, width, height, baseFile: saveStudioImage(clean), layers, logo: null, objects, zones };
}

/* ── Object extraction and AI edits ────────────────────────────────── */

/** The edit size whose aspect ratio is closest to a region's. */
const nearestEditSize = (box: Box) => Object.values(EDIT_SIZE).reduce((best, s) => (Math.abs(Math.log(s.w / s.h / (box.width / box.height))) < Math.abs(Math.log(best.w / best.h / (box.width / box.height))) ? s : best));

/** Lifts an object out of the background into a transparent image layer and fills in the background behind it. */
export async function extractObject(doc: StudioDoc, target: { box: Box; label: string; objectId?: string }, format: Format, env = process.env): Promise<StudioDoc> {
  const base = readFileSync(studioPath(doc.baseFile));
  const region = clip(grow(target.box, Math.round(doc.width * 0.02)), doc.width, doc.height);
  if (region.width < 24 || region.height < 24) throw new Error('Select a larger object');
  const label = target.label.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 60) || 'object';
  const size = nearestEditSize(region);
  const crop = await sharp(base).extract({ left: region.x, top: region.y, width: region.width, height: region.height }).resize(size.w, size.h, { fit: 'fill' }).png().toBuffer();
  const [[isolated], cleaned] = await Promise.all([
    provider(env).edit({
      prompt: `Keep the ${label} exactly as it is: same shape, pose, proportions, colors, lighting, details and position in the frame. Replace everything else with a flat, pure green background (#00FF00). No shadow, no floor, no outline, no text.`,
      size: `${size.w}x${size.h}`, quality: 'high', images: [{ data: crop, mime: 'image/png' }],
    }),
    editRegions(base, [clip(grow(target.box, Math.round(doc.width * 0.012)), doc.width, doc.height)], `Remove the ${label} inside the transparent masked area completely, including its shadow. Recreate exactly what would be behind it: continue the background, scenery, lighting and texture naturally. Do not add any text, logo, icon or new object.`, format, env),
  ]);
  const keyed = await keyGreen(isolated.png, region.width, region.height);
  if (!keyed) throw new Error('The AI could not isolate this object cleanly. Try a tighter box or the AI edit tool.');
  const layer: ImageLayer = { kind: 'image', id: newId('i'), name: label, file: saveStudioImage(keyed.png), x: region.x + keyed.trim.x, y: region.y + keyed.trim.y, width: keyed.trim.width, height: keyed.trim.height, opacity: 1 };
  return { ...doc, baseFile: saveStudioImage(cleaned), layers: [layer, ...doc.layers], objects: doc.objects.filter((o) => o.id !== target.objectId) };
}

export async function aiEdit(doc: StudioDoc, box: Box, instruction: string, format: Format, env = process.env): Promise<StudioDoc> {
  const base = readFileSync(studioPath(doc.baseFile));
  const region = clip(box, doc.width, doc.height);
  if (region.width < 16 || region.height < 16) throw new Error('Select a larger area');
  const edited = await editRegions(base, [region], `Change only the transparent masked area: ${instruction.slice(0, 600)}. Keep everything outside it exactly the same. Match the existing lighting, perspective, colors and style. Do not add any text, letters, logo or watermark.`, format, env);
  return { ...doc, baseFile: saveStudioImage(edited) };
}

/** Uploaded picture → PNG in the studio folder, at most 2048px on its long side. */
export async function saveUpload(data: Buffer): Promise<{ file: string; width: number; height: number }> {
  const png = await sharp(data, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  return { file: saveStudioImage(png.data), width: png.info.width, height: png.info.height };
}

/* ── Rendering ─────────────────────────────────────────────────────── */

export interface OutlinedLayer { svg: string; height: number; overflow: boolean; missingGlyphs: string[] }
/** Brand-font outline of a text layer drawn at (0, 0); the editor shows exactly what the render will. */
export function outlineLayer(layer: Pick<TextLayer, 'text' | 'width' | 'size' | 'weight' | 'align' | 'lineHeight' | 'color'>): OutlinedLayer {
  const out = outlineText({ text: layer.text, x: 0, y: 0, width: layer.width, align: layer.align, preserveNewlines: true, style: { weight: layer.weight, size: layer.size, color: layer.color, lineHeight: layer.lineHeight } });
  return { svg: out.svg, height: out.height, overflow: out.overflow, missingGlyphs: out.missingGlyphs };
}

const num = (n: number) => Math.round(n * 100) / 100;
const attr = (name: string, value: string) => (value ? ` ${name}="${value}"` : '');
/** Every visible layer as one SVG, in order; images are embedded so the stack keeps its order. */
export function layersSvg(doc: StudioDoc): { svg: string; textHeights: Map<string, number>; problems: string[] } {
  const defs: string[] = [], body: string[] = [], problems: string[] = [];
  const textHeights = new Map<string, number>();
  const shadowFilter = (id: string, s: { dy: number; blur: number; color: string; opacity: number }) => {
    defs.push(`<filter id="f-${id}" x="-30%" y="-30%" width="160%" height="190%"><feDropShadow dx="0" dy="${s.dy}" stdDeviation="${s.blur}" flood-color="${s.color}" flood-opacity="${s.opacity}"/></filter>`);
    return `url(#f-${id})`;
  };
  for (const layer of doc.layers) {
    if (layer.hidden || layer.opacity <= 0) continue;
    const opacity = layer.opacity < 1 ? ` opacity="${num(layer.opacity)}"` : '';
    if (layer.kind === 'shape') {
      let fill = layer.fill;
      if (layer.fill2) { defs.push(`<linearGradient id="g-${layer.id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${layer.fill}"/><stop offset="1" stop-color="${layer.fill2}"/></linearGradient>`); fill = `url(#g-${layer.id})`; }
      const filter = layer.shadow ? shadowFilter(layer.id, shapeShadow(layer)) : '';
      const sw = strokeOf(layer);
      const rect = `<rect x="${num(layer.x)}" y="${num(layer.y)}" width="${num(layer.width)}" height="${num(layer.height)}" rx="${num(layer.radius)}" fill="${fill}"${attr('filter', filter)}/>`;
      const border = sw ? `<rect x="${num(layer.x + sw / 2)}" y="${num(layer.y + sw / 2)}" width="${num(layer.width - sw)}" height="${num(layer.height - sw)}" rx="${num(Math.max(0, layer.radius - sw / 2))}" fill="none" stroke="${layer.stroke}" stroke-width="${num(sw)}"/>` : '';
      body.push(`<g${attr('transform', rotateTransform(layer, layer.height))}${opacity}>${rect}${border}</g>`);
    } else if (layer.kind === 'image') {
      const data = readFileSync(studioPath(layer.file)).toString('base64');
      body.push(`<g${attr('transform', rotateTransform(layer, layer.height))}${opacity}><image href="data:image/png;base64,${data}" x="${num(layer.x)}" y="${num(layer.y)}" width="${num(layer.width)}" height="${num(layer.height)}" preserveAspectRatio="none"${attr('transform', flipTransform(layer))}/></g>`);
    } else if (layer.text.trim()) {
      const out = outlineLayer(layer);
      if (out.missingGlyphs.length) problems.push(`"${layer.text.slice(0, 30)}" uses characters the brand fonts do not have: ${out.missingGlyphs.join(' ')}`);
      textHeights.set(layer.id, out.height);
      const filter = layer.shadow ? shadowFilter(layer.id, textShadow(layer)) : '';
      const transform = [rotateTransform(layer, out.height), `translate(${num(layer.x)} ${num(layer.y)})`].filter(Boolean).join(' ');
      body.push(`<g transform="${transform}"${opacity}${attr('filter', filter)}>${out.svg}</g>`);
    }
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`, textHeights, problems };
}

/** Final image: background + every layer + the official logo placed on the result's pixels. */
export async function renderStudio(doc: StudioDoc, safeArea?: { top: number; right: number; bottom: number; left: number }, logoPlan?: { mark: LogoMark; corner: Corner }): Promise<{ file: string; doc: StudioDoc; problems: string[] }> {
  const base = readFileSync(studioPath(doc.baseFile));
  const { svg, textHeights, problems } = layersSvg(doc);
  const composed = await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  const layerZones: ContentZone[] = doc.layers.filter((l) => !l.hidden && l.opacity > 0).map((l) => ({
    kind: l.kind === 'text' ? 'text' : 'salient',
    box: { x: l.x, y: l.y, width: l.width, height: l.kind === 'text' ? (textHeights.get(l.id) ?? 0) + l.size * 0.3 : l.height },
    label: l.kind === 'text' ? l.text.slice(0, 30) : l.name,
  }));
  const logo = await resolveLogo({ creative: composed, zones: [...doc.zones, ...layerZones], preferredCorner: logoPlan?.corner ?? 'top-left', preferredMark: logoPlan?.mark, safeArea });
  if (logo.requiresCreativeRepair) {
    problems.push(`Logo: ${logo.reason}. Move a layer away from a corner or use AI edit to clear one.`);
    return { file: saveStudioImage(composed), doc: { ...doc, logo: null }, problems };
  }
  const { image, record } = await compositeLogo(composed, { variantId: logo.variantId, x: logo.placement.x, y: logo.placement.y, width: logo.placement.width });
  problems.push(...(await verifyComposite(composed, image, record)).map((p) => `Logo composite: ${p}`));
  return { file: saveStudioImage(image), doc: { ...doc, logo: { variantId: logo.variantId, x: record.x, y: record.y, width: record.width } }, problems };
}
