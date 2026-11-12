import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';
process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'art-direction-'));
const { resolveFollowDesign } = await import('../server/creative-intelligence/generation/follow-design');
const { evolveDesignPrompt } = await import('../server/creative-intelligence/generation/art-direction');
const { clearDrawnLogo, produceDirection, planFollowCreative } = await import('../server/creative-intelligence/generation/full-creative');
type Block = import('../server/creative-intelligence/typography-validation/copy-check').CopyBlock;

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const responses = (handlers: Record<string, (body: { input: { content: { type: string; text?: string }[] }[] }) => unknown>) => {
  const seen: { name: string; body: { input: { content: { type: string; text?: string; image_url?: string }[] }[] } }[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const name = body.text.format.name as string;
    seen.push({ name, body });
    assert.ok(handlers[name], `unexpected call ${name}`);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(handlers[name](body)) }] }] });
  }) as typeof fetch;
  return seen;
};

const BLOCKS: Block[] = [
  { role: 'Headline', kind: 'headline', was: 'سجّل الآن وابدأ مسارك', text: 'احترف Primavera P6 مع خبراء التخطيط', highlight: 'Primavera P6' },
  { role: 'Instructor name', kind: 'line', was: 'م. أحمد', text: 'م. محمد سالم' },
  { role: 'Website', kind: 'mark', was: 'www.engosoft.com', text: 'www.engosoft.com' },
];
const DIRECTION = { concept: 'The instructor leads a planning masterclass.', composition: 'Instructor cut out on the right, headline stacked on the left.', emphasis: 'Primavera P6 in green, biggest.', visual: 'A soft Gantt chart in perspective behind the instructor.', background: 'Deep brand blue with a light from the top right.', details: 'Thin green accent lines, soft shadow under the instructor.' };
const photoUrl = async () => `data:image/png;base64,${(await sharp({ create: { width: 400, height: 500, channels: 3, background: '#aa8866' } }).png().toBuffer()).toString('base64')}`;

test('every template except an exact one evolves, and the person\'s photos are saved with it', async () => {
  const evolving = (await resolveFollowDesign({ templateId: 'brand-instructor', photos: [{ label: 'Instructor photo', dataUrl: await photoUrl() }, { label: 'Bad', dataUrl: 'data:image/png;base64,AAAA' }] }, '00000000-0000-4000-8000-000000000101'))!;
  assert.equal(evolving.evolve, true);
  assert.equal(evolving.photos?.length, 1);
  assert.equal(evolving.photos?.[0].label, 'Instructor photo');
  const exact = (await resolveFollowDesign({ templateId: 'brand-campaign-offer' }, '00000000-0000-4000-8000-000000000102'))!;
  assert.equal(exact.evolve, undefined);
});

test('the evolve prompt starts from the template\'s brand world, follows the art direction, keeps every word and the person\'s photo', () => {
  const prompt = evolveDesignPrompt({ blocks: BLOCKS, direction: DIRECTION, canvasLabel: 'Feed post 4:5', photoLabels: ['Instructor photo'], photos: '' });
  assert.match(prompt, /BRAND WORLD — Image 1/);
  assert.match(prompt, /do not copy its layout/);
  assert.match(prompt, /Composition: Instructor cut out on the right/);
  assert.match(prompt, /1\. Headline \(headline\): «احترف Primavera P6 مع خبراء التخطيط» — colour «Primavera P6»/);
  assert.match(prompt, /Image 2 is the Instructor photo: use this exact photo/);
  assert.match(prompt, /top band of the canvas/);
  assert.match(prompt, /Nothing covers any letter/);
  assert.match(prompt, /no separate white or coloured header strip/);
  assert.doesNotMatch(prompt, /Redraw it exactly/);
});

