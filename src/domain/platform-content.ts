/**
 * What a good caption looks like on each platform, as data. The same rules drive the editor (counters, checks,
 * the "see more" preview), the free local adapter and the AI prompt, so what the screen warns about is exactly
 * what the writer was asked to avoid.
 */
import type { Channel } from './shared';

export interface PlatformSpec {
  channel: Channel;
  /** Hard limit of the platform's caption field. */
  limit: number;
  /** Recommended length: shorter than min reads thin, longer than max loses people. */
  ideal: { min: number; max: number };
  /** Characters visible before the platform folds the caption behind "see more". */
  fold: number | null;
  hashtags: { min: number; max: number };
  /** Links in the caption can be tapped. */
  links: 'clickable' | 'inert';
  /** One-line structure for the writer, in both languages. */
  structure: { en: string; ar: string };
  /** The same rules in English for the AI prompt. */
  prompt: string;
}

export const PLATFORM_SPECS: Record<Channel, PlatformSpec> = {
  instagram: {
    channel: 'instagram', limit: 2200, ideal: { min: 80, max: 400 }, fold: 125, hashtags: { min: 3, max: 5 }, links: 'inert',
    structure: { en: 'Hook line, 2–4 short lines with keywords, “link in bio”, 3–5 hashtags.', ar: 'سطر جاذب، ثم ٢–٤ أسطر قصيرة بكلمات مفتاحية، و«الرابط في البايو»، و٣–٥ هاشتاجات.' },
    prompt: 'Instagram: the first line (under 125 characters) is the hook, shown before "more". Then 2–4 short lines that name the course and the problem it solves in plain words (Instagram search reads captions), one call to action that invites a save or a send to a colleague when it fits, no clickable links (say "الرابط في البايو" when there is a link), 3–5 specific hashtags on the last line (Instagram caps posts at 5).',
  },
  facebook: {
    channel: 'facebook', limit: 5000, ideal: { min: 120, max: 500 }, fold: 140, hashtags: { min: 0, max: 3 }, links: 'clickable',
    structure: { en: 'Benefit first, 3–6 short lines, link, up to 3 hashtags.', ar: 'الفائدة أولًا، ثم ٣–٦ أسطر قصيرة، والرابط، وحتى ٣ هاشتاجات.' },
    prompt: 'Facebook: benefit in the first line (shown before "see more"), 3–6 short lines, one clear call to action followed by the registration link on its own line when given, at most 3 hashtags.',
  },
  linkedin: {
    channel: 'linkedin', limit: 3000, ideal: { min: 150, max: 700 }, fold: 140, hashtags: { min: 0, max: 3 }, links: 'clickable',
    structure: { en: 'Professional tone, an insight first, 3–6 short lines, up to 3 hashtags.', ar: 'نبرة مهنية، وفكرة مفيدة أولًا، ثم ٣–٦ أسطر قصيرة وحتى ٣ هاشتاجات.' },
    prompt: 'LinkedIn: professional and value-focused; open with an insight or a professional outcome (the first ~140 characters show before "see more"), 3–6 short lines separated by blank lines so it reads fast (dwell time ranks posts), topic keywords in the body, the link on its own line when given, at most 3 relevant hashtags at the end. No slang, at most one emoji.',
  },
  x: {
    channel: 'x', limit: 280, ideal: { min: 60, max: 240 }, fold: null, hashtags: { min: 0, max: 2 }, links: 'clickable',
    structure: { en: 'One sharp idea in under 280 characters, the link, up to 2 hashtags.', ar: 'فكرة واحدة واضحة في أقل من ٢٨٠ حرف، والرابط، وحتى هاشتاجين.' },
    prompt: 'X (Twitter): one sharp, self-contained post under 280 characters in total (a link counts as 23), the key fact or benefit first, the link at the end when given, at most 2 hashtags. No threads, no "link in bio".',
  },
  whatsapp: {
    channel: 'whatsapp', limit: 700, ideal: { min: 40, max: 200 }, fold: null, hashtags: { min: 0, max: 0 }, links: 'clickable',
    structure: { en: 'Two or three direct lines and the link. No hashtags.', ar: 'سطران أو ثلاثة مباشرة مع الرابط. بدون هاشتاجات.' },
    prompt: 'WhatsApp status/broadcast: 2–3 direct, friendly lines and the link on its own line when given. No hashtags.',
  },
  tiktok: {
    channel: 'tiktok', limit: 2200, ideal: { min: 20, max: 120 }, fold: 80, hashtags: { min: 3, max: 5 }, links: 'inert',
    structure: { en: 'One punchy line, 3–5 hashtags, “link in bio”.', ar: 'سطر واحد قوي، و٣–٥ هاشتاجات، و«الرابط في البايو».' },
    prompt: 'TikTok: one punchy line under 80 characters that works as the hook and names the topic in searchable words (TikTok search reads captions), then 3–5 hashtags (mix one broad and two specific). No clickable links (say "الرابط في البايو" when there is a link).',
  },
  snapchat: {
    channel: 'snapchat', limit: 160, ideal: { min: 20, max: 100 }, fold: null, hashtags: { min: 1, max: 3 }, links: 'inert',
    structure: { en: 'One short line and 1–3 hashtags, within 160 characters.', ar: 'سطر قصير و١–٣ هاشتاجات، في حدود ١٦٠ حرفًا.' },
    prompt: 'Snapchat Spotlight: ONE short line plus 1–3 hashtags, 160 characters in total at most. No links.',
  },
  youtube: {
    channel: 'youtube', limit: 5000, ideal: { min: 150, max: 800 }, fold: 150, hashtags: { min: 2, max: 5 }, links: 'clickable',
    structure: { en: 'Two keyword-rich opening lines, details, the link, 3 hashtags.', ar: 'سطران افتتاحيان بكلمات مفتاحية، ثم التفاصيل والرابط و٣ هاشتاجات.' },
    prompt: 'YouTube description: the first two lines (about 150 characters) carry the main keywords and the benefit, then 2–4 short lines of detail, the link on its own line when given, 3 hashtags at the end.',
  },
  website: {
    channel: 'website', limit: 1200, ideal: { min: 150, max: 450 }, fold: null, hashtags: { min: 0, max: 0 }, links: 'clickable',
    structure: { en: 'A 2–4 sentence news-style paragraph. No hashtags.', ar: 'فقرة من ٢–٤ جمل بأسلوب خبري. بدون هاشتاجات.' },
    prompt: 'Website: one news-style paragraph of 2–4 complete sentences, factual and keyword-aware, the link at the end when given. No hashtags, no emojis.',
  },
};

