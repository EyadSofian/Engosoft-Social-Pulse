import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'engosoft-typeset-')), 'test.sqlite');
process.env.DATABASE_URL = '';
const { initDb } = await import('../server/db');
const { typesetCreative, textColumn } = await import('../server/creative-intelligence/typography/typeset');
const { produceDirection, strayTexts, textModeFor, typesetPlanFor } = await import('../server/creative-intelligence/generation/full-creative');
const { compileDesignPrompt, DEFAULT_SETTINGS } = await import('../server/creative-intelligence/skills/engine');
await initDb();

const z = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const design = {
  layoutDesigner: { gridType: 'centred axis', balance: 'asymmetric', primaryFocalPoint: 'the engineer', secondaryFocalPoint: 'the headline', visualFlow: 'headline → subject → CTA', heroSubject: z(0.2, 0.5, 0.6, 0.45), headlineZone: z(0.1, 0.12, 0.8, 0.16), supportingCopyZone: z(0.1, 0.29, 0.8, 0.06), factsZone: z(0.1, 0.36, 0.8, 0.06), ctaZone: z(0.55, 0.43, 0.35, 0.06), negativeSpaceZones: [], depthPlan: '', rationale: '' },
  visualWeightDesigner: { regions: [], balanceCheck: '', toneDown: [] },
  spacingDesigner: { baseUnit: 0.02, edgeMarginUnits: 3, groupGapUnits: 2, elementGapUnits: 1, opticalCorrections: [], negativeSpacePurpose: 'room for the headline' },
  typographyDirector: { headlineLines: ['قُد المرافق', 'باحتراف'], scale: { headline: 0.06, subheadline: 0.03, facts: 0.02, cta: 0.025 }, alignment: 'right', emphasis: '', mixedScriptNotes: '', leading: '1.2' },
  imageArtDirector: { scene: 'plant room', subject: 'an engineer', subjectPlacement: 'lower half', environment: 'facility', camera: { shot: 'medium', angle: 'eye level', lens: '50mm', depthOfField: 'shallow' }, perspective: '', realism: 'photographic' },
  lightingDirector: { setup: 'soft', keyDirection: 'right', quality: 'soft', temperature: 'neutral', rim: 'subtle', atmosphere: 'haze', consistency: '' },
  colorDirector: { roles: { dominant: '#0B1530', secondary: '#1B2A4A', accent: '#FF6600', background: '#0B1530', text: '#FFFFFF', highlight: '#0046FF' }, harmony: 'neutral-accent', brandExpression: '', why: '' },
  brandDirector: { personality: '', brandColorUse: '', checks: [] },
  logoDirector: { mark: 'lockup', corner: 'top-left', reason: '' },
  photoshopCompositor: { layerStack: [], integration: [], risks: [] },
} as const;
const direction0 = { name: 'القائد', theme: 'corporate-premium', idea: 'Calm authority.', whyThisTheme: '', subjectStrategy: '', references: [] };
const strategy = {
  creativeDirector: { language: 'ar', objective: 'registration', audience: 'engineers', message: 'm', desiredReaction: 'interest', contentType: 'course', tone: 'pro', creativeOpportunity: '' },
  contentStrategist: { angle: '', motivation: '', proofPoints: [], mustAvoid: [] }, hookWriter: { hooks: [], chosen: 0 },
  copywriter: { headline: 'قُد المرافق باحتراف', subheadline: 'دورة CFM لإدارة المرافق', cta: 'سجّل الآن', emphasis: '' },
  captionWriter: { caption: '', captions: { facebook: '', instagram: '', whatsapp: '', linkedin: '', tiktok: '', snapchat: '', website: '' } },
  referenceDirector: { references: [] }, themeDirector: { directions: [direction0] },
};
const copy = { headline: 'قُد المرافق باحتراف', subheadline: 'دورة CFM لإدارة المرافق', facts: ['يبدأ الثلاثاء 24-11-2026', '8:30 مساءً بتوقيت السعودية • أونلاين'], cta: 'سجّل الآن' };

const canvas = (width: number, height: number, from: string, to: string) => sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width / 2}" cy="${height * 0.75}" r="${width * 0.18}" fill="#c08a5a"/></svg>`,
)).png().toBuffer();

