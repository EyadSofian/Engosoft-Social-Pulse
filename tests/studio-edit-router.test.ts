import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { STUDIO_VERSION, type StudioDoc } from '../src/domain/studio';
import { approveBlocker, draftProblems, missingFields, type CourseProfileDraft } from '../src/features/course-profiles/CourseProfilesPanel';

// Studio files and usage rows go to a throwaway folder, never the local database.
process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'sp-edit-')), 'test.sqlite');
const { applyLayerChanges, unverifiedNumbers } = await import('../server/creative-intelligence/studio/edit-router');
const { editInContext, regionEditPrompt } = await import('../server/creative-intelligence/studio/studio');
await (await import('../server/db')).initDb();

const doc: StudioDoc = {
  version: STUDIO_VERSION, width: 1080, height: 1350, baseFile: 'base.png', objects: [], zones: [], logo: null,
  layers: [
    { kind: 'text', id: 'head', text: 'دورة CFM', x: 100, y: 200, width: 800, size: 64, color: '#ffffff', weight: 800, align: 'start', lineHeight: 1.3, opacity: 1 },
    { kind: 'text', id: 'date', text: 'يبدأ 12 نوفمبر', x: 100, y: 320, width: 600, size: 30, color: '#ffffff', weight: 400, align: 'start', lineHeight: 1.3, opacity: 1, locked: true },
    { kind: 'shape', id: 'btn', name: 'Button', x: 100, y: 1100, width: 300, height: 90, fill: '#0046ff', radius: 20, opacity: 1 },
  ],
};
const none = { text: null, color: null, size: null, weight: null, align: null, dx: null, dy: null, opacity: null, hidden: null, shadow: null, fill: null };

test('edit router applies text and shape changes exactly, within the editor limits', () => {
  const { doc: next, applied, warnings } = applyLayerChanges(doc, [
    { ...none, layerId: 'head', size: 900, color: '#FFAA00', align: 'center', dy: -40 },
    { ...none, layerId: 'btn', fill: '#22aa55' },
    { ...none, layerId: 'missing', size: 20 },
  ], { command: 'كبّر العنوان وخلي الزرار أخضر', approvedCopy: [] });
  const head = next.layers.find((l) => l.id === 'head')!;
  assert.equal(head.kind, 'text');
  if (head.kind === 'text') {
    assert.equal(head.size, 400);
    assert.equal(head.color, '#ffaa00');
    assert.equal(head.align, 'center');
    assert.equal(head.y, 160);
  }
  const btn = next.layers.find((l) => l.id === 'btn')!;
  assert.equal(btn.kind === 'shape' && btn.fill, '#22aa55');
  assert.equal(applied.length, 2);
  assert.match(applied[0], /الحجم/);
  assert.deepEqual(warnings, []);
});

test('locked layers stay as they are and invalid colours are ignored', () => {
  const { doc: next, applied, warnings } = applyLayerChanges(doc, [
    { ...none, layerId: 'date', text: 'يبدأ 20 نوفمبر' },
    { ...none, layerId: 'head', color: 'green' },
  ], { command: 'change the date', approvedCopy: [] });
  assert.deepEqual(next.layers, doc.layers);
  assert.equal(applied.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /locked/);
});

test('numbers the person never gave are flagged, Arabic digits included', () => {
  assert.deepEqual(unverifiedNumbers('يبدأ ١٥ نوفمبر الساعة 7', ['خلي الميعاد 7', 'يبدأ 12 نوفمبر']), ['15']);
  assert.deepEqual(unverifiedNumbers('CFM 2026', ['CFM 2026']), []);
  const { warnings } = applyLayerChanges(doc, [{ ...none, layerId: 'head', text: 'دورة CFM بخصم 30%' }], { command: 'ضيف خصم على العنوان', approvedCopy: ['دورة CFM'] });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /30/);
});

