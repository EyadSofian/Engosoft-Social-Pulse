/**
 * Lays out an Engosoft brand template for one canvas and returns the SVG. Every size is composed for its own
 * shape (a tall story, a 4:5 post, a square, a wide banner): nothing is stretched or cropped from another size.
 * The text is set in the brand fonts and measured, so it always fits; the logo is the official file, chosen for
 * the surface it sits on (blue artwork on light, white artwork on blue or photos), at the same place and size.
 *
 * Proportions are measured from the brand-pack posts at 1080×1350 (brand/guidelines-2026-11/posts).
 */
import { BRAND_CONTACT, isRtlText, type BrandSurface, type BrandTemplate } from '../../domain/brand-templates';

export interface LayoutCanvas { width: number; height: number; safe?: { top: number; right: number; bottom: number; left: number } }
/** Width of a string in a CSS font ("800 96px Almarai"), measured with the real fonts. */
export type Measure = (text: string, font: string) => number;
export interface LayoutInput {
  template: BrandTemplate;
  values: Record<string, string>;
  surface: BrandSurface;
  canvas: LayoutCanvas;
  measure: Measure;
  /** Photo inputs whose picture has a transparent background (stand free instead of framed). */
  cutouts?: Record<string, boolean>;
}

const C = {
  blue: '#0046FF', deep: '#001BB7', navy: '#0A1F8F', orange: '#FF6600', ink: '#1A1A1A', grey: '#404040',
  light: '#F1F4F9', sky: '#D5EDFF', mist: '#E5F0FF', pale: '#B3DDFF', mid: '#56A1FF', bright: '#2F7CFF', white: '#FFFFFF',
};
const LOGO = {
  horizontal: { positive: '/brand/logos/engosoft-horizontal-positive.svg', reversed: '/brand/logos/engosoft-horizontal-reversed.svg', ratio: 266.21 / 68.52 },
  symbol: { positive: '/brand/logos/engosoft-symbol-positive.svg', reversed: '/brand/logos/engosoft-symbol-reversed.svg', ratio: 19.164 / 25.871 },
  /**
   * The older «ENGO | SOFT» lockup the campaign posts use, white on transparent. Cut from the 50/50 campaign post
   * at its size there (214 px wide on 1080), so it is drawn at about that size to stay sharp.
   */
  old: { reversed: '/brand/logos/engosoft-old-lockup-reversed.png', ratio: 214 / 76, width: 214 },
};

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (value: number) => Math.round(value * 10) / 10;

type Family = 'Almarai' | 'Plus Jakarta Sans';
interface TextStyle { weight: number; color: string; rtl: boolean; family: Family; spacing?: number; upper?: boolean }
interface Fitted { lines: string[]; size: number; lineHeight: number; height: number; width: number }

/** The layout context for one canvas: scale, margins, the measured text tools and the SVG being built. */
let layouts = 0;
class Ctx {
  /** Ids stay unique when several designs are shown inline on one page. */
  prefix = `bt${(++layouts).toString(36)}`;
  W: number; H: number; s: number; m: number; safe: Required<LayoutCanvas>['safe'];
  ratio: number; story: boolean; defs: string[] = []; body: string[] = []; ids = 0;
  constructor(public input: LayoutInput) {
    const { width, height, safe } = input.canvas;
    this.W = width; this.H = height; this.ratio = width / height;
    this.safe = safe ?? { top: 0, right: 0, bottom: 0, left: 0 };
    // One unit is a pixel of the 1080×1350 reference; wide canvases are measured from their height.
    this.s = Math.min(width / 1080, height / (this.ratio > 1.15 ? 900 : 1350));
    this.story = height / width > 1.6;
    this.m = Math.max(Math.round(48 * this.s), Math.round(width * 0.045));
  }
  id(prefix: string) { return `${this.prefix}${prefix}${++this.ids}`; }
  value(key: string) { return (this.input.values[key] ?? '').trim(); }
  rtlOf(text: string) { return isRtlText(text); }
  style(text: string, weight: number, color: string, extra: Partial<TextStyle> = {}): TextStyle {
    const rtl = this.rtlOf(text);
    return { weight, color, rtl, family: rtl ? 'Almarai' : 'Plus Jakarta Sans', ...extra };
  }
  font(style: TextStyle, size: number) { return `${style.family === 'Almarai' ? Math.min(800, Math.max(400, Math.round(style.weight / 100) * 100)) : style.weight} ${n(size)}px ${style.family === 'Almarai' ? 'Almarai' : '"Plus Jakarta Sans"'}`; }
  width(text: string, style: TextStyle, size: number) {
    const shown = style.upper ? text.toUpperCase() : text;
    return this.input.measure(shown, this.font(style, size)) + (style.spacing ? style.spacing * size * Math.max(0, [...shown].length - 1) : 0);
  }
  /** Greedy line breaking at a size; explicit line breaks are kept. */
  wrap(text: string, style: TextStyle, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split(/\n/)) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && this.width(next, style, size) > maxWidth) { lines.push(line); line = word; } else line = next;
      }
      if (line) lines.push(line);
    }
    return lines;
  }
  /** The largest size (≤ max) at which the text fits the width in at most maxLines lines. */
  fit(text: string, style: TextStyle, opts: { maxWidth: number; maxLines: number; max: number; min?: number; leading?: number; maxHeight?: number }): Fitted {
    const leading = opts.leading ?? (style.rtl ? 1.35 : 1.12);
    const min = opts.min ?? Math.max(10, opts.max * 0.35);
    let size = opts.max;
    for (;;) {
      const lines = this.wrap(text, style, size, opts.maxWidth);
      const widest = Math.max(0, ...lines.map((line) => this.width(line, style, size)));
      const height = lines.length ? size * (1 + (lines.length - 1) * leading) : 0;
      const fits = lines.length <= opts.maxLines && widest <= opts.maxWidth + 0.5 && (!opts.maxHeight || height <= opts.maxHeight);
      if (fits || size <= min) {
        const kept = lines.length > opts.maxLines ? [...lines.slice(0, opts.maxLines - 1), lines.slice(opts.maxLines - 1).join(' ')] : lines;
        return { lines: kept, size, lineHeight: size * leading, height: kept.length ? size * (1 + (kept.length - 1) * leading) : 0, width: widest };
      }
      size = Math.max(min, size * 0.94);
    }
  }
  /**
   * Draws fitted lines. `top` is the top of the first line's capitals (the box the layout planned); `x` is the left
   * edge, or the right edge for right-to-left text, or the centre when centred.
   */
  text(fitted: Fitted, style: TextStyle, x: number, top: number, align: 'start' | 'center' = 'start') {
    const anchor = align === 'center' ? 'middle' : 'start';
    const spacing = style.spacing ? ` letter-spacing="${n(style.spacing * fitted.size)}"` : '';
    fitted.lines.forEach((line, i) => {
      const baseline = top + fitted.size * 0.8 + i * fitted.lineHeight;
      const shown = style.upper ? line.toUpperCase() : line;
      // A Latin-only line (a phone number, a URL) inside right-aligned Arabic keeps its own order, aligned right.
      const latinInRtl = style.rtl && !isRtlText(line);
      const dir = style.rtl && !latinInRtl ? ' direction="rtl"' : '';
      const a = latinInRtl && anchor === 'start' ? 'end' : anchor;
      this.body.push(`<text x="${n(x)}" y="${n(baseline)}" font-family="${style.family}" font-weight="${style.weight}" font-size="${n(fitted.size)}" fill="${style.color}"${dir} text-anchor="${a}"${spacing}>${esc(shown)}</text>`);
    });
  }
  /** x for a text block in a column: its left edge (LTR) or right edge (RTL). */
  edge(style: TextStyle, x0: number, x1: number) { return style.rtl ? x1 : x0; }
  image(href: string, x: number, y: number, w: number, h: number, fit: string, clip?: string) {
    if (!href) return;
    this.body.push(`<image href="${esc(href)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="${fit}"${clip ? ` clip-path="url(#${clip})"` : ''}/>`);
  }
  svg(background: string) {
    // direction="ltr" on the root: an inline preview sits in a right-to-left page and would inherit it, which
    // anchors every text without its own direction from the wrong side (the price over its currency, the website
    // off the left edge). Exported PNGs render standalone and already default to left-to-right.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}" direction="ltr"><defs>${this.defs.join('')}</defs>${background}${this.body.join('')}</svg>`;
  }
}

/* ---------- Shared brand elements ---------- */

