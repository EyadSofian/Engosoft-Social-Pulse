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

/** Saved on the run, so other sizes made later follow the same design. */
export interface FollowDesign {
  name: string;
  path: string;
  /** For a library design: the words its blocks hold, so the copy fits them. */
  structure?: string;
}

export type FollowDesignInput = { templateId: string; surface?: BrandSurface } | { name: string; dataUrl: string };

/**
 * The library design's reference image, or the uploaded file saved beside the run as a JPEG of at most 1600 px
 * (the copywriter reads it too). Undefined when it is not valid.
 */
export async function resolveFollowDesign(input: FollowDesignInput, requestId: string): Promise<FollowDesign | undefined> {
  if ('templateId' in input) {
    const template = brandTemplate(input.templateId);
    const ref = template && (template.references[input.surface ?? 'blue'] ?? template.references.blue ?? template.references.light);
    if (!template || !ref) return undefined;
    const path = resolve(process.cwd(), 'public', ref.replace(/^\//, ''));
    return existsSync(path) ? { name: template.name.en, path, structure: template.brief } : undefined;
  }
  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(input.dataUrl);
  if (!match) return undefined;
  const dir = mediaDir('creatives', requestId);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'follow-design.jpg');
  try {
    writeFileSync(path, await sharp(Buffer.from(match[2], 'base64')).flatten({ background: '#ffffff' }).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer());
  } catch { return undefined; }
  return { name: input.name.slice(0, 120) || 'uploaded design', path };
}

/** The design as a data URL for the copywriter. Library references and saved uploads are JPEGs. */
export const followDataUrl = (design: FollowDesign) => `data:image/jpeg;base64,${readFileSync(design.path).toString('base64')}`;

/** ~1024 px JPEG for the image model, with its shape. */
export async function followImage(design: FollowDesign): Promise<(ReferenceImage & { aspect: number }) | null> {
  if (!existsSync(design.path)) return null;
  const source = sharp(readFileSync(design.path));
  const { width = 1, height = 1 } = await source.metadata();
  const data = await source.flatten({ background: '#ffffff' }).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  return { name: design.name, data, mime: 'image/jpeg', aspect: width / height };
}

/** The copywriter's note: the same blocks, new words. */
export function followPlanningNote(design: FollowDesign): string {
  return [
    '\n\nDESIGN TO FOLLOW: the user picked a design (attached as "Design to follow") and wants this post made as the same design with new words and new photos.',
    'Write copy that fills the same text blocks as that design: the same kinds of lines (headline, highlighted phrase, labels, badge, price, button…), about the same number of lines and length each, so it sits in the same places.',
    design.structure ? `Its blocks: ${design.structure}` : '',
    'Never reuse its words, numbers, names or prices; facts come only from this request and the verified facts.',
    'Show a crossed-out or «instead of» old price only when the request says the price was reduced from it. Two prices for different options (online and offline, two levels) are two options shown side by side, never an old and a new price.',
  ].filter(Boolean).join('\n');
}

/** The image model's instructions for the design to follow (image `index`), on a canvas of `canvasAspect`. */
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
