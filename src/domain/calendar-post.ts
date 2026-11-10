export const CALENDAR_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'snapchat'] as const;
export type CalendarPlatform = typeof CALENDAR_PLATFORMS[number];
export interface CalendarPostInput {
  title: string; caption: string; date: string; time: string; timezone: string;
  mediaType: 'image' | 'reel' | 'video' | 'carousel'; mediaSource: 'drive' | 'upload';
  design: string; thumbnail: string; mediaIds: string[];
  /** A carousel's own order (and choice) of the uploaded images for one platform; absent means the main order. */
  mediaOrder?: Partial<Record<CalendarPlatform, string[]>>;
  platforms: CalendarPlatform[]; targets: Partial<Record<CalendarPlatform, string>>; notes: string;
  youtubePrivacy: string; youtubeCategory: string; madeForKids: string;
  tiktokPrivacy: string; aiGenerated: string; tiktokCommercial: string; snapTarget: string; snapLocale: string;
}
/** Carousel sizes each platform accepts (the server enforces the same). */
export const CAROUSEL_LIMITS: Partial<Record<CalendarPlatform, [number, number]>> = { facebook: [2, 20], instagram: [2, 20], linkedin: [2, 20], tiktok: [2, 35] };

export interface CalendarPostRecord {
  id: string; contentId: string; version: number; input: CalendarPostInput; editable: boolean; origin: 'dashboard' | 'sheet';
  status: string; errors: string; urls: string; preview: string | null; scheduledAt: string | null;
  jobs: { provider: string; state: string; url?: string; error?: string }[];
}
