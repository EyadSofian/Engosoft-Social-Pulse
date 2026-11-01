/**
 * The campaign stamp: a campaign's own slogan lockup (e.g. "#جمعة_تغير_مسارك") placed on every design made for
 * that campaign. Like the official logo, the exact uploaded file is composited after the copy is set, so the
 * image model never redraws or misspells it. It goes in a corner clear of the text and the logo.
 */
import sharp from 'sharp';
import { BRAND_BLUE } from '../brand/registry.js';
import { outlineText } from '../typography/text-outline.js';

export type StampCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export const STAMP_CORNERS: StampCorner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

/** What a design needs to know about its campaign. The stamp file stays on the server; only its path travels. */
export interface CampaignIdentity {
  id: string;
  name: string;
  slogan: string;
  hashtag: string;
  /** The campaign's look in words (layout, colour, type, mood); empty when none was given. */
  style?: string;
  /** Absolute path of the stamp PNG, or empty when the campaign has none. */
  stampPath: string;
  /** Absolute path of the campaign's key visual, given to the strategist as a style reference; empty when none. */
  keyVisualPath: string;
  /** Preferred corner; the stamp moves to another corner when text or the logo is there. */
  corner: StampCorner;
  /** Stamp width as a share of the canvas width. */
  width: number;
}

interface Box { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The corners to try, preferred first, then the other bottom corner, then the top ones. */
const order = (preferred: StampCorner): StampCorner[] => [preferred, ...STAMP_CORNERS.filter((c) => c !== preferred).sort((a, b) => Number(b.startsWith('bottom')) - Number(a.startsWith('bottom')))];

/**
 * Where the stamp goes: the first corner (at full size, then at 75%) whose box touches no text block and not
 * the logo. Story safe areas are respected. `clear` false means every corner was taken and a person must check.
 */
export function stampPlacement(canvas: { width: number; height: number }, stamp: { width: number; height: number }, preferred: StampCorner, widthShare: number, avoid: Box[], safeArea = { top: 0, bottom: 0 }): Box & { corner: StampCorner; clear: boolean } {
  const margin = Math.round(canvas.width * 0.045);
  const boxFor = (corner: StampCorner, scale: number): Box => {
    const width = Math.round(canvas.width * widthShare * scale);
    const height = Math.round(width * (stamp.height / stamp.width));
    const x = corner.endsWith('left') ? margin : canvas.width - margin - width;
    const y = corner.startsWith('top') ? margin + safeArea.top : canvas.height - margin - safeArea.bottom - height;
    return { x, y, width, height };
  };
  for (const scale of [1, 0.75]) {
    for (const corner of order(preferred)) {
      const box = boxFor(corner, scale);
      if (!avoid.some((other) => overlaps(box, other))) return { ...box, corner, clear: true };
    }
  }
  return { ...boxFor(preferred, 0.75), corner: preferred, clear: false };
}

/** Pastes the campaign stamp onto a finished creative. Returns the image unchanged when the campaign has no stamp. */
export async function applyCampaignStamp(creative: Buffer, campaign: CampaignIdentity, stampPng: Buffer | null, avoid: Box[], safeArea?: { top: number; bottom: number }): Promise<{ image: Buffer; problem?: string; placement?: Box & { corner: StampCorner } }> {
  if (!stampPng) return { image: creative };
  const canvas = await sharp(creative).metadata();
  const stamp = await sharp(stampPng).metadata();
  if (!canvas.width || !canvas.height || !stamp.width || !stamp.height) return { image: creative, problem: 'Campaign stamp: the image could not be read.' };
  const place = stampPlacement({ width: canvas.width, height: canvas.height }, { width: stamp.width, height: stamp.height }, campaign.corner, campaign.width, avoid, safeArea);
  const resized = await sharp(stampPng).resize(place.width, place.height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const image = await sharp(creative).composite([{ input: resized, left: place.x, top: place.y }]).png().toBuffer();
  return { image, placement: place, problem: place.clear ? undefined : `Campaign stamp «${campaign.name}» touches the text or the logo in every corner; check it before approving.` };
}

/** The words a campaign without an uploaded stamp still shows on its designs: the hashtag, else the slogan. */
export const stampText = (campaign: CampaignIdentity) => (campaign.hashtag || campaign.slogan).trim();

/**
 * A campaign with a slogan or hashtag but no uploaded stamp file still gets a stamp: the text set in the brand
 * font on a brand-blue pill. `width` is its share of the canvas width, chosen so the letters come out at a
 * readable, consistent size (about 3% of the width) whatever the length of the text.
 */
export async function textStamp(campaign: CampaignIdentity): Promise<{ png: Buffer; width: number } | null> {
  const text = stampText(campaign);
  if (!text) return null;
  const size = 96, padX = size * 0.8, padY = size * 0.42;
  const out = outlineText({ text, x: 0, y: 0, width: 20_000, maxLines: 1, style: { family: 'brand', weight: 800, size, color: '#FFFFFF', lineHeight: 1.2 } });
  const lineWidth = Math.max(...out.lines.map((l) => l.width), 1);
  const W = Math.ceil(lineWidth + padX * 2), H = Math.ceil(out.height + padY * 2);
  const placed = outlineText({ text, x: padX, y: padY, width: lineWidth + 1, maxLines: 1, style: { family: 'brand', weight: 800, size, color: '#FFFFFF', lineHeight: 1.2 } });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="${H / 2}" fill="${BRAND_BLUE}"/>${placed.svg}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  // Letters ≈ 3% of the canvas width: the pill's height is ~1.8× the letter size.
  const width = Math.min(0.62, Math.max(0.16, (W / H) * 0.055));
  return { png, width };
}

/** A line for the image prompt: keep the stamp's corner calm, because the official stamp is placed there afterwards. */
export function stampRoom(campaign: CampaignIdentity | undefined): string {
  if (!campaign || (!campaign.stampPath && !stampText(campaign))) return '';
  const side = campaign.corner.replace('-', ' ');
  return `\n\nCAMPAIGN STAMP RESERVATION\nKeep the ${side} corner (about ${Math.round(campaign.width * 100)}% of the width, a short band) calm and free of text, faces and key subjects. The campaign's official slogan stamp is placed there afterwards; do not draw any slogan, hashtag or stamp yourself.`;
}

/** What the strategist hears about the campaign, so the copy and captions are written around its slogan. */
export function campaignBrief(campaign: CampaignIdentity | undefined): string {
  if (!campaign) return '';
  return [`\n\nCAMPAIGN: ${campaign.name}.`, campaign.slogan ? `Campaign slogan: «${campaign.slogan}». Build the post's message around it; do not change its wording.` : '', campaign.hashtag ? `Campaign hashtag: ${campaign.hashtag}.` : '', campaign.style ? `Campaign look — every design must clearly belong to it: ${campaign.style}` : ''].filter(Boolean).join(' ');
}

/** Adds the campaign hashtag to a caption once. */
export const withHashtag = (caption: string, hashtag: string) => (!hashtag || caption.includes(hashtag) ? caption : `${caption.trimEnd()}\n\n${hashtag}`);
