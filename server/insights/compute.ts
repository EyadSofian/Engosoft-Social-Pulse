/**
 * The performance notifications, worked out in code from our own posts' numbers (no AI, so every number is real):
 * yesterday's summary, the best post, rises and drops in interactions, days without posts, weak platforms, better
 * posting times, and ideas (competitor ideas from the daily brief, and ways to vary the content types).
 *
 * Each insight has a `key` that names its day or week, so it is sent once even though this runs every few minutes.
 */
import { DateTime } from 'luxon';
import type { ObservedPost, Platform } from '../types.js';
import type { SheetSchedule } from './posting-gap.js';

export type InsightKind = 'insight_daily' | 'insight_best' | 'insight_alert' | 'insight_tip' | 'insight_idea';
export interface InsightPost { platform: Platform; title: string; permalink: string; thumbnail: string; publishedAt: string; contentType: string; interactions: number | null; reach: number | null; ratio: number | null }
export interface InsightStat { label: string; value: string; tone?: 'up' | 'down' | 'neutral' }
export interface InsightDetail { stats?: InsightStat[]; posts?: InsightPost[]; points?: string[]; action?: { label: string; to: string } }
export interface Insight { key: string; kind: InsightKind; title: string; body: string; image?: string; detail: InsightDetail }

export interface RadarIdea { title: string; idea: string; platform: string; format: string; why: string }
export interface InsightInput {
  posts: ObservedPost[];
  now: Date;
  zone: string;
  /** Plans and queued publications still due today. */
  scheduledLaterToday: number;
  /** Today's tracked publications and plans, including ones already in progress. */
  hasPostingToday?: boolean;
  sheetSchedule?: SheetSchedule;
  /** Today's (or yesterday's) competitor brief ideas, when the competitor tab has run. */
  radarIdeas?: RadarIdea[];
  radarDate?: string;
}

const DAY = 86_400_000;
export const PLATFORM_AR: Record<string, string> = { facebook: 'فيسبوك', instagram: 'إنستجرام', linkedin: 'لينكدإن', tiktok: 'تيك توك', youtube: 'يوتيوب', snapchat: 'سناب شات', website: 'الموقع', x: 'إكس' };
const TYPE_AR: Record<string, string> = { image: 'صورة', photo: 'صورة', video: 'فيديو', reel: 'ريلز', reels: 'ريلز', short: 'شورتس', shorts: 'شورتس', carousel: 'كاروسيل', post: 'بوست نصي', story: 'ستوري', spotlight: 'سبوتلايت', live: 'لايف', document: 'ملف' };
const TYPE_ALIASES: Record<string, string> = { carousel_album: 'carousel', multi_image: 'carousel', album: 'carousel', '': 'post', text: 'post', status: 'post', photo: 'image', reels: 'reel', shorts: 'short' };
const WEEKDAY_AR = ['', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
const BLOCKS = [
  { from: 6, to: 9, label: '6–9 الصبح' }, { from: 9, to: 12, label: '9–12 الضهر' }, { from: 12, to: 15, label: '12–3 العصر' },
  { from: 15, to: 18, label: '3–6 المغرب' }, { from: 18, to: 21, label: '6–9 بالليل' }, { from: 21, to: 24, label: '9–12 بالليل' }, { from: 0, to: 6, label: 'بعد نص الليل' },
];

export const platformAr = (p: string) => PLATFORM_AR[p] ?? p;
export const typeOf = (post: Pick<ObservedPost, 'contentType'>) => { const raw = post.contentType.trim().toLowerCase(); return TYPE_ALIASES[raw] ?? raw; };
export const typeAr = (type: string) => TYPE_AR[type] ?? type;

export function interactionsOf(post: ObservedPost): number | null {
  const m = post.metrics;
  if (m.engagement != null) return m.engagement;
  const parts = [m.likes, m.comments, m.shares, m.saves];
  return parts.every((v) => v == null) ? null : parts.reduce<number>((s, v) => s + (v ?? 0), 0);
}
export const reachOf = (post: ObservedPost) => post.metrics.reach ?? post.metrics.views ?? post.metrics.impressions ?? null;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 1,240 · 12.4 ألف · 1.2 مليون */
export function fmt(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)} مليون`;
  if (Math.abs(n) >= 10_000) return `${+(n / 1000).toFixed(1)} ألف`;
  return Math.round(n).toLocaleString('en-US');
}
const pct = (ratio: number) => `${Math.round(Math.abs(ratio - 1) * 100)}%`;
const times = (ratio: number) => `${ratio >= 10 ? Math.round(ratio) : +ratio.toFixed(1)}×`;
const plural = (n: number, one: string, two: string, many: string) => (n === 1 ? one : n === 2 ? two : `${n} ${many}`);
const postsWord = (n: number) => plural(n, 'بوست واحد', 'بوستين', n <= 10 ? 'بوستات' : 'بوست');
const daysWord = (n: number) => plural(n, 'يوم واحد', 'يومين', n <= 10 ? 'أيام' : 'يوم');
const shortTitle = (title: string) => { const t = title.replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 58)}…` : t || 'بوست بدون عنوان'; };

