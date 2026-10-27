import type { PostSizeId } from '../post-design/templates';

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