/** Light page with soft white bands, or brand blue with lighter waves, as in the pack. */
function background(c: Ctx, surface: BrandSurface, kind: 'waves' | 'plain' | 'sky' = 'waves'): string {
  const { W, H } = c;
  if (kind === 'sky') {
    const g = c.id('sky');
    c.defs.push(`<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEF5FF"/><stop offset="0.45" stop-color="#CFE3FF"/><stop offset="0.78" stop-color="${C.mid}"/><stop offset="1" stop-color="${C.blue}"/></linearGradient>`);
    return `<rect width="${W}" height="${H}" fill="url(#${g})"/>`;
  }
  const base = surface === 'blue' ? C.blue : C.light;
  if (kind === 'plain') return `<rect width="${W}" height="${H}" fill="${base}"/>`;
  const g = c.id('wave');
  const [a, b] = surface === 'blue' ? [C.bright, C.deep] : ['#FFFFFF', '#DCE6F5'];
  c.defs.push(`<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}" stop-opacity="${surface === 'blue' ? 0.55 : 0.9}"/><stop offset="1" stop-color="${b}" stop-opacity="${surface === 'blue' ? 0.35 : 0.5}"/></linearGradient>`);
  const bands = [0.18, 0.46, 0.74, 1.02].map((f) => {
    const x = W * f, w = Math.max(W, H) * 0.16;
    return `<path d="M ${n(x)} ${-H * 0.1} C ${n(x + w * 1.6)} ${n(H * 0.3)}, ${n(x - w * 1.2)} ${n(H * 0.7)}, ${n(x + w * 0.6)} ${n(H * 1.1)} L ${n(x + w * 1.6)} ${n(H * 1.1)} C ${n(x + w * 0.2)} ${n(H * 0.7)}, ${n(x + w * 2.6)} ${n(H * 0.3)}, ${n(x + w)} ${-H * 0.1} Z" fill="url(#${g})" opacity="0.55"/>`;
  }).join('');
  return `<rect width="${W}" height="${H}" fill="${base}"/>${bands}`;
}

/** The horizontal lockup at the top: left, or centred when the template centres its content. */
function logo(c: Ctx, onDark: boolean, align: 'left' | 'center' = 'left'): { bottom: number } {
  const width = Math.round((c.story ? 0.25 : c.ratio > 2.2 ? 0.16 : c.ratio > 1.15 ? 0.2 : 0.25) * (c.ratio > 1.15 ? Math.min(c.W, c.H * 1.4) : c.W));
  const height = width / LOGO.horizontal.ratio;
  const top = c.story ? Math.max(Math.round(c.H * 0.06), c.safe.top * 0.4) : Math.max(c.m * 0.85, c.safe.top + c.m * 0.5);
  const x = align === 'center' ? (c.W - width) / 2 : Math.max(c.m, c.safe.left + c.m * 0.5);
  c.image(onDark ? LOGO.horizontal.reversed : LOGO.horizontal.positive, x, top, width, height, 'xMidYMid meet');
  return { bottom: top + height };
}

/** The symbol alone (for templates whose top is a photo or a big word). */
function symbol(c: Ctx, onDark: boolean, cx: number, top: number, height: number) {
  const width = height * LOGO.symbol.ratio;
  c.image(onDark ? LOGO.symbol.reversed : LOGO.symbol.positive, cx - width / 2, top, width, height, 'xMidYMid meet');
}

/** Bottom band: the website on the left and the signature motif on the right. Returns the band's top. */
function footer(c: Ctx, onDark: boolean, opts: { motif?: 'right' | 'center' | 'none'; website?: boolean; light?: boolean } = {}): number {
  const size = Math.max(14, 27 * c.s);
  const bottomInset = c.story ? c.H * 0.075 : Math.max(c.m * 0.95, c.safe.bottom + c.m * 0.5);
  const baseline = c.H - bottomInset;
  if (opts.website !== false) c.body.push(`<text x="${n(Math.max(c.m, c.safe.left + c.m * 0.5))}" y="${n(baseline)}" font-family="Plus Jakarta Sans" font-weight="500" font-size="${n(size)}" fill="${onDark ? C.white : C.deep}">${BRAND_CONTACT.website}</text>`);
  const unit = 26 * c.s; // stroke thickness
  const strokes = onDark ? (opts.light ? C.pale : C.bright) : C.deep;
  const total = unit * 12.6;
  const right = opts.motif === 'center' ? (c.W + total) / 2 : c.W - Math.max(c.m * 0.9, c.safe.right + c.m * 0.4);
  const cy = baseline - size * 0.35;
  const pill = (x: number, len: number) => `<rect x="${n(x)}" y="${n(cy - unit / 2)}" width="${n(len)}" height="${n(unit)}" rx="${n(unit / 2)}" fill="${strokes}" transform="rotate(-18.43 ${n(x + len / 2)} ${n(cy)})"/>`;
  const x0 = right - total;
  if (opts.motif !== 'none') c.body.push(pill(x0, unit * 1.9), `<circle cx="${n(x0 + unit * 2.55)}" cy="${n(cy - unit * 0.95)}" r="${n(unit * 0.5)}" fill="${C.orange}"/>`, pill(x0 + unit * 3.6, unit * 3.6), pill(x0 + unit * 8.6, unit * 3.6));
  return baseline - Math.max(size, unit * 2.2) - c.m * 0.5;
}

/** Faint tilted dashes across the lower part of the canvas (generic post). */
function dashes(c: Ctx, top: number, onDark: boolean) {
  const unit = 30 * c.s, rows = Math.max(2, Math.floor((c.H - top) / (unit * 2.4)));
  const fill = onDark ? C.bright : '#DCE7FA';
  for (let r = 0; r < rows; r++) {
    for (let x = -unit * 2 + (r % 2) * unit * 2.3; x < c.W + unit * 3; x += unit * 4.6) {
      const y = top + r * unit * 2.4, len = unit * (2.2 + ((r * 7 + Math.round(x / unit)) % 3) * 0.9);
      c.body.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(len)}" height="${n(unit)}" rx="${n(unit / 2)}" fill="${fill}" opacity="${onDark ? 0.45 : 0.85}" transform="rotate(-18.43 ${n(x + len / 2)} ${n(y + unit / 2)})"/>`);
    }
  }
}

/**
 * The wavy photo frame of the pack: a slanted rounded panel whose right side (and lower left side) is scalloped.
 * Returns the clip id.
 */
function wavyFrame(c: Ctx, x: number, y: number, w: number, h: number): string {
  const id = c.id('frame');
  const d = h * 0.12, r = Math.min(w, h) * 0.12, bump = 4;
  const seg = (h - d - 2 * r) / bump, R = seg * 0.56, sag = R - Math.sqrt(R * R - (seg / 2) ** 2);
  const leftSeg = (h - d - 2 * r) * 0.55 / 3, lR = leftSeg * 0.56, lSag = lR - Math.sqrt(lR * lR - (leftSeg / 2) ** 2);
  // The scallops bulge out to the edge of the box, so the photo (which fills the box) shows them.
  const xl = x + lSag, xr = x + w - sag, iw = xr - xl;
  const top = (t: number) => [xl + t * iw, y + d * (1 - t)] as const;
  const bot = (t: number) => [xl + t * iw, y + h - d * t] as const;
  const parts = [`M ${n(xl)} ${n(y + d + r)}`, `Q ${n(xl)} ${n(y + d)} ${top(r / iw).map(n).join(' ')}`, `L ${top(1 - r / iw).map(n).join(' ')}`, `Q ${n(xr)} ${n(y)} ${n(xr)} ${n(y + r)}`];
  for (let i = 1; i <= bump; i++) parts.push(`A ${n(R)} ${n(R)} 0 0 1 ${n(xr)} ${n(y + r + seg * i)}`);
  parts.push(`Q ${n(xr)} ${n(y + h - d)} ${bot(1 - r / iw).map(n).join(' ')}`, `L ${bot(r / iw).map(n).join(' ')}`, `Q ${n(xl)} ${n(y + h)} ${n(xl)} ${n(y + h - r)}`);
  for (let i = 1; i <= 3; i++) parts.push(`A ${n(lR)} ${n(lR)} 0 0 1 ${n(xl)} ${n(y + h - r - leftSeg * i)}`);
  parts.push('Z');
  c.defs.push(`<clipPath id="${id}"><path d="${parts.join(' ')}"/></clipPath>`);
  return id;
}

function roundedClip(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const id = c.id('round');
  c.defs.push(`<clipPath id="${id}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}"/></clipPath>`);
  return id;
}