/** Week id (Sunday-based, the Saudi work week) for weekly keys. */
export const weekId = (day: DateTime) => day.minus({ days: day.weekday % 7 }).toISODate();

/**
 * Each platform's usual interactions per post: the median over posts at least two days old (young posts are still
 * collecting). A post's ratio is its interactions over that median, so 2× means double the usual on that platform.
 */
export function platformMedians(posts: ObservedPost[], now: Date): Map<string, number> {
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    const age = now.getTime() - Date.parse(p.publishedAt);
    const value = interactionsOf(p);
    if (age < 2 * DAY || age > 90 * DAY || value == null) continue;
    (groups.get(p.platform) ?? groups.set(p.platform, []).get(p.platform)!).push(value);
  }
  const out = new Map<string, number>();
  for (const [platform, values] of groups) {
    const m = median(values);
    if (values.length >= 3 && m != null && m > 0) out.set(platform, m);
  }
  return out;
}

export function toInsightPost(post: ObservedPost, medians: Map<string, number>): InsightPost {
  const value = interactionsOf(post);
  const base = medians.get(post.platform);
  return { platform: post.platform, title: shortTitle(post.title), permalink: post.permalink, thumbnail: post.thumbnail, publishedAt: post.publishedAt, contentType: typeOf(post), interactions: value, reach: reachOf(post), ratio: value != null && base ? +(value / base).toFixed(2) : null };
}

