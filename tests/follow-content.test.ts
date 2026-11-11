import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';
process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'follow-content-'));
const { courseShown, digitsOf, dropInventedNumbers, followContentInstructions, followCopy, missingNumbers, planFollowContent } = await import('../server/creative-intelligence/generation/follow-content');
const { followDesignPrompt, placeArtworks, placeOwnLogo, resolveFollowDesign } = await import('../server/creative-intelligence/generation/follow-design');
const { produceDirection, planFollowCreative } = await import('../server/creative-intelligence/generation/full-creative');
const { FallbackImageProvider, ImageProviderError } = await import('../server/creative-intelligence/generation/provider');
const { checkCopy, copyPasses } = await import('../server/creative-intelligence/typography-validation/copy-check');
const { drawSizeFor } = await import('../src/domain/output-presets');
type Block = import('../server/creative-intelligence/typography-validation/copy-check').CopyBlock;

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

/** The user's own request for the 50/50 design, line by line. */
const REQUEST = 'مع التطور العمراني في المملكة.. فرص جديدة للمصممين!\n\nحوّل شغفك بالتصميم الداخلي لمهارة احترافية مطلوبة في سوق العمل.\n\nعرض الخمسين خمسين\n50% خصم + 50% كاش باك\n\n بعد  1000\nقبل 2000';
const BLOCKS: Block[] = [
  { role: 'Headline', kind: 'headline', was: 'مشاريع أكبر.. ومسؤوليات أعلى!', text: 'مع التطور العمراني في المملكة.. فرص جديدة للمصممين!', highlight: 'مع التطور العمراني في المملكة..', box: { x: 0.08, y: 0.38, width: 0.84, height: 0.07 } },
  { role: 'Course tape', kind: 'line', was: 'جهّز نفسك لشهادة PMP', text: 'حوّل شغفك بالتصميم الداخلي', box: { x: 0.13, y: 0.46, width: 0.74, height: 0.07 } },
  { role: 'Line under the tape', kind: 'line', was: 'واستثمر في خطوتك المهنية الجاية', text: 'لمهارة احترافية مطلوبة في سوق العمل.', box: { x: 0.1, y: 0.54, width: 0.8, height: 0.07 } },
  { role: 'New price ticket', kind: 'price', was: '700', text: '1000', box: { x: 0.37, y: 0.63, width: 0.3, height: 0.08 } },
  { role: '«Instead of» tag', kind: 'label', was: 'بدل', text: 'بدل', box: { x: 0.4, y: 0.72, width: 0.2, height: 0.06 } },
  { role: 'Old price', kind: 'price', was: '1,400', text: '2000', box: { x: 0.42, y: 0.79, width: 0.2, height: 0.06 } },
  { role: 'Website', kind: 'mark', was: 'www.engosoft.com', text: 'www.engosoft.com', box: { x: 0.02, y: 0.94, width: 0.27, height: 0.03 } },
];
const responses = (handlers: Record<string, (body: { input: { content: { type: string; text?: string }[] }[] }) => unknown>) => {
  const seen: { name: string; body: { input: { content: { type: string; text?: string }[] }[] } }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    const name = body.text.format.name as string;
    seen.push({ name, body });
    const handler = handlers[name];
    assert.ok(handler, `unexpected call ${name}`);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(handler(body)) }] }] });
  }) as typeof fetch;
  return seen;
};
const content = (blocks: Block[]) => ({ language: 'ar', objective: 'Offer', audience: 'Designers', photos: '', blocks: blocks.map((b) => ({ highlight: '', box: { x: 0, y: 0, width: 0, height: 0 }, ...b, was: b.was ?? '' })) });

test('numbers are compared whatever their digits or separators', () => {
  assert.equal(digitsOf('١٬٠٠٠ و 2,000 و ۳'), '1000 و 2000 و 3');
  assert.deepEqual(missingNumbers(REQUEST, BLOCKS.slice(0, 4), ['عرض الخمسين خمسين %50 خصم %50 كاش باك']), ['2000']);
  assert.deepEqual(missingNumbers(REQUEST, BLOCKS, ['%50']), []);
});

