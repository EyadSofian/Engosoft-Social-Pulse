/**
 * A post from a library reference design made from one idea: the copywriter writes every line (never a number
 * nobody gave), and the reference's own logo goes back at its spot and size, in full colour on light designs and
 * white on blue ones, or the other logo when picked, which can be swapped later with no new image.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';

process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'reference-idea-'));

const { guardReferenceCopy, inventedNumbers, writeReferenceCopy, limitOf } = await import('../server/creative-intelligence/generation/reference-copy');
const { logoSpotOn, referencePrompt, renderReferenceDesign, relogoReferenceDesign } = await import('../server/reference-designs');
const { REFERENCE_LOGOS, referenceLogoOf } = await import('../src/domain/reference-logos');
const { builtinTemplates, REFERENCE_DESIGNS } = await import('../server/builtin-templates');
const { mediaDir } = await import('../server/paths');

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
after(() => { globalThis.fetch = originalFetch; process.env.OPENAI_API_KEY = originalKey; });

const byFile = (file: string) => builtinTemplates().find((t) => t.sourceImage === `/design-references/${file}`)!;
const reply = (payload: unknown) => Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] });
const statsAt = async (png: Buffer, box: { x: number; y: number; width: number; height: number }) =>
  (await sharp(await sharp(png).extract({ left: box.x, top: box.y, width: box.width, height: box.height }).toBuffer()).stats()).channels;
/** A fake image model: a flat canvas of one colour at the size asked for. */
const flat = (background: string, prompts: string[] = []) => ({
  name: 'fake', model: 'fake-image',
  generate: async () => { throw new Error('not used'); },
  edit: async (request: { prompt: string; size: string }) => {
    prompts.push(request.prompt);
    const [w, h] = request.size.split('x').map(Number);
    return [{ png: await sharp({ create: { width: w, height: h, channels: 3, background } }).png().toBuffer(), model: 'fake-image', size: request.size, quality: 'high' as const, latencyMs: 1 }];
  },
});

test('every reference design has its logo on record: the old lockup on twelve, the official one on Revit MEP', () => {
  for (const reference of REFERENCE_DESIGNS) {
    const logo = referenceLogoOf(`/design-references/${reference.file}`);
    assert.ok(logo, `${reference.file} has no logo on record`);
    assert.equal(logo!.kit, reference.file === 'revit-mep.png' ? 'official' : 'engo-soft-old', reference.file);
    // Top-left, about a fifth of the width, as measured on the files.
    assert.ok(logo!.place.x < 0.06 && logo!.place.y < 0.05 && logo!.place.width > 0.18 && logo!.place.width < 0.27, `${reference.file}: ${JSON.stringify(logo!.place)}`);
  }
  assert.equal(Object.keys(REFERENCE_LOGOS).length, REFERENCE_DESIGNS.length);
  assert.equal(referenceLogoOf('/api/uploads/x.png'), undefined);
  assert.equal(REFERENCE_LOGOS['support.jpg'].onDark, false);
  assert.equal(REFERENCE_LOGOS['automotive-hero.jpg'].onDark, true);
});

test('the logo spot: the reference spot on the same shape, the same corner and share of the width on others', () => {
  const own = referenceLogoOf('/design-references/automotive-hero.jpg')!;
  const feed = logoSpotOn(own, { width: 1080, height: 1350 });
  assert.equal(feed.same, true);
  assert.deepEqual([feed.x, feed.y, feed.width], [47, 45, 231]);
  const story = logoSpotOn(own, { width: 1080, height: 1920 }, { top: 230, left: 0 });
  assert.equal(story.same, false);
  assert.equal(story.width, 231);
  assert.equal(story.y, 230, 'kept below the story safe area');
});

test('the copy guard: no number nobody gave, the person\'s own line whole, every role within its room', () => {
  const template = byFile('automotive-enroll.jpg');
  const idea = 'كورس صيانة العربيات الكهربائية، بيبدأ 5 ديسمبر أونلاين';
  const out = guardReferenceCopy(template, {
    values: { title: 'خصم 50% على صيانة العربيات', subtitle: 'ابدأ 5 ديسمبر أونلاين مع خبراء الصيانة', body: '', date: '5 ديسمبر', time: '8 مساءً', objectives: '', cta: 'سجّل الآن واحجز مكانك في أول دفعة قبل ما الأماكن تخلص' },
    caption: 'كورس جديد في صيانة العربيات الكهربائية.\nخصم 50% لأول 20 متدرب!\nسجّل دلوقتي.',
    scene: 'An engineer servicing an electric car battery in a bright workshop.',
  }, idea);
  assert.equal(out.values.date, '5 ديسمبر');
  assert.equal(out.values.time, '', 'a time nobody gave is dropped');
  assert.match(out.values.subtitle, /5 ديسمبر/);
  // The invented discount empties the headline, which falls back to the idea's own words.
  assert.ok(out.values.title && !/50/.test(out.values.title), out.values.title);
  assert.ok([...out.values.title].length <= 45);
  assert.ok([...out.values.cta].length <= limitOf(template.fields.find((f) => f.key === 'cta')!), out.values.cta);
  assert.doesNotMatch(out.caption, /50|20/);
  assert.match(out.caption, /سجّل دلوقتي/);
  assert.deepEqual(inventedNumbers('١٬٤٠٠ ريال', 'السعر 1400'), []);
  // A long line the person wrote word for word stays whole.
  const own = 'حوّل شغفك بالسيارات لمهنة مطلوبة في كل ورش المملكة';
  assert.equal(guardReferenceCopy(template, { values: { title: own }, caption: '', scene: '' }, `${own}\nكورس صيانة`).values.title, own);
});

