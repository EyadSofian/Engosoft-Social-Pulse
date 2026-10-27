import type { Box } from '../../domain/studio';

/** Viewport pixels, independent of zoom or writing direction. Never crop controls at a canvas edge. */
export function toolbarPosition(selection: Box, viewport: { width: number; height: number }, toolbar: { width: number; height: number }, obstacles: Box[] = []) {
  const margin = 8, gap = 14;
  const width = Math.min(toolbar.width, Math.max(1, viewport.width - margin * 2));
  const left = Math.max(margin, Math.min(viewport.width - width - margin, selection.x + selection.width / 2 - width / 2));
  const above = selection.y - gap - toolbar.height;
  const below = selection.y + selection.height + gap;
  const clear = (y: number) => obstacles.every(b => left >= b.x + b.width || left + width <= b.x || y >= b.y + b.height || y + toolbar.height <= b.y);
  const top = above >= margin && clear(above) ? above : below + toolbar.height <= viewport.height - margin && clear(below) ? below : margin;
  return { left, top: Math.max(margin, Math.min(top, Math.max(margin, viewport.height - toolbar.height - margin))), maxWidth: Math.max(1, viewport.width - margin * 2) };
}
