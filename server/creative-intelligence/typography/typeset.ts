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
import { plannedLogoBox, type Corner } from '../logo-resolution/resolver.js';
import type { ContentZone, SafeArea } from '../logo-resolution/validator.js';
import type { CanonicalCopy } from '../typography-validation/copy-check.js';
import { measureText, outlineText, paragraphDirection, type OutlinedText } from './text-outline.js';

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
  /** The copywriter's emphasis phrase: set on the green highlight bar in the house story layout. */
  emphasis?: string;
  /** How a story distributes its elements; thirds by default. */
  arrangement?: StoryArrangement;
}
export interface TypesetBlock { role: 'headline' | 'subheadline' | 'fact' | 'cta'; text: string; box: { x: number; y: number; width: number; height: number }; size: number; weight: number; color: string }
export interface TypesetResult {
  png: Buffer;
  /** Where every text element landed, in output pixels: the logo resolver avoids them exactly. */
  zones: ContentZone[];
  layout: { version: string; placement: Placement; column: { x: number; y: number; width: number; height: number }; anchor: 'top' | 'bottom' | 'middle'; align: 'start' | 'center' | 'end'; tone: 'light-text' | 'dark-text'; scrim: number; blocks: TypesetBlock[] };
  problems: string[];
  /** Where this layout planned the logo: the resolver uses this inset and lockup width (the story's logo sits near the top). */
  logoHint?: { safeArea: SafeArea; lockupWidths: number[] };
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
  // stats() reads the input, not the pipeline: extract to a buffer first, or it measures the whole picture.
  const region = await sharp(image).extract({ left, top, width, height }).greyscale().toBuffer();
  const stats = await sharp(region).stats();
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
  // Full-screen vertical canvases get the house story layout: fixed, measured positions instead of a column.
  if (H / W > 1.6) return typesetStory(input, W, H);
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
  const { def: shadeDef, rect: shadeRect } = input.logoShade ? await logoShade(input, W, H) : { def: '', rect: '' };
  if (shadeRect) decor.unshift(shadeRect);
  const defs = `<defs>${scrimRect}${shadeDef}<filter id="ts-shadow" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="${r(unit * 0.003)}" stdDeviation="${r(unit * 0.006)}" flood-color="#000" flood-opacity="0.35"/></filter><filter id="ts-lift" x="-20%" y="-40%" width="140%" height="200%"><feDropShadow dx="0" dy="${r(unit * 0.006)}" stdDeviation="${r(unit * 0.01)}" flood-color="#7a2a00" flood-opacity="0.35"/></filter></defs>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${decor.join('')}${body.join('')}</svg>`;
  const png = await sharp(input.image).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  return { png, zones, layout: { version: TYPESET_VERSION, placement, column: { x: col.x, y: col.y, width: col.width, height: col.height }, anchor: col.anchor, align, tone: darkText ? 'dark-text' : 'light-text', scrim: r(scrim), blocks }, problems };
}

/** Width check used by tests and the planner: does a headline fit the column at a given size. */
export const headlineFits = (text: string, size: number, width: number) => measureText(text, { weight: 800, size, color: '#000' }) <= width;

/**
 * House logo corner: a soft shade under the logo's corner when the picture there is light-busy or mid-tone, so
 * the same lockup fits the same corner on every design instead of moving or shrinking to the symbol.
 */
async function logoShade(input: TypesetInput, W: number, H: number, spot?: Px): Promise<{ def: string; rect: string }> {
  const zone = LOGO_ZONE[input.logo.mark];
  const top = input.logo.corner.startsWith('top'), left = input.logo.corner.endsWith('left');
  // The logo's own spot when the layout knows it (the story); else the reserved corner zone.
  const zw = spot ? spot.x + spot.width : W * zone.w, zh = spot ? spot.height : H * zone.h;
  const zx = spot ? (left ? 0 : spot.x) : left ? 0 : W - zw, zy = spot ? spot.y : top ? input.safeArea.top : H - input.safeArea.bottom - zh;
  const corner = await regionTone(input.image, { x: zx, y: zy, width: zw, height: zh });
  if (corner.luminance > 0.7 && corner.texture < 0.12) return { def: '', rect: '' };
  const strength = clamp(0.3 + corner.texture * 1.8 + (corner.luminance > 0.45 ? 0.15 : 0), 0.32, 0.72);
  const cx = left ? 0 : W, cy = top ? zy : zy + zh;
  const radius = Math.max(zw, zh) * 1.55;
  return {
    def: `<radialGradient id="ts-logo" cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="rgb(5,12,32)" stop-opacity="${r(strength)}"/><stop offset="0.55" stop-color="rgb(5,12,32)" stop-opacity="${r(strength * 0.6)}"/><stop offset="1" stop-color="rgb(5,12,32)" stop-opacity="0"/></radialGradient>`,
    rect: `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#ts-logo)"/>`,
  };
}

