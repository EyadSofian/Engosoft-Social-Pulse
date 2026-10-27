import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import type { CreativeInspection } from '../server/creative-intelligence/criticism/inspect';
import { localRepairs, promptFor, type CreativeBriefPlan } from '../server/creative-intelligence/generation/full-creative';
import { looksUnfilled } from '../server/creative-intelligence/generation/patch';
import { DESIGN_SKILLS } from '../server/creative-intelligence/skills/design';
import { compileDesignPrompt, DEFAULT_SETTINGS, type DesignDecision, type StrategyDecision } from '../server/creative-intelligence/skills/engine';
import { QUALITY_SKILLS } from '../server/creative-intelligence/skills/quality';
import { STRATEGY_SKILLS } from '../server/creative-intelligence/skills/strategy';
import { THEME_IDS, THEMES } from '../server/creative-intelligence/skills/themes';
import { stageInstructions, stageSchema } from '../server/creative-intelligence/skills/types';

const ALL = [...STRATEGY_SKILLS, ...DESIGN_SKILLS, ...QUALITY_SKILLS];

test('the creative team has every specialist, each versioned', () => {
  const ids: string[] = ALL.map((s) => s.id);
  for (const id of ['creative-director', 'layout-designer', 'visual-weight-designer', 'spacing-designer', 'typography-director', 'theme-director', 'reference-director', 'image-art-director',
    'photoshop-compositor', 'lighting-director', 'color-director', 'brand-director', 'logo-director', 'platform-designer', 'visual-critic', 'creative-repair',
    'content-strategist', 'hook-writer', 'copywriter', 'caption-writer']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of ALL) { assert.match(s.version, new RegExp(`^${s.id}:v\\d+$`)); assert.ok(s.rules.length > 0, s.id); }
  assert.equal(THEME_IDS.length, 16);
  for (const id of THEME_IDS) assert.ok(THEMES[id].avoid.length && THEMES[id].composition.preferred, id);
});

test('every stage schema is valid for strict structured output', () => {
  const check = (node: Record<string, unknown>, path: string) => {
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, path);
      const props = Object.keys(node.properties as object);
      assert.deepEqual([...(node.required as string[])].sort(), props.sort(), path);
      for (const [k, v] of Object.entries(node.properties as Record<string, Record<string, unknown>>)) check(v, `${path}.${k}`);
    } else if (node.type === 'array') check(node.items as Record<string, unknown>, `${path}[]`);
    else assert.ok(['string', 'number', 'boolean'].includes(node.type as string), `${path}: ${String(node.type)}`);
  };
  check(stageSchema(STRATEGY_SKILLS) as Record<string, unknown>, 'strategy');
  check(stageSchema(DESIGN_SKILLS) as Record<string, unknown>, 'design');
  // Stages are composed from the skills, not one fixed prompt: each specialist gets its own section.
  const instructions = stageInstructions('Team brief.', DESIGN_SKILLS);
  for (const s of DESIGN_SKILLS) assert.ok(instructions.includes(`## ${s.id} (${s.version})`));
});

const z = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const design: DesignDecision = {
  layoutDesigner: { gridType: '6-column', balance: 'asymmetric', primaryFocalPoint: 'the manager’s face', secondaryFocalPoint: 'the headline', visualFlow: 'face → headline → CTA', heroSubject: z(0.05, 0.2, 0.45, 0.75), headlineZone: z(0.52, 0.1, 0.42, 0.2), supportingCopyZone: z(0.52, 0.32, 0.4, 0.06), factsZone: z(0, 0, 0, 0), ctaZone: z(0.6, 0.82, 0.3, 0.07), negativeSpaceZones: [z(0.55, 0.45, 0.4, 0.3)], depthPlan: 'plant in the background, subject midground', rationale: 'The gaze leads right to the headline.' },
  visualWeightDesigner: { regions: [{ region: 'left-centre', weight: 0.9, source: 'face' }, { region: 'upper-right', weight: 0.7, source: 'headline' }], balanceCheck: 'ok', toneDown: ['background pipes'] },
  spacingDesigner: { baseUnit: 0.02, edgeMarginUnits: 4, groupGapUnits: 3, elementGapUnits: 1, opticalCorrections: ['nudge the Arabic headline up for its descenders.'], negativeSpacePurpose: 'premium calm around the headline' },
  typographyDirector: { headlineLines: ['قُد المرافق', 'باحتراف'], scale: { headline: 0.07, subheadline: 0.03, facts: 0.02, cta: 0.025 }, alignment: 'right', emphasis: 'باحتراف in brand blue.', mixedScriptNotes: 'CFM matched to Arabic cap height.', leading: '1.15' },
  imageArtDirector: { scene: 'control room at dusk', subject: 'an unnamed facility manager', subjectPlacement: 'waist-up, left 45%, eye line above centre, turned toward the headline', environment: 'modern facility control room', camera: { shot: 'medium', angle: 'eye level', lens: '50mm feel', depthOfField: 'moderate' }, perspective: 'horizon at 40%', realism: 'photographic' },
  lightingDirector: { setup: 'directional cinematic', keyDirection: 'from the right, toward the headline', quality: 'soft', temperature: 'neutral with warm practicals', rim: 'subtle cool rim', atmosphere: 'light haze', consistency: 'subject and room share the key.' },
  colorDirector: { roles: { dominant: '#1B2430', secondary: '#E9EEF5', accent: '#FF6600', background: '#1B2430', text: '#FFFFFF', highlight: '#0046FF' }, harmony: 'neutral-accent', brandExpression: 'orange CTA, blue emphasis', why: 'serious, premium' },
  brandDirector: { personality: 'confident', brandColorUse: 'accents', checks: [] },
  logoDirector: { mark: 'symbol', corner: 'top-left', reason: 'calm wall' },
  photoshopCompositor: { layerStack: ['background', 'subject'], integration: ['Contact shadow at the desk edge.'], risks: [] },
};
const strategy = {
  creativeDirector: { language: 'ar', objective: 'course_registration', audience: 'facility managers', message: 'CFM cohort starting', desiredReaction: 'interest and urgency', contentType: 'course_campaign', tone: 'professional', creativeOpportunity: 'career authority' },
  contentStrategist: { angle: 'authority', motivation: 'promotion', proofPoints: [], mustAvoid: [] },
  hookWriter: { hooks: [{ text: 'قُد المرافق باحتراف', pattern: 'outcome', why: '' }], chosen: 0 },
  copywriter: { headline: 'قُد المرافق باحتراف', subheadline: 'دورة CFM لإدارة المرافق', cta: 'سجّل الآن', emphasis: 'باحتراف' },
  captionWriter: { caption: '', captions: { facebook: '', instagram: '', whatsapp: '', linkedin: '', tiktok: '', snapchat: '', website: '' } },
  referenceDirector: { references: [] },
  themeDirector: { directions: [{ name: 'القائد', theme: 'industrial-cinematic', idea: 'The manager as the calm centre of a complex facility.', whyThisTheme: '', subjectStrategy: '', references: [] }] },
} satisfies StrategyDecision;