/** A coloured bar behind a short label, as in the pack ("WHAT DRIVES THE COMPANY", the credential bar). */
function labelBar(c: Ctx, text: string, fill: string, color: string, x0: number, x1: number, top: number, maxSize: number, align: 'start' | 'center' = 'start') {
  const style = c.style(text, 600, color, { upper: !c.rtlOf(text) && align === 'start' });
  const padX = maxSize * 0.45, padY = maxSize * 0.28;
  const f = c.fit(text, style, { maxWidth: x1 - x0 - padX * 2, maxLines: 1, max: maxSize, min: maxSize * 0.55 });
  const w = f.width + padX * 2, h = f.size + padY * 2;
  const bx = align === 'center' ? (x0 + x1 - w) / 2 : style.rtl ? x1 - w : x0;
  c.body.push(`<rect x="${n(bx)}" y="${n(top)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`);
  c.text(f, style, align === 'center' ? (x0 + x1) / 2 : style.rtl ? bx + w - padX : bx + padX, top + padY + f.size * 0.04, align);
  return top + h;
}

/* ---------- Templates ---------- */

type Builder = (c: Ctx, surface: BrandSurface) => string;

/** 01–02 · Big headline: eyebrow and paragraph, then the giant headline, dashes and the footer. */
const headline: Builder = (c, surface) => {
  const dark = surface === 'blue';
  const bg = background(c, surface, 'plain');
  const wide = c.ratio > 1.15;
  // The pack frames the logo in a band of the other surface across the top.
  const bandH = wide ? c.H * 0.2 : c.story ? c.H * 0.13 : c.H * 0.135;
  c.body.push(`<rect width="${c.W}" height="${n(bandH)}" fill="${dark ? C.white : C.blue}"/>`);
  const logoBottom = logo(c, !dark).bottom;
  void logoBottom;
  // The pack's generic post has the dashes instead of the motif; they go under the footer text.
  if (!wide) dashes(c, c.H * (c.story ? 0.8 : 0.78), dark);
  const foot = footer(c, dark, { motif: wide ? 'right' : 'none' });
  const x0 = Math.max(c.m, c.safe.left + c.m * 0.3), x1 = c.W - Math.max(c.m, c.safe.right + c.m * 0.3);
  const ink = dark ? C.white : C.navy;
  const head = c.value('headline'), eyebrow = c.value('eyebrow'), para = c.value('body');
  const hs = c.style(head, 800, dark ? C.white : C.deep);
  if (wide) {
    // Headline on one side, eyebrow and paragraph on the other, under the band.
    const top = bandH + c.m * 0.9, bottom = foot - c.m * 0.2;
    const mid = c.W * 0.56;
    const hx0 = hs.rtl ? mid + c.m * 0.5 : x0, hx1 = hs.rtl ? x1 : mid - c.m * 0.5;
    const hf = c.fit(head, hs, { maxWidth: hx1 - hx0, maxLines: 3, max: 150 * c.s, maxHeight: bottom - top });
    c.text(hf, hs, c.edge(hs, hx0, hx1), top + (bottom - top - hf.height) / 2);
    const ox0 = hs.rtl ? x0 : mid + c.m * 0.5, ox1 = hs.rtl ? mid - c.m * 0.5 : x1;
    const es = c.style(eyebrow, 500, dark ? C.white : C.blue), ef = c.fit(eyebrow, es, { maxWidth: ox1 - ox0, maxLines: 1, max: 34 * c.s });
    const bs = c.style(para, 400, ink), bf = c.fit(para, bs, { maxWidth: ox1 - ox0, maxLines: 4, max: 30 * c.s, leading: bs.rtl ? 1.5 : 1.35 });
    const total = (eyebrow ? ef.height + c.m * 0.4 : 0) + bf.height;
    let y = top + (bottom - top - total) / 2;
    if (eyebrow) { c.text(ef, es, c.edge(es, ox0, ox1), y); y += ef.height + c.m * 0.4; }
    c.text(bf, bs, c.edge(bs, ox0, ox1), y);
    return c.svg(bg);
  }
  // The headline ends just above the dashes (about 74% of the height, as in the pack).
  const bottom = Math.min(foot - c.m * 0.3, c.H * (c.story ? 0.76 : 0.745));
  const k = c.story ? 1.25 : 1;
  const hf = c.fit(head, hs, { maxWidth: x1 - x0, maxLines: 3, max: (c.story ? 170 : 150) * c.s, maxHeight: (bottom - bandH) * 0.55, leading: hs.rtl ? 1.25 : 1.02 });
  const hTop = bottom - hf.height;
  c.text(hf, hs, c.edge(hs, x0, x1), hTop);
  const bs = c.style(para, 400, ink), bf = c.fit(para, bs, { maxWidth: (x1 - x0) * 0.92, maxLines: 4, max: (bs.rtl ? 33 : 30) * c.s * k, leading: bs.rtl ? 1.55 : 1.35 });
  const es = c.style(eyebrow, 500, dark ? C.white : C.blue), ef = c.fit(eyebrow, es, { maxWidth: x1 - x0, maxLines: 1, max: 34 * c.s * k });
  const block = (eyebrow ? ef.height + c.m * 0.55 : 0) + bf.height;
  const room = hTop - bandH;
  let y = bandH + Math.max(c.m, (room - block) * (c.story ? 0.55 : 0.45));
  // The eyebrow sits at the far edge (right in English, as in the pack; left in Arabic).
  if (eyebrow) { c.text(ef, { ...es, rtl: es.rtl }, es.rtl ? x0 + ef.width : x1 - ef.width, y); y += ef.height + c.m * 0.55; }
  c.text(bf, bs, c.edge(bs, x0, x1), y);
  return c.svg(bg);
};

