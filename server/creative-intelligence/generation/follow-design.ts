/**
 * "Design it like this one": a design the user picks (a library design or their own file) that the AI redraws for
 * the new post. The copywriter sees it and writes words that fill the same blocks; the image model gets it as the
 * base design and keeps its layout, colours, type and graphic elements, changing only the words and the photos.
 * It replaces the house references for that run, which say the opposite ("style only, never copy the layout").
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { brandTemplate, type BrandSurface } from '../../../src/domain/brand-templates.js';
import { mediaDir } from '../../paths.js';
import type { ReferenceImage } from './house-references.js';
import type { CampaignIdentity } from '../logo-resolution/campaign-stamp.js';
import type { CopyBlock } from '../typography-validation/copy-check.js';
import type { BrandKitId } from '../../../src/domain/brand-kits.js';
import { kitFilePath, placeLogo } from '../brand/place-logo.js';

/** Artwork of a library design placed from its file at its spot (a campaign stamp, a hashtag), never redrawn. */
export interface FollowArtwork { key: string; path: string; place: { x: number; y: number; width: number; height: number }; says: string }

/** Saved on the run, so other sizes made later follow the same design. */
export interface FollowDesign {
  name: string;
  path: string;
  /** For a library design: the words its blocks hold, so the copy fits them. */
  structure?: string;
  /** For a library design: its id, and the artwork placed from files. */
  templateId?: string;
  artworks?: FollowArtwork[];
  /** For a library design: the background picked (light or blue), for paths that lay the template out again. */
  surface?: BrandSurface;
  /** The design's own logo kit (the 50/50 campaign's older lockup), placed instead of the official logo. */
  logo?: FollowArtwork & { kit?: BrandKitId };
  /**
   * A library design that is a starting point, not a copy (every template except an `exact` one): an art director
   * plans a stronger post for the content and the image model redraws it in the same brand world.
   */
  evolve?: boolean;
  /** Photos the person uploaded for the design (an instructor's photo), saved beside the run. */
  photos?: FollowPhoto[];
}

/** A photo the person gave for the post: what it is (the field's label) and the saved file. */
export interface FollowPhoto { label: string; path: string }
export interface FollowPhotoInput { label: string; dataUrl: string }

export type FollowDesignInput = ({ templateId: string; surface?: BrandSurface } | { name: string; dataUrl: string }) & { photos?: FollowPhotoInput[] };

/** The person's photos saved beside the run as JPEGs of at most 1536 px; ones that are not images are skipped. */
export async function saveFollowPhotos(photos: FollowPhotoInput[] | undefined, requestId: string): Promise<FollowPhoto[]> {
  const saved: FollowPhoto[] = [];
  for (const [i, photo] of (photos ?? []).slice(0, 3).entries()) {
    const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(photo.dataUrl);
    if (!match) continue;
    const dir = mediaDir('creatives', requestId);
    mkdirSync(dir, { recursive: true });
    const path = resolve(dir, `photo-${i + 1}.jpg`);
    try {
      writeFileSync(path, await sharp(Buffer.from(match[2], 'base64')).rotate().flatten({ background: '#ffffff' }).resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer());
      saved.push({ label: photo.label.slice(0, 80) || 'Photo', path });
    } catch { /* not an image */ }
  }
  return saved;
}

/** The person's photos for the image model, in order (Image 2, 3…). */
export const followPhotoImages = (design: FollowDesign) => (design.photos ?? []).filter((p) => existsSync(p.path)).map((p) => ({ data: readFileSync(p.path), mime: 'image/jpeg' as const, label: p.label }));

/**
 * The library design's reference image, or the uploaded file saved beside the run as a JPEG of at most 1600 px
 * (the copywriter reads it too). Undefined when it is not valid.
 */
export async function resolveFollowDesign(input: FollowDesignInput, requestId: string): Promise<FollowDesign | undefined> {
  const design = await resolveDesign(input, requestId);
  if (!design) return undefined;
  const photos = await saveFollowPhotos(input.photos, requestId);
  return photos.length ? { ...design, photos } : design;
}

