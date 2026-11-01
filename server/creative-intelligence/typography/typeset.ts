/**
 * Typesets the approved copy onto a text-free generated visual, in the zones the layout designer planned.
 *
 * The image model is good at pictures and unreliable at Arabic letters, so in typeset mode it draws no text at
 * all and this module sets every string in the brand fonts (HarfBuzz shaping via text-outline.ts). The copy is
 * exact by construction: no spelling audit, no repaint loop. Colour and readability come from the real pixels
 * under each zone (light or dark text, and a soft scrim when the area is bright, dark or busy).
 */
import sharp from 'sharp';
import { BRAND } from '../brand/registry.js';
import { LOGO_ZONE, type LogoMark } from '../brand/design-language.js';
import type { Corner } from '../logo-resolution/resolver.js';
import type { ContentZone, SafeArea } from '../logo-resolution/validator.js';
import type { CanonicalCopy } from '../typography-validation/copy-check.js';
import { measureText, outlineText, paragraphDirection } from './text-outline.js';

export const TYPESET_VERSION = 'typeset:v3';

export interface NormZone { x: number; y: number; width: number; height: number }
export interface TypesetPlan {
  headlineZone?: NormZone; supportingCopyZone?: NormZone; factsZone?: NormZone; ctaZone?: NormZone;
  /** Typography director's alignment: right / center / left. */
  alignment?: string;
  /** The headline split by meaning; used when it joins back to the exact headline. */
  headlineLines?: string[];
  /** Cap height as a fraction of the canvas width (typography director). Since typeset:v3 the house scale is used instead. */
  headlineScale?: number;
}
export interface TypesetInput {
  /** The visual at its final output size, with no text in it. */
  image: Buffer;
  copy: CanonicalCopy;
  plan: TypesetPlan;
  safeArea: SafeArea;
  logo: { corner: Corner; mark: LogoMark };
  /** Shade the logo corner softly when the picture there would not hold the lockup (house logo mode). */
  logoShade?: boolean;
}
export interface TypesetBlock { role: 'headline' | 'subheadline' | 'fact' | 'cta'; text: string; box: { x: number; y: number; width: number; height: number }; size: number; weight: number; color: string }
export interface TypesetResult {
  png: Buffer;
  /** Where every text element landed, in output pixels: the logo resolver avoids them exactly. */
  zones: ContentZone[];
  layout: { version: string; placement: Placement; column: { x: number; y: number; width: number; height: number }; anchor: 'top' | 'bottom' | 'middle'; align: 'start' | 'center' | 'end'; tone: 'light-text' | 'dark-text'; scrim: number; blocks: TypesetBlock[] };
  problems: string[];
}

const DARK_TEXT = '#0B1530';
const LIGHT_TEXT = '#FFFFFF';
const ORANGE = BRAND.colors.core.brandOrange.hex;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const usable = (z?: NormZone): z is NormZone => Boolean(z && z.width > 0.02 && z.height > 0.01 && Number.isFinite(z.x + z.y + z.width + z.height));
const r = (n: number) => Math.round(n * 100) / 100;
const canvasIsWide = (W: number, H: number) => W / H > 1.4;

/** Mean luminance (0..1) and texture (stdev, 0..1) of a region of the image. */
async function regionTone(image: Buffer, box: { x: number; y: number; width: number; height: number }) {
  const meta = await sharp(image).metadata();
  const W = meta.width ?? 1, H = meta.height ?? 1;
  const left = clamp(Math.round(box.x), 0, W - 2), top = clamp(Math.round(box.y), 0, H - 2);
  const width = clamp(Math.round(box.width), 1, W - left), height = clamp(Math.round(box.height), 1, H - top);
  const stats = await sharp(image).extract({ left, top, width, height }).greyscale().stats();
  const channel = stats.channels[0];
  return { luminance: channel.mean / 255, texture: channel.stdev / 255 };
}

/**
 * Detail under a region, 0 (flat) … ~1 (very busy): mean absolute Laplacian of a small greyscale copy. Faces,
 * equipment and edges score high; skies, walls, shadows and soft gradients low — what matters for type.
 */
