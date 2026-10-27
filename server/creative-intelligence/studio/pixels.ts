/**
 * Pixel measurements for Studio decomposition. Everything here reads the ORIGINAL image, so it does not
 * depend on how well the AI cleaned the background: text color is the minority color of its box, lines are
 * bands of text-colored rows, shape fills are medians, and icons inside a shape are keyed off its fill.
 */
import sharp from 'sharp';
import type { Box } from '../../../src/domain/studio.js';

export type Rgb = [number, number, number];
export interface Raw { data: Buffer; width: number; height: number }

export async function toRaw(png: Buffer): Promise<Raw> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const px = (raw: Raw, x: number, y: number): Rgb => { const i = (y * raw.width + x) * 3; return [raw.data[i], raw.data[i + 1], raw.data[i + 2]]; };
export const hex = (c: Rgb) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const median = (values: number[]) => { if (!values.length) return 0; const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const medianColor = (colors: Rgb[]): Rgb => [median(colors.map((c) => c[0])), median(colors.map((c) => c[1])), median(colors.map((c) => c[2]))];

/** The most common color (coarse 16-level bins, then the bin's median): text or icons in a cell never shift a fill. */
export function dominant(colors: Rgb[]): Rgb {
  const bins = new Map<number, Rgb[]>();
  for (const c of colors) { const key = (c[0] >> 4) * 256 + (c[1] >> 4) * 16 + (c[2] >> 4); const bin = bins.get(key); if (bin) bin.push(c); else bins.set(key, [c]); }
  let best: Rgb[] = [];
  for (const bin of bins.values()) if (bin.length > best.length) best = bin;
  return medianColor(best);
}

/** Integer box inside the image; never empty. */
export function clip(box: Box, width: number, height: number): Box {
  const left = Math.max(0, Math.min(width - 1, Math.floor(box.x)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(box.y)));
  const right = Math.max(left + 1, Math.min(width, Math.ceil(box.x + box.width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(box.y + box.height)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export const grow = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, width: b.width + 2 * by, height: b.height + 2 * by });

/** Two-color split of a box. The color that owns most of the box's border is the background. */
export function splitColors(raw: Raw, box: Box): { background: Rgb; ink: Rgb; contrast: number } {
  const all: Rgb[] = [], border: Rgb[] = [];
  const step = Math.max(1, Math.floor(Math.sqrt((box.width * box.height) / 40_000)));
  for (let y = box.y; y < box.y + box.height; y += step) for (let x = box.x; x < box.x + box.width; x += step) {
    const c = px(raw, x, y); all.push(c);
    if (y - box.y < 2 * step || box.y + box.height - 1 - y < 2 * step || x - box.x < 2 * step || box.x + box.width - 1 - x < 2 * step) border.push(c);
  }
  const lum = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const sorted = [...all].sort((a, b) => lum(a) - lum(b));
  let a = sorted[Math.floor(sorted.length * 0.05)], b = sorted[Math.floor(sorted.length * 0.95)];
  for (let round = 0; round < 10; round++) {
    const ga: Rgb[] = [], gb: Rgb[] = [];
    for (const c of all) (dist(c, a) <= dist(c, b) ? ga : gb).push(c);
    if (!ga.length || !gb.length) break;
    a = medianColor(ga); b = medianColor(gb);
  }
  const borderA = border.filter((c) => dist(c, a) <= dist(c, b)).length;
  const [background, ink] = borderA >= border.length / 2 ? [a, b] : [b, a];
  return { background, ink, contrast: dist(a, b) };
}

/**
 * True where a pixel is the ink color: far from the background AND close to the ink, so an icon of another
 * color beside the text (a blue calendar next to grey text) is not counted as text.
 */
function inkMask(raw: Raw, box: Box, background: Rgb, ink: Rgb): Uint8Array {
  const mask = new Uint8Array(box.width * box.height);
  const span = dist(background, ink);
  for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
    const c = px(raw, box.x + x, box.y + y);
    if (dist(c, background) > span * 0.45 && dist(c, ink) < span * 0.55) mask[y * box.width + x] = 1;
  }
  return mask;
}

export interface InkLine { top: number; bottom: number; left: number; right: number }

/**
 * Horizontal bands of ink (one per text line) with their horizontal extent, in image pixels. With an
 * `anchor` (columns where the text surely is), a line extends sideways only across word-sized gaps, so an
 * icon or arrow beside the text is not counted as part of it.
 */
export function bands(mask: Uint8Array, width: number, height: number, origin = { x: 0, y: 0 }, anchor?: { left: number; right: number }): InkLine[] {
  // With an anchor, lines are found only in the text's own columns: an icon beside it must not make it taller.
  const x0 = anchor ? Math.max(0, anchor.left) : 0, x1 = anchor ? Math.min(width - 1, anchor.right) : width - 1;
  const rows = new Array(height).fill(0);
  const cols = new Uint8Array(width);
  for (let y = 0; y < height; y++) for (let x = x0; x <= x1; x++) if (mask[y * width + x]) { rows[y]++; cols[x] = 1; }
  // Noise floor relative to how wide the ink actually is, not to the canvas.
  const minRow = Math.max(1, cols.reduce((a, b) => a + b, 0) * 0.004);
  const found: { top: number; bottom: number }[] = [];
  let start = -1, gap = 0;
  // Gaps shorter than this are dots, diacritics or descenders inside one line.
  const bridge = Math.max(2, Math.round(height * 0.03));
  for (let y = 0; y <= height; y++) {
    const on = y < height && rows[y] >= minRow;
    if (on) { if (start < 0) start = y; gap = 0; continue; }
    if (start >= 0 && (++gap > bridge || y === height)) { found.push({ top: start, bottom: y - gap }); start = -1; gap = 0; }
  }
  // Keep real lines: tall enough relative to the tallest band.
  const tallest = Math.max(0, ...found.map((b) => b.bottom - b.top + 1));
  return found.filter((b) => b.bottom - b.top + 1 >= Math.max(4, tallest * 0.35)).map((b) => {
    const inkCol = new Uint8Array(width);
    for (let y = b.top; y <= b.bottom; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) inkCol[x] = 1;
    let left = width, right = -1;
    if (!anchor) {
      for (let x = 0; x < width; x++) if (inkCol[x]) { if (x < left) left = x; right = x; }
    } else {
      for (let x = Math.max(0, anchor.left); x <= Math.min(width - 1, anchor.right); x++) if (inkCol[x]) { if (x < left) left = x; right = x; }
      if (right >= 0) {
        // Words of one line share their spacing: extend across gaps up to 1.5× the widest word gap already
        // inside the line. An icon or arrow beside the text sits further away.
        let wordGap = 0;
        for (let x = left, run = 0; x <= right; x++) { if (inkCol[x]) { wordGap = Math.max(wordGap, run); run = 0; } else run++; }
        const lineHeight = b.bottom - b.top + 1;
        const maxGap = Math.min(lineHeight, Math.max(3, lineHeight * 0.32, wordGap * 1.5));
        for (let x = left - 1, gap = 0; x >= 0 && gap <= maxGap; x--) { if (inkCol[x]) { left = x; gap = 0; } else gap++; }
        for (let x = right + 1, gap = 0; x < width && gap <= maxGap; x++) { if (inkCol[x]) { right = x; gap = 0; } else gap++; }
      }
    }
    return { top: origin.y + b.top, bottom: origin.y + b.bottom, left: origin.x + left, right: origin.x + right };
  }).filter((l) => l.right >= l.left);
}

export interface TextMeasure { color: string; inkColor: Rgb; background: Rgb; lines: InkLine[]; ink: Box | null; reliable: boolean }

/**
 * Color and ink lines of the text in a box, from the original pixels. Colors come from the model's tight
 * box; lines are searched in a larger `scan` box (model boxes can be off) and kept only where they overlap
 * the tight box, so a neighbouring line of another color never joins.
 */
export function measureTextBox(raw: Raw, box: Box, scan: Box = box): TextMeasure {
  const { background, ink, contrast } = splitColors(raw, box);
  const mask = inkMask(raw, box, background, ink);
  // The text color is the median of its solid core, not of anti-aliased edges.
  const core: Rgb[] = [];
  for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
    if (!mask[y * box.width + x]) continue;
    const c = px(raw, box.x + x, box.y + y);
    if (dist(c, background) > contrast * 0.8) core.push(c);
  }
  const scanMask = inkMask(raw, scan, background, ink);
  const lines = bands(scanMask, scan.width, scan.height, scan, { left: box.x - scan.x, right: box.x + box.width - 1 - scan.x }).filter((l) => {
    const middle = (l.top + l.bottom) / 2;
    return middle >= box.y - box.height * 0.1 && middle <= box.y + box.height * 1.1;
  });
  const ink2 = lines.length ? { x: Math.min(...lines.map((l) => l.left)), y: lines[0].top, width: Math.max(...lines.map((l) => l.right)) - Math.min(...lines.map((l) => l.left)) + 1, height: lines.at(-1)!.bottom - lines[0].top + 1 } : null;
  const inkColor = core.length ? medianColor(core) : ink;
  return { color: hex(inkColor), inkColor, background, lines, ink: ink2, reliable: contrast > 45 && lines.length > 0 };
}

/** Ink lines of rendered text (an RGBA raster), for matching a layer to the original. */
export async function renderedLines(svg: string, width: number, height: number): Promise<InkLine[]> {
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i] > 110 ? 1 : 0;
  return bands(mask, Math.min(width, info.width), Math.min(height, info.height));
}

