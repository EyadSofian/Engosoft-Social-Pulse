export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'snapchat' | 'website';
export type PlanStatus = 'draft' | 'approved' | 'scheduled' | 'published' | 'cancelled';
export interface Metrics { views: number | null; reach: number | null; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; clicks: number | null; engagement: number | null; }
export interface ObservedPost { platform: Platform; accountId: string; accountName: string; externalId: string; permalink: string; title: string; publishedAt: string; contentType: string; thumbnail: string; metrics: Metrics; }
export interface WebsitePageDay { date: string; path: string; title: string; views: number; activeUsers: number; engagementSeconds: number; }
export interface Plan { id: string; platform: Platform; accountId: string; title: string; caption: string; scheduledAt: string; status: PlanStatus; permalink: string; externalId: string; owner: string; contentType: string; campaign: string; notes: string; sourceKey: string; createdAt: string; updatedAt: string; }
export interface ConnectorResult { platform: Platform; status: 'connected' | 'needs_setup' | 'error'; message: string; posts: ObservedPost[]; website?: { date: string; views: number; sessions: number; engagedSessions: number }[]; websitePages?: WebsitePageDay[]; }
export const blankMetrics = (): Metrics => ({ views:null, reach:null, impressions:null, likes:null, comments:null, shares:null, saves:null, clicks:null, engagement:null });
