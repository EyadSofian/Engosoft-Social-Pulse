import type { PostSizeId } from '../post-design/templates';
import { PUBLISHING_PRESETS, type PublishingPreset } from '../../domain/output-presets';

/**
 * Every platform's delivered size. Feed platforms share the 4:5 master (the size Instagram, Facebook and LinkedIn
 * all display best in the feed); vertical platforms get a 9:16 version with interface-safe zones; the website gets
 * a 1.91:1 banner that also works as the link preview image.
 */
export const PLATFORM_FORMATS = {
  youtube: { label: 'YouTube', format: 'Thumbnail 16:9', master: 'video', width: 1280, height: 720, sizeId: 'video-wide', copyLimit: 500, headlineLimit: 70 },
  instagram: { label: 'Instagram', format: 'Feed 4:5', master: 'feed', width: 1080, height: 1350, sizeId: 'portrait', copyLimit: 220, headlineLimit: 70 },
  facebook: { label: 'Facebook', format: 'Feed 4:5', master: 'feed', width: 1080, height: 1350, sizeId: 'portrait', copyLimit: 360, headlineLimit: 85 },
  linkedin: { label: 'LinkedIn', format: 'Feed 4:5', master: 'feed', width: 1080, height: 1350, sizeId: 'portrait', copyLimit: 350, headlineLimit: 75 },
  x: { label: 'X', format: 'Feed 4:5', master: 'feed', width: 1080, height: 1350, sizeId: 'portrait', copyLimit: 200, headlineLimit: 70 },
  whatsapp: { label: 'WhatsApp', format: 'Status 9:16', master: 'story', width: 1080, height: 1920, sizeId: 'story', copyLimit: 120, headlineLimit: 50 },
  tiktok: { label: 'TikTok', format: 'Vertical 9:16', master: 'story', width: 1080, height: 1920, sizeId: 'story', copyLimit: 100, headlineLimit: 48 },
  snapchat: { label: 'Snapchat', format: 'Vertical 9:16', master: 'story', width: 1080, height: 1920, sizeId: 'story', copyLimit: 80, headlineLimit: 44 },
  website: { label: 'Website', format: 'Banner 1.91:1', master: 'landscape', width: 1200, height: 630, sizeId: 'facebook-wide', copyLimit: 600, headlineLimit: 90 },
} as const satisfies Record<string, { label: string; format: string; master: 'feed' | 'story' | 'landscape' | 'video'; width: number; height: number; sizeId: PostSizeId; copyLimit: number; headlineLimit: number }>;
export type CreativeMaster = 'feed' | 'story' | 'landscape' | 'video';
/** The format generated first: feed when any feed platform is chosen, else vertical, else the website banner. */
export const masterFormat = (platforms: readonly CreativePlatform[]): CreativeMaster =>
  platforms.some((p) => PLATFORM_FORMATS[p].master === 'feed') ? 'feed' : platforms.some((p) => PLATFORM_FORMATS[p].master === 'story') ? 'story' : platforms.some(p => PLATFORM_FORMATS[p].master === 'video') ? 'video' : 'landscape';
/** Extra formats to adapt the master into for the chosen platforms. */
export const extraFormats = (platforms: readonly CreativePlatform[]): CreativeMaster[] => {
  const master = masterFormat(platforms);
  return (['story', 'landscape', 'video'] as const).filter((format) => format !== master && platforms.some((p) => PLATFORM_FORMATS[p].master === format));
};
export type CreativePlatform = keyof typeof PLATFORM_FORMATS;
export const CREATIVE_PLATFORMS = Object.keys(PLATFORM_FORMATS) as CreativePlatform[];

export interface PlatformVariant {
  platform: CreativePlatform;
  sizeId: PostSizeId;
  headline: string;
  caption: string;
  templateId: string;
}

/** Deterministic starting variants; each size is composed by the SVG layout renderer. */
export function buildPlatformVariants(platforms: CreativePlatform[], master: { headline: string; supportingCopy: string; templateId: string }): PlatformVariant[] {
  return platforms.map((platform) => {
    const format = PLATFORM_FORMATS[platform];
    return { platform, sizeId: format.sizeId, headline: master.headline.slice(0, format.headlineLimit), caption: master.supportingCopy.slice(0, format.copyLimit), templateId: master.templateId };
  });
}