test('a number nobody gave removes its block; series marks are left alone', () => {
  const { blocks, removed } = dropInventedNumbers([{ ...BLOCKS[3], text: '1400' }, { role: 'Phone', kind: 'mark', text: '+966 9200 16295' }, BLOCKS[0]], REQUEST);
  assert.deepEqual(removed, ['1400']);
  assert.equal(blocks[0].text, '');
  assert.equal(blocks[1].text, '+966 9200 16295');
  assert.equal(blocks[2].text, BLOCKS[0].text);
});

test('the content step keeps the person\'s lines, reads before/after as new and old price, and leaves the campaign artwork to its file', async () => {
  const design = (await resolveFollowDesign({ templateId: 'brand-campaign-offer' }, '00000000-0000-4000-8000-000000000010'))!;
  const rules = followContentInstructions(design);
  assert.match(rules, /use those lines exactly as written/);
  assert.match(rules, /«بعد 1000» and «قبل 2000»/);
  assert.match(rules, /عرض الخمسين خمسين/);
  assert.match(rules, /Never drop a fact the person wrote/);
  assert.equal(design.artworks?.length, 2);
  assert.match(design.structure!, /Old price: «1,400»/);
});

test('a number left off the post sends the content back once, and the second answer is kept', async () => {
  const design = (await resolveFollowDesign({ templateId: 'brand-campaign-offer' }, '00000000-0000-4000-8000-000000000011'))!;
  let call = 0;
  const seen = responses({ engosoft_follow_design_content: () => content(++call === 1 ? BLOCKS.filter((b) => b.text !== '2000') : BLOCKS) });
  const { content: out, notes } = await planFollowContent({ design, request: REQUEST, facts: ['يبدأ الأحد 24 نوفمبر'], env: { OPENAI_API_KEY: 'test' } });
  assert.equal(seen.length, 2);
  assert.match(seen[1].body.input[0].content[0].text!, /left these off the post: 2000/);
  // The course date (24) is allowed but not required, so it is not reported missing.
  assert.deepEqual(notes, []);
  assert.deepEqual(out.blocks.map((b) => b.text), BLOCKS.map((b) => b.text));
  assert.equal(out.blocks[0].highlight, 'مع التطور العمراني في المملكة..');
  // The design image goes along at full detail.
  assert.equal(seen[0].body.input[0].content[1].type, 'input_image');
});

test('the copy of a followed design is its blocks, and every price is checked', () => {
  const copy = followCopy(BLOCKS);
  assert.equal(copy.headline, BLOCKS[0].text);
  assert.equal(copy.subheadline, BLOCKS[1].text);
  assert.equal(copy.blocks?.length, 7);
  const read = [BLOCKS[0].text, BLOCKS[1].text, BLOCKS[2].text, '1000', 'بدل', 'www.engosoft.com'];
  const checks = checkCopy(copy, read);
  const old = checks.find((c) => c.expected === '2000')!;
  assert.equal(old.verdict, 'missing');
  assert.equal(old.critical, true);
  assert.equal(copyPasses(checks), false);
  assert.equal(copyPasses(checkCopy(copy, [...read, '2000'])), true);
});

test('the image prompt is one exact-copy brief: every block in its place, nothing about prices being forbidden', () => {
  const artworks = [{ key: 'stamp', path: '/x.png', place: { x: 0.365, y: 0.13, width: 0.27, height: 0.215 }, says: 'عرض الخمسين خمسين' }];
  const same = followDesignPrompt({ blocks: [...BLOCKS, { role: 'Badge', kind: 'label', was: 'خصم', text: '' }], photos: '', canvasLabel: 'Feed post 4:5', designAspect: 0.8, canvasAspect: 0.8, artworks });
  for (const block of BLOCKS) assert.ok(same.includes(`«${block.text}»`), block.text);
  assert.match(same, /where Image 1 has «1,400»\): «2000»/);
  assert.match(same, /Colour «مع التطور العمراني في المملكة\.\.»/);
  assert.match(same, /Remove these blocks of Image 1 and close the gap: «خصم»/);
  assert.match(same, /«عرض الخمسين خمسين» at 37–64% across, 13–35% down/);
  assert.match(same, /never drop, cut or abbreviate a word/);
  assert.doesNotMatch(same, /different shape/);
  assert.doesNotMatch(same, /prices, seals/);
  const story = followDesignPrompt({ blocks: BLOCKS, photos: 'an interior designer at work', canvasLabel: 'Story 9:16', designAspect: 0.8, canvasAspect: 9 / 16, artworks });
  assert.match(story, /rearrange them to fit this canvas/);
  assert.match(story, /Do not draw Image 1's campaign artwork/);
  assert.match(story, /Replace every photo or person in Image 1 with: an interior designer at work/);
});

