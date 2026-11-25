export const YOUTUBE_ANALYTICS_PERIODS = [7, 28, 90, 365] as const;
export type YouTubeAnalyticsPeriod = typeof YOUTUBE_ANALYTICS_PERIODS[number];

export interface YouTubeChannelMetrics {
  channel: string;
  channelId: string;
  startDate: string;
  endDate: string;
  viewsThrough: string | null;
  activityThrough: string | null;
  totals: { views: number | null; minutes: number | null; likes: number | null; comments: number | null; shares: number | null; subscribersGained: number | null; subscribersLost: number | null };
  daily: { date: string; views: number | null; minutes: number | null }[];
}
