import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { monthHighlight, paginate, parseDay, parseScheduleFile, parseTime, renderSchedulePage, scheduleFromOdoo, scheduleFromSheet, splitCourseName, type ScheduleRow } from '../server/course-schedule';

test('times are read the way operations type them', () => {
  assert.equal(parseTime('7:00 PM KSA'), '19:00');
  assert.equal(parseTime('6.30 PM'), '18:30');
  assert.equal(parseTime('10:30 am'), '10:30');
  assert.equal(parseTime('12:00 PM'), '12:00');
  assert.equal(parseTime('7 م'), '19:00');
  assert.equal(parseTime(new Date(Date.UTC(1899, 11, 30, 20, 0))), '20:00', 'an Excel time cell');
  assert.equal(parseTime(0.8125), '19:30', 'an Excel time fraction');
  assert.equal(parseTime('soon'), null);
});

test('days are read from Excel dates and common spellings', () => {
  assert.equal(parseDay(new Date(Date.UTC(2026, 10, 2))), '2026-11-02');
  assert.equal(parseDay('2026-11-08'), '2026-11-08');
  assert.equal(parseDay('8/11/2026'), '2026-11-08', 'day first');
  assert.equal(parseDay('2-Nov', 2026), '2026-11-02');
  assert.equal(parseDay('Nov 24, 2026'), '2026-11-24');
  assert.equal(parseDay(46328), '2026-11-02', 'an Excel serial day');
  assert.equal(parseDay('next week'), null);
});

test('a sheet with Arabic headers, stray spaces and a bad row gives sorted rows and a clear error', () => {
  const { rows, errors } = scheduleFromSheet([
    ['جدول نوفمبر'],
    ['الدورة', 'النوع', 'التاريخ', 'الوقت', 'المدينة'],
    ['PMP', 'Online', '2026-11-15', '7:00 PM KSA', ''],
    ['AI Tools', ' Offline', '2026-11-10', '9:00 AM', 'Jeddah'],
    ['', '', '', '', ''],
    ['CFM', 'Online', 'soon', '7:30 PM', ''],
  ]);
  assert.deepEqual(rows.map((r) => [r.course, r.date, r.time, r.mode, r.city]), [['AI Tools', '2026-11-10', '09:00', 'offline', 'Jeddah'], ['PMP', '2026-11-15', '19:00', 'online', '']]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /صف 6 \(CFM\)/);
  assert.equal(monthHighlight(rows), 'شهر نوفمبر');
});

test('the downloadable templates read back without errors', async () => {
  for (const file of ['public/templates/course-schedule-template.xlsx', 'public/templates/course-schedule-template.csv']) {
    const { rows, errors } = await parseScheduleFile(readFileSync(file), file);
    assert.equal(rows.length, 4, file);
    assert.deepEqual(errors, []);
    assert.equal(rows.find((r) => r.mode === 'offline')?.city, 'Riyadh');
  }
});

test('long course names break like the approved design', () => {
  assert.deepEqual(splitCourseName('AutoCad', 330), ['AutoCad']);
  assert.deepEqual(splitCourseName('Automotive Mechanicals & Electrical', 330), ['Automotive', 'Mechanicals & Electrical']);
  assert.deepEqual(splitCourseName('Interior Design Using SketchUp & Canva', 330), ['Interior Design', 'Using SketchUp & Canva']);
});

const month = (n: number, offlineEvery = 3): ScheduleRow[] => Array.from({ length: n }, (_, i) => ({ course: i % 5 === 0 ? 'Interior Design Using SketchUp & Canva' : `Course ${i + 1}`, date: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`, time: '19:00', mode: i % offlineEvery === 0 ? 'offline' : 'online', city: '' }));

test('a month is split over balanced pages, in order, each within the page', () => {
  const rows = month(31);
  for (const format of ['feed', 'square', 'story'] as const) {
    const pages = paginate(rows, format);
    assert.ok(pages.length >= 2, `${format}: more than one post`);
    assert.deepEqual(pages.flat(), rows, `${format}: every row once, in order`);
    const sizes = pages.map((p) => p.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 4, `${format}: balanced, got ${sizes.join('/')}`);
  }
  assert.equal(paginate(month(6), 'feed').length, 1, 'a short month is one post');
});

test('every page is drawn at the exact platform size', async () => {
  const rows = month(8);
  for (const [format, size] of [['feed', [1080, 1350]], ['square', [1080, 1080]], ['story', [1080, 1920]]] as const) {
    const png = await renderSchedulePage({ rows, format, defaultCity: 'Riyadh' });
    const meta = await sharp(png).metadata();
    assert.deepEqual([meta.width, meta.height], size, format);
  }
});

test('Odoo runs of the month become rows: a run with an address is in person in that city', () => {
  const rows = scheduleFromOdoo([
    { id: 'event.event:1', title: 'AutoCad  Basics', startsAt: '2026-11-02T17:00:00Z', endsAt: '2026-11-02T19:00:00Z', source: 'event.event' },
    { id: 'event.event:2', title: 'AI Tools', startsAt: '2026-11-10T06:00:00Z', endsAt: '2026-11-10T09:00:00Z', source: 'event.event', location: 'Riyadh, Olaya St.' },
    { id: 'event.event:3', title: 'PMP', startsAt: '2026-12-01T16:00:00Z', endsAt: '2026-12-01T18:00:00Z', source: 'event.event' },
  ], '2026-11');
  assert.deepEqual(rows.map((r) => [r.course, r.date, r.time, r.mode, r.city]), [['AutoCad Basics', '2026-11-02', '20:00', 'online', ''], ['AI Tools', '2026-11-10', '09:00', 'offline', 'Riyadh']]);
});
