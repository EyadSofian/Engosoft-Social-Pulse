import type { Text } from '../../domain/shared';
import { dayKeyOf } from '../../lib/format';
import { PLATFORMS } from '../../lib/platforms';
import type { AudienceDay, AudienceDemographics, AudienceSlice, Platform } from '../../types';

/**
 * Each platform's audience: followers now and how that moved over the period, from one snapshot a day,
 * and who the audience is where the platform says (Instagram followers, YouTube viewers).
 */

export interface AudienceAccount {
  platform: Platform;
  accountId: string;
  accountName: string;
  followers: number | null;
  /** The day the follower count is from. */
  date: string | null;
  /** Followers gained (or lost) since `since`; null without an earlier count to compare with. */
  change: number | null;
  /** The earlier count's day: the start of the period, or the first day counted when tracking began inside it. */
  since: string | null;
  demographics: AudienceDemographics | null;
  demographicsDate: string | null;
}

export interface PlatformAudience {
  platform: Platform;
  /** Sum over the platform's accounts that report a count. */
  followers: number | null;
  change: number | null;
  since: string | null;
  accounts: AudienceAccount[];
}

export type DemographicKey = 'age' | 'gender' | 'country' | 'city';
export const DEMOGRAPHIC_KEYS: DemographicKey[] = ['age', 'gender', 'country', 'city'];

/** Followers and demographics for the accounts in scope, platform by platform. */
export function buildAudience(rows: AudienceDay[], scope: { platform: Platform | 'all'; account: string }, period: number, todayNum: number): PlatformAudience[] {
  const start = dayKeyOf(todayNum - period + 1);
  const today = dayKeyOf(todayNum);
  const scoped = rows.filter((row) => row.date <= today && (scope.platform === 'all' || row.platform === scope.platform) && (scope.account === 'all' || row.accountId === scope.account));
  const byAccount = new Map<string, AudienceDay[]>();
  for (const row of scoped) {
    const key = `${row.platform}:${row.accountId}`;
    const list = byAccount.get(key);
    if (list) list.push(row);
    else byAccount.set(key, [row]);
  }
  const accounts: AudienceAccount[] = [...byAccount.values()].map((list) => {
    const days = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const counted = days.filter((row) => row.followers != null);
    const latest = counted[counted.length - 1];
    // The count on the day before the period, or failing that the first count inside it.
    const before = counted.filter((row) => row.date < start);
    const baseline = before[before.length - 1] ?? counted.find((row) => row.date >= start);
    const withDemographics = [...days].reverse().find((row) => row.demographics);
    const last = days[days.length - 1];
    return {
      platform: last.platform,
      accountId: last.accountId,
      accountName: last.accountName,
      followers: latest?.followers ?? null,
      date: latest?.date ?? null,
      change: latest && baseline && baseline.date < latest.date ? latest.followers! - baseline.followers! : null,
      since: latest && baseline && baseline.date < latest.date ? baseline.date : null,
      demographics: withDemographics?.demographics ?? null,
      demographicsDate: withDemographics?.date ?? null,
    };
  });
  return PLATFORMS.flatMap((platform) => {
    const own = accounts.filter((account) => account.platform === platform).sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1));
    if (!own.length) return [];
    const counted = own.filter((account) => account.followers != null);
    const changed = own.filter((account) => account.change != null);
    const since = changed.map((account) => account.since!).sort()[0] ?? null;
    return [
      {
        platform,
        followers: counted.length ? counted.reduce((sum, account) => sum + account.followers!, 0) : null,
        change: changed.length ? changed.reduce((sum, account) => sum + account.change!, 0) : null,
        since,
        accounts: own,
      },
    ];
  });
}

/** Slices as shares of their total, largest first (ages keep their natural order). */
export function shares(slices: AudienceSlice[] | undefined, key: DemographicKey, limit = key === 'age' ? 8 : key === 'gender' ? 3 : 6): AudienceSlice[] {
  if (!slices?.length) return [];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) return [];
  const list = slices.map((slice) => ({ key: slice.key, value: (slice.value / total) * 100 }));
  if (key === 'age') return list.sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true })).slice(0, limit);
  return list.sort((a, b) => b.value - a.value).slice(0, limit);
}

export const DEMOGRAPHIC_LABEL: Record<DemographicKey, Text> = {
  age: { en: 'Age', ar: 'السن' },
  gender: { en: 'Gender', ar: 'النوع' },
  country: { en: 'Top countries', ar: 'أكتر الدول' },
  city: { en: 'Top cities', ar: 'أكتر المدن' },
};

const GENDER: Record<string, Text> = {
  f: { en: 'Women', ar: 'ستات' },
  female: { en: 'Women', ar: 'ستات' },
  m: { en: 'Men', ar: 'رجالة' },
  male: { en: 'Men', ar: 'رجالة' },
  u: { en: 'Not specified', ar: 'غير محدد' },
  user_specified: { en: 'Not specified', ar: 'غير محدد' },
};

const regionNames = new Map<string, Intl.DisplayNames | null>();
function regionName(code: string, lang: string): string {
  if (!regionNames.has(lang)) {
    try {
      regionNames.set(lang, new Intl.DisplayNames([lang], { type: 'region' }));
    } catch {
      regionNames.set(lang, null);
    }
  }
  try {
    return regionNames.get(lang)?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** A readable name for a slice: "Men", "Egypt", "25-34"; cities arrive already readable ("Cairo, Cairo Governorate"). */
export function sliceLabel(key: DemographicKey, value: string, lang: 'ar' | 'en'): string {
  if (key === 'gender') return GENDER[value.toLowerCase()]?.[lang] ?? value;
  if (key === 'country' && /^[a-z]{2}$/i.test(value)) return regionName(value, lang);
  if (key === 'city') return value.split(',')[0];
  return value;
}

export const basisLabel = (demographics: AudienceDemographics): Text =>
  demographics.basis === 'viewers' ? { en: 'Viewers, last 90 days', ar: 'المشاهدين، آخر 90 يوم' } : { en: 'Followers', ar: 'المتابعين' };