export async function regionBusyness(image: Buffer, box: { x: number; y: number; width: number; height: number }): Promise<number> {
  const meta = await sharp(image).metadata();
  const W = meta.width ?? 1, H = meta.height ?? 1;
  const left = clamp(Math.round(box.x), 0, W - 4), top = clamp(Math.round(box.y), 0, H - 4);
  const width = clamp(Math.round(box.width), 3, W - left), height = clamp(Math.round(box.height), 3, H - top);
  const w = 96, h = Math.max(3, Math.round((96 * height) / width));
  const { data } = await sharp(image).extract({ left, top, width, height }).greyscale().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    sum += Math.abs(4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w]);
    n++;
  }
  return n ? sum / n / 255 : 0;
}

export type Placement = 'planned' | 'top' | 'bottom' | 'side';
/** Where the copy may go when the image model did not leave the planned area calm. */
const ALTERNATIVES = (rtl: boolean, wide: boolean): { placement: Placement; plan: TypesetPlan }[] => [
  { placement: 'top', plan: { headlineZone: { x: 0.08, y: 0.06, width: 0.84, height: 0.3 } } },
  { placement: 'bottom', plan: { headlineZone: { x: 0.08, y: 0.62, width: 0.84, height: 0.3 } } },
  { placement: 'side', plan: { headlineZone: { x: rtl ? (wide ? 0.5 : 0.46) : 0.06, y: 0.14, width: wide ? 0.44 : 0.48, height: 0.62 } } },
];

/**
 * The column to set the copy in: the layout designer's, unless the generated picture put its subject there and
 * another standard area is clearly calmer. The plan wins ties: it was designed around the idea.
 */
export async function chooseColumn(image: Buffer, plan: TypesetPlan, W: number, H: number, safe: SafeArea, logo: { corner: Corner; mark: LogoMark }, rtl: boolean) {
  const planned = textColumn(plan, W, H, safe, logo);
  const busy = await regionBusyness(image, planned);
  // Calm enough already: no need to look further.
  if (busy < 0.035) return { col: planned, placement: 'planned' as Placement, busy };
  let best = { col: planned, placement: 'planned' as Placement, busy };
  for (const alt of ALTERNATIVES(rtl, W / H > 1.4)) {
    if (alt.placement === 'bottom' && H / W < 1.1) continue; // wide banners: the side, not the bottom strip
    const col = textColumn(alt.plan, W, H, safe, logo);
    const b = await regionBusyness(image, col);
    if (b < best.busy) best = { col, placement: alt.placement, busy: b };
  }
  // Move only for a clear gain.
  return best.placement !== 'planned' && best.busy * 1.35 + 0.006 < busy ? best : { col: planned, placement: 'planned' as Placement, busy };
}

function alignmentOf(value: string | undefined, rtl: boolean): 'start' | 'center' | 'end' {
  const v = (value ?? '').toLowerCase();
  if (/cent/.test(v)) return 'center';
  if (/left/.test(v)) return rtl ? 'end' : 'start';
  if (/right/.test(v)) return rtl ? 'start' : 'end';
  return 'start';
}

/**
 * The text column in output pixels: the span of the planned text zones, widened when it is too narrow to set
 * Arabic well, kept inside the margins and platform safe areas and clear of the logo zone.
 */
