import { POST_TEMPLATES, type PostSizeId } from '../post-design/templates';
import { buildPlatformVariants, type CreativePlatform, type PlatformVariant } from './platforms';
import { localDirections, type CreativeDirection } from './design-plan';
import { retrieveVisualReferences } from './visual-references';

export type Objective = 'course_launch' | 'course_schedule' | 'certificate' | 'education' | 'event' | 'general';
export interface CreativeReference { name: string; mime: string; size: number; dataUrl?: string }
export interface CreativeBrief {
  id: string;
  prompt: string;
  objective: Objective;
  platform: string;
  platforms: CreativePlatform[];
  variants: PlatformVariant[];
  sizeId: PostSizeId;
  language: 'ar' | 'en';
  templateId: string;
  headline: string;
  supportingCopy: string;
  captions: Partial<Record<CreativePlatform, string>>;
  cta: string;
  visualDirection: string;
  directions: CreativeDirection[];
  visualReferenceIds: string[];
  selectedDirectionId?: string;
  references: CreativeReference[];
  verifiedEvent?: { id: string; title: string; startsAt: string; source: string; location?: string; registrationUrl?: string };
  source: 'local_draft' | 'ai';
  createdAt: string;
}

export const BRIEF_SESSION_KEY = 'engosoft-creative-brief';

export function classifyObjective(prompt: string): Objective {
  const text = prompt.toLowerCase();
  if (/جدول|مواعيد|schedule|calendar/.test(text)) return 'course_schedule';
  if (/شهادة|نجاح|خريج|certificate|achievement/.test(text)) return 'certificate';
  if (/ويبينار|فعالية|حدث|event|webinar/.test(text)) return 'event';
  if (/نصيحة|معلومة|شرح|tip|guide|educat/.test(text)) return 'education';
  if (/كورس|دورة|برنامج|course|launch|training/.test(text)) return 'course_launch';
  return 'general';
}

export function chooseTemplate(objective: Objective): string {
  const preferred: Record<Objective, string> = {
    course_launch: 'course-launch', course_schedule: 'monthly-calendar', certificate: 'certification',
    education: 'educational-carousel', event: 'event-reminder', general: 'career-question',
  };
  return POST_TEMPLATES.some((entry) => entry.id === preferred[objective]) ? preferred[objective] : POST_TEMPLATES[0].id;
}

/** Local structured draft. A server AI planner may replace fields while keeping this contract. */
export function createLocalBrief(input: { prompt: string; objective?: Objective; platforms: CreativePlatform[]; templateId?: string; references?: CreativeReference[] }): CreativeBrief {
  const prompt = input.prompt.trim();
  const objective = input.objective ?? classifyObjective(prompt);
  const language: CreativeBrief['language'] = /[\u0600-\u06ff]/.test(prompt) ? 'ar' : 'en';
  const headline = prompt.replace(/^(اعمل|أنشئ|صمّم|صمم|create|make|design)\s+(لي\s+)?(بوست|تصميم|post|design)\s*(عن|لـ|for|about)?\s*/i, '').trim();
  const cta = objective === 'certificate' ? (language === 'ar' ? 'هنّئ الخريج' : 'Celebrate success') : objective === 'education' ? (language === 'ar' ? 'اكتشف المزيد' : 'Learn more') : (language === 'ar' ? 'سجّل الآن' : 'Register now');
  const platform = input.platforms[0] ?? 'instagram';
  const template = input.templateId || chooseTemplate(objective);
  const variants = buildPlatformVariants(input.platforms, { headline: headline.slice(0, 130) || prompt.slice(0, 130), supportingCopy: '', templateId: template });
  const sizeId: PostSizeId = variants[0]?.sizeId ?? 'portrait';
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `brief-${Date.now()}`, prompt, objective, platform, platforms: input.platforms, variants, sizeId, language,
    templateId: template, headline: headline.slice(0, 130) || prompt.slice(0, 130),
    supportingCopy: '', captions: Object.fromEntries(input.platforms.map((p) => [p, ''])), cta, visualDirection: 'Use one clear focal image and leave room for editable typography.',
    directions: localDirections(prompt, objective), visualReferenceIds: retrieveVisualReferences(prompt, objective).map((item) => item.id),
    references: input.references ?? [], source: 'local_draft', createdAt: new Date().toISOString(),
  };
}

export function saveBrief(brief: CreativeBrief): void { sessionStorage.setItem(BRIEF_SESSION_KEY, JSON.stringify(brief)); }
export function readBrief(): CreativeBrief | null {
  try { const raw = sessionStorage.getItem(BRIEF_SESSION_KEY); return raw ? JSON.parse(raw) as CreativeBrief : null; }
  catch { return null; }
}
