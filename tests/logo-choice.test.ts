/**
 * The logo picked on the AI Create page (official or the older «ENGO | SOFT» lockup) goes on every size of the
 * design, from its file: in the corner found for the logo, at a followed design's logo spot, on a story, and in the
 * layout of a design laid out by code.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';

process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'logo-choice-'));

const { placeKitInBox } = await import('../server/creative-intelligence/brand/place-logo');
const { compositeLogo } = await import('../server/creative-intelligence/logo-resolution/compositor');
const { placeChosenLogo, produceDirection } = await import('../server/creative-intelligence/generation/full-creative');
const { placeOwnLogo, resolveFollowDesign } = await import('../server/creative-intelligence/generation/follow-design');
const { designDocFromTemplate, templateValuesOf } = await import('../src/domain/design-doc');
const { brandSamples, brandTemplate } = await import('../src/domain/brand-templates');
const { layoutOnServer } = await import('../server/creative-intelligence/render/template-render');
const { fullCreativeBody } = await import('../src/features/creative-studio/creativeRequest');
type Brief = import('../server/creative-intelligence/generation/full-creative').CreativeBriefPlan;
type LogoDecision = import('../server/creative-intelligence/logo-resolution/resolver').LogoDecision;

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

const plain = (width: number, height: number, background: string) => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
const statsAt = async (png: Buffer, box: { x: number; y: number; width: number; height: number }) =>
  (await sharp(await sharp(png).extract({ left: box.x, top: box.y, width: box.width, height: box.height }).toBuffer()).stats()).channels;
const decision = (variantId: LogoDecision['variantId'], placement: LogoDecision['placement']): LogoDecision => ({
  variantId, placement, reason: 'clean corner', confidence: 1, backgroundAssessment: { backgroundClass: 'dark-photographic', luminance: 0.2, contrast: 1, visualComplexity: 0 },
  policy: 'engineering-default', requiresCreativeRepair: false, resolverVersion: 'test',
} as LogoDecision);

test('the old lockup sits in the corner found for the logo, at its own shape, never past its size cap', async () => {
  const canvas = await plain(1080, 1350, '#0443F2');
  const left = (await placeKitInBox(canvas, 'engo-soft-old', { x: 60, y: 50, width: 400, height: 255, anchor: 'top-left' }, true))!;
  assert.equal(left.kit, 'engo-soft-old');
  assert.ok(left.box.width <= 214 * 1.25 + 1, `capped, got ${left.box.width}`);
  // The file's transparent margin is trimmed, so the mark can sit a few pixels inside the box.
  assert.ok(Math.abs(left.box.x - 60) <= 2 && Math.abs(left.box.y - 50) <= 6, JSON.stringify(left.box));
  assert.ok(Math.abs(left.box.width / left.box.height - 214 / 76) < 0.3, `own shape, got ${left.box.width}×${left.box.height}`);
  assert.ok((await statsAt(left.image, left.box))[0].mean > 30, 'white strokes drawn (plain blue red is 4)');
  const right = (await placeKitInBox(canvas, 'engo-soft-old', { x: 680, y: 50, width: 340, height: 120, anchor: 'top-right' }, true))!;
  assert.ok(Math.abs(right.box.x + right.box.width - 1020) <= 2, `held to the right edge, got ${JSON.stringify(right.box)}`);
});

test('on a light background the white-only old lockup is drawn in navy, without the blue shadow', async () => {
  const canvas = await plain(1080, 1350, '#F4F6FA');
  const placed = (await placeKitInBox(canvas, 'engo-soft-old', { x: 60, y: 50, width: 260, height: 100, anchor: 'top-left' }, false))!;
  const [r, g, b] = await statsAt(placed.image, placed.box);
  assert.ok(r.mean < 200 && b.mean < 220, `dark strokes on the light corner, got ${r.mean}/${g.mean}/${b.mean}`);
  // Nothing outside the logo's box changed: no shadow below it.
  const below = await statsAt(placed.image, { x: placed.box.x, y: placed.box.y + placed.box.height, width: placed.box.width, height: 12 });
  assert.ok(below[0].min >= 0xF0, 'no shadow under a navy mark');
});

test('placeChosenLogo: the official logo is the verified compositor; the old one replaces it in the same corner', async () => {
  const canvas = await plain(1080, 1350, '#0443F2');
  const logo = decision('lockup-reversed', { x: 60, y: 50, width: 240, height: 153, anchor: 'top-left' });
  const official = await placeChosenLogo(canvas, logo, undefined);
  const direct = await compositeLogo(canvas, { variantId: 'lockup-reversed', x: 60, y: 50, width: 240 });
  assert.ok(official.image.equals(direct.image));
  assert.ok(official.official, 'the official composite is kept for its pixel check');
  const old = await placeChosenLogo(canvas, logo, 'engo-soft-old');
  assert.equal(old.official, undefined);
  assert.match(old.logo.reason, /older ENGO \| SOFT/);
  assert.equal(old.logo.placement.anchor, 'top-left');
  assert.ok(old.box.height < 153, 'the wide old lockup is shorter than the stacked official one');
  assert.ok(!old.image.equals(official.image));
});

test('the 50/50 design with the new logo picked: the official file goes at the design\'s logo spot', async () => {
  const design = (await resolveFollowDesign({ templateId: 'brand-campaign-offer' }, '00000000-0000-4000-8000-0000000000a1'))!;
  const canvas = await plain(1080, 1350, '#0443F2');
  const own = (await placeOwnLogo(canvas, design.logo!, { same: true, designAspect: 0.8 }))!;
  const official = (await placeOwnLogo(canvas, design.logo!, { same: true, designAspect: 0.8, kit: 'official' }))!;
  assert.ok(Math.abs(official.box.x - own.box.x) <= 8 && Math.abs(official.box.y - own.box.y) <= 20, `${JSON.stringify(official.box)} vs ${JSON.stringify(own.box)}`);
  // The official horizontal lockup is wider for its height than the old one (3.9 against 2.8).
  assert.ok(official.box.width / official.box.height > 3.3, JSON.stringify(official.box));
  assert.ok((await statsAt(official.image, official.box))[0].mean > 30, 'white official artwork drawn');
});

/* The design pipeline with a fake image model (a plain blue picture) and a critic that accepts what it sees. */
const BRIEF: Brief = {
  language: 'ar', objective: 'Course launch', audience: 'Engineers',
  canonicalCopy: { headline: 'قُد المرافق باحتراف', subheadline: '', cta: 'سجّل الآن' },
  caption: '', captions: { facebook: '', instagram: '', whatsapp: '', linkedin: '', tiktok: '', snapchat: '', website: '' },
  directions: [{ id: 'd1', name: 'Hero', concept: 'A manager', subject: 'A manager', composition: 'Headline right', palette: 'Blue', typography: 'Bold', mood: 'Confident' }],
};
const ENV = { OPENAI_API_KEY: 'test', CREATIVE_FINAL_CHECK: 'off', CREATIVE_CANDIDATES: '1' } as NodeJS.ProcessEnv;
const provider = {
  name: 'fake', model: 'fake-image',
  generate: async (r: { size: string }) => { const [w, h] = r.size.split('x').map(Number); return [{ png: await plain(w, h, '#0046ff'), model: 'fake-image', size: r.size, quality: 'high' as const, latencyMs: 1 }]; },
  edit: async (r: { size: string }) => { const [w, h] = r.size.split('x').map(Number); return [{ png: await plain(w, h, '#0046ff'), model: 'fake-image', size: r.size, quality: 'high' as const, latencyMs: 1 }]; },
};
const accept = () => {
  const seen = {
    texts: [{ text: 'قُد المرافق باحتراف', box: { x: 0.45, y: 0.4, width: 0.5, height: 0.1 } }, { text: 'سجّل الآن', box: { x: 0.6, y: 0.8, width: 0.3, height: 0.06 } }],
    faces: [], subjects: [], logosOrWatermarks: [], copyAudit: [], defects: [], scores: { design: 8, marketing: 8, imageQuality: 8, brandFit: 8 }, verdict: 'accept', summary: '', critique: null, repairs: [],
  };
  globalThis.fetch = (async () => Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(seen) }] }] })) as typeof fetch;
};
const dirFor = (name: string) => { const dir = resolve(process.env.MEDIA_DIR!, name); mkdirSync(dir, { recursive: true }); return dir; };

