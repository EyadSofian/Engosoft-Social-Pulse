import type { Channel, Id, Iso, Priority, Provenance } from './shared';
import type { DepartmentId, Permission } from './users';

export type ContentStatus =
  | 'idea'
  | 'draft'
  | 'in_production'
  | 'ready_for_review'
  | 'changes_requested'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'archived'
  | 'cancelled';

export const CONTENT_STATUSES: ContentStatus[] = [
  'idea',
  'draft',
  'in_production',
  'ready_for_review',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
  'archived',
  'cancelled',
];

/** Board columns: the working pipeline. Archived and cancelled items are listed, not boarded. */
export const BOARD_STATUSES: ContentStatus[] = ['idea', 'draft', 'in_production', 'ready_for_review', 'changes_requested', 'approved', 'scheduled', 'published'];

export type ContentType = 'post' | 'carousel' | 'reel' | 'video' | 'story' | 'article' | 'poster';
export const CONTENT_TYPES: ContentType[] = ['post', 'carousel', 'reel', 'video', 'story', 'article', 'poster'];

export interface PlatformVersion {
  channel: Channel;
  caption: string;
  /** Platform-specific notes: aspect ratio, hashtags, character limits. */
  note: string;
}

export interface ContentItem {
  id: Id;
  title: string;
  type: ContentType;
  departmentId: DepartmentId;
  campaignId: Id | null;
  ownerId: Id;
  assigneeId: Id | null;
  channels: Channel[];
  status: ContentStatus;
  priority: Priority;
  dueAt: Iso | null;
  publishAt: Iso | null;
  templateId: Id | null;
  caption: string;
  versions: PlatformVersion[];
  assetIds: Id[];
  /** AI help recorded on the item; never implies the AI published anything. */
  ai: { used: boolean; credits: number; tools: string[] };
  publishedUrl: string;
  courseId: Id | null;
  achievementId: Id | null;
  /** The monthly-plan target this item counts toward. */
  planTargetId: Id | null;
  origin: 'manual' | 'template' | 'ai_assisted' | 'calendar';
  provenance: Provenance;
  /** Set for items adapted from the existing calendar plans table. */
  legacyPlanId?: Id;
  createdAt: Iso;
  updatedAt: Iso;
}

export interface Comment {
  id: Id;
  entity: { kind: 'content' | 'task'; id: Id };
  authorId: Id;
  body: string;
  mentions: Id[];
  createdAt: Iso;
}

export type ActivityAction =
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'submitted_for_review'
  | 'approved'
  | 'changes_requested'
  | 'rejected'
  | 'scheduled'
  | 'published_recorded'
  | 'commented'
  | 'task_created'
  | 'task_completed'
  | 'asset_attached'
  | 'ai_used';

export interface ActivityLog {
  id: Id;
  entity: { kind: 'content' | 'task' | 'plan' | 'user'; id: Id };
  actorId: Id;
  action: ActivityAction;
  /** Free text or a status pair, e.g. "draft→ready_for_review". */
  detail: string;
  at: Iso;
}

/**
 * The status pipeline. Every move names the permission it needs; Marketing
 * holds approval and scheduling, so departments cannot publish around review.
 */
export interface Transition {
  to: ContentStatus;
  permission: Permission | null;
  /** Moves that need extra input open a form instead of applying directly. */
  needs?: 'note' | 'publish_time' | 'publish_proof';
}

export const TRANSITIONS: Record<ContentStatus, Transition[]> = {
  idea: [
    { to: 'draft', permission: null },
    { to: 'cancelled', permission: null },
  ],
  draft: [
    { to: 'in_production', permission: null },
    { to: 'ready_for_review', permission: null },
    { to: 'cancelled', permission: null },
  ],
  in_production: [
    { to: 'ready_for_review', permission: null },
    { to: 'draft', permission: null },
    { to: 'cancelled', permission: null },
  ],
  ready_for_review: [
    { to: 'approved', permission: 'content.approve' },
    { to: 'changes_requested', permission: 'content.approve', needs: 'note' },
    { to: 'cancelled', permission: 'content.approve', needs: 'note' },
  ],
  changes_requested: [
    { to: 'in_production', permission: null },
    { to: 'ready_for_review', permission: null },
  ],
  approved: [
    { to: 'scheduled', permission: 'content.schedule', needs: 'publish_time' },
    { to: 'changes_requested', permission: 'content.approve', needs: 'note' },
  ],
  scheduled: [
    { to: 'published', permission: 'content.publish', needs: 'publish_proof' },
    { to: 'approved', permission: 'content.schedule' },
  ],
  published: [{ to: 'archived', permission: 'content.publish' }],
  archived: [],
  cancelled: [{ to: 'draft', permission: null }],
};

export const OPEN_STATUSES = new Set<ContentStatus>(['idea', 'draft', 'in_production', 'ready_for_review', 'changes_requested', 'approved', 'scheduled']);
export const isOpen = (item: Pick<ContentItem, 'status'>) => OPEN_STATUSES.has(item.status);