test('an evolving template gets an art director\'s plan and is drawn from it, with the person\'s photo and no repair at the template\'s spots', async () => {
  const design = (await resolveFollowDesign({ templateId: 'brand-instructor', photos: [{ label: 'Instructor photo', dataUrl: await photoUrl() }] }, '00000000-0000-4000-8000-000000000103'))!;
  const env = { OPENAI_API_KEY: 'test', CREATIVE_FINAL_CHECK: 'off', CREATIVE_CANDIDATES: '1' } as NodeJS.ProcessEnv;
  const seen = responses({
    engosoft_follow_design_content: () => ({ language: 'ar', objective: 'Course', audience: 'Planners', photos: '', blocks: BLOCKS.map((b) => ({ highlight: '', box: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 }, ...b, was: b.was ?? '' })) }),
    engosoft_art_direction: () => DIRECTION,
    engosoft_captions: () => ({ captionWriter: { caption: 'كابشن', captions: { facebook: 'f', instagram: 'i', whatsapp: 'w', linkedin: 'l', tiktok: 't', snapchat: 's', youtube: 'y', website: 'web' } } }),
  });
  const { brief, captions } = await planFollowCreative('احترف Primavera P6 مع خبراء التخطيط\nم. محمد سالم', design, 1, undefined, env);
  await captions;
  assert.deepEqual(brief.follow?.direction, DIRECTION);
  assert.equal(brief.directions[0].concept, DIRECTION.concept);
  // The art director sees the template and the post's exact words.
  const asked = seen.find((s) => s.name === 'engosoft_art_direction')!;
  assert.match(asked.body.input[0].content[0].text!, /«احترف Primavera P6 مع خبراء التخطيط»/);
  assert.match(asked.body.input[0].content[0].text!, /Photos the person gave .*Instructor photo/);

  const drawn = await sharp({ create: { width: 1632, height: 2032, channels: 3, background: '#0443f2' } }).png().toBuffer();
  const calls: { prompt: string; images: number; mask: boolean }[] = [];
  const provider = {
    name: 'fake', model: 'gpt-image-2.5-sunburst',
    generate: async () => { throw new Error('a template is an edit of the template'); },
    edit: async (r: { prompt: string; size: string; images: unknown[]; mask?: Buffer }) => { calls.push({ prompt: r.prompt, images: r.images.length, mask: Boolean(r.mask) }); return [{ png: drawn, model: 'gpt-image-2.5-sunburst', size: r.size, quality: 'high' as const, latencyMs: 1 }]; },
  };
  // The instructor's name was left off the drawing.
  responses({
    engosoft_creative_inspection: () => ({ texts: [{ text: BLOCKS[0].text, box: { x: 0.5, y: 0.2, width: 0.4, height: 0.1 } }, { text: 'www.engosoft.com', box: { x: 0.05, y: 0.94, width: 0.3, height: 0.03 } }], faces: [], subjects: [], logosOrWatermarks: [], copyAudit: [], defects: [], scores: { design: 8, marketing: 8, imageQuality: 8, brandFit: 8 }, verdict: 'accept', summary: '', critique: null, repairs: [] }),
  });
  const result = await produceDirection({ provider, brief, direction: brief.directions[0], format: 'feed', quality: 'high', dir: process.env.MEDIA_DIR!, env, follow: design });
  assert.match(calls[0].prompt, /ART DIRECTION/);
  assert.match(calls[0].prompt, /Image 2 is the Instructor photo/);
  assert.equal(calls[0].images, 2, 'the template and the instructor photo');
  // No block is re-lettered at the template's spot: the evolved layout does not keep those spots.
  assert.equal(calls.filter((c) => c.mask && /is missing its text/.test(c.prompt)).length, 0);
  assert.ok(result.problems.some((p) => /«م\. محمد سالم» missing/.test(p)), result.problems.join('; '));
  assert.equal(result.status, 'needs_review');
});

test('a logo the image model drew in the top-left is cleared; an image without one is returned untouched', async () => {
  const W = 1080, H = 1350;
  const fake = await sharp({ create: { width: 240, height: 70, channels: 3, background: '#1040ff' } }).png().toBuffer();
  const drawn = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite([{ input: fake, left: 50, top: 55 }]).png().toBuffer();
  const placement = { x: 53, y: 53, width: 292, height: 75 };
  const none = await clearDrawnLogo(drawn, { logosOrWatermarks: [], texts: [{ text: 'www.engosoft.com', box: { x: 0.05, y: 0.94, width: 0.3, height: 0.03 } }] }, placement);
  assert.equal(none, drawn);
  const cleared = await clearDrawnLogo(drawn, { logosOrWatermarks: [{ description: 'Engosoft logo', box: { x: 0.045, y: 0.04, width: 0.23, height: 0.055 } }], texts: [] }, placement);
  const { channels } = await sharp(cleared).extract({ left: 50, top: 55, width: 240, height: 70 }).toBuffer().then((b) => sharp(b).stats());
  assert.ok(channels[0].mean > 240, `the drawn logo is gone (red mean ${channels[0].mean})`);
});