// ── House story layout (9:16) ─────────────────────────────────────────

type Px = { x: number; y: number; width: number; height: number };
const GREEN = '#4CFF7A';
const ON_GREEN = '#001BB7';
const ROYAL_BLUE = '#0046FF';
const WEBSITE = 'www.engosoft.com';
/** Latin letters reorder as a group inside Arabic text, so a line with them is set whole, without a highlight. */
const HAS_LATIN = /[A-Za-z]/;

/**
 * How a story distributes its elements, with the proportions measured from the story references the marketing
 * team chose (docs/PLATFORM_LAYOUT_RULES.md): text-top puts the headline and body in the upper half and the
 * picture's subject in the lower ~40%; picture-top swaps them.
 */
export type StoryArrangement = 'text-top' | 'picture-top';
export const STORY_ARRANGEMENTS: StoryArrangement[] = ['text-top', 'picture-top'];

/** The reference stories' proportions, as shares of the canvas width (x, sizes) or height (y). */
export const STORY_PROPORTIONS = {
  /** Side margins: 10–11% of the width on the references. */ margin: 0.1,
  /** The logo's top edge: 6–8% from the top. */ logoTop: 0.06,
  /** The lockup's width, just above the brand minimum (22%). */ logoShare: 0.23,
  /** The earliest the headline starts (text-top): 13–20%. */ headlineTop: 0.16,
  /** Headline line pitch: about 12.5% of the width. */ linePitch: 0.125,
  /** The smallest line pitch before the copy is reported too long. */ minLinePitch: 0.085,
  /** Body text size (the supporting line and facts, one per line). */ bodySize: 0.038,
  /** Text-top: headline and body end by the middle of the screen, leaving the lower ~40% to the picture. */ textTopEnd: 0.5,
  /** Picture-top: the picture's band ends here and the headline starts just below (references: 39–48%). */ pictureTopEnd: 0.5,
  /** The button's bottom edge. */ ctaBottom: 0.86,
  /** The website footer's top: about 93% on the references. */ footerTop: 0.925,
} as const;

export interface StoryLayout {
  arrangement: StoryArrangement;
  align: 'start' | 'center';
  logo: Px;
  /** Inset the logo resolver must use for this layout's logo spot (the logo sits near the very top). */
  logoSafe: SafeArea;
  headline: { text: string; lines: number; size: number; box: Px; preserveNewlines: boolean; /** Each set line's own box: what the logo and stamp must keep clear of. */ lineBoxes: Px[] };
  emphasis?: string;
  /** The body: the supporting line and the facts, one per line. */
  sub?: { text: string; size: number; box: Px };
  /** Kept for the shape the renderer expects: the facts are set in the body on this layout. */
  facts: { text: string; size: number; box: Px; padX: number; padY: number }[];
  cta?: { text: string; size: number; box: Px; padX: number; padY: number; arrow: number };
  footer: { text: string; x: number; y: number; size: number; width: number };
  /** The band left for the picture's subject. */
  subject: Px;
  column: { left: number; right: number };
  problems: string[];
}

const ARABIC_LETTER = /[\u0621-\u064A]/;

/**
 * The phrase for the green bar, as the main design has it: a quoted part of the headline in the typography
 * director's note (it writes «green highlight bar behind 'تغيّر الاتجاه'»), else the copywriter's emphasis when
 * it is words of the headline (not a lone number), else nothing and the layout picks the longest word.
 */