test('region edit prompt keeps the rest of the picture, forbids stray text and quotes the request as data', () => {
  const prompt = regionEditPrompt('Replace the tablet with a modern silver laptop', 'بدّل التابلت بلابتوب');
  assert.match(prompt, /ONLY the transparent masked area/);
  assert.match(prompt, /Do not add text/);
  assert.match(prompt, /"بدّل التابلت بلابتوب"/);
  assert.doesNotMatch(regionEditPrompt('same', 'same'), /own words/);
});

test('a region is edited with its surroundings as context and only the region is pasted back', async () => {
  const width = 400, height = 500;
  const base = await sharp({ create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer();
  const sizes: string[] = [];
  const original = globalThis.fetch;
  // The image model answers with a textured red picture of the requested size.
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const form = init.body as FormData;
    const size = String(form.get('size'));
    sizes.push(size);
    const [w, h] = size.split('x').map(Number);
    const raw = Buffer.alloc(w * h * 3);
    // Coarse checks survive resizing, so the result is not mistaken for an unpainted hole.
    for (let i = 0; i < w * h; i++) { const check = (((i % w) >> 5) + (Math.floor(i / w) >> 5)) % 2; raw[i * 3] = check ? 255 : 190; raw[i * 3 + 1] = check ? 90 : 10; raw[i * 3 + 2] = 20; }
    const png = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const [edited] = await editInContext(base, { x: 40, y: 60, width: 80, height: 80 }, 'red', { OPENAI_API_KEY: 'test', OPENAI_IMAGE_MODEL: 'gpt-image-2' });
    const { data } = await sharp(edited).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => [...data.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)];
    assert.ok(at(80, 100)[0] > 180, 'inside the region is the edit');
    assert.deepEqual(at(170, 190), [128, 128, 128], 'context around the region is not pasted');
    assert.deepEqual(at(350, 450), [128, 128, 128], 'far away is untouched');
    // The crop around a small region, not the whole canvas, went to the model.
    assert.equal(sizes.length, 1);
    assert.notEqual(sizes[0], '1088x1360');
  } finally {
    globalThis.fetch = original;
  }
});

const draft = (patch: Partial<CourseProfileDraft> = {}): CourseProfileDraft => ({ courseId: 'c', courseName: 'Revit MEP', objectives: 'هدف', outcomes: '', audience: '', notes: '', category: '', description: '', sourceUrl: '', reviewStatus: 'suggested', ...patch });
const en = (text: string) => text;

test('course editor checks the same rules as the server before saving', () => {
  assert.deepEqual(draftProblems(draft(), en), {});
  assert.ok(draftProblems(draft({ sourceUrl: 'http://engosoft.com' }), en).sourceUrl);
  assert.ok(draftProblems(draft({ sourceUrl: 'engosoft.com' }), en).sourceUrl);
  assert.equal(draftProblems(draft({ sourceUrl: 'https://engosoft.com/shop' }), en).sourceUrl, undefined);
  assert.ok(draftProblems(draft({ objectives: Array.from({ length: 13 }, (_, i) => `goal ${i}`).join('\n') }), en).objectives);
  assert.ok(draftProblems(draft({ outcomes: 'x'.repeat(301) }), en).outcomes);
  assert.ok(draftProblems(draft({ courseName: ' a ' }), en).courseName);
  // Blank rows being typed do not count as goals.
  assert.equal(approveBlocker(draft({ objectives: '\n  \n' }), en), 'Add at least one learning goal to approve.');
  assert.equal(approveBlocker(draft(), en), null);
});

test('missing course details are listed so reviewers can find incomplete profiles', () => {
  assert.deepEqual(missingFields({ description: '', audience: ' ', objectives: [], outcomes: ['x'] }), ['description', 'audience', 'objectives']);
  assert.deepEqual(missingFields({ description: 'd', audience: 'a', objectives: ['g'], outcomes: ['o'] }), []);
});