test('the image prompt is compiled from the design decisions', () => {
  const prompt = compileDesignPrompt({ strategy, direction: strategy.themeDirector.directions[0], design, copy: { headline: 'قُد المرافق باحتراف', subheadline: 'دورة CFM لإدارة المرافق', cta: 'سجّل الآن' }, format: { label: 'feed 4:5', story: false } });
  assert.match(prompt, /VISUAL IDEA\nThe manager as the calm centre/);
  assert.match(prompt, /THEME — Industrial Cinematic/);
  assert.match(prompt, /Headline: x 52%–94%, y 10%–30%/);
  assert.match(prompt, /set on 2 lines exactly as: «قُد المرافق» \/ «باحتراف»/);
  assert.match(prompt, /First: the manager’s face/);
  assert.match(prompt, /key from the right, toward the headline/);
  assert.match(prompt, /Dominant #1B2430/);
  assert.match(prompt, /Keep the top-left area — about 17%/);
  assert.ok(!prompt.includes('Facts:'), 'empty zones are left out');
  assert.match(prompt, /glass cards/); // the theme's avoid list
  const adapted = compileDesignPrompt({ strategy, direction: strategy.themeDirector.directions[0], design, copy: { headline: 'قُد المرافق باحتراف' }, format: { label: 'story', story: true }, adaptation: true });
  assert.match(adapted, /do not reuse the master's positions/);
  assert.ok(!adapted.includes('Headline: x 52%'));
});

test('older runs keep the previous prompt; engine runs use the compiled one', () => {
  const brief: CreativeBriefPlan = { language: 'ar', objective: 'o', audience: 'a', caption: '', captions: strategy.captionWriter.captions, canonicalCopy: { headline: 'قُد المرافق باحتراف' }, directions: [] };
  const legacy = { id: 'd1', name: 'n', concept: 'c', subject: 's', composition: 'x', palette: 'p', typography: 't', mood: 'm' };
  assert.match(promptFor(brief, legacy, 'feed'), /^TASK\n/);
  const engineBrief = { ...brief, engine: { version: 'design-engine:v1', skills: {}, settings: DEFAULT_SETTINGS, strategy, references: [] } };
  assert.match(promptFor(engineBrief, { ...legacy, theme: 'industrial-cinematic', engine: { strategy: strategy.themeDirector.directions[0], design } }, 'feed'), /^DELIVERABLE\n/);
});

test('the repair router applies only local, non-text repairs automatically', () => {
  const inspection = {
    texts: [{ text: 'قُد المرافق', box: z(0.5, 0.1, 0.45, 0.2) }],
    repairs: [
      { operation: 'LIGHTING_REPAIR', instruction: 'warm the subject', region: z(0.05, 0.3, 0.4, 0.5), severity: 'major' },
      { operation: 'IMAGE_EDIT', instruction: 'fix the headline glow', region: z(0.5, 0.1, 0.45, 0.2), severity: 'major' },
      { operation: 'TYPOGRAPHY_REPAIR', instruction: 'bigger headline', region: z(0.5, 0.1, 0.4, 0.2), severity: 'critical' },
      { operation: 'COLOR_REPAIR', instruction: 'tiny', region: z(0.1, 0.1, 0.01, 0.01), severity: 'major' },
      { operation: 'COMPOSITING_REPAIR', instruction: 'minor shadow', region: z(0.1, 0.8, 0.2, 0.1), severity: 'minor' },
    ],
  } as unknown as CreativeInspection;
  assert.deepEqual(localRepairs(inspection).map((r) => r.instruction), ['warm the subject']);
});

test('an edit that left its box unpainted is detected', async () => {
  const scene = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#7a8fa8' } }).png().toBuffer();
  const holed = await sharp(scene).composite([{ input: await sharp({ create: { width: 120, height: 100, channels: 3, background: '#000000' } }).png().toBuffer(), left: 0, top: 300 }]).png().toBuffer();
  assert.equal(await looksUnfilled(holed, { x: 0, y: 300, width: 120, height: 100 }), true);
  assert.equal(await looksUnfilled(scene, { x: 0, y: 300, width: 120, height: 100 }), false);
});
