/** Pure edits on a Studio document. Every function returns a new document. */
import { originalTextAppearance, textAppearanceKey, type Box, ImageLayer, ShapeLayer, StudioDoc, StudioLayer, TextLayer } from '../../domain/studio';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
/** Rendered height of a text layer (from its outline), when known. */
export type Heights = (id: string) => number | undefined;

export const newLayerId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;
const round = (n: number) => Math.round(n);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The layer's box; text height comes from its outline (or an estimate until the outline arrives). */
export function boxOf(layer: StudioLayer, textHeight?: number): Box {
  if (layer.kind !== 'text') return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
  const lines = Math.max(1, layer.text.split('\n').length);
  return { x: layer.x, y: layer.y, width: layer.width, height: textHeight ?? layer.size * (1 + (lines - 1) * layer.lineHeight) };
}

/** Axis-aligned box around the layer after rotation. */
export function boundsOf(layer: StudioLayer, textHeight?: number): Box {
  const b = boxOf(layer, textHeight);
  const r = ((layer.rotation ?? 0) * Math.PI) / 180;
  if (!r) return b;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const width = b.width * c + b.height * s, height = b.width * s + b.height * c;
  return { x: b.x + b.width / 2 - width / 2, y: b.y + b.height / 2 - height / 2, width, height };
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}

export const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function selectionBounds(doc: StudioDoc, ids: Iterable<string>, heights: Heights): Box | null {
  const set = new Set(ids);
  return unionBox(doc.layers.filter((l) => set.has(l.id) && !l.hidden).map((l) => boundsOf(l, heights(l.id))));
}

export function updateLayer(doc: StudioDoc, id: string, patch: Partial<StudioLayer>): StudioDoc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as StudioLayer) : l)) };
}

/** Applies a patch to every layer in `ids`; `patch` may depend on the layer. */
export function updateLayers(doc: StudioDoc, ids: Iterable<string>, patch: Partial<StudioLayer> | ((layer: StudioLayer) => Partial<StudioLayer>)): StudioDoc {
  const set = new Set(ids);
  return { ...doc, layers: doc.layers.map((l) => (set.has(l.id) ? ({ ...l, ...(typeof patch === 'function' ? patch(l) : patch) } as StudioLayer) : l)) };
}

/** Every layer in the same group as `id`, or just `id`. */
export function groupOf(doc: StudioDoc, id: string): string[] {
  const layer = doc.layers.find((l) => l.id === id);
  if (!layer) return [];
  if (!layer.group) return [id];
  return doc.layers.filter((l) => l.group === layer.group).map((l) => l.id);
}

/** Layers that move when the selection is dragged: everything selected that is not locked. */
export const movable = (doc: StudioDoc, ids: Iterable<string>) => {
  const set = new Set(ids);
  return new Set(doc.layers.filter((l) => set.has(l.id) && !l.locked).map((l) => l.id));
};

export function moveLayers(doc: StudioDoc, ids: Set<string>, dx: number, dy: number): StudioDoc {
  return { ...doc, layers: doc.layers.map((l) => (ids.has(l.id) && !l.locked ? { ...l, x: round(l.x + dx), y: round(l.y + dy) } : l)) };
}

/**
 * Resize from a handle, in the layer's own (rotated) frame; the opposite edge or corner stays put.
 * Text: side handles change the wrapping width, corners scale the font. Images keep their proportions
 * from the corners. `keepRatio` (Shift) keeps a shape's proportions; `fromCenter` (Alt) resizes around the centre.
 */
