import type { Channel } from './shared';
export type OutputFormat = 'feed' | 'square' | 'story' | 'landscape';
export interface PublishingPreset {
  id: string;
  channel: Channel;
  name: { en: string; ar: string };
  width: number;
  height: number;
  generation: string;
  format: OutputFormat;
  safe: { top: number; bottom: number; left: number; right: number };
  note?: string;
}
const safe = { top: 0, bottom: 0, left: 0, right: 0 };
const vertical = { top: 250, bottom: 390, left: 60, right: 60 };
/** Facebook page cover: mobile shows a 2.4:1 centre crop and the profile photo overlaps the lower edge. */
const facebookCover = { top: 0, bottom: 90, left: 100, right: 100 };
/** X header: phones trim the top and bottom, and the profile photo sits over the lower corner. */
const xHeader = { top: 60, bottom: 110, left: 40, right: 40 };
const p = (
  id: string,
  channel: Channel,
  en: string,
  ar: string,
  width: number,
  height: number,
  generation: string,
  format: OutputFormat,
  area = safe,
): PublishingPreset => ({
  id,
  channel,
  name: { en, ar },
  width,
  height,
  generation,
  format,
  safe: area,
});
/** Production canvases. Reels/Shorts presets create cover artwork, not video. Sources: docs/publishing-formats.md. */
export const PUBLISHING_PRESETS: PublishingPreset[] = [
  p(
    'facebook-feed',
    'facebook',
    'Portrait post',
    'منشور طولي',
    1080,
    1350,
    '1088x1360',
    'feed',
  ),
  p(
    'facebook-square',
    'facebook',
    'Square / carousel card',
    'مربع / شريحة كاروسيل',
    1080,
    1080,
    '1024x1024',
    'square',
  ),
  p(
    'facebook-story',
    'facebook',
    'Story',
    'ستوري',
    1080,
    1920,
    '1088x1936',
    'story',
    vertical,
  ),
  p(
    'facebook-reel',
    'facebook',
    'Reel cover',
    'غلاف ريل',
    1080,
    1920,
    '1088x1936',
    'story',
    vertical,
  ),
  p(
    'facebook-link',
    'facebook',
    'Link image',
    'صورة رابط',
    1200,
    630,
    '1520x800',
    'landscape',
  ),
  p(
    'facebook-video',
    'facebook',
    'Video cover 16:9',
    'غلاف فيديو 16:9',
    1920,
    1080,
    '1536x864',
    'landscape',
  ),
  p(
    'facebook-page-cover',
    'facebook',
    'Page cover',
    'غلاف الصفحة',
    1702,
    630,
    '1728x640',
    'landscape',
    facebookCover,
  ),
  p(
    'facebook-event',
    'facebook',
    'Event cover',
    'غلاف فعالية',
    1920,
    1005,
    '1536x800',
    'landscape',
  ),
  p(
    'instagram-feed',
    'instagram',
    'Portrait post',
    'منشور طولي',
    1080,
    1350,
    '1088x1360',
    'feed',
  ),
  p(
    'instagram-square',
    'instagram',
    'Square / carousel card',
    'مربع / شريحة كاروسيل',
    1080,
    1080,
    '1024x1024',
    'square',
  ),
  p(
    'instagram-grid',
    'instagram',
    'Grid portrait 3:4',
    'طولي بمقاس الجريد 3:4',
    1080,
    1440,
    '1088x1456',
    'feed',
  ),
  p(
    'instagram-story',
    'instagram',
    'Story',
    'ستوري',
    1080,
    1920,
    '1088x1936',
    'story',
    vertical,
  ),
  p(
    'instagram-reel',
    'instagram',
    'Reel cover',
    'غلاف ريل',
    1080,
    1920,
    '1088x1936',
    'story',
    vertical,
  ),
  p(
    'youtube-thumbnail',
    'youtube',
    'Video thumbnail 4K',
    'صورة مصغرة للفيديو 4K',
    3840,
    2160,
    '3840x2160',
    'landscape',
  ),
  p(
    'youtube-thumbnail-hd',
    'youtube',
    'Video thumbnail HD',
    'صورة مصغرة للفيديو HD',
    1280,
    720,
    '1536x864',
    'landscape',
  ),
  p(
    'youtube-short',
    'youtube',
    'Shorts cover',
    'غلاف شورتس',
    1080,
    1920,
    '1088x1936',
    'story',
    vertical,
  ),
  p(
    'youtube-banner',
    'youtube',
    'Channel banner',
    'بانر القناة',
    2560,
    1440,
    '2560x1440',
    'landscape',
    { top: 509, bottom: 508, left: 507, right: 507 },
  ),
  p(
    'youtube-community',
    'youtube',
    'Community image',
    'صورة منشور المجتمع',
    1080,
    1080,
    '1024x1024',
    'square',
  ),
  p(
    'linkedin-feed',
    'linkedin',
    'Portrait post',
    'منشور طولي',
    1080,
    1350,
    '1088x1360',
    'feed',
  ),
  p(
    'linkedin-square',
    'linkedin',
    'Square post',
    'منشور مربع',
    1080,
    1080,
    '1024x1024',
    'square',
  ),
  p(
    'linkedin-landscape',
    'linkedin',
    'Landscape post',
    'منشور عرضي',
    1200,
    627,
    '1520x800',
    'landscape',
  ),
  p(
    'linkedin-document',
    'linkedin',
    'Document / carousel slide',
    'شريحة مستند / كاروسيل',
    1080,
    1350,
    '1088x1360',
    'feed',
  ),
  p(
    'linkedin-article',
    'linkedin',
    'Article cover',
    'غلاف مقال',
    1920,
    1080,
    '1536x864',
    'landscape',
  ),
  p(
    'linkedin-event',
    'linkedin',
    'Event cover',
    'غلاف فعالية',
    1600,
    900,
    '1536x864',
    'landscape',
  ),
  p(
    'x-landscape',
    'x',
    'Landscape post',
    'منشور عرضي',
    1600,
    900,
    '1536x864',
    'landscape',
  ),
  p(
    'x-square',
    'x',
    'Square post',
    'منشور مربع',
    1080,
    1080,
    '1024x1024',
    'square',
  ),
  p(
    'x-portrait',
    'x',
    'Portrait post',
    'منشور طولي',
    1080,
    1350,
    '1088x1360',
    'feed',
  ),
  p(
    'x-header',
    'x',
    'Profile header',
    'غلاف الحساب',
    1500,
    500,
    '1872x624',
    'landscape',
    xHeader,
  ),
  p(
    'whatsapp-status',
    'whatsapp',
    'Status',
    'حالة',
    1080,
    1920,
    '1088x1936',
    'story',
    vertical,
  ),
  p(
    'whatsapp-square',
    'whatsapp',
    'Square image',
    'صورة مربعة',
    1080,
    1080,
    '1024x1024',
    'square',
  ),
  p(
    'tiktok-cover',
    'tiktok',
    'Vertical cover',
    'غلاف عمودي',
    1080,
    1920,
    '1088x1936',
    'story',
    vertical,
  ),
  p(
    'tiktok-photo',
    'tiktok',
    'Photo / carousel slide',
    'صورة / شريحة كاروسيل',
    1080,
    1920,
    '1088x1936',
    'story',
    vertical,
  ),
  p(
    'snapchat-story',
    'snapchat',
    'Story',
    'ستوري',
    1080,
    1920,
    '1088x1936',
    'story',
    vertical,
  ),
  p(
    'website-banner',
    'website',
    'Article / link banner',
    'بانر مقال / رابط',
    1200,
    630,
    '1520x800',
    'landscape',
  ),
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

const SHAPE_LAYOUT: Record<CanvasShape, string> = {
  vertical: 'Full-screen vertical canvas: stack the content top to bottom, headline in the upper third, the call to action low but above the interface zone.',
  portrait: 'Portrait feed canvas: headline in the upper half, subject filling the middle, call to action near the bottom.',
  square: 'Square canvas: one strong centred composition, headline and subject balanced, generous margins.',
  landscape: 'Landscape canvas: split it, headline and facts on one side, the subject on the other; the headline must stay readable when the image is shown small.',
  banner: 'Very wide banner or cover: keep the headline, one key fact and the logo inside the central safe area in a single horizontal band; the far edges are decorative background only, because they are cropped or covered on some screens.',
};

/** Layout instructions for the image model when a design is made or recomposed for this size. */
export function canvasBrief(preset: PublishingPreset): string {
  const { width, height, safe } = preset;
  const pct = (value: number, of: number) => Math.round((value / of) * 100);
  const zones = [
    safe.top ? `top ${pct(safe.top, height)}%` : '',
    safe.bottom ? `bottom ${pct(safe.bottom, height)}%` : '',
    safe.left ? `left ${pct(safe.left, width)}%` : '',
    safe.right ? `right ${pct(safe.right, width)}%` : '',
  ].filter(Boolean);
  return `${preset.channel} ${preset.name.en}, ${width}×${height} px. ${SHAPE_LAYOUT[shapeOf(width, height)]}${zones.length ? ` Keep text and the logo out of the ${zones.join(', ')} of the canvas (platform interface, profile photo or crop).` : ''}`;
}
