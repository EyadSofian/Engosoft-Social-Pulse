import type { PostSizeId } from '../post-design/templates';

export const PLATFORM_FORMATS = {
  instagram: { label: 'Instagram', format: 'Portrait feed', sizeId: 'portrait', copyLimit: 220, headlineLimit: 70 },
  facebook: { label: 'Facebook', format: 'Square feed', sizeId: 'square', copyLimit: 360, headlineLimit: 85 },
  whatsapp: { label: 'WhatsApp', format: 'Status', sizeId: 'story', copyLimit: 120, headlineLimit: 50 },
  linkedin: { label: 'LinkedIn', format: 'Landscape feed', sizeId: 'linkedin-wide', copyLimit: 350, headlineLimit: 75 },
  tiktok: { label: 'TikTok', format: 'Vertical', sizeId: 'story', copyLimit: 100, headlineLimit: 48 },
  snapchat: { label: 'Snapchat', format: 'Vertical', sizeId: 'story', copyLimit: 80, headlineLimit: 44 },
} as const satisfies Record<string, { label: string; format: string; sizeId: PostSizeId; copyLimit: number; headlineLimit: number }>;
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