export function buildInsights(input: InsightInput): Insight[] {
  const { now, zone } = input;
  const local = DateTime.fromJSDate(now, { zone });
  const today = local.startOf('day');
  const yesterday = today.minus({ days: 1 });
  const week = weekId(today);
  const posts = input.posts.filter((p) => p.platform !== 'website' && Number.isFinite(Date.parse(p.publishedAt)));
  const medians = platformMedians(posts, now);
  const dayOf = (p: ObservedPost) => DateTime.fromISO(p.publishedAt, { zone }).startOf('day');
  const out: Insight[] = [];

  /* ── Yesterday: summary and best post (from 9 in the morning) ── */
  if (local.hour >= 9) {
    const y = posts.filter((p) => +dayOf(p) === +yesterday);
    const label = `${WEEKDAY_AR[yesterday.weekday]} ${yesterday.day}/${yesterday.month}`;
    if (!y.length) {
      const last = posts.filter((p) => Date.parse(p.publishedAt) < +yesterday).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
      const since = last ? Math.round((+today - +dayOf(last)) / DAY) : 0;
      out.push({
        key: `daily:${yesterday.toISODate()}`, kind: 'insight_daily',
        title: 'امبارح مفيش ولا بوست اتنشر',
        body: last ? `آخر بوست نزل من ${daysWord(since)} على ${platformAr(last.platform)}.${input.scheduledLaterToday ? ` فيه ${postsWord(input.scheduledLaterToday)} مجدول النهارده.` : ''}` : 'مفيش بوستات متسجلة من الحسابات المربوطة.',
        detail: { stats: [{ label, value: '0 بوست', tone: 'down' }], action: { label: 'افتح التقويم', to: '/calendar' } },
      });
    } else {
      const items = y.map((p) => toInsightPost(p, medians));
      const totalInteractions = items.reduce((s, p) => s + (p.interactions ?? 0), 0);
      const totalReach = items.reduce((s, p) => s + (p.reach ?? 0), 0);
      const platforms = [...new Set(y.map((p) => p.platform))];
      const ratios = items.map((p) => p.ratio).filter((r): r is number => r != null);
      const avg = ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : null;
      const verdict = avg == null ? '' : avg >= 1.15 ? `أعلى من المعتاد بـ ${pct(avg)}` : avg <= 0.85 ? `أقل من المعتاد بـ ${pct(avg)}` : 'قريب من المعتاد';
      out.push({
        key: `daily:${yesterday.toISODate()}`, kind: 'insight_daily',
        title: `ملخص امبارح: ${postsWord(y.length)} على ${platforms.length === 1 ? platformAr(platforms[0]) : `${platforms.length} منصات`}`,
        body: `${fmt(totalInteractions)} تفاعل و${fmt(totalReach)} وصول لحد دلوقتي${verdict ? ` — ${verdict}` : ''}.`,
        detail: {
          stats: [
            { label: 'البوستات', value: String(y.length) },
            { label: 'التفاعل', value: fmt(totalInteractions) },
            { label: 'الوصول', value: fmt(totalReach) },
            ...(avg != null ? [{ label: 'مقارنة بالمعتاد', value: avg >= 1 ? `+${pct(avg)}` : `−${pct(avg)}`, tone: (avg >= 1.15 ? 'up' : avg <= 0.85 ? 'down' : 'neutral') as InsightStat['tone'] }] : []),
          ],
          posts: [...items].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0) || (b.interactions ?? 0) - (a.interactions ?? 0)),
          points: platforms.map((platform) => {
            const own = items.filter((p) => p.platform === platform);
            return `${platformAr(platform)}: ${postsWord(own.length)} · ${fmt(own.reduce((s, p) => s + (p.interactions ?? 0), 0))} تفاعل`;
          }),
          action: { label: 'افتح التحليلات', to: '/analytics?range=7d' },
        },
      });
      const best = [...items].filter((p) => p.interactions != null).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0) || (b.interactions ?? 0) - (a.interactions ?? 0))[0];
      if (best && (y.length >= 2 || (best.ratio ?? 0) >= 1.5)) out.push(bestPostInsight(`best:${yesterday.toISODate()}`, 'أفضل بوست امبارح', best, zone));
    }
  }

  /* ── Weekly best post (posts two to nine days old, so their numbers have settled) ── */
  if (local.hour >= 9) {
    const settled = posts.filter((p) => { const age = now.getTime() - Date.parse(p.publishedAt); return age >= 2 * DAY && age < 9 * DAY; }).map((p) => toInsightPost(p, medians));
    const best = settled.filter((p) => p.ratio != null && p.interactions != null).sort((a, b) => b.ratio! - a.ratio!)[0];
    if (best && settled.length >= 4 && best.ratio! >= 1.3) out.push(bestPostInsight(`best-week:${week}`, 'أفضل بوست في الأسبوع', best, zone));
  }

  /* ── Rise or drop in interactions: the last 7 settled days against the 7 before ── */
  if (local.hour >= 9) {
    const window = (fromDays: number, toDays: number) => posts.filter((p) => { const age = now.getTime() - Date.parse(p.publishedAt); return age >= fromDays * DAY && age < toDays * DAY; });
    const recent = window(2, 9), before = window(9, 16);
    const sum = (list: ObservedPost[]) => list.reduce((s, p) => s + (interactionsOf(p) ?? 0), 0);
    const a = sum(recent), b = sum(before);
    if (recent.length >= 3 && before.length >= 3 && b > 0) {
      const ratio = a / b;
      const up = ratio >= 1.2, down = ratio <= 0.8;
      if (up || down) {
        const byPlatform = [...new Set([...recent, ...before].map((p) => p.platform))].map((platform) => {
          const r = recent.filter((p) => p.platform === platform), o = before.filter((p) => p.platform === platform);
          return { platform, now: sum(r), was: sum(o), postsNow: r.length, postsWas: o.length };
        }).sort((x, y) => (up ? (y.now - y.was) - (x.now - x.was) : (x.now - x.was) - (y.now - y.was)));
        const lead = byPlatform[0];
        const countNote = recent.length !== before.length ? ` نزلنا ${postsWord(recent.length)} مقابل ${before.length} في الأسبوع اللي قبله.` : '';
        out.push({
          key: `trend:${up ? 'up' : 'down'}:${week}`, kind: 'insight_alert',
          title: up ? `التفاعل زاد ${pct(ratio)} الأسبوع ده` : `التفاعل قلّ ${pct(ratio)} الأسبوع ده`,
          body: `${fmt(a)} تفاعل مقابل ${fmt(b)} في الأسبوع اللي قبله.${lead && lead.now !== lead.was ? ` أكتر منصة ${up ? 'رفعت' : 'نزّلت'} الرقم: ${platformAr(lead.platform)} (${fmt(lead.was)} ← ${fmt(lead.now)}).` : ''}${countNote}`,
          detail: {
            stats: [
              { label: 'آخر 7 أيام', value: fmt(a), tone: up ? 'up' : 'down' },
              { label: 'الـ 7 اللي قبلها', value: fmt(b) },
              { label: 'البوستات', value: `${recent.length} ← ${before.length}` },
            ],
            points: byPlatform.filter((x) => x.now || x.was).map((x) => `${platformAr(x.platform)}: ${fmt(x.was)} ← ${fmt(x.now)} تفاعل (${x.postsWas} ← ${x.postsNow} بوست)`),
            action: { label: 'افتح التحليلات', to: '/analytics?range=30d' },
          },
        });
      }
    }
  }

  /* ── Nothing posted today by 2 pm, on a weekday we usually post ── */
  if (local.hour >= 14 && local.hour < 21 && !posts.some((p) => +dayOf(p) === +today) && !input.hasPostingToday && !input.scheduledLaterToday) {
    const sameWeekday = Array.from({ length: 8 }, (_, i) => today.minus({ weeks: i + 1 }));
    const active = sameWeekday.filter((d) => posts.some((p) => +dayOf(p) === +d)).length;
    const sheetBlocked = input.sheetSchedule === 'blocked';
    const sheetUnavailable = input.sheetSchedule === 'unavailable';
    if (active >= 4) out.push({
      key: `gap-today:${today.toISODate()}`, kind: 'insight_alert',
      title: sheetBlocked ? 'فيه صفوف في الشيت محتاجة مراجعة' : sheetUnavailable ? 'جدولة الشيت لسه مش متأكدة' : 'لسه مفيش نشر أو جدولة مؤكدة النهارده',
      body: sheetBlocked ? 'في صفوف عليها Ready في الشيت ما دخلتش طابور النشر. راجع التاريخ والساعة وخانة Last Error.'
        : sheetUnavailable ? 'لسه ما قدرناش نتأكد من أحدث جدولة من الشيت. راجع حالة المزامنة في التقويم.'
        : `وقت الفحص، مفيش نشر أو جدولة مؤكدة لباقي اليوم. نشرنا يوم ${WEEKDAY_AR[today.weekday]} في ${active} من آخر 8 أسابيع.`,
      detail: { action: { label: 'افتح التقويم', to: '/calendar' } },
    });
  }

  /* ── Weekly: days without posts, weak platforms, posting times, content mix ── */
  if (local.hour >= 9) {
    const lastWeek = Array.from({ length: 7 }, (_, i) => today.minus({ days: i + 1 }));
    const empty = lastWeek.filter((d) => !posts.some((p) => +dayOf(p) === +d));
    if (empty.length >= 2 && posts.length >= 10) out.push({
      key: `empty-days:${week}`, kind: 'insight_alert',
      title: `${daysWord(empty.length)} من غير نشر في آخر أسبوع`,
      body: `${[...empty].reverse().map((d) => WEEKDAY_AR[d.weekday]).join('، ')}. الأيام دي ممكن نملاها بمحتوى مجدول من بدري.`,
      detail: { points: [...empty].reverse().map((d) => `${WEEKDAY_AR[d.weekday]} ${d.day}/${d.month}`), action: { label: 'خطط الأسبوع في التقويم', to: '/calendar' } },
    });

    const weak = weakPlatforms(posts, now, medians);
    if (weak.length) {
      const tips = weak.map((w) => w.tip).filter(Boolean) as string[];
      const ideas = (input.radarIdeas ?? []).filter((idea) => weak.some((w) => w.platform === idea.platform));
      out.push({
        key: `weak:${week}`, kind: 'insight_alert',
        title: `${weak.length === 1 ? 'منصة محتاجة' : 'منصات محتاجة'} اهتمام: ${weak.map((w) => platformAr(w.platform)).join('، ')}`,
        body: weak.map((w) => `${platformAr(w.platform)}: ${w.reason}`).join(' · '),
        detail: {
          points: [...weak.map((w) => `${platformAr(w.platform)}: ${w.reason}`), ...tips, ...ideas.slice(0, 2).map((i) => `فكرة لـ ${platformAr(i.platform)} من متابعة المنافسين: ${i.title} — ${i.idea}`)],
          action: { label: 'افتح التحليلات', to: '/analytics?range=90d' },
        },
      });
    }

    const timing = bestTimes(posts, now, medians, zone);
    if (timing.length) out.push({
      key: `time:${week}`, kind: 'insight_tip',
      title: 'نصيحة: أوقات نشر أفضل',
      body: timing[0].text,
      detail: { points: timing.map((t) => t.text), action: { label: 'افتح التقويم', to: '/calendar' } },
    });

    const mix = contentMix(posts, now, medians);
    if (mix) out.push({ key: `mix:${week}`, kind: 'insight_idea', title: mix.title, body: mix.body, detail: { points: mix.points, action: { label: 'اعمل بوست جديد', to: '/' } } });
  }

  /* ── Today's idea from the competitor brief ── */
  if (local.hour >= 9 && local.hour < 21 && input.radarIdeas?.length && input.radarDate && input.radarDate >= yesterday.toISODate()!) {
    const [idea, ...rest] = input.radarIdeas;
    out.push({
      key: `idea:${input.radarDate}`, kind: 'insight_idea',
      title: `فكرة النهارده: ${idea.title}`,
      body: `${platformAr(idea.platform)} · ${typeAr(idea.format)} — ${idea.idea}`,
      detail: {
        points: [`ليه؟ ${idea.why}`, ...rest.slice(0, 3).map((i) => `${platformAr(i.platform)} · ${i.title}: ${i.idea}`)],
        action: { label: 'كل الأفكار', to: '/competitors?view=ideas' },
      },
    });
  }

  return out;
}

