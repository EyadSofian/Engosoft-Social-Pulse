import type { Channel, Text } from './shared';

/** What the browser and the server can read from an MP4 before it is published. */
export interface VideoFacts { duration: number; width: number; height: number; bytes: number }

/**
 * Short vertical video limits per platform. Durations match what the publishing code enforces (Instagram 3–900 s,
 * TikTok up to 600 s, Snapchat 5–60 s and at least 540×960); Facebook Reels and YouTube Shorts use their Reel and
 * Short limits. `vertical` platforms show anything other than 9:16 with bars or a crop.
 */
export const REEL_RULES: Partial<Record<Channel, { min: number; max: number; vertical: boolean; minWidth?: number; minHeight?: number }>> = {
  instagram: { min: 3, max: 900, vertical: true },
  facebook: { min: 3, max: 90, vertical: true },
  tiktok: { min: 3, max: 600, vertical: true, minWidth: 360 },
  snapchat: { min: 5, max: 60, vertical: true, minWidth: 540, minHeight: 960 },
  youtube: { min: 1, max: 180, vertical: true },
  x: { min: 1, max: 140, vertical: false },
  linkedin: { min: 3, max: 600, vertical: false },
  whatsapp: { min: 1, max: 60, vertical: true },
};

/** The server accepts MP4 uploads up to this size. */
export const MAX_REEL_BYTES = 200 * 1024 * 1024;

export interface ReelIssue { level: 'error' | 'warn'; text: Text }

const seconds = (value: number) => (value >= 60 ? `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}` : `${Math.round(value)}s`);

/** Why this video cannot go out on this platform (error) or will not look right there (warn). */
export function checkReel(video: VideoFacts, channel: Channel): ReelIssue[] {
  const issues: ReelIssue[] = [];
  if (video.bytes > MAX_REEL_BYTES) issues.push({ level: 'error', text: { en: 'Larger than 200 MB. Export a smaller MP4.', ar: 'أكبر من 200 ميجابايت. صدّر MP4 أصغر.' } });
  const rule = REEL_RULES[channel];
  if (!rule) return [...issues, { level: 'warn', text: { en: 'This platform has no video publishing here; it is posted by hand.', ar: 'المنصة دي مفيهاش نشر فيديو من هنا؛ بيتنشر يدوي.' } }];
  if (video.duration < rule.min) issues.push({ level: 'error', text: { en: `Shorter than ${seconds(rule.min)} (it is ${seconds(video.duration)}).`, ar: `أقصر من ${seconds(rule.min)} (مدته ${seconds(video.duration)}).` } });
  if (video.duration > rule.max) issues.push({ level: 'error', text: { en: `Longer than ${seconds(rule.max)} (it is ${seconds(video.duration)}).`, ar: `أطول من ${seconds(rule.max)} (مدته ${seconds(video.duration)}).` } });
  if ((rule.minWidth && Math.min(video.width, video.height) < rule.minWidth) || (rule.minHeight && Math.max(video.width, video.height) < rule.minHeight))
    issues.push({ level: 'error', text: { en: `Resolution too low (${video.width}×${video.height}).`, ar: `الدقة قليلة (${video.width}×${video.height}).` } });
  const ratio = video.width / video.height;
  if (rule.vertical && Math.abs(ratio - 9 / 16) > 0.02) issues.push({ level: 'warn', text: { en: `Not 9:16 (${video.width}×${video.height}); it will show with bars or cropped.`, ar: `مش 9:16 (${video.width}×${video.height})؛ هيظهر بحواف أو مقصوص.` } });
  else if (rule.vertical && video.width < 1080) issues.push({ level: 'warn', text: { en: `Below 1080×1920; it may look soft.`, ar: 'أقل من 1080×1920؛ ممكن يبان مش حاد.' } });
  return issues;
}

/** The text the caption writer gets for a Reel: the idea or the script, never the video itself. */
export function reelFacts(title: string, source: 'idea' | 'script', text: string): string {
  return [
    'Post type: a short vertical video (Reel / TikTok / Short). The caption goes with the video; describe only what is written here, never visuals you were not told about.',
    `Title: ${title.trim()}`,
    source === 'script' ? `Script of the video:\n${text.trim()}` : `Idea of the video: ${text.trim()}`,
  ].join('\n').slice(0, 3000);
}
