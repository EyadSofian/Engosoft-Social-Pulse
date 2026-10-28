import { DateTime } from 'luxon';
import { businessZone } from './format';

/**
 * Content occasions the team usually plans around: national days in Egypt and the Gulf,
 * international days that suit an engineering-education brand, and social/commerce moments.
 * Hijri dates follow the Umm al-Qura calendar; local moon sighting can shift them by a day.
 */
export type OccasionKind = 'national' | 'religious' | 'global' | 'season';

export interface Occasion {
  key: string;
  /** yyyy-MM-dd */
  day: string;
  name: string;
  kind: OccasionKind;
  region?: string;
  approximate?: boolean;
}

export const occasionKindLabel: Record<OccasionKind, string> = {
  national: 'مناسبة وطنية',
  religious: 'مناسبة دينية',
  global: 'يوم عالمي',
  season: 'موسم تسويقي',
};

type Fixed = [month: number, day: number, name: string, kind: OccasionKind, region?: string];

const FIXED: Fixed[] = [
  [1, 1, 'رأس السنة الميلادية', 'season'],
  [1, 7, 'عيد الميلاد المجيد', 'religious', 'مصر'],
  [1, 24, 'اليوم الدولي للتعليم', 'global'],
  [1, 25, 'عيد الشرطة', 'national', 'مصر'],
  [2, 22, 'يوم التأسيس', 'national', 'السعودية'],
  [3, 4, 'اليوم العالمي للهندسة', 'global'],
  [3, 8, 'اليوم الدولي للمرأة', 'global'],
  [3, 11, 'يوم العلم', 'national', 'السعودية'],
  [3, 21, 'عيد الأم', 'season'],
  [4, 22, 'يوم الأرض', 'global'],
  [4, 25, 'عيد تحرير سيناء', 'national', 'مصر'],
  [4, 28, 'اليوم العالمي للسلامة والصحة المهنية', 'global'],
  [5, 1, 'عيد العمال', 'global'],
  [6, 5, 'اليوم العالمي للبيئة', 'global'],
  [6, 30, 'ذكرى 30 يونيو', 'national', 'مصر'],
  [7, 15, 'اليوم العالمي لمهارات الشباب', 'global'],
  [7, 23, 'عيد ثورة 23 يوليو', 'national', 'مصر'],
  [8, 12, 'اليوم الدولي للشباب', 'global'],
  [9, 23, 'اليوم الوطني', 'national', 'السعودية'],
  [10, 5, 'اليوم العالمي للمعلم', 'global'],
  [10, 6, 'ذكرى انتصارات أكتوبر', 'national', 'مصر'],
  [10, 14, 'اليوم العالمي للتقييس', 'global'],
  [12, 2, 'اليوم الوطني', 'national', 'الإمارات'],
  [12, 18, 'اليوم العالمي للغة العربية', 'global'],
];

/** [Hijri month, Hijri day, name] */
const HIJRI: [number, number, string][] = [
  [1, 1, 'رأس السنة الهجرية'],
  [3, 12, 'المولد النبوي الشريف'],
  [9, 1, 'بداية شهر رمضان'],
  [10, 1, 'عيد الفطر'],
  [12, 9, 'يوم عرفة'],
  [12, 10, 'عيد الأضحى'],
];

let hijriParts: Intl.DateTimeFormat | null | undefined;
let hijriLong: Intl.DateTimeFormat | null | undefined;
let hijriZone = '';

/** Formatters are bound to the business timezone; rebuild them if the server reports another one. */
function syncZone() {
  if (hijriZone === businessZone()) return;
  hijriZone = businessZone();
  hijriParts = undefined;
  hijriLong = undefined;
}

function hijriFormatter() {
  syncZone();
  if (hijriParts === undefined) {
    try {
      hijriParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
        timeZone: businessZone(),
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      });
      // Engines without the calendar silently fall back to Gregorian.
      if (hijriParts.resolvedOptions().calendar !== 'islamic-umalqura') hijriParts = null;
    } catch {
      hijriParts = null;
    }
  }
  return hijriParts;
}

const noonOf = (day: string) => DateTime.fromISO(day, { zone: businessZone() }).set({ hour: 12 }).toMillis();