function bestPostInsight(key: string, heading: string, best: InsightPost, zone: string): Insight {
  const at = DateTime.fromISO(best.publishedAt, { zone });
  const hour = at.hour % 12 || 12;
  const when = `${WEEKDAY_AR[at.weekday]} الساعة ${hour}${at.hour < 12 ? 'ص' : 'م'}`;
  return {
    key, kind: 'insight_best', image: best.thumbnail || undefined,
    title: `${heading} على ${platformAr(best.platform)}`,
    body: `«${best.title}»: ${fmt(best.interactions)} تفاعل${best.ratio != null && best.ratio >= 1.1 ? ` — ${times(best.ratio)} المعتاد على المنصة` : ''}.`,
    detail: {
      posts: [best],
      stats: [
        { label: 'التفاعل', value: fmt(best.interactions) },
        { label: 'الوصول', value: fmt(best.reach) },
        ...(best.ratio != null ? [{ label: 'مقارنة بالمعتاد', value: times(best.ratio), tone: (best.ratio >= 1 ? 'up' : 'down') as InsightStat['tone'] }] : []),
      ],
      points: [`النوع: ${typeAr(best.contentType)}`, `نزل ${when}`, 'كرروا نفس الفكرة أو الشكل على منصة تانية.'],
      action: best.permalink ? { label: 'افتح البوست', to: best.permalink } : { label: 'افتح التحليلات', to: '/analytics' },
    },
  };
}

