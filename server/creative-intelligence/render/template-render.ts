/**
 * The brand-template layout (`src/features/brand-templates/layout.ts`) run on the server (audit #15): the same code
 * the browser previews with, measured with the same brand fonts through HarfBuzz, its text turned into vector
 * outlines (so no server font can stand in for Almarai) and its pictures embedded, then rasterised with sharp.
 * Any size of any template can be made here, with no browser open.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { brandTemplate, type BrandSurface, type BrandTemplate } from '../../../src/domain/brand-templates.js';
import { templateValuesOf, type DesignDoc } from '../../../src/domain/design-doc.js';
import { layoutBrandTemplate, type LayoutCanvas, type Measure } from '../../../src/features/brand-templates/layout.js';
import type { BrandFontFamily } from '../brand/fonts.js';
import { mediaDir } from '../../paths.js';
import { measureInFamily, outlineLine } from '../typography/text-outline.js';

/** `800 96px Almarai` / `600 30.5px "Plus Jakarta Sans"` → its parts. */
function parseFont(font: string): { weight: number; size: number; family: BrandFontFamily } {
  const m = /^(\d+)\s+([\d.]+)px\s+"?([^"]+?)"?$/.exec(font.trim());
  if (!m) throw new Error(`Unreadable font ${font}`);
  return { weight: Number(m[1]), size: Number(m[2]), family: m[3] === 'Almarai' ? 'Almarai' : 'Plus Jakarta Sans' };
}

/** The layout's `measure`, with the vendored brand fonts. */
export const serverMeasure: Measure = (text, font) => {
  const { weight, size, family } = parseFont(font);
  return measureInFamily(text, family, weight, size);
};

const unescape = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** A line of text the layout set: its words and the box it covers on the canvas (rotation included), in pixels. */
export interface SetLine { text: string; box: { x: number; y: number; width: number; height: number }; size: number }

/** `rotate(a cx cy)` of a group, as a function on points; anything else is the identity. */
function rotationOf(transform: string | undefined): ((p: [number, number]) => [number, number]) | null {
  const m = transform && /rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)/.exec(transform);
  if (!m) return null;
  const a = Number(m[1]) * Math.PI / 180, cx = Number(m[2] ?? 0), cy = Number(m[3] ?? 0);
  const cos = Math.cos(a), sin = Math.sin(a);
  return ([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
}

/**
 * Every `<text>` the layout drew, as a `<path>` of its glyph outlines at the same baseline, anchor and direction,
 * and where each line sits (through the rotations of the groups around it). Characters the font lacks are
 * reported, never silently replaced.
 */
export function outlineSvgText(svg: string): { svg: string; missing: string[]; lines: SetLine[] } {
  const missing = new Set<string>();
  const lines: SetLine[] = [];
  const groups: (((p: [number, number]) => [number, number]) | null)[] = [];
  const out = svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>|<g\b([^>]*?)(\/?)>|<\/g>/g, (all, attrs: string | undefined, content: string | undefined, gAttrs: string | undefined, selfClosing: string | undefined) => {
    if (attrs === undefined) {
      if (all === '</g>') groups.pop();
      else if (!selfClosing) groups.push(rotationOf(attr(gAttrs ?? '', 'transform')));
      return all;
    }
    const family = attr(attrs, 'font-family') === 'Almarai' ? 'Almarai' : 'Plus Jakarta Sans';
    const size = Number(attr(attrs, 'font-size'));
    const anchor = (attr(attrs, 'text-anchor') ?? 'start') as 'start' | 'middle' | 'end';
    const body = content ?? '';
    // Coloured runs (`<tspan fill>`) are shaped as one line and drawn as one path per colour.
    const spans = /<tspan\b/.test(body)
      ? [...body.matchAll(/<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/g)].map((m) => ({ text: unescape(m[2]), fill: attr(m[1], 'fill') ?? attr(attrs, 'fill') ?? '#000' }))
      : undefined;
    const text = spans ? spans.map((span) => span.text).join('') : unescape(body);
    const x = Number(attr(attrs, 'x') ?? 0), baseline = Number(attr(attrs, 'y') ?? 0);
    const direction = attr(attrs, 'direction') === 'rtl' ? 'rtl' : 'ltr';
    const line = outlineLine(text, { family, weight: Number(attr(attrs, 'font-weight') ?? 400), size, color: '#000' }, {
      direction, x, baseline, anchor, letterSpacing: Number(attr(attrs, 'letter-spacing') ?? 0), spans,
    });
    line.missing.forEach((char) => missing.add(char));
    if (text.trim()) {
      const left = anchor === 'middle' ? x - line.width / 2 : (anchor === 'start') === (direction === 'ltr') ? x : x - line.width;
      let corners: [number, number][] = [[left, baseline - size], [left + line.width, baseline - size], [left, baseline + size * 0.4], [left + line.width, baseline + size * 0.4]];
      for (let i = groups.length - 1; i >= 0; i--) { const turn = groups[i]; if (turn) corners = corners.map(turn); }
      const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
      lines.push({ text, size, box: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } });
    }
    const keep = (names: string[]) => names.map((name) => { const v = attr(attrs, name); return v === undefined ? '' : ` ${name}="${v}"`; }).join('');
    if (spans) return `<g${keep(['opacity', 'filter', 'clip-path', 'mask', 'transform'])}>${line.parts.map((part) => `<path fill="${part.fill}" d="${part.d}"/>`).join('')}</g>`;
    return `<path${keep(['fill', 'opacity', 'filter', 'clip-path', 'mask', 'transform'])} d="${line.d}"/>`;
  });
  return { svg: out, missing: [...missing], lines };
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