async function resolveDesign(input: FollowDesignInput, requestId: string): Promise<FollowDesign | undefined> {
  if ('templateId' in input) {
    const template = brandTemplate(input.templateId);
    const ref = template && (template.references[input.surface ?? 'blue'] ?? template.references.blue ?? template.references.light);
    if (!template || !ref) return undefined;
    const path = resolve(process.cwd(), 'public', ref.replace(/^\//, ''));
    const artworks = template.inputs.flatMap((input): FollowArtwork[] => {
      if (input.photo?.kind !== 'artwork' || !input.place) return [];
      const file = resolve(process.cwd(), 'public', input.sample.ar.replace(/^\//, ''));
      return existsSync(file) ? [{ key: input.key, path: file, place: input.place, says: input.says ?? '' }] : [];
    });
    const blocks = template.inputs.filter((input) => input.type !== 'photo').map((input) => `${input.label.en}: «${input.sample.ar}»`).join('; ');
    const logoFile = template.logo && kitFilePath(template.logo.kit);
    const logo = template.logo && logoFile && existsSync(logoFile) ? { key: 'logo', path: logoFile, place: template.logo.place, says: 'ENGO SOFT', kit: template.logo.kit } : undefined;
    return existsSync(path) ? { name: template.name.en, path, surface: input.surface ?? template.surfaces[template.surfaces.length - 1], structure: `${template.brief} Its text inputs, with the words they hold in the image: ${blocks}.`, templateId: template.id, ...(artworks.length ? { artworks } : {}), ...(logo ? { logo } : {}), ...(template.exact ? {} : { evolve: true }) } : undefined;
  }
  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(input.dataUrl);
  if (!match) return undefined;
  const dir = mediaDir('creatives', requestId);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'follow-design.jpg');
  try {
    writeFileSync(path, await sharp(Buffer.from(match[2], 'base64')).flatten({ background: '#ffffff' }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer());
  } catch { return undefined; }
  return { name: input.name.slice(0, 120) || 'uploaded design', path };
}

/** The design as a data URL for the copywriter. Library references and saved uploads are JPEGs. */
export const followDataUrl = (design: FollowDesign) => `data:image/jpeg;base64,${readFileSync(design.path).toString('base64')}`;

/**
 * The design for the image model at full detail (up to 2048 px, JPEG 95), with its shape. It is the base the new
 * post is redrawn from, so a small, soft copy here comes back as a small, soft post.
 */
export async function followImage(design: FollowDesign): Promise<(ReferenceImage & { aspect: number }) | null> {
  if (!existsSync(design.path)) return null;
  const source = sharp(readFileSync(design.path));
  const { width = 1, height = 1 } = await source.metadata();
  const data = await source.flatten({ background: '#ffffff' }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  return { name: design.name, data, mime: 'image/jpeg', aspect: width / height };
}

/** The canvas and the design have the same shape (within 8%), so blocks and artwork keep their places. */
export const sameShape = (designAspect: number, canvasAspect: number) => Math.abs(Math.log(designAspect / canvasAspect)) < 0.08;

const pct = (v: number) => Math.round(v * 100);
const spot = (box: { x: number; y: number; width: number; height: number }) => `${pct(box.x)}–${pct(box.x + box.width)}% across, ${pct(box.y)}–${pct(box.y + box.height)}% down`;
const KIND_WORDS: Record<CopyBlock['kind'], string> = { headline: 'headline', line: 'line', price: 'price', label: 'tag', button: 'button', mark: 'series mark' };

/**
 * The whole image prompt for a post made as a design the user picked: Image 1 is the design, redrawn exactly with
 * every block's new words. Nothing else competes with it — no house look, no planned layout, no "no prices" rule.
 * Artwork placed from files (a campaign stamp, a hashtag) is left as clean background at its spot on a canvas of
 * the same shape; on another shape the design is rearranged and that artwork is not drawn.
 */
export function followDesignPrompt(input: { blocks: CopyBlock[]; photos: string; canvasLabel: string; designAspect: number; canvasAspect: number; artworks?: FollowArtwork[] }): string {
  const same = sameShape(input.designAspect, input.canvasAspect);
  const shown = input.blocks.filter((b) => b.text);
  const dropped = input.blocks.filter((b) => !b.text && b.was);
  const lines = shown.map((b, i) => {
    const where = b.was ? `where Image 1 has «${b.was}»` : `new ${KIND_WORDS[b.kind]}, in the style of Image 1's most similar block${b.box && same ? `, at ${spot(b.box)}` : ''}`;
    const accent = b.highlight ? ` Colour «${b.highlight}» the way Image 1 colours part of its headline.` : '';
    return `${i + 1}. ${b.role} (${where}): «${b.text}»${accent}`;
  });
  const artworks = input.artworks ?? [];
  return [
    'A finished, publish-ready social media post for Engosoft, an engineering and professional training company. Crisp, sharp, print-quality finish: clean edges on every letter and shape, no blur, no smudged or melted details, no noise or compression artefacts.',
    `CANVAS\n${input.canvasLabel}`,
    'DESIGN TO COPY — Image 1',
    `Image 1 is the design the user chose. Redraw it exactly as the next post of the same series: the same composition, the same place, size, angle and style of every block, the same background colour and texture, the same typography (weight, size and colour of each line), the same highlight colours, and the same graphic elements in the same places (tapes, tickets, tags, icons, dots, lines and decorative shapes). Change only the words${input.photos ? ' and the photos' : ''}; a person comparing the two should see the same design with new text.`,
    same ? '' : 'Image 1 has a different shape from this canvas: keep its style, blocks and elements, and rearrange them to fit this canvas the way its designer would. Never stretch, squash, crop or pad it.',
    `TEXT — each block once, exactly as written, and no other words\n${lines.join('\n')}`,
    dropped.length ? `Remove these blocks of Image 1 and close the gap: ${dropped.map((b) => `«${b.was}»`).join(', ')}.` : '',
    'No word, number, price or name of Image 1 stays unless it is written above. A longer line may take two lines or slightly smaller type inside its block; never drop, cut or abbreviate a word. Arabic reads right to left with every letter correctly joined and spelled exactly as given; digits and currency signs exactly as written. A price shows only what is written above: if Image 1 has a currency sign or word beside a price and the new text has none, leave it out.',
    input.photos ? `PHOTOS\nReplace every photo or person in Image 1 with: ${input.photos}. Real, believable people with natural faces and hands; no identifiable public figures.` : 'PHOTOS\nImage 1 has no photos: keep it graphic, with no new photos or people.',
    `LOGO${artworks.length && same ? ' AND CAMPAIGN ARTWORK' : ''}\nDo not draw the Engosoft logo or any logo or wordmark: leave the spot where Image 1 has its logo as clean background; the logo is placed there afterwards from its file.${artworks.length ? (same
      ? ` The campaign artwork of Image 1 is placed afterwards from its file at the same spot: ${artworks.map((a) => `«${a.says || a.key}» at ${spot(a.place)}`).join('; ')}. Leave each of those areas as clean background and do not draw that lettering.`
      : ` Do not draw Image 1's campaign artwork (${artworks.map((a) => `«${a.says || a.key}»`).join(', ')}).`) : ''}`,
    'AVOID\nAny other words or letters; extra logos or watermarks; fake UI; QR codes; leftovers of Image 1\'s old text; blur or low detail.',
  ].filter(Boolean).join('\n\n');
}

/**
 * The image model's instructions for the design to follow (image `index`), on a canvas of `canvasAspect`, for runs
 * made before the design's blocks were planned (follow-content.ts); their other sizes still use it.
 */
export function followPrompt(image: { aspect: number }, canvasAspect: number, index = 1): string {
  const sameShape = Math.abs(Math.log(image.aspect / canvasAspect)) < 0.08;
  return [
    `\n\nDESIGN TO FOLLOW — Image ${index}`,
    `Image ${index} is the design the user chose. Make this post as the same design, so it looks like the next post of the same series: keep its layout and the place and size of every block, its background, colour palette, typography style and weight, and its graphic elements (waves, frames, tapes, badges, price tickets, buttons, highlight bars, decorative shapes).`,
    'Change only the content: every word becomes the copy given above, and every photo or person is replaced by a new one that fits this post. Keep none of its words, numbers, names, people or photos.',
    'Where the planned composition above disagrees with it, follow its layout.',
    'Do not draw its logo, any logo, website line or footer: leave that spot as clean background; the official logo is placed afterwards.',
    sameShape ? '' : `Image ${index} has a different shape from this canvas: keep its style and its elements and rearrange them to fit this canvas naturally. Never stretch, squash, crop or pad it.`,
  ].filter(Boolean).join('\n');
}

/**
 * A library design that carries a campaign stamp (the «عرض الخمسين خمسين» lockup) keeps it exact: the stamp file
 * is placed on the finished design like a campaign's stamp, instead of the image model redrawing its lettering.
 */
export function templateCampaign(templateId: string): CampaignIdentity | undefined {
  const template = brandTemplate(templateId);
  const stamp = template?.inputs.find((input) => input.photo?.kind === 'artwork' && input.key === 'stamp');
  if (!template || !stamp) return undefined;
  const path = resolve(process.cwd(), 'public', stamp.sample.ar.replace(/^\//, ''));
  if (!existsSync(path)) return undefined;
  return { id: `template:${template.id}`, name: template.name.en, slogan: '', hashtag: '', stampPath: path, keyVisualPath: '', corner: 'top-right', width: 0.3 };
}

/**
 * The design's campaign artwork placed from its files at the spots it has in the design (fitted inside each box,
 * centred, never stretched), on a canvas of the same shape. Returns the image and where each piece went.
 */
export async function placeArtworks(image: Buffer, artworks: FollowArtwork[]): Promise<{ image: Buffer; placed: { key: string; box: { x: number; y: number; width: number; height: number } }[] }> {
  const { width: W = 0, height: H = 0 } = await sharp(image).metadata();
  const layers: NonNullable<Parameters<ReturnType<typeof sharp>['composite']>[0]> = [];
  const placed: { key: string; box: { x: number; y: number; width: number; height: number } }[] = [];
  for (const art of artworks) {
    if (!existsSync(art.path) || !W || !H) continue;
    const box = { x: Math.round(art.place.x * W), y: Math.round(art.place.y * H), width: Math.round(art.place.width * W), height: Math.round(art.place.height * H) };
    const trimmed = await sharp(readFileSync(art.path)).trim().toBuffer().catch(() => readFileSync(art.path));
    const fitted = await sharp(trimmed).resize(box.width, box.height, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer({ resolveWithObject: true });
    const left = box.x + Math.round((box.width - fitted.info.width) / 2), top = box.y + Math.round((box.height - fitted.info.height) / 2);
    layers.push({ input: fitted.data, left, top });
    placed.push({ key: art.key, box: { x: left, y: top, width: fitted.info.width, height: fitted.info.height } });
  }
  return { image: layers.length ? await sharp(image).composite(layers).png().toBuffer() : image, placed };
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * The image model often draws the campaign artwork itself although it was told to leave its spot clean, and the
 * file placed on top never lines up exactly: the stamp then shows twice, blurred. Before the files go on, each
 * artwork spot (a little larger than its box) is covered with a clean piece of the same background, taken from
 * the calmest free areas of the image (in two halves, so a smaller calm area is enough), blended in at the edges.
 * When no calm area is found the spot is left as drawn.
 */
export async function clearArtworkSpots(image: Buffer, artworks: FollowArtwork[]): Promise<Buffer> {
  return clearBoxes(image, artworks.map((art) => {
    const gx = art.place.width * 0.12, gy = art.place.height * 0.12;
    return { x: art.place.x - gx, y: art.place.y - gy, width: art.place.width + 2 * gx, height: art.place.height + 2 * gy };
  }));
}

/**
 * Areas (fractions of the image from the top-left) covered with clean background from the calmest free areas of
 * the image, blended at the edges: a logo or artwork the image model drew where a file goes afterwards.
 */
export async function clearBoxes(image: Buffer, boxes: Box[]): Promise<Buffer> {
  const { width: W = 0, height: H = 0 } = await sharp(image).metadata();
  if (!W || !H || !boxes.length) return image;
  const grey = await sharp(image).greyscale().raw().toBuffer();
  const spread = (b: Box) => {
    let sum = 0, sq = 0, n = 0;
    for (let y = b.y; y < b.y + b.height; y += 2) for (let x = b.x; x < b.x + b.width; x += 2) { const v = grey[y * W + x]; sum += v; sq += v * v; n++; }
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sq / n - mean * mean));
  };
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const spots = boxes.map((box) => {
    const x = Math.max(0, Math.round(box.x * W)), y = Math.max(0, Math.round(box.y * H));
    return { x, y, width: Math.max(4, Math.min(W - x, Math.round((box.x + box.width) * W) - x)), height: Math.max(4, Math.min(H - y, Math.round((box.y + box.height) * H) - y)) };
  }).filter((b) => b.width > 3 && b.height > 3);
  const meanAt = (b: Box) => { let sum = 0, n = 0; for (let y = b.y; y < b.y + b.height; y += 3) for (let x = b.x; x < b.x + b.width; x += 3) { sum += grey[y * W + x]; n++; } return sum / n; };
  // The calmest place in the image for a piece this size, clear of every spot and close in tone to the spot's surroundings.
  const calmest = (w: number, h: number, tone: number) => {
    const step = Math.max(8, Math.round(Math.min(W, H) / 60));
    let best: { box: Box; score: number } | null = null;
    for (let y = 0; y + h <= H; y += step) for (let x = 0; x + w <= W; x += step) {
      const box = { x, y, width: w, height: h };
      if (spots.some((s) => overlaps(box, s))) continue;
      const score = spread(box) + Math.abs(meanAt(box) - tone) * 0.5;
      if (!best || score < best.score) best = { box, score };
    }
    return best;
  };
  const layers: NonNullable<Parameters<ReturnType<typeof sharp>['composite']>[0]> = [];
  for (const spot of spots) {
    const feather = Math.max(2, Math.round(Math.min(spot.width, spot.height) * 0.08));
    const ring = [{ x: spot.x, y: Math.max(0, spot.y - feather * 2), width: spot.width, height: Math.min(feather * 2, spot.y) }, { x: spot.x, y: spot.y + spot.height, width: spot.width, height: Math.min(feather * 2, H - spot.y - spot.height) }].filter((b) => b.height > 0);
    const tone = ring.length ? ring.reduce((t, b) => t + meanAt(b), 0) / ring.length : meanAt(spot);
    // Two halves, the second overlapping the first by the feather, so a smaller calm area is enough.
    const half = Math.ceil(spot.width / 2);
    const strips = [{ x: 0, width: half + feather, seam: false }, { x: half - feather, width: spot.width - half + feather, seam: true }];
    const pieces: { x: number; width: number; data: Buffer; seam: boolean }[] = [];
    for (const strip of strips) {
      const found = calmest(strip.width, spot.height, tone);
      // Only fine grain is copied; anything busier holds text or shapes.
      if (!found || spread(found.box) > 12) { pieces.length = 0; break; }
      pieces.push({ ...strip, data: await sharp(image).extract({ left: found.box.x, top: found.box.y, width: strip.width, height: spot.height }).removeAlpha().raw().toBuffer() });
    }
    if (pieces.length !== strips.length) continue;
    for (const piece of pieces) {
      const rgba = Buffer.alloc(piece.width * spot.height * 4);
      for (let y = 0; y < spot.height; y++) for (let x = 0; x < piece.width; x++) {
        const i = y * piece.width + x, gx = piece.x + x;
        const outer = Math.min(gx, y, spot.width - 1 - gx, spot.height - 1 - y);
        const edge = piece.seam ? Math.min(outer, x) : outer;
        rgba[i * 4] = piece.data[i * 3]; rgba[i * 4 + 1] = piece.data[i * 3 + 1]; rgba[i * 4 + 2] = piece.data[i * 3 + 2];
        rgba[i * 4 + 3] = Math.round(255 * Math.min(1, edge / feather));
      }
      layers.push({ input: await sharp(rgba, { raw: { width: piece.width, height: spot.height, channels: 4 } }).png().toBuffer(), left: spot.x + piece.x, top: spot.y });
    }
  }
  return layers.length ? sharp(image).composite(layers).png().toBuffer() : image;
}

/**
 * The design's own logo (the 50/50 campaign's older «ENGO | SOFT» lockup), placed from its kit's file: at its spot on
 * the design's shape, in the same corner on others, never past the kit's size cap. See `placeLogo` in brand/place-logo.
 */
export async function placeOwnLogo(image: Buffer, logo: FollowArtwork & { kit?: BrandKitId }, opts: { same: boolean; designAspect: number; safe?: { top?: number; left?: number } }): Promise<{ image: Buffer; box: Box } | null> {
  if (!existsSync(logo.path)) return null;
  const placed = await placeLogo(image, logo.kit ?? 'engo-soft-old', { kind: 'design-spot', place: logo.place, same: opts.same, designAspect: opts.designAspect, safe: opts.safe, file: logo.path });
  return placed && { image: placed.image, box: placed.box };
}