/** Lift the actual glyph silhouette from a quiet background, retaining antialiasing instead of redrawing a font. */
export async function liftText(raw: Raw, measure: TextMeasure): Promise<{ png: Buffer; box: Box } | null> {
  if (!measure.reliable || !measure.ink) return null;
  const box = clip(grow(measure.ink, 2), raw.width, raw.height);
  const bg = measure.background, ink = measure.inkColor;
  const delta = ink.map((v, i) => v - bg[i]);
  const energy = delta.reduce((sum, v) => sum + v * v, 0);
  if (energy < 45 * 45) return null;
  const rgba = Buffer.alloc(box.width * box.height * 4);
  let solid = 0;
  for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
    const gx = box.x + x, gy = box.y + y;
    if (!measure.lines.some(l => gy >= l.top - 1 && gy <= l.bottom + 1 && gx >= l.left - 1 && gx <= l.right + 1)) continue;
    const c = px(raw, gx, gy);
    const a = Math.max(0, Math.min(1, delta.reduce((sum, v, i) => sum + (c[i] - bg[i]) * v, 0) / energy));
    const reconstructed = bg.map((v, i) => v + a * delta[i]) as Rgb;
    // Photographic detail is not a glyph. Do not lift it as accidental text-colored noise.
    if (a < 0.035 || dist(c, reconstructed) > 20) continue;
    const offset = (y * box.width + x) * 4;
    for (let k = 0; k < 3; k++) rgba[offset + k] = Math.max(0, Math.min(255, Math.round((c[k] - (1 - a) * bg[k]) / a)));
    rgba[offset + 3] = Math.round(a * 255);
    if (a > 0.5) solid++;
  }
  if (solid < 8) return null;
  return { box, png: await sharp(rgba, { raw: { width: box.width, height: box.height, channels: 4 } }).png().toBuffer() };
}

