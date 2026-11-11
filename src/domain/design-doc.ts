/**
 * DesignDoc: one description of a design, whichever way it was made (audit #14). A brand template with its values,
 * a design the AI followed (a library design or an upload, read into blocks by vision) and a Studio document all
 * convert to it, and what reads a design (the skeleton renderer, other sizes, the Studio, publishing) reads this.
 *
 * Boxes are fractions of the canvas from the top-left, so the same document describes every size; the renderer
 * decides the exact pixels per canvas. Pure data and pure functions: shared by the browser and the server.
 */
import type { BrandKitId } from './brand-kits';
import { brandTemplate, templateKit, type BrandSurface, type BrandTemplate } from './brand-templates';
import type { StudioDoc } from './studio';

export const DESIGN_DOC_VERSION = 'design-doc:v1' as const;

export interface DesignBox { x: number; y: number; width: number; height: number }

/** The same kinds the follow-design reader uses (`CopyBlock.kind`), so its blocks convert without loss. */
export type TextBlockKind = 'headline' | 'line' | 'price' | 'label' | 'button' | 'mark';

export interface TextLayerDoc {
  kind: 'text';
  /** Stable within the document: the template input key, or `b1`, `b2`… for read blocks. */
  id: string;
  /** What the block is in the design: `headline`, `tape`, `price ticket`, a template input key… */
  role: string;
  block: TextBlockKind;
  /** The words, exactly as they go on the post. */
  text: string;
  /** The words the block had in the design it came from (followed designs). */
  was?: string;
  /** A phrase inside the text set in the accent colour. */
  highlight?: string;
  box?: DesignBox;
  /** Size as a fraction of the canvas height; colour as #RRGGBB. Unset: the renderer decides. */
  font?: { weight?: number; size?: number; color?: string; align?: 'start' | 'center' | 'end' };
  /** A fact (price, date, name, place): only the person or the course data may change it. */
  fact?: boolean;
}

export interface PhotoLayerDoc {
  kind: 'photo';
  id: string;
  role: string;
  /** URL or data URL of the picture; empty while it has to be uploaded or drawn. */
  src: string;
  box?: DesignBox;
  /** A real named person (never drawn by AI), an unnamed model, a scene. */
  subject?: 'person' | 'model' | 'scene';
  /** Transparent background: stands free instead of framed. */
  cutout?: boolean;
}

export interface ShapeLayerDoc { kind: 'shape'; id: string; box: DesignBox; fill: string; radius?: number }

export type DesignLayer = TextLayerDoc | PhotoLayerDoc | ShapeLayerDoc;

/** Artwork placed from its file, never redrawn: a campaign stamp, a hashtag. */
export interface FixedFile { key: string; src: string; place: DesignBox; says?: string }

export type DesignSource =
  | { kind: 'template'; templateId: string; surface: BrandSurface }
  | { kind: 'followed'; name: string; templateId?: string }
  | { kind: 'studio' };

export interface DesignDoc {
  version: typeof DESIGN_DOC_VERSION;
  source: DesignSource;
  /** The shape the boxes were measured on (width / height). Other shapes are laid out again, never stretched. */
  aspect: number;
  language: 'ar' | 'en';
  background?: { color?: string; image?: string; grain?: boolean };
  layers: DesignLayer[];
  fixed: FixedFile[];
  /** The logo kit and, when the design has one, its spot. Without a spot the renderer or resolver picks the corner. */
  logo: { kit: BrandKitId; place?: DesignBox };
  /** Template choices that are not words on the post (a label's colour). */
  settings?: Record<string, string>;
}

/** Template inputs that choose something (a colour) rather than hold words for the post. */
const isSetting = (key: string) => /Color$/.test(key);

const isArabic = (text: string) => /[؀-ۿ]/.test(text);
const languageOf = (texts: string[]): 'ar' | 'en' => (texts.some(isArabic) || !texts.some((t) => /[a-z]/i.test(t)) ? 'ar' : 'en');
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fraction = (box: DesignBox): DesignBox => ({ x: clamp01(box.x), y: clamp01(box.y), width: clamp01(box.width), height: clamp01(box.height) });

/** Which block kind a template input plays, from its key. */
function templateBlock(key: string): TextBlockKind {
  if (/^(headline|title)$/.test(key)) return 'headline';
  if (/price|oldPrice/i.test(key)) return 'price';
  if (/^(cta|button)$/.test(key)) return 'button';
  if (/^(website|hashtag)$/.test(key)) return 'mark';
  if (/^(tag|eyebrow|label|instead|currency|badge)$/.test(key)) return 'label';
  return 'line';
}

/** A brand template with its values (the words and photos on the post). */
export function designDocFromTemplate(template: BrandTemplate, values: Record<string, string>, surface: BrandSurface = template.surfaces[0]): DesignDoc {
  const layers: DesignLayer[] = [];
  const fixed: FixedFile[] = [];
  const settings: Record<string, string> = {};
  for (const input of template.inputs) {
    const value = (values[input.key] ?? '').trim();
    if (input.type === 'photo') {
      if (input.photo?.kind === 'artwork') {
        if (value && input.place) fixed.push({ key: input.key, src: value, place: input.place, ...(input.says ? { says: input.says } : {}) });
        continue;
      }
      layers.push({ kind: 'photo', id: input.key, role: input.key, src: value, ...(input.photo ? { subject: input.photo.kind as PhotoLayerDoc['subject'], cutout: input.photo.cutout } : {}) });
      continue;
    }
    if (input.key === 'highlight') continue;
    if (isSetting(input.key)) { if (value) settings[input.key] = value; continue; }
    layers.push({
      kind: 'text', id: input.key, role: input.key, block: templateBlock(input.key), text: value,
      ...(input.key === 'headline' && values.highlight?.trim() ? { highlight: values.highlight.trim() } : {}),
      ...(input.fact ? { fact: true } : {}),
    });
  }
  const texts = layers.flatMap((l) => (l.kind === 'text' ? [l.text] : []));
  return {
    version: DESIGN_DOC_VERSION,
    source: { kind: 'template', templateId: template.id, surface: template.surfaces.includes(surface) ? surface : template.surfaces[0] },
    aspect: 1080 / 1350,
    language: languageOf(texts),
    layers, fixed,
    logo: { kit: templateKit(template).id, ...(template.logo ? { place: template.logo.place } : {}) },
    ...(Object.keys(settings).length ? { settings } : {}),
  };
}