for (const [format, mode, size] of [['feed', 'model', [1080, 1350]], ['instagram-story', 'model', [1080, 1920]], ['instagram-story', 'typeset', [1080, 1920]]] as const) {
  test(`the old logo picked on the Create page is on the ${format} design (${mode} text)`, async () => {
    accept();
    const result = await produceDirection({ provider, brief: BRIEF, direction: BRIEF.directions[0], format, quality: 'high', dir: dirFor(`${format}-${mode}`), env: ENV, mode, logoKit: 'engo-soft-old' });
    assert.ok(result.imagePath && existsSync(result.imagePath), result.problems.join(' | '));
    assert.equal(result.logo.requiresCreativeRepair, false);
    assert.match((result.logo as LogoDecision).reason, /older ENGO \| SOFT/);
    const box = (result.logo as LogoDecision).placement;
    assert.ok(box.width <= 214 * 1.25 + 1, `capped, got ${box.width}`);
    const meta = await sharp(result.imagePath!).metadata();
    assert.deepEqual([meta.width, meta.height], size);
    const at = await statsAt(await sharp(result.imagePath!).png().toBuffer(), box);
    assert.ok(at[0].mean > 30, `old lockup strokes at its box (plain blue red is 0), got ${at[0].mean}`);
    assert.ok(!result.problems.some((p) => /Logo composite/.test(p)), result.problems.join(' | '));
  });
}

