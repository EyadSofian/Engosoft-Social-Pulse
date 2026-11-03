/**
 * The campaign stamp: a campaign's own slogan lockup (e.g. "#جمعة_تغير_مسارك") placed on every design made for
 * that campaign. Like the official logo, the exact uploaded file is composited after the copy is set, so the
 * image model never redraws or misspells it. It goes where the vision map of the finished image shows free space,
 * clear of every text, the button, faces, subjects and the logo — never on top of them.
 */
import { readFileSync } from 'node:fs';
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

/**
 * Where the stamp goes: the first free spot at full size, then at 85% and 70%. Spots run from the preferred corner
 * along its band (the stamp may sit anywhere on the bottom or top edge, not only in a corner), then along the
 * other band. A spot is free when it touches none of `avoid` (text, button, faces, subjects, the logo). Story
 * safe areas are respected. `clear` false means there is no free spot: the stamp must not be placed.
 */
export function stampPlacement(canvas: { width: number; height: number }, stamp: { width: number; height: number }, preferred: StampCorner, widthShare: number, avoid: Box[], safeArea = { top: 0, bottom: 0 }): Box & { corner: StampCorner; clear: boolean } {
  const margin = Math.round(canvas.width * 0.045);
  const step = Math.max(8, Math.round(canvas.width * 0.02));
  const bands: ('top' | 'bottom')[] = preferred.startsWith('bottom') ? ['bottom', 'top'] : ['top', 'bottom'];
  const cornerOf = (band: 'top' | 'bottom', box: Box): StampCorner => `${band}-${box.x + box.width / 2 > canvas.width / 2 ? 'right' : 'left'}`;
  const spots = (scale: number): Box[] => {
    const width = Math.round(canvas.width * widthShare * scale);
    const height = Math.round(width * (stamp.height / stamp.width));
    const left = margin, right = canvas.width - margin - width;
    const xs: number[] = [];
    for (let x = right; x > left; x -= step) xs.push(x);
    xs.push(left);
    return bands.flatMap((band) => {
      const y = band === 'top' ? margin + safeArea.top : canvas.height - margin - safeArea.bottom - height;
      return (preferred.endsWith('right') ? xs : [...xs].reverse()).map((x) => ({ x, y, width, height }));
    });
  };
  for (const scale of [1, 0.85, 0.7]) {
    for (const box of spots(scale)) {
      if (!avoid.some((other) => overlaps(box, other))) return { ...box, corner: cornerOf(box.y < canvas.height / 2 ? 'top' : 'bottom', box), clear: true };
    }
  }
  const [fallback] = spots(0.7);
  return { ...fallback, corner: preferred, clear: false };
}

/** A stamp's share of the canvas width and its width-to-height ratio: the uploaded file, or the hashtag pill. */
export async function stampGeometry(campaign: CampaignIdentity | undefined): Promise<{ width: number; aspect: number } | null> {
  if (!campaign) return null;
  if (campaign.stampPath) {
    try { const m = await sharp(readFileSync(campaign.stampPath)).metadata(); if (m.width && m.height) return { width: campaign.width, aspect: m.width / m.height }; } catch { /* unreadable file: fall back to the text stamp */ }
  }
  const text = await textStamp(campaign);
  if (!text) return null;
  const m = await sharp(text.png).metadata();
  return { width: text.width, aspect: (m.width ?? 3) / (m.height ?? 1) };
}

/** The area the stamp is planned into, as fractions of the canvas: its preferred corner, inside the safe area. */
export function stampZone(canvas: { width: number; height: number; safe: { top: number; bottom: number } }, corner: StampCorner, geometry: { width: number; aspect: number }): Box {
  const mx = 0.045, my = (0.045 * canvas.width) / canvas.height;
  const width = geometry.width, height = (geometry.width * canvas.width) / geometry.aspect / canvas.height;
  const x = corner.endsWith('right') ? 1 - mx - width : mx;
  const y = corner.startsWith('bottom') ? 1 - my - canvas.safe.bottom / canvas.height - height : my + canvas.safe.top / canvas.height;
  return { x, y, width, height };
}

/** Pastes the campaign stamp onto a finished creative. Returns the image unchanged when the campaign has no stamp. */
export async function applyCampaignStamp(creative: Buffer, campaign: CampaignIdentity, stampPng: Buffer | null, avoid: Box[], safeArea?: { top: number; bottom: number }): Promise<{ image: Buffer; problem?: string; placement?: Box & { corner: StampCorner } }> {
  if (!stampPng) return { image: creative };
  const canvas = await sharp(creative).metadata();
  const stamp = await sharp(stampPng).metadata();
  if (!canvas.width || !canvas.height || !stamp.width || !stamp.height) return { image: creative, problem: 'Campaign stamp: the image could not be read.' };
  const place = stampPlacement({ width: canvas.width, height: canvas.height }, { width: stamp.width, height: stamp.height }, campaign.corner, campaign.width, avoid, safeArea);
  // No free spot: leaving the stamp off is better than covering the headline or the button.
  if (!place.clear) return { image: creative, problem: `Campaign stamp «${campaign.name}»: no free space on the top or bottom edge clear of the text, the button and the logo, so it was left off. Add it by hand or design again.` };
  const resized = await sharp(stampPng).resize(place.width, place.height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const image = await sharp(creative).composite([{ input: resized, left: place.x, top: place.y }]).png().toBuffer();
  return { image, placement: place };
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

/**
 * A line for the image prompt: keep the stamp's area calm, because the official stamp is placed there afterwards.
 * With the canvas and the stamp's measured size, the area is given exactly, the same one the layout was planned around.
 */
export function stampRoom(campaign: CampaignIdentity | undefined, canvas?: { width: number; height: number; safe: { top: number; bottom: number } }, geometry?: { width: number; aspect: number } | null): string {
  if (!campaign || (!campaign.stampPath && !stampText(campaign))) return '';
  const side = campaign.corner.replace('-', ' ');
  const pct = (v: number) => Math.round(v * 100);
  const z = canvas && geometry ? stampZone(canvas, campaign.corner, geometry) : null;
  const area = z ? `the ${side} area from ${pct(z.x)}% to ${pct(z.x + z.width)}% of the width and ${pct(z.y)}% to ${pct(z.y + z.height)}% of the height` : `the ${side} corner (about ${Math.round(campaign.width * 100)}% of the width, a short band)`;
  return `\n\nCAMPAIGN STAMP RESERVATION\nKeep ${area} calm and free of text, the button, faces and key subjects — the button goes elsewhere. The campaign's official slogan stamp is placed there afterwards; do not draw any slogan, hashtag or stamp yourself.`;
}

/** What the strategist hears about the campaign, so the copy and captions are written around its slogan. */
export function campaignBrief(campaign: CampaignIdentity | undefined): string {
  if (!campaign) return '';
  return [`\n\nCAMPAIGN: ${campaign.name}.`, campaign.slogan ? `Campaign slogan: «${campaign.slogan}». Build the post's message around it; do not change its wording.` : '', campaign.hashtag ? `Campaign hashtag: ${campaign.hashtag}.` : '', campaign.style ? `Campaign look — every design must clearly belong to it: ${campaign.style}` : ''].filter(Boolean).join(' ');
}

/** Adds the campaign hashtag to a caption once. */
export const withHashtag = (caption: string, hashtag: string) => (!hashtag || caption.includes(hashtag) ? caption : `${caption.trimEnd()}\n\n${hashtag}`);
