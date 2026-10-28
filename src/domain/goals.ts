import type { Text } from './shared';

/**
 * Why a post exists. Every post and every plan row carries one goal, and after publishing it is judged by
 * that goal's number only: a reach post by how many people saw it, an engagement post by how many reacted.
 */
export type Goal = 'reach' | 'engagement' | 'leads' | 'traffic';
export const GOALS: Goal[] = ['reach', 'engagement', 'leads', 'traffic'];
export const isGoal = (value: unknown): value is Goal => GOALS.includes(value as Goal);

export const GOAL_INFO: Record<Goal, { label: Text; hint: Text; metric: Text }> = {
  reach: { label: { en: 'Reach', ar: 'وصول' }, hint: { en: 'Be seen by as many people as possible.', ar: 'أن يراه أكبر عدد من الناس.' }, metric: { en: 'People reached', ar: 'عدد الوصول' } },
  engagement: { label: { en: 'Engagement', ar: 'تفاعل' }, hint: { en: 'Get likes, comments, shares and saves.', ar: 'إعجابات وتعليقات ومشاركات وحفظ.' }, metric: { en: 'Interactions', ar: 'التفاعلات' } },
  leads: { label: { en: 'Registrations', ar: 'تسجيلات' }, hint: { en: 'Bring sign-ups and enquiries for a course.', ar: 'تسجيلات واستفسارات على دورة.' }, metric: { en: 'Clicks', ar: 'النقرات' } },
  traffic: { label: { en: 'Website visits', ar: 'زيارات للموقع' }, hint: { en: 'Send people to the website.', ar: 'توجيه الناس إلى الموقع.' }, metric: { en: 'Link clicks', ar: 'نقرات الرابط' } },
};

/** The words people type in a spreadsheet's goal column, Arabic or English. */
export function goalFromText(text: string): Goal | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  if (isGoal(value)) return value;
  if (/وصول|انتشار|مشاهد|وعي|awareness|views?/.test(value)) return 'reach';
  if (/تفاعل|interact/.test(value)) return 'engagement';
  if (/تسجيل|عملاء|استفسار|مبيعات|lead|sign.?up|registr|sales/.test(value)) return 'leads';
  if (/زيار|موقع|رابط|traffic|click|website/.test(value)) return 'traffic';
  return null;
}

type Metrics = Record<string, number | null | undefined>;
/** The number a published post is judged by; null when the platform does not report it (never zero). */
export function goalResult(goal: Goal, metrics: Metrics): number | null {
  const sum = (keys: string[]) => (keys.some((key) => metrics[key] != null) ? keys.reduce((total, key) => total + (metrics[key] ?? 0), 0) : null);
  if (goal === 'reach') return metrics.reach ?? metrics.views ?? metrics.impressions ?? null;
  if (goal === 'engagement') return metrics.engagement ?? sum(['likes', 'comments', 'shares', 'saves']);
  return metrics.clicks ?? null;
}
