export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'snapchat' | 'youtube' | 'website';
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
}

export interface ApiPlan {
  id: string;
  platform: Platform;
  accountId: string;
  title: string;
  caption: string;
  scheduledAt: string;
  status: PlanStatus;
  permalink: string;
  externalId: string;
  owner: string;
  contentType: string;
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
}