/** 03–04 · Webinar or course with instructor. */
const instructor: Builder = (c, surface) => {
  const dark = surface === 'blue';
  const bg = background(c, surface, 'plain');
  const wide = c.ratio > 1.15;
  const foot = footer(c, dark);
  const title = c.value('title'), tag = c.value('tag'), name = c.value('instructorName'), cred = c.value('credential'), para = c.value('body');
  const details = [c.value('date'), c.value('time'), c.value('place')].filter(Boolean).join('  •  ');
  const photo = c.value('instructorPhoto');
  const ts = c.style(title, 800, dark ? C.white : C.blue);
  const tg = c.style(tag, 500, C.orange, { spacing: c.rtlOf(tag) ? 0 : 0.62, upper: true });
  const ns = c.style(name, 700, dark ? C.white : C.blue);
  const ds = c.style(details, 600, dark ? C.white : C.deep);
  const bs = c.style(para, 400, dark ? '#E5ECFF' : C.grey);
  if (wide) {
    logo(c, dark);
    const top = c.H * 0.2, bottom = foot - c.m * 0.2;
    const split = c.W * 0.5;
    const rtl = ts.rtl;
    const px0 = rtl ? c.m * 1.2 : split + c.m * 0.4, px1 = rtl ? split - c.m * 0.4 : c.W - c.m * 1.2;
    const ph = Math.min(bottom - top, (px1 - px0) / 0.95), pw = Math.min(px1 - px0, ph * 1.05);
    const clip = wavyFrame(c, (px0 + px1 - pw) / 2, top + (bottom - top - ph) / 2, pw, ph);
    c.image(photo, (px0 + px1 - pw) / 2, top + (bottom - top - ph) / 2, pw, ph, 'xMidYMin slice', clip);
    const x0 = rtl ? split + c.m * 0.2 : c.m * 1.2, x1 = rtl ? c.W - c.m * 1.2 : split - c.m * 0.2;
    const tf = c.fit(title, ts, { maxWidth: x1 - x0, maxLines: 2, max: 120 * c.s });
    const gf = c.fit(tag, tg, { maxWidth: x1 - x0, maxLines: 1, max: 46 * c.s });
    const nf = c.fit(name, ns, { maxWidth: x1 - x0, maxLines: 1, max: 40 * c.s });
    const df = c.fit(details, ds, { maxWidth: x1 - x0, maxLines: 2, max: 26 * c.s });
    const gap = c.m * 0.45;
    const credH = cred ? 26 * c.s * 1.6 : 0;
    const total = tf.height + (tag ? gap * 0.6 + gf.height : 0) + gap * 1.6 + (name ? nf.height + gap * 0.6 : 0) + (cred ? credH + gap : 0) + (details ? df.height : 0);
    let y = top + Math.max(0, (bottom - top - total) / 2);
    c.text(tf, ts, c.edge(ts, x0, x1), y); y += tf.height;
    if (tag) { y += gap * 0.6; c.text(gf, tg, c.edge(tg, x0, x1), y); y += gf.height; }
    y += gap * 1.6;
    if (name) { c.text(nf, ns, c.edge(ns, x0, x1), y); y += nf.height + gap * 0.6; }
    if (cred) { y = labelBar(c, cred, C.orange, C.white, x0, x1, y, 24 * c.s) + gap; }
    if (details) c.text(df, ds, c.edge(ds, x0, x1), y);
    return c.svg(bg);
  }
  const x0 = c.m * 1.3, x1 = c.W - c.m * 1.3, cx = c.W / 2;
  const symTop = c.story ? c.H * 0.06 : Math.max(c.m * 0.7, c.safe.top + c.m * 0.4);
  const symH = 66 * c.s * (c.story ? 1.15 : 1);
  symbol(c, dark, cx, symTop, symH);
  const top = symTop + symH + c.m * 0.35, bottom = foot - c.m * 0.1;
  const avail = bottom - top;
  // A story has room for larger type and photo; the spare height is shared between the gaps, never left at the bottom.
  const k = c.story ? 1.22 : 1;
  const tf = c.fit(title, ts, { maxWidth: x1 - x0, maxLines: 2, max: 150 * c.s * k, maxHeight: avail * 0.2, leading: ts.rtl ? 1.2 : 1 });
  const gf = c.fit(tag, tg, { maxWidth: x1 - x0, maxLines: 1, max: 58 * c.s * k });
  const nf = c.fit(name, ns, { maxWidth: x1 - x0, maxLines: 1, max: 38 * c.s * k });
  const df = c.fit(details, ds, { maxWidth: x1 - x0, maxLines: 2, max: 27 * c.s * k });
  const bf = c.fit(para, bs, { maxWidth: (x1 - x0) * 0.9, maxLines: c.story ? 3 : 2, max: 26 * c.s * k, leading: bs.rtl ? 1.5 : 1.3 });
  const gap = c.m * 0.32 * k;
  const credSize = 24 * c.s * k;
  const credH = cred ? credSize * 1.56 : 0;
  const under = (name ? nf.height + gap : 0) + (cred ? credH + gap * 1.4 : 0) + (details ? df.height + gap : 0) + (para ? bf.height : 0);
  const over = tf.height + (tag ? gf.height + gap * 0.4 : 0) + gap * 1.6;
  const pwMax = (x1 - x0) * (c.story ? 0.86 : 0.7);
  const ph = Math.max(avail * 0.22, Math.min(avail - over - under - gap * 1.4, pwMax / 1.05)), pw = ph * 1.05;
  const spare = Math.max(0, avail - (over + ph + gap * 1.4 + under));
  let y = top + spare * 0.3;
  c.text(tf, ts, cx, y, 'center'); y += tf.height;
  if (tag) { y += gap * 0.4; c.text(gf, tg, cx + (tg.spacing ? tg.spacing * gf.size / 2 : 0), y, 'center'); y += gf.height; }
  y += gap * 1.6 + spare * 0.3;
  const px = cx - pw / 2 + pw * 0.03;
  const clip = wavyFrame(c, px, y, pw, ph);
  c.image(photo, px, y, pw, ph, 'xMidYMin slice', clip);
  y += ph + gap * 1.4 + spare * 0.2;
  if (name) { c.text(nf, ns, cx, y, 'center'); y += nf.height + gap; }
  if (cred) y = labelBar(c, cred, C.orange, C.white, x0, x1, y, credSize, 'center') + gap * 1.4;
  if (details) { c.text(df, ds, cx, y, 'center'); y += df.height + gap; }
  if (para) c.text(bf, bs, cx, y, 'center');
  return c.svg(bg);
};

/** 05–06 · Photo card with a white headline, a label bar and a paragraph. */
const photoCard: Builder = (c) => {
  const bg = background(c, 'light', 'plain');
  const foot = footer(c, false);
  const wide = c.ratio > 1.15;
  const head = c.value('headline'), label = c.value('label'), para = c.value('body');
  const barFill = c.value('labelColor') === 'orange' ? C.orange : C.blue;
  const cx0 = c.m * 0.9, cx1 = c.W - c.m * 0.9;
  const cy0 = c.story ? c.H * 0.05 : Math.max(c.m * 0.9, c.safe.top + c.m * 0.3), cy1 = foot - c.m * 0.25;
  const r = 22 * c.s;
  const clip = roundedClip(c, cx0, cy0, cx1 - cx0, cy1 - cy0, r);
  c.image(c.value('photo'), cx0, cy0, cx1 - cx0, cy1 - cy0, 'xMidYMid slice', clip);
  const shade = c.id('shade');
  const rtl = c.rtlOf(head || para);
  c.defs.push(wide
    ? `<linearGradient id="${shade}" x1="${rtl ? 1 : 0}" y1="0" x2="${rtl ? 0.35 : 0.65}" y2="0"><stop offset="0" stop-color="#061A55" stop-opacity="0.82"/><stop offset="1" stop-color="#061A55" stop-opacity="0"/></linearGradient>`
    : `<linearGradient id="${shade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#061A55" stop-opacity="0.12"/><stop offset="0.3" stop-color="#061A55" stop-opacity="0.42"/><stop offset="0.6" stop-color="#061A55" stop-opacity="0.6"/><stop offset="1" stop-color="#061A55" stop-opacity="0.88"/></linearGradient>`);
  c.body.push(`<rect x="${n(cx0)}" y="${n(cy0)}" width="${n(cx1 - cx0)}" height="${n(cy1 - cy0)}" rx="${n(r)}" fill="url(#${shade})"/>`);
  const symH = 72 * c.s;
  symbol(c, true, wide ? (rtl ? cx0 + c.m * 1.2 : cx1 - c.m * 1.2) : (cx0 + cx1) / 2, cy0 + c.m * 0.7, symH);
  const tx0 = cx0 + c.m * 0.9, tx1 = wide ? (rtl ? cx1 - c.m * 0.9 : cx0 + (cx1 - cx0) * 0.58) : cx1 - c.m * 0.9;
  const lx0 = wide && rtl ? cx0 + (cx1 - cx0) * 0.42 : tx0;
  const hs = c.style(head, 700, C.white, { upper: !c.rtlOf(head) });
  const bs = c.style(para, 400, C.white);
  const k = c.story ? 1.2 : 1;
  const hf = c.fit(head, hs, { maxWidth: (tx1 - lx0) * (wide ? 1 : 0.66), maxLines: 3, max: (wide ? 92 : 112) * c.s * k, leading: hs.rtl ? 1.3 : 1.08 });
  const bf = c.fit(para, bs, { maxWidth: tx1 - lx0, maxLines: 4, max: (bs.rtl ? 30 : 27) * c.s * k, leading: bs.rtl ? 1.55 : 1.35 });
  const gap = c.m * 0.4;
  const barSize = 32 * c.s * k;
  const barH = label ? barSize * 1.56 : 0;
  const bottomLimit = cy1 - Math.max(c.m * 1.1, (cy1 - cy0) * 0.11);
  if (wide) {
    const block = hf.height + gap * 2.2 + (label ? barH + gap * 0.8 : 0) + bf.height;
    let y = cy0 + (cy1 - cy0 - block) / 2;
    c.text(hf, hs, c.edge(hs, lx0, tx1), y); y += hf.height + gap * 2.2;
    if (label) y = labelBar(c, label, barFill, C.white, lx0, tx1, y, barSize) + gap * 0.8;
    c.text(bf, bs, c.edge(bs, lx0, tx1), y);
    return c.svg(bg);
  }
  // As in the pack: the headline in the upper middle of the card, the label and paragraph near its bottom.
  const lower = (label ? barH + gap * 0.8 : 0) + bf.height;
  let y = bottomLimit - lower;
  const headTop = Math.min(cy0 + (cy1 - cy0) * 0.3, y - gap * 2 - hf.height);
  c.text(hf, hs, c.edge(hs, lx0, tx1), headTop);
  if (label) y = labelBar(c, label, barFill, C.white, lx0, tx1, y, barSize) + gap * 0.8;
  c.text(bf, bs, c.edge(bs, lx0, tx1), y);
  return c.svg(bg);
};

