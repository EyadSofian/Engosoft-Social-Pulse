/**
 * The campaign stamp: a campaign's own slogan lockup (e.g. "#جمعة_تغير_مسارك") placed on every design made for
 * that campaign. Like the official logo, the exact uploaded file is composited after the copy is set, so the
 * image model never redraws or misspells it. It goes in a corner clear of the text and the logo.
 */
import sharp from 'sharp';

export type StampCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export const STAMP_CORNERS: StampCorner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

/** What a design needs to know about its campaign. The stamp file stays on the server; only its path travels. */
export interface CampaignIdentity {
  id: string;
  name: string;
  slogan: string;
  hashtag: string;
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

/** A line for the image prompt: keep the stamp's corner calm, because the official stamp is placed there afterwards. */
export function stampRoom(campaign: CampaignIdentity | undefined): string {
  if (!campaign?.stampPath) return '';
  const side = campaign.corner.replace('-', ' ');
  return `\n\nCAMPAIGN STAMP RESERVATION\nKeep the ${side} corner (about ${Math.round(campaign.width * 100)}% of the width, a short band) calm and free of text, faces and key subjects. The campaign's official slogan stamp is placed there afterwards; do not draw any slogan, hashtag or stamp yourself.`;
}

/** What the strategist hears about the campaign, so the copy and captions are written around its slogan. */
export function campaignBrief(campaign: CampaignIdentity | undefined): string {
  if (!campaign) return '';
  return [`\n\nCAMPAIGN: ${campaign.name}.`, campaign.slogan ? `Campaign slogan: «${campaign.slogan}». Build the post's message around it; do not change its wording.` : '', campaign.hashtag ? `Campaign hashtag: ${campaign.hashtag}.` : ''].filter(Boolean).join(' ');
}

/** Adds the campaign hashtag to a caption once. */
export const withHashtag = (caption: string, hashtag: string) => (!hashtag || caption.includes(hashtag) ? caption : `${caption.trimEnd()}\n\n${hashtag}`);
