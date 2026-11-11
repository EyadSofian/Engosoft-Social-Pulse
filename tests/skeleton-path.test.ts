/**
 * Skeleton → AI finish → verify, end to end with a fake image model and a stubbed reader: one image call per size,
 * the AI finish ships only when every line reads back exactly, otherwise the exact layout ships (with the drawn
 * photos), a failed drawing never loses the post, and other sizes and restarts are laid out again from the document.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';
process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'skeleton-path-'));
const { foldLine, lineMatches, locateLines, produceSkeleton, skeletonFor, skeletonPathFor } = await import('../server/creative-intelligence/generation/skeleton');
const { personLines, missingLines } = await import('../server/creative-intelligence/generation/template-fill');
const { adaptFullCreative, generateFullCreative, loadFullCreativeRun, recoverInterruptedRuns, updateTrace } = await import('../server/creative-intelligence/generation/full-creative');
const { resolveFollowDesign } = await import('../server/creative-intelligence/generation/follow-design');
const { brandSamples, brandTemplate } = await import('../src/domain/brand-templates');
const { designDocFromTemplate } = await import('../src/domain/design-doc');

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const ENV = { OPENAI_API_KEY: 'test', CREATIVE_PATH: 'skeleton', CREATIVE_CANDIDATES: '1' } as NodeJS.ProcessEnv;

type Body = { text: { format: { name: string } }; input: { content: { type: string; text?: string; image_url?: string }[] }[] };
/** Text-model answers by schema name; every call is recorded. */
function responses(handlers: Record<string, (body: Body) => unknown>) {
  const seen: string[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Body;
    const name = body.text.format.name;
    seen.push(name);
    const handler = handlers[name];
    if (!handler) return Response.json({ error: { message: `no stub for ${name}` } }, { status: 400 });
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(handler(body)) }] }] });
  }) as typeof fetch;
  return seen;
}
/** The reader: reads each crop as the expected line, except the lines `wrong` names, which come back misspelt. */
const reader = (lines: () => string[], wrong: (text: string) => boolean = () => false) => (body: Body) => {
  const crops = body.input[0].content.filter((c) => c.type === 'input_image').length;
  return { reads: lines().slice(0, crops).map((text, i) => ({ crop: i + 1, text: wrong(text) ? `${text}ـخطأ` : text })) };
};

/** A fake image model: hands Image 1 back (a perfect redraw) or a solid colour, and counts its calls. */
function fakeModel(mode: 'echo' | { colour: string } | { shift: number } | 'fail' = 'echo') {
  const calls: { prompt: string; size: string }[] = [];
  return {
    calls,
    provider: {
      name: 'fake', model: 'fake-image',
      generate: async () => { throw new Error('generate is not used on the skeleton path'); },
      edit: async (r: { prompt: string; size: string; images: { data: Buffer }[] }) => {
        calls.push({ prompt: r.prompt, size: r.size });
        if (mode === 'fail') throw new Error('Request timed out');
        const [width, height] = r.size.split('x').map(Number);
        const echo = () => sharp(r.images[0].data).resize(width, height, { fit: 'fill' }).png().toBuffer();
        const png = mode === 'echo' ? await echo()
          : 'shift' in mode ? await sharp(await sharp(await echo()).extend({ top: 0, bottom: mode.shift, background: '#0443F2' }).png().toBuffer()).extract({ left: 0, top: mode.shift, width, height }).png().toBuffer()
          : await sharp({ create: { width, height, channels: 3, background: mode.colour } }).png().toBuffer();
        return [{ png, model: 'fake-image', size: r.size, quality: 'high' as const, latencyMs: 1 }];
      },
    },
  };
}
const campaign = brandTemplate('brand-campaign-offer')!;
const campaignDoc = () => designDocFromTemplate(campaign, { ...brandSamples(campaign, 'ar'), headline: 'دبلومة التصميم الداخلي..', highlight: 'التصميم الداخلي', price: '1000', oldPrice: '2000' }, 'blue');
const offer = brandTemplate('brand-offer')!;
const offerDoc = () => designDocFromTemplate(offer, { ...brandSamples(offer, 'ar'), photo: '' }, 'blue');
const FEED = { width: 1080, height: 1350, label: 'Feed post 4:5', generation: '1088x1360' };
const stats = async (png: Buffer, box: { left: number; top: number; width: number; height: number }) => (await sharp(await sharp(png).extract(box).toBuffer()).stats()).channels;

