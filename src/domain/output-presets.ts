import { reelCoverFor, type ReelCover, type ReelCovers } from './reel-covers';
import type { Channel } from './shared';
export type OutputFormat = 'feed' | 'square' | 'story' | 'landscape';
export interface PublishingPreset {
  id: string;
  channel: Channel;
  name: { en: string; ar: string };
  width: number;
  height: number;
  /** The `size` sent to the image model, from `generationSizeFor`; the result is fitted to width × height. */
  generation: string;
  format: OutputFormat;
  safe: { top: number; bottom: number; left: number; right: number };
  note?: string;
}

/**
 * The image model's `size` rules (OpenAI image generation guide, checked 2026-11-03): both edges multiples of 16,
 * neither above 3840, long edge at most 3× the short one, 655,360–8,294,400 pixels; above 2560×1440 is experimental.
 */
export const IMAGE_API = { step: 16, maxEdge: 3840, maxRatio: 3, minPixels: 655_360, maxPixels: 8_294_400, stablePixels: 2560 * 1440 } as const;
/** Below about a megapixel the model's lettering and fine detail go soft, so small outputs are drawn larger. */
const DETAIL_PIXELS = 1_000_000;
/** Drawn and delivered shapes may differ this much; the few extra pixels are trimmed evenly, never stretched. */
const RATIO_TOLERANCE = 0.005;

export interface GenerationSize {
  width: number;
  height: number;
  size: string;
  /** The output is wider than the model can draw (3:1): a 3:1 canvas is drawn and its central band is kept. */
  band: boolean;
  experimental: boolean;
}

/**
 * The canvas the model draws for an output size: the smallest valid one with the same shape that is at least the
 * output in both directions (never upscaled) and at least a megapixel.
 */
/** Every canvas the model accepts with this shape, smallest first, up to `maxPixels`. */
function validSizes(ratio: number, maxPixels: number = IMAGE_API.maxPixels): [number, number][] {
  const { step, maxEdge, maxRatio, minPixels } = IMAGE_API;
  const drawn = Math.min(maxRatio, Math.max(1 / maxRatio, ratio));
  const valid: [number, number][] = [];
  for (let h = step; h <= maxEdge; h += step) {
    const w = Math.round((h * drawn) / step) * step;
    if (w < step || w > maxEdge || w * h < minPixels || w * h > maxPixels || w > h * maxRatio || h > w * maxRatio) continue;
    if (Math.abs(w / h - drawn) / drawn <= RATIO_TOLERANCE) valid.push([w, h]);
  }
  return valid;
}
const sizeOf = (w: number, h: number, ratio: number): GenerationSize => ({ width: w, height: h, size: `${w}x${h}`, band: ratio > IMAGE_API.maxRatio || ratio < 1 / IMAGE_API.maxRatio, experimental: w * h > IMAGE_API.stablePixels });

export function generationSizeFor(width: number, height: number): GenerationSize {
  const ratio = width / height;
  const valid = validSizes(ratio);
  // Larger than the model can draw: the largest canvas of that shape.
  const [w, h] = valid.find(([w, h]) => w >= width && h >= height && w * h >= DETAIL_PIXELS) ?? valid[valid.length - 1];
  return sizeOf(w, h, ratio);
}

/**
 * The canvas a finished design is drawn at: `scale` times the output in both directions, within the sizes the model
 * draws reliably (not the experimental ones above 2560×1440), and never smaller than `generationSizeFor`. The result
 * is scaled down to the output, which gives crisper letters and edges than drawing at the output size.
 */
export function drawSizeFor(width: number, height: number, scale = 1): GenerationSize {
  const base = generationSizeFor(width, height);
  if (!(scale > 1) || base.band || base.experimental) return base;
  const ratio = width / height;
  const valid = validSizes(ratio, IMAGE_API.stablePixels).filter(([w, h]) => w * h >= base.width * base.height);
  const [w, h] = valid.find(([w, h]) => w >= width * scale && h >= height * scale) ?? valid[valid.length - 1] ?? [base.width, base.height];
  return sizeOf(w, h, ratio);
}

/**
 * The part of a drawn canvas that survives fitting it to the output (scaled to cover, trimmed evenly): drawn
 * pixels left/top/width/height, and `scale` from drawn to output pixels. For a band size it is the kept band.
 */