/** 07 · A huge headline with a person standing in front of it. */
const cutout: Builder = (c) => {
  const bg = background(c, 'light', 'sky');
  const logoBottom = logo(c, false).bottom;
  const foot = footer(c, true);
  const wide = c.ratio > 1.15;
  const l1 = c.value('line1'), l2 = c.value('line2'), person = c.value('person');
  const free = Boolean(c.input.cutouts?.person);
  const s1 = c.style(l1, 800, C.blue), s2 = c.style(l2, 800, C.deep);
  const x0 = c.m * 0.6, x1 = c.W - c.m * 0.6;
  if (wide) {
    const rtl = s1.rtl;
    const tx0 = rtl ? c.W * 0.42 : x0 + c.m * 0.4, tx1 = rtl ? x1 - c.m * 0.4 : c.W * 0.58;
    const top = logoBottom + c.m * 0.6, bottom = foot;
    const f1 = c.fit(l1, s1, { maxWidth: tx1 - tx0, maxLines: 1, max: 190 * c.s, leading: 1 });
    const f2 = c.fit(l2, s2, { maxWidth: tx1 - tx0, maxLines: 2, max: f1.size * 0.75, leading: s2.rtl ? 1.2 : 1 });
    const total = f1.height + c.m * 0.3 + f2.height;
    let y = top + (bottom - top - total) / 2;
    c.text(f1, s1, c.edge(s1, tx0, tx1), y); y += f1.height + c.m * 0.3;
    c.text(f2, s2, c.edge(s2, tx0, tx1), y);
    const pw = c.W * 0.4, px = rtl ? c.m * 0.5 : c.W - pw - c.m * 0.5, py = c.H * 0.12, ph = c.H - py;
    if (free) c.image(person, px, py, pw, ph, 'xMidYMax meet');
    else { const clip = wavyFrame(c, px + pw * 0.08, py + c.m * 0.2, pw * 0.84, ph - foot * 0 - c.m * 2.2 - (c.H - foot)); c.image(person, px + pw * 0.08, py + c.m * 0.2, pw * 0.84, ph - c.m * 2.2 - (c.H - foot), 'xMidYMin slice', clip); }
    return c.svg(bg);
  }
  const top = logoBottom + c.m * (c.story ? 1.2 : 0.5);
  const f1 = c.fit(l1, s1, { maxWidth: x1 - x0, maxLines: 1, max: (c.story ? 230 : 210) * c.s, leading: 1 });
  const f2 = c.fit(l2, s2, { maxWidth: x1 - x0, maxLines: 1, max: f1.size * 0.92, leading: 1 });
  const cxText = (x0 + x1) / 2;
  c.text(f1, s1, cxText, top, 'center');
  const y2 = top + f1.height + f1.size * (s1.rtl ? 0.45 : 0.32);
  c.text(f2, s2, cxText, y2, 'center');
  // The person starts just under line 1 and stands down to the footer, in front of line 2.
  const py = top + f1.height * 0.82, ph = c.H - py;
  const pw = Math.min(c.W * 0.9, ph * 0.78);
  if (free) c.image(person, (c.W - pw) / 2 + c.W * 0.06, py, pw, ph, 'xMidYMax meet');
  else {
    // Not a cut-out: the photo goes in the wavy frame under the headline instead of covering it.
    const fy = y2 + f2.height + c.m * 0.7, fh = foot - fy - c.m * 0.5, fw = Math.min(x1 - x0, fh * 1.0);
    const clip = wavyFrame(c, (c.W - fw) / 2, fy, fw, fh);
    c.image(person, (c.W - fw) / 2, fy, fw, fh, 'xMidYMin slice', clip);
  }
  return c.svg(bg);
};

/** 08 · Offer: headline, photo in the wavy frame over an orange wave, the discount badge. */
const offer: Builder = (c) => {
  const bg = background(c, 'blue', 'plain');
  const logoBottom = logo(c, true).bottom;
  const foot = footer(c, true);
  const wide = c.ratio > 1.15;
  const head = c.value('headline'), para = c.value('body'), price = c.value('price');
  const hs = c.style(head, 700, C.white), bs = c.style(para, 400, C.white), ps = c.style(price, 700, C.white);
  const blur = c.id('blur');
  c.defs.push(`<filter id="${blur}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${n(26 * c.s)}"/></filter>`);
  const wave = (y: number, h: number) => c.body.push(`<path d="M ${-c.W * 0.1} ${n(y + h * 0.5)} C ${n(c.W * 0.25)} ${n(y - h * 0.2)}, ${n(c.W * 0.5)} ${n(y + h * 1.2)}, ${n(c.W * 1.1)} ${n(y + h * 0.2)} L ${n(c.W * 1.1)} ${n(y + h * 0.95)} C ${n(c.W * 0.55)} ${n(y + h * 1.9)}, ${n(c.W * 0.25)} ${n(y + h * 0.7)}, ${-c.W * 0.1} ${n(y + h * 1.25)} Z" fill="${C.orange}" filter="url(#${blur})" opacity="0.95"/>`);
  const badge = (cx: number, cy: number, r: number) => {
    const bumps = 14, pts: string[] = [];
    for (let i = 0; i <= bumps; i++) { const a = (i / bumps) * Math.PI * 2 - Math.PI / 2; pts.push(`${i === 0 ? 'M' : 'A'} ${i === 0 ? '' : `${n(r * 0.24)} ${n(r * 0.24)} 0 0 1 `}${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`); }
    c.body.push(`<path d="${pts.join(' ')} Z" fill="${C.orange}"/>`);
    const word = c.value('badgeLabel'), value = c.value('badgeValue');
    const ws = c.style(word, 700, C.white), vs = c.style(value, 800, C.white);
    const wf = c.fit(word, ws, { maxWidth: r * 1.5, maxLines: 1, max: r * 0.3 });
    const vf = c.fit(value, vs, { maxWidth: r * 1.5, maxLines: 1, max: r * 0.6 });
    const total = (word ? wf.height + r * 0.1 : 0) + vf.height;
    let y = cy - total / 2;
    if (word) { c.text(wf, ws, cx, y, 'center'); y += wf.height + r * 0.1; }
    c.text(vf, vs, cx, y, 'center');
  };
  const photo = c.value('photo');
  if (wide) {
    const rtl = hs.rtl;
    const top = logoBottom + c.m * 0.5, bottom = foot - c.m * 0.2;
    const pw = Math.min(c.W * 0.36, (bottom - top) * 1.05), ph = pw / 1.05;
    const px = rtl ? c.m * 1.4 : c.W - pw - c.m * 2.6, py = top + (bottom - top - ph) / 2;
    wave(py + ph * 0.25, ph * 0.38);
    const clip = wavyFrame(c, px, py, pw, ph);
    c.image(photo, px, py, pw, ph, 'xMidYMin slice', clip);
    badge(rtl ? px + pw * 0.98 : px + pw * 0.98, py + ph * 0.72, Math.min(ph * 0.26, 120 * c.s));
    const x0 = rtl ? px + pw + c.m * 2.2 : c.m * 1.2, x1 = rtl ? c.W - c.m * 1.2 : px - c.m * 1.6;
    const hf = c.fit(head, hs, { maxWidth: x1 - x0, maxLines: 2, max: 92 * c.s });
    const pf = c.fit(price, ps, { maxWidth: x1 - x0, maxLines: 1, max: 40 * c.s });
    const bf = c.fit(para, bs, { maxWidth: x1 - x0, maxLines: 3, max: 26 * c.s, leading: bs.rtl ? 1.5 : 1.35 });
    const total = hf.height + c.m * 0.6 + (price ? pf.height + c.m * 0.5 : 0) + bf.height;
    let y = top + (bottom - top - total) / 2;
    c.text(hf, hs, c.edge(hs, x0, x1), y); y += hf.height + c.m * 0.6;
    if (price) { c.text(pf, ps, c.edge(ps, x0, x1), y); y += pf.height + c.m * 0.5; }
    c.text(bf, bs, c.edge(bs, x0, x1), y);
    return c.svg(bg);
  }
  const x0 = c.m * 1.1, x1 = c.W - c.m * 1.1;
  const k = c.story ? 1.2 : 1;
  const top = logoBottom + c.m * (c.story ? 1.4 : 0.9), bottom = foot - c.m * 0.2;
  const hf = c.fit(head, hs, { maxWidth: (x1 - x0) * 0.9, maxLines: 2, max: 92 * c.s * k, leading: hs.rtl ? 1.3 : 1.05 });
  const pf = c.fit(price, ps, { maxWidth: x1 - x0, maxLines: 1, max: 40 * c.s * k });
  const bf = c.fit(para, bs, { maxWidth: (x1 - x0) * 0.95, maxLines: 3, max: (bs.rtl ? 30 : 27) * c.s * k, leading: bs.rtl ? 1.5 : 1.35 });
  const under = (price ? pf.height + c.m * 0.45 : 0) + bf.height;
  const room = bottom - top - hf.height - c.m * 1.5 - under;
  const ph = Math.min((x1 - x0) * (c.story ? 0.72 : 0.62), room), pw = ph * 1.12;
  const spare = Math.max(0, room - ph);
  c.text(hf, hs, c.edge(hs, x0, x1), top + spare * 0.15);
  const py = top + spare * 0.45 + hf.height + c.m * 0.6;
  const rtl = hs.rtl;
  const px = rtl ? c.W - c.W * 0.22 - pw : c.W * 0.2;
  wave(py + ph * 0.18, ph * 0.36);
  const clip = wavyFrame(c, px, py, pw, ph);
  c.image(photo, px, py, pw, ph, 'xMidYMin slice', clip);
  badge(rtl ? px - pw * 0.02 : px + pw * 1.02, py + ph * 0.7, Math.min(ph * 0.25, 125 * c.s * k));
  let y = py + ph + c.m * 0.9 + spare * 0.3;
  if (price) { c.text(pf, ps, c.edge(ps, x0, x1), y); y += pf.height + c.m * 0.45; }
  c.text(bf, bs, c.edge(bs, x0, x1), y);
  return c.svg(bg);
};

