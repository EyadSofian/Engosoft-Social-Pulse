/**
 * The voice and the content kit of a post, shared by the copilot panel and the server. Human-readable rules:
 * .claude/skills/engosoft-arabic-voice and engosoft-content-strategist — change them together.
 */
import { DateTime } from 'luxon';
import type { Channel } from './shared';

export const DIALECTS = ['saudi', 'msa', 'egyptian', 'english'] as const;
export type Dialect = (typeof DIALECTS)[number];
export const TONES = ['expert', 'friendly', 'energetic', 'formal'] as const;
export type Tone = (typeof TONES)[number];
export const GOALS = ['register', 'awareness', 'engagement', 'authority'] as const;
export type Goal = (typeof GOALS)[number];
/** The parts of a post's kit, each written on demand. */
export const KIT_PARTS = ['ideas', 'script', 'carousel'] as const;
export type KitPart = (typeof KIT_PARTS)[number];
export const SCRIPT_FORMATS = ['reel', 'tiktok', 'snapchat', 'short'] as const;
export type ScriptFormat = (typeof SCRIPT_FORMATS)[number];

type Label = { en: string; ar: string };

export const DIALECT_INFO: Record<Dialect, Label & { hint: Label; sample: string }> = {
  saudi: { en: 'Saudi', ar: 'سعودي', hint: { en: 'White Saudi dialect: Reels, TikTok, Snapchat for KSA', ar: 'لهجة سعودية بيضاء: ريلز وتيك توك وسناب للسعودية' }, sample: 'ودّك تتقن Revit MEP؟ سجّل الحين' },
  msa: { en: 'Standard Arabic', ar: 'فصحى', hint: { en: 'Modern Standard Arabic: LinkedIn, website, announcements', ar: 'فصحى معاصرة: لينكدإن والموقع والإعلانات الرسمية' }, sample: 'أتقِن Revit MEP مع برنامج تطبيقي' },
  egyptian: { en: 'Egyptian', ar: 'مصري', hint: { en: 'Light Egyptian: posts aimed at Egypt', ar: 'مصري خفيف: منشورات موجهة لمصر' }, sample: 'عايز تتقن Revit MEP؟ سجّل دلوقتي' },
  english: { en: 'English', ar: 'إنجليزي', hint: { en: 'Professional English', ar: 'إنجليزية مهنية' }, sample: 'Master Revit MEP, hands-on' },
};

export const TONE_INFO: Record<Tone, Label> = {
  expert: { en: 'Expert', ar: 'خبير' },
  friendly: { en: 'Friendly', ar: 'ودود' },
  energetic: { en: 'Energetic', ar: 'حماسي' },
  formal: { en: 'Formal', ar: 'رسمي' },
};

export const GOAL_INFO: Record<Goal, Label> = {
  register: { en: 'Registrations', ar: 'تسجيلات' },
  awareness: { en: 'Awareness', ar: 'انتشار' },
  engagement: { en: 'Engagement', ar: 'تفاعل' },
  authority: { en: 'Authority', ar: 'مصداقية وخبرة' },
};

export const SCRIPT_INFO: Record<ScriptFormat, Label & { seconds: number }> = {
  reel: { en: 'Instagram Reel', ar: 'ريلز إنستجرام', seconds: 30 },
  tiktok: { en: 'TikTok', ar: 'تيك توك', seconds: 30 },
  snapchat: { en: 'Snapchat', ar: 'سناب شات', seconds: 15 },
  short: { en: 'YouTube Short', ar: 'يوتيوب شورتس', seconds: 45 },
};

/** The register that usually fits a platform for a Saudi-facing post. */
export const suggestedDialect = (channel: Channel): Dialect =>
  channel === 'linkedin' || channel === 'website' || channel === 'youtube' ? 'msa' : 'saudi';

export const HOOK_FORMULAS = ['outcome', 'pain', 'identity', 'question', 'contrast', 'mistake', 'number', 'curiosity', 'timely'] as const;
export type HookFormula = (typeof HOOK_FORMULAS)[number];
export const HOOK_FORMULA_LABEL: Record<HookFormula, Label> = {
  outcome: { en: 'Outcome', ar: 'نتيجة' }, pain: { en: 'Pain point', ar: 'مشكلة' }, identity: { en: 'Identity', ar: 'جمهور محدد' },
  question: { en: 'Question', ar: 'سؤال' }, contrast: { en: 'Before/after', ar: 'قبل وبعد' }, mistake: { en: 'Mistake', ar: 'خطأ شائع' },
  number: { en: 'Number', ar: 'رقم' }, curiosity: { en: 'Curiosity', ar: 'فضول' }, timely: { en: 'Timely', ar: 'مناسبة' },
};