test('lines compare as a reader sees them: tatweel, digits, separators and neighbouring lines aside, but never a wrong letter', () => {
  assert.equal(foldLine('بـــدل'), foldLine('بدل'));
  assert.equal(foldLine('1,400'), foldLine('١٤٠٠'));
  assert.ok(lineMatches('مشاريع أكبر.. ومسؤوليات أعلى!', 'مشاريع أكبر ومسئوليات أعلى'.replace('مسئوليات', 'مسؤوليات'), []));
  assert.ok(lineMatches('700', '700 ر.س', ['ر.س']), 'the currency next to the price crept into the crop');
  assert.ok(!lineMatches('قُد المرافق باحتراف', 'قد المرافق باحترارف', []), 'a doubled letter is a wrong line');
  assert.ok(!lineMatches('1000', '100', []));
  assert.equal(skeletonPathFor({ CREATIVE_PATH: 'skeleton' } as NodeJS.ProcessEnv), true);
  assert.equal(skeletonPathFor({} as NodeJS.ProcessEnv), false);
});

test('a finish that reads back exactly ships, with the fixed files placed from their files, for one image call', async () => {
  const doc = campaignDoc();
  const sk = await skeletonFor(doc, FEED);
  responses({ engosoft_line_reads: reader(() => sk.lines.map((l) => l.text)) });
  const { calls, provider } = fakeModel('echo');
  const out = await produceSkeleton({ doc, canvas: FEED, provider, quality: 'high', topic: 'دبلومة التصميم الداخلي', env: ENV });
  assert.equal(out.shipped, 'finish');
  assert.equal(calls.length, 1);
  assert.equal(out.imageCalls, 1);
  assert.ok(out.reads.length >= 6 && out.reads.every((r) => r.exact));
  assert.match(calls[0].prompt, /letter for letter/);
  assert.match(calls[0].prompt, /do not draw any logo/i);
  // Image 1 had no logo; the old lockup is back at the top-left from its file.
  const logo = await stats(out.image, { left: 20, top: 30, width: 240, height: 90 });
  assert.ok(logo[0].max > 230, 'white lockup strokes at the top-left');
  const plainLogo = await stats(sk.plain, { left: 20, top: 30, width: 240, height: 90 });
  assert.ok(plainLogo[0].max < 120, 'Image 1 had no logo for the model to redraw');
});

test('when a line comes back wrong, the exact layout ships instead, with a note and no extra image call', async () => {
  const doc = campaignDoc();
  const sk = await skeletonFor(doc, FEED);
  responses({ engosoft_line_reads: reader(() => sk.lines.map((l) => l.text), (text) => text.includes('التصميم')) });
  const { calls, provider } = fakeModel({ colour: '#203060' });
  const out = await produceSkeleton({ doc, canvas: FEED, provider, quality: 'high', topic: 'x', env: ENV });
  assert.equal(out.shipped, 'skeleton');
  assert.equal(calls.length, 1);
  assert.ok(out.image.equals(sk.full) || (await sharp(out.image).raw().toBuffer()).equals(await sharp(sk.full).raw().toBuffer()), 'the image is the skeleton');
  assert.deepEqual(out.problems, []);
  assert.match(out.notes.join(' '), /exact layout was kept/);
});