test('campaign artwork is placed from its file inside its box, centred and not stretched', async () => {
  const design = (await resolveFollowDesign({ templateId: 'brand-campaign-offer' }, '00000000-0000-4000-8000-000000000012'))!;
  const blank = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#0046ff' } }).png().toBuffer();
  const { image, placed } = await placeArtworks(blank, design.artworks!);
  const stamp = placed.find((p) => p.key === 'stamp')!.box;
  assert.ok(stamp.x >= Math.round(0.365 * 1080) && stamp.x + stamp.width <= Math.round(0.635 * 1080) + 1);
  assert.ok(stamp.y >= Math.round(0.13 * 1350) && stamp.y + stamp.height <= Math.round(0.345 * 1350) + 1);
  const hashtag = placed.find((p) => p.key === 'hashtag')!.box;
  assert.ok(Math.abs(hashtag.width / hashtag.height - 425 / 161) < 0.05);
  const { channels } = await sharp(image).extract({ left: stamp.x, top: stamp.y, width: stamp.width, height: stamp.height }).toBuffer().then((b) => sharp(b).stats());
  assert.ok(channels[1].mean > 120, 'the stamp changed the pixels in its box (plain blue is 70)');
});

test('designs are drawn larger than the post and scaled down, within the stable sizes', () => {
  assert.equal(drawSizeFor(1080, 1350, 1.5).size, '1632x2032');
  assert.equal(drawSizeFor(1080, 1920, 1.5).size, '1440x2560');
  assert.equal(drawSizeFor(1080, 1350, 1).size, '1088x1360');
});

test('the precise model falls back to the fast one when it cannot draw, and stays there', async () => {
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#fff' } }).png().toBuffer();
  const calls: string[] = [];
  const fake = (model: string, fail?: Error) => ({ name: 'fake', model, generate: async () => { calls.push(model); if (fail) throw fail; return [{ png, model, size: '16x16', quality: 'high' as const, latencyMs: 0 }]; }, edit: async () => { calls.push(model); if (fail) throw fail; return [{ png, model, size: '16x16', quality: 'high' as const, latencyMs: 0 }]; } });
  const provider = new FallbackImageProvider(fake('sunburst', new ImageProviderError('server error', 500)), fake('flare'));
  const [image] = await provider.edit({ prompt: 'x', size: '16x16', quality: 'high', images: [] });
  assert.equal(image.model, 'flare');
  assert.equal(provider.model, 'flare');
  await provider.generate({ prompt: 'x', size: '16x16', quality: 'high' });
  assert.deepEqual(calls, ['sunburst', 'flare', 'flare']);
  const strict = new FallbackImageProvider(fake('sunburst', new ImageProviderError('Your prompt was rejected', 400)), fake('flare'));
  await assert.rejects(strict.generate({ prompt: 'x', size: '16x16', quality: 'high' }), /rejected/);
});