export function coverWindow(drawn: { width: number; height: number }, output: { width: number; height: number }) {
  const scale = Math.max(output.width / drawn.width, output.height / drawn.height);
  const width = output.width / scale, height = output.height / scale;
  return { left: (drawn.width - width) / 2, top: (drawn.height - height) / 2, width, height, scale };
}

const safe = { top: 0, bottom: 0, left: 0, right: 0 };
/*
 * Covered areas per placement, from the platform guides gathered in docs/PLATFORM_LAYOUT_RULES.md (2026-11-03).
 * Stories and status: Meta's unified 9:16 guardrail keeps the top 14% and 6% at each side clear; an organic story's
 * reply bar and stickers take the bottom ~20%.
 */
const vertical = { top: 270, bottom: 390, left: 65, right: 65 };
/**
 * Vertical video covers (Reels, TikTok, Shorts): the same top and sides, plus the caption over the bottom 35% and
 * the like / comment / share column over the right ~15%.
 */
const verticalVideo = { top: 270, bottom: 672, left: 65, right: 160 };
/** Facebook page cover: phones show only the central ~75% (640 of 851 px) and the profile photo overlaps the lower edge. */
const facebookCover = { top: 0, bottom: 90, left: 211, right: 211 };
/** X header: phones keep about the central 1200×400 of 1500×500, and the profile photo sits over the lower-left. */
const xHeader = { top: 50, bottom: 110, left: 150, right: 150 };
/** LinkedIn page cover: trimmed on some screens; the page logo covers about the left quarter; LinkedIn warns about the lower right. */
const linkedinCover = { top: 16, bottom: 56, left: 390, right: 200 };
/** LinkedIn profile banner: the round profile photo covers the lower left on desktop; text belongs between x 420 and 1424. */
const linkedinBanner = { top: 40, bottom: 40, left: 420, right: 160 };
const p = (
  id: string,
  channel: Channel,
  en: string,
  ar: string,
  width: number,
  height: number,
  format: OutputFormat,
  area = safe,
  note?: string,
): PublishingPreset => ({
  id,
  channel,
  name: { en, ar },
  width,
  height,
  generation: generationSizeFor(width, height).size,
  format,
  safe: area,
  ...(note ? { note } : {}),
});
/** Production canvases. Reels/Shorts presets create cover artwork, not video. Sources: docs/publishing-formats.md. */
export const PUBLISHING_PRESETS: PublishingPreset[] = [
  p('facebook-feed', 'facebook', 'Portrait post', 'منشور طولي', 1080, 1350, 'feed'),
  p('facebook-square', 'facebook', 'Square / carousel card', 'مربع / شريحة كاروسيل', 1080, 1080, 'square'),
  p('facebook-story', 'facebook', 'Story', 'ستوري', 1080, 1920, 'story', vertical),
  p('facebook-reel', 'facebook', 'Reel cover', 'غلاف ريل', 1080, 1920, 'story', verticalVideo),
  p('facebook-link', 'facebook', 'Link image', 'صورة رابط', 1200, 630, 'landscape'),
  p('facebook-video', 'facebook', 'Video cover 16:9', 'غلاف فيديو 16:9', 1920, 1080, 'landscape'),
  p('facebook-page-cover', 'facebook', 'Page cover', 'غلاف الصفحة', 1702, 630, 'landscape', facebookCover),
  p('facebook-event', 'facebook', 'Event cover', 'غلاف فعالية', 1920, 1005, 'landscape'),
  p('instagram-feed', 'instagram', 'Portrait post', 'منشور طولي', 1080, 1350, 'feed'),
  p('instagram-square', 'instagram', 'Square / carousel card', 'مربع / شريحة كاروسيل', 1080, 1080, 'square'),
  p('instagram-grid', 'instagram', 'Grid portrait 3:4', 'طولي بمقاس الجريد 3:4', 1080, 1440, 'feed'),
  p('instagram-story', 'instagram', 'Story', 'ستوري', 1080, 1920, 'story', vertical),
  p('instagram-reel', 'instagram', 'Reel cover', 'غلاف ريل', 1080, 1920, 'story', verticalVideo),
  p('youtube-thumbnail', 'youtube', 'Video thumbnail 4K', 'صورة مصغرة للفيديو 4K', 3840, 2160, 'landscape'),
  p('youtube-thumbnail-hd', 'youtube', 'Video thumbnail HD', 'صورة مصغرة للفيديو HD', 1280, 720, 'landscape'),
  p('youtube-short', 'youtube', 'Shorts cover', 'غلاف شورتس', 1080, 1920, 'story', verticalVideo),
  p('youtube-banner', 'youtube', 'Channel banner', 'بانر القناة', 2560, 1440, 'landscape', { top: 509, bottom: 508, left: 507, right: 507 }),
  p('youtube-community', 'youtube', 'Community image', 'صورة منشور المجتمع', 1080, 1080, 'square'),
  p('linkedin-feed', 'linkedin', 'Portrait post 4:5', 'منشور طولي 4:5', 1080, 1350, 'feed'),
  p('linkedin-square', 'linkedin', 'Square post / multi-photo', 'منشور مربع / عدة صور', 1080, 1080, 'square'),
  p('linkedin-landscape', 'linkedin', 'Landscape post / link image 1.91:1', 'منشور عرضي / صورة رابط 1.91:1', 1200, 627, 'landscape'),
  p('linkedin-document', 'linkedin', 'Document / carousel slide', 'شريحة مستند / كاروسيل', 1080, 1350, 'feed'),
  p('linkedin-article', 'linkedin', 'Article / newsletter cover', 'غلاف مقال / نشرة', 1920, 1080, 'landscape'),
  p('linkedin-event', 'linkedin', 'Event cover 16:9', 'غلاف فعالية 16:9', 1600, 900, 'landscape'),
  p('linkedin-page-cover', 'linkedin', 'Company page cover', 'غلاف صفحة الشركة', 1512, 256, 'landscape', linkedinCover, 'Wider than 3:1: designed for the band that is kept.'),
  p('linkedin-profile-banner', 'linkedin', 'Personal profile banner', 'بانر الحساب الشخصي', 1584, 396, 'landscape', linkedinBanner, 'Wider than 3:1: designed for the band that is kept.'),
  p('linkedin-life-main', 'linkedin', 'Life tab main image', 'الصورة الرئيسية لتبويب Life', 1128, 376, 'landscape'),
  p('linkedin-company-photo', 'linkedin', 'Life tab company photo', 'صورة الشركة في تبويب Life', 900, 600, 'landscape'),
  p('linkedin-custom-module', 'linkedin', 'Life tab custom module', 'وحدة مخصصة في تبويب Life', 502, 282, 'landscape'),
  p('x-landscape', 'x', 'Landscape post', 'منشور عرضي', 1600, 900, 'landscape'),
  p('x-square', 'x', 'Square post', 'منشور مربع', 1080, 1080, 'square'),
  p('x-portrait', 'x', 'Portrait post', 'منشور طولي', 1080, 1350, 'feed'),
  p('x-header', 'x', 'Profile header', 'غلاف الحساب', 1500, 500, 'landscape', xHeader),
  p('whatsapp-status', 'whatsapp', 'Status', 'حالة', 1080, 1920, 'story', vertical),
  p('whatsapp-square', 'whatsapp', 'Square image', 'صورة مربعة', 1080, 1080, 'square'),
  p('tiktok-cover', 'tiktok', 'Vertical cover', 'غلاف عمودي', 1080, 1920, 'story', verticalVideo),
  p('tiktok-photo', 'tiktok', 'Photo / carousel slide', 'صورة / شريحة كاروسيل', 1080, 1920, 'story', verticalVideo),
  p('snapchat-story', 'snapchat', 'Story', 'ستوري', 1080, 1920, 'story', vertical),
  p('website-banner', 'website', 'Article / link banner', 'بانر مقال / رابط', 1200, 630, 'landscape'),
];
export const publishingPreset = (id?: string) =>
  PUBLISHING_PRESETS.find((p) => p.id === id);