/** A model supplies only the cut-out mask. The object colors/details always come from the original crop. */
export async function originalCutout(original: Buffer, mask: { png: Buffer; trim: Box }): Promise<Buffer> {
  const crop = await sharp(original).extract({ left: mask.trim.x, top: mask.trim.y, width: mask.trim.width, height: mask.trim.height }).ensureAlpha().png().toBuffer();
  return sharp(crop).composite([{ input: mask.png, blend: 'dest-in' }]).png().toBuffer();
}

export interface ShapeMeasure { box: Box; fill: string; fill2: string | null; fillAt: (x: number, y: number) => Rgb }

/**
 * A flat shape's real edges and fill. The fill is sampled on a 3×3 grid of cells (medians, ignoring text)
 * and interpolated, so highlights and gradients in any direction count as fill, not as icons. The model's
 * box is a guess: each edge moves to the outermost line that is mostly fill, skipping short gaps (icons).
 */
export function measureShape(raw: Raw, guess: Box, exclude: Box[]): ShapeMeasure {
  const inside = (x: number, y: number) => exclude.some((b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height);
  const samples = (cx: number, cy: number): Rgb[] => {
    const x0 = guess.x + guess.width * (0.06 + cx * 0.3), y0 = guess.y + guess.height * (0.12 + cy * 0.27);
    const colors: Rgb[] = [];
    for (let y = Math.round(y0); y < y0 + guess.height * 0.22; y += 1) for (let x = Math.round(x0); x < x0 + guess.width * 0.28; x += 2) {
      if (x >= 0 && y >= 0 && x < raw.width && y < raw.height && !inside(x, y)) colors.push(px(raw, x, y));
    }
    return colors;
  };
  const cells = [0, 1, 2].map((cy) => [0, 1, 2].map((cx) => samples(cx, cy)));
  const overall = dominant(cells.flat(2));
  // A cell whose own dominant color is far from the shape's is covered by text or an icon: use the shape's.
  const grid = cells.map((row) => row.map((colors) => { const c = colors.length ? dominant(colors) : overall; return dist(c, overall) > 90 ? overall : c; }));
  // Cell centres, as fractions of the box.
  const fx = [0.2, 0.5, 0.8], fy = [0.23, 0.5, 0.77];
  const fillAt = (x: number, y: number): Rgb => {
    const u = Math.max(0, Math.min(2, (((x - guess.x) / guess.width - fx[0]) / (fx[2] - fx[0])) * 2));
    const v = Math.max(0, Math.min(2, (((y - guess.y) / guess.height - fy[0]) / (fy[2] - fy[0])) * 2));
    const i = Math.min(1, Math.floor(u)), j = Math.min(1, Math.floor(v)), tu = u - i, tv = v - j;
    const mix = (p: Rgb, q: Rgb, t: number): Rgb => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    return mix(mix(grid[j][i], grid[j][i + 1], tu), mix(grid[j + 1][i], grid[j + 1][i + 1], tu), tv);
  };
  const matches = (x: number, y: number) => dist(px(raw, x, y), fillAt(x, y)) < 34;
  const columnFill = (x: number) => { let hit = 0, n = 0; for (let y = Math.round(guess.y + guess.height * 0.15); y < guess.y + guess.height * 0.85; y++) { if (y < 0 || y >= raw.height || inside(x, y)) continue; n++; hit += +matches(x, y); } return n ? hit / n : 0; };
  const rowFill = (y: number) => { let hit = 0, n = 0; for (let x = Math.round(guess.x + guess.width * 0.1); x < guess.x + guess.width * 0.9; x++) { if (x < 0 || x >= raw.width || inside(x, y)) continue; n++; hit += +matches(x, y); } return n ? hit / n : 0; };
  const edge = (from: number, dir: -1 | 1, limit: number, test: (v: number) => number, max: number, gap: number) => {
    let v = Math.round(from), last = Math.round(from), misses = 0;
    for (let i = 0; i < limit && v >= 0 && v < max; i++, v += dir) {
      if (test(v) >= 0.55) { last = v; misses = 0; } else if (++misses > gap) break;
    }
    return last;
  };
  const reachX = Math.round(guess.width * 0.45), reachY = Math.round(guess.height * 0.45);
  const gapX = Math.max(6, Math.round(guess.width * 0.08)), gapY = Math.max(4, Math.round(guess.height * 0.2));
  const x0 = edge(guess.x + guess.width * 0.3, -1, reachX, columnFill, raw.width, gapX);
  const x1 = edge(guess.x + guess.width * 0.7, 1, reachX, columnFill, raw.width, gapX);
  const y0 = edge(guess.y + guess.height * 0.3, -1, reachY, rowFill, raw.height, gapY);
  const y1 = edge(guess.y + guess.height * 0.7, 1, reachY, rowFill, raw.height, gapY);
  const refined = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  // A refinement that collapsed or ran far away means the fill test failed; keep the model's box.
  const sane = refined.width > guess.width * 0.7 && refined.width < guess.width * 1.3 && refined.height > guess.height * 0.7 && refined.height < guess.height * 1.3;
  const left = grid[1][0], right = grid[1][2];
  const gradient = dist(left, right) > 28;
  return { box: sane ? refined : guess, fill: hex(gradient ? left : overall), fill2: gradient ? hex(right) : null, fillAt };
}

/**
 * Icons, arrows and divider lines drawn on a flat shape, lifted off its fill as transparent images.
 * Pixels close to the fill are transparent; edge pixels are un-blended from the fill so no halo remains.
 */
/** Distance from a color to the blend line between two colors (text anti-aliasing lies on it). */
function distToBlend(c: Rgb, a: Rgb, b: Rgb): number {
  const ab: Rgb = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
  const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / len));
  return dist(c, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
}