export function hijriOf(day: string): { month: number; day: number } | null {
  const format = hijriFormatter();
  if (!format) return null;
  const parts = format.formatToParts(noonOf(day));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const month = value('month');
  const date = value('day');
  return Number.isFinite(month) && Number.isFinite(date) ? { month, day: date } : null;
}

/** "13 ربيع الآخر 1448 هـ" — empty when the engine has no Umm al-Qura calendar. */
export function hijriLabel(day: string): string {
  syncZone();
  if (hijriLong === undefined) {
    try {
      hijriLong = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
        timeZone: businessZone(),
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      if (hijriLong.resolvedOptions().calendar !== 'islamic-umalqura') hijriLong = null;
    } catch {
      hijriLong = null;
    }
  }
  return hijriLong ? hijriLong.format(noonOf(day)) : '';
}

/** Orthodox Easter (Meeus' Julian algorithm), shifted to the Gregorian calendar — valid 1900–2099. */
function orthodoxEaster(year: number): DateTime {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return DateTime.fromObject({ year, month, day }, { zone: businessZone() }).plus({ days: 13 });
}

function computed(year: number): Omit<Occasion, 'key'>[] {
  const zone = businessZone();
  const october = DateTime.fromObject({ year, month: 10, day: 1 }, { zone });
  const architecture = october.plus({ days: (1 - october.weekday + 7) % 7 });
  const november = DateTime.fromObject({ year, month: 11, day: 1 }, { zone });
  const thanksgiving = november.plus({ days: ((4 - november.weekday + 7) % 7) + 21 });
  const shamElNessim = orthodoxEaster(year).plus({ days: 1 });
  const firstThursdayOfNovember = november.plus({ days: (4 - november.weekday + 7) % 7 });
  return [
    { day: firstThursdayOfNovember.toISODate() ?? '', name: 'اليوم العالمي لإدارة المشاريع', kind: 'global' },
    { day: firstThursdayOfNovember.plus({ days: 7 }).toISODate() ?? '', name: 'اليوم العالمي للجودة', kind: 'global' },
    { day: architecture.toISODate() ?? '', name: 'اليوم العالمي للعمارة', kind: 'global' },
    { day: thanksgiving.plus({ days: 1 }).toISODate() ?? '', name: 'الجمعة البيضاء', kind: 'season' },
    { day: shamElNessim.toISODate() ?? '', name: 'شم النسيم', kind: 'season', region: 'مصر' },
  ];
}

const cache = new Map<string, Occasion[]>();

/** Occasions falling on any of the given days (yyyy-MM-dd), grouped by day. */
export function occasionsFor(days: string[]): Map<string, Occasion[]> {
  const result = new Map<string, Occasion[]>();
  if (!days.length) return result;
  const cacheKey = `${businessZone()}|${days[0]}|${days[days.length - 1]}|${days.length}`;
  const hit = cache.get(cacheKey);
  const list = hit ?? build(days);
  if (!hit) cache.set(cacheKey, list);
  for (const item of list) {
    const bucket = result.get(item.day);
    if (bucket) bucket.push(item);
    else result.set(item.day, [item]);
  }
  return result;
}

function build(days: string[]): Occasion[] {
  const wanted = new Set(days);
  const years = new Set(days.map((day) => Number(day.slice(0, 4))));
  const list: Occasion[] = [];
  for (const year of years) {
    for (const [month, day, name, kind, region] of FIXED) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (wanted.has(key)) list.push({ key: `${key}:${name}`, day: key, name, kind, region });
    }
    for (const item of computed(year)) if (wanted.has(item.day)) list.push({ ...item, key: `${item.day}:${item.name}` });
  }
  for (const day of days) {
    const hijri = hijriOf(day);
    if (!hijri) continue;
    for (const [month, date, name] of HIJRI)
      if (hijri.month === month && hijri.day === date)
        list.push({ key: `${day}:${name}`, day, name, kind: 'religious', approximate: true });
  }
  return list.sort((a, b) => a.day.localeCompare(b.day));
}

/** The next `limit` occasions on or after `fromDay`, looking `horizon` days ahead. */
export function upcomingOccasions(fromDay: string, horizon = 60, limit = 5): Occasion[] {
  const start = DateTime.fromISO(fromDay, { zone: businessZone() });
  const days = Array.from({ length: horizon }, (_, index) => start.plus({ days: index }).toISODate() ?? '');
  return [...occasionsFor(days).values()].flat().slice(0, limit);
}
