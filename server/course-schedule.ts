/**
 * Course schedule posts ("جدول مواعيد دوراتنا خلال شهر …"): the monthly table marketing publishes on Facebook
 * and Instagram. Rows come from an uploaded CSV/XLSX (the same sheet operations already keep: Course Name, Type,
 * Start Date, Start Time KSA) or from the Odoo schedule. The rows are split over as many posts as they need and
 * each page is drawn here, in the brand fonts, at the exact size of each platform format (4:5, 1:1, 9:16) —
 * recomposed for the shape, never stretched. The look follows the approved Illustrator design: silver wave
 * background, black header bar, light rows with dark column rules, blue day and time, partner logos in the footer.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { parse as parseCsv } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { DateTime } from 'luxon';
import sharp from 'sharp';
import { z } from 'zod';
import { requirePermission, requireUser } from './auth.js';
import { BRAND } from './creative-intelligence/brand/registry.js';
import { measureText, outlineText, type TextStyle } from './creative-intelligence/typography/text-outline.js';
import { readOdooSchedule, type ScheduleEntry } from './odoo.js';
import { mediaDir } from './paths.js';
import { brandKit, kitFile } from '../src/domain/brand-kits.js';

export type ScheduleMode = 'online' | 'offline';
export interface ScheduleRow { course: string; date: string; time: string; mode: ScheduleMode; city: string }
export type ScheduleFormat = 'feed' | 'square' | 'story';
export const SCHEDULE_FORMATS: Record<ScheduleFormat, { width: number; height: number; presets: string[] }> = {
  feed: { width: 1080, height: 1350, presets: ['facebook-feed', 'instagram-feed'] },
  square: { width: 1080, height: 1080, presets: ['facebook-square', 'instagram-square'] },
  story: { width: 1080, height: 1920, presets: ['facebook-story', 'instagram-story'] },
};

/* ───────────────────────────── Reading the sheet ───────────────────────────── */

const HEADERS: Record<keyof ScheduleRow, string[]> = {
  course: ['course name', 'course', 'name', 'الدورة', 'اسم الدورة', 'الكورس', 'اسم الكورس'],
  mode: ['type', 'course type', 'mode', 'النوع', 'نوع الدورة', 'الحضور'],
  date: ['start date', 'date', 'التاريخ', 'تاريخ البدء', 'تاريخ البداية', 'يبدأ'],
  time: ['start time ksa', 'start time', 'time', 'time ksa', 'الوقت', 'وقت البدء', 'الساعة'],
  city: ['city', 'location', 'المدينة', 'المكان'],
};
const clean = (value: unknown) => (value instanceof Date ? '' : String(value ?? '')).replace(/\s+/g, ' ').trim();
const headerKey = (cell: unknown) => (Object.keys(HEADERS) as (keyof ScheduleRow)[]).find((key) => HEADERS[key].includes(clean(cell).toLowerCase().replace(/[_\-:]+/g, ' ').replace(/\s+/g, ' ')));

/** A day from a sheet cell: an Excel date, an ISO date, 2/11/2026 (day first), 2-Nov, 2 Nov 2026, Nov 2 2026. */
export function parseDay(value: unknown, year = DateTime.now().year): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 30000 && value < 80000) return DateTime.fromMillis(Math.round((value - 25569) * 86400000), { zone: 'utc' }).toISODate();
  const text = clean(value).replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  if (!text) return null;
  for (const format of ['yyyy-MM-dd', 'yyyy/M/d', 'd/M/yyyy', 'd-M-yyyy', 'd.M.yyyy', 'd-MMM-yyyy', 'd MMM yyyy', 'd MMMM yyyy', 'MMM d yyyy', 'MMMM d yyyy', 'MMM d, yyyy', 'MMMM d, yyyy']) {
    const day = DateTime.fromFormat(text, format, { locale: 'en' });
    if (day.isValid) return day.toISODate();
  }
  for (const format of ['d-MMM', 'd MMM', 'd MMMM', 'MMM d', 'MMMM d', 'd/M']) {
    const day = DateTime.fromFormat(text, format, { locale: 'en' });
    if (day.isValid) return day.set({ year }).toISODate();
  }
  return null;
}