/** Every size made for the chosen platforms, in catalogue order. */
export const presetsFor = (channels: readonly Channel[]) => PUBLISHING_PRESETS.filter((p) => channels.includes(p.channel));

export type CanvasShape = 'vertical' | 'portrait' | 'square' | 'landscape' | 'banner';
/** The layout family a size belongs to; it decides how a design is re-laid-out for it. */
export function shapeOf(width: number, height: number): CanvasShape {
  const ratio = width / height;
  if (ratio <= 0.65) return 'vertical';
  if (ratio < 0.9) return 'portrait';
  if (ratio <= 1.1) return 'square';
  return ratio < 2.2 ? 'landscape' : 'banner';
}

/** How a design is laid out for each shape family: the recipe the planner, the image model and the critic share. */
export const SHAPE_LAYOUT: Record<CanvasShape, string> = {
  vertical: 'Full-screen vertical canvas read top to bottom on a phone: the headline large in the upper third, below the top interface; the subject fills the middle; facts in one short stack; the call to action at about two-thirds of the height, above the bottom interface. Nothing essential near the right edge, where platform buttons sit.',
  portrait: 'Portrait feed canvas, the tallest a feed shows: the headline in the upper half, the subject large in the middle, facts and the call to action in the lower third; keep the essentials inside the central 3:4 area.',
  square: 'Square canvas: one strong centred or diagonal composition, a headline of at most two lines, the subject and the type balanced, generous margins; nothing essential in the outer 5%.',
  landscape: 'Landscape canvas, often shown small: split it in two — for Arabic the headline and facts on the right half, the subject on the left — with a headline of one or two lines at least 9% of the height; no small print.',
  banner: 'Very wide banner or cover: one horizontal band — the headline and at most one short line beside the subject, the logo space at one end; the far edges and the areas covered by profile photos or page logos are background only.',
};