test('with a photo slot, the fallback keeps the exact layout and takes only the drawn photo', async () => {
  const doc = offerDoc();
  const sk = await skeletonFor(doc, FEED);
  assert.deepEqual(sk.slots.map((s) => s.key), ['photo']);
  responses({ engosoft_line_reads: reader(() => sk.lines.map((l) => l.text), () => true) });
  const { provider } = fakeModel({ colour: '#ff0000' });
  const out = await produceSkeleton({ doc, canvas: FEED, provider, quality: 'high', topic: 'عرض الجمعة البيضاء', env: ENV });
  assert.equal(out.shipped, 'skeleton');
  const raw = await sharp(out.image).removeAlpha().raw().toBuffer();
  const skRaw = await sharp(sk.full).removeAlpha().raw().toBuffer();
  let inside = 0, insideRed = 0, outsideSame = 0, outside = 0;
  for (let i = 0; i < sk.photoMask!.length; i += 7) {
    if (sk.photoMask![i] === 255) { inside++; if (raw[i * 3] > 230 && raw[i * 3 + 1] < 30) insideRed++; }
    else if (sk.photoMask![i] === 0) { outside++; if (Math.abs(raw[i * 3] - skRaw[i * 3]) <= 1 && Math.abs(raw[i * 3 + 2] - skRaw[i * 3 + 2]) <= 1) outsideSame++; }
  }
  assert.ok(insideRed / inside > 0.99, `the photo area holds the drawn photo (${insideRed}/${inside})`);
  assert.ok(outsideSame / outside > 0.999, `everything else is the exact layout (${outsideSame}/${outside})`);
});

test('a failed drawing never loses the post: the exact layout ships; a photo left grey is a problem to fix', async () => {
  responses({});
  const plain = await produceSkeleton({ doc: campaignDoc(), canvas: FEED, provider: fakeModel('fail').provider, quality: 'high', topic: 'x', env: ENV });
  assert.equal(plain.shipped, 'skeleton');
  assert.equal(plain.imageCalls, 0);
  assert.deepEqual(plain.problems, []);
  assert.match(plain.notes[0], /could not be drawn.*timed out/);
  const photo = await produceSkeleton({ doc: offerDoc(), canvas: FEED, provider: fakeModel('fail').provider, quality: 'high', topic: 'x', env: ENV });
  assert.match(photo.problems.join(' '), /No photo was drawn for: photo/);
});

test('the AI designer takes the skeleton path for a library design: fill, one image per size, other sizes and restarts from the document', async () => {
  const follow = (await resolveFollowDesign({ templateId: 'brand-campaign-offer', surface: 'blue' }, 'unused'))!;
  const values = { headline: 'دبلومة التصميم الداخلي..', highlight: 'التصميم الداخلي', tape: 'دبلومة التصميم الداخلي', subline: 'أونلاين 1000 • حضوري 2000', price: '1000', currency: '', instead: '', oldPrice: '' };
  let lines: string[] = [];
  const seen = responses({
    engosoft_brand_template_fill: () => ({ ...Object.fromEntries(campaign.inputs.filter((i) => i.type !== 'photo').map((i) => [i.key, ''])), ...values }),
    engosoft_line_reads: reader(() => lines),
  });
  const doc = designDocFromTemplate(campaign, { ...brandSamples(campaign, 'ar'), ...values }, 'blue');
  lines = (await skeletonFor(doc, { width: 1080, height: 1350 })).lines.map((l) => l.text);
  const { calls, provider } = fakeModel('echo');
  const run = await generateFullCreativeWith(provider, { prompt: 'دبلومة التصميم الداخلي\nأونلاين 1000 • حضوري 2000', format: 'feed', directions: 1, skipOdoo: true, followDesign: follow, course: 'دبلومة التصميم الداخلي' });
  assert.ok(seen.includes('engosoft_brand_template_fill'), 'the template inputs were written from the request');
  assert.ok(!seen.includes('engosoft_follow_design_content'), 'the vision read of the design is not needed');
  assert.ok(!seen.includes('engosoft_creative_inspection'), 'no whole-post critic');
  assert.equal(calls.length, 1, 'one image call for the design');
  assert.ok(run.designDoc, 'the document is saved on the run');
  const [result] = run.results;
  assert.equal(result.skeleton, 'finish');
  assert.equal(result.status, 'ready', result.problems.join(' | '));
  assert.ok(existsSync(result.imagePath!) && existsSync(result.rawImagePath));
  // Another size: laid out again from the document, one more image call, no repair calls.
  lines = (await skeletonFor(run.designDoc!, { width: 1080, height: 1920, safe: { top: 270, right: 65, bottom: 390, left: 65 } })).lines.map((l) => l.text);
  const story = await adaptFullCreativeWith(provider, run.requestId, 'd1', 'story');
  assert.equal(calls.length, 2);
  assert.equal(story.skeleton, 'finish');
  const meta = await sharp(story.imagePath!).metadata();
  assert.deepEqual([meta.width, meta.height], [1080, 1920]);
  // A restart in the middle of a size: it comes back as the exact layout, with no image call.
  updateTrace(run.requestId, (saved) => { saved.pending = [{ directionId: 'd1-landscape', format: 'landscape' }]; });
  assert.equal(await recoverInterruptedRuns(ENV), 1);
  const recovered = loadFullCreativeRun(run.requestId).results.find((r) => r.directionId === 'd1-landscape')!;
  assert.equal(recovered.status, 'ready');
  assert.equal(recovered.skeleton, 'skeleton');
  assert.equal(calls.length, 2, 'recovering costs no image');
  const land = await sharp(readFileSync(recovered.imagePath!)).metadata();
  assert.deepEqual([land.width, land.height], [1200, 630]);
});