export function textColumn(plan: TypesetPlan, W: number, H: number, safe: SafeArea, logo: { corner: Corner; mark: LogoMark }) {
  const margin = Math.round(0.06 * Math.min(W, H * 1.15));
  const minX = Math.max(margin, safe.left), maxX = W - Math.max(margin, safe.right);
  const minY = Math.max(margin, safe.top + margin * 0.5), maxY = H - Math.max(margin, safe.bottom + margin * 0.5);
  const zones = [plan.headlineZone, plan.supportingCopyZone, plan.factsZone, plan.ctaZone].filter(usable);
  // Without a plan, the classic poster: type across the top, picture below.
  const span = zones.length
    ? { x0: Math.min(...zones.map((z) => z.x)), x1: Math.max(...zones.map((z) => z.x + z.width)), y0: Math.min(...zones.map((z) => z.y)), y1: Math.max(...zones.map((z) => z.y + z.height)) }
    : { x0: 0.08, x1: 0.92, y0: 0.08, y1: 0.42 };
  let x0 = span.x0 * W, x1 = span.x1 * W;
  const minWidth = (W / H > 1.4 ? 0.42 : 0.5) * W;
  if (x1 - x0 < minWidth) { const mid = (x0 + x1) / 2; x0 = mid - minWidth / 2; x1 = mid + minWidth / 2; }
  if (x0 < minX) { x1 += minX - x0; x0 = minX; }
  if (x1 > maxX) { x0 -= x1 - maxX; x1 = maxX; }
  x0 = Math.max(minX, x0);
  let y0 = clamp(span.y0 * H, minY, maxY), y1 = clamp(span.y1 * H, minY, maxY);
  if (y1 - y0 < 0.18 * H) y1 = Math.min(maxY, y0 + 0.18 * H);
  const centre = (y0 + y1) / 2 / H;
  const anchor: 'top' | 'bottom' | 'middle' = centre < 0.42 ? 'top' : centre > 0.58 ? 'bottom' : 'middle';
  // Keep the reserved logo corner free: start the type below it (or end above it) when the column reaches it.
  const zone = LOGO_ZONE[logo.mark];
  const logoBox = { x: logo.corner.endsWith('left') ? 0 : W * (1 - zone.w), y: logo.corner.startsWith('top') ? safe.top : H - safe.bottom - H * zone.h, w: W * zone.w, h: H * zone.h };
  const overlapsX = x0 < logoBox.x + logoBox.w && x1 > logoBox.x;
  if (overlapsX && logo.corner.startsWith('top') && y0 < logoBox.y + logoBox.h) y0 = Math.min(maxY - 0.15 * H, logoBox.y + logoBox.h + margin * 0.25);
  if (overlapsX && logo.corner.startsWith('bottom') && y1 > logoBox.y) y1 = Math.max(minY + 0.15 * H, logoBox.y - margin * 0.25);
  if (y1 - y0 < 0.15 * H) { if (anchor === 'bottom') y0 = Math.max(minY, y1 - 0.15 * H); else y1 = Math.min(maxY, y0 + 0.15 * H); }
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0), anchor, margin, bounds: { minY, maxY } };
}