test('a followed design is redrawn from the design itself, a missing price is lettered at its spot, and the stamp goes back exactly', async () => {
  const requestId = '00000000-0000-4000-8000-000000000013';
  const design = (await resolveFollowDesign({ templateId: 'brand-campaign-offer' }, requestId))!;
  const env = { OPENAI_API_KEY: 'test', CREATIVE_FINAL_CHECK: 'off', CREATIVE_CANDIDATES: '1' } as NodeJS.ProcessEnv;
  responses({
    engosoft_follow_design_content: () => content(BLOCKS),
    engosoft_captions: () => ({ captionWriter: { caption: 'كابشن', captions: { facebook: 'f', instagram: 'i', whatsapp: 'w', linkedin: 'l', tiktok: 't', snapchat: 's', youtube: 'y', website: 'web' } } }),
  });
  const { brief, captions } = await planFollowCreative(REQUEST, design, 1, undefined, env);
  assert.equal(brief.canonicalCopy.blocks?.length, 7);
  assert.equal((await captions)?.caption, 'كابشن');

  // The drawn post: blue, with a calm top-left corner for the logo.
  const drawn = await sharp({ create: { width: 1632, height: 2032, channels: 3, background: '#0046ff' } }).png().toBuffer();
  const calls: { prompt: string; size: string; images: number; mask: boolean }[] = [];
  const provider = {
    name: 'fake', model: 'gpt-image-2.5-sunburst',
    generate: async () => { throw new Error('a followed design is an edit of the design'); },
    edit: async (r: { prompt: string; size: string; images: unknown[]; mask?: Buffer }) => { calls.push({ prompt: r.prompt, size: r.size, images: r.images.length, mask: Boolean(r.mask) }); return [{ png: drawn, model: 'gpt-image-2.5-sunburst', size: r.size, quality: 'high' as const, latencyMs: 1 }]; },
  };
  let inspections = 0;
  const texts = (all: boolean) => BLOCKS.filter((b) => all || b.text !== '2000').map((b) => ({ text: b.text, box: b.box! }));
  responses({
    engosoft_creative_inspection: () => {
      const all = ++inspections > 1;
      return { texts: texts(all), faces: [], subjects: [], logosOrWatermarks: [], copyAudit: [], defects: [], scores: { design: 8, marketing: 8, imageQuality: 8, brandFit: 8 }, verdict: 'accept', summary: '', critique: null, repairs: [] };
    },
  });
  const dir = process.env.MEDIA_DIR!;
  const result = await produceDirection({ provider, brief, direction: brief.directions[0], format: 'feed', quality: 'high', dir, env, follow: design, campaign: { id: 'template:x', name: 'x', slogan: '', hashtag: '', stampPath: design.artworks![0].path, keyVisualPath: '', corner: 'top-right', width: 0.3 } });
  // First call: the redraw, from the design alone, at the larger draw size.
  assert.equal(calls[0].size, '1632x2032');
  assert.equal(calls[0].images, 1);
  assert.match(calls[0].prompt, /DESIGN TO COPY — Image 1/);
  assert.doesNotMatch(calls[0].prompt, /CAMPAIGN STAMP RESERVATION/);
  // Second call: the missing old price lettered in its spot, with the design as the guide.
  assert.ok(calls[1].mask);
  assert.equal(calls[1].images, 2);
  assert.match(calls[1].prompt, /Area 1 is missing its text: letter «2000» there/);
  assert.ok(result.imagePath, result.problems.join('; '));
  assert.ok(result.copyChecks.every((c) => c.verdict === 'exact'), JSON.stringify(result.copyChecks));
  assert.equal(result.refinements?.some((r) => r.startsWith('TEXT_REPAIR')), true);
  // The 50/50 stamp is back at its own spot in the finished post.
  const { channels } = await sharp(result.imagePath!).extract({ left: Math.round(0.4 * 1080), top: Math.round(0.15 * 1350), width: Math.round(0.2 * 1080), height: Math.round(0.17 * 1350) }).toBuffer().then((b) => sharp(b).stats());
  assert.ok(channels[1].mean > 120, 'stamp pixels at the stamp spot (plain blue is 70)');
  // The design's own older logo, not the official one, at the spot it has in the design.
  assert.match((result.logo as { reason: string }).reason, /own logo/);
  const logo = await sharp(result.imagePath!).extract({ left: 34, top: 45, width: 205, height: 67 }).toBuffer().then((b) => sharp(b).stats());
  assert.ok(logo.channels[0].mean > 50, `white logo strokes at the logo spot (plain blue red is 0), got ${logo.channels[0].mean}`);
});