test('one idea writes the design\'s lines from the reference image, and asks again when a number was made up', async () => {
  const template = byFile('automotive-enroll.jpg');
  const calls: { instructions: string; content: { type: string; text?: string; image_url?: string }[] }[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ instructions: body.instructions, content: body.input[0].content });
    const values = { title: calls.length === 1 ? 'وفّر 30% مع أول دفعة' : 'طموحك في الصيانة يبدأ هنا', subtitle: 'كورس صيانة العربيات الكهربائية أونلاين', body: '', date: '', time: '', objectives: '', cta: 'سجّل الآن' };
    return reply({ values, caption: 'اتعلم صيانة العربيات الكهربائية مع Engosoft.\nسجّل الآن.\n#Engosoft', scene: 'A technician checking an electric car in a blue-lit workshop.' });
  }) as typeof fetch;
  const out = await writeReferenceCopy(template, { idea: 'كورس صيانة العربيات الكهربائية أونلاين للمهندسين والفنيين' }, { OPENAI_API_KEY: 'test' });
  assert.equal(calls.length, 2, 'the made-up 30% is sent back once');
  assert.match(calls[1].content[0].text!, /title has the number 30/);
  assert.equal(out.values.title, 'طموحك في الصيانة يبدأ هنا');
  assert.equal(out.values.cta, 'سجّل الآن');
  assert.match(out.caption, /Engosoft/);
  // The copywriter sees the reference itself and its layout notes, and is told not to reuse its words.
  assert.ok(calls[0].content.some((part) => part.type === 'input_image' && part.image_url?.startsWith('data:image/jpeg;base64,')));
  assert.match(calls[0].instructions, /Short green highlighted Arabic headline/);
  assert.match(calls[0].instructions, /Never reuse a word from the reference image/);
});

test('a design from an idea: the written words reach the image prompt, and the reference\'s own logo goes on its spot', async () => {
  process.env.OPENAI_API_KEY = 'test';
  globalThis.fetch = (async () => reply({ values: { title: 'طموحك في الصيانة يبدأ هنا', subtitle: 'كورس صيانة العربيات الكهربائية', body: '', date: '', time: '', objectives: '', cta: 'سجّل الآن' }, caption: 'سجّل الآن.', scene: 'An electric car in a workshop.' })) as typeof fetch;
  const prompts: string[] = [];
  const blue = await renderReferenceDesign(byFile('automotive-enroll.jpg'), {}, 'feed', '', flat('#0443F2', prompts), undefined, { idea: 'كورس صيانة العربيات الكهربائية', logoKit: 'engo-soft-old' });
  assert.equal(blue.values.title, 'طموحك في الصيانة يبدأ هنا');
  assert.equal(blue.caption, 'سجّل الآن.');
  assert.equal(blue.logoKit, 'engo-soft-old');
  assert.match(prompts[0], /طموحك في الصيانة يبدأ هنا/);
  assert.match(prompts[0], /x=47px, y=45px, width=231px/);
  assert.match(prompts[0], /An electric car in a workshop/);
  const file = (url: string) => sharp(mediaDir('uploads', url.replace('/api/uploads/', ''))).png().toBuffer();
  const spot = { x: 47, y: 45, width: 231, height: 80 };
  // White strokes on blue: red rises well above the plain blue's 4.
  assert.ok((await statsAt(await file(blue.imageUrl), spot))[0].mean > 30, 'the white old lockup on the blue design');

  const light = await renderReferenceDesign(byFile('support.jpg'), { title: 'إحنا معاك' }, 'feed', 'دعم فني', flat('#F4F6FA'), undefined, { logoKit: 'engo-soft-old' });
  assert.equal(light.values.title, 'إحنا معاك', 'without an idea the words are used as they are');
  const [r, , b] = await statsAt(await file(light.imageUrl), { x: 53, y: 41, width: 205, height: 76 });
  assert.ok(r.mean < 200 && b.mean - r.mean > 25, `the full-colour old lockup on the light design, got ${r.mean}/${b.mean}`);

  // Swapping to the official logo needs no new image: same logo-free original, the other logo.
  const swapped = await relogoReferenceDesign(byFile('support.jpg'), light.imageUrl, 'feed', undefined, 'official');
  assert.notEqual(swapped.imageUrl, light.imageUrl);
  assert.equal(swapped.width, 1080);
  assert.ok(!(await file(swapped.imageUrl)).equals(await file(light.imageUrl)));
  await assert.rejects(relogoReferenceDesign(byFile('support.jpg'), '/api/uploads/00000000-0000-0000-0000-000000000000.png', 'feed', undefined, 'official'), /قبل إتاحة تغيير اللوجو/);
});

test('without a logo pick the prompt keeps the official logo\'s reserved corner, as before', () => {
  const prompt = referencePrompt(byFile('automotive-hero.jpg'), { title: 'دورة' }, 'feed', '');
  assert.match(prompt, /width=22%, height=15%/);
  assert.match(prompt, /exact official logo will be composited/);
  assert.match(referencePrompt(byFile('automotive-hero.jpg'), { title: 'دورة' }, 'feed', '', undefined, { logoKit: 'engo-soft-old' }), /reference's own logo file will be composited/);
});
