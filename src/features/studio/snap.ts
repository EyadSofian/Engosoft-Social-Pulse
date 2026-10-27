/** Smart guides: snap a moving box to the page and to the other layers' edges and centres. */
import type { Box } from '../../domain/studio';

/** A guide line to draw: vertical (`axis: 'x'`) at x = `at`, spanning `from`..`to` on the other axis. */
export interface Guide { axis: 'x' | 'y'; at: number; from: number; to: number }

interface Target { at: number; from: number; to: number }

function targets(boxes: Box[], page: { width: number; height: number }, axis: 'x' | 'y'): Target[] {
  const out: Target[] = [];
  const pageLen = axis === 'x' ? page.height : page.width;
  for (const at of axis === 'x' ? [0, page.width / 2, page.width] : [0, page.height / 2, page.height]) out.push({ at, from: 0, to: pageLen });
  for (const b of boxes) {
    const [start, size, cross, crossSize] = axis === 'x' ? [b.x, b.width, b.y, b.height] : [b.y, b.height, b.x, b.width];
    for (const at of [start, start + size / 2, start + size]) out.push({ at, from: cross, to: cross + crossSize });
  }
  return out;
}

/** Closest target for any of `points` within `reach`; returns the shift that lands on it. */
function nearest(points: number[], list: Target[], reach: number): { shift: number; hits: Target[] } | null {
  let best: { shift: number; hits: Target[] } | null = null;
  for (const p of points) {
    for (const t of list) {
      const shift = t.at - p;
      if (Math.abs(shift) > reach) continue;
      if (!best || Math.abs(shift) < Math.abs(best.shift) - 0.01) best = { shift, hits: [t] };
      else if (Math.abs(shift - best.shift) < 0.01) best.hits.push(t);
    }
  }
  return best;
}

/** Snaps `box` (already moved) to the page and to `others`. `reach` is in document pixels. */
export function snapMove(box: Box, others: Box[], page: { width: number; height: number }, reach: number): { dx: number; dy: number; guides: Guide[] } {
  const sx = nearest([box.x, box.x + box.width / 2, box.x + box.width], targets(others, page, 'x'), reach);
  const sy = nearest([box.y, box.y + box.height / 2, box.y + box.height], targets(others, page, 'y'), reach);
  const dx = sx?.shift ?? 0, dy = sy?.shift ?? 0;
  const moved = { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height };
  const guides: Guide[] = [];
  for (const t of sx?.hits ?? []) guides.push({ axis: 'x', at: t.at, from: Math.min(t.from, moved.y), to: Math.max(t.to, moved.y + moved.height) });
  for (const t of sy?.hits ?? []) guides.push({ axis: 'y', at: t.at, from: Math.min(t.from, moved.x), to: Math.max(t.to, moved.x + moved.width) });
  return { dx, dy, guides };
}

/** Snaps a single edge being resized (vertical edge for 'x'). */
export function snapEdge(value: number, axis: 'x' | 'y', others: Box[], page: { width: number; height: number }, reach: number): { shift: number; guide: Guide | null } {
  const hit = nearest([value], targets(others, page, axis), reach);
  if (!hit) return { shift: 0, guide: null };
  const t = hit.hits[0];
  return { shift: hit.shift, guide: { axis, at: t.at, from: t.from, to: t.to } };
}
