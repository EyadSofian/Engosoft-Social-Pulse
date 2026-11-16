export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'snapchat' | 'youtube' | 'linkedin' | 'website';
/** X can also have plan rows, published by hand and not measured. */
export type PlanPlatform = Platform | 'x';
export type PlanState = 'published' | 'upcoming' | 'due' | 'missed' | 'draft' | 'cancelled';
export type PlanStatus = 'draft' | 'approved' | 'scheduled' | 'published' | 'cancelled';
export type ConnectorStatus = 'connected' | 'needs_setup' | 'error';

export interface Metrics {
  views: number | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  engagement: number | null;
}

/** Organic or paid, as the server read it (see server/types.ts). Every number is null when not reported. */
export interface Promotion {
  paid: boolean | null;
  source: 'insights' | 'ads' | 'manual' | '';
  organicViews: number | null;
  paidViews: number | null;
  adReach: number | null;
  adImpressions: number | null;
  adClicks: number | null;
  adEngagement: number | null;
  spend: number | null;
  currency: string;
  ads: number;
}

/** How a post reached people: on its own, or with money behind it (a boost or an ad). */
export type Reach = 'organic' | 'paid';

/* ── API payloads (GET /api/dashboard) ─────────────────────────────── */

export interface ApiPost {
  platform: Platform;
  accountId: string;
  accountName: string;
  externalId: string;
  permalink: string;
  title: string;
  publishedAt: string;
  contentType: string;
  thumbnail: string;
  metrics: Metrics;
  engagementRate: number | null;
  /** Missing for posts not read since paid/organic was added, and for platforms that cannot tell. */
  promotion?: Promotion;
}

export interface ApiPlan {
  id: string;
  platform: PlanPlatform;
  accountId: string;
  title: string;
  caption: string;
  scheduledAt: string;
  status: PlanStatus;
  permalink: string;
  externalId: string;
  owner: string;
  contentType: string;
  /** reach, engagement, leads or traffic; empty or missing when the plan names none. */
  goal?: string;
  campaign: string;
  notes: string;
  computedState: PlanState;
}

export interface Alert {
  id: string;
  planId: string;
  kind: string;
  message: string;
  createdAt: string;
  deliveredAt: string;
  dismissedAt: string;
}

export interface Connector {
  lastSuccessAt?: string;
  partial?: boolean;
  platform: Platform;
  status: ConnectorStatus;
  message: string;
  checkedAt: string;
}

export interface WebsiteDay {
  date: string;
  views: number;
  sessions: number;
  engagedSessions: number;
}

export interface WebsitePageDay {
  date: string;
  path: string;
  title: string;
  views: number;
  activeUsers: number;
  engagementSeconds: number;
}

export interface ApiDashboard {
  generatedAt: string;
  timeZone: string;
  posts: ApiPost[];
  plans: ApiPlan[];
  alerts: Alert[];
  connectors: Connector[];
  website: WebsiteDay[];
  websitePages: WebsitePageDay[];
  /** Missing from older servers. */
  audience?: AudienceDay[];
}

/** One slice of an audience breakdown: an age group, gender, country or city, and its count or percentage. */
export interface AudienceSlice {
  key: string;
  value: number;
}

export interface AudienceDemographics {
  /** Followers (Instagram) or viewers in the last 90 days (YouTube). */
  basis: 'followers' | 'viewers';
  age?: AudienceSlice[];
  gender?: AudienceSlice[];
  country?: AudienceSlice[];
  city?: AudienceSlice[];
  /** LinkedIn only: where followers work and at what level. */
  region?: AudienceSlice[];
  industry?: AudienceSlice[];
  function?: AudienceSlice[];
  seniority?: AudienceSlice[];
  companySize?: AudienceSlice[];
}

/** An account's audience on one business day. */
export interface AudienceDay {
  platform: Platform;
  accountId: string;
  accountName: string;
  /** yyyy-MM-dd in the business timezone. */
  date: string;
  followers: number | null;
  demographics: AudienceDemographics | null;
}

export interface SyncResult {
  platform: Platform;
  status: ConnectorStatus;
  message: string;
  postCount: number;
  days: number;
  pageDays: number;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
}

export type PlanInput = Omit<ApiPlan, 'id' | 'computedState'> & { id?: string };

/** Fields a calendar drag or a board move can change without reopening the form. */
export type PlanPatch = Partial<Pick<ApiPlan, 'scheduledAt' | 'status' | 'permalink' | 'externalId'>>;

/* ── View models: API rows with their business-timezone fields precomputed ── */

export interface Post extends ApiPost {
  key: string;
  ts: number;
  /** Day number in the business timezone (days since epoch). */
  dayNum: number;
  /** yyyy-MM-dd in the business timezone. */
  day: string;
  /** yyyy-MM in the business timezone. */
  month: string;
  /** 0–23 in the business timezone. */
  hour: number;
  /** 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** True when the source returned at least one of likes/comments/shares/saves. */
  measured: boolean;
  interactions: number;
  /** Organic unless the platform, the ads account or a person said money was spent on it. */
  reachKind: Reach;
  /** Who decided `reachKind`: the platform or ads account, a person, or nobody (no data, so organic). */
  reachKindBy: 'platform' | 'manual' | 'unknown';
}

export interface Plan extends ApiPlan {
  ts: number;
  dayNum: number;
  day: string;
}

export interface Dashboard {
  generatedAt: string;
  timeZone: string;
  posts: Post[];
  plans: Plan[];
  alerts: Alert[];
  connectors: Connector[];
  website: WebsiteDay[];
  websitePages: WebsitePageDay[];
  audience: AudienceDay[];
}