test('typeset prompt asks for a text-free visual with calm text areas', () => {
  const prompt = compileDesignPrompt({ strategy: strategy as never, direction: direction0 as never, design: design as never, copy, format: { label: 'feed 4:5', story: false }, typeset: { headlineZone: design.layoutDesigner.headlineZone, ctaZone: design.layoutDesigner.ctaZone } });
  assert.doesNotMatch(prompt, /ENGOSOFT HOUSE STYLE|integrated typography/, 'a text-free visual is not asked for type');
  assert.match(prompt, /NO TEXT IN THE IMAGE/);
  assert.match(prompt, /headline x 10%–90%, y 12%–28%/);
  assert.match(prompt, /Absolutely no text/);
  assert.ok(!prompt.includes('render exactly these strings'), 'the image model is not asked to write the copy');
  assert.ok(!prompt.includes('«قُد المرافق باحتراف»'));
});

test('copy is set in brand fonts inside the canvas, in reading order, with readable colour', async () => {
  const image = await canvas(1080, 1350, '#0b1530', '#1b2a4a');
  const result = await typesetCreative({ image, copy, plan: { ...design.layoutDesigner, alignment: 'right', headlineLines: ['قُد المرافق', 'باحتراف'], headlineScale: 0.06 }, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, logo: { corner: 'top-left', mark: 'lockup' } });
  const meta = await sharp(result.png).metadata();
  assert.equal(meta.width, 1080); assert.equal(meta.height, 1350);
  assert.deepEqual(result.problems, []);
  assert.equal(result.layout.tone, 'light-text');
  assert.deepEqual(result.layout.blocks.map((b) => b.role), ['headline', 'subheadline', 'fact', 'fact', 'cta']);
  for (let i = 1; i < result.layout.blocks.length; i++) assert.ok(result.layout.blocks[i].box.y >= result.layout.blocks[i - 1].box.y + result.layout.blocks[i - 1].box.height, 'stacked without overlap');
  for (const b of result.layout.blocks) {
    assert.ok(b.box.x >= 0 && b.box.y >= 0 && b.box.x + b.box.width <= 1080 && b.box.y + b.box.height <= 1350, `${b.role} inside the canvas`);
  }
  // Right-aligned Arabic: every block ends at the column's right edge.
  const right = result.layout.column.x + result.layout.column.width;
  for (const b of result.layout.blocks) assert.ok(Math.abs(b.box.x + b.box.width - right) <= 2, `${b.role} right-aligned`);
  // The image changed where the text is, so something was actually drawn.
  const before = await sharp(image).extract({ left: 0, top: 150, width: 1080, height: 300 }).stats();
  const after = await sharp(result.png).extract({ left: 0, top: 150, width: 1080, height: 300 }).stats();
  assert.ok(Math.abs(after.channels[0].mean - before.channels[0].mean) > 3);
});

test('bright backgrounds get dark text', async () => {
  const result = await typesetCreative({ image: await canvas(1080, 1350, '#f4f6fb', '#dfe6f2'), copy: { headline: 'Lead facilities like a pro', cta: 'Register now' }, plan: {}, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, logo: { corner: 'top-left', mark: 'lockup' } });
  assert.equal(result.layout.tone, 'dark-text');
  assert.equal(result.layout.blocks[0].color, '#0B1530');
});

test('the text column keeps clear of the reserved logo corner and platform safe areas', () => {
  const col = textColumn({ headlineZone: z(0.02, 0.0, 0.9, 0.15) }, 1080, 1350, { top: 0, right: 0, bottom: 0, left: 0 }, { corner: 'top-left', mark: 'lockup' });
  assert.ok(col.y >= 0.2 * 1350, `starts below the logo zone, got ${col.y}`);
  const story = textColumn({ headlineZone: z(0.1, 0.0, 0.8, 0.1) }, 1080, 1920, { top: 230, right: 0, bottom: 330, left: 0 }, { corner: 'bottom-left', mark: 'symbol' });
  assert.ok(story.y >= 230, 'below the story top bar');
});

test('adaptations set the type where each shape is read', () => {
  const direction = { id: 'd1', name: 'n', concept: 'c', subject: 's', composition: 'x', palette: 'p', typography: 't', mood: 'm', engine: { strategy: direction0, design } } as never;
  assert.equal(typesetPlanFor(direction, 'feed', false).headlineZone, design.layoutDesigner.headlineZone);
  assert.ok(typesetPlanFor(direction, 'story', true).headlineZone!.y >= 0.12);
  assert.ok(typesetPlanFor(direction, 'landscape', true).headlineZone!.x >= 0.5, 'Arabic banner text on the right');
});

