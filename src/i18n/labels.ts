import type { ContentStatus, ContentType } from '../domain/content';
import type { NotificationCategory } from '../domain/management';
import type { EventKind } from '../domain/planning';
import type { Channel, Priority, Text } from '../domain/shared';


const L = (en: string, ar: string): Text => ({ en, ar });

export const contentStatusLabel: Record<ContentStatus, Text> = {
  idea: L('Idea', 'فكرة'),
  draft: L('Draft', 'مسودة'),
  in_production: L('In production', 'قيد الإنتاج'),
  ready_for_review: L('Ready for review', 'جاهز للمراجعة'),
  changes_requested: L('Changes requested', 'مطلوب تعديلات'),
  approved: L('Approved', 'معتمد'),
  scheduled: L('Scheduled', 'مجدول'),
  published: L('Published', 'منشور'),
  archived: L('Archived', 'مؤرشف'),
  cancelled: L('Cancelled', 'ملغي'),
};

/** Tone per status: a quiet dot and tint, never a full saturated fill. */
export const contentStatusTone: Record<ContentStatus, Tone> = {
  idea: 'neutral',
  draft: 'neutral',
  in_production: 'violet',
  ready_for_review: 'warning',
  changes_requested: 'danger',
  approved: 'success',
  scheduled: 'brand',
  published: 'success',
  archived: 'neutral',
  cancelled: 'neutral',
};

export type Tone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

export const contentTypeLabel: Record<ContentType, Text> = {
  post: L('Post', 'منشور'),
  carousel: L('Carousel', 'كاروسيل'),
  reel: L('Reel', 'ريل'),
  video: L('Video', 'فيديو'),
  story: L('Story', 'ستوري'),
  article: L('Article', 'مقال'),
  poster: L('Poster', 'بوستر'),
};

export const priorityLabel: Record<Priority, Text> = {
  low: L('Low', 'منخفضة'),
  normal: L('Normal', 'عادية'),
  high: L('High', 'عالية'),
  urgent: L('Urgent', 'عاجلة'),
};

export const priorityTone: Record<Priority, Tone> = { low: 'neutral', normal: 'neutral', high: 'warning', urgent: 'danger' };

export const channelName: Record<Channel, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
  website: 'Website',
};

export const notificationCategoryLabel: Record<NotificationCategory, Text> = {
  task_assigned: L('Assigned task', 'مهمة جديدة'),
  review_required: L('Review required', 'مطلوب مراجعة'),
  changes_requested: L('Changes requested', 'مطلوب تعديلات'),
  approved: L('Approved', 'تم الاعتماد'),
  publishing_reminder: L('Publishing reminder', 'تذكير نشر'),
  publishing_failure: L('Publishing not confirmed', 'نشر غير مؤكد'),
  deadline: L('Deadline', 'موعد تسليم'),
  mention: L('Mention', 'إشارة'),
  credit_warning: L('Credit warning', 'تنبيه رصيد'),
  integration_problem: L('Integration problem', 'مشكلة ربط'),
};

export const eventKindLabel: Record<EventKind, Text> = {
  national: L('National day', 'مناسبة وطنية'),
  religious: L('Religious occasion', 'مناسبة دينية'),
  international: L('International day', 'يوم عالمي'),
  engineering: L('Engineering', 'هندسي'),
  education: L('Education', 'تعليمي'),
  company: L('Company milestone', 'مناسبة الشركة'),
  certification: L('Certification', 'شهادات'),
  season: L('Seasonal', 'موسمي'),
};
