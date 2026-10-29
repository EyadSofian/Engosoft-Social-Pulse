import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// A throwaway database; store.ts reads DATA_FILE when first imported.
process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'sp-sizes-')), 'test.sqlite');
const auth = await import('../server/auth');
const ws = await import('../server/workspace');
await (await import('../server/db')).initDb();
const { canvasOf, isCanvasTarget, compileFullCreativePrompt } = await import('../server/creative-intelligence/generation/full-creative');
const { recreatePrompt, referenceAdaptPrompt } = await import('../server/reference-designs');
const { PUBLISHING_PRESETS, canvasBrief, presetsFor, publishingPreset, shapeOf } = await import('../src/domain/output-presets');

const maker = await auth.createUser({ email: 'sizes@engosoft.test', name: 'Maker', role: 'creator', departmentId: 'operations', password: 'sizes-password-1' });
const creative = { requestId: '00000000-0000-0000-0000-000000000000', directionId: 'd1', imageUrl: '/api/creatives/00000000-0000-0000-0000-000000000000/d1.png' };

test('every publishing size is a canvas the AI pipeline can target, at its exact output size', () => {
  for (const preset of PUBLISHING_PRESETS) {
    assert.ok(isCanvasTarget(preset.id), preset.id);
    const canvas = canvasOf(preset.id);
    assert.deepEqual(canvas.output, { width: preset.width, height: preset.height });
    assert.equal(canvas.generation, preset.generation);
    assert.equal(canvas.vertical, preset.format === 'story');
  }
  assert.equal(canvasOf('story').vertical, true);
  assert.equal(isCanvasTarget('pinterest-pin'), false);
  assert.throws(() => canvasOf('pinterest-pin'));
});

test('each shape gets its own layout brief, and covers keep content out of the cropped edges', () => {
  assert.equal(shapeOf(1080, 1920), 'vertical');
  assert.equal(shapeOf(1080, 1350), 'portrait');
  assert.equal(shapeOf(1080, 1080), 'square');
  assert.equal(shapeOf(1600, 900), 'landscape');
  assert.equal(shapeOf(1500, 500), 'banner');
  const header = canvasBrief(publishingPreset('x-header')!);
  assert.match(header, /Very wide banner/);
  assert.match(header, /top 12%, bottom 22%/);
  assert.match(canvasBrief(publishingPreset('instagram-story')!), /Full-screen vertical/);
  assert.deepEqual(presetsFor(['x']).map((p) => p.id), ['x-landscape', 'x-square', 'x-portrait', 'x-header']);
});

test('recomposing for a size asks for a new layout of the same design, never a stretch', () => {
  const brief = { language: 'ar' as const, objective: 'Registration', audience: 'engineers', caption: '', captions: { facebook: '', instagram: '', whatsapp: '', linkedin: '', tiktok: '', snapchat: '', website: '' }, canonicalCopy: { headline: 'قُد مرافقك', cta: 'سجّل الآن' },
    directions: [{ id: 'd1', name: 'Authority', concept: 'c', subject: 's', composition: 'x', palette: 'p', typography: 't', mood: 'm' }] };
  const prompt = compileFullCreativePrompt(brief, brief.directions[0], 'linkedin-event');
  assert.match(prompt, /linkedin Event cover, 1600×900 px\. Landscape canvas/);
  // A vertical size reserves its own interface zones (13% / 20% for the publishing story inset).
  assert.match(compileFullCreativePrompt(brief, brief.directions[0], 'tiktok-photo'), /top 13% and bottom 20%/);
  const template = { fields: [{ key: 'title', label: 'Headline', type: 'text' }] } as never;
  const adapt = referenceAdaptPrompt(template, { title: 'دورة CFM' }, publishingPreset('facebook-page-cover')!);
  assert.match(adapt, /do not stretch, squash or simply crop/);
  assert.match(adapt, /never put it inside a frame/);
  assert.match(adapt, /"دورة CFM"/);
});

test('templates and uploads are designed again at the new size, never framed, and never redraw the logo', () => {
  const fromTemplate = recreatePrompt(publishingPreset('linkedin-article')!, ['دورة CFM', 'سجّل الآن'], true);
  assert.match(fromTemplate, /NEW design built natively for the canvas/);
  assert.match(fromTemplate, /Rebuild the layout from scratch/);
  assert.match(fromTemplate, /Never place the old design inside a frame, card or box, never add blurred, mirrored or repeated copies/);
  assert.match(fromTemplate, /\["دورة CFM","سجّل الآن"\]/);
  assert.match(fromTemplate, /do NOT redraw it or any logo/);
  const fromUpload = recreatePrompt(publishingPreset('x-header')!, [], false);
  assert.match(fromUpload, /Keep exactly the words already in the design/);
  assert.match(fromUpload, /Very wide banner/);
  assert.doesNotMatch(fromUpload, /contains the Engosoft logo/);
});

test('a size is saved on the post, feeds an empty publishing slot, and a new design version clears stale sizes', async () => {
  const item = await ws.createContent(maker, { title: 'CFM sizes', channels: ['instagram', 'x'], captions: {}, creative });
  const story = '/api/uploads/00000000-0000-4000-a000-000000000001.png';
  const header = '/api/uploads/00000000-0000-4000-a000-000000000002.png';
  let saved = await ws.setContentSize(maker, item.id, 'instagram-story', story);
  assert.equal(saved.creative?.sizes?.['instagram-story'], story);
  assert.equal(saved.creative?.storyUrl, story, 'the story slot was empty, so the new size fills it');
  saved = await ws.setContentSize(maker, item.id, 'x-header', header);
  assert.deepEqual(Object.keys(saved.creative!.sizes!).sort(), ['instagram-story', 'x-header']);
  saved = await ws.setContentSize(maker, item.id, 'x-header', null);
  assert.deepEqual(Object.keys(saved.creative!.sizes!), ['instagram-story']);
  await ws.addVersion(maker, item.id, { imageUrl: '/api/uploads/00000000-0000-4000-a000-000000000003.png', storyUrl: null, studio: null, note: 'New design' });
  assert.equal((await ws.getContent(item.id))!.creative?.sizes, undefined);
});

test('on a wide banner the logo is sized from the height, not half the banner', async () => {
  const sharp = (await import('sharp')).default;
  const { resolveLogo } = await import('../server/creative-intelligence/logo-resolution/resolver');
  const banner = await sharp({ create: { width: 1500, height: 500, channels: 3, background: { r: 0, g: 70, b: 255 } } }).png().toBuffer();
  const decision = await resolveLogo({ creative: banner, zones: [], preferredCorner: 'top-left', preferredMark: 'lockup', safeArea: publishingPreset('x-header')!.safe });
  assert.ok(!decision.requiresCreativeRepair);
  if (!decision.requiresCreativeRepair) assert.ok(decision.placement.height <= 500 * 0.3, `logo height ${decision.placement.height}`);
  const square = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: { r: 0, g: 70, b: 255 } } }).png().toBuffer();
  const feed = await resolveLogo({ creative: square, zones: [], preferredCorner: 'top-left', preferredMark: 'lockup' });
  if (!feed.requiresCreativeRepair) assert.ok(feed.placement.width >= 1080 * 0.23, 'non-banner sizes keep their logo size');
});
