export const YOUTUBE_ANALYTICS_PERIODS = [7, 28, 90, 365] as const;
export type YouTubeAnalyticsPeriod = typeof YOUTUBE_ANALYTICS_PERIODS[number];
export type YouTubeWindow = 'complete' | 'studio';

export interface YouTubeActivityTotals {
  views: number | null;
  minutes: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subscribersGained: number | null;
  subscribersLost: number | null;
}

export interface YouTubeChannelMetrics {
  channel: string;
  channelId: string;
  startDate: string;
  endDate: string;
  viewsThrough: string | null;
  activityThrough: string | null;
  studioEndDate: string;
  studioReportUrl: string | null;
  studioReportThrough: string | null;
  checkedAt: string;
  totals: YouTubeActivityTotals;
  publishedVideoTotals?: { count: number; views: number | null; interactions: number | null };
  daily: { date: string; views: number | null; minutes: number | null }[];
}

export interface YouTubeBreakdownRow {
  key: string;
  views: number | null;
  minutes: number | null;
}

export interface YouTubeBreakdowns {
  startDate: string;
  endDate: string;
  devices: YouTubeBreakdownRow[] | null;
  mobileSystems: YouTubeBreakdownRow[] | null;
  traffic: YouTubeBreakdownRow[] | null;
  countries: YouTubeBreakdownRow[] | null;
  subscribed: YouTubeBreakdownRow[] | null;
  age: { key: string; percentage: number }[] | null;
  gender: { key: string; percentage: number }[] | null;
  averageViewSeconds: number | null;
  averageViewPercentage: number | null;
  previous: { startDate: string; endDate: string; availableThrough: string | null; totals: YouTubeActivityTotals } | null;
  subscriberSnapshot?: { date: string; count: number | null };
}
