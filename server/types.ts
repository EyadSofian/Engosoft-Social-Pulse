export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'snapchat' | 'youtube' | 'linkedin' | 'website';
/** X can also have plan rows, published by hand and not measured. */
export type PlanPlatform = Platform | 'x';
export type PlanStatus = 'draft' | 'approved' | 'scheduled' | 'published' | 'cancelled';
export interface Metrics { views: number | null; reach: number | null; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; clicks: number | null; engagement: number | null; }
export interface ObservedPost { platform: Platform; accountId: string; accountName: string; externalId: string; permalink: string; title: string; publishedAt: string; contentType: string; thumbnail: string; metrics: Metrics; }
export interface WebsitePageDay { date: string; path: string; title: string; views: number; activeUsers: number; engagementSeconds: number; }
export interface Plan { id: string; platform: PlanPlatform; accountId: string; title: string; caption: string; scheduledAt: string; status: PlanStatus; permalink: string; externalId: string; owner: string; contentType: string; goal: string; campaign: string; notes: string; sourceKey: string; createdAt: string; updatedAt: string; }
/** One slice of an audience breakdown: an age group, a gender, a country or a city, and its count or percentage. */
export interface AudienceSlice { key: string; value: number }
/** Who the audience is. `basis` says whether it describes followers or recent viewers (YouTube only reports viewers). */
export interface AudienceDemographics { basis: 'followers' | 'viewers'; age?: AudienceSlice[]; gender?: AudienceSlice[]; country?: AudienceSlice[]; city?: AudienceSlice[];
 /** LinkedIn only: the professional profile of the followers. */
 region?: AudienceSlice[]; industry?: AudienceSlice[]; function?: AudienceSlice[]; seniority?: AudienceSlice[]; companySize?: AudienceSlice[] }
/** An account's audience as read during a sync; stored once per day so the follower count can be followed over time. */
export interface AudienceSnapshot { platform: Platform; accountId: string; accountName: string; followers: number | null; demographics?: AudienceDemographics | null }
export interface ConnectorResult { audience?: AudienceSnapshot[]; partial?:boolean; platform: Platform; status: 'connected' | 'needs_setup' | 'error'; message: string; posts: ObservedPost[]; website?: { date: string; views: number; sessions: number; engagedSessions: number }[]; websitePages?: WebsitePageDay[]; checkpoints?: {accountId:string;kind:string;value:string}[]; }
export const blankMetrics = (): Metrics => ({ views:null, reach:null, impressions:null, likes:null, comments:null, shares:null, saves:null, clicks:null, engagement:null });
