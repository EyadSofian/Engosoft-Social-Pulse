export const CALENDAR_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'snapchat'] as const;
export type CalendarPlatform = typeof CALENDAR_PLATFORMS[number];
export interface CalendarPostInput {
  title: string; caption: string; date: string; time: string; timezone: string;
  mediaType: 'image' | 'reel' | 'video' | 'carousel'; mediaSource: 'drive' | 'upload';
  design: string; thumbnail: string; mediaIds: string[];
  platforms: CalendarPlatform[]; targets: Partial<Record<CalendarPlatform, string>>; notes: string;
  youtubePrivacy: string; youtubeCategory: string; madeForKids: string;
  tiktokPrivacy: string; aiGenerated: string; tiktokCommercial: string; snapTarget: string; snapLocale: string;
}
export interface CalendarPostRecord {
  id: string; contentId: string; version: number; input: CalendarPostInput; editable: boolean; origin: 'dashboard' | 'sheet';
  status: string; errors: string; urls: string; preview: string | null; scheduledAt: string | null;
  jobs: { provider: string; state: string; url?: string; error?: string }[];
}