/** 09–12 · Carousel slide: headline, contact block and the slide number in the corner. */
const carousel: Builder = (c, surface) => {
  const dark = surface === 'blue';
  const bg = background(c, surface, 'waves');
  const wide = c.ratio > 1.15;
  const logoBottom = logo(c, dark, wide ? 'left' : 'center').bottom;
  const foot = footer(c, dark, { motif: 'center', website: false, light: true });
  const head = c.value('headline'), slide = c.value('slide'), contact = c.value('contact');
  const ink = dark ? C.white : C.deep;
  const hs = c.style(head, 600, ink), cs = c.style(contact, 400, dark ? '#E9F0FF' : C.deep);
  const ns = c.style(slide, 700, dark ? '#EAF1FF' : C.deep);
  const x0 = c.m * 1.15, x1 = c.W - c.m * 1.15;
  const rtl = hs.rtl;
  const k = c.story ? 1.25 : 1;
  const top = logoBottom + c.m * (c.story ? 2.2 : 1.7), bottom = foot - c.m * 0.2;
  const nf = c.fit(slide, ns, { maxWidth: c.W * 0.34, maxLines: 1, max: (wide ? 190 : 200) * c.s * k, leading: 1 });
  const textW = (x1 - x0) * (wide ? 0.62 : 0.6);
  const hf = c.fit(head, hs, { maxWidth: textW, maxLines: 4, max: (wide ? 92 : 104) * c.s * k, leading: hs.rtl ? 1.3 : 1.1, maxHeight: (bottom - top) * 0.5 });
  const cf: Fitted = c.fit(contact, cs, { maxWidth: (x1 - x0) * 0.6, maxLines: 8, max: 38 * c.s * k, leading: cs.rtl ? 1.4 : 1.15, maxHeight: (bottom - top) * 0.42 });
  c.text(hf, hs, c.edge(hs, x0, rtl ? x1 : x0 + textW), top);
  const cTop = Math.max(top + hf.height + c.m * 1.2, bottom - cf.height - c.m * 0.6);
  // Labels ("Website:") in the strong weight and colour, values lighter, as in the pack.
  cf.lines.forEach((line, i) => {
    const label = /[:：]\s*$/.test(line) || (!/[0-9@.+]/.test(line) && i % 2 === 0);
    const style = { ...cs, weight: label ? 600 : 400, color: label ? ink : dark ? '#DCE6FF' : '#5B6478' };
    c.text({ ...cf, lines: [line] }, style, c.edge(cs, x0, x1), cTop + i * cf.lineHeight);
  });
  const nx = rtl ? x0 : x1 - nf.width;
  c.text(nf, { ...ns, rtl: false }, nx, Math.min(bottom - nf.height, cTop + cf.height - nf.height));
  return c.svg(bg);
};

/** «عرض الخمسين خمسين» · campaign stamp, headline with a green phrase, course tape, price ticket. */
const GREEN = '#43F06B';
/** A paper strip with torn left and right edges (deterministic, so every size tears the same way). */
function torn(x: number, y: number, w: number, h: number, seed: number): string {
  let r = seed;
  const rand = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const teeth = 7, pts: string[] = [];
  const jag = Math.min(h * 0.18, w * 0.04);
  pts.push(`M ${n(x + jag)} ${n(y)}`, `L ${n(x + w - jag)} ${n(y + h * 0.02 * rand())}`);
  for (let i = 1; i <= teeth; i++) pts.push(`L ${n(x + w - jag + (i % 2 ? jag : -jag * 0.2) * (0.6 + rand() * 0.4))} ${n(y + (h * i) / teeth)}`);
  pts.push(`L ${n(x + jag)} ${n(y + h - h * 0.02 * rand())}`);
  for (let i = teeth - 1; i >= 0; i--) pts.push(`L ${n(x + (i % 2 ? -jag * 0.1 : jag * 0.9) * (0.6 + rand() * 0.4))} ${n(y + (h * i) / teeth)}`);
  return `${pts.join(' ')} Z`;
}

