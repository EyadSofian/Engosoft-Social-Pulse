import type { Permission } from './users';
export const PERMISSION_LABELS: Record<
  Permission,
  { group: string; en: string; ar: string }
> = {
  'content.create': {
    group: 'content',
    en: 'Create content',
    ar: 'إنشاء المحتوى',
  },
  'content.edit_own': {
    group: 'content',
    en: 'Edit own content',
    ar: 'تعديل المحتوى الخاص به',
  },
  'content.edit_department': {
    group: 'content',
    en: 'Edit department content',
    ar: 'تعديل محتوى القسم',
  },
  'content.edit_any': {
    group: 'content',
    en: 'View and edit all content',
    ar: 'عرض وتعديل محتوى كل الأقسام',
  },
  'content.approve': {
    group: 'workflow',
    en: 'Approve and request changes',
    ar: 'الاعتماد وطلب التعديلات',
  },
  'content.schedule': {
    group: 'workflow',
    en: 'Schedule and withdraw publishing',
    ar: 'الجدولة وسحب مواعيد النشر',
  },
  'content.publish': {
    group: 'workflow',
    en: 'Manage publication workflow',
    ar: 'إدارة مراحل النشر والأرشفة',
  },
  'design.free': {
    group: 'design',
    en: 'Free design and Studio',
    ar: 'التصميم الحر والاستوديو',
  },
  'templates.manage': {
    group: 'design',
    en: 'Manage templates and course profiles',
    ar: 'إدارة القوالب وملفات الدورات',
  },
  'task.assign': { group: 'workflow', en: 'Assign tasks', ar: 'إسناد المهام' },
  'analytics.view': {
    group: 'reports',
    en: 'View analytics',
    ar: 'عرض التحليلات',
  },
  'analytics.view_all': {
    group: 'reports',
    en: 'View all departments’ analytics',
    ar: 'عرض تحليلات كل الأقسام',
  },
  'credits.view': {
    group: 'reports',
    en: 'View own usage',
    ar: 'عرض الاستهلاك الخاص به',
  },
  'credits.view_all': {
    group: 'reports',
    en: 'View team usage',
    ar: 'عرض استهلاك الفريق',
  },
  'plans.view_all': {
    group: 'reports',
    en: 'View all content plans',
    ar: 'عرض خطط كل الأقسام',
  },
  'users.manage': {
    group: 'admin',
    en: 'Manage accounts and permissions',
    ar: 'إدارة الحسابات والصلاحيات',
  },
  'connections.manage': {
    group: 'admin',
    en: 'Manage platform connections',
    ar: 'إدارة ربط المنصات',
  },
  'admin.access': {
    group: 'admin',
    en: 'Access administration',
    ar: 'دخول إدارة النظام',
  },
};
