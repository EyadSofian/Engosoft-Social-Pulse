import type { ScheduleEntry } from '../../../server/odoo';

export type FactSource = 'odoo' | 'user' | 'database' | 'manual';
export interface VerifiedValue<T> { value: T; source: FactSource; verified: boolean; updatedAt?: string }
export interface FactConflict<T> { field: string; user: VerifiedValue<T>; authoritative: VerifiedValue<T>; resolved: false }
export interface ResolvedEvent {
  id: VerifiedValue<string>; title: VerifiedValue<string>; startsAt: VerifiedValue<string>;
  endsAt: VerifiedValue<string>; location?: VerifiedValue<string>; registrationUrl?: VerifiedValue<string>;
  conflicts: FactConflict<string>[];
}
const verified = <T>(value: T): VerifiedValue<T> => ({ value, source: 'odoo', verified: true, updatedAt: new Date().toISOString() });
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const generic = new Set(['course','training','webinar','event','post','design','engosoft','دورة','دورة','تدريب','ويبينار','فعالية','منشور','تصميم','من','في','عن','على']);
export function scoreEventMatch(prompt: string, event: Pick<ScheduleEntry, 'title'>): number {
  const title = normalize(event.title).split(' ');
  return [...new Set(normalize(prompt).split(' ').filter((word) => word.length >= 3 && !generic.has(word)))].reduce((score, word) => score + (title.some((part) => part === word || (word.length >= 5 && part.startsWith(word))) ? (/[a-z0-9]/.test(word) ? 3 : 1) : 0), 0);
}
export function resolveEvent(event: ScheduleEntry, userDate?: string): ResolvedEvent {
  const startsAt = verified(event.startsAt);
  const conflicts: FactConflict<string>[] = userDate && userDate.slice(0, 10) !== event.startsAt.slice(0, 10) ? [{ field: 'startsAt', user: { value: userDate, source: 'user', verified: false }, authoritative: startsAt, resolved: false }] : [];
  return { id: verified(event.id), title: verified(event.title), startsAt, endsAt: verified(event.endsAt), ...(event.location ? { location: verified(event.location) } : {}), ...(event.registrationUrl ? { registrationUrl: verified(event.registrationUrl) } : {}), conflicts };
}
