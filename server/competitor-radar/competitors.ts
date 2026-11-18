/** The competitors the radar watches every day, with their public accounts on each platform. */
export type RadarPlatform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok';
export const RADAR_PLATFORMS: RadarPlatform[] = ['facebook', 'instagram', 'linkedin', 'tiktok'];

export interface Competitor {
  id: string;
  name: string;
  /** The name shown in Arabic screens and briefs. */
  nameAr: string;
  accounts: Record<RadarPlatform, string>;
}

export const COMPETITORS: Competitor[] = [
  {
    id: 'engtracks',
    name: 'Engineering Tracks',
    nameAr: 'إنجنيرنج تراكس',
    accounts: {
      facebook: 'https://www.facebook.com/engtracksksa',
      instagram: 'engtracksksa',
      linkedin: 'https://www.linkedin.com/company/engtracks/',
      tiktok: 'engtracks',
    },
  },
  {
    id: 'bakkah',
    name: 'Bakkah',
    nameAr: 'بكة للتعليم',
    accounts: {
      facebook: 'https://www.facebook.com/BakkahInc',
      instagram: 'bakkah_learning',
      linkedin: 'https://www.linkedin.com/company/bakkahlearning/',
      tiktok: 'bakkah_learning',
    },
  },
  {
    id: 'iltc',
    name: 'ILTC',
    nameAr: 'التعليم المتكامل',
    accounts: {
      facebook: 'https://www.facebook.com/ILTC.Gulf',
      instagram: 'iltcksa',
      linkedin: 'https://www.linkedin.com/company/iltcgulf/',
      tiktok: 'iltcksa',
    },
  },
];

/** The competitor an account handle, page name or URL belongs to. */
export function competitorOf(value: string | null | undefined): Competitor | undefined {
  const text = (value ?? '').toLowerCase();
  if (!text) return undefined;
  const key = (account: string) => account.toLowerCase().replace(/^https?:\/\/(www\.)?[^/]+\/(company\/)?/, '').replace(/\/+$/, '');
  return COMPETITORS.find((c) => Object.values(c.accounts).some((account) => {
    const k = key(account);
    return text === k || text.includes(`/${k}`) || text.includes(`@${k}`) || text.endsWith(k);
  }));
}
