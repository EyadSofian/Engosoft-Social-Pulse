import { DateTime } from 'luxon';

/** Arabic copy with Latin digits, so dates and metrics share one numeral system. */
const LOCALE = 'ar-EG-u-nu-latn';
export const DAY_MS = 86_400_000;

let zone = 'Africa/Cairo';
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** The server reports the business timezone; every date in the UI is rendered in it. */
export function setBusinessZone(next: string) {
  if (!next || next === zone) return;
  zone = next;
  dateFormats.clear();
}
export const businessZone = () => zone;

/** Graph API timestamps end in "+0000", which Safari's Date parser rejects. */
export function parseTimestamp(value: string): number {
  if (!value) return NaN;
  return Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
}

export const inZone = (ms: number) => DateTime.fromMillis(ms, { zone });
export const zoneNow = (ms: number = Date.now()) => DateTime.fromMillis(ms, { zone });
export const dayNumber = (ms: number) => Math.floor((ms + inZone(ms).offset * 60_000) / DAY_MS);
export const dayKeyOf = (dayNum: number) => new Date(dayNum * DAY_MS).toISOString().slice(0, 10);
export const dateFromKey = (key: string) => DateTime.fromISO(key, { zone });

const integer = new Intl.NumberFormat('en-US');
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export const MISSING = '—';
export const num = (value: number | null | undefined) => (value == null ? MISSING : integer.format(value));
export const compact = (value: number | null | undefined) =>
  value == null ? MISSING : Math.abs(value) < 10_000 ? integer.format(value) : compactNumber.format(value);
export const tick = (value: number) => compactNumber.format(value);
export const oneDecimal = (value: number | null | undefined) => (value == null ? MISSING : decimal.format(value));
export const pct = (value: number | null | undefined) => (value == null ? MISSING : `${decimal.format(value)}%`);
export const signedPct = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${decimal.format(Math.abs(value))}%`;

function formatter(options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options);
  let hit = dateFormats.get(key);
  if (!hit) {
    hit = new Intl.DateTimeFormat(LOCALE, { timeZone: zone, ...options });
    dateFormats.set(key, hit);
  }
  return hit;
}

export function fmt(value: number | string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (value == null || value === '') return MISSING;
  const ms = typeof value === 'number' ? value : parseTimestamp(value);
  return Number.isFinite(ms) ? formatter(options).format(ms) : MISSING;
}

export const fmtTime = (value: number | string) => fmt(value, { hour: 'numeric', minute: '2-digit' });
export const fmtDay = (value: number | string) => fmt(value, { day: 'numeric', month: 'long' });
export const fmtDayShort = (value: number | string) => fmt(value, { day: 'numeric', month: 'short' });
export const fmtDate = (value: number | string) => fmt(value, { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateTime = (value: number | string) =>
  fmt(value, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
export const fmtWeekdayDate = (value: number | string) => fmt(value, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtMonth = (value: number | string) => fmt(value, { month: 'long', year: 'numeric' });

const relativeFormat = new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'auto' });
const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60_000],
  ['hour', 3_600_000],
  ['day', DAY_MS],
  ['month', 30 * DAY_MS],
  ['year', 365 * DAY_MS],
];

/** "خلال ساعتين" / "قبل 5 دقائق" — relative to `now`. */
export function relative(value: number | string, now: number = Date.now()): string {
  const ms = typeof value === 'number' ? value : parseTimestamp(value);
  if (!Number.isFinite(ms)) return MISSING;
  const diff = ms - now;
  if (Math.abs(diff) < 45_000) return 'الآن';
  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let size = 60_000;
  for (const [nextUnit, nextSize] of RELATIVE_STEPS) {
    if (Math.abs(diff) < nextSize) break;
    unit = nextUnit;
    size = nextSize;
  }
  return relativeFormat.format(Math.round(diff / size), unit);
}

export const hourLabel = (hour: number) =>
  hour === 0 ? '12 ص' : hour < 12 ? `${hour} ص` : hour === 12 ? '12 م' : `${hour - 12} م`;

/** `<input type="datetime-local">` values are wall-clock time in the business timezone. */
export const toInputValue = (iso: string) => inZone(parseTimestamp(iso)).toFormat("yyyy-LL-dd'T'HH:mm");
export const fromInputValue = (value: string) => DateTime.fromISO(value, { zone }).toUTC().toISO();

export function greeting(now: number): string {
  const hour = zoneNow(now).hour;
  return hour >= 5 && hour < 12 ? 'صباح الخير' : 'مساء الخير';
}