/** A text's area and colors: inside it, only pixels on the text/background blend belong to the text. */
export interface TextArea { box: Box; ink: Rgb; background: Rgb }

export async function liftDecor(raw: Raw, shape: ShapeMeasure, radius: number, exclude: TextArea[]): Promise<{ box: Box; png: Buffer; kind: 'icon' | 'line' }[]> {
  const b = shape.box;
  const alpha = new Float32Array(b.width * b.height);
  const insideRounded = (x: number, y: number) => {
    const r = Math.max(0, radius - 1), inset = 2;
    if (x < inset || y < inset || x >= b.width - inset || y >= b.height - inset) return false;
    const cx = Math.max(r, Math.min(b.width - r, x)), cy = Math.max(r, Math.min(b.height - r, y));
    return Math.hypot(x - cx, y - cy) <= r - inset || r === 0;
  };
  const excluded = (x: number, y: number) => exclude.some((e) => x >= e.box.x && x < e.box.x + e.box.width && y >= e.box.y && y < e.box.y + e.box.height && distToBlend(px(raw, x, y), e.background, e.ink) < 30);
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    const gx = b.x + x, gy = b.y + y;
    if (!insideRounded(x, y) || excluded(gx, gy)) continue;
    const d = dist(px(raw, gx, gy), shape.fillAt(gx, gy));
    alpha[y * b.width + x] = Math.max(0, Math.min(1, (d - 26) / 46));
  }
  // Connected groups of solid pixels, merged when they sit within a few pixels of each other.
  const seen = new Uint8Array(b.width * b.height);
  const groups: Box[] = [];
  for (let i = 0; i < alpha.length; i++) {
    if (seen[i] || alpha[i] < 0.5) continue;
    let minX = b.width, minY = b.height, maxX = 0, maxY = 0, count = 0;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!; const x = j % b.width, y = (j - x) / b.width; count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= b.width || ny >= b.height) continue;
        const k = ny * b.width + nx; if (!seen[k] && alpha[k] >= 0.5) { seen[k] = 1; stack.push(k); }
      }
    }
    // Groups touching the shape's border are its edge, highlight or shadow, not something drawn on it.
    const onBorder = minX <= 4 || minY <= 4 || maxX >= b.width - 5 || maxY >= b.height - 5;
    if (count >= 12 && !onBorder) groups.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }
  const near = (p: Box, q: Box, gap: number) => p.x - gap <= q.x + q.width && q.x - gap <= p.x + p.width && p.y - gap <= q.y + q.height && q.y - gap <= p.y + p.height;
  const merged: Box[] = [];
  for (const g of groups) {
    const hit = merged.find((m) => near(m, g, 6));
    if (!hit) { merged.push({ ...g }); continue; }
    const x = Math.min(hit.x, g.x), y = Math.min(hit.y, g.y);
    hit.width = Math.max(hit.x + hit.width, g.x + g.width) - x; hit.height = Math.max(hit.y + hit.height, g.y + g.height) - y; hit.x = x; hit.y = y;
  }
  const out: { box: Box; png: Buffer; kind: 'icon' | 'line' }[] = [];
  // Specks left inside a text's area are its own letters (off-blend pixels), not icons.
  const inText = (m: Box) => exclude.some((e) => { const cx = b.x + m.x + m.width / 2, cy = b.y + m.y + m.height / 2; return cx >= e.box.x && cx < e.box.x + e.box.width && cy >= e.box.y && cy < e.box.y + e.box.height && m.width * m.height < e.box.height * e.box.height; });
  for (const m of merged.filter((g) => !inText(g))) {
    const box = clip(grow(m, 2), b.width, b.height);
    if (box.width * box.height < 64) continue;
    const rgba = Buffer.alloc(box.width * box.height * 4);
    for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
      const gx = b.x + box.x + x, gy = b.y + box.y + y;
      const a = alpha[(box.y + y) * b.width + box.x + x];
      const c = px(raw, gx, gy), f = shape.fillAt(gx, gy), o = (y * box.width + x) * 4;
      for (let k = 0; k < 3; k++) rgba[o + k] = a > 0.02 ? Math.max(0, Math.min(255, Math.round((c[k] - (1 - a) * f[k]) / a))) : 0;
      rgba[o + 3] = Math.round(a * 255);
    }
    const png = await sharp(rgba, { raw: { width: box.width, height: box.height, channels: 4 } }).png().toBuffer();
    out.push({ box: { x: b.x + box.x, y: b.y + box.y, width: box.width, height: box.height }, png, kind: box.width > box.height * 8 || box.height > box.width * 8 ? 'line' : 'icon' });
  }
  return out;
}