test('the 50/50 design keeps its own older logo: at its spot on its shape, in the same corner on others, never enlarged', async () => {
  const design = (await resolveFollowDesign({ templateId: 'brand-campaign-offer' }, '00000000-0000-4000-8000-000000000014'))!;
  assert.match(design.logo!.path, /engosoft-old-lockup-reversed\.png$/);
  const canvas = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#0443f2' } }).png().toBuffer();
  const feed = (await placeOwnLogo(await canvas(1080, 1350), design.logo!, { same: true, designAspect: 0.8 }))!;
  // Measured in the design: 205×67 at 34,45.
  assert.ok(Math.abs(feed.box.x - 34) <= 3 && Math.abs(feed.box.y - 45) <= 4, JSON.stringify(feed.box));
  assert.ok(Math.abs(feed.box.width - 207) <= 3, JSON.stringify(feed.box));
  const white = await sharp(feed.image).extract({ left: feed.box.x, top: feed.box.y, width: feed.box.width, height: feed.box.height }).toBuffer().then((b) => sharp(b).stats());
  assert.ok(white.channels[0].mean > 50, 'the logo is drawn (plain blue red is 4)');
  // A story: top-left again, below the platform's top bar, the same width share.
  const story = (await placeOwnLogo(await canvas(1080, 1920), design.logo!, { same: false, designAspect: 0.8, safe: { top: 230, left: 0 } }))!;
  assert.ok(story.box.y >= 230 && story.box.x < 60, JSON.stringify(story.box));
  assert.ok(Math.abs(story.box.width - 208) <= 3, JSON.stringify(story.box));
  // A wide banner sizes it from its height, like the official logo.
  const wide = (await placeOwnLogo(await canvas(1200, 630), design.logo!, { same: false, designAspect: 0.8 }))!;
  assert.ok(wide.box.width < 190 && wide.box.x < 50, JSON.stringify(wide.box));
});

test('the course name the person typed must be on the post, exactly as written', async () => {
  const block = (text: string): Block => ({ role: 'Course tape', kind: 'line', text });
  assert.equal(courseShown('دبلومة التصميم الداخلي', [block('جهّز نفسك لدبلومة التصميم الداخلي')]), true);
  assert.equal(courseShown('دبلومة التصميم الداخلى', [block('دبلومة التصميم الداخلي')]), true);
  assert.equal(courseShown('دبلومة التصميم الداخلي', [block('حوّل شغفك بالتصميم الداخلي')]), false);
  const design = (await resolveFollowDesign({ templateId: 'brand-campaign-offer' }, '00000000-0000-4000-8000-000000000015'))!;
  assert.match(followContentInstructions(design), /When a course name is given, it is on the post exactly as written/);
  const withCourse = [BLOCKS[0], { ...BLOCKS[1], text: 'دبلومة التصميم الداخلي' }, { ...BLOCKS[2], text: 'حوّل شغفك بالتصميم الداخلي لمهارة احترافية مطلوبة في سوق العمل.' }, ...BLOCKS.slice(3)];
  let call = 0;
  const seen = responses({ engosoft_follow_design_content: () => content(++call === 1 ? BLOCKS : withCourse) });
  const { content: out, notes } = await planFollowContent({ design, request: REQUEST, facts: [], env: { OPENAI_API_KEY: 'test' }, course: ' دبلومة التصميم  الداخلي ' });
  assert.equal(seen.length, 2);
  assert.match(seen[0].body.input[0].content[0].text!, /Course name \(must be on the post exactly as written\): «دبلومة التصميم الداخلي»/);
  assert.match(seen[1].body.input[0].content[0].text!, /left these off the post: the course name «دبلومة التصميم الداخلي»/);
  assert.deepEqual(notes, []);
  assert.equal(out.blocks[1].text, 'دبلومة التصميم الداخلي');
});