/** Platforms that went quiet, post much less than usual, or get much less interaction than their own norm. */
export function weakPlatforms(posts: ObservedPost[], now: Date, medians: Map<string, number>) {
  const out: { platform: string; reason: string; tip?: string }[] = [];
  for (const platform of new Set(posts.map((p) => p.platform))) {
    const own = posts.filter((p) => p.platform === platform);
    const age = (p: ObservedPost) => now.getTime() - Date.parse(p.publishedAt);
    const in90 = own.filter((p) => age(p) < 90 * DAY);
    if (in90.length < 6) continue;
    const last14 = own.filter((p) => age(p) < 14 * DAY);
    const typical14 = (in90.length / 90) * 14;
    const latest = Math.min(...own.map(age));
    const tip = bestTypeTip(platform, in90, medians);
    if (latest >= 21 * DAY) { out.push({ platform, reason: `مفيش نشر من ${daysWord(Math.floor(latest / DAY))}`, tip }); continue; }
    if (typical14 >= 4 && last14.length <= typical14 * 0.4) { out.push({ platform, reason: `${postsWord(last14.length)} بس في آخر أسبوعين، والمعتاد حوالي ${Math.round(typical14)}`, tip }); continue; }
    const base = medians.get(platform);
    const settled = last14.filter((p) => age(p) >= 2 * DAY).map(interactionsOf).filter((v): v is number => v != null);
    const m = median(settled);
    if (base && settled.length >= 3 && m != null && m <= base * 0.65) out.push({ platform, reason: `التفاعل على البوست أقل من المعتاد بـ ${pct(m / base)} في آخر أسبوعين`, tip });
  }
  return out;
}

