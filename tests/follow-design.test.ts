import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';
process.env.MEDIA_DIR = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'follow-design-'));
const { followImage, followPlanningNote, followPrompt, resolveFollowDesign } = await import('../server/creative-intelligence/generation/follow-design');

test('a library design resolves to its reference image and its text blocks', async () => {
  const design = await resolveFollowDesign({ templateId: 'brand-campaign-offer' }, '00000000-0000-4000-8000-000000000001');
  assert.ok(design && existsSync(design.path));
  assert.match(followPlanningNote(design!), /same text blocks/);
  assert.match(followPlanningNote(design!), /tape line/);
  assert.equal(await resolveFollowDesign({ templateId: 'no-such-design' }, '00000000-0000-4000-8000-000000000001'), undefined);
  const image = await followImage(design!);
  assert.ok(image && Math.abs(image.aspect - 0.8) < 0.01);
});

test('the image model keeps the design and changes only words and photos; another shape is rearranged, not stretched', () => {
  const same = followPrompt({ aspect: 0.8 }, 1080 / 1350);
  assert.match(same, /keep its layout/);
  assert.match(same, /Keep none of its words, numbers, names, people or photos/);
  assert.match(same, /Do not draw its logo/);
  assert.doesNotMatch(same, /different shape/);
  assert.match(followPrompt({ aspect: 0.8 }, 1080 / 1920), /rearrange them to fit this canvas/);
});

test('an uploaded design is saved as a JPEG beside the run; a non-image is refused', async () => {
  const png = await sharp({ create: { width: 40, height: 50, channels: 3, background: '#123456' } }).png().toBuffer();
  const design = await resolveFollowDesign({ name: 'mine.png', dataUrl: `data:image/png;base64,${png.toString('base64')}` }, '00000000-0000-4000-8000-000000000002');
  assert.ok(design?.path.endsWith('follow-design.jpg') && existsSync(design.path));
  assert.equal(await resolveFollowDesign({ name: 'x', dataUrl: 'data:text/plain;base64,aGk=' }, '00000000-0000-4000-8000-000000000002'), undefined);
});