/* The run makes its image provider from the model name; these wrappers hand it the fake one instead. */
async function generateFullCreativeWith(provider: ReturnType<typeof fakeModel>['provider'], request: Parameters<typeof generateFullCreative>[0]) {
  const mod = await import('../server/creative-intelligence/generation/full-creative');
  mod.setImageProviderForTests(() => provider as never);
  try { return await generateFullCreative(request, ENV); } finally { mod.setImageProviderForTests(null); }
}
async function adaptFullCreativeWith(provider: ReturnType<typeof fakeModel>['provider'], requestId: string, directionId: string, format: string) {
  const mod = await import('../server/creative-intelligence/generation/full-creative');
  mod.setImageProviderForTests(() => provider as never);
  try { return await adaptFullCreative(loadFullCreativeRun(requestId), directionId, format, ENV); } finally { mod.setImageProviderForTests(null); }
}

test('a finish that moved the lines is not used, even with every word right: they would run into the stamp (seen on a real run)', async () => {
  const doc = campaignDoc();
  const sk = await skeletonFor(doc, FEED);
  const seen = responses({ engosoft_line_reads: reader(() => sk.lines.map((l) => l.text)) });
  const { provider } = fakeModel({ shift: 80 });
  const out = await produceSkeleton({ doc, canvas: FEED, provider, quality: 'high', topic: 'x', env: ENV });
  assert.equal(out.shipped, 'skeleton');
  assert.match(out.notes.join(' '), /moved .*exact layout was kept/);
  assert.ok(!seen.includes('engosoft_line_reads'), 'positions are checked in code before anything is read');
  const still = await locateLines(sk.full, sk.full, sk.lines);
  assert.ok(still.every((spot) => !spot.moved && spot.dx === 0 && spot.dy === 0), 'the layout against itself has not moved');
});

test('the person\'s lines are the post\'s lines: prices and list marks aside, and a line lost by the fill is named', () => {
  const prompt = 'مع التطور العمراني في المملكة.. فرص جديدة للمصممين!\nInterior Design\n- حوّل شغفك بالتصميم الداخلي لمهارة احترافية مطلوبة في سوق العمل.\nبعد 1000\nقبل 2000';
  assert.deepEqual(personLines(prompt), ['مع التطور العمراني في المملكة.. فرص جديدة للمصممين!', 'Interior Design', 'حوّل شغفك بالتصميم الداخلي لمهارة احترافية مطلوبة في سوق العمل.']);
  assert.deepEqual(personLines('اعمل بوست لدورة CFM الجاية'), [], 'one sentence describing the post has no lines to keep');
  const values = { headline: 'مع التطور العمراني في المملكة..', subline: 'فرص جديدة للمصممين!', tape: 'التصميم الداخلي' };
  assert.deepEqual(missingLines(personLines(prompt), values, ['headline', 'subline', 'tape']), ['Interior Design', 'حوّل شغفك بالتصميم الداخلي لمهارة احترافية مطلوبة في سوق العمل.'], 'a line split across neighbouring fields still counts as there');
});