/** The bytes behind an image href the layout uses: a public file, an upload, a Studio picture or a data URL. */
export function imageFile(href: string): { data: Buffer; mime: string } | null {
  if (href.startsWith('data:')) return null;
  const clean = href.split(/[?#]/)[0];
  const ext = clean.split('.').pop()?.toLowerCase() ?? '';
  const upload = /^\/api\/uploads\/([0-9a-f-]{36}\.png)$/.exec(clean);
  const studio = /^\/api\/studio\/([0-9a-f-]{36}\.png)$/.exec(clean);
  const path = upload ? mediaDir('uploads', upload[1]) : studio ? mediaDir('studio', studio[1])
    : /^\/[\w./-]+$/.test(clean) && !clean.includes('..') ? resolve(process.cwd(), 'public', clean.slice(1)) : '';
  if (!path || !existsSync(path) || !MIME[ext]) return null;
  return { data: readFileSync(path), mime: MIME[ext] };
}

/** Every `<image href>` that is not already a data URL, embedded, so the rasteriser needs nothing outside the SVG. */
export function embedImages(svg: string): { svg: string; missing: string[] } {
  const missing: string[] = [];
  const cache = new Map<string, string>();
  const out = svg.replace(/(<image\b[^>]*\shref=")([^"]+)(")/g, (all, before: string, href: string, after: string) => {
    const raw = unescape(href);
    if (raw.startsWith('data:')) return all;
    if (!cache.has(raw)) {
      const file = imageFile(raw);
      if (!file) { missing.push(raw); cache.set(raw, ''); } else cache.set(raw, `data:${file.mime};base64,${file.data.toString('base64')}`);
    }
    return `${before}${cache.get(raw) ?? ''}${after}`;
  });
  return { svg: out, missing };
}

export interface TemplateRender { png: Buffer; svg: string; width: number; height: number; problems: string[]; lines: SetLine[] }

/** A laid-out template SVG (with `<text>` and picture links) as a PNG: text outlined, pictures embedded. */
export async function rasterizeLayout(laid: string): Promise<TemplateRender> {
  const outlined = outlineSvgText(laid);
  const embedded = embedImages(outlined.svg);
  const problems = [
    ...(outlined.missing.length ? [`The brand fonts have no glyph for: ${outlined.missing.join(' ')}`] : []),
    ...embedded.missing.map((href) => `Picture not found on this server: ${href.slice(0, 80)}`),
  ];
  const png = await sharp(Buffer.from(embedded.svg), { limitInputPixels: 80_000_000 }).png().toBuffer();
  const { width = 0, height = 0 } = await sharp(png).metadata();
  return { png, svg: embedded.svg, width, height, problems, lines: outlined.lines };
}

/** The layout's SVG for a template at one canvas, measured on the server. */
export const layoutOnServer = (input: { template: BrandTemplate; values: Record<string, string>; surface: BrandSurface; canvas: LayoutCanvas; cutouts?: Record<string, boolean> }) =>
  layoutBrandTemplate({ template: input.template, values: input.values, surface: input.surface, canvas: input.canvas, measure: serverMeasure, cutouts: input.cutouts });

/** A brand template with its values at one canvas, as a PNG made on the server. */
export async function renderTemplatePng(input: { template: BrandTemplate; values: Record<string, string>; surface: BrandSurface; canvas: LayoutCanvas; cutouts?: Record<string, boolean> }): Promise<TemplateRender> {
  return rasterizeLayout(layoutOnServer(input));
}

/** A design document at one canvas. Template documents render through their template's layout. */
export async function renderDesignDocPng(doc: DesignDoc, canvas: LayoutCanvas, cutouts?: Record<string, boolean>): Promise<TemplateRender> {
  const template = templateValuesOf(doc);
  if (!template) throw new Error(`No server renderer for ${doc.source.kind} designs yet`);
  return renderTemplatePng({ ...template, canvas, cutouts });
}

/** By template id, for routes. */
export async function renderTemplateById(templateId: string, values: Record<string, string>, surface: BrandSurface, canvas: LayoutCanvas, cutouts?: Record<string, boolean>): Promise<TemplateRender | null> {
  const template = brandTemplate(templateId);
  return template ? renderTemplatePng({ template, values, surface, canvas, cutouts }) : null;
}