export function resizeLayer(start: StudioLayer, handle: Handle, dxWorld: number, dyWorld: number, opts: { textHeight?: number; keepRatio?: boolean; fromCenter?: boolean } = {}): StudioLayer {
  const min = 12;
  const rad = ((start.rotation ?? 0) * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = dxWorld * cos + dyWorld * sin, dy = -dxWorld * sin + dyWorld * cos;
  const w0 = start.width, h0 = start.kind === 'text' ? Math.max(1, opts.textHeight ?? start.size) : start.height;
  const corner = handle.length === 2;
  const k = opts.fromCenter ? 2 : 1;
  let w = w0, h = h0;
  if (handle.includes('e')) w = w0 + dx * k;
  if (handle.includes('w')) w = w0 - dx * k;
  if (start.kind !== 'text' || corner) {
    if (handle.includes('s')) h = h0 + dy * k;
    if (handle.includes('n')) h = h0 - dy * k;
  }
  w = Math.max(min, w); h = Math.max(min, h);
  const proportional = corner && (start.kind !== 'shape' || opts.keepRatio);
  let scale = 1;
  if (proportional) {
    // Project the dragged corner onto the box diagonal, so wide text scales with sideways drags.
    const sx = handle.includes('e') ? 1 : -1, sy = handle.includes('s') ? 1 : -1;
    scale = Math.max(0.01, ((w0 + sx * dx * k) * w0 + (h0 + sy * dy * k) * h0) / (w0 * w0 + h0 * h0));
    if (start.kind === 'text') scale = clamp(scale, 8 / start.size, 400 / start.size);
    w = Math.max(min, w0 * scale); h = Math.max(min, h0 * scale);
  }
  // Where the new box sits in the old box's frame, then the centre shift turned back into page space.
  const left = opts.fromCenter ? (w0 - w) / 2 : handle.includes('w') ? w0 - w : 0;
  const top = opts.fromCenter ? (h0 - h) / 2 : handle.includes('n') ? h0 - h : 0;
  const cx = left + w / 2 - w0 / 2, cy = top + h / 2 - h0 / 2;
  const centerX = start.x + w0 / 2 + cx * cos - cy * sin, centerY = start.y + h0 / 2 + cx * sin + cy * cos;
  const x = round(centerX - w / 2), y = round(centerY - h / 2);
  if (start.kind === 'text') {
    const next = { ...start, x, y, width: round(w), size: proportional ? clamp(round(start.size * scale), 8, 400) : start.size };
    const source = originalTextAppearance(start);
    if (proportional && source) {
      const factor = next.width / start.width;
      next.source = { ...source, x: source.x * factor, y: source.y * factor, width: source.width * factor, height: source.height * factor, signature: textAppearanceKey(next) };
    }
    return next;
  }
  const resized = { ...start, x, y, width: round(w), height: round(h) };
  if (resized.kind === 'shape') resized.radius = Math.min(resized.radius, Math.floor(Math.min(resized.width, resized.height) / 2));
  return resized;
}

/** Normalised to (-180, 180]. */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return Math.round(a * 10) / 10;
}

/** Angle for a rotate drag: snaps to 15° steps with Shift, and to the right angles when close. */
export function snapAngle(deg: number, step: boolean): number {
  if (step) return normalizeAngle(Math.round(deg / 15) * 15);
  const nearest = Math.round(deg / 90) * 90;
  return normalizeAngle(Math.abs(deg - nearest) < 4 ? nearest : deg);
}

/** Layers that act as one unit for aligning and distributing: whole groups, and single layers. */
function units(doc: StudioDoc, ids: string[]): string[][] {
  const set = new Set(ids), seen = new Set<string>(), out: string[][] = [];
  for (const layer of doc.layers) {
    if (!set.has(layer.id) || seen.has(layer.id)) continue;
    const members = groupOf(doc, layer.id);
    const unit = members.every((m) => set.has(m)) ? members : [layer.id];
    unit.forEach((m) => seen.add(m));
    out.push(unit);
  }
  return out;
}

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** One unit aligns to the page; several align to the box around them. Locked layers stay put. */
export function alignLayers(doc: StudioDoc, ids: string[], edge: AlignEdge, heights: Heights): StudioDoc {
  const parts = units(doc, ids).map((unit) => ({ unit, box: selectionBounds(doc, unit, heights) })).filter((p): p is { unit: string[]; box: Box } => Boolean(p.box));
  if (!parts.length) return doc;
  const target = parts.length === 1 ? { x: 0, y: 0, width: doc.width, height: doc.height } : unionBox(parts.map((p) => p.box))!;
  let next = doc;
  for (const { unit, box } of parts) {
    const dx = edge === 'left' ? target.x - box.x : edge === 'right' ? target.x + target.width - box.x - box.width : edge === 'hcenter' ? target.x + target.width / 2 - box.x - box.width / 2 : 0;
    const dy = edge === 'top' ? target.y - box.y : edge === 'bottom' ? target.y + target.height - box.y - box.height : edge === 'vcenter' ? target.y + target.height / 2 - box.y - box.height / 2 : 0;
    next = moveLayers(next, new Set(unit), dx, dy);
  }
  return next;
}