/** The template values a template document holds, for the template renderer (the inverse of `designDocFromTemplate`). */
export function templateValuesOf(doc: DesignDoc): { template: BrandTemplate; values: Record<string, string>; surface: BrandSurface } | null {
  if (doc.source.kind !== 'template') return null;
  const template = brandTemplate(doc.source.templateId);
  if (!template) return null;
  const values: Record<string, string> = {};
  for (const layer of doc.layers) {
    if (layer.kind === 'text') { values[layer.id] = layer.text; if (layer.highlight) values.highlight = layer.highlight; }
    if (layer.kind === 'photo') values[layer.id] = layer.src;
  }
  for (const file of doc.fixed) values[file.key] = file.src;
  Object.assign(values, doc.settings ?? {});
  return { template, values, surface: doc.source.surface };
}

/** The shape of a block read from a followed design (`CopyBlock` in the server's copy check). */
export interface ReadBlock { role: string; kind: TextBlockKind; text: string; was?: string; box?: DesignBox; highlight?: string }

/**
 * A design the AI follows (a library design or an upload), with the blocks vision read from it and the words they
 * now hold. Campaign artwork and the design's own logo come from the follow design.
 */
export function designDocFromFollowed(input: {
  name: string; templateId?: string; aspect: number; blocks: ReadBlock[];
  artworks?: { key: string; src: string; place: DesignBox; says?: string }[];
  logo?: { kit: BrandKitId; place: DesignBox };
  photos?: string;
}): DesignDoc {
  const layers: DesignLayer[] = input.blocks.map((block, i) => ({
    kind: 'text', id: `b${i + 1}`, role: block.role, block: block.kind, text: block.text,
    ...(block.was ? { was: block.was } : {}), ...(block.highlight ? { highlight: block.highlight } : {}), ...(block.box ? { box: fraction(block.box) } : {}),
  }));
  return {
    version: DESIGN_DOC_VERSION,
    source: { kind: 'followed', name: input.name, ...(input.templateId ? { templateId: input.templateId } : {}) },
    aspect: input.aspect,
    language: languageOf(input.blocks.map((b) => b.text)),
    layers,
    fixed: (input.artworks ?? []).map((a) => ({ key: a.key, src: a.src, place: a.place, ...(a.says ? { says: a.says } : {}) })),
    logo: input.logo ? { kit: input.logo.kit, place: input.logo.place } : { kit: 'official' },
  };
}

/** The read blocks of a followed document, in order (the inverse of `designDocFromFollowed` for its text). */
export const readBlocksOf = (doc: DesignDoc): ReadBlock[] => doc.layers.flatMap((l) => (l.kind === 'text'
  ? [{ role: l.role, kind: l.block, text: l.text, ...(l.was !== undefined ? { was: l.was } : {}), ...(l.box ? { box: l.box } : {}), ...(l.highlight ? { highlight: l.highlight } : {}) }]
  : []));

/** A Studio document: pixel layers become fractional boxes; the clean background stays its image. */
export function designDocFromStudio(doc: StudioDoc, baseUrl: (file: string) => string): DesignDoc {
  const W = doc.width, H = doc.height;
  const box = (x: number, y: number, w: number, h: number) => fraction({ x: x / W, y: y / H, width: w / W, height: h / H });
  const layers: DesignLayer[] = [];
  doc.layers.forEach((layer) => {
    if (layer.hidden) return;
    if (layer.kind === 'text') {
      const lines = Math.max(1, layer.text.split('\n').length);
      layers.push({ kind: 'text', id: layer.id, role: layer.name ?? 'text', block: 'line', text: layer.text, box: box(layer.x, layer.y, layer.width, layer.size * layer.lineHeight * lines), font: { weight: layer.weight, size: layer.size / H, color: layer.color, align: layer.align } });
    } else if (layer.kind === 'image') {
      layers.push({ kind: 'photo', id: layer.id, role: layer.name ?? 'image', src: baseUrl(layer.file), box: box(layer.x, layer.y, layer.width, layer.height) });
    } else {
      layers.push({ kind: 'shape', id: layer.id, box: box(layer.x, layer.y, layer.width, layer.height), fill: layer.fill, ...(layer.radius ? { radius: layer.radius / Math.min(W, H) } : {}) });
    }
  });
  return {
    version: DESIGN_DOC_VERSION, source: { kind: 'studio' }, aspect: W / H,
    language: languageOf(layers.flatMap((l) => (l.kind === 'text' ? [l.text] : []))),
    background: { image: baseUrl(doc.baseFile) },
    layers, fixed: [],
    logo: { kit: doc.kit ?? 'official' },
  };
}

/** Every word on the design, in order: what the verification step reads back from the image. */
export const designWords = (doc: DesignDoc): { id: string; text: string; box?: DesignBox }[] =>
  doc.layers.flatMap((l) => (l.kind === 'text' && l.text.trim() ? [{ id: l.id, text: l.text.trim(), ...(l.box ? { box: l.box } : {}) }] : []));