/** Key a flat #00FF00 background out of an image model result, removing green spill on the edges. */
export async function keyGreen(png: Buffer, width: number, height: number): Promise<{ png: Buffer; trim: Box } | null> {
  const { data } = await sharp(png).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(width * height * 4);
  let greenBorder = 0, border = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3, o = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], bl = data[i + 2];
    const greenness = g - Math.max(r, bl);
    const a = 1 - Math.max(0, Math.min(1, (greenness - 30) / 70));
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) { border++; if (a < 0.2) greenBorder++; }
    rgba[o] = r; rgba[o + 1] = a < 1 ? Math.min(g, Math.max(r, bl)) : g; rgba[o + 2] = bl; rgba[o + 3] = Math.round(a * 255);
    if (a > 0.5) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  // Without a mostly green frame the model did not isolate the object; the result cannot be trusted.
  if (greenBorder < border * 0.6 || maxX < 0) return null;
  const trim = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const out = await sharp(rgba, { raw: { width, height, channels: 4 } }).extract({ left: trim.x, top: trim.y, width: trim.width, height: trim.height }).png().toBuffer();
  return { png: out, trim };
}

/** Quiet surfaces can be cleaned directly, avoiding a generative repaint of a badge or light background. */
export async function eraseFlatText(raw: Raw, measure: TextMeasure, lifted: {png:Buffer;box:Box}): Promise<Buffer|null> {
  const {data:alpha}=await sharp(lifted.png).ensureAlpha().extractChannel(3).raw().toBuffer({resolveWithObject:true});
  const b=lifted.box;
  let background=0,quiet=0;
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
    if(alpha[y*b.width+x]>8)continue;
    background++;
    if(dist(px(raw,b.x+x,b.y+y),measure.background)<=6)quiet++;
  }
  if(background<40||quiet/background<.97)return null;
  const rgba=Buffer.alloc(b.width*b.height*4);
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
    const i=y*b.width+x,o=i*4;
    const c=alpha[i]>4?measure.background:px(raw,b.x+x,b.y+y);
    rgba[o]=c[0];rgba[o+1]=c[1];rgba[o+2]=c[2];rgba[o+3]=255;
  }
  return sharp(rgba,{raw:{width:b.width,height:b.height,channels:4}}).png().toBuffer();
}