const campaignOffer: Builder = (c) => {
  const { W, H } = c;
  const grain = c.id('grain'), shadow = c.id('shadow');
  c.defs.push(`<filter id="${grain}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${n(0.9 / Math.max(0.5, c.s))}" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.02  0 0 0 0 0.16  0 0 0 0 0.75  0 0 0 0.55 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`,
    `<filter id="${shadow}" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="${n(5 * c.s)}" stdDeviation="${n(2 * c.s)}" flood-color="#0026A8" flood-opacity="0.9"/></filter>`);
  const bg = `<rect width="${W}" height="${H}" fill="#0443F2"/><rect width="${W}" height="${H}" fill="#0443F2" filter="url(#${grain})" opacity="0.6"/>`;
  // The campaign's own logo (the older lockup) at its place in the design, with the same grain over it as over
  // the background, so it sits in the print instead of on top of it.
  {
    const width = Math.min(LOGO.old.width * 1.25, Math.round((c.ratio > 1.15 ? Math.min(W, H * 1.4) : W) * 0.2));
    const height = width / LOGO.old.ratio;
    const top = c.story ? Math.max(Math.round(H * 0.06), c.safe.top * 0.4) : Math.max(c.m * 0.85, c.safe.top + c.m * 0.5);
    const x = Math.max(c.m * 0.6, c.safe.left + c.m * 0.5);
    const mask = c.id('logomask');
    c.defs.push(`<mask id="${mask}" maskUnits="userSpaceOnUse" x="${n(x)}" y="${n(top)}" width="${n(width)}" height="${n(height)}"><image href="${LOGO.old.reversed}" x="${n(x)}" y="${n(top)}" width="${n(width)}" height="${n(height)}" preserveAspectRatio="xMidYMid meet"/></mask>`);
    // A soft deep-blue shadow under it, as in the campaign post, then a light pass of the background grain.
    const lift = c.id('lift');
    c.defs.push(`<filter id="${lift}" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="${n(3 * c.s)}" stdDeviation="${n(3 * c.s)}" flood-color="#00157A" flood-opacity="0.55"/></filter>`);
    c.body.push(`<image href="${LOGO.old.reversed}" x="${n(x)}" y="${n(top)}" width="${n(width)}" height="${n(height)}" preserveAspectRatio="xMidYMid meet" filter="url(#${lift})"/>`);
    c.body.push(`<rect x="${n(x)}" y="${n(top)}" width="${n(width)}" height="${n(height)}" fill="#0443F2" filter="url(#${grain})" opacity="0.4" mask="url(#${mask})"/>`);
  }
  const footTop = footer(c, true, { motif: 'none' });
  const wide = c.ratio > 1.15;
  const head = c.value('headline'), hi = c.value('highlight'), tape = c.value('tape'), sub = c.value('subline');
  const price = c.value('price'), currency = c.value('currency'), instead = c.value('instead'), old = c.value('oldPrice');
  /**
   * A supporting line that needs two lines breaks at its natural place, after «:» (or the first «•»), so a list
   * like «3 تخصصات: Architecture • Structure • MEP» never splits one of its items across the lines.
   */
  const subFor = (maxWidth: number, size: number) => {
    if (c.width(sub, ss, size) <= maxWidth) return sub;
    const at = sub.search(/[:：]\s*/);
    if (at > 0) return `${sub.slice(0, at + 1)}\n${sub.slice(at + 1).trim()}`;
    const bullet = sub.indexOf('•');
    return bullet > 0 ? `${sub.slice(0, bullet).trim()}\n${sub.slice(bullet).trim()}` : sub;
  };
  const stamp = c.value('stamp'), hashtag = c.value('hashtag');
  const hs = c.style(head, 800, C.white), ts = c.style(tape, 800, C.white), ss = c.style(sub, 800, C.white);
  /** One line as in the design, unless that would make it much smaller; then two. */
  const fitHead = (maxWidth: number, max: number) => {
    const one = c.fit(head, hs, { maxWidth, maxLines: 1, max, min: max * 0.7, leading: 1.3 });
    return one.lines.length === 1 && one.width <= maxWidth + 0.5 ? one : c.fit(head, hs, { maxWidth, maxLines: 2, max, leading: 1.3 });
  };

  /** The headline with the green phrase, one or two lines. */
  const headline = (f: Fitted, x: number, top: number) => {
    f.lines.forEach((line, i) => {
      const baseline = top + f.size * 0.8 + i * f.lineHeight;
      const at = hi ? line.indexOf(hi) : -1;
      const runs = at < 0 ? [[line, C.white]] : [[line.slice(0, at), C.white], [hi, GREEN], [line.slice(at + hi.length), C.white]].filter(([t]) => t);
      c.body.push(`<text x="${n(x)}" y="${n(baseline)}" font-family="${hs.family}" font-weight="800" font-size="${n(f.size)}"${hs.rtl ? ' direction="rtl"' : ''} text-anchor="middle" filter="url(#${shadow})">${runs.map(([t, fill]) => `<tspan fill="${fill}">${esc(t)}</tspan>`).join('')}</text>`);
    });
  };
  /** The course tape: a dark torn strip, slightly tilted, with the line on it. */
  const tapeStrip = (cx: number, top: number, maxW: number, size: number) => {
    const f = c.fit(tape, ts, { maxWidth: maxW * 0.86, maxLines: 1, max: size });
    const w = Math.min(maxW, f.width + size * 2.4), h = f.size * 1.85;
    c.body.push(`<g transform="rotate(-1.6 ${n(cx)} ${n(top + h / 2)})"><path d="${torn(cx - w / 2, top, w, h, 11)}" fill="#0031AA"/></g>`);
    c.text(f, ts, cx, top + (h - f.size) / 2 + f.size * 0.02, 'center');
    return h;
  };
  /**
   * New price on a blue ticket, «instead of» on a white label with a gift and the old price on a second ticket
   * when there is an old price. The rings and ticks follow the stack that is actually drawn.
   */
  const ticketHeight = (k: number) => 150 * k + (old ? (instead ? 70 * k : 0) + 98 * k : 0);
  const ticket = (cx: number, top: number, k: number) => {
    const tw = 380 * k, th = 150 * k, angle = -8;
    const g: string[] = [];
    const py = top;
    g.push(`<path d="${torn(cx - tw / 2, py, tw, th, 3)}" fill="#1D57FF" filter="url(#${shadow})"/>`);
    const ps = c.style(price, 800, GREEN, { family: 'Plus Jakarta Sans', rtl: false });
    const cs = c.style(currency, 800, C.white);
    const gap = currency ? 18 * k : 0;
    const cf = currency ? c.fit(currency, cs, { maxWidth: tw * 0.34, maxLines: 1, max: 54 * k }) : { width: 0, size: 0 } as Fitted;
    // The number and its currency share the ticket's width, so a long currency («ريال») never runs into the price.
    const pf = c.fit(price, ps, { maxWidth: tw * 0.84 - cf.width - gap, maxLines: 1, max: 118 * k });
    const total = pf.width + gap + cf.width;
    const startX = cx - total / 2;
    // Arabic reads the currency after the number on the left; English puts it first.
    const priceX = cs.rtl ? startX + cf.width + gap : startX;
    const curX = cs.rtl ? startX : startX + pf.width + gap;
    const base = py + th / 2 + pf.size * 0.36;
    g.push(`<text x="${n(priceX)}" y="${n(base)}" font-family="Plus Jakarta Sans" font-weight="800" font-size="${n(pf.size)}" fill="${GREEN}" direction="ltr" text-anchor="start">${esc(price)}</text>`);
    if (currency) g.push(`<text x="${n(curX + (cs.rtl ? cf.width : 0))}" y="${n(base - pf.size * 0.05)}" font-family="${cs.family}" font-weight="800" font-size="${n(cf.size)}" fill="${C.white}"${cs.rtl ? ' direction="rtl"' : ' direction="ltr"'} text-anchor="start">${esc(currency)}</text>`);
    const lw = 270 * k, lh = 78 * k, ly = py + th - 8 * k;
    const label = Boolean(old && instead);
    if (label) {
      g.push(`<path d="${torn(cx - lw / 2 + 30 * k, ly, lw, lh, 5)}" fill="#F3FEFF"/>`);
      const is = c.style(instead, 800, '#0A3BE0');
      const iF = c.fit(instead, is, { maxWidth: lw * 0.6, maxLines: 1, max: 56 * k });
      g.push(`<text x="${n(cx + 50 * k)}" y="${n(ly + lh / 2 + iF.size * 0.32)}" font-family="${is.family}" font-weight="800" font-size="${n(iF.size)}" fill="#0A3BE0" text-anchor="middle"${is.rtl ? ' direction="rtl"' : ''}>${esc(instead)}</text>`);
      // Gift box, line-drawn in green.
      const gx = cx - lw / 2 - 4 * k, gy = ly + lh * 0.12, gs = 62 * k, sw = 5 * k;
      g.push(`<g fill="none" stroke="${GREEN}" stroke-width="${n(sw)}" stroke-linejoin="round"><rect x="${n(gx)}" y="${n(gy + gs * 0.3)}" width="${n(gs)}" height="${n(gs * 0.7)}"/><rect x="${n(gx - gs * 0.06)}" y="${n(gy + gs * 0.12)}" width="${n(gs * 1.12)}" height="${n(gs * 0.2)}"/><path d="M ${n(gx + gs / 2)} ${n(gy + gs * 0.12)} V ${n(gy + gs)} M ${n(gx + gs / 2)} ${n(gy + gs * 0.12)} C ${n(gx + gs * 0.2)} ${n(gy - gs * 0.15)} ${n(gx + gs * 0.1)} ${n(gy + gs * 0.1)} ${n(gx + gs / 2)} ${n(gy + gs * 0.12)} C ${n(gx + gs * 0.8)} ${n(gy - gs * 0.15)} ${n(gx + gs * 0.9)} ${n(gy + gs * 0.1)} ${n(gx + gs / 2)} ${n(gy + gs * 0.12)}"/></g>`);
    }
    if (old) {
      const ow = 250 * k, oh = 92 * k, oy = label ? ly + lh + 6 * k : py + th + 6 * k;
      g.push(`<path d="${torn(cx - ow / 2 + 20 * k, oy, ow, oh, 9)}" fill="#0445F4" filter="url(#${shadow})"/>`);
      const os = c.style(old, 800, C.white, { family: 'Plus Jakarta Sans', rtl: false });
      const of = c.fit(old, os, { maxWidth: ow * 0.7, maxLines: 1, max: 62 * k });
      g.push(`<text x="${n(cx + 20 * k)}" y="${n(oy + oh / 2 + of.size * 0.36)}" font-family="Plus Jakarta Sans" font-weight="800" font-size="${n(of.size)}" fill="${C.white}" text-anchor="middle" direction="ltr">${esc(old)}</text>`);
    }
    // Small white rings and green ticks around the ticket, as in the design: the upper ones beside the price, the
    // lower ones under whatever is the last piece of the stack.
    const stack = ticketHeight(k);
    const ring = (x: number, y: number, r: number) => g.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="none" stroke="${C.white}" stroke-width="${n(5 * k)}"/>`);
    const tick = (x: number, y: number, a: number, len: number) => g.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(len)}" height="${n(12 * k)}" rx="${n(3 * k)}" fill="${GREEN}" transform="rotate(${a} ${n(x)} ${n(y)})"/>`);
    ring(cx + tw * 0.62, py + th * 0.45, 14 * k);
    tick(cx + tw * 0.46, py + th * 1.05, -60, 42 * k); tick(cx + tw * 0.53, py + th * 1.12, -40, 38 * k); tick(cx + tw * 0.56, py + th * 1.3, -8, 34 * k);
    if (old) {
      ring(cx - tw * 0.52, py + stack - 40 * k, 14 * k);
      tick(cx - tw * 0.5, py + stack + 4 * k, 200, 40 * k); tick(cx - tw * 0.46, py + stack + 30 * k, 230, 36 * k);
    } else {
      ring(cx - tw * 0.6, py + th * 0.62, 12 * k);
    }
    c.body.push(`<g transform="rotate(${angle} ${n(cx)} ${n(py + th)})">${g.join('')}</g>`);
    return stack;
  };

  const hashH = (wide ? 96 : 108) * c.s;
  if (hashtag) c.image(hashtag, W - c.m * 0.6 - hashH * 2.62, footTop + c.m * 0.5 + (H - footTop - c.m * 0.5 - hashH) * 0.35, hashH * 2.62, hashH, 'xMaxYMid meet');

  if (wide) {
    // Stamp and ticket on the left, the words on the right (mirrored for English).
    const rtl = hs.rtl;
    const top = H * 0.2, bottom = footTop;
    const colW = W * 0.36;
    const lx = rtl ? c.m * 1.2 : W - c.m * 1.2 - colW;
    const st = Math.min(colW * 0.75, (bottom - top) * 0.62);
    if (stamp) c.image(stamp, lx + (colW - st) / 2, top, st, st, 'xMidYMid meet');
    const tx0 = rtl ? lx + colW + c.m : c.m * 1.2, tx1 = rtl ? W - c.m * 1.2 : lx - c.m;
    const cx = (tx0 + tx1) / 2;
    const k = c.s * 0.78;
    const hf = fitHead(tx1 - tx0, 66 * c.s);
    let y = top + c.m * 0.2;
    headline(hf, cx, y); y += hf.height + c.m * 0.5;
    y += tapeStrip(cx, y, tx1 - tx0, 50 * c.s) + c.m * 0.45;
    const sf = c.fit(subFor(tx1 - tx0, 46 * c.s), ss, { maxWidth: tx1 - tx0, maxLines: 2, max: 46 * c.s, leading: 1.3 });
    c.text(sf, { ...ss }, cx, y, 'center'); y += sf.height;
    ticket(lx + colW / 2, top + st + c.m * 0.2, Math.min(k, (bottom - top - st - c.m * 0.4) / (ticketHeight(1) + 60)));
    void y;
    return c.svg(bg);
  }
  // Portrait, square and story: one centred column with the proportions of the 1080×1350 design. The pieces are
  // measured with the real words first (a long headline takes two lines, a long supporting line two, a price with
  // no old price a shorter ticket), then the column is scaled to the space and centred in it.
  const top = c.story ? H * 0.1 : H * 0.115, bottom = footTop + c.m * 0.2;
  const band = bottom - top;
  const cx = W / 2, maxW = W - c.m * 2.4;
  const column = (f: number) => {
    const st = stamp ? 300 * c.s * f : 0;
    const hf = fitHead(W - c.m * 1.6, 68 * c.s * f);
    const tf = tape ? c.fit(tape, ts, { maxWidth: W * 0.78 * 0.86, maxLines: 1, max: 52 * c.s * f }) : null;
    const tapeH = tf ? tf.size * 1.85 : 0;
    const sf = sub ? c.fit(subFor(maxW, 54 * c.s * f), ss, { maxWidth: maxW, maxLines: 2, max: 54 * c.s * f, leading: 1.3 }) : null;
    const k = c.s * f * 0.92;
    const gaps = [st ? 28 : 0, 30, tape ? 22 : 0, sub ? 46 : 0].reduce((a, b) => a + b, 0) * c.s * f;
    // The ticket's rings and ticks reach a little past its stack.
    const height = st + hf.height + tapeH + (sf?.height ?? 0) + gaps + (price ? ticketHeight(k) + 40 * k : 0);
    return { f, st, hf, sf, k, height };
  };
  let plan = column(c.story ? 1.4 : 1.05);
  for (let i = 0; i < 12 && plan.height > band; i++) plan = column(plan.f * Math.max(0.8, band / plan.height));
  const { f, st, hf, sf, k } = plan;
  const spare = Math.max(0, band - plan.height);
  let y = top + spare * 0.35;
  if (stamp) { c.image(stamp, cx - st / 2, y, st, st, 'xMidYMid meet'); y += st + 28 * c.s * f + spare * 0.12; }
  headline(hf, cx, y); y += hf.height + 30 * c.s * f;
  if (tape) y += tapeStrip(cx, y, W * 0.78, 52 * c.s * f) + 22 * c.s * f;
  if (sf) { c.text(sf, ss, cx, y, 'center'); y += sf.height + 46 * c.s * f + spare * 0.18; }
  if (price) ticket(cx, y, k);
  return c.svg(bg);
};