/** Equal gaps between three or more units, keeping the first and last where they are. */
export function distributeLayers(doc: StudioDoc, ids: string[], axis: 'x' | 'y', heights: Heights): StudioDoc {
  const parts = units(doc, ids).map((unit) => ({ unit, box: selectionBounds(doc, unit, heights) })).filter((p): p is { unit: string[]; box: Box } => Boolean(p.box));
  if (parts.length < 3) return doc;
  const pos = (b: Box) => (axis === 'x' ? b.x : b.y), size = (b: Box) => (axis === 'x' ? b.width : b.height);
  parts.sort((a, b) => pos(a.box) - pos(b.box));
  const first = parts[0].box, last = parts[parts.length - 1].box;
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - parts.reduce((sum, p) => sum + size(p.box), 0)) / (parts.length - 1);
  let cursor = pos(first) + size(first) + gap, next = doc;
  for (const part of parts.slice(1, -1)) {
    const shift = cursor - pos(part.box);
    next = moveLayers(next, new Set(part.unit), axis === 'x' ? shift : 0, axis === 'y' ? shift : 0);
    cursor += size(part.box) + gap;
  }
  return next;
}

export type Arrange = 'forward' | 'backward' | 'front' | 'back';

/** Changes stacking order; the last layer is drawn on top. */
export function arrangeLayers(doc: StudioDoc, ids: Iterable<string>, where: Arrange): StudioDoc {
  const set = new Set(ids);
  const layers = [...doc.layers];
  if (where === 'front') return { ...doc, layers: [...layers.filter((l) => !set.has(l.id)), ...layers.filter((l) => set.has(l.id))] };
  if (where === 'back') return { ...doc, layers: [...layers.filter((l) => set.has(l.id)), ...layers.filter((l) => !set.has(l.id))] };
  if (where === 'forward') {
    for (let i = layers.length - 2; i >= 0; i--) if (set.has(layers[i].id) && !set.has(layers[i + 1].id)) [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]];
  } else {
    for (let i = 1; i < layers.length; i++) if (set.has(layers[i].id) && !set.has(layers[i - 1].id)) [layers[i], layers[i - 1]] = [layers[i - 1], layers[i]];
  }
  return { ...doc, layers };
}

/** Moves one layer to a position in the stack (0 = bottom), e.g. after a drag in the layers list. */
export function moveLayerTo(doc: StudioDoc, id: string, index: number): StudioDoc {
  const from = doc.layers.findIndex((l) => l.id === id);
  if (from < 0) return doc;
  const layers = [...doc.layers];
  const [layer] = layers.splice(from, 1);
  layers.splice(clamp(index, 0, layers.length), 0, layer);
  return { ...doc, layers };
}

/** Copies of `layers` with fresh ids, shifted by `offset`; groups copied whole stay grouped. */
export function cloneLayers(layers: StudioLayer[], offset: number): StudioLayer[] {
  const groups = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const l of layers) if (l.group) counts.set(l.group, (counts.get(l.group) ?? 0) + 1);
  return layers.map((l) => {
    let group: string | undefined;
    if (l.group && (counts.get(l.group) ?? 0) > 1) {
      if (!groups.has(l.group)) groups.set(l.group, newLayerId('g'));
      group = groups.get(l.group);
    }
    return { ...l, id: newLayerId(l.kind[0]), x: l.x + offset, y: l.y + offset, group, locked: undefined } as StudioLayer;
  });
}

/** Duplicates the selection just above the top-most selected layer. */
export function duplicateLayers(doc: StudioDoc, ids: Iterable<string>): { doc: StudioDoc; ids: string[] } {
  const set = new Set(ids);
  const picked = doc.layers.filter((l) => set.has(l.id));
  if (!picked.length) return { doc, ids: [] };
  const copies = cloneLayers(picked, 24);
  const top = Math.max(...picked.map((l) => doc.layers.indexOf(l)));
  const layers = [...doc.layers];
  layers.splice(top + 1, 0, ...copies);
  return { doc: { ...doc, layers }, ids: copies.map((l) => l.id) };
}

