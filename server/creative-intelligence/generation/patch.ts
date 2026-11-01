/** Pasting model edits back onto a design: only the edited boxes change, everything else keeps its pixels. */
import sharp from 'sharp';

export interface Box { x: number; y: number; width: number; height: number }

/** The model's pixels inside `boxes` (with a soft edge of `feather` px), the original everywhere else. */
export async function pasteInside(base: Buffer, edited: Buffer, boxes: Box[], feather = 3): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(base).metadata();
  const back = await sharp(edited).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const boxSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#000"/>${boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#fff"/>`).join('')}</svg>`);
  const alpha = await sharp(boxSvg).blur(Math.max(0.3, feather)).toColourspace('b-w').extractChannel(0).raw().toBuffer();
  // Interleave the mask as the patch's alpha by hand: joinChannel with a raw buffer silently produced an
  // opaque patch, which pasted the model's whole regenerated image over the design.
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) { rgba[p * 4] = back[p * 3]; rgba[p * 4 + 1] = back[p * 3 + 1]; rgba[p * 4 + 2] = back[p * 3 + 2]; rgba[p * 4 + 3] = alpha[p]; }
  const patch = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return sharp(base).composite([{ input: patch }]).png().toBuffer();
}

/**
 * True when the model left a box blank: a flat fill (usually black) that does not continue its surroundings.
 * Image edits sometimes return the masked hole unpainted.
 */
export async function looksUnfilled(image: Buffer, box: Box): Promise<boolean> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const stats = (x0: number, y0: number, w: number, h: number) => {
    let sum = 0, sq = 0, n = 0;
    for (let y = Math.max(0, y0); y < Math.min(info.height, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(info.width, x0 + w); x++) {
        const i = (y * info.width + x) * 3, l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += l; sq += l * l; n++;
      }
    }
    const mean = n ? sum / n : 0;
    return { mean, sd: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0 };
  };
  const inset = Math.round(Math.min(box.width, box.height) * 0.15);
  const inner = stats(Math.round(box.x) + inset, Math.round(box.y) + inset, Math.round(box.width) - 2 * inset, Math.round(box.height) - 2 * inset);
  if (inner.sd > 3) return false;
  // Compare with a band just outside the box (whichever sides lie inside the canvas).
  const band = Math.max(8, Math.round(Math.min(box.width, box.height) * 0.12));
  const ring = [
    stats(Math.round(box.x + box.width), Math.round(box.y), band, Math.round(box.height)),
    stats(Math.round(box.x) - band, Math.round(box.y), band, Math.round(box.height)),
    stats(Math.round(box.x), Math.round(box.y) - band, Math.round(box.width), band),
    stats(Math.round(box.x), Math.round(box.y + box.height), Math.round(box.width), band),
  ].filter((s) => s.mean > 0 || s.sd > 0);
  const around = ring.length ? ring.reduce((a, s) => a + s.mean, 0) / ring.length : inner.mean;
  return Math.abs(around - inner.mean) > 30;
}

/**
 * True when a pasted model edit does not belong in the image — for the automatic repairs nobody reviews before
 * the result is shown. Everything is measured against the ORIGINAL, so only what the edit introduced counts: a
 * design whose text already sat on a highlight bar, a button or a dark band is not refused for that edge.
 * - a blank hole: flat inside, unlike its surroundings and unlike what the box held before;
 * - a new panel: on rings at several depths into the box, most segments both changed from the original and
 *   differ from the untouched pixels just outside (a black, navy, grey or white plate, even inset from the mask
 *   edge and covered in lettering), or one whole side does;
 * - a dark fill: much of the box became darker than both the original and its surroundings.
 * The thresholds come from adversarial tests on synthetic posters (tests/patch-check.test.ts).
 */
export async function patchRejected(original: Buffer, candidate: Buffer, box: Box): Promise<boolean> {
  return Boolean(await patchVerdict(original, candidate, box));
}