export function highlightPhrase(headline: string, typographyNote = '', copywriterEmphasis = ''): string | undefined {
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const head = norm(headline);
  const quoted = [...typographyNote.matchAll(/['‘’"“”«»]([^'‘’"“”«»]{2,60})['‘’"“”«»]/g)].map((m) => norm(m[1])).filter((q) => ARABIC_LETTER.test(q) && head.includes(q));
  const nearGreen = quoted.find((q) => { const at = typographyNote.indexOf(q); return /green|highlight|أخضر/i.test(typographyNote.slice(Math.max(0, at - 80), at)); });
  if (nearGreen ?? quoted[0]) return nearGreen ?? quoted[0];
  const given = norm(copywriterEmphasis);
  return given && ARABIC_LETTER.test(given) && head.includes(given) ? given : undefined;
}

/** The phrase to set on the green bar: the one given, if it is words of the headline; else the headline's longest Arabic word. */
function emphasisOf(headline: string, given?: string): string | undefined {
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  if (given && ARABIC_LETTER.test(given) && norm(headline).includes(norm(given))) return norm(given);
  const words = norm(headline).split(' ').filter((w) => !HAS_LATIN.test(w) && !/\d/.test(w));
  return words.length > 1 ? words.reduce((a, b) => (b.length > a.length ? b : a)) : undefined;
}

/**
 * The story's spacing scale: every gap is a multiple of one unit (W/45 — 24 px on a 1080 story), so the rhythm is
 * the same on every story instead of a different hand-picked gap between each pair of elements.
 */
/**
 * Positions for a story, from the reference proportions: the logo small at the top corner, the headline of short
 * lines (the emphasis whole on its own line, on its green bar), the body under it, the orange button, the website
 * footer, and the picture's band. Measured from the real copy, so the picture is drawn around exactly these areas
 * and nothing set later can collide with the logo.
 */
