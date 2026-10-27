import type { ContentStatus } from '../../domain/content';
import type { Text } from '../../domain/shared';

export type Channel = 'facebook' | 'instagram' | 'whatsapp' | 'linkedin' | 'tiktok' | 'snapchat' | 'youtube' | 'website';
export interface CreativeRef { requestId: string; directionId: string; imageUrl: string; storyUrl?: string; landscapeUrl?: string; youtubeUrl?: string; model?: string; directionName?: string; svgTemplate?: { id: string; values: Record<string, string>; format?: 'feed' | 'square' | 'story' | 'landscape'; context?: string; outputPreset?: string } }
export interface PipelineItem {
  id: string; title: string; status: ContentStatus; departmentId: string | null; ownerId: string;
  channels: Channel[]; captions: Partial<Record<Channel, string>>; creative: CreativeRef | null;
  scheduledAt: string | null; planIds: string[]; templateId: string | null; createdAt: string; updatedAt: string;
  published?: { platform: string; permalink: string; publishedAt: string; metrics: Record<string, number | null> }[];
  moves: { to: ContentStatus; needsNote: boolean }[];
  editable: boolean;
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

/** The button label for moving an item to a status. */
export const MOVE_LABEL: Partial<Record<ContentStatus, Text>> = {
  ready_for_review: { en: 'Send to marketing', ar: 'أرسله إلى التسويق' },
  approved: { en: 'Approve', ar: 'اعتمد' },
  changes_requested: { en: 'Request changes', ar: 'اطلب تعديلًا' },
  scheduled: { en: 'Schedule', ar: 'جدوِل النشر' },
  in_production: { en: 'Back to production', ar: 'أعِده للتنفيذ' },
  draft: { en: 'Back to draft', ar: 'أعِده مسودة' },
  cancelled: { en: 'Cancel', ar: 'إلغاء' },
  archived: { en: 'Archive', ar: 'أرشفة' },
};

export const CHANNEL_LABEL: Record<Channel, string> = { facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', linkedin: 'LinkedIn', tiktok: 'TikTok', snapchat: 'Snapchat', youtube: 'YouTube', website: 'Website' };