/** The sizes ticked when a platform is chosen: what a post needs to go out there. More can be ticked on the Create page. */
export const DEFAULT_SIZES: Record<CreativePlatform, string[]> = {
  facebook: ['facebook-feed'], instagram: ['instagram-feed'], linkedin: ['linkedin-feed'], x: ['x-portrait'],
  whatsapp: ['whatsapp-status'], tiktok: ['tiktok-photo'], snapchat: ['snapchat-story'], youtube: ['youtube-thumbnail-hd'], website: ['website-banner'],
};
export const defaultSizes = (platforms: readonly CreativePlatform[]) => platforms.flatMap((p) => DEFAULT_SIZES[p]);

export const MASTER_SIZE: Record<CreativeMaster, { width: number; height: number }> = { feed: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 }, landscape: { width: 1200, height: 630 }, video: { width: 1280, height: 720 } };
const MASTERS = ['feed', 'story', 'landscape', 'video'] as const;
/** The master format a size is, when its pixels are one of the four master canvases. */
export const masterOf = (width: number, height: number): CreativeMaster | null => MASTERS.find((m) => MASTER_SIZE[m].width === width && MASTER_SIZE[m].height === height) ?? null;
/** Master formats the ticked sizes of these platforms can be designed at, feed first. */
export const masterChoices = (platforms: readonly CreativePlatform[], chosen: readonly string[]): CreativeMaster[] =>
  MASTERS.filter((m) => PUBLISHING_PRESETS.some((p) => chosen.includes(p.id) && (platforms as readonly string[]).includes(p.channel) && masterOf(p.width, p.height) === m));
/**
 * The size the two designs are made at: the one picked on the Create page, else the first master-shaped size
 * ticked (so ticking only Story designs both options as stories), else the platforms' default.
 */
export function mainFormat(platforms: readonly CreativePlatform[], chosen: readonly string[], picked?: CreativeMaster | null): CreativeMaster {
  const choices = masterChoices(platforms, chosen);
  return picked && choices.includes(picked) ? picked : choices[0] ?? masterFormat(platforms);
}
/** The main design's pixels for these platforms. */
export const masterSize = (platforms: readonly CreativePlatform[], main: CreativeMaster = masterFormat(platforms)) => MASTER_SIZE[main];
/** Which post slot a size fills when it is saved (the 9:16 story, the website banner, the YouTube thumbnail). */
export const slotOf = (width: number, height: number): 'storyUrl' | 'landscapeUrl' | 'youtubeUrl' | null =>
  width === 1080 && height === 1920 ? 'storyUrl' : width === 1200 && height === 630 ? 'landscapeUrl' : width === 1280 && height === 720 ? 'youtubeUrl' : null;

/** One design to make after the main one: a distinct shape and every chosen size of that shape. */
export interface SizeTarget { key: string; width: number; height: number; presets: PublishingPreset[] }

/**
 * The designs the chosen sizes need beyond the main design. Sizes with the same pixels share one design (a
 * 1080×1080 for Facebook, Instagram and LinkedIn is made once), made for the strictest safe area among them; the
 * main design already covers the sizes of its own pixels.
 */
export function sizeTargets(platforms: readonly CreativePlatform[], chosen: readonly string[], master: CreativeMaster = masterFormat(platforms)): SizeTarget[] {
  const main = MASTER_SIZE[master];
  const groups = new Map<string, PublishingPreset[]>();
  for (const preset of PUBLISHING_PRESETS) {
    if (!chosen.includes(preset.id) || !(platforms as readonly string[]).includes(preset.channel)) continue;
    if (preset.width === main.width && preset.height === main.height) continue;
    const key = `${preset.width}x${preset.height}`;
    groups.set(key, [...(groups.get(key) ?? []), preset]);
  }
  const strictness = (p: PublishingPreset) => p.safe.top + p.safe.bottom + p.safe.left + p.safe.right;
  return [...groups.values()].map((presets) => {
    const strictest = presets.reduce((a, b) => (strictness(b) > strictness(a) ? b : a));
    return { key: strictest.id, width: strictest.width, height: strictest.height, presets };
  });
}

/** Sizes the main design already is, among the chosen platforms: shown as included, not as extra designs. */
export const coveredByMain = (platforms: readonly CreativePlatform[], master: CreativeMaster = masterFormat(platforms)) => {
  const main = MASTER_SIZE[master];
  return PUBLISHING_PRESETS.filter((p) => (platforms as readonly string[]).includes(p.channel) && p.width === main.width && p.height === main.height).map((p) => p.id);
};