/** A left-pointing chevron for right-to-left CTAs (right-pointing for LTR). */
const chevron = (cx: number, cy: number, s: number, color: string, rtl: boolean) => {
  const d = rtl ? `M${r(cx + s * 0.3)} ${r(cy - s * 0.5)} L${r(cx - s * 0.25)} ${r(cy)} L${r(cx + s * 0.3)} ${r(cy + s * 0.5)}` : `M${r(cx - s * 0.3)} ${r(cy - s * 0.5)} L${r(cx + s * 0.25)} ${r(cy)} L${r(cx - s * 0.3)} ${r(cy + s * 0.5)}`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r(s * 0.2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

interface Piece { role: TypesetBlock['role']; text: string; size: number; weight: number; lineHeight: number; maxLines: number; preserveNewlines?: boolean; gapAfter: number }

export async function typesetCreative(input: TypesetInput): Promise<TypesetResult> {
  const meta = await sharp(input.image).metadata();
  const W = meta.width!, H = meta.height!;
  const { copy, plan } = input;
  const rtl = paragraphDirection(copy.headline) === 'rtl';
  const { col, placement } = await chooseColumn(input.image, plan, W, H, input.safeArea, input.logo, rtl);
  // One alignment on every design: the reading start (right for Arabic). Only a centred plan in a full-width
  // column stays centred; a moved column always reads from the start.
  const align = (placement === 'planned' && alignmentOf(plan.alignment, rtl) === 'center' && col.width > 0.75 * W ? 'center' : 'start') as 'start' | 'center' | 'end';
  const unit = Math.min(W, H * 1.15);
  const problems: string[] = [];

  // Readability from the real pixels under the column.
  const tone = await regionTone(input.image, col);
  const darkText = tone.luminance > 0.62;
  const textColor = darkText ? DARK_TEXT : LIGHT_TEXT;
  // Scrim strength: more on busy texture or a mid-tone that suits neither text colour.
  const midTone = 1 - Math.abs(tone.luminance - 0.5) * 2;
  const scrim = clamp(0.18 + tone.texture * 1.6 + midTone * 0.35, 0.22, 0.78);

  const headlineLines = plan.headlineLines?.length && plan.headlineLines.join(' ').replace(/\s+/g, ' ').trim() === copy.headline.replace(/\s+/g, ' ').trim() ? plan.headlineLines : undefined;
  // The house type scale: the same headline size on every design of a format (it only shrinks to fit). Sizes
  // guessed per design by the typography director made a set of posts look unrelated.
  let headSize = (canvasIsWide(W, H) ? 0.1 : 0.088) * unit;
  let bodyScale = 1;

  const build = (): Piece[] => {
    const sub = clamp(headSize * 0.46, 0.032 * unit, 0.05 * unit) * bodyScale;
    const fact = clamp(headSize * 0.36, 0.028 * unit, 0.04 * unit) * bodyScale;
    const cta = clamp(headSize * 0.42, 0.034 * unit, 0.044 * unit) * bodyScale;
    const pieces: Piece[] = [{ role: 'headline', text: headlineLines ? headlineLines.join('\n') : copy.headline, size: headSize, weight: 800, lineHeight: 1.22, maxLines: 3, preserveNewlines: Boolean(headlineLines), gapAfter: headSize * 0.42 }];
    if (copy.subheadline) pieces.push({ role: 'subheadline', text: copy.subheadline, size: sub, weight: 700, lineHeight: 1.45, maxLines: 3, gapAfter: sub * 0.9 });
    for (const f of copy.facts ?? []) pieces.push({ role: 'fact', text: f, size: fact, weight: 700, lineHeight: 1.3, maxLines: 2, gapAfter: fact * 0.45 });
    if (copy.cta) pieces.push({ role: 'cta', text: copy.cta, size: cta, weight: 800, lineHeight: 1.2, maxLines: 1, gapAfter: 0 });
    return pieces;
  };
  // Chips and the CTA pill have padding, so their text wraps inside a narrower box.
  const innerWidth = (p: Piece) => p.role === 'fact' || p.role === 'cta' ? col.width - p.size * 2.2 : col.width;
  const measure = (pieces: Piece[]) => pieces.map((p) => {
    const out = outlineText({ text: p.text, x: 0, y: 0, width: innerWidth(p), align, direction: rtl ? 'rtl' : 'ltr', maxLines: p.maxLines, preserveNewlines: p.preserveNewlines, style: { family: 'brand', weight: p.weight, size: p.size, color: textColor, lineHeight: p.lineHeight } });
    const padY = p.role === 'fact' ? p.size * 0.55 : p.role === 'cta' ? p.size * 0.62 : 0;
    return { piece: p, out, height: out.height + padY * 2, padY };
  });
  const available = col.bounds.maxY - col.bounds.minY;
  let measured = measure(build());
  const total = (m: typeof measured) => m.reduce((sum, item, i) => sum + item.height + (i < m.length - 1 ? item.piece.gapAfter : 0), 0);
  // The typography director broke the headline by meaning; extra wrapping would break a phrase. Shrink first.
  const brokeLines = (m: typeof measured) => Boolean(headlineLines) && m[0].out.lines.length > headlineLines!.length;
  // The stack may grow past a short planned zone to half the usable height before anything shrinks.
  const room = Math.min(available, Math.max(col.height * 1.6, available * 0.5));
  const tooTall = (m: typeof measured) => total(m) > room;
  // Shrink to fit, keeping the house headline size as long as possible: the supporting text first (to 86%),
  // then the headline (down to its floor), then the supporting text again. Wrapping or a broken phrase is
  // a headline problem, so it shrinks the headline straight away.
  for (let i = 0; i < 18; i++) {
    const headlineIssue = measured[0].out.overflow || (brokeLines(measured) && headSize > 0.06 * unit);
    const bodyIssue = measured.slice(1).some((m) => m.out.overflow) || tooTall(measured);
    if (!headlineIssue && !bodyIssue) break;
    if (!headlineIssue && bodyScale > 0.86) bodyScale *= 0.95;
    else if (headSize > 0.06 * unit) headSize *= 0.93;
    else bodyScale *= 0.94;
    measured = measure(build());
  }
  const height = total(measured);
  // Place the stack: from the top of the column, ending at its bottom, or centred on it.
  let y = col.anchor === 'bottom' ? col.y + col.height - height : col.anchor === 'middle' ? col.y + (col.height - height) / 2 : col.y;
  y = clamp(y, col.bounds.minY, Math.max(col.bounds.minY, col.bounds.maxY - height));

  const body: string[] = [], decor: string[] = [], blocks: TypesetBlock[] = [], zones: ContentZone[] = [];
  const shadow = darkText ? '' : ' filter="url(#ts-shadow)"';
  const chipFill = darkText ? 'rgba(255,255,255,0.72)' : 'rgba(8,16,40,0.46)';
  const chipStroke = darkText ? 'rgba(11,21,48,0.12)' : 'rgba(255,255,255,0.22)';
  for (const { piece, out, height: h, padY } of measured) {
    if (out.missingGlyphs.length) problems.push(`Typeset ${piece.role}: the brand font has no glyph for ${out.missingGlyphs.join(' ')}`);
    if (out.overflow) problems.push(`Typeset ${piece.role}: text does not fit its area`);
    const lineWidth = Math.max(...out.lines.map((l) => l.width), 0);
    const padX = piece.role === 'fact' ? piece.size * 0.9 : piece.role === 'cta' ? piece.size * 1.1 : 0;
    const arrow = piece.role === 'cta' ? piece.size * 0.9 : 0;
    const boxWidth = piece.role === 'fact' || piece.role === 'cta' ? lineWidth + padX * 2 + arrow : lineWidth;
    // The box's left edge for the alignment within the column.
    const startsRight = rtl ? align === 'start' : align === 'end';
    const bx = align === 'center' ? col.x + (col.width - boxWidth) / 2 : startsRight ? col.x + col.width - boxWidth : col.x;
    if (piece.role === 'fact' || piece.role === 'cta') {
      const radius = h / 2;
      if (piece.role === 'cta') decor.push(`<rect x="${r(bx)}" y="${r(y)}" width="${r(boxWidth)}" height="${r(h)}" rx="${r(radius)}" fill="${ORANGE}" filter="url(#ts-lift)"/>`);
      else decor.push(`<rect x="${r(bx)}" y="${r(y)}" width="${r(boxWidth)}" height="${r(h)}" rx="${r(radius)}" fill="${chipFill}" stroke="${chipStroke}" stroke-width="1.5"/>`);
      const color = piece.role === 'cta' ? '#FFFFFF' : textColor;
      // Text inside the pill: the reading start sits at the padding, the arrow at the reading end.
      const textX = rtl ? bx + boxWidth - padX - lineWidth : bx + padX;
      const placed = outlineText({ text: piece.text, x: textX, y: y + padY, width: lineWidth + 1, align: 'start', direction: rtl ? 'rtl' : 'ltr', maxLines: piece.maxLines, style: { family: 'brand', weight: piece.weight, size: piece.size, color, lineHeight: piece.lineHeight } });
      body.push(placed.svg.replace('<path', piece.role === 'fact' ? `<path${shadow}` : '<path'));
      if (arrow) body.push(chevron(rtl ? bx + padX * 0.6 + arrow * 0.35 : bx + boxWidth - padX * 0.6 - arrow * 0.35, y + h / 2, piece.size * 0.55, '#FFFFFF', rtl));
      blocks.push({ role: piece.role, text: piece.text, box: { x: Math.round(bx), y: Math.round(y), width: Math.round(boxWidth), height: Math.round(h) }, size: r(piece.size), weight: piece.weight, color });
    } else {
      const placed = outlineText({ text: piece.text, x: col.x, y, width: innerWidth(piece), align, direction: rtl ? 'rtl' : 'ltr', maxLines: piece.maxLines, preserveNewlines: piece.preserveNewlines, style: { family: 'brand', weight: piece.weight, size: piece.size, color: textColor, lineHeight: piece.lineHeight } });
      body.push(placed.svg.replace('<path', `<path${shadow}${piece.role === 'subheadline' ? ' fill-opacity="0.92"' : ''}`));
      if (piece.role === 'headline') {
        // A short brand-orange rule over the headline's reading start: a designed accent, not decoration for its own sake.
        const bar = { w: 0.075 * unit, h: Math.max(4, 0.009 * unit) };
        const barX = align === 'center' ? col.x + (col.width - bar.w) / 2 : startsRight ? col.x + col.width - bar.w : col.x;
        decor.push(`<rect x="${r(barX)}" y="${r(y - bar.h - piece.size * 0.32)}" width="${r(bar.w)}" height="${r(bar.h)}" rx="${r(bar.h / 2)}" fill="${ORANGE}"/>`);
      }
      blocks.push({ role: piece.role, text: piece.text, box: { x: Math.round(bx), y: Math.round(y), width: Math.round(lineWidth), height: Math.round(h) }, size: r(piece.size), weight: piece.weight, color: textColor });
    }
    zones.push({ kind: piece.role === 'cta' ? 'cta' : 'text', label: piece.text.slice(0, 40), box: blocks[blocks.length - 1].box });
    y += h + piece.gapAfter;
  }

  // Scrim: a soft gradient from the canvas edge the text sits against, sized to the text block.
  const textTop = Math.min(...blocks.map((b) => b.box.y)), textBottom = Math.max(...blocks.map((b) => b.box.y + b.box.height));
  const shade = darkText ? '255,255,255' : '5,12,32';
  const pad = 0.12 * H;
  let scrimRect = '';
  const narrow = col.width < 0.66 * W;
  if (narrow) {
    // Side column: fade from the side edge the column is on.
    const fromRight = col.x + col.width / 2 > W / 2;
    const span = Math.min(W, col.width + col.margin * 3);
    scrimRect = `<linearGradient id="ts-scrim" x1="${fromRight ? 1 : 0}" y1="0" x2="${fromRight ? 0 : 1}" y2="0"><stop offset="0" stop-color="rgb(${shade})" stop-opacity="${r(scrim)}"/><stop offset="0.62" stop-color="rgb(${shade})" stop-opacity="${r(scrim * 0.55)}"/><stop offset="1" stop-color="rgb(${shade})" stop-opacity="0"/></linearGradient>`;
    decor.unshift(`<rect x="${fromRight ? W - span : 0}" y="0" width="${r(span)}" height="${H}" fill="url(#ts-scrim)"/>`);
  } else {
    const top = col.anchor !== 'bottom';
    const y0 = top ? 0 : Math.max(0, textTop - pad), y1 = top ? Math.min(H, textBottom + pad) : H;
    scrimRect = `<linearGradient id="ts-scrim" x1="0" y1="${top ? 0 : 1}" x2="0" y2="${top ? 1 : 0}"><stop offset="0" stop-color="rgb(${shade})" stop-opacity="${r(scrim)}"/><stop offset="0.6" stop-color="rgb(${shade})" stop-opacity="${r(scrim * 0.6)}"/><stop offset="1" stop-color="rgb(${shade})" stop-opacity="0"/></linearGradient>`;
    decor.unshift(`<rect x="0" y="${r(y0)}" width="${W}" height="${r(y1 - y0)}" fill="url(#ts-scrim)"/>`);
  }
  // House logo corner: a soft shade under the logo's corner when the picture there is light-busy or mid-tone,
  // so the same lockup fits the same corner on every design instead of moving or shrinking to the symbol.
  let shadeDef = '';
  if (input.logoShade) {
    const zone = LOGO_ZONE[input.logo.mark];
    const zw = W * zone.w, zh = H * zone.h;
    const top = input.logo.corner.startsWith('top'), left = input.logo.corner.endsWith('left');
    const zx = left ? 0 : W - zw, zy = top ? input.safeArea.top : H - input.safeArea.bottom - zh;
    const corner = await regionTone(input.image, { x: zx, y: zy, width: zw, height: zh });
    const calmLight = corner.luminance > 0.7 && corner.texture < 0.12;
    if (!calmLight) {
      const strength = clamp(0.3 + corner.texture * 1.8 + (corner.luminance > 0.45 ? 0.15 : 0), 0.32, 0.72);
      const cx = left ? 0 : W, cy = top ? zy : zy + zh;
      const radius = Math.max(zw, zh) * 1.55;
      shadeDef = `<radialGradient id="ts-logo" cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="rgb(5,12,32)" stop-opacity="${r(strength)}"/><stop offset="0.55" stop-color="rgb(5,12,32)" stop-opacity="${r(strength * 0.6)}"/><stop offset="1" stop-color="rgb(5,12,32)" stop-opacity="0"/></radialGradient>`;
      decor.unshift(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#ts-logo)"/>`);
    }
  }
  const defs = `<defs>${scrimRect}${shadeDef}<filter id="ts-shadow" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="${r(unit * 0.003)}" stdDeviation="${r(unit * 0.006)}" flood-color="#000" flood-opacity="0.35"/></filter><filter id="ts-lift" x="-20%" y="-40%" width="140%" height="200%"><feDropShadow dx="0" dy="${r(unit * 0.006)}" stdDeviation="${r(unit * 0.01)}" flood-color="#7a2a00" flood-opacity="0.35"/></filter></defs>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${decor.join('')}${body.join('')}</svg>`;
  const png = await sharp(input.image).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  return { png, zones, layout: { version: TYPESET_VERSION, placement, column: { x: col.x, y: col.y, width: col.width, height: col.height }, anchor: col.anchor, align, tone: darkText ? 'dark-text' : 'light-text', scrim: r(scrim), blocks }, problems };
}

/** Width check used by tests and the planner: does a headline fit the column at a given size. */
export const headlineFits = (text: string, size: number, width: number) => measureText(text, { weight: 800, size, color: '#000' }) <= width;