/**
 * How much of the approved copy a size carries. Thumbnails and link-sized images are seen small, and covers stay up
 * for months, so they carry fewer words, set larger; dropped lines stay in the caption.
 */
export type CopyDensity = 'full' | 'reduced' | 'thumbnail' | 'brand';
const BRAND_PLACEMENTS = ['facebook-page-cover', 'youtube-banner', 'linkedin-page-cover', 'linkedin-profile-banner', 'linkedin-life-main', 'linkedin-company-photo', 'linkedin-custom-module', 'x-header'];
export function copyDensityOf(canvas: { id?: string; width: number; height: number }): CopyDensity {
  if (canvas.id && BRAND_PLACEMENTS.includes(canvas.id)) return 'brand';
  if (canvas.id?.startsWith('youtube-thumbnail') || canvas.id === 'video') return 'thumbnail';
  const shape = shapeOf(canvas.width, canvas.height);
  return shape === 'banner' ? 'brand' : shape === 'landscape' ? 'reduced' : 'full';
}
export const COPY_DENSITY_NOTE: Record<CopyDensity, string> = {
  full: '',
  reduced: ' This size carries fewer words (no supporting line), set larger.',
  thumbnail: ' Seen as a small thumbnail: only the headline and one fact, very large.',
  brand: ' A long-lived brand placement: only the headline and its supporting line, no dates and no button.',
};

