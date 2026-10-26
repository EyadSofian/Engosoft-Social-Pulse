import type { ScheduleEntry } from '../../../server/odoo';
import { scoreRecord } from './course-search';

export type FactSource = 'odoo' | 'user' | 'database' | 'manual';
export interface VerifiedValue<T> { value: T; source: FactSource; verified: boolean; updatedAt?: string }
export interface FactConflict<T> { field: string; user: VerifiedValue<T>; authoritative: VerifiedValue<T>; resolved: false }
export interface ResolvedEvent {
  id: VerifiedValue<string>; title: VerifiedValue<string>; startsAt: VerifiedValue<string>;
  endsAt: VerifiedValue<string>; location?: VerifiedValue<string>; registrationUrl?: VerifiedValue<string>;
  conflicts: FactConflict<string>[];
}
const verified = <T>(value: T): VerifiedValue<T> => ({ value, source: 'odoo', verified: true, updatedAt: new Date().toISOString() });
/** How well a request names an Odoo course run; 0 = not about it. Arabic and English names both match. */
export function scoreEventMatch(prompt: string, event: Pick<ScheduleEntry, 'title'>): number {
  return scoreRecord(prompt, { name: event.title.replace(/\s*[-–]\s*\d{3,}\s*$/, '') });
}
export function resolveEvent(event: ScheduleEntry, userDate?: string): ResolvedEvent {
  const startsAt = verified(event.startsAt);
  const conflicts: FactConflict<string>[] = userDate && userDate.slice(0, 10) !== event.startsAt.slice(0, 10) ? [{ field: 'startsAt', user: { value: userDate, source: 'user', verified: false }, authoritative: startsAt, resolved: false }] : [];
  return { id: verified(event.id), title: verified(event.title), startsAt, endsAt: verified(event.endsAt), ...(event.location ? { location: verified(event.location) } : {}), ...(event.registrationUrl ? { registrationUrl: verified(event.registrationUrl) } : {}), conflicts };
}
