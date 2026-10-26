/**
 * Adapters from the records the API serves today (plans, observed posts,
 * connector status) to the new domain entities. Nothing is copied or
 * migrated in SQLite: the old tables stay the source of truth.
 *
 *   Plan          → ContentItem + ScheduledPublication
 *   ObservedPost  → Publication + AnalyticsSnapshot
 */
import type { ContentItem, ContentStatus } from '../../domain/content';
import type { AnalyticsSnapshot, MetricSource, Publication, ScheduledPublication } from '../../domain/publishing';
import { PROVIDER } from '../../domain/publishing';
import type { Connector, Plan, PlanState, Platform, Post } from '../../types';

const STATUS: Record<Plan['status'], ContentStatus> = {
  draft: 'draft',
  approved: 'approved',
  scheduled: 'scheduled',
  published: 'published',
  cancelled: 'cancelled',
};

const TYPE: Record<string, ContentItem['type']> = { post: 'post', reel: 'reel', video: 'video', story: 'story', spotlight: 'video' };

/** Calendar plans carry an owner name, not a user id; the prefix keeps them apart from workspace users. */
export const EXTERNAL_OWNER = 'ext:';

export function planToContentItem(plan: Plan): ContentItem {
  return {
    id: `live-${plan.id}`,
    title: plan.title,
    type: TYPE[plan.contentType.toLowerCase()] ?? 'post',
    // Calendar plans are Marketing's publishing plan until departments are stored with them.
    departmentId: 'marketing',
    campaignId: null,
    ownerId: plan.owner ? `${EXTERNAL_OWNER}${plan.owner}` : '',
    assigneeId: null,
    channels: [plan.platform],
    status: plan.computedState === 'published' ? 'published' : STATUS[plan.status],
    priority: 'normal',
    dueAt: plan.scheduledAt,
    publishAt: plan.scheduledAt,
    templateId: null,
    caption: plan.caption,
    versions: [],
    assetIds: [],
    ai: { used: false, credits: 0, tools: [] },
    publishedUrl: plan.permalink,
    courseId: null,
    achievementId: null,
    planTargetId: null,
    origin: 'calendar',
    provenance: 'live',
    legacyPlanId: plan.id,
    createdAt: plan.scheduledAt,
    updatedAt: plan.scheduledAt,
  };
}

const PUBLICATION_STATE: Record<PlanState, ScheduledPublication['state']> = {
  published: 'published',
  upcoming: 'scheduled',
  due: 'due',
  missed: 'missed',
  draft: 'draft',
  cancelled: 'cancelled',
};

export function planToScheduledPublication(plan: Plan): ScheduledPublication {
  return {
    id: `sp-${plan.id}`,
    contentId: `live-${plan.id}`,
    channel: plan.platform,
    accountId: plan.accountId,
    scheduledAt: plan.scheduledAt,
    state: PUBLICATION_STATE[plan.computedState],
    provenance: 'live',
    legacyPlanId: plan.id,
  };
}

export function postToPublication(post: Post): Publication {
  return {
    key: post.key,
    contentId: null,
    platform: post.platform,
    accountId: post.accountId,
    accountName: post.accountName,
    externalId: post.externalId,
    permalink: post.permalink,
    title: post.title,
    contentType: post.contentType,
    publishedAt: post.publishedAt,
  };
}

export function sourceOf(platform: Platform, connectors: Connector[], account = ''): MetricSource {
  const connector = connectors.find((entry) => entry.platform === platform);
  return {
    provider: PROVIDER[platform],
    account,
    updatedAt: connector?.checkedAt || null,
    status: connector?.status ?? 'needs_setup',
  };
}

export function postToSnapshot(post: Post, connectors: Connector[]): AnalyticsSnapshot {
  return {
    publicationKey: post.key,
    metrics: post.metrics,
    engagementRate: post.engagementRate,
    source: sourceOf(post.platform, connectors, post.accountName || post.accountId),
  };
}
