import type { AssetKind } from '../domain/assets';
import type { ContentStatus, ContentType } from '../domain/content';
import type { CreditKind, KpiKind, NotificationCategory } from '../domain/management';
import type { CourseStatus, EventKind, RewardOption } from '../domain/planning';
import type { Channel, Priority, Text } from '../domain/shared';
import type { Permission } from '../domain/users';
import type { ApprovalStatus, TaskKind, TaskStatus } from '../domain/workflow';

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
  post: L('Post', 'بوست'),
  carousel: L('Carousel', 'كاروسيل'),
  reel: L('Reel', 'ريل'),
  video: L('Video', 'فيديو'),
  story: L('Story', 'ستوري'),
  article: L('Article', 'مقال'),
  poster: L('Poster', 'بوستر'),
};

export const taskStatusLabel: Record<TaskStatus, Text> = {
  todo: L('To do', 'للتنفيذ'),
  in_progress: L('In progress', 'قيد التنفيذ'),
  waiting: L('Waiting', 'بانتظار'),
  done: L('Done', 'تم'),
  cancelled: L('Cancelled', 'ملغاة'),
};

export const taskStatusTone: Record<TaskStatus, Tone> = {
  todo: 'neutral',
  in_progress: 'brand',
  waiting: 'warning',
  done: 'success',
  cancelled: 'neutral',
};

export const taskKindLabel: Record<TaskKind, Text> = {
  design: L('Design', 'تصميم'),
  video_edit: L('Video edit', 'مونتاج'),
  copy: L('Copywriting', 'كتابة'),
  capture: L('Capture', 'تصوير / التقاط'),
  revision: L('Revision', 'تعديل'),
  review: L('Review', 'مراجعة'),
  coordination: L('Coordination', 'تنسيق'),
};

export const priorityLabel: Record<Priority, Text> = {
  low: L('Low', 'منخفضة'),
  normal: L('Normal', 'عادية'),
  high: L('High', 'عالية'),
  urgent: L('Urgent', 'عاجلة'),
};

export const priorityTone: Record<Priority, Tone> = { low: 'neutral', normal: 'neutral', high: 'warning', urgent: 'danger' };

export const approvalStatusLabel: Record<ApprovalStatus, Text> = {
  pending: L('Waiting for Marketing', 'بانتظار التسويق'),
  approved: L('Approved', 'معتمد'),
  changes_requested: L('Changes requested', 'مطلوب تعديلات'),
  rejected: L('Rejected', 'مرفوض'),
};

export const approvalStatusTone: Record<ApprovalStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  changes_requested: 'danger',
  rejected: 'neutral',
};

export const channelName: Record<Channel, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
  website: 'Website',
};

export const assetKindLabel: Record<AssetKind, Text> = {
  image: L('Image', 'صورة'),
  video: L('Video', 'فيديو'),
  audio: L('Audio', 'صوت'),
  certificate: L('Certificate', 'شهادة'),
  document: L('Document', 'مستند'),
  zoom_capture: L('Zoom capture', 'لقطة Zoom'),
  logo: L('Logo', 'شعار'),
  template_asset: L('Template asset', 'عنصر قالب'),
};

export const creditKindLabel: Record<CreditKind, Text> = {
  text: L('Text', 'نصوص'),
  image: L('Images', 'صور'),
  video: L('Video', 'فيديو'),
};

export const kpiKindLabel: Record<KpiKind, Text> = {
  operational: L('Operational', 'تشغيلي'),
  performance: L('Content performance', 'أداء المحتوى'),
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

export const courseStatusLabel: Record<CourseStatus, Text> = {
  scheduled: L('Scheduled', 'مجدول'),
  running: L('Running', 'جارٍ'),
  completed: L('Completed', 'انتهى'),
};

export const rewardLabel: Record<RewardOption, Text> = {
  discount_50: L('50% discount coupon', 'كوبون خصم 50%'),
  exam_booking_support: L('Free international exam booking support', 'دعم مجاني لحجز الامتحان الدولي'),
};

export const permissionLabel: Record<Permission, Text> = {
  'content.create': L('Create content', 'إنشاء محتوى'),
  'content.edit_own': L('Edit own content', 'تعديل محتواه'),
  'content.edit_department': L('Edit department content', 'تعديل محتوى القسم'),
  'content.edit_any': L('Edit all content', 'تعديل كل المحتوى'),
  'content.approve': L('Approve content', 'اعتماد المحتوى'),
  'content.schedule': L('Schedule content', 'جدولة المحتوى'),
  'content.publish': L('Record publishing', 'تسجيل النشر'),
  'task.assign': L('Assign tasks', 'إسناد المهام'),
  'users.manage': L('Manage users', 'إدارة المستخدمين'),
  'templates.manage': L('Manage templates', 'إدارة القوالب'),
  'analytics.view': L('View analytics', 'عرض التحليلات'),
  'analytics.view_all': L('View all departments’ analytics', 'تحليلات كل الأقسام'),
  'credits.view': L('View credits', 'عرض الرصيد'),
  'credits.view_all': L('View all credit wallets', 'رصيد كل الأقسام'),
  'connections.manage': L('Manage connections', 'إدارة الربط'),
  'plans.view_all': L('View all monthly plans', 'كل الخطط الشهرية'),
  'admin.access': L('Open administration', 'فتح الإدارة'),
};
