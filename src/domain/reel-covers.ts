import type { Channel, Text } from './shared';

export interface ReelCover { url: string; timestampMs?: number }
export type ReelCovers = Partial<Record<Channel, ReelCover>>;
export interface ReelArtwork { requestId?: string; imageUrl?: string; reelCover?: ReelCover; reelCovers?: ReelCovers }

/** The platform override, then the common cover, including older Reel drafts. */
export function reelCoverFor(channel: Channel, creative?: ReelArtwork | null): ReelCover | undefined {
  return creative?.reelCovers?.[channel] ?? creative?.reelCover
    ?? (creative?.requestId === 'reel' && creative.imageUrl ? { url: creative.imageUrl } : undefined);
}

export const COVER_HELP: Record<Channel, Text> = {
  instagram: { en: 'This image is sent as the Reel cover.', ar: 'الصورة دي بتتبعت كغلاف للريل.' },
  facebook: { en: 'Sent as the video thumbnail on Facebook.', ar: 'بتتبعت كصورة مصغّرة للفيديو على فيسبوك.' },
  youtube: { en: 'Applied after YouTube finishes processing. The channel must allow custom thumbnails.', ar: 'بتتضاف بعد ما يوتيوب يجهّز الفيديو. القناة لازم تسمح بالصور المصغّرة المخصصة.' },
  linkedin: { en: 'Sent with the video. LinkedIn may use an automatic cover if it refuses the image.', ar: 'بتتبعت مع الفيديو. لو لينكدإن رفض الصورة، بيختار غلاف تلقائي.' },
  tiktok: { en: 'Choose a video frame, or upload a cover when the connected publishing service supports it. Inbox uploads finish in TikTok.', ar: 'اختار لقطة من الفيديو، أو ارفع غلاف لو ربط النشر بيدعمه. رفع صندوق الوارد بيتكمّل من تيك توك.' },
  snapchat: { en: 'Saved for preview and download. Snapchat does not accept a separate cover through this connection.', ar: 'محفوظة للمعاينة والتحميل. ربط سناب الحالي مش بيقبل صورة غلاف منفصلة.' },
  whatsapp: { en: 'Saved for preview and download; the cover is chosen in WhatsApp when posting by hand.', ar: 'محفوظة للمعاينة والتحميل؛ اختيار الغلاف بيتم من واتساب وقت النشر اليدوي.' },
  x: { en: 'Download it with the video and choose it when posting by hand.', ar: 'نزّلها مع الفيديو واختارها وقت النشر اليدوي.' },
  website: { en: 'Download it to use as the video poster on the website.', ar: 'نزّلها لاستخدامها كواجهة للفيديو على الموقع.' },
};
