/** Pasting model edits back onto a design: only the edited boxes change, everything else keeps its pixels. */
import sharp from 'sharp';

export interface Box { x: number; y: number; width: number; height: number }

/** The model's pixels inside `boxes` (with a soft edge), the original everywhere else. */
export async function pasteInside(base: Buffer, edited: Buffer, boxes: Box[]): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(base).metadata();
  const back = await sharp(edited).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const boxSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#000"/>${boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#fff"/>`).join('')}</svg>`);
  const alpha = await sharp(boxSvg).blur(3).toColourspace('b-w').extractChannel(0).raw().toBuffer();
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