export const specOf = (channel: Channel) => PLATFORM_SPECS[channel];

/* ── Reading a caption ─────────────────────────────────────────────── */

const URL_RE = /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/gi;
const EMOJI = /\p{Extended_Pictographic}/gu;
/** Words that ask the reader to do something, in Arabic and English. */
const CTA = /(سجّ?ل|سجل|احجز|اشترك|انضم|تواصل|ابدأ|اعرف|اكتشف|تعرّ?ف|حمّل|اطلب|register|book|join|enroll|sign up|learn more|contact|apply|start)/i;

export const hashtagsOf = (text: string) => [...text.matchAll(/#[\p{L}\p{N}_]{2,}/gu)].map((m) => m[0]);
export const linksOf = (text: string) => text.match(URL_RE) ?? [];

export type IssueLevel = 'error' | 'warn' | 'tip';
export interface CaptionIssue { id: string; level: IssueLevel; text: { en: string; ar: string } }
export interface CaptionReport {
  length: number;
  hashtags: number;
  links: string[];
  /** empty | thin | ok | long | over */
  size: 'empty' | 'thin' | 'ok' | 'long' | 'over';
  /** error if any hard problem, warn for fixable ones, ok when only tips remain, empty when blank. */
  state: 'empty' | 'error' | 'warn' | 'ok';
  issues: CaptionIssue[];
  /** The part shown before "see more" and the rest, when the platform folds. */
  fold: { visible: string; hidden: string } | null;
}

/** Length as the platforms count it: characters, with a link counted in full. */
const count = (text: string) => [...text].length;

export function analyzeCaption(channel: Channel, text: string): CaptionReport {
  const spec = PLATFORM_SPECS[channel];
  const body = text.trim();
  const length = count(body);
  const tags = hashtagsOf(body).length;
  const links = linksOf(body);
  if (!body) return { length: 0, hashtags: 0, links: [], size: 'empty', state: 'empty', issues: [{ id: 'empty', level: 'tip', text: { en: 'No caption yet.', ar: 'لا يوجد نص بعد.' } }], fold: null };

  const issues: CaptionIssue[] = [];
  const add = (id: string, level: IssueLevel, en: string, ar: string) => issues.push({ id, level, text: { en, ar } });
  let size: CaptionReport['size'] = 'ok';
  if (length > spec.limit) { size = 'over'; add('over', 'error', `${length - spec.limit} characters over the platform limit (${spec.limit}).`, `زائد ${length - spec.limit} حرفًا عن حد المنصة (${spec.limit}).`); }
  else if (length > spec.ideal.max) { size = 'long'; add('long', 'warn', `Longer than the ${spec.ideal.max} characters that work best here.`, `أطول من ${spec.ideal.max} حرف، وهو الأنسب لهذه المنصة.`); }
  else if (length < spec.ideal.min) { size = 'thin'; add('thin', 'tip', `Short: ${spec.ideal.min}+ characters usually reads more complete.`, `قصير: ${spec.ideal.min} حرفًا فأكثر يبدو أكثر اكتمالًا.`); }

  if (spec.hashtags.max === 0 && tags > 0) add('hashtags-none', 'warn', 'Hashtags are not used on this platform.', 'الهاشتاجات لا تُستخدم في هذه المنصة.');
  else if (tags > spec.hashtags.max) add('hashtags-many', 'warn', `${tags} hashtags; ${spec.hashtags.max} at most works best.`, `${tags} هاشتاج؛ الأفضل ${spec.hashtags.max} كحد أقصى.`);
  else if (tags < spec.hashtags.min) add('hashtags-few', 'tip', `Add ${spec.hashtags.min - tags} more hashtag(s) (${spec.hashtags.min}–${spec.hashtags.max}).`, `أضف ${spec.hashtags.min - tags} هاشتاج (${spec.hashtags.min}–${spec.hashtags.max}).`);

  if (spec.links === 'inert' && links.length) add('link-inert', 'warn', 'Links cannot be tapped in captions here. Say “link in bio” instead.', 'الروابط لا تُفتح من النص هنا. اكتب «الرابط في البايو» بدلًا منها.');
  if (spec.links === 'clickable' && channel !== 'website' && channel !== 'whatsapp' && !links.length && CTA.test(body) && /(تسجيل|سجّ?ل|register|book|احجز)/i.test(body)) add('link-missing', 'tip', 'It asks people to register but has no link.', 'النص يطلب التسجيل لكن بدون رابط.');

  const firstLine = body.split('\n')[0].trim();
  if (spec.fold && count(firstLine) > spec.fold && count(body) > spec.fold) add('hook-long', 'tip', `The first line runs past ${spec.fold} characters, so the hook is cut before “see more”.`, `السطر الأول يتجاوز ${spec.fold} حرفًا، فيُقطع الهوك قبل «عرض المزيد».`);
  if (!CTA.test(body) && spec.ideal.max > 60) add('cta', 'tip', 'No clear call to action (register, book, learn more…).', 'لا توجد دعوة واضحة لإجراء (سجّل، احجز، اعرف المزيد…).');
  if ((body.match(EMOJI) ?? []).length > 3) add('emoji', 'tip', 'Many emojis; two or three keep it professional.', 'إيموجي كثيرة؛ اثنتان أو ثلاث تحافظ على الاحترافية.');

  const level = issues.some((i) => i.level === 'error') ? 'error' : issues.some((i) => i.level === 'warn') ? 'warn' : 'ok';
  const fold = spec.fold && length > spec.fold ? { visible: [...body].slice(0, spec.fold).join('').replace(/\s+\S*$/, ''), hidden: '' } : null;
  if (fold) fold.hidden = body.slice(fold.visible.length).trimStart();
  return { length, hashtags: tags, links, size, state: level, issues, fold };
}

/** Several platforms carrying the very same caption is the usual sign nobody adapted it. */
export function duplicatedChannels(captions: Partial<Record<Channel, string>>, channels: Channel[]): Channel[] {
  const seen = new Map<string, Channel[]>();
  for (const channel of channels) {
    const text = (captions[channel] ?? '').trim();
    if (text.length < 20) continue;
    seen.set(text, [...(seen.get(text) ?? []), channel]);
  }
  return [...seen.values()].filter((group) => group.length > 1).flat();
}

/* ── Free local adapter ────────────────────────────────────────────── */

export interface CaptionSource {
  title: string;
  /** Learning goals or the main points, most important first. */
  points?: string[];
  audience?: string;
  /** A date line such as "تبدأ 12 نوفمبر"; only when it is verified. */
  when?: string;
  link?: string;
  cta?: string;
  /** Extra hashtag words (category, course topic). */
  topics?: string[];
}

const tagWord = (word: string) => word.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
/** Hashtags from the brand and the topic words: Latin product names stay as they are, Arabic phrases join with "_". */
export function hashtagsFor(source: CaptionSource, max: number): string[] {
  if (max <= 0) return [];
  const words = [...(source.title.match(/[A-Za-z][A-Za-z0-9+.-]{1,}/g) ?? [])].filter((w) => !/^(course|event|pro|training|advanced|basic|fundamentals?|the|and|for)$/i.test(w));
  const topics = (source.topics ?? []).map(tagWord).filter((t) => t.length > 2);
  const picks = ['Engosoft', ...words.slice(0, 2), ...topics.slice(0, 2), 'إنجوسوفت', 'تدريب_هندسي'];
  return [...new Set(picks.map((p) => `#${tagWord(p)}`))].filter((t) => t.length > 3).slice(0, max);
}

const clip = (text: string, max: number) => {
  const chars = [...text.trim()];
  if (chars.length <= max) return text.trim();
  return `${chars.slice(0, max - 1).join('').replace(/[\s,.،:;-]+\S*$/, '').trim()}…`;
};

/**
 * A caption shaped for one platform from the verified facts, with no AI. It is a sound starting point (hook,
 * the right amount of detail, the call to action, link handling, hashtags) that people refine or replace.
 */
export function composeCaption(channel: Channel, source: CaptionSource): string {
  const spec = PLATFORM_SPECS[channel];
  const title = source.title.trim();
  const cta = source.cta?.trim() || 'سجّل الآن';
  const points = (source.points ?? []).map((p) => p.trim()).filter(Boolean);
  const tags = hashtagsFor(source, Math.min(spec.hashtags.max, channel === 'instagram' ? 8 : spec.hashtags.max === 0 ? 0 : Math.max(spec.hashtags.min, 3))).join(' ');
  const linkLine = source.link ? (spec.links === 'clickable' ? source.link : 'الرابط في البايو') : '';
  const callTo = linkLine && spec.links === 'clickable' ? `${cta}: ${linkLine}` : linkLine ? `${cta} — ${linkLine}` : cta;
  const lines: string[] = [];
  switch (channel) {
    case 'snapchat':
    case 'tiktok': {
      const hook = [title, source.when].filter(Boolean).join(' · ');
      lines.push(clip(hook, channel === 'tiktok' ? 80 : 90), tags);
      if (channel === 'tiktok' && linkLine) lines.splice(1, 0, linkLine);
      break;
    }
    case 'x':
      lines.push([title, source.when].filter(Boolean).join(' — '), ...(points[0] ? [clip(points[0], 100)] : []), callTo, tags);
      break;
    case 'whatsapp':
      lines.push(title, ...(source.when ? [source.when] : []), ...(points[0] ? [clip(points[0], 110)] : []), callTo);
      break;
    case 'website':
      lines.push([`تعلن إنجوسوفت عن ${title}`, source.audience ? `وهي موجهة إلى ${source.audience.replace(/[.،]$/, '')}` : '', points[0] ? `وتركز على ${points[0].replace(/[.،]$/, '')}` : '', source.when ?? ''].filter(Boolean).join(' ') + '.', ...(source.link ? [`للتفاصيل: ${source.link}`] : []));
      break;
    case 'linkedin':
      lines.push(`${title}: خطوة عملية لتطوير مهاراتك المهنية.`, [...(source.audience ? [`مناسبة لـ ${source.audience.replace(/[.،]$/, '')}.`] : []), ...(source.when ? [source.when] : [])].join(' '), ...points.slice(0, 3).map((p) => `• ${clip(p, 120)}`), callTo, tags);
      break;
    case 'youtube':
      lines.push(`${title} — ${points[0] ? clip(points[0], 90) : 'تعلّم عملي مع إنجوسوفت'}`, source.when ?? '', ...points.slice(0, 4).map((p) => `• ${clip(p, 140)}`), callTo, tags);
      break;
    case 'instagram':
      lines.push(title, [...(source.when ? [source.when] : []), ...(points[0] ? [clip(points[0], 90)] : [])].join(' · '), ...points.slice(1, 3).map((p) => `• ${clip(p, 90)}`), callTo, tags);
      break;
    default: // facebook
      lines.push(`${title}${source.when ? ` — ${source.when}` : ''}`, ...(source.audience ? [`مناسبة لـ ${source.audience.replace(/[.،]$/, '')}.`] : []), ...points.slice(0, 3).map((p) => `• ${clip(p, 120)}`), callTo, tags);
  }
  const out = lines.map((line) => line.trim()).filter(Boolean);
  const joined = channel === 'linkedin' || channel === 'website' ? out.join('\n\n') : out.join('\n');
  return clip(joined, spec.limit);
}

/** The same message on another platform: keeps the first idea, drops what the platform ignores, fits the length. */
export function adaptCaption(text: string, channel: Channel, extra: { link?: string } = {}): string {
  const spec = PLATFORM_SPECS[channel];
  const tags = hashtagsOf(text);
  const link = extra.link ?? linksOf(text)[0];
  const body = text.replace(URL_RE, '').replace(/#[\p{L}\p{N}_]{2,}/gu, '').replace(/(الرابط في البايو|رابط التسجيل|link in bio)\s*[:：-]?/gi, '')
    .split('\n').map((line) => line.replace(/\s+$/g, '')).filter((line, i, all) => line.trim() || (all[i - 1]?.trim() && all.slice(i + 1).some((l) => l.trim()))).join('\n').trim();
  const lines = body.split('\n').filter((l) => l.trim());
  const keep = channel === 'tiktok' || channel === 'snapchat' ? 1 : channel === 'whatsapp' ? 3 : channel === 'website' ? 4 : channel === 'instagram' ? 5 : 6;
  let main = lines.slice(0, keep).join(channel === 'linkedin' || channel === 'website' ? '\n\n' : '\n');
  if (channel === 'website') main = lines.join(' ').replace(/•\s*/g, '');
  const chosenTags = spec.hashtags.max === 0 ? [] : (tags.length ? tags : []).slice(0, spec.hashtags.max);
  const tail: string[] = [];
  if (link) tail.push(spec.links === 'clickable' ? link : 'الرابط في البايو');
  if (chosenTags.length) tail.push(chosenTags.join(' '));
  const reserved = tail.join('\n').length + 2;
  const fitted = clip(main, Math.max(20, Math.min(spec.limit, spec.ideal.max) - reserved));
  return [fitted, ...tail].filter(Boolean).join(channel === 'linkedin' ? '\n\n' : '\n');
}

/** Digits in `text` that none of `sources` contain: a date, price or number the writer made up. Arabic digits count. */
export function unverifiedNumbers(text: string, sources: string[]): string[] {
  const latin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const known = new Set(sources.flatMap((s) => latin(s).match(/\d+/g) ?? []));
  return [...new Set((latin(text).match(/\d+/g) ?? []).filter((n) => !known.has(n)))];
}