export const PILLAR_LABEL: Record<string, Label> = {
  education: { en: 'Education', ar: 'تعليمي' }, promotion: { en: 'Promotion', ar: 'ترويجي' }, 'social-proof': { en: 'Social proof', ar: 'إثبات اجتماعي' },
  'behind-the-scenes': { en: 'Behind the scenes', ar: 'كواليس' }, community: { en: 'Community', ar: 'مجتمع' }, timely: { en: 'Timely', ar: 'مناسبة' },
};

export interface KitScene { t: string; visual: string; voiceover: string; onScreen: string; broll: string }
export interface KitScript { format: ScriptFormat; seconds: number; title: string; cover: string; scenes: KitScene[]; cta: string; audio: string }
export interface KitTrend { title: string; why: string; howToUse: string; fit: number; risk: string; platforms: string[] }
export interface KitSource { title: string; url: string }

export interface ContentKit {
  dialect: Dialect; tone: Tone; goal: Goal;
  angle: { idea: string; audience: string; insight: string; pillar: string };
  hooks: { text: string; formula: HookFormula; spoken: string }[];
  captions: Partial<Record<Channel, string>>;
  script: KitScript;
  carousel: { title: string; body: string }[];
  stories: { frame: string; sticker: string }[];
  hashtags: { core: string[]; niche: string[]; local: string[] };
  keywords: string[];
  /** Facts-check notes: digits the writer used that the post does not contain, and similar. */
  warnings: string[];
  occasions: { day: string; name: string; idea: string }[];
  trends?: { items: KitTrend[]; sources: KitSource[]; scannedAt: string; live: boolean };
  skills: Record<string, string>;
  model: string;
  /** When the ideas were written (empty until then). */
  generatedAt: string;
  generatedBy: string;
  /** When each part was last written. */
  parts?: Partial<Record<KitPart, string>>;
}

/**
 * Starting windows for KSA audiences (Asia/Riyadh, 24h). Public benchmarks agree on a late-evening peak; the
 * account's own insights should replace these once there is data.
 */
export const POSTING_WINDOWS: Record<Channel, { primary: [number, number]; secondary: [number, number]; days?: Label }> = {
  instagram: { primary: [21, 23], secondary: [12, 14] },
  tiktok: { primary: [21, 24], secondary: [16, 18] },
  snapchat: { primary: [20, 23], secondary: [13, 15] },
  linkedin: { primary: [8, 10], secondary: [12, 13], days: { en: 'Sun–Wed', ar: 'الأحد–الأربعاء' } },
  x: { primary: [20, 23], secondary: [12, 14] },
  facebook: { primary: [20, 22], secondary: [13, 15] },
  youtube: { primary: [19, 22], secondary: [15, 17], days: { en: 'Thu–Fri strongest', ar: 'الخميس والجمعة أقوى' } },
  whatsapp: { primary: [19, 21], secondary: [10, 11] },
  website: { primary: [9, 11], secondary: [13, 14], days: { en: 'Sun–Thu', ar: 'الأحد–الخميس' } },
};

/**
 * The next good publishing times for a post, from its lead platform's windows in Saudi time, as local
 * `yyyy-LL-ddTHH:mm` strings in `zone` (what a datetime-local input takes). LinkedIn only gets Sun–Wed.
 */
export function suggestedSlots(channels: Channel[], zone: string, now: DateTime = DateTime.now(), count = 3): { at: string; channel: Channel }[] {
  const lead = channels.includes('instagram') ? 'instagram' : channels[0];
  if (!lead) return [];
  const windows = POSTING_WINDOWS[lead];
  const soonest = now.plus({ minutes: 30 });
  const slots: { at: string; channel: Channel; ms: number }[] = [];
  for (let day = 0; day < 8 && slots.length < count; day++) {
    for (const hour of [windows.primary[0], windows.secondary[0]].sort((a, b) => a - b)) {
      const when = now.setZone('Asia/Riyadh').startOf('day').plus({ days: day, hours: hour });
      if (when < soonest) continue;
      if (lead === 'linkedin' && ![7, 1, 2, 3].includes(when.weekday)) continue;
      slots.push({ at: when.setZone(zone).toFormat("yyyy-LL-dd'T'HH:mm"), channel: lead, ms: when.toMillis() });
    }
  }
  return slots.sort((a, b) => a.ms - b.ms).slice(0, count).map(({ at, channel }) => ({ at, channel }));
}