/** "Reels do 2× the usual on Instagram": the best content type on a platform, when it clearly beats the rest. */
function bestTypeTip(platform: string, posts: ObservedPost[], medians: Map<string, number>): string | undefined {
  const base = medians.get(platform);
  if (!base) return undefined;
  const groups = new Map<string, number[]>();
  for (const p of posts) { const v = interactionsOf(p); if (v != null) (groups.get(typeOf(p)) ?? groups.set(typeOf(p), []).get(typeOf(p))!).push(v); }
  const ranked = [...groups.entries()].filter(([, v]) => v.length >= 3).map(([type, v]) => ({ type, ratio: median(v)! / base })).sort((a, b) => b.ratio - a.ratio);
  if (!ranked.length || ranked[0].ratio < 1.25) return undefined;
  return `على ${platformAr(platform)}، الـ${typeAr(ranked[0].type)} بيجيب ${times(ranked[0].ratio)} المعتاد — ابدأوا بيه.`;
}

/** Per platform: the 3-hour block and weekday that do best, when we rarely post then. Needs enough posts to mean anything. */
export function bestTimes(posts: ObservedPost[], now: Date, medians: Map<string, number>, zone: string) {
  const tips: { platform: string; text: string; lift: number }[] = [];
  for (const [platform, base] of medians) {
    const own = posts.filter((p) => { const age = now.getTime() - Date.parse(p.publishedAt); return p.platform === platform && age >= 2 * DAY && age < 90 * DAY && interactionsOf(p) != null; });
    if (own.length < 12) continue;
    const hourOf = (p: ObservedPost) => DateTime.fromISO(p.publishedAt, { zone }).hour;
    const blocks = BLOCKS.map((b) => {
      const list = own.filter((p) => { const h = hourOf(p); return h >= b.from && h < b.to; });
      return { ...b, count: list.length, ratio: list.length >= 3 ? median(list.map((p) => interactionsOf(p)!))! / base : 0 };
    }).filter((b) => b.count >= 3).sort((a, b) => b.ratio - a.ratio);
    const top = blocks[0];
    const usual = [...blocks].sort((a, b) => b.count - a.count)[0];
    if (!top || top.ratio < 1.25 || top === usual) continue;
    const share = Math.round((top.count / own.length) * 100);
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const list = own.filter((p) => DateTime.fromISO(p.publishedAt, { zone }).weekday === d);
      return { d, ratio: list.length >= 3 ? median(list.map((p) => interactionsOf(p)!))! / base : 0 };
    }).sort((a, b) => b.ratio - a.ratio)[0];
    tips.push({
      platform, lift: top.ratio,
      text: `${platformAr(platform)}: البوستات اللي بتنزل ${top.label} بتجيب ${times(top.ratio)} المعتاد، بس ${share}% بس من بوستاتنا بتنزل في الوقت ده (أغلبها ${usual.label}).${days && days.ratio >= 1.25 ? ` وأحسن يوم: ${WEEKDAY_AR[days.d]}.` : ''}`,
    });
  }
  return tips.sort((a, b) => b.lift - a.lift).slice(0, 3);
}