export function storyLayout(copy: CanonicalCopy, W: number, H: number, safe: SafeArea, logo: { corner: Corner; mark: LogoMark }, options: { headlineLines?: string[]; emphasis?: string; arrangement?: StoryArrangement } = {}): StoryLayout {
  const P = STORY_PROPORTIONS;
  const problems: string[] = [];
  const arrangement = options.arrangement ?? 'text-top';
  const u = W / 45;
  const m = Math.round(P.margin * W);
  const left = m, right = W - m, colW = right - left;
  const logoSafe: SafeArea = { top: Math.round(P.logoTop * H), bottom: safe.bottom, left: m, right: m };
  const logoBox = plannedLogoBox({ width: W, height: H }, logo.mark, logo.corner, logoSafe, P.logoShare);
  const logoBottom = logo.corner.startsWith('top') ? logoBox.y + logoBox.height : logoSafe.top;
  const rtl = paragraphDirection(copy.headline) === 'rtl';
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const planned = options.headlineLines?.length && norm(options.headlineLines.join(' ')) === norm(copy.headline) ? options.headlineLines : undefined;
  const emphasis = rtl ? emphasisOf(copy.headline, options.emphasis) : undefined;
  // The emphasis phrase stays whole on one line — on its own line when words come before or after it — so it
  // can sit on its green bar («3 دورات» / «تغيّر الاتجاه»). The planned breaks are kept when they already do that.
  const aroundEmphasis = (): string[] | undefined => {
    if (!emphasis) return undefined;
    const text = norm(copy.headline), at = text.indexOf(emphasis);
    return [text.slice(0, at).trim(), emphasis, text.slice(at + emphasis.length).trim()].filter(Boolean);
  };
  let fixed = planned && (!emphasis || planned.some((l) => norm(l).includes(emphasis))) ? planned : aroundEmphasis() ?? planned;
  let headText = fixed ? fixed.join('\n') : copy.headline;
  const style = (size: number, weight: number, lineHeight: number) => ({ family: 'brand' as const, weight, size, color: '#fff', lineHeight });
  const bodyText = [copy.subheadline, ...(copy.facts ?? [])].filter(Boolean).join('\n');
  const bodySize = P.bodySize * W;

  // The footer and the button are fixed to the bottom of the layout.
  const footerSize = 0.026 * W;
  const footerWidth = measureText(WEBSITE, style(footerSize, 700, 1.2), 'ltr');
  const footer = { text: WEBSITE, x: left, y: Math.round(P.footerTop * H), size: footerSize, width: Math.round(footerWidth) };
  const ctaSize = 0.05 * W;
  let cta: StoryLayout['cta'];
  const ctaBox = (y: number) => {
    if (!copy.cta) return undefined;
    const padY = ctaSize * 0.62, padX = ctaSize * 1.1, arrow = ctaSize * 0.9;
    const lineW = measureText(copy.cta, style(ctaSize, 800, 1.2));
    const out = outlineText({ text: copy.cta, x: 0, y: 0, width: colW, maxLines: 1, style: style(ctaSize, 800, 1.2) });
    const width = Math.min(colW, lineW + padX * 2 + arrow), height = out.height + padY * 2;
    // Aligned to the text's reading start, as the references keep one edge.
    const x = rtl ? right - width : left;
    return { text: copy.cta, size: ctaSize, padX, padY, arrow, box: { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) } };
  };
  const ctaHeight = ctaBox(0)?.box.height ?? 0;

  const lineBoxesOf = (out: OutlinedText, y: number, size: number): Px[] => out.lines.map((line, i) => {
    const lineH = size * 1.18, ascent = out.lines[0].baseline - y;
    const x = rtl ? right - line.width : left;
    return { x: Math.round(x), y: Math.round(line.baseline - ascent), width: Math.round(line.width), height: Math.round(i === out.lines.length - 1 ? out.height - i * lineH : lineH) };
  });
  // Where the text group starts and the most it may reach.
  const textTop = arrangement === 'text-top' ? Math.max(logoBottom + 1.5 * u, P.headlineTop * H) : P.pictureTopEnd * H + 2 * u;
  const textLimit = arrangement === 'text-top' ? P.textTopEnd * H : P.ctaBottom * H - (ctaHeight ? ctaHeight + 2 * u : 0);

  let size = (P.linePitch * W) / 1.18;
  let head = outlineText({ text: headText, x: left, y: textTop, width: colW, maxLines: 4, preserveNewlines: Boolean(fixed), style: style(size, 800, 1.18) });
  let sub: StoryLayout['sub'];
  for (let i = 0; i < 50; i++) {
    head = outlineText({ text: headText, x: left, y: textTop, width: colW, maxLines: 4, preserveNewlines: Boolean(fixed), style: style(size, 800, 1.18) });
    const subY = textTop + head.height + 0.025 * H;
    const out = bodyText ? outlineText({ text: bodyText, x: left, y: subY, width: colW, maxLines: 4, preserveNewlines: true, style: style(bodySize, 700, 1.5) }) : null;
    sub = out ? { text: bodyText, size: bodySize, box: { x: left, y: Math.round(subY), width: colW, height: Math.round(out.height) } } : undefined;
    const bottom = sub ? sub.box.y + sub.box.height : textTop + head.height;
    const broke = fixed ? head.lines.length > fixed.length : false;
    if (!head.overflow && !broke && bottom <= textLimit) break;
    if (size * 1.18 <= P.minLinePitch * W) {
      // The preferred breaks cannot be kept at any size: let the headline wrap freely and try again.
      if (fixed) { fixed = undefined; headText = copy.headline; size = (P.linePitch * W) / 1.18; continue; }
      problems.push('Story layout: the copy is too long for a story at this size; shorten the headline or the facts.');
      break;
    }
    size *= 0.96;
  }
  const headBox = { x: left, y: Math.round(textTop), width: colW, height: Math.round(head.height) };
  const textBottom = sub ? sub.box.y + sub.box.height : headBox.y + headBox.height;
  // The button: at the bottom of the picture (text-top), or right under the body (picture-top).
  cta = ctaBox(arrangement === 'text-top' ? P.ctaBottom * H - ctaHeight : textBottom + 2 * u);
  const subject = arrangement === 'text-top'
    ? { x: 0, y: Math.round(textBottom + 0.03 * H), width: W, height: Math.round(Math.max(0, footer.y - 0.015 * H - (textBottom + 0.03 * H))) }
    : { x: 0, y: Math.round(logoBottom + 0.015 * H), width: W, height: Math.round(Math.max(0, P.pictureTopEnd * H - (logoBottom + 0.015 * H))) };
  return {
    arrangement, align: 'start', logo: logoBox, logoSafe,
    headline: { text: headText, lines: head.lines.length, size, box: headBox, preserveNewlines: Boolean(fixed), lineBoxes: lineBoxesOf(head, textTop, size) },
    emphasis, sub, facts: [], cta, footer, subject,
    column: { left, right },
    problems,
  };
}

