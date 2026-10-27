/** Quality-stage skills: a strict critic that looks at the real pixels, targeted repairs, and platform recomposition. */
import { DESIGN_AVOID } from '../brand/design-language.js';
import { list, num, obj, oneOf, str, zone, type DesignSkill } from './types.js';

export const RUBRIC_KEYS = ['idea', 'composition', 'visualHierarchy', 'visualWeight', 'spacing', 'typography', 'imageQuality', 'compositing', 'lighting', 'color', 'brandFit', 'professionalFinish'] as const;
export type RubricKey = (typeof RUBRIC_KEYS)[number];

export const AI_TELLS = [
  'generic blue gradients', 'random glow', 'unnecessary glass cards', 'repeated pill buttons', 'random geometric blobs', 'meaningless technology lines',
  'person-right / text-left by default', 'giant logo blocks', 'fake 3D', 'plastic AI people', 'overloaded canvas', 'empty template pretending to be premium',
];
export const COMPOSITING_FAILS = [
  'bad hair mask', 'halo edges', 'mismatched sharpness', 'mismatched lighting', 'wrong perspective', 'impossible scale', 'floating subject',
  'weak or missing contact shadow', 'fake reflection', 'inconsistent grain', 'duplicated objects', 'broken hands', 'broken anatomy',
];

export const visualCritic: DesignSkill<'visual-critic'> = {
  id: 'visual-critic', version: 'visual-critic:v2',
  purpose: 'Judges the actual image like a strict creative director.',
  rules: [
    `Score each axis 0–10 (${RUBRIC_KEYS.join(', ')}). Strict: 8+ only for work a senior designer would publish unchanged; generic AI output scores 5–6.`,
    `Penalise AI tells: ${AI_TELLS.join('; ')}; and the cheap patterns: ${DESIGN_AVOID.join('; ')}.`,
    `Reject bad compositing: ${COMPOSITING_FAILS.join('; ')}.`,
    'Check the plan was delivered: one primary focal point, clear hierarchy, Arabic line breaks by meaning, light and shadows agree, subject belongs in the environment, theme recognisable.',
    'Professional test: would a good graphic designer publish this? Would Engosoft marketing? Does it look designed, or AI-generated? If AI-generated, it needs repair.',
  ],
  schema: obj({
    rubric: obj(Object.fromEntries(RUBRIC_KEYS.map((k) => [k, num()]))),
    aiTells: list(str()), compositingIssues: list(str()),
    professionalTest: obj({ designerWouldPublish: { type: 'boolean' }, marketingWouldPublish: { type: 'boolean' }, looksDesigned: { type: 'boolean' } }),
    firstSeen: str('what the eye lands on first'),
  }),
};

export const REPAIR_OPERATIONS = ['LAYOUT_REPAIR', 'SPACING_REPAIR', 'TYPOGRAPHY_REPAIR', 'IMAGE_EDIT', 'ASSET_REPLACE', 'LIGHTING_REPAIR', 'COLOR_REPAIR', 'COMPOSITING_REPAIR', 'LOGO_REPAIR', 'FULL_REGENERATE'] as const;
export type RepairOperation = (typeof REPAIR_OPERATIONS)[number];

export const creativeRepair: DesignSkill<'creative-repair'> = {
  id: 'creative-repair', version: 'creative-repair:v1',
  purpose: 'Turns the critique into the smallest targeted repairs.',
  rules: [
    'Never "make it more professional". Write concrete operations: "move the instructor 6% inward", "reduce the blue saturation of the background", "add a realistic contact shadow under the laptop", "match the subject’s colour temperature to the warm background", "create more breathing space above the CTA".',
    'Each repair gets one operation and, when it is local, the region it affects (normalized 0..1). Use region width 0 when the repair is global.',
    'Use the smallest repair that fixes the problem. FULL_REGENERATE only when the idea or the whole composition fails.',
    'Return no repairs when the creative is publishable.',
  ],
  schema: obj({ repairs: list(obj({ operation: oneOf(REPAIR_OPERATIONS), instruction: str(), region: zone(), severity: oneOf(['critical', 'major', 'minor']) })) }),
};

export const platformDesigner: DesignSkill<'platform-designer'> = {
  id: 'platform-designer', version: 'platform-designer:v1',
  purpose: 'Recomposes the master creative for each platform as a new composition of the same campaign.',
  rules: [
    'Never crop blindly: reframe, reposition the subject, change headline line breaks and size, adjust information density, move the CTA, extend the background where needed, and let the logo be placed again for the new canvas.',
    'Stories (9:16): keep the top 12% and bottom 17% free of essential content; stack the composition vertically with the subject and headline in the central band.',
    'Landscape (1.91:1): widen the scene, put the headline and subject side by side with generous space; fewer lines of text.',
    'Every variant must look like the same campaign: same idea, subject, palette, lighting, typography style and exact text.',
  ],
  schema: obj({}),
};

export const QUALITY_SKILLS = [visualCritic, creativeRepair, platformDesigner];