/** A start time as HH:mm: an Excel time, 0.8333, 20:00, 7:00 PM KSA, 6.30 PM, 7 م. */
export function parseTime(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  if (typeof value === 'number' && value >= 0 && value < 1) { const minutes = Math.round(value * 1440); return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
  const text = clean(value).toLowerCase().replace(/ksa|saudi|riyadh|بتوقيت السعودية|بتوقيت مكة|السعودية/g, '');
  const match = text.match(/(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|ص|م|صباحا|صباحًا|مساء|مساءً)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3] ?? '';
  if (/^(p|م|مساء)/.test(meridiem) && hour < 12) hour += 12;
  if (/^(a|ص|صباح)/.test(meridiem) && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export const parseMode = (value: unknown): ScheduleMode => (/off|حضور|onsite|on-site|in.?person|classroom/i.test(clean(value)) ? 'offline' : 'online');

const byDate = (a: ScheduleRow, b: ScheduleRow) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

/** Rows from a sheet. Finds the header row by its names (English or Arabic); without one, reads Course, Type, Date, Time in that order. */
export function scheduleFromSheet(table: unknown[][], year?: number): { rows: ScheduleRow[]; errors: string[] } {
  const headerAt = table.findIndex((row) => row.some((cell) => headerKey(cell) === 'course'));
  const columns: Partial<Record<keyof ScheduleRow, number>> = headerAt >= 0
    ? Object.fromEntries(table[headerAt].flatMap((cell, index) => { const key = headerKey(cell); return key ? [[key, index]] : []; }))
    : { course: 0, mode: 1, date: 2, time: 3, city: 4 };
  const rows: ScheduleRow[] = [], errors: string[] = [];
  table.slice(headerAt + 1).forEach((line, i) => {
    const at = (key: keyof ScheduleRow) => (columns[key] === undefined ? undefined : line[columns[key]!]);
    const course = clean(at('course'));
    if (!course && !clean(at('date')) && !(at('date') instanceof Date)) return;
    const n = headerAt + i + 2;
    const date = parseDay(at('date'), year);
    const time = parseTime(at('time'));
    if (!course) { errors.push(`صف ${n}: اسم الدورة فاضي.`); return; }
    if (!date) { errors.push(`صف ${n} (${course}): التاريخ «${clean(at('date'))}» مش مفهوم — اكتبه 2026-11-03.`); return; }
    if (!time) { errors.push(`صف ${n} (${course}): الوقت «${clean(at('time'))}» مش مفهوم — اكتبه 7:00 PM.`); return; }
    rows.push({ course, date, time, mode: parseMode(at('mode')), city: clean(at('city')) });
  });
  return { rows: rows.sort(byDate), errors };
}

export async function parseScheduleFile(buffer: Buffer, filename: string): Promise<{ rows: ScheduleRow[]; errors: string[] }> {
  const name = filename.toLowerCase();
  if (name.endsWith('.csv')) return scheduleFromSheet(parseCsv(buffer.toString('utf8').replace(/^﻿/, ''), { skip_empty_lines: true, relax_quotes: true, relax_column_count: true }) as unknown[][]);
  if (name.endsWith('.xlsx')) return scheduleFromSheet(await readSheet(buffer, 1) as unknown[][]);
  return { rows: [], errors: ['ارفع ملف CSV أو XLSX.'] };
}

/** The month's runs from the Odoo schedule: a run with a location is in person in that city, otherwise online. */
export function scheduleFromOdoo(events: ScheduleEntry[], month: string, zone = 'Asia/Riyadh'): ScheduleRow[] {
  return events.flatMap((event) => {
    const start = DateTime.fromISO(event.startsAt, { zone: 'utc' }).setZone(zone);
    if (!start.isValid || start.toFormat('yyyy-MM') !== month) return [];
    const city = (event.location ?? '').split(/[,،\n]/)[0].trim();
    return [{ course: event.title.replace(/\s+/g, ' ').trim(), date: start.toISODate()!, time: start.toFormat('HH:mm'), mode: city ? 'offline' as const : 'online' as const, city }];
  }).sort(byDate);
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/** «شهر نوفمبر» for the month most rows fall in. */
export function monthHighlight(rows: ScheduleRow[]): string {
  const counts = new Map<number, number>();
  for (const row of rows) { const m = Number(row.date.slice(5, 7)); counts.set(m, (counts.get(m) ?? 0) + 1); }
  const month = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return month ? `شهر ${AR_MONTHS[month - 1]}` : '';
}

/* ───────────────────────────── Layout ───────────────────────────── */

interface Spec { side: number; top: number; bottom: number; unit: number; s: number; bgTop: number }
/** Per shape: page margins, the platform-safe band (story), the row height and the type scale. */
const SPECS: Record<ScheduleFormat, Spec> = {
  feed: { side: 42, top: 40, bottom: 36, unit: 64, s: 1, bgTop: 120 },
  square: { side: 96, top: 34, bottom: 30, unit: 56, s: 0.9, bgTop: 120 },
  story: { side: 42, top: 230, bottom: 300, unit: 76, s: 1.06, bgTop: 0 },
};
const COLUMNS = [0.378, 0.148, 0.15, 0.324];
const TITLE = 'جدول مواعيد دوراتنا خلال';
const BLUE = BRAND.colors.core.brandBlue.hex;
const NAVY = BRAND.colors.core.brandDarkBlue.hex;
const INK = BRAND.colors.core.neutralDark.hex;
const GREY = '#4A4F57';
const GREEN = '#4CFF7A';

function geometry(format: ScheduleFormat) {
  const { width: W, height: H } = SCHEDULE_FORMATS[format];
  const spec = SPECS[format];
  const s = spec.s;
  const tableX = spec.side, tableW = W - spec.side * 2;
  const footerH = 128 * s;
  const footerTop = H - spec.bottom - footerH;
  const titleH = 150 * s, headerH = 50 * s, gap = 26 * s;
  return { W, H, spec, s, tableX, tableW, footerTop, titleH, headerH, gap, rowsMax: footerTop - 26 * s - (spec.top + titleH + gap + headerH) };
}

const nameStyle = (s: number): TextStyle => ({ family: 'Plus Jakarta Sans', weight: 800, size: 25 * s, color: INK });
/**
 * Where a course name breaks: whole on one line when it fits. Otherwise before a connecting word (Using, for,
 * with…) when both parts fit, else after the shortest start whose rest fits — the designers' «Automotive /
 * Mechanicals & Electrical» and «Interior Design / Using SketchUp & Canva».
 */
export function splitCourseName(name: string, width: number, s = 1): [string, string?] {
  const fits = (text: string, weight = 800) => measureText(text, { ...nameStyle(s), weight, size: (weight === 800 ? 25 : 24) * s }, 'ltr') <= width;
  if (fits(name)) return [name];
  const words = name.split(' ');
  if (words.length < 2) return [name];
  const options = words.slice(1).map((_, i) => [words.slice(0, i + 1).join(' '), words.slice(i + 1).join(' ')] as [string, string]).filter(([a, b]) => fits(a) && fits(b, 650));
  const connector = options.find(([, b]) => /^(using|for|with|in|and|of|on|via|by|to)\b/i.test(b));
  return connector ?? options[0] ?? [words[0], words.slice(1).join(' ')];
}

const isTall = (row: ScheduleRow, nameWidth: number, s: number) => row.mode === 'offline' || splitCourseName(row.course, nameWidth, s).length > 1;
const rowHeight = (row: ScheduleRow, format: ScheduleFormat) => {
  const g = geometry(format);
  return (isTall(row, g.tableW * COLUMNS[0] - 44 * g.s, g.s) ? 1.62 : 1) * g.spec.unit * g.s;
};

/** Splits the rows over pages: as few pages as fit, then balanced so the last post is not a stub. */
export function paginate(rows: ScheduleRow[], format: ScheduleFormat): ScheduleRow[][] {
  const max = geometry(format).rowsMax;
  const heights = rows.map((row) => rowHeight(row, format));
  let count = 0;
  for (let i = 0, used = Infinity; i < rows.length; i++) { if (used + heights[i] > max) { count++; used = 0; } used += heights[i]; }
  if (!rows.length) return [];
  for (let pages = count; pages <= rows.length; pages++) {
    const target = heights.reduce((a, b) => a + b, 0) / pages;
    const out: ScheduleRow[][] = [];
    let page: ScheduleRow[] = [], used = 0, ok = true;
    rows.forEach((row, i) => {
      const remainingPages = pages - out.length - 1;
      if (page.length && (used + heights[i] > max || (used + heights[i] / 2 > target && remainingPages > 0))) { out.push(page); page = []; used = 0; }
      page.push(row); used += heights[i];
      if (used > max) ok = false;
    });
    out.push(page);
    if (ok && out.length <= pages && out.every((p) => p.reduce((sum, row) => sum + rowHeight(row, format), 0) <= max)) return out;
  }
  return rows.map((row) => [row]);
}

/* ───────────────────────────── Drawing ───────────────────────────── */

const r = (n: number) => Math.round(n * 10) / 10;
const ASSET = (file: string) => resolve(process.cwd(), 'public/post-assets', file);
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Text runs on one baseline, laid out from x (or centred on it). Returns the SVG and the total width. */
function runs(parts: { text: string; style: TextStyle; gap?: number }[], x: number, top: number, align: 'start' | 'center' = 'start') {
  const widths = parts.map((p) => measureText(p.text, p.style, 'ltr'));
  const total = widths.reduce((a, w, i) => a + w + (parts[i].gap ?? 0), 0);
  let pen = align === 'center' ? x - total / 2 : x;
  const maxSize = Math.max(...parts.map((p) => p.style.size));
  return parts.map((p, i) => {
    // Align baselines: smaller runs sit lower by the difference in ascent (~0.95 em for these fonts).
    const y = top + (maxSize - p.style.size) * 0.95;
    const svg = outlineText({ text: p.text, x: pen, y, width: widths[i] + 2, direction: 'ltr', maxLines: 1, style: p.style }).svg;
    pen += widths[i] + (p.gap ?? 0);
    return svg;
  }).join('');
}

export interface SchedulePageInput { rows: ScheduleRow[]; format: ScheduleFormat; title?: string; highlight?: string; defaultCity?: string; website?: string }

export async function renderSchedulePage(input: SchedulePageInput): Promise<Buffer> {
  const g = geometry(input.format);
  const { W, H, s, tableX, tableW, spec } = g;
  const title = (input.title ?? TITLE).trim() || TITLE;
  const highlight = (input.highlight ?? monthHighlight(input.rows)).trim();
  const heights = input.rows.map((row) => rowHeight(row, input.format));
  const tableH = g.headerH + heights.reduce((a, b) => a + b, 0);
  // A page with fewer rows centres its title and table in the space between the top and the footer.
  const blockH = g.titleH + g.gap + tableH;
  const free = g.footerTop - 26 * s - spec.top - blockH;
  const top = spec.top + Math.max(0, free / 2);
  const parts: string[] = [];
  const defs = `<defs><linearGradient id="row" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F8F9"/><stop offset="1" stop-color="#E7E9EC"/></linearGradient><linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="shadow" x="-5%" y="-5%" width="110%" height="115%"><feGaussianBlur in="SourceAlpha" stdDeviation="${r(7 * s)}"/><feOffset dx="${r(4 * s)}" dy="${r(6 * s)}"/><feComponentTransfer><feFuncA type="linear" slope="0.32"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

  // Title: right-aligned Arabic headline, the month on a green highlight below it.
  const titleSize = 50 * s;
  const right = W - spec.side;
  parts.push(outlineText({ text: title, x: right - 760 * s, y: top + 12 * s, width: 760 * s, align: 'start', direction: 'rtl', maxLines: 1, style: { family: 'Almarai', weight: 800, size: titleSize, color: NAVY } }).svg);
  if (highlight) {
    const hiStyle: TextStyle = { family: 'Almarai', weight: 800, size: 40 * s, color: INK };
    const hiW = measureText(highlight, hiStyle, 'rtl');
    const boxW = hiW + 56 * s, boxH = 58 * s, boxX = right - 70 * s - boxW, boxY = top + 82 * s;
    parts.push(`<rect x="${r(boxX)}" y="${r(boxY)}" width="${r(boxW)}" height="${r(boxH)}" fill="${GREEN}"/>`);
    parts.push(outlineText({ text: highlight, x: boxX + 28 * s, y: boxY + 9 * s, width: hiW + 2, direction: 'rtl', maxLines: 1, style: hiStyle }).svg);
  }

  // Table: one shadowed group — header bar, rows, then the dark column rules over them.
  const tableY = top + g.titleH + g.gap;
  const colX = COLUMNS.reduce<number[]>((xs, w) => [...xs, xs[xs.length - 1] + w * tableW], [tableX]);
  const table: string[] = [`<rect x="${r(tableX)}" y="${r(tableY)}" width="${r(tableW)}" height="${r(g.headerH)}" fill="${INK}"/>`];
  const head: TextStyle = { family: 'Plus Jakarta Sans', weight: 700, size: 23 * s, color: '#FFFFFF' };
  ['Course Name', 'Date', 'Course type', 'Time'].forEach((label, i) => table.push(runs([{ text: label, style: head }], (colX[i] + colX[i + 1]) / 2, tableY + 12 * s, 'center')));
  let y = tableY + g.headerH;
  const nameWidth = tableW * COLUMNS[0] - 44 * s;
  input.rows.forEach((row, i) => {
    const h = heights[i];
    table.push(`<rect x="${r(tableX)}" y="${r(y)}" width="${r(tableW)}" height="${r(h)}" fill="url(#row)"/><rect x="${r(tableX)}" y="${r(y)}" width="${r(tableW)}" height="${r(h * 0.5)}" fill="url(#sheen)"/><rect x="${r(tableX)}" y="${r(y + h - 3 * s)}" width="${r(tableW)}" height="${r(3 * s)}" fill="#C4C8CE"/>`);
    const mid = y + h / 2;
    // Course name: one bold line, or the bold start and a lighter second line.
    const [first, second] = splitCourseName(row.course, nameWidth, s);
    const ns = nameStyle(s);
    if (second) {
      table.push(runs([{ text: first, style: ns }], colX[0] + 26 * s, mid - 31 * s));
      table.push(runs([{ text: second, style: { ...ns, weight: 650, size: 24 * s, color: GREY } }], colX[0] + 26 * s, mid + 3 * s));
    } else table.push(runs([{ text: first, style: ns }], colX[0] + 26 * s, mid - 15 * s));
    // Date: the day in blue, the month in capitals.
    const day = DateTime.fromISO(row.date);
    table.push(runs([{ text: String(day.day), style: { family: 'Plus Jakarta Sans', weight: 800, size: 29 * s, color: BLUE }, gap: 7 * s }, { text: MONTH_ABBR[day.month - 1], style: { family: 'Plus Jakarta Sans', weight: 700, size: 21 * s, color: INK } }], (colX[1] + colX[2]) / 2, mid - 17 * s, 'center'));
    // Type: Online, or Offline with the city in italics below.
    const typeStyle: TextStyle = { family: 'Plus Jakarta Sans', weight: 800, size: 24 * s, color: INK };
    const city = row.city || input.defaultCity || '';
    if (row.mode === 'offline' && city) {
      table.push(runs([{ text: 'Offline', style: typeStyle }], (colX[2] + colX[3]) / 2, mid - 30 * s, 'center'));
      table.push(runs([{ text: city, style: { family: 'Plus Jakarta Sans', weight: 500, size: 21 * s, color: GREY, italic: true } }], (colX[2] + colX[3]) / 2, mid + 3 * s, 'center'));
    } else table.push(runs([{ text: row.mode === 'offline' ? 'Offline' : 'Online', style: typeStyle }], (colX[2] + colX[3]) / 2, mid - 15 * s, 'center'));
    // Time: 7:30 PM . KSA
    const [hh, mm] = row.time.split(':').map(Number);
    const clock = `${hh % 12 || 12}:${String(mm).padStart(2, '0')}`;
    table.push(runs([{ text: clock, style: { family: 'Plus Jakarta Sans', weight: 800, size: 29 * s, color: BLUE }, gap: 8 * s }, { text: hh < 12 ? 'AM' : 'PM', style: { family: 'Plus Jakarta Sans', weight: 800, size: 21 * s, color: BLUE }, gap: 6 * s }, { text: '. KSA', style: { family: 'Plus Jakarta Sans', weight: 700, size: 21 * s, color: INK } }], colX[3] + 42 * s, mid - 17 * s));
    y += h;
  });
  for (const x of colX.slice(1, -1)) table.push(`<rect x="${r(x - 1.2 * s)}" y="${r(tableY + g.headerH)}" width="${r(2.4 * s)}" height="${r(y - tableY - g.headerH)}" fill="${INK}"/>`);
  parts.push(`<g filter="url(#shadow)">${table.join('')}</g>`);

  // Footer: the website, then the payment partners (left) and the accreditation logos (right).
  const website = input.website ?? 'www.engosoft.com';
  parts.push(runs([{ text: website, style: { family: 'Plus Jakarta Sans', weight: 700, size: 31 * s, color: INK } }], spec.side + 46 * s, g.footerTop + 6 * s));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${parts.join('')}</svg>`;

  const bg = await sharp(ASSET('schedule-bg.jpg')).extract({ left: 0, top: spec.bgTop, width: W, height: H }).toBuffer();
  const logoH = Math.round(96 * s);
  const logo = await sharp(readFileSync(resolve(process.cwd(), 'public', kitFile(brandKit('official'), { mark: 'lockup', onDark: false }).src.slice(1))), { density: 600 }).resize({ height: logoH }).png().toBuffer();
  const payments = await sharp(ASSET('schedule-payments.png')).resize({ height: Math.round(58 * s) }).png().toBuffer();
  const partners = await sharp(ASSET('schedule-partners.png')).resize({ height: Math.round(112 * s) }).png().toBuffer();
  const pm = await sharp(partners).metadata();
  const footerBottom = H - spec.bottom;
  return sharp(bg).composite([
    { input: Buffer.from(svg), left: 0, top: 0 },
    { input: logo, left: Math.round(spec.side + 8 * s), top: Math.round(spec.top) },
    { input: payments, left: Math.round(spec.side + 12 * s), top: Math.round(footerBottom - 58 * s) },
    { input: partners, left: Math.round(W - spec.side - pm.width!), top: Math.round(footerBottom - pm.height!) },
  ]).png().toBuffer();
}

/** Renders every page of a schedule in each requested format. */
export async function renderSchedule(input: Omit<SchedulePageInput, 'format'> & { formats: ScheduleFormat[] }): Promise<Record<ScheduleFormat, Buffer[]>> {
  const out = {} as Record<ScheduleFormat, Buffer[]>;
  for (const format of input.formats) {
    const pages = paginate([...input.rows].sort(byDate), format);
    out[format] = await Promise.all(pages.map((rows) => renderSchedulePage({ ...input, rows, format })));
  }
  return out;
}

/* ───────────────────────────── Routes ───────────────────────────── */

const rowSchema = z.object({ course: z.string().trim().min(1).max(120), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), mode: z.enum(['online', 'offline']), city: z.string().trim().max(40).default('') });
const renderRequest = z.object({
  rows: z.array(rowSchema).min(1).max(80), formats: z.array(z.enum(['feed', 'square', 'story'])).min(1).max(3),
  title: z.string().trim().max(60).optional(), highlight: z.string().trim().max(40).optional(), defaultCity: z.string().trim().max(40).optional(),
});

export function registerScheduleRoutes(app: express.Express) {
  // The sheet operations already keep (CSV or XLSX), read into rows; nothing is saved.
  app.post('/api/schedule/parse', requireUser, requirePermission('design.templates'), express.raw({ type: 'application/octet-stream', limit: '8mb' }), async (req, res) => {
    let filename = 'schedule.csv';
    try { filename = decodeURIComponent(String(req.header('X-Filename') || filename)).slice(0, 160); } catch { /* keep the default */ }
    try {
      const parsed = await parseScheduleFile(req.body as Buffer, filename);
      if (!parsed.rows.length) return res.status(400).json({ error: 'مالقيناش صفوف صالحة في الملف.', errors: parsed.errors });
      res.json({ ...parsed, highlight: monthHighlight(parsed.rows) });
    } catch { res.status(400).json({ error: 'تعذّر قراءة الملف. استخدم القالب CSV أو XLSX.' }); }
  });
  // The month's runs from Odoo, as rows to review.
  app.get('/api/schedule/odoo', requireUser, requirePermission('design.templates'), async (req, res) => {
    const month = String(req.query.month ?? '');
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'اختر الشهر.' });
    const odoo = await readOdooSchedule();
    if (odoo.status !== 'connected') return res.status(503).json({ error: odoo.message || 'Odoo غير متصل.' });
    const rows = scheduleFromOdoo(odoo.events, month, process.env.BUSINESS_TIME_ZONE?.trim() || 'Asia/Riyadh');
    res.json({ rows, highlight: monthHighlight(rows), errors: [] });
  });
  // Draws the pages and stores them as uploads, so they can become a post, a carousel or a download.
  app.post('/api/schedule/render', requireUser, requirePermission('design.templates'), async (req, res) => {
    const parsed = renderRequest.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'راجع الصفوف: لكل دورة اسم وتاريخ ووقت.' });
    try {
      const pages = await renderSchedule(parsed.data);
      const dir = mediaDir('uploads');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const urls = Object.fromEntries(Object.entries(pages).map(([format, list]) => [format, list.map((png) => {
        const id = randomUUID();
        writeFileSync(resolve(dir, `${id}.png`), png);
        return `/api/uploads/${id}.png`;
      })]));
      res.json({ pages: urls });
    } catch (error) { res.status(500).json({ error: `تعذّر رسم الجدول: ${error instanceof Error ? error.message : ''}` }); }
  });
}