/** When one content type dominates the last 30 days and another type clearly does better, suggest varying. */
export function contentMix(posts: ObservedPost[], now: Date, medians: Map<string, number>) {
  const recent = posts.filter((p) => now.getTime() - Date.parse(p.publishedAt) < 30 * DAY);
  if (recent.length < 8) return null;
  const counts = new Map<string, number>();
  for (const p of recent) counts.set(typeOf(p), (counts.get(typeOf(p)) ?? 0) + 1);
  const [dominant, domCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const share = domCount / recent.length;
  if (share < 0.6) return null;
  // Each type's interactions as a multiple of its own platform's usual, over 90 days.
  const ratios = new Map<string, number[]>();
  for (const p of posts) {
    const age = now.getTime() - Date.parse(p.publishedAt), v = interactionsOf(p), base = medians.get(p.platform);
    if (age < 2 * DAY || age > 90 * DAY || v == null || !base) continue;
    (ratios.get(typeOf(p)) ?? ratios.set(typeOf(p), []).get(typeOf(p))!).push(v / base);
  }
  const score = (type: string) => median(ratios.get(type) ?? []);
  const domScore = score(dominant);
  const better = [...ratios.entries()].filter(([type, list]) => type !== dominant && list.length >= 3).map(([type]) => ({ type, score: score(type)! })).filter((x) => domScore && x.score >= domScore * 1.3).sort((a, b) => b.score - a.score)[0];
  const mixText = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) => `${typeAr(type)} ${n}`).join(' · ');
  if (better && domScore) return {
    title: `نوّعوا المحتوى: جرّبوا ${typeAr(better.type)} أكتر`,
    body: `${Math.round(share * 100)}% من بوستات آخر 30 يوم ${typeAr(dominant)}، والـ${typeAr(better.type)} بيجيب ${times(better.score / domScore)} تفاعلها. جرّبوا 2–3 ${typeAr(better.type)} الأسبوع ده.`,
    points: [`توزيع آخر 30 يوم: ${mixText}`],
  };
  if (share >= 0.8) return {
    title: 'نوّعوا شكل البوستات',
    body: `${Math.round(share * 100)}% من بوستات آخر 30 يوم ${typeAr(dominant)}. جرّبوا ريلز قصير أو كاروسيل نصايح، وقيسوا الفرق بعد أسبوعين.`,
    points: [`توزيع آخر 30 يوم: ${mixText}`],
  };
  return null;
}
