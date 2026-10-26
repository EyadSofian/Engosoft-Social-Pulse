import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapScheduleRows } from '../server/odoo';
import sharp from 'sharp';
import { photoCoversLogoCorner, POST_SIZES, POST_TEMPLATES, renderPosterSvg } from '../src/features/post-design/templates';
import logos from '../brand/logos.json';

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

test('export embeds the exact approved logo file with no plate behind it', () => {
  const href = 'data:image/svg+xml;base64,PHN2Zy8+';
  for (const template of POST_TEMPLATES) {
    const svg = renderPosterSvg(template, 'square', { title: 'دورة هندسية', eyebrow: 'دورة', body: '', cta: 'سجّل الآن' }, { 'lockup-positive': href, 'lockup-reversed': href });
    const logo = /<image data-brand-asset="([0-9a-f]{64})" data-logo-variant="(lockup-(?:positive|reversed))" href="([^"]+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/.exec(svg);
    assert.ok(logo, `${template.id} has no approved logo layer`);
    const variant = logos.variants.find((v) => v.id === logo[2])!;
    assert.equal(logo[1], variant.sha256);
    assert.equal(logo[3], href);
    assert.equal(Number(logo[7]), Math.round(Number(logo[6]) / variant.aspectRatio));
    assert.doesNotMatch(svg, /fill="#ffffff"\/><image data-brand-asset/, `${template.id} draws a plate behind the logo`);
  }
});

test('templates pick the positive lockup on light layouts and never put reversed artwork on white', () => {
  const light = POST_TEMPLATES.find((t) => t.layout === 'split')!, dark = POST_TEMPLATES.find((t) => t.layout === 'cover')!;
  assert.match(renderPosterSvg(light, 'square', { title: 'x', eyebrow: '', body: '', cta: '' }), /data-logo-variant="lockup-positive"/);
  assert.match(renderPosterSvg(dark, 'square', { title: 'x', eyebrow: '', body: '', cta: '' }), /data-logo-variant="lockup-reversed"/);
  assert.match(renderPosterSvg(light, 'facebook-wide', { title: 'x', eyebrow: '', body: '', cta: '' }), /data-logo-variant="symbol-positive"/);
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

test('photo-under-logo table matches what each layout actually draws in the logo corner', async () => {
  const red = `data:image/png;base64,${(await sharp({ create: { width: 64, height: 64, channels: 3, background: '#FF0000' } }).png().toBuffer()).toString('base64')}`;
  for (const sizeId of ['square', 'portrait', 'story', 'facebook-wide'] as const) {
    const size = POST_SIZES.find((entry) => entry.id === sizeId)!;
    const scale = size.width / 1080;
    for (const template of POST_TEMPLATES) {
      const svg = renderPosterSvg(template, sizeId, { title: 'x', eyebrow: '', body: '', cta: '', imageDataUrl: red }).replace(/<g data-logo-container[\s\S]*?<\/g>|<image data-brand-asset[^>]*\/>/, '');
      const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
      let photo = 0;
      for (let y = Math.round(40 * scale); y < Math.round(250 * scale); y++) for (let x = Math.round(40 * scale); x < Math.round(310 * scale); x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) photo++;
      }
      if (photo > 0) assert.ok(photoCoversLogoCorner(template.layout, sizeId), `${template.id} ${sizeId} draws photo under the logo but is not in the table`);
    }
  }
});

test('photo-covered logo corners get the approved white badge with the blue symbol', () => {
  const split = POST_TEMPLATES.find((t) => t.layout === 'split')!;
  const svg = renderPosterSvg(split, 'square', { title: 'x', eyebrow: '', body: '', cta: '', imageDataUrl: 'data:image/png;base64,AAAA' });
  assert.match(svg, /<g data-logo-container="white-circle"><circle [^>]*fill="#FFFFFF"\/><image [^>]*data-logo-variant="symbol-positive"/);
  assert.match(renderPosterSvg(split, 'square', { title: 'x', eyebrow: '', body: '', cta: '' }), /data-logo-variant="lockup-positive"/);
});
