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
    en: 'Design with AI and the Studio',
    ar: 'التصميم بالذكاء الاصطناعي والاستوديو',
  },
  'design.templates': {
    group: 'design',
    en: 'Use ready templates',
    ar: 'استخدام القوالب الجاهزة',
  },
  'design.upload': {
    group: 'design',
    en: 'Upload finished designs',
    ar: 'رفع تصميم جاهز',
  },
  'design.video': {
    group: 'design',
    en: 'Upload Reels and videos',
    ar: 'رفع ريلز وفيديو',
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

/** One line on what each permission lets a person do, shown under its switch. */
export const PERMISSION_HINTS: Record<Permission, { en: string; ar: string }> = {
  'content.create': { en: 'Start new posts and send them for approval.', ar: 'يبدأ منشورات جديدة ويرسلها للاعتماد.' },
  'content.edit_own': { en: 'Change the posts they made, until approval.', ar: 'يعدّل منشوراته حتى الاعتماد.' },
  'content.edit_department': { en: 'Change posts from their whole department.', ar: 'يعدّل منشورات قسمه كله.' },
  'content.edit_any': { en: 'See and change posts from every department.', ar: 'يرى ويعدّل منشورات كل الأقسام.' },
  'content.approve': { en: 'Approve posts or send them back with a note.', ar: 'يعتمد المنشورات أو يرجعها بملاحظة.' },
  'content.schedule': { en: 'Upload the plan, give approved posts a time, move or remove it.', ar: 'يرفع الخطة، ويحدد موعد المعتمد، ويغيّره أو يلغيه.' },
  'content.publish': { en: 'Send approved posts to the connected accounts, now or at a time.', ar: 'ينشر المعتمد على الحسابات المربوطة، الآن أو في موعد.' },
  'design.free': { en: 'Generate designs with AI and edit freely in the Studio.', ar: 'يولّد تصميمات بالذكاء الاصطناعي ويعدّل بحرية في الاستوديو.' },
  'design.templates': { en: 'Make posts from the approved ready templates.', ar: 'يعمل منشورات من القوالب الجاهزة المعتمدة.' },
  'design.upload': { en: 'Upload a design finished in another program.', ar: 'يرفع تصميمًا جاهزًا معمولًا في برنامج آخر.' },
  'design.video': { en: 'Upload Reels and videos to posts, and design their covers.', ar: 'يرفع ريلز وفيديوهات للمنشورات ويصمم أغلفتها.' },
  'templates.manage': { en: 'Add and change templates and course profiles.', ar: 'يضيف ويعدّل القوالب وملفات الدورات.' },
  'task.assign': { en: 'Give tasks to other people.', ar: 'يسند مهام لأشخاص آخرين.' },
  'analytics.view': { en: 'See results and analytics.', ar: 'يرى النتائج والتحليلات.' },
  'analytics.view_all': { en: 'See every department’s results.', ar: 'يرى نتائج كل الأقسام.' },
  'credits.view': { en: 'See their own AI usage.', ar: 'يرى استهلاكه من الذكاء الاصطناعي.' },
  'credits.view_all': { en: 'See the whole team’s AI usage.', ar: 'يرى استهلاك الفريق كله.' },
  'plans.view_all': { en: 'See every department’s plan and posts.', ar: 'يرى خطط ومنشورات كل الأقسام.' },
  'users.manage': { en: 'Add people, change roles and permissions.', ar: 'يضيف أشخاصًا ويغيّر الأدوار والصلاحيات.' },
  'connections.manage': { en: 'Connect and disconnect platform accounts.', ar: 'يربط حسابات المنصات ويفصلها.' },
  'admin.access': { en: 'System settings.', ar: 'إعدادات النظام.' },
};