/** The story layout as the normalized text zones the image prompt keeps calm. */
export function storyZones(layout: StoryLayout, W: number, H: number): TypesetPlan & { subjectZone: NormZone } {
  const n = (b: Px): NormZone => ({ x: b.x / W, y: b.y / H, width: b.width / W, height: b.height / H });
  const union = (boxes: Px[]): Px | undefined => boxes.length ? { x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)), width: Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x)), height: Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y)) } : undefined;
  const facts = union(layout.facts.map((f) => f.box));
  return {
    headlineZone: n(layout.headline.box), supportingCopyZone: layout.sub ? n(layout.sub.box) : undefined,
    factsZone: facts ? n(facts) : undefined, ctaZone: layout.cta ? n(layout.cta.box) : undefined,
    subjectZone: n(layout.subject), alignment: layout.align === 'center' ? 'center' : 'right',
  };
}

/** Sets the copy in the house story layout and returns the same result shape as the column typesetter. */
async function typesetStory(input: TypesetInput, W: number, H: number): Promise<TypesetResult> {
  const { copy } = input;
  const rtl = paragraphDirection(copy.headline) === 'rtl';
  const layout = storyLayout(copy, W, H, input.safeArea, input.logo, { headlineLines: input.plan.headlineLines, emphasis: input.emphasis, arrangement: input.arrangement });
  const lineAlign = layout.align;
  const problems = [...layout.problems];
  const topBottom = layout.sub ? layout.sub.box.y + layout.sub.box.height : layout.headline.box.y + layout.headline.box.height;
  // Readability from the real pixels under the headline group: dark text on a light picture, and a soft
  // fade from the top only when the picture there is busy or a mid-tone that suits neither colour.
  const group = { x: 0, y: layout.headline.box.y, width: W, height: topBottom - layout.headline.box.y };
  const tone = await regionTone(input.image, group);
  const darkText = tone.luminance > 0.62;
  const textColor = darkText ? DARK_TEXT : LIGHT_TEXT;
  const midTone = 1 - Math.abs(tone.luminance - 0.5) * 2;
  const needsFade = tone.texture > 0.09 || (!darkText && tone.luminance > 0.42);
  const fade = needsFade ? clamp(0.2 + tone.texture * 1.6 + midTone * 0.3, 0.25, 0.7) : 0;
  const shade = darkText ? '255,255,255' : '5,12,32';
  const decor: string[] = [], body: string[] = [], blocks: TypesetBlock[] = [], zones: ContentZone[] = [];
  const defs: string[] = [];
  if (fade) {
    defs.push(`<linearGradient id="ts-scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(${shade})" stop-opacity="${r(fade)}"/><stop offset="0.7" stop-color="rgb(${shade})" stop-opacity="${r(fade * 0.55)}"/><stop offset="1" stop-color="rgb(${shade})" stop-opacity="0"/></linearGradient>`);
    decor.push(`<rect x="0" y="0" width="${W}" height="${r(Math.min(H, topBottom + 0.07 * H))}" fill="url(#ts-scrim)"/>`);
  }
  const shadow = darkText ? '' : ' filter="url(#ts-shadow)"';
  const st = (size: number, weight: number, lineHeight: number, color: string) => ({ family: 'brand' as const, weight, size, color, lineHeight });

  // Headline, line by line, so the emphasis phrase can sit on its green bar in its own colour.
  const h = layout.headline;
  // House look: on the light engineering-paper world the headline is royal blue; on the blue world, white.
  const headColor = darkText ? ROYAL_BLUE : LIGHT_TEXT;
  const set = headlineMarkup({ text: h.text, preserveNewlines: h.preserveNewlines, box: h.box, size: h.size, align: lineAlign, rtl, color: headColor, shadow, emphasis: layout.emphasis });
  decor.push(...set.decor); body.push(...set.body);
  if (set.missing.length) problems.push(`Typeset headline: the brand font has no glyph for ${set.missing.join(' ')}`);
  blocks.push({ role: 'headline', text: copy.headline, box: h.box, size: r(h.size), weight: 800, color: headColor });

  if (layout.sub) {
    const out = outlineText({ text: layout.sub.text, x: layout.sub.box.x, y: layout.sub.box.y, width: layout.sub.box.width, maxLines: 4, preserveNewlines: true, align: lineAlign, direction: rtl ? 'rtl' : 'auto', style: st(layout.sub.size, 700, 1.5, textColor) });
    body.push(out.svg.replace('<path', `<path${shadow} fill-opacity="0.9"`));
    blocks.push({ role: 'subheadline', text: layout.sub.text, box: layout.sub.box, size: r(layout.sub.size), weight: 700, color: textColor });
  }
  const chipFill = darkText ? 'rgba(255,255,255,0.78)' : 'rgba(8,16,40,0.5)';
  const chipStroke = darkText ? 'rgba(11,21,48,0.12)' : 'rgba(255,255,255,0.24)';
  for (const f of layout.facts) {
    const chipText = darkText ? DARK_TEXT : LIGHT_TEXT;
    decor.push(`<rect x="${f.box.x}" y="${f.box.y}" width="${f.box.width}" height="${f.box.height}" rx="${r(f.box.height / 2)}" fill="${chipFill}" stroke="${chipStroke}" stroke-width="1.5"/>`);
    body.push(outlineText({ text: f.text, x: f.box.x + f.padX, y: f.box.y + f.padY, width: f.box.width - f.padX * 2 + 1, maxLines: 2, align: 'center', direction: rtl ? 'rtl' : 'auto', style: st(f.size, 700, 1.3, chipText) }).svg);
    blocks.push({ role: 'fact', text: f.text, box: f.box, size: r(f.size), weight: 700, color: chipText });
  }
  if (layout.cta) {
    const c = layout.cta;
    decor.push(`<rect x="${c.box.x}" y="${c.box.y}" width="${c.box.width}" height="${c.box.height}" rx="${r(c.box.height / 2)}" fill="${ORANGE}" filter="url(#ts-lift)"/>`);
    const lineW = measureText(c.text, st(c.size, 800, 1.2, '#fff'));
    const textX = rtl ? c.box.x + c.box.width - c.padX - lineW : c.box.x + c.padX;
    body.push(outlineText({ text: c.text, x: textX, y: c.box.y + c.padY, width: lineW + 1, maxLines: 1, direction: rtl ? 'rtl' : 'ltr', style: st(c.size, 800, 1.2, '#FFFFFF') }).svg);
    body.push(chevron(rtl ? c.box.x + c.padX * 0.6 + c.arrow * 0.35 : c.box.x + c.box.width - c.padX * 0.6 - c.arrow * 0.35, c.box.y + c.box.height / 2, c.size * 0.55, '#FFFFFF', rtl));
    blocks.push({ role: 'cta', text: c.text, box: c.box, size: r(c.size), weight: 800, color: '#FFFFFF' });
  }
  // The headline counts line by line: its box spans the column, and the logo sits beside its shorter first line.
  // Footer: the website at the left margin with a thin rule across to the other margin, as on the house posts.
  const f = layout.footer;
  const footColor = darkText ? 'rgba(11,21,48,0.7)' : 'rgba(255,255,255,0.82)';
  body.push(outlineText({ text: f.text, x: f.x, y: f.y, width: f.width + 2, maxLines: 1, direction: 'ltr', style: st(f.size, 700, 1.2, footColor) }).svg);
  decor.push(`<rect x="${r(f.x + f.width + W / 45)}" y="${r(f.y + f.size * 0.62)}" width="${r(Math.max(0, layout.column.right - (f.x + f.width + W / 45)))}" height="${r(Math.max(2, W * 0.002))}" fill="${footColor}"/>`);
  zones.push({ kind: 'text', label: f.text, box: { x: f.x, y: f.y, width: f.width, height: Math.round(f.size * 1.3) } });
  for (const b of blocks) {
    if (b.role === 'headline') h.lineBoxes.forEach((box, i) => zones.push({ kind: 'text', label: `${b.text.slice(0, 30)} · line ${i + 1}`, box }));
    else zones.push({ kind: b.role === 'cta' ? 'cta' : 'text', label: b.text.slice(0, 40), box: b.box });
  }

  const unit = W;
  const { def: shadeDef, rect: shadeRect } = input.logoShade ? await logoShade(input, W, H, layout.logo) : { def: '', rect: '' };
  if (shadeRect) decor.unshift(shadeRect);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join('')}${shadeDef}<filter id="ts-shadow" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="${r(unit * 0.003)}" stdDeviation="${r(unit * 0.006)}" flood-color="#000" flood-opacity="0.35"/></filter><filter id="ts-lift" x="-20%" y="-40%" width="140%" height="200%"><feDropShadow dx="0" dy="${r(unit * 0.006)}" stdDeviation="${r(unit * 0.01)}" flood-color="#7a2a00" flood-opacity="0.35"/></filter></defs>${decor.join('')}${body.join('')}</svg>`;
  const png = await sharp(input.image).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  const col = { x: layout.column.left, y: h.box.y, width: layout.column.right - layout.column.left, height: Math.round((layout.cta ? layout.cta.box.y + layout.cta.box.height : topBottom) - h.box.y) };
  return { png, zones, layout: { version: TYPESET_VERSION, placement: 'planned', column: col, anchor: 'top', align: 'start', tone: darkText ? 'dark-text' : 'light-text', scrim: r(fade), blocks }, problems, logoHint: { safeArea: layout.logoSafe, lockupWidths: [STORY_PROPORTIONS.logoShare] } };
}

/**
 * A headline set line by line in the house style: the emphasis phrase on its flat green bar in dark blue, the rest
 * in the headline colour. Arabic lines only (Latin words reorder inside Arabic text, so such a line is set whole).
 */
function headlineMarkup(p: { text: string; preserveNewlines: boolean; box: Px; size: number; align: 'start' | 'center'; rtl: boolean; color: string; shadow: string; emphasis?: string; maxLines?: number }): { decor: string[]; body: string[]; missing: string[] } {
  const st = (color: string) => ({ family: 'brand' as const, weight: 800, size: p.size, color, lineHeight: 1.18 });
  const head = outlineText({ text: p.text, x: p.box.x, y: p.box.y, width: p.box.width, maxLines: p.maxLines ?? 3, align: p.align, preserveNewlines: p.preserveNewlines, direction: p.rtl ? 'rtl' : 'ltr', style: st(p.color) });
  const lineStyle = st(p.color);
  const space = Math.max(1, measureText('ا ا', lineStyle, 'rtl') - 2 * measureText('ا', lineStyle, 'rtl'));
  // outlineText takes the top of a line; its baseline sits one ascent lower.
  const ascent = head.lines.length ? head.lines[0].baseline - p.box.y : p.size;
  const decor: string[] = [], body: string[] = [];
  let highlighted = false;
  for (const line of head.lines) {
    const at = p.emphasis && !highlighted && p.rtl && !HAS_LATIN.test(line.text) ? line.text.indexOf(p.emphasis) : -1;
    const right = p.box.x + p.box.width;
    if (at < 0) {
      body.push(outlineText({ text: line.text, x: p.box.x, y: line.baseline - ascent, width: p.box.width, maxLines: 1, align: p.align, direction: p.rtl ? 'rtl' : 'ltr', style: lineStyle }).svg.replace('<path', `<path${p.shadow}`));
      continue;
    }
    highlighted = true;
    const prefix = line.text.slice(0, at).trim(), word = p.emphasis!, suffix = line.text.slice(at + word.length).trim();
    const pw = prefix ? measureText(prefix, lineStyle, 'rtl') : 0, ew = measureText(word, lineStyle, 'rtl'), sw = suffix ? measureText(suffix, lineStyle, 'rtl') : 0;
    const lineW = pw + ew + sw + (prefix ? space : 0) + (suffix ? space : 0);
    const lineRight = p.align === 'center' ? p.box.x + (p.box.width + lineW) / 2 : p.rtl ? right : p.box.x + lineW;
    const emRight = lineRight - (prefix ? pw + space : 0), emLeft = emRight - ew;
    const pad = p.size * 0.16;
    decor.push(`<rect x="${r(emLeft - pad)}" y="${r(line.baseline - p.size * 0.98)}" width="${r(ew + pad * 2)}" height="${r(p.size * 1.28)}" rx="${r(p.size * 0.08)}" fill="${GREEN}"/>`);
    const seg = (text: string, xRight: number, width: number, color: string, withShadow: boolean) =>
      outlineText({ text, x: xRight - width - 1, y: line.baseline - ascent, width: width + 2, maxLines: 1, direction: 'rtl', style: st(color) }).svg.replace('<path', withShadow ? `<path${p.shadow}` : '<path');
    if (prefix) body.push(seg(prefix, lineRight, pw, p.color, true));
    body.push(seg(word, emRight, ew, ON_GREEN, false));
    if (suffix) body.push(seg(suffix, emLeft - space, sw, p.color, true));
  }
  return { decor, body, missing: head.missingGlyphs };
}