test('stray text is anything the critic read that is not the approved copy', () => {
  assert.deepEqual(strayTexts(['قد المرافق', 'باحتراف', 'سجل الآن', 'LOREM IPSUM'], [copy.headline, copy.cta]), ['LOREM IPSUM']);
  assert.deepEqual(strayTexts(['CFM', '24-11-2026'], [copy.subheadline, copy.facts[0]]), []);
  // Approved words drawn into the scene (a 3D «CFM» sign) are still stray: they are not where the copy was set.
  const placed = [{ x: 100, y: 100, width: 800, height: 150 }];
  const canvas = { width: 1000, height: 1000 };
  assert.deepEqual(strayTexts([{ text: 'CFM', box: z(0.3, 0.6, 0.3, 0.2) }, { text: 'دورة CFM', box: z(0.2, 0.11, 0.5, 0.1) }], [copy.subheadline], placed, canvas), ['CFM']);
});

test('typeset mode (CREATIVE_TEXT_MODE=typeset) sets the copy, places the logo and needs no spelling audit', async () => {
  const brief = { language: 'ar', objective: 'o', audience: 'a', caption: '', captions: strategy.captionWriter.captions, canonicalCopy: copy, directions: [], engine: { version: 'design-engine:v1', skills: {}, settings: DEFAULT_SETTINGS, strategy, references: [] } } as never;
  assert.equal(textModeFor(brief, {}), 'model', 'by default the image model designs the type into the post');
  assert.equal(textModeFor(brief, { CREATIVE_TEXT_MODE: 'typeset' }), 'typeset');
  const prompts: string[] = [];
  const visual = await canvas(1088, 1360, '#0b1530', '#14203d');
  const provider = { name: 'fake', model: 'fake-image', generate: async (r: { prompt: string }) => { prompts.push(r.prompt); return [{ png: visual, model: 'fake-image', size: '1088x1360', quality: 'high' as const, latencyMs: 1 }]; }, edit: async () => [{ png: visual, model: 'fake-image', size: '1088x1360', quality: 'high' as const, latencyMs: 1 }] };
  const inspection = { texts: [{ text: 'قد المرافق باحتراف', box: z(0.1, 0.23, 0.8, 0.13) }], faces: [], subjects: [], logosOrWatermarks: [], copyAudit: [], defects: [], scores: { design: 8, marketing: 8, imageQuality: 8, brandFit: 8 }, verdict: 'accept', summary: 'ok', critique: { rubric: {}, aiTells: [], compositingIssues: [], professionalTest: { designerWouldPublish: true, marketingWouldPublish: true, looksDesigned: true }, firstSeen: '' }, repairs: [] };
  const realFetch = globalThis.fetch;
  let visionCalls = 0;
  globalThis.fetch = (async (url: string) => {
    assert.match(String(url), /\/v1\/responses$/);
    visionCalls++;
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(inspection) }] }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  }) as typeof fetch;
  try {
    const dir = mkdtempSync(join(tmpdir(), 'engosoft-run-'));
    const stages: string[] = [];
    const result = await produceDirection({ provider, brief, direction: { id: 'd1', name: 'القائد', concept: 'c', subject: 's', composition: 'x', palette: 'p', typography: 't', mood: 'm', engine: { strategy: direction0, design } } as never, format: 'feed', quality: 'high', dir, env: { OPENAI_API_KEY: 'test', CREATIVE_TEXT_MODE: 'typeset' }, onProgress: (e) => stages.push(e.stage) });
    assert.equal(result.textMode, 'typeset');
    assert.equal(result.status, 'ready', result.problems.join(' | '));
    assert.ok(result.copyChecks.every((c) => c.verdict === 'exact'));
    assert.equal(result.logo.requiresCreativeRepair, false);
    assert.equal(visionCalls, 2, 'one critic pass and one final layout check, no audit or repair loop');
    assert.ok(stages.includes('typesetting'));
    assert.match(prompts[0], /NO TEXT IN THE IMAGE/);
    assert.ok(result.imagePath && existsSync(result.imagePath) && existsSync(result.cleanImagePath!));
    const meta = await sharp(result.imagePath!).metadata();
    assert.equal(meta.width, 1080); assert.equal(meta.height, 1350);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('another size is a new design at that canvas: the finished design is the last, labelled reference, never the image edited', async () => {
  const brief = { language: 'ar', objective: 'o', audience: 'a', caption: '', captions: strategy.captionWriter.captions, canonicalCopy: copy, directions: [], engine: { version: 'design-engine:v1', skills: {}, settings: DEFAULT_SETTINGS, strategy, references: [] } } as never;
  const master = await canvas(1088, 1360, '#ff6600', '#0046ff');
  const drawn = await canvas(1088, 1936, '#0b1530', '#14203d');
  const calls: { prompt: string; images: { data: Buffer; mime: string }[]; n?: number }[] = [];
  const provider = { name: 'fake', model: 'fake-image', generate: async () => { throw new Error('another size is drawn with references'); }, edit: async (r: { prompt: string; images: { data: Buffer; mime: string }[]; n?: number }) => { calls.push(r); return [{ png: drawn, model: 'fake-image', size: '1088x1936', quality: 'high' as const, latencyMs: 1 }]; } };
  const inspection = { texts: [], faces: [], subjects: [], logosOrWatermarks: [], copyAudit: [], defects: [], scores: { design: 8, marketing: 8, imageQuality: 8, brandFit: 8 }, verdict: 'accept', summary: 'ok', critique: { rubric: {}, aiTells: [], compositingIssues: [], professionalTest: { designerWouldPublish: true, marketingWouldPublish: true, looksDesigned: true }, firstSeen: '' }, repairs: [] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(inspection) }] }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 })) as typeof fetch;
  try {
    const dir = mkdtempSync(join(tmpdir(), 'engosoft-size-'));
    await produceDirection({ provider, brief, direction: { id: 'd1-instagram-story', name: 'القائد', concept: 'c', subject: 's', composition: 'x', palette: 'p', typography: 't', mood: 'm', engine: { strategy: direction0, design } } as never, format: 'instagram-story', quality: 'high', dir, env: { OPENAI_API_KEY: 'test' }, master, mode: 'model' });
    const [first] = calls;
    assert.equal(first.n, 1, 'one image for another size');
    assert.ok(first.images.length >= 2, 'house references plus the finished design');
    const last = await sharp(first.images.at(-1)!.data).metadata();
    assert.ok(Math.abs(last.width! / last.height! - 0.8) < 0.01, 'the finished design (4:5) is attached last');
    assert.match(first.prompt, /DESIGNED FROM SCRATCH/);
    assert.match(first.prompt, new RegExp(`Image ${first.images.length} is the approved design of this same post in another shape`));
    assert.match(first.prompt, /Do not copy, trace, extend or re-frame its layout/);
    assert.doesNotMatch(first.prompt, /The attached image is the approved master/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the layout plan is checked against the logo and stamp areas', async () => {
  const { planConflicts } = await import('../server/creative-intelligence/skills/engine');
  const { reservedAreas } = await import('../server/creative-intelligence/generation/full-creative');
  const campaign = { id: 'c', name: 'جمعة', slogan: '', hashtag: '#جمعة_تغير_مسارك', corner: 'bottom-right' as const, width: 0.3, stampPath: '', keyVisualPath: '' };
  const areas = await reservedAreas('story', campaign);
  assert.deepEqual(areas.map((a) => a.name), ['official logo (full lockup)', 'campaign stamp', 'platform top bar', 'platform bottom bar']);
  const stampArea = areas[1].zone;
  const clash = { layoutDesigner: { ...design.layoutDesigner, ctaZone: { x: stampArea.x, y: stampArea.y, width: stampArea.width, height: stampArea.height } } };
  assert.match(planConflicts(clash as never, areas).join(' '), /button \(CTA\).*campaign stamp/);
  const clean = { layoutDesigner: { ...design.layoutDesigner, headlineZone: z(0.4, 0.14, 0.55, 0.16), supportingCopyZone: z(0.4, 0.31, 0.55, 0.04), factsZone: z(0.4, 0.6, 0.55, 0.06), ctaZone: z(0.3, 0.7, 0.4, 0.05), heroSubject: z(0.1, 0.36, 0.8, 0.22) } };
  assert.deepEqual(planConflicts(clean as never, areas), []);
});

