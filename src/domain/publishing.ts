import type { ConnectorStatus, Metrics, Platform } from '../types';
import type { Channel, Id, Iso, Provenance } from './shared';

/** A social account the connectors have seen posts from. */
export interface PlatformAccount {
  id: string;
  platform: Platform;
  name: string;
  postCount: number;
}

export type PublicationState = 'scheduled' | 'due' | 'missed' | 'published' | 'cancelled' | 'draft';

/** A slot on the publishing calendar. Today these come from the `plans` table. */
export interface ScheduledPublication {
  id: Id;
  contentId: Id | null;
  channel: Channel;
  accountId: string;
  scheduledAt: Iso;
  state: PublicationState;
  provenance: Provenance;
  legacyPlanId?: Id;
}

/** A post the connectors observed on a platform. Today these come from the `observed_posts` table. */
export interface Publication {
  key: string;
  contentId: Id | null;
  platform: Platform;
  accountId: string;
  accountName: string;
  externalId: string;
  permalink: string;
  title: string;
  contentType: string;
  publishedAt: Iso;
}

/** Where a number came from: every metric on screen names its provider, account and freshness. */
export interface MetricSource {
  provider: string;
  account: string;
  /** Last connector check, or null when the source never synced. */
  updatedAt: Iso | null;
  status: ConnectorStatus;
}

export interface AnalyticsSnapshot {
  publicationKey: string;
  metrics: Metrics;
  engagementRate: number | null;
  source: MetricSource;
}

export const PROVIDER: Record<Platform, string> = {
  facebook: 'Meta Graph API',
  instagram: 'Meta Graph API (Instagram)',
  tiktok: 'TikTok Display API',
  snapchat: 'Snapchat Public Profile API',
  website: 'Google Analytics 4 Data API',
};
