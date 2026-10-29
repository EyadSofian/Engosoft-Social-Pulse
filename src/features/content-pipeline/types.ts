import type { ContentStatus } from '../../domain/content';
import type { Goal } from '../../domain/goals';
import type { Text } from '../../domain/shared';

export type Channel = 'facebook' | 'instagram' | 'whatsapp' | 'linkedin' | 'x' | 'tiktok' | 'snapchat' | 'youtube' | 'website';
export interface CreativeRef { requestId: string; directionId: string; imageUrl: string; storyUrl?: string; landscapeUrl?: string; youtubeUrl?: string; sizes?: Record<string, string>; model?: string; directionName?: string; svgTemplate?: { id: string; values: Record<string, string>; format?: 'feed' | 'square' | 'story' | 'landscape'; context?: string; outputPreset?: string } }
export interface PipelineItem {
  id: string; title: string; status: ContentStatus; departmentId: string | null; ownerId: string;
  channels: Channel[]; captions: Partial<Record<Channel, string>>; creative: CreativeRef | null;
  scheduledAt: string | null; planIds: string[]; templateId: string | null; createdAt: string; updatedAt: string;
  /** Why the post exists, the day it is planned for before scheduling, and the plan row it was made for. */
  goal: Goal | null; plannedFor: string | null; slotId: string | null;
  published?: { platform: string; permalink: string; publishedAt: string; metrics: Record<string, number | null> }[];
  moves: { to: ContentStatus; needsNote: boolean }[];
  editable: boolean;
  /** This person may put posts on the calendar (offered when approving). */
  canSchedule?: boolean;
  canPublish?: boolean;
  /** An approved or scheduled post this person may send back for changes. */
  canReopen?: boolean;
}
export interface PipelineEvent { id: string; actorId: string; kind: 'created' | 'transition' | 'comment' | 'version' | 'caption'; from: string | null; to: string | null; body: string; createdAt: string }
export interface PipelineVersion { id: string; imageUrl: string; storyUrl: string | null; studio: unknown; note: string; createdBy: string; createdAt: string }
export interface PipelineDetail extends PipelineItem { versions: PipelineVersion[]; events: PipelineEvent[] }
export interface TeamMember { id: string; name: string; departmentId: string | null; role: string }

/** Board columns; in-production work sits with drafts, archived and cancelled are filtered out. */
export const COLUMNS: { id: string; statuses: ContentStatus[]; label: Text; tone: string }[] = [
  { id: 'draft', statuses: ['idea', 'draft', 'in_production'], label: { en: 'Drafts', ar: 'مسودات' }, tone: 'neutral' },
  { id: 'review', statuses: ['ready_for_review'], label: { en: 'In review', ar: 'في المراجعة' }, tone: 'brand' },
  { id: 'changes', statuses: ['changes_requested'], label: { en: 'Changes requested', ar: 'مطلوب تعديل' }, tone: 'warning' },
  { id: 'approved', statuses: ['approved'], label: { en: 'Approved', ar: 'معتمد' }, tone: 'success' },
  { id: 'scheduled', statuses: ['scheduled'], label: { en: 'Scheduled', ar: 'مجدول' }, tone: 'brand' },
  { id: 'published', statuses: ['published'], label: { en: 'Published', ar: 'منشور' }, tone: 'success' },
];

export const STATUS_LABEL: Record<ContentStatus, Text> = {
  idea: { en: 'Idea', ar: 'فكرة' }, draft: { en: 'Draft', ar: 'مسودة' }, in_production: { en: 'In production', ar: 'في التنفيذ' },
  ready_for_review: { en: 'In review', ar: 'في المراجعة' }, changes_requested: { en: 'Changes requested', ar: 'مطلوب تعديل' },
  approved: { en: 'Approved', ar: 'معتمد' }, scheduled: { en: 'Scheduled', ar: 'مجدول' }, published: { en: 'Published', ar: 'منشور' },
  archived: { en: 'Archived', ar: 'مؤرشف' }, cancelled: { en: 'Cancelled', ar: 'ملغي' },
};

export const CHANNEL_LABEL: Record<Channel, string> = { facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', snapchat: 'Snapchat', youtube: 'YouTube', website: 'Website' };
