/**
 * Fills an SVG template in the browser: text slots get the values (single lines shrink to fit, paragraphs wrap
 * with Arabic shaping measured by the real fonts), image slots get their pictures, the logo slot gets the exact
 * official file. Export rasterises with the brand fonts embedded, so the PNG matches the preview.
 */

export type FieldType = 'text' | 'multiline' | 'date' | 'time' | 'url' | 'image';
export type FieldSource = 'manual' | 'odoo.title' | 'odoo.date' | 'odoo.time' | 'odoo.location' | 'odoo.link';
export interface TemplateField { key: string; label: string; type: FieldType; source: FieldSource; sample: string; maxChars: number }
export type TemplateFormat = 'feed' | 'square' | 'story' | 'landscape';
export interface SvgTemplate { id: string; name: string; description: string; format: TemplateFormat; width: number; height: number; svg: string; fields: TemplateField[]; sourcePrompt: string; createdBy: string; usageCount: number; createdAt: string; updatedAt: string }

export const FORMAT_LABEL: Record<TemplateFormat, { en: string; ar: string; size: string }> = {
  feed: { en: 'Feed 4:5', ar: 'فيد 4:5', size: '1080×1350' },
  square: { en: 'Square 1:1', ar: 'مربع 1:1', size: '1080×1080' },
  story: { en: 'Story 9:16', ar: 'ستوري 9:16', size: '1080×1920' },
  landscape: { en: 'Website 1.91:1', ar: 'موقع 1.91:1', size: '1200×630' },
};

const LOGO_FILES: Record<string, string> = {
  'lockup-reversed': '/brand/logos/engosoft-lockup-reversed.svg',
  'lockup-positive': '/brand/logos/engosoft-lockup-positive.svg',
  'symbol-reversed': '/brand/logos/engosoft-symbol-reversed.svg',
  'symbol-positive': '/brand/logos/engosoft-symbol-positive.svg',
};
const FONT_FILES = [
  { family: 'Almarai', weight: '400', url: '/brand/fonts/Almarai-Regular.ttf' },
  { family: 'Almarai', weight: '700', url: '/brand/fonts/Almarai-Bold.ttf' },
  { family: 'Almarai', weight: '800', url: '/brand/fonts/Almarai-ExtraBold.ttf' },
  { family: 'Plus Jakarta Sans', weight: '200 800', url: '/brand/fonts/PlusJakartaSans.ttf' },
];

let fontsReady: Promise<void> | null = null;
/** Loads the brand fonts into the document so measuring and preview use the same glyphs as the export. */
export function loadBrandFonts(): Promise<void> {
  fontsReady ??= Promise.all(
    FONT_FILES.map(async (font) => {
      try {
        const face = new FontFace(font.family, `url(${font.url})`, { weight: font.weight });
        document.fonts.add(await face.load());
      } catch {
        /* Google Fonts copy of the same family still renders the preview. */
      }
    }),
  ).then(() => undefined);
  return fontsReady;
}

let measurer: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: string): number {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return text.length * 20;
  measurer.font = font;
  return measurer.measureText(text).width;
}

function fontOf(el: Element, size: number): string {
  const read = (name: string) => el.getAttribute(name) || (el as SVGElement).style?.getPropertyValue(name) || el.closest(`[${name}]`)?.getAttribute(name) || '';
  const family = read('font-family') || 'Almarai';
  const weight = read('font-weight') || '400';
  return `${weight} ${size}px ${family}`;
}

/** Splits a paragraph into lines no wider than maxWidth, keeping explicit line breaks. */
function wrap(text: string, maxWidth: number, font: string): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, font) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

export const sampleValues = (fields: TemplateField[]) => Object.fromEntries(fields.map((field) => [field.key, field.sample]));

