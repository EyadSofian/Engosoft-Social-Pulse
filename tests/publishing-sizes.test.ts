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
  assert.match(prompt, /linkedin Event cover 16:9, 1600×900 px\. The cover of a LinkedIn event page[^.]*\. Landscape canvas/);
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

test('every size is drawn at a canvas the image API accepts, never upscaled, with the same shape', async () => {
  const { IMAGE_API, generationSizeFor } = await import('../src/domain/output-presets');
  for (const preset of PUBLISHING_PRESETS) {
    const drawn = generationSizeFor(preset.width, preset.height);
    assert.equal(preset.generation, drawn.size, preset.id);
    assert.equal(drawn.width % IMAGE_API.step, 0, preset.id);
    assert.equal(drawn.height % IMAGE_API.step, 0, preset.id);
    assert.ok(Math.max(drawn.width, drawn.height) <= IMAGE_API.maxEdge, preset.id);
    assert.ok(Math.max(drawn.width / drawn.height, drawn.height / drawn.width) <= IMAGE_API.maxRatio, preset.id);
    assert.ok(drawn.width * drawn.height >= IMAGE_API.minPixels && drawn.width * drawn.height <= IMAGE_API.maxPixels, preset.id);
    assert.ok(drawn.width >= preset.width && drawn.height >= preset.height, `${preset.id} would be upscaled`);
    if (drawn.band) assert.ok(preset.width / preset.height > IMAGE_API.maxRatio, preset.id);
    else assert.ok(Math.abs(drawn.width / drawn.height / (preset.width / preset.height) - 1) <= 0.005, `${preset.id} ${drawn.size}`);
  }
  // Only the 4K thumbnail needs the experimental range above 2560×1440.
  assert.deepEqual(PUBLISHING_PRESETS.filter((p) => generationSizeFor(p.width, p.height).experimental).map((p) => p.id), ['youtube-thumbnail']);
  assert.equal(generationSizeFor(1080, 1350).size, '1088x1360');
  assert.equal(generationSizeFor(1920, 1080).size, '1936x1088', 'a 16:9 cover is drawn at full size, not 1536×864 blown up');
});

test('LinkedIn has every official size, and covers wider than 3:1 are designed for the band that is kept', async () => {
  const { coverWindow, generationSizeFor } = await import('../src/domain/output-presets');
  assert.deepEqual(presetsFor(['linkedin']).map((p) => `${p.id} ${p.width}x${p.height}`), [
    'linkedin-feed 1080x1350', 'linkedin-square 1080x1080', 'linkedin-landscape 1200x627', 'linkedin-document 1080x1350', 'linkedin-article 1920x1080',
    'linkedin-event 1600x900', 'linkedin-page-cover 1512x256', 'linkedin-profile-banner 1584x396', 'linkedin-life-main 1128x376', 'linkedin-company-photo 900x600', 'linkedin-custom-module 502x282',
  ]);
  const cover = publishingPreset('linkedin-page-cover')!;
  const drawn = generationSizeFor(cover.width, cover.height);
  assert.equal(drawn.band, true);
  assert.equal(drawn.width / drawn.height, 3);
  const kept = coverWindow(drawn, cover);
  assert.ok(Math.abs(kept.width / kept.height - cover.width / cover.height) < 0.01);
  assert.ok(kept.top > 0 && kept.top + kept.height < drawn.height);
  const brief = canvasBrief(cover);
  assert.match(brief, /drawn at 3:1 and only its central band, from 25% to 75% of the height, is kept/);
  assert.match(brief, /behind the page logo and name/);
  assert.match(brief, /only the headline and its supporting line, no dates and no button/);
  // A feed size gets no band.
  assert.doesNotMatch(canvasBrief(publishingPreset('linkedin-feed')!), /central band/);
  assert.match(canvasBrief(publishingPreset('linkedin-feed')!), /working professionals/);
});