test('the fill keeps no currency the person did not write and the design\'s own «بدل» (seen on a real run)', async () => {
  const { fillTemplateValues } = await import('../server/creative-intelligence/generation/template-fill');
  responses({ engosoft_brand_template_fill: () => ({ headline: 'مع التطور العمراني في المملكة.. فرص جديدة للمصممين!', highlight: 'فرص جديدة', tape: 'Interior Design', subline: 'حوّل شغفك بالتصميم الداخلي لمهارة احترافية مطلوبة في سوق العمل.', price: '1000', currency: 'ريال', instead: 'بدلاً من', oldPrice: '2000' }) });
  const out = await fillTemplateValues(campaign, { prompt: 'مع التطور العمراني في المملكة.. فرص جديدة للمصممين!\nInterior Design\nحوّل شغفك بالتصميم الداخلي لمهارة احترافية مطلوبة في سوق العمل.\nبعد 1000\nقبل 2000', careful: true }, ENV);
  assert.equal(out.values.currency, '');
  assert.equal(out.values.instead, 'بـــدل');
  assert.deepEqual(out.missing, []);
  assert.equal(out.values.subline, 'حوّل شغفك بالتصميم الداخلي لمهارة احترافية مطلوبة في سوق العمل.', 'the person\'s line is not cut to the field\'s 90 characters... or any limit');
});

test('layered finish: the model draws the art under a design with no words; the exact words and files go on top', async () => {
  const doc = campaignDoc();
  const sk = await skeletonFor(doc, FEED);
  const seen = responses({});
  const { calls, provider } = fakeModel('echo');
  const out = await produceSkeleton({ doc, canvas: FEED, provider, quality: 'high', topic: 'x', env: { ...ENV, CREATIVE_PATH: 'layered' } });
  assert.equal(out.shipped, 'finish');
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /words taken out/);
  assert.match(calls[0].prompt, /NO TEXT/);
  assert.deepEqual(seen, [], 'no reading: the words were set by code');
  // An art layer that kept the layout stacks back to the exact design.
  const a = await sharp(out.image).removeAlpha().raw().toBuffer(), b = await sharp(sk.full).removeAlpha().raw().toBuffer();
  let off = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 24) off++;
  assert.ok(off / a.length < 0.002, `${off} channels differ`);
});

test('layered finish: art that moved the shapes or drew letters where the words go is not used', async () => {
  const doc = campaignDoc();
  const env = { ...ENV, CREATIVE_PATH: 'layered' } as NodeJS.ProcessEnv;
  responses({});
  const moved = await produceSkeleton({ doc, canvas: FEED, provider: fakeModel({ shift: 70 }).provider, quality: 'high', topic: 'x', env });
  assert.equal(moved.shipped, 'skeleton');
  assert.match(moved.notes.join(' '), /did not leave room for the words.*moved/);
  // A model that drew the words itself (the redraw's Image 1 handed back) puts letters under the real ones.
  const sk = await skeletonFor(doc, FEED);
  const lettered = { name: 'fake', model: 'fake-image', generate: async () => { throw new Error('unused'); }, edit: async (r: { size: string }) => { const [w, h] = r.size.split('x').map(Number); return [{ png: await sharp(sk.plain).resize(w, h, { fit: 'fill' }).png().toBuffer(), model: 'fake-image', size: r.size, quality: 'high' as const, latencyMs: 1 }]; } };
  const out = await produceSkeleton({ doc, canvas: FEED, provider: lettered, quality: 'high', topic: 'x', env });
  assert.equal(out.shipped, 'skeleton');
  assert.match(out.notes.join(' '), /something was drawn/);
});