/** Why a patch is refused ('hole', 'panel', 'band' or 'dark'), or null when it blends in. */
export async function patchVerdict(original: Buffer, candidate: Buffer, box: Box): Promise<'hole' | 'panel' | 'band' | 'dark' | null> {
  const read = async (image: Buffer) => sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [{ data: after, info }, { data: before }] = await Promise.all([read(candidate), read(original)]);
  const W = info.width, H = info.height;
  const x0 = Math.max(0, Math.round(box.x)), y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(W, Math.round(box.x + box.width)), y1 = Math.min(H, Math.round(box.y + box.height));
  if (x1 - x0 < 12 || y1 - y0 < 12) return null;
  const lumAt = (data: Buffer, i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const mean = (data: Buffer, ax: number, ay: number, bx: number, by: number) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.max(0, Math.round(ay)); y < Math.min(H, Math.round(by)); y++) for (let x = Math.max(0, Math.round(ax)); x < Math.min(W, Math.round(bx)); x++) { const i = (y * W + x) * 3; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    return n ? [r / n, g / n, b / n] : null;
  };
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // 1. Blank hole.
  if (await looksUnfilled(candidate, box)) {
    const lums: number[] = [];
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) lums.push(lumAt(before, (y * W + x) * 3));
    lums.sort((a, b) => a - b);
    const inset = Math.round(Math.min(x1 - x0, y1 - y0) * 0.15);
    const inner = mean(after, x0 + inset, y0 + inset, x1 - inset, y1 - inset);
    if (inner && Math.abs(0.299 * inner[0] + 0.587 * inner[1] + 0.114 * inner[2] - lums[Math.floor(lums.length / 2)]) > 30) return 'hole';
  }

  // 2. New panel, on rings at several depths. The rings tile the depth range (thickness = step), so a thin frame
  // drawn between two sampled depths is still seen.
  const gap = 3, segments = 6, short = Math.min(x1 - x0, y1 - y0);
  const step = Math.max(4, Math.round(short * 0.05));
  // Fine 3 px rings near the edge, where a drawn frame or plate border would sit, then coarser ones that tile
  // the rest of the depth range.
  const depths: [number, number][] = [];
  for (let d = 5; d < Math.min(35, short * 0.3); d += 3) depths.push([d, 3]);
  for (let d = depths.length ? depths[depths.length - 1][0] + 3 : 5; d <= Math.max(5, short * 0.3); d += step) depths.push([d, step]);
  // The untouched strip just outside each side (4 px); a side against the canvas edge has none.
  const edge = 4;
  const sides = [
    { name: 'top', outside: y0 - gap - edge >= 0 }, { name: 'bottom', outside: y1 + gap + edge <= H },
    { name: 'left', outside: x0 - gap - edge >= 0 }, { name: 'right', outside: x1 + gap + edge <= W },
  ].filter((side) => side.outside);
  for (const [d, t] of depths) {
    let total = 0, seams = 0, fullSide = false;
    for (const side of sides) {
      const horizontal = side.name === 'top' || side.name === 'bottom';
      const from = horizontal ? x0 + d : y0 + d, to = horizontal ? x1 - d : y1 - d;
      if (to - from < segments * 2) continue;
      let strong = 0;
      for (let s = 0; s < segments; s++) {
        const a = from + ((to - from) * s) / segments, b = from + ((to - from) * (s + 1)) / segments;
        const ring = side.name === 'top' ? [a, y0 + d, b, y0 + d + t] : side.name === 'bottom' ? [a, y1 - d - t, b, y1 - d] : side.name === 'left' ? [x0 + d, a, x0 + d + t, b] : [x1 - d - t, a, x1 - d, b];
        const out = side.name === 'top' ? [a, y0 - gap - edge, b, y0 - gap] : side.name === 'bottom' ? [a, y1 + gap, b, y1 + gap + edge] : side.name === 'left' ? [x0 - gap - edge, a, x0 - gap, b] : [x1 + gap, a, x1 + gap + edge, b];
        const inner = mean(after, ring[0], ring[1], ring[2], ring[3]), was = mean(before, ring[0], ring[1], ring[2], ring[3]), outer = mean(after, out[0], out[1], out[2], out[3]);
        if (!inner || !was || !outer) continue;
        const seam = Math.min(dist(inner, was), dist(inner, outer));
        total++;
        if (seam > 60) seams++;
        if (seam > 90) strong++;
      }
      if (strong === segments) fullSide = true;
    }
    // A box against the canvas edges has fewer measurable sides; the share rule applies to what there is.
    if (fullSide || (total >= segments && seams / total >= 0.8)) return 'panel';
  }

  const ringMeans = sides.map((side) => side.name === 'top' ? mean(after, x0, y0 - gap - edge, x1, y0 - gap) : side.name === 'bottom' ? mean(after, x0, y1 + gap, x1, y1 + gap + edge) : side.name === 'left' ? mean(after, x0 - gap - edge, y0, x0 - gap, y1) : mean(after, x1 + gap, y0, x1 + gap + edge, y1)).filter((m): m is number[] => Boolean(m));
  // 3. A band anywhere in the box (a plate behind one line of a multi-line headline, deeper than the rings reach):
  // in some horizontal or vertical strip most pixels both changed from the original and are far from the colour
  // around the box. Re-lettering changes only glyph strokes; calming a corner moves pixels toward that colour.
  if (ringMeans.length) {
    const ring = [0, 1, 2].map((c) => ringMeans.reduce((sum, m) => sum + m[c], 0) / ringMeans.length);
    const bw = x1 - x0, bh = y1 - y0;
    // The box's own original background (median colour): calming a corner returns pixels to it even when the
    // surroundings are a different colour.
    const sample: number[][] = [[], [], []];
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { const i = (y * W + x) * 3; for (let c = 0; c < 3; c++) sample[c].push(before[i + c]); }
    const own = sample.map((values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
    const odd = (x: number, y: number) => { const i = (y * W + x) * 3; const now = [after[i], after[i + 1], after[i + 2]]; return dist(now, [before[i], before[i + 1], before[i + 2]]) > 60 && dist(now, ring) > 60 && dist(now, own) > 60; };
    const strips = (horizontal: boolean) => {
      const length = horizontal ? bh : bw, size = Math.max(6, Math.round(length * 0.15));
      for (let start = 0; start + size <= length; start += Math.max(3, Math.round(size / 2))) {
        let hit = 0, n = 0;
        for (let a = start; a < start + size; a += 2) for (let b = 0; b < (horizontal ? bw : bh); b += 2) { if (horizontal ? odd(x0 + b, y0 + a) : odd(x0 + a, y0 + b)) hit++; n++; }
        if (n && hit / n > 0.55) return true;
      }
      return false;
    };
    if (strips(true) || strips(false)) return 'band';
  }

  // 4. Dark fill: pixels that became much darker than before AND darker than the untouched ring around the box.
  if (ringMeans.length) {
    const ringLum = ringMeans.reduce((sum, m) => sum + 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2], 0) / ringMeans.length;
    let darker = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 3, now = lumAt(after, i);
      if (lumAt(before, i) - now > 60 && ringLum - now > 35) darker++;
      n++;
    }
    if (n && darker / n > 0.35) return 'dark';
  }
  return null;
}