/** Returns the filled SVG markup. `logoHref` maps a logo variant to the URL to use (file path for preview, data URI for export). */
export function fillSvg(svg: string, values: Record<string, string>, logoHref: (variant: string) => string = (variant) => LOGO_FILES[variant] ?? LOGO_FILES['lockup-reversed']): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg' || doc.querySelector('parsererror')) return svg;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Right-aligned Arabic: in SVG, "start" is the right edge when direction is rtl; "end" would push the text off the
  // canvas. Models often write rtl + end meaning right-aligned, so normalise it.
  root.querySelectorAll('text').forEach((el) => {
    const direction = el.getAttribute('direction') || el.closest('[direction]')?.getAttribute('direction');
    if (direction === 'rtl' && el.getAttribute('text-anchor') === 'end') el.setAttribute('text-anchor', 'start');
  });

  root.querySelectorAll('[data-field]').forEach((el) => {
    const key = el.getAttribute('data-field')!;
    const value = values[key];
    if (value == null) return;
    if (el.nodeName === 'image') {
      if (value) el.setAttribute('href', value);
      else el.removeAttribute('href');
      return;
    }
    if (el.nodeName !== 'text') return;
    const size = Number.parseFloat(el.getAttribute('font-size') || (el as SVGElement).style?.fontSize || '40') || 40;
    const maxWidth = Number(el.getAttribute('data-max-width')) || 0;
    const lineHeight = Number(el.getAttribute('data-line-height')) || 0;
    const maxLines = Number(el.getAttribute('data-max-lines')) || 0;
    const x = el.getAttribute('x') ?? '0';
    while (el.firstChild) el.removeChild(el.firstChild);
    if (lineHeight && maxWidth) {
      let lines = wrap(value, maxWidth, fontOf(el, size));
      if (maxLines && lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}…`;
      }
      lines.forEach((line, index) => {
        const span = doc.createElementNS(SVG_NS, 'tspan');
        span.setAttribute('x', x);
        if (index > 0) span.setAttribute('dy', String(lineHeight));
        span.textContent = line;
        el.appendChild(span);
      });
      return;
    }
    el.textContent = value;
    if (maxWidth) {
      const width = textWidth(value, fontOf(el, size));
      if (width > maxWidth) el.setAttribute('font-size', String(Math.max(12, Math.floor(size * (maxWidth / width)))));
    }
  });

  root.querySelectorAll('[data-role="logo"]').forEach((el) => {
    el.setAttribute('href', logoHref(el.getAttribute('data-variant') || 'lockup-reversed'));
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  });
  return new XMLSerializer().serializeToString(root);
}

const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
const cache = new Map<string, Promise<string>>();
const embed = (url: string) => {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => r.blob()).then(toDataUrl));
  return cache.get(url)!;
};

/** Rasterises the filled template to a PNG data URL at its exact platform size. */
export async function exportPng(template: Pick<SvgTemplate, 'svg' | 'width' | 'height'>, values: Record<string, string>): Promise<string> {
  await loadBrandFonts();
  const logos = Object.fromEntries(await Promise.all(Object.entries(LOGO_FILES).map(async ([variant, url]) => [variant, await embed(url)] as const)));
  const filled = fillSvg(template.svg, values, (variant) => logos[variant] ?? logos['lockup-reversed']);
  const fontCss = (await Promise.all(FONT_FILES.map(async (font) => `@font-face{font-family:'${font.family}';font-weight:${font.weight};src:url(${await embed(font.url)}) format('truetype');}`))).join('');
  const withFonts = filled.replace(/<svg([^>]*)>/, `<svg$1><style>${fontCss}</style>`);
  const blob = new Blob([withFonts], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.width = template.width;
    image.height = template.height;
    image.src = url;
    await image.decode();
    // Give embedded fonts a frame to settle before drawing.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const canvas = document.createElement('canvas');
    canvas.width = template.width;
    canvas.height = template.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, template.width, template.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Values an Odoo event fills automatically, formatted the way posts write them. */
export interface OdooEvent { id: string; title: string; startsAt: string; endsAt: string; source: string; location?: string; registrationUrl?: string }
export function odooValues(event: OdooEvent, fields: TemplateField[]): Record<string, string> {
  const start = new Date(event.startsAt);
  const date = start.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' });
  const time = start.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' });
  const bySource: Record<FieldSource, string | undefined> = {
    manual: undefined, 'odoo.title': event.title, 'odoo.date': date, 'odoo.time': time, 'odoo.location': event.location, 'odoo.link': event.registrationUrl,
  };
  return Object.fromEntries(fields.flatMap((field) => {
    const value = bySource[field.source];
    return value ? [[field.key, value]] : [];
  }));
}
