/**
 * Studio document: a generated post split into a clean background and layers you can edit one by one.
 * Shared by the server (decompose, render) and the editor. Layers are drawn in array order, bottom first.
 */

export const STUDIO_VERSION = 'studio:v2';

export interface Box { x: number; y: number; width: number; height: number }

interface LayerBase {
  id: string;
  /** Short label for the layers list, e.g. "Button" or "Person". */
  name?: string;
  x: number;
  y: number;
  /** 0..1 */
  opacity: number;
  hidden?: boolean;
  /** Layers in one group (a shape with the text and icons lifted from it, or a group the user made) select and move together. */
  group?: string;
  /** Degrees clockwise around the layer's centre. */
  rotation?: number;
  /** Editor only: a locked layer can be selected but not moved, resized or deleted. */
  locked?: boolean;
}

/** Brand-font text. Line breaks typed in `text` are kept; longer lines wrap at `width` between words. */
export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  width: number;
  size: number;
  color: string;
  weight: number;
  align: 'start' | 'center' | 'end';
  lineHeight: number;
  /** Soft drop shadow that keeps text readable on busy pictures. */
  shadow?: boolean;
  /** Original glyph pixels, used until the wording or typography changes. Position/rotation remain editable. */
  source?: { file: string; x: number; y: number; width: number; height: number; signature: string };
}

export const textAppearanceKey = (layer: Pick<TextLayer, 'text' | 'width' | 'size' | 'color' | 'weight' | 'align' | 'lineHeight' | 'shadow'>) =>
  JSON.stringify([layer.text, layer.width, layer.size, layer.color, layer.weight, layer.align, layer.lineHeight, Boolean(layer.shadow)]);
export const originalTextAppearance = (layer: TextLayer) => layer.source?.signature === textAppearanceKey(layer) ? layer.source : undefined;

/** Flat UI shape: button, pill, badge or panel. `fill2` makes a left-to-right gradient. */
export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  width: number;
  height: number;
  fill: string;
  fill2?: string | null;
  radius: number;
  shadow?: boolean;
  /** Border drawn inside the shape's box. */
  stroke?: string | null;
  strokeWidth?: number;
}

/** Bitmap with transparency: icons lifted from a shape, an extracted object, or an uploaded image. */
export interface ImageLayer extends LayerBase {
  kind: 'image';
  file: string;
  width: number;
  height: number;
  flipX?: boolean;
  flipY?: boolean;
}

export type StudioLayer = TextLayer | ShapeLayer | ImageLayer;

/** Something in the background that can be lifted into its own layer on request. */
export interface StudioObject { id: string; label: string; box: Box }

export interface StudioZone { kind: 'text' | 'face' | 'subject' | 'cta' | 'platform-ui' | 'salient'; box: Box; label?: string }

export interface StudioDoc {
  version: typeof STUDIO_VERSION;
  width: number;
  height: number;
  /** Background under every layer: the clean plate after decomposition, or the original. */
  baseFile: string;
  notices?: string[];
  layers: StudioLayer[];
  /** Objects found in the background (people, devices, icons) that can be extracted. */
  objects: StudioObject[];
  /** Faces and subjects, kept so the logo never lands on them. */
  zones: StudioZone[];
  logo: { variantId: 'lockup-reversed' | 'lockup-positive' | 'symbol-reversed' | 'symbol-positive'; x: number; y: number; width: number } | null;
}

export const STUDIO_FILE = /^[0-9a-f-]{36}\.png$/;
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Upgrades a saved document of any earlier version; returns null for anything that is not a Studio doc. */
export function migrateStudioDoc(raw: unknown): StudioDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Record<string, unknown>;
  if (doc.version === STUDIO_VERSION) return { ...(doc as unknown as StudioDoc), objects: Array.isArray(doc.objects) ? (doc.objects as StudioDoc['objects']) : [] };
  if (doc.version !== 'studio:v1' || !Array.isArray(doc.layers)) return null;
  const layers = (doc.layers as Record<string, unknown>[]).map((l): TextLayer => ({
    kind: 'text', id: String(l.id), text: String(l.text ?? ''), x: Number(l.x), y: Number(l.y), width: Number(l.width), size: Number(l.size),
    color: String(l.color), weight: Number(l.weight), align: (l.align as TextLayer['align']) ?? 'start', lineHeight: Number(l.lineHeight ?? 1.3), opacity: 1,
  }));
  return { ...(doc as unknown as Omit<StudioDoc, 'version' | 'layers' | 'objects'>), version: STUDIO_VERSION, layers, objects: [] };
}

/** Height of a layer's box. Text height comes from the renderer, so callers pass it in. */
export const layerHeight = (layer: StudioLayer, textHeight = 0) => (layer.kind === 'text' ? textHeight : layer.height);

/* SVG drawing rules shared by the editor canvas and the server render, so both show the same thing. */

const r2 = (n: number) => Math.round(n * 100) / 100;
/** `rotate(...)` around the layer's centre, or '' when it is not rotated. */
export function rotateTransform(layer: StudioLayer, height: number): string {
  const deg = layer.rotation ?? 0;
  if (!deg) return '';
  return `rotate(${r2(deg)} ${r2(layer.x + layer.width / 2)} ${r2(layer.y + height / 2)})`;
}
/** Mirror transform for a flipped picture, or '' when it is not flipped. */
export function flipTransform(layer: ImageLayer): string {
  if (!layer.flipX && !layer.flipY) return '';
  const tx = layer.flipX ? 2 * layer.x + layer.width : 0, ty = layer.flipY ? 2 * layer.y + layer.height : 0;
  return `translate(${r2(tx)} ${r2(ty)}) scale(${layer.flipX ? -1 : 1} ${layer.flipY ? -1 : 1})`;
}
/** Drop shadow under a shape, scaled to its size. */
export function shapeShadow(layer: ShapeLayer) {
  const blur = Math.max(4, Math.min(layer.width, layer.height) * 0.12);
  return { dy: r2(blur * 0.6), blur: r2(blur), color: '#0B1B4D', opacity: 0.18 };
}
/** Drop shadow under text, scaled to its size. */
export function textShadow(layer: TextLayer) {
  return { dy: r2(Math.max(1, layer.size * 0.05)), blur: r2(Math.max(2, layer.size * 0.08)), color: '#000000', opacity: 0.35 };
}
/** Border width actually drawn: never more than half the shape's short side. */
export const strokeOf = (layer: ShapeLayer) => (layer.stroke ? Math.max(0, Math.min(layer.strokeWidth ?? 4, Math.min(layer.width, layer.height) / 2)) : 0);
