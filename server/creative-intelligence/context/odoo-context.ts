/** Resolve the Odoo course/event a request is about, and turn it into verified, display-ready facts. */
import { DateTime } from 'luxon';
import { readOdooSchedule, type ScheduleEntry } from '../../odoo.js';
import { scoreEventMatch } from '../../../src/features/creative-studio/context-resolver.js';

export interface Fact<T> { value: T; source: 'odoo' | 'user'; sourceId?: string; confidence: number; verified: boolean }
export interface VerifiedCourseContext {
  event: ScheduleEntry;
  facts: {
    title: Fact<string>;
    startsAtLocal: Fact<string>;
    /** Display strings, already in the event's time zone. */
    dateText: Fact<string>;
    timeText: Fact<string>;
    weekdayText: Fact<string>;
    deliveryMode?: Fact<string>;
    registrationUrl?: Fact<string>;
  };
  timeZone: string;
  alternatives: { id: string; title: string; startsAt: string }[];
}
export type OdooContextResult =
  | { status: 'matched'; context: VerifiedCourseContext }
  | { status: 'no_match' | 'unavailable'; message: string };

const ARABIC_WEEKDAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
const zoneFor = (event: ScheduleEntry) => /ksa|saudi|riyadh|السعودية/i.test(event.location ?? '') ? 'Asia/Riyadh' : (process.env.BUSINESS_TIME_ZONE || 'Asia/Riyadh');
const odoo = (value: string, id: string): Fact<string> => ({ value, source: 'odoo', sourceId: id, confidence: 1, verified: true });

export function buildCourseContext(event: ScheduleEntry, alternatives: ScheduleEntry[] = []): VerifiedCourseContext {
  const timeZone = zoneFor(event);
  const start = DateTime.fromISO(event.startsAt, { zone: 'utc' }).setZone(timeZone);
  const hour12 = start.hour % 12 || 12;
  const period = start.hour < 12 ? 'صباحًا' : 'مساءً';
  const mode = /online|أونلاين|zoom/i.test(event.title) ? 'أونلاين' : undefined;
  return {
    event, timeZone,
    facts: {
      title: odoo(event.title, event.id),
      startsAtLocal: odoo(start.toISO()!, event.id),
      dateText: odoo(start.toFormat('dd-MM-yyyy'), event.id),
      timeText: odoo(`${hour12}:${start.toFormat('mm')} ${period}`, event.id),
      weekdayText: odoo(ARABIC_WEEKDAYS[start.weekday - 1], event.id),
      ...(mode ? { deliveryMode: odoo(mode, event.id) } : {}),
      ...(event.registrationUrl ? { registrationUrl: odoo(event.registrationUrl, event.id) } : {}),
    },
    alternatives: alternatives.map((alt) => ({ id: alt.id, title: alt.title, startsAt: alt.startsAt })),
  };
}

/** Best upcoming event for the request: highest name match, then soonest. Never invents a match. */
export async function resolveOdooContext(prompt: string, now = new Date()): Promise<OdooContextResult> {
  const schedule = await readOdooSchedule();
  if (schedule.status !== 'connected') return { status: 'unavailable', message: schedule.message || 'Odoo unavailable' };
  const upcoming = schedule.events.filter((event) => new Date(event.startsAt).getTime() >= now.getTime() - 3_600_000);
  const scored = upcoming.map((event) => ({ event, score: scoreEventMatch(prompt, event) })).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.event.startsAt.localeCompare(b.event.startsAt));
  if (!scored.length) return { status: 'no_match', message: 'No upcoming Odoo course or event matches the request' };
  const best = scored[0];
  const alternatives = scored.slice(1).filter((entry) => entry.score === best.score).slice(0, 3).map((entry) => entry.event);
  return { status: 'matched', context: buildCourseContext(best.event, alternatives) };
}
