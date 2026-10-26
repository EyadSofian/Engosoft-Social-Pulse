import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapScheduleRows } from '../server/odoo';
import { POST_SIZES, POST_TEMPLATES, renderPosterSvg } from '../src/features/post-design/templates';

test('every visual template exports valid dimensions for each supported format', () => {
  assert.equal(POST_TEMPLATES.length, 15);
  for (const template of POST_TEMPLATES) for (const size of POST_SIZES) {
    const svg = renderPosterSvg(template, size.id, { title: 'تعليم هندسي', eyebrow: 'ENGOSOFT', body: 'نص البوست', cta: 'سجّل الآن' });
    assert.match(svg, new RegExp(`width="${size.width}" height="${size.height}"`));
    assert.match(svg, /^<svg xmlns=/);
    assert.match(svg, /تعليم هندسي/);
    assert.match(svg, /<\/svg>$/);
  }
});

test('user text is escaped and left-to-right titles stay inside the canvas', () => {
  const svg = renderPosterSvg(POST_TEMPLATES[0], 'portrait', { title: 'Course <script>alert(1)</script>', eyebrow: 'A&B', body: '', cta: 'Start' });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /A&amp;B/);
  assert.match(svg, /direction="ltr" text-anchor="start"/);
});

test('Odoo schedule mapping drops rows without dates and names', () => {
  const rows = [{ id: 4, name: 'Webinar', date_begin: '2026-11-01 18:00:00', date_end: '2026-11-01 20:00:00' }, { id: 5, name: '', date_begin: '2026-11-01 18:00:00' }];
  assert.deepEqual(mapScheduleRows(rows, 'event.event', 'date_begin', 'date_end'), [{ id: 'event.event:4', title: 'Webinar', startsAt: '2026-11-01T18:00:00Z', endsAt: '2026-11-01T20:00:00Z', source: 'event.event' }]);
});
