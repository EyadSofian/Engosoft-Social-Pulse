import { DateTime } from 'luxon';
import type { ContentType } from '../../domain/content';
import type { ContentEvent, EventKind } from '../../domain/planning';
import type { Text } from '../../domain/shared';
import type { DepartmentId } from '../../domain/users';
import { businessZone } from '../../lib/format';
import { upcomingOccasions, type OccasionKind } from '../../lib/occasions';
import type { WorkspaceState } from '../workspace/state';

export interface Opportunity {
  id: string;
  name: Text;
  /** yyyy-MM-dd */
  date: string;
  kind: EventKind;
  departments: DepartmentId[];
  suggestion: Text;
  suggestedType: ContentType;
  source: ContentEvent['source'];
  approximate: boolean;
  /** Content already planned for it. */
  covered: boolean;
}

const KIND: Record<OccasionKind, EventKind> = { national: 'national', religious: 'religious', global: 'international', season: 'season' };
const DEPARTMENTS: Record<OccasionKind, DepartmentId[]> = {
  global: ['marketing', 'education'],
  national: ['marketing', 'hr'],
  religious: ['marketing', 'hr'],
  season: ['marketing'],
};

/**
 * Upcoming occasions from the curated catalog plus events the team entered.
 * This is a calendar, not a prediction: the suggestion is a format, and the
 * team decides whether to post. An AI event agent can feed the same shape later.
 */
export function upcomingOpportunities(state: WorkspaceState, nowMs: number, horizon = 45): Opportunity[] {
  const today = DateTime.fromMillis(nowMs, { zone: businessZone() }).toISODate() ?? '';
  const end = DateTime.fromMillis(nowMs, { zone: businessZone() }).plus({ days: horizon }).toISODate() ?? '';
  const titles = state.content.map((item) => item.title.toLowerCase());
  const covered = (name: Text) => titles.some((title) => title.includes(name.en.toLowerCase()) || title.includes(name.ar));

  const company: Opportunity[] = state.events
    .filter((event) => event.date >= today && event.date <= end)
    .map((event) => ({ ...event, approximate: Boolean(event.approximate), covered: covered(event.name) }));

  const catalog: Opportunity[] = upcomingOccasions(today, horizon, 12).map((occasion) => {
    const name = { en: occasion.name, ar: occasion.name };
    return {
      id: `occ-${occasion.key}`,
      name,
      date: occasion.day,
      kind: KIND[occasion.kind],
      departments: DEPARTMENTS[occasion.kind],
      suggestion: occasion.kind === 'global' ? { en: 'Educational carousel tied to the day', ar: 'كاروسيل تعليمي مرتبط باليوم' } : { en: 'Greeting post', ar: 'منشور تهنئة' },
      suggestedType: occasion.kind === 'global' ? 'carousel' : 'post',
      source: 'catalog',
      approximate: Boolean(occasion.approximate),
      covered: covered(name),
    };
  });

  return [...company, ...catalog].sort((a, b) => a.date.localeCompare(b.date));
}
