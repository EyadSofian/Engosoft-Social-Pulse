import type { ConnectorStatus, PlanState, PlanStatus, Platform } from '../types';

/** Display order is fixed: the platform palette is validated for these neighbours. */
export const PLATFORMS: Platform[] = ['facebook', 'instagram', 'tiktok', 'snapchat', 'website'];

export const platformName: Record<Platform, string> = {
  facebook: 'فيسبوك',
  instagram: 'إنستجرام',
  tiktok: 'تيك توك',
  snapchat: 'سناب شات',
  website: 'الموقع',
};

export const platformLatin: Record<Platform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
  website: 'Website',
};

export const platformColor = (platform: Platform) => `var(--p-${platform})`;

export const stateLabel: Record<PlanState, string> = {
  published: 'تم النشر',
  upcoming: 'قادم',
  due: 'حان موعده',
  missed: 'لم يتأكد النشر',
  draft: 'مسودة',
  cancelled: 'ملغي',
};

export const statusLabel: Record<PlanStatus, string> = {
  draft: 'مسودة',
  approved: 'موافق عليه',
  scheduled: 'مجدول',
  published: 'تم النشر',
  cancelled: 'ملغي',
};

export const connectorLabel: Record<ConnectorStatus, string> = {
  connected: 'متصل',
  error: 'يحتاج مراجعة',
  needs_setup: 'غير مُعدّ',
};

export const contentTypes: { value: string; label: string }[] = [
  { value: 'post', label: 'منشور' },
  { value: 'reel', label: 'ريل' },
  { value: 'video', label: 'فيديو' },
  { value: 'story', label: 'ستوري' },
  { value: 'spotlight', label: 'سبوت لايت' },
];

export const contentTypeLabel = (value: string) =>
  contentTypes.find((type) => type.value === value.toLowerCase())?.label ?? value;

export interface ConnectorGuide {
  reads: string;
  steps: string[];
  env: string[];
}

export const connectorGuide: Record<Platform, ConnectorGuide> = {
  facebook: {
    reads: 'منشورات الصفحات ونصها وروابطها وتاريخها، والإعجابات والتعليقات والمشاركات عند توفر الصلاحية.',
    steps: [
      'توكن Meta يملك صلاحية قراءة الصفحات (pages_read_engagement).',
      'صلاحية read_insights لعرض الوصول والـinsights.',
      'اختياريًا: حدّد الصفحات المطلوبة في META_PAGE_IDS.',
    ],
    env: ['META_ACCESS_TOKEN', 'META_PAGE_IDS', 'META_API_VERSION'],
  },
  instagram: {
    reads: 'منشورات الحساب مع الإعجابات والتعليقات والوصول والحفظ والمشاهدات.',
    steps: [
      'حساب Instagram Professional مربوط بصفحة Facebook.',
      'صلاحيتا instagram_basic و instagram_manage_insights على توكن Meta نفسه.',
    ],
    env: ['META_ACCESS_TOKEN'],
  },
  tiktok: {
    reads: 'فيديوهات الحساب مع المشاهدات والإعجابات والتعليقات والمشاركات.',
    steps: [
      'OAuth user token من TikTok Display API بصلاحية video.list.',
      'توكن Marketing Ads لا يصلح لهذا الغرض.',
      'refresh token وبيانات التطبيق لتجديد التوكن تلقائيًا.',
    ],
    env: ['TIKTOK_DISPLAY_ACCESS_TOKEN', 'TIKTOK_DISPLAY_REFRESH_TOKEN', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  },
  snapchat: {
    reads: 'القصص والـSpotlight مع المشاهدات والوصول والمفضلة والمشاركات.',
    steps: [
      'توكن Public Profile API بصلاحية snapchat-profile-api (قد يتطلب allowlisting).',
      'معرّف الـPublic Profile.',
      'refresh token وبيانات OAuth للتجديد.',
    ],
    env: ['SNAP_PROFILE_ACCESS_TOKEN', 'SNAP_PROFILE_REFRESH_TOKEN', 'SNAP_PROFILE_ID', 'SNAP_CLIENT_ID', 'SNAP_CLIENT_SECRET'],
  },
  website: {
    reads: 'مشاهدات الموقع اليومية وأداء كل صفحة خلال آخر 90 يومًا من Google Analytics 4.',
    steps: [
      'معرّف GA4 property.',
      'OAuth refresh token بصلاحية analytics.readonly (صلاحيات Google Ads لا تكفي).',
    ],
    env: ['GA4_PROPERTY_ID', 'GOOGLE_ANALYTICS_CLIENT_ID', 'GOOGLE_ANALYTICS_CLIENT_SECRET', 'GOOGLE_ANALYTICS_REFRESH_TOKEN'],
  },
};