/** Pastes copied layers on top. */
export function pasteLayers(doc: StudioDoc, copied: StudioLayer[], offset = 24): { doc: StudioDoc; ids: string[] } {
  const copies = cloneLayers(copied, offset);
  return { doc: { ...doc, layers: [...doc.layers, ...copies] }, ids: copies.map((l) => l.id) };
}

/** Removes the selection; locked layers are kept. */
export function removeLayers(doc: StudioDoc, ids: Iterable<string>): StudioDoc {
  const set = new Set(ids);
  return { ...doc, layers: doc.layers.filter((l) => !set.has(l.id) || l.locked) };
}

export function groupLayers(doc: StudioDoc, ids: Iterable<string>): StudioDoc {
  return updateLayers(doc, ids, { group: newLayerId('g') });
}

/** Breaks up every group that has a member in `ids`. */
export function ungroupLayers(doc: StudioDoc, ids: Iterable<string>): StudioDoc {
  const set = new Set(ids);
  const groups = new Set(doc.layers.filter((l) => set.has(l.id) && l.group).map((l) => l.group));
  return { ...doc, layers: doc.layers.map((l) => (l.group && groups.has(l.group) ? { ...l, group: undefined } : l)) };
}

/** Colours already used in the design, most used first, for quick reuse in colour pickers. */
export function docColors(doc: StudioDoc): string[] {
  const counts = new Map<string, number>();
  const add = (c?: string | null) => { if (c) counts.set(c.toUpperCase(), (counts.get(c.toUpperCase()) ?? 0) + 1); };
  for (const l of doc.layers) {
    if (l.kind === 'text') add(l.color);
    if (l.kind === 'shape') { add(l.fill); add(l.fill2); add(l.stroke); }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

export type TextPreset = 'heading' | 'subheading' | 'body';
export function newText(doc: StudioDoc, text: string, preset: TextPreset = 'heading'): TextLayer {
  const size = preset === 'heading' ? 88 : preset === 'subheading' ? 54 : 34;
  const weight = preset === 'heading' ? 800 : preset === 'subheading' ? 700 : 400;
  return { kind: 'text', id: newLayerId('t'), text, x: round(doc.width * 0.1), y: round(doc.height * 0.42), width: round(doc.width * 0.8), size, color: '#FFFFFF', weight, align: 'center', lineHeight: 1.3, opacity: 1 };
}

export type ShapePreset = 'button' | 'rect' | 'circle' | 'line';
export function newShape(doc: StudioDoc, preset: ShapePreset = 'button'): ShapeLayer {
  const w = doc.width;
  const size = preset === 'button' ? { width: round(w * 0.4), height: round(w * 0.09) } : preset === 'rect' ? { width: round(w * 0.5), height: round(w * 0.3) } : preset === 'circle' ? { width: round(w * 0.25), height: round(w * 0.25) } : { width: round(w * 0.5), height: 6 };
  const radius = preset === 'button' || preset === 'circle' ? round(Math.min(size.width, size.height) / 2) : preset === 'rect' ? 24 : 3;
  const name = { button: 'Button', rect: 'Rectangle', circle: 'Circle', line: 'Line' }[preset];
  return { kind: 'shape', id: newLayerId('s'), name, x: round((doc.width - size.width) / 2), y: round((doc.height - size.height) / 2), ...size, fill: preset === 'rect' ? '#FFFFFF' : '#FF6600', fill2: null, radius, shadow: preset === 'button', opacity: 1 };
}

export function newImage(doc: StudioDoc, saved: { file: string; width: number; height: number }, name: string, at?: { x: number; y: number }): ImageLayer {
  const scale = Math.min(1, (doc.width * 0.5) / saved.width, (doc.height * 0.5) / saved.height);
  const width = round(saved.width * scale), height = round(saved.height * scale);
  const cx = at?.x ?? doc.width / 2, cy = at?.y ?? doc.height / 2;
  return { kind: 'image', id: newLayerId('i'), name: name.slice(0, 40), file: saved.file, x: round(cx - width / 2), y: round(cy - height / 2), width, height, opacity: 1 };
}