test('a reference design can be changed after it comes out: same copy, the change only, the logo placed again', async () => {
  const { renderReferenceDesign, editReferenceDesign } = await import('../server/reference-designs');
  const { mediaDir } = await import('../server/paths');
  const { existsSync } = await import('node:fs');
  const template = {
    id: 't', name: 'Reference', description: '', kind: 'course', format: 'feed', width: 1080, height: 1350, svg: '', sourceImage: '/design-references/automotive-hero.jpg', sourcePrompt: 'blue hero',
    fields: [{ key: 'title', label: 'Title', type: 'text', source: 'manual', sample: '', maxChars: 80 }, { key: 'cta', label: 'CTA', type: 'text', source: 'manual', sample: '', maxChars: 30 }],
    departmentId: null, createdBy: 'u', usageCount: 0, createdAt: '', updatedAt: '',
  } as Parameters<typeof renderReferenceDesign>[0];
  const calls: { prompt: string; image: Buffer }[] = [];
  const provider = {
    name: 'fake', model: 'fake-image',
    generate: async () => { throw new Error('not used'); },
    edit: async (request: { prompt: string; size: string; images: { data: Buffer }[] }) => {
      calls.push({ prompt: request.prompt, image: request.images[0].data });
      const [w, h] = request.size.split('x').map(Number);
      const png = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 40 + calls.length * 60, b: 160 } } }).png().toBuffer();
      return [{ png, model: 'fake-image', size: request.size, quality: 'high' as const, latencyMs: 1 }];
    },
  };
  const values = { title: 'دورة ميكانيكا السيارات', cta: 'سجّل الآن' };
  const first = await renderReferenceDesign(template, values, 'feed', 'cars', provider);
  const id = first.imageUrl.match(/([0-9a-f-]{36})\.png$/)![1];
  assert.ok(existsSync(mediaDir('uploads', `${id}-raw.png`)), 'the logo-free original is kept for edits');

  const second = await editReferenceDesign(template, first.imageUrl, values, 'خلّي الصورة أفتح', 'feed', undefined, provider);
  assert.notEqual(second.imageUrl, first.imageUrl);
  const prompt = calls[1].prompt;
  assert.match(prompt, /ONLY the change/);
  assert.match(prompt, /خلّي الصورة أفتح/);
  assert.match(prompt, /دورة ميكانيكا السيارات/);
  assert.match(prompt, /no logo/);
  // The edit starts from the version without the logo, so the logo is never painted twice.
  const sent = await sharp(calls[1].image).metadata();
  assert.equal(sent.width, 1080);
  await assert.rejects(editReferenceDesign(template, '/api/uploads/00000000-0000-0000-0000-000000000000.png', values, 'x y z', 'feed', undefined, provider), /قبل إتاحة التعديل/);
});

test('files attached on the Create page reach the planner: images small, text quoted, PDFs as files, others skipped', async () => {
  const { userReferenceContent } = await import('../server/creative-intelligence/skills/engine');
  const png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 0, g: 70, b: 255 } } }).png().toBuffer();
  const { names, content } = await userReferenceContent([
    { name: 'brief.png', mime: 'image/png', dataUrl: `data:image/png;base64,${png.toString('base64')}` },
    { name: 'notes.md', mime: '', dataUrl: `data:application/octet-stream;base64,${Buffer.from('الدورة تبدأ قريبًا').toString('base64')}` },
    { name: 'outline.pdf', mime: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0=' },
    { name: 'old.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', dataUrl: 'data:application/octet-stream;base64,AAAA' },
  ]);
  assert.deepEqual(names, ['brief.png', 'notes.md', 'outline.pdf']);
  const image = content.find((c) => c.type === 'input_image');
  assert.ok(image && image.type === 'input_image' && image.image_url.startsWith('data:image/jpeg;base64,'));
  assert.ok(content.some((c) => c.type === 'input_text' && c.text.includes('الدورة تبدأ قريبًا')));
  assert.ok(content.some((c) => c.type === 'input_file' && c.filename === 'outline.pdf'));
});