/** Where and how each platform's audience sees a feed post; the layout is judged in that setting. */
const SEEN_IN_FEED: Record<Channel, string> = {
  facebook: 'Seen in the Facebook feed, mostly on phones, among friends\' posts.',
  instagram: 'Seen in the Instagram feed on phones; the profile grid shows only the central 3:4 area of a post.',
  linkedin: 'Seen in the LinkedIn feed by working professionals, on desktop and phone: credible, clear and calm, the career outcome first.',
  x: 'Seen in the X timeline among text posts, often small: one large idea.',
  whatsapp: 'Seen in a WhatsApp chat or status on a phone.',
  tiktok: 'Seen full-screen on TikTok with the caption, buttons and progress bar over the lower and right edges.',
  snapchat: 'Seen full-screen on Snapchat with the interface over the top and bottom.',
  youtube: 'Seen on YouTube, often as a small thumbnail beside other videos: a big face or object and very few large words.',
  website: 'Seen as the Engosoft website article banner and as the link preview when the page is shared.',
};
/** Placements that are not feed posts. */
const SEEN_AT: Record<string, string> = {
  'facebook-page-cover': 'The cover across the top of the Engosoft Facebook page; phones show only its centre.',
  'facebook-event': 'The cover at the top of a Facebook event page and its invitation.',
  'facebook-video': 'The cover frame of a Facebook video before it plays.',
  'youtube-banner': 'The YouTube channel banner: TVs show all of it, phones only the central strip.',
  'linkedin-article': 'The cover above a LinkedIn article or newsletter edition, and its preview in the feed.',
  'linkedin-event': 'The cover of a LinkedIn event page and its card in the feed.',
  'linkedin-page-cover': 'The cover across the top of the Engosoft LinkedIn company page, behind the page logo and name.',
  'linkedin-profile-banner': 'The background banner of an Engosoft team member\'s LinkedIn profile, behind the round profile photo.',
  'linkedin-life-main': 'The main image of the Life tab on the Engosoft LinkedIn page, seen by people considering working there.',
  'linkedin-company-photo': 'A photo in the Life tab gallery of the Engosoft LinkedIn page; it opens larger when clicked.',
  'linkedin-custom-module': 'A small card in the Life tab of the Engosoft LinkedIn page: very few, large words.',
  'x-header': 'The header across the top of the Engosoft X profile, behind the profile photo.',
};
/**
 * Where each element goes on a placement, from the same guides: what to keep out of the corners the platform covers
 * and where the logo, headline, subject and button sit. Shapes without a rule use the shape recipe alone.
 */
const PLACEMENT_RULES: Record<string, string> = {
  story: 'Element distribution: the logo and the headline inside the safe band, never in the top 14%; the subject in the middle of the screen; the button in the lower part of the central band, never in the bottom 20% where the reply bar and stickers sit.',
  video: 'Element distribution: everything between 14% and 65% of the height and clear of the right 15% (like, comment and share buttons); the caption covers the bottom third, so only background goes there. The profile grid shows the central 3:4 area, so the headline sits inside it.',
  'youtube-thumbnail': 'Element distribution: three to five very large words on one side, a big face or object on the other; the bottom-right corner (about 15%) carries the video length, so no text, face or logo there; keep the essentials in the central 80%.',
  'youtube-thumbnail-hd': 'Element distribution: three to five very large words on one side, a big face or object on the other; the bottom-right corner (about 15%) carries the video length, so no text, face or logo there; keep the essentials in the central 80%.',
  'facebook-page-cover': 'Element distribution: phones show only the central 75% of the width, so the headline and the logo sit there; the lower-left is covered by the page photo on desktop.',
  'x-header': 'Element distribution: only the central 1200×400 is safe on every screen; the profile photo covers the lower-left, so the headline sits centre-right.',
  'linkedin-page-cover': 'Element distribution: the page logo covers the left quarter; the headline sits centre-right, one short line.',
  'linkedin-profile-banner': 'Element distribution: the profile photo covers the lower-left on desktop and the centre on phones; keep text between 27% and 90% of the width, upper half.',
  'instagram-feed': 'Element distribution: the profile grid shows only the central 3:4 area, so the headline, the button and the logo stay inside it.',
};
const placementRule = (canvas: { id?: string; height: number; width: number }, safe: PublishingPreset['safe']) =>
  (canvas.id && PLACEMENT_RULES[canvas.id]) || (canvas.height / canvas.width > 1.6 ? (safe.bottom > canvas.height * 0.3 ? PLACEMENT_RULES.video : PLACEMENT_RULES.story) : '');

const seenOn = (preset: PublishingPreset) => SEEN_AT[preset.id] ?? (preset.format === 'story' ? 'Seen full-screen on a phone, with the platform interface over the top and bottom.' : SEEN_IN_FEED[preset.channel]);

/**
 * Layout instructions for the image model for any canvas: how it is seen, the layout recipe for its shape, the band
 * kept from a wider-than-3:1 drawing, and the areas the platform covers, in percentages of the drawn canvas.
 */
