/** What /api/radar returns, and the Arabic/English names of the radar's labels. */
import type { Text } from '../../domain/shared';

export type RadarPlatform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok';
export const RADAR_PLATFORMS: RadarPlatform[] = ['facebook', 'instagram', 'linkedin', 'tiktok'];
export type Level = 'breakout' | 'high' | 'normal' | 'low';

export interface PostAnalysis {
  purpose: keyof typeof PURPOSE;
  category: keyof typeof CATEGORY;
  idea: string;
  hook: string;
  cta: string;
  dialect: keyof typeof DIALECT;
  hasPrice: boolean;
  design: string;
  why: string;
  lesson: string;
  lessonKind: keyof typeof LESSON;
  model: string;
}

export interface RadarPost {
  id: string;
  platform: RadarPlatform;
  competitorId: string;
  author: string;
  authorType: 'page' | 'person';
  url: string;
  postedAt: string;
  text: string;
  format: string;
  picture: string | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  interactions: number | null;
  groupMedian: number | null;
  level: Level | null;
  analysis: PostAnalysis | null;
}

export interface AccountSummary {
  competitorId: string; platform: RadarPlatform; posts: number; perWeek: number; medianInteractions: number | null; medianViews: number | null;
  best: { id: string; interactions: number } | null; salesShare: number | null; followers: number | null; followersChange: number | null; lastPostAt: string | null;
}
export interface MixRow { key: string; posts: number; medianInteractions: number | null; medianPer1k: number | null }
export interface BriefIdea { title: string; idea: string; platform: RadarPlatform; format: string; why: string; evidence: string[]; course: string; suggestedDate: string }
export interface Brief {
  date: string; headline: string; insights: { text: string; evidence: string[] }[];
  alerts: { kind: 'breakout' | 'webinar' | 'silent' | 'odoo'; text: string; postId?: string }[];
  ideas: BriefIdea[]; webinars: { id: string; title: string; startsAt: string; registrationUrl?: string }[]; odooStatus: string; model: string | null;
}
export interface Agenda {
  status: 'connected' | 'needs_setup' | 'error';
  lectures: { id: string; title: string; course: string; startsAt: string; endsAt: string; hours: number | null }[];
  events: { id: string; title: string; startsAt: string; endsAt: string; type: string; webinar: boolean; registrationUrl?: string }[];
}
export interface RadarRun { id: string; kind: string; status: 'running' | 'done' | 'failed' | 'partial'; startedAt: string; finishedAt: string; message: string; apifyUsd: number; postsNew: number; postsUpdated: number }

export interface RadarData {
  configured: boolean;
  budgetUsd: number;
  spentUsd: number;
  running: boolean;
  runs: RadarRun[];
  competitors: { id: string; name: string; nameAr: string; accounts: Record<RadarPlatform, string> }[];
  agenda: Agenda;
  brief: { date: string; createdAt: string; brief: Brief } | null;
  metrics: { windowDays: number; accounts: AccountSummary[]; byPurpose: MixRow[]; byCategory: MixRow[]; byFormat: MixRow[]; ours: { platform: RadarPlatform; posts: number; perWeek: number; medianInteractions: number | null }[] };
  posts: RadarPost[];
}

export const PURPOSE = {
  engagement: { en: 'Engagement', ar: 'تفاعل' }, sales: { en: 'Sales', ar: 'بيع' }, lead_gen: { en: 'Leads', ar: 'جمع عملاء' },
  trust: { en: 'Trust', ar: 'ثقة' }, awareness: { en: 'Awareness', ar: 'تعريف' }, recruitment: { en: 'Hiring', ar: 'توظيف' },
} satisfies Record<string, Text>;
export const CATEGORY = {
  offer: { en: 'Offer', ar: 'عرض وخصم' }, course_promo: { en: 'Course promo', ar: 'ترويج كورس' }, educational: { en: 'Educational', ar: 'تعليمي' },
  proof: { en: 'Proof', ar: 'إثبات ونجاح' }, people: { en: 'People', ar: 'ناس وفريق' }, event_webinar: { en: 'Event / webinar', ar: 'فعالية وويبنار' },
  saudi_market: { en: 'Saudi market', ar: 'السوق السعودي' }, occasion: { en: 'Occasion', ar: 'مناسبة' }, partnership: { en: 'Partnership', ar: 'شراكة' },
  hiring: { en: 'Hiring', ar: 'توظيف' }, other: { en: 'Other', ar: 'أخرى' },
} satisfies Record<string, Text>;
export const FORMAT: Record<string, Text> = {
  image: { en: 'Image', ar: 'صورة' }, carousel: { en: 'Several images', ar: 'صور متعددة' }, video: { en: 'Video', ar: 'فيديو' }, reel: { en: 'Short video', ar: 'فيديو قصير' },
  document: { en: 'Document', ar: 'ملف' }, article: { en: 'Article', ar: 'مقال' }, text: { en: 'Text', ar: 'نص' }, slideshow: { en: 'Photo slides', ar: 'عرض صور' }, live: { en: 'Live', ar: 'بث مباشر' },
};
export const LEVEL: Record<Level, Text> = {
  breakout: { en: 'Excellent', ar: 'ممتاز' }, high: { en: 'Above usual', ar: 'فوق المعتاد' }, normal: { en: 'Usual', ar: 'عادي' }, low: { en: 'Weak', ar: 'ضعيف' },
};
export const LEVEL_TONE: Record<Level, 'success' | 'brand' | 'neutral' | 'danger'> = { breakout: 'success', high: 'brand', normal: 'neutral', low: 'danger' };
export const LESSON = { copy: { en: 'Do the same', ar: 'نعمل زيّها' }, avoid: { en: 'Avoid', ar: 'نتجنبها' }, adapt: { en: 'Take the idea', ar: 'ناخد الفكرة' } } satisfies Record<string, Text>;
export const DIALECT = { saudi: { en: 'Saudi', ar: 'سعودي' }, egyptian: { en: 'Egyptian', ar: 'مصري' }, msa: { en: 'MSA', ar: 'فصحى' }, english: { en: 'English', ar: 'إنجليزي' }, mixed: { en: 'Mixed', ar: 'مختلط' } } satisfies Record<string, Text>;
export const PLATFORM_NAME: Record<RadarPlatform, Text> = {
  facebook: { en: 'Facebook', ar: 'فيسبوك' }, instagram: { en: 'Instagram', ar: 'إنستجرام' }, linkedin: { en: 'LinkedIn', ar: 'لينكدإن' }, tiktok: { en: 'TikTok', ar: 'تيك توك' },
};
const LEVEL_RANK: Record<Level, number> = { breakout: 3, high: 2, normal: 1, low: 0 };
export const byStrength = (a: RadarPost, b: RadarPost) =>
  LEVEL_RANK[b.level ?? 'low'] - LEVEL_RANK[a.level ?? 'low'] || (b.interactions ?? -1) - (a.interactions ?? -1);