/**
 * Very wide covers and banners (wider than 2.6:1, e.g. the LinkedIn or X header): one band with the logo, the main
 * line and its supporting line, and the template's picture or campaign stamp at the far end, inside the safe area.
 */
const banner: Builder = (c, surface) => {
  const { W, H, safe } = c;
  const values = c.input.values;
  const dark = surface === 'blue' || ['brand-offer', 'brand-campaign-offer'].includes(c.input.template.id);
  const bg = background(c, dark ? 'blue' : 'light', 'waves');
  const x0 = Math.max(c.m, safe.left + c.m * 0.4), x1 = W - Math.max(c.m, safe.right + c.m * 0.4);
  const y0 = Math.max(c.m * 0.6, safe.top + c.m * 0.3), y1 = H - Math.max(c.m * 0.6, safe.bottom + c.m * 0.3);
  const bandH = y1 - y0;
  const pick = (...keys: string[]) => keys.map((k) => (values[k] ?? '').trim()).find(Boolean) ?? '';
  const main = pick('headline', 'title', 'line1', 'tape');
  const second = pick('subline', 'line2', 'eyebrow', 'tag', 'label');
  const picture = c.input.template.inputs.filter((i) => i.type === 'photo').map((i) => (values[i.key] ?? '').trim()).find(Boolean) ?? '';
  // The campaign template keeps its own (older) lockup on every size.
  const oldLogo = c.input.template.id === 'brand-campaign-offer';
  const logoRatio = oldLogo ? LOGO.old.ratio : LOGO.horizontal.ratio;
  const logoW = Math.min((x1 - x0) * 0.22, bandH * 3.885 * 0.42, oldLogo ? LOGO.old.width * 1.25 : Infinity);
  c.image(oldLogo ? LOGO.old.reversed : dark ? LOGO.horizontal.reversed : LOGO.horizontal.positive, x0, y0 + (bandH - logoW / logoRatio) / 2, logoW, logoW / logoRatio, 'xMidYMid meet');
  const picW = picture ? Math.min(bandH * 1.1, (x1 - x0) * 0.22) : 0;
  if (picture) {
    const clip = roundedClip(c, x1 - picW, y0, picW, bandH, bandH * 0.12);
    const artwork = c.input.template.inputs.some((i) => i.photo?.kind === 'artwork' && values[i.key] === picture);
    c.image(picture, x1 - picW, y0, picW, bandH, artwork ? 'xMidYMid meet' : 'xMidYMin slice', artwork ? undefined : clip);
  }
  const tx0 = x0 + logoW + c.m, tx1 = x1 - picW - (picture ? c.m : 0);
  const ms = c.style(main, 800, dark ? C.white : C.deep), ss = c.style(second, 500, dark ? '#E5ECFF' : C.grey);
  const mf = c.fit(main, ms, { maxWidth: tx1 - tx0, maxLines: 1, max: bandH * 0.42, min: 10 });
  // A long supporting line takes two lines (broken after its «:») rather than shrinking to an unreadable size.
  const secondText = c.width(second, ss, bandH * 0.2) > tx1 - tx0 && /[:：]/.test(second) ? second.replace(/([:：])\s*/, '$1\n') : second;
  const sf = c.fit(secondText, ss, { maxWidth: tx1 - tx0, maxLines: 2, max: bandH * 0.2, min: 8, leading: 1.3 });
  const total = mf.height + (second ? sf.height + bandH * 0.08 : 0);
  let y = y0 + (bandH - total) / 2;
  c.text(mf, ms, c.edge(ms, tx0, tx1), y); y += mf.height + bandH * 0.08;
  if (second) c.text(sf, ss, c.edge(ss, tx0, tx1), y);
  return c.svg(bg);
};

const BUILDERS: Record<string, Builder> = { 'brand-headline': headline, 'brand-instructor': instructor, 'brand-photo-card': photoCard, 'brand-cutout': cutout, 'brand-offer': offer, 'brand-carousel': carousel, 'brand-campaign-offer': campaignOffer };

/** The SVG of a brand template at one canvas. */
export function layoutBrandTemplate(input: LayoutInput): string {
  const build = BUILDERS[input.template.id];
  if (!build) throw new Error(`Unknown brand template ${input.template.id}`);
  const surface = input.template.surfaces.includes(input.surface) ? input.surface : input.template.surfaces[0];
  return (input.canvas.width / input.canvas.height > 2.6 ? banner : build)(new Ctx(input), surface);
}

/** Browser measuring with the brand fonts (load them first with `loadBrandFonts`). */
let canvas2d: CanvasRenderingContext2D | null = null;
export const browserMeasure: Measure = (text, font) => {
  canvas2d ??= document.createElement('canvas').getContext('2d');
  if (!canvas2d) return text.length * 20;
  canvas2d.font = font;
  return canvas2d.measureText(text).width;
};