export function describeCanvas(canvas: { id?: string; title: string; seen: string; width: number; height: number; safe: PublishingPreset['safe'] }): string {
  const { width, height, safe } = canvas;
  const drawn = generationSizeFor(width, height);
  const kept = coverWindow(drawn, canvas);
  const pct = (value: number, of: number) => Math.round((value / of) * 100);
  const zones = [
    safe.top ? `top ${pct(kept.top + safe.top / kept.scale, drawn.height)}%` : '',
    safe.bottom ? `bottom ${pct(drawn.height - kept.top - kept.height + safe.bottom / kept.scale, drawn.height)}%` : '',
    safe.left ? `left ${pct(kept.left + safe.left / kept.scale, drawn.width)}%` : '',
    safe.right ? `right ${pct(drawn.width - kept.left - kept.width + safe.right / kept.scale, drawn.width)}%` : '',
  ].filter(Boolean);
  const band = drawn.band
    ? ` The model cannot draw a shape this wide, so the canvas is drawn at 3:1 and only its central band, from ${pct(kept.top, drawn.height)}% to ${pct(kept.top + kept.height, drawn.height)}% of the height, is kept: the complete design — every word, the subject and the logo space — sits inside that band; above and below it the background only continues. The logo space and any corner named elsewhere mean the corners of that band.`
    : '';
  const rule = placementRule(canvas, safe);
  return `${canvas.title}, ${width}×${height} px. ${canvas.seen} ${SHAPE_LAYOUT[shapeOf(width, height)]}${COPY_DENSITY_NOTE[copyDensityOf(canvas)]}${band}${zones.length ? ` Keep text and the logo out of the ${zones.join(', ')} of the drawn canvas (platform interface, profile photo or crop).` : ''}${rule ? ` ${rule}` : ''}`;
}

/** Layout instructions for the image model when a design is made or recomposed for this size. */
export const canvasBrief = (preset: PublishingPreset): string =>
  describeCanvas({ id: preset.id, title: `${preset.channel} ${preset.name.en}`, seen: seenOn(preset), width: preset.width, height: preset.height, safe: preset.safe });

/** A post's finished images: the main design, the three slots and the sizes designed for single presets. */
export interface CreativeImages { requestId?: string; reelCover?: ReelCover; reelCovers?: ReelCovers; imageUrl?: string; storyUrl?: string; landscapeUrl?: string; youtubeUrl?: string; sizes?: Record<string, string> }

/** The post sizes a platform publishes in its feed, preferred first (covers and banners are never posted). */
const POST_SIZES: Partial<Record<Channel, string[]>> = {
  facebook: ['facebook-feed', 'facebook-square', 'facebook-link'],
  instagram: ['instagram-feed', 'instagram-grid', 'instagram-square'],
  linkedin: ['linkedin-feed', 'linkedin-square', 'linkedin-landscape'],
  x: ['x-portrait', 'x-landscape', 'x-square'],
  tiktok: ['tiktok-photo', 'tiktok-cover'],
  snapchat: ['snapchat-story'],
  whatsapp: ['whatsapp-status', 'whatsapp-square'],
  youtube: ['youtube-thumbnail-hd', 'youtube-thumbnail'],
  website: ['website-banner'],
};
const SLOT: Partial<Record<Channel, keyof CreativeImages>> = { tiktok: 'storyUrl', snapchat: 'storyUrl', whatsapp: 'storyUrl', youtube: 'youtubeUrl', website: 'landscapeUrl' };

/**
 * The image a platform gets when the post is published: a size designed for that platform, then the slot its
 * shape fills (9:16 for TikTok, Snapchat and WhatsApp), then the main design.
 */
export function imageForChannel(channel: Channel, creative?: CreativeImages | null): string | undefined {
  if (!creative) return undefined;
  const cover = reelCoverFor(channel, creative);
  if (cover) return cover.url;
  const own = (POST_SIZES[channel] ?? []).map((id) => creative.sizes?.[id]).find(Boolean);
  const slot = SLOT[channel];
  return own || (slot ? (creative[slot] as string | undefined) : undefined) || creative.imageUrl;
}

/** Every finished image on a post, once each: what may be published or picked for a carousel. */
export const creativeImageUrls = (creative?: CreativeImages | null): string[] =>
  creative ? [...new Set([creative.imageUrl, creative.storyUrl, creative.landscapeUrl, creative.youtubeUrl, creative.reelCover?.url, ...Object.values(creative.reelCovers ?? {}).map((cover) => cover.url), ...Object.values(creative.sizes ?? {})].filter((url): url is string => Boolean(url)))] : [];