test('the finished post is looked at again: a stamp that crowds something moves, and the move is checked', async () => {
  const brief = { language: 'ar', objective: 'o', audience: 'a', caption: '', captions: strategy.captionWriter.captions, canonicalCopy: copy, directions: [], engine: { version: 'design-engine:v1', skills: {}, settings: DEFAULT_SETTINGS, strategy, references: [] } } as never;
  const campaign = { id: 'c', name: 'جمعة', slogan: '', hashtag: '#جمعة_تغير_مسارك', corner: 'bottom-right' as const, width: 0.3, stampPath: '', keyVisualPath: '' };
  const visual = await canvas(1088, 1360, '#0b1530', '#14203d');
  const provider = { name: 'fake', model: 'fake-image', generate: async () => [{ png: visual, model: 'fake-image', size: '1088x1360', quality: 'high' as const, latencyMs: 1 }], edit: async () => [{ png: visual, model: 'fake-image', size: '1088x1360', quality: 'high' as const, latencyMs: 1 }] };
  // The button sits bottom-centre: the vision map keeps the stamp off it from the start.
  const inspection = { texts: [{ text: copy.headline, box: z(0.4, 0.08, 0.55, 0.12) }, { text: copy.cta, box: z(0.35, 0.86, 0.3, 0.05) }], faces: [], subjects: [], logosOrWatermarks: [], copyAudit: [], defects: [], scores: { design: 8, marketing: 8, imageQuality: 8, brandFit: 8 }, verdict: 'accept', summary: 'ok', critique: { rubric: {}, aiTells: [], compositingIssues: [], professionalTest: { designerWouldPublish: true, marketingWouldPublish: true, looksDesigned: true }, firstSeen: '' }, repairs: [] };
  const checks: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const finish = body.text?.format?.name === 'engosoft_finish_check' || JSON.stringify(body).includes('engosoft_finish_check');
    let out: unknown = inspection;
    if (finish) {
      checks.push(body.instructions);
      // First look: the stamp crowds a graphic the first pass did not list, wherever it was put.
      const at = /campaign stamp \(slogan \/ hashtag sticker\) at x (\d+)%–(\d+)%, y (\d+)%–(\d+)%/.exec(body.instructions)!.slice(1).map((n) => Number(n) / 100);
      out = { problems: checks.length === 1 ? [{ source: 'stamp', issue: 'The stamp crowds the arrow graphic.', box: { x: at[0], y: at[2], width: at[1] - at[0], height: at[3] - at[2] } }] : [] };
    }
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(out) }] }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  }) as typeof fetch;
  try {
    const dir = mkdtempSync(join(tmpdir(), 'engosoft-finish-'));
    const result = await produceDirection({ provider, brief, direction: { id: 'd1', name: 'القائد', concept: 'c', subject: 's', composition: 'x', palette: 'p', typography: 't', mood: 'm', engine: { strategy: direction0, design } } as never, format: 'feed', quality: 'high', dir, env: { OPENAI_API_KEY: 'test', CREATIVE_REFERENCE_IMAGES: 'off' }, mode: 'model', campaign });
    assert.equal(checks.length, 2, 'looked at the result, then at the moved stamp');
    const spot = (text: string) => /campaign stamp \(slogan \/ hashtag sticker\) at (x \d+%–\d+%, y \d+%–\d+%)/.exec(text)![1];
    assert.notEqual(spot(checks[0]), spot(checks[1]), 'the stamp moved');
    // Never on the button: the bottom-centre CTA box is free of the stamp in both placements.
    for (const text of checks) {
      const [x0, x1, y0, y1] = /campaign stamp \(slogan \/ hashtag sticker\) at x (\d+)%–(\d+)%, y (\d+)%–(\d+)%/.exec(text)!.slice(1).map((n) => Number(n) / 100);
      assert.ok(x1 <= 0.35 || x0 >= 0.65 || y1 <= 0.86 || y0 >= 0.91, `stamp ${x0}-${x1},${y0}-${y1} clear of the button`);
    }
    assert.ok(!result.problems.some((p) => /Final layout check \(stamp\)/.test(p)), result.problems.join(' | '));
  } finally {
    globalThis.fetch = realFetch;
  }
});