test('without a pick the design keeps the official logo', async () => {
  accept();
  const result = await produceDirection({ provider, brief: BRIEF, direction: BRIEF.directions[0], format: 'feed', quality: 'high', dir: dirFor('default'), env: ENV });
  assert.doesNotMatch((result.logo as LogoDecision).reason, /older/);
  assert.match((result.logo as LogoDecision).variantId, /reversed$/);
});

test('a design laid out by code draws the kit its document carries', () => {
  const campaign = brandTemplate('brand-campaign-offer')!;
  const doc = designDocFromTemplate(campaign, brandSamples(campaign, 'ar'), 'blue');
  const canvas = { width: 1080, height: 1350, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  const svgOf = (d: typeof doc) => { const t = templateValuesOf(d)!; return JSON.stringify(layoutOnServer({ ...t, canvas })); };
  assert.equal(templateValuesOf(doc)!.template, campaign, 'its own kit: the template as it is');
  assert.match(svgOf(doc), /engosoft-old-lockup-reversed\.png/);
  const official = { ...doc, logo: { ...doc.logo, kit: 'official' as const } };
  assert.equal(templateValuesOf(official)!.template.logo, undefined);
  assert.doesNotMatch(svgOf(official), /engosoft-old-lockup-reversed\.png/);
  assert.match(svgOf(official), /engosoft-horizontal-reversed\.svg/);
  const offer = brandTemplate('brand-offer')!;
  const old = designDocFromTemplate(offer, brandSamples(offer, 'ar'), 'blue');
  assert.equal(templateValuesOf({ ...old, logo: { kit: 'engo-soft-old' } })!.template.logo?.kit, 'engo-soft-old');
});

test('the Create page sends the picked logo with the request', () => {
  assert.equal(fullCreativeBody({ prompt: 'دورة جديدة', format: 'feed', directions: 1, logoKit: 'engo-soft-old' }).logoKit, 'engo-soft-old');
  assert.equal('logoKit' in fullCreativeBody({ prompt: 'دورة جديدة', format: 'feed', directions: 1 }), false);
});