test('repairs and the logo corner are painted where the kept band is, not in the trimmed margin', async () => {
  const { drawnBox, logoRepairZone } = await import('../server/creative-intelligence/generation/full-creative');
  const cover = canvasOf('linkedin-page-cover');
  assert.equal(cover.generation, '1776x592');
  const top = drawnBox(cover, { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual([top.x, top.width], [0, 1776]);
  assert.ok(top.y > 140 && top.y + top.height < 452, JSON.stringify(top));
  const zone = logoRepairZone(cover, { mark: 'lockup', corner: 'top-left' });
  assert.ok(zone.y >= top.y && zone.x > 0, 'inside the band and right of the page logo');
  // A same-shape size maps almost one to one.
  const feed = drawnBox(canvasOf('feed'), { x: 0.5, y: 0.5, width: 0.1, height: 0.1 });
  assert.deepEqual([feed.x, feed.y], [544, 680]);
  // A story's logo corner sits below the top bar.
  const story = canvasOf('story');
  assert.ok(logoRepairZone(story, { mark: 'lockup', corner: 'top-left' }).y >= Math.floor(230 * 1936 / 1920) - 1);
});

test('small and long-lived sizes carry fewer lines of the approved copy', async () => {
  const { copyForCanvas } = await import('../server/creative-intelligence/generation/full-creative');
  const copy = { headline: 'قُد المرافق', subheadline: 'دورة CFM', facts: ['يبدأ 15-11-2026', 'أونلاين'], cta: 'سجّل الآن' };
  assert.deepEqual(copyForCanvas(copy, 'feed'), copy);
  assert.deepEqual(copyForCanvas(copy, 'instagram-story'), copy);
  assert.deepEqual(copyForCanvas(copy, 'linkedin-landscape'), { headline: copy.headline, facts: copy.facts, cta: copy.cta });
  assert.deepEqual(copyForCanvas(copy, 'youtube-thumbnail-hd'), { headline: copy.headline, facts: ['يبدأ 15-11-2026'] });
  assert.deepEqual(copyForCanvas(copy, 'linkedin-page-cover'), { headline: copy.headline, subheadline: copy.subheadline });
});

test('each platform publishes the size made for it, and every made size counts as approved media', async () => {
  const { creativeImageUrls, imageForChannel } = await import('../src/domain/output-presets');
  const post = { imageUrl: '/main.png', storyUrl: '/story.png', landscapeUrl: '/web.png', sizes: { 'linkedin-landscape': '/li.png', 'instagram-grid': '/grid.png' } };
  assert.equal(imageForChannel('linkedin', post), '/li.png');
  assert.equal(imageForChannel('instagram', post), '/grid.png');
  assert.equal(imageForChannel('facebook', post), '/main.png');
  assert.equal(imageForChannel('tiktok', post), '/story.png', 'TikTok gets the 9:16, not the 4:5 feed design');
  assert.equal(imageForChannel('snapchat', post), '/story.png');
  assert.equal(imageForChannel('website', post), '/web.png');
  assert.equal(imageForChannel('tiktok', { imageUrl: '/main.png' }), '/main.png');
  assert.equal(imageForChannel('linkedin', null), undefined);
  assert.deepEqual(creativeImageUrls(post).sort(), ['/grid.png', '/li.png', '/main.png', '/story.png', '/web.png']);
});

test('chosen sizes become one design per distinct shape; the main design covers its own', async () => {
  const { coveredByMain, defaultSizes, sizeTargets } = await import('../src/features/creative-studio/platforms');
  // Defaults reproduce the old behaviour: 4:5 main, one 9:16, the website banner.
  assert.deepEqual(sizeTargets(['facebook', 'tiktok', 'website'], defaultSizes(['facebook', 'tiktok', 'website'])).map((t) => `${t.width}x${t.height}`), ['1080x1920', '1200x630']);
  const chosen = ['facebook-square', 'instagram-square', 'linkedin-square', 'linkedin-landscape', 'linkedin-page-cover', 'instagram-story', 'whatsapp-status', 'linkedin-feed'];
  const targets = sizeTargets(['facebook', 'instagram', 'linkedin', 'whatsapp'], chosen);
  assert.deepEqual(targets.map((t) => `${t.width}x${t.height}`), ['1080x1080', '1080x1920', '1200x627', '1512x256']);
  assert.deepEqual(targets[0].presets.map((p) => p.id), ['facebook-square', 'instagram-square', 'linkedin-square']);
  assert.ok(coveredByMain(['linkedin']).includes('linkedin-document'));
  // A size of a platform that is not chosen is ignored.
  assert.deepEqual(sizeTargets(['facebook'], ['x-header']), []);
});

test('the two designs are made at the ticked size: Story alone gives 9:16 designs, a pick wins among ticked shapes', async () => {
  const { coveredByMain, mainFormat, sizeTargets } = await import('../src/features/creative-studio/platforms');
  // Instagram with only Story ticked: both designs are stories and nothing is left to adapt.
  assert.equal(mainFormat(['instagram'], ['instagram-story']), 'story');
  assert.deepEqual(sizeTargets(['instagram'], ['instagram-story'], 'story'), []);
  assert.ok(coveredByMain(['instagram'], 'story').includes('instagram-reel'));
  // Feed and Story ticked: feed first unless Story is picked, and the other becomes the extra size.
  assert.equal(mainFormat(['instagram'], ['instagram-feed', 'instagram-story']), 'feed');
  assert.equal(mainFormat(['instagram'], ['instagram-feed', 'instagram-story'], 'story'), 'story');
  assert.deepEqual(sizeTargets(['instagram'], ['instagram-feed', 'instagram-story'], 'story').map((t) => `${t.width}x${t.height}`), ['1080x1350']);
  // A pick that is no longer ticked, or nothing master-shaped ticked, falls back.
  assert.equal(mainFormat(['instagram'], ['instagram-feed'], 'story'), 'feed');
  assert.equal(mainFormat(['instagram'], ['instagram-square']), 'feed');
  assert.equal(mainFormat(['tiktok'], []), 'story');
});
