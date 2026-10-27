/**
 * The design engine: the creative team as explicit, typed stages.
 *
 * request → [strategy: creative director, content strategist, hook writer, copywriter, caption writer,
 *            reference director, theme director] → per direction [design: layout, visual weight, spacing,
 *            typography, image art, lighting, colour, brand, logo, compositor] → image prompt compiled from
 *            those decisions → image model → critic + repair (inspect.ts) → logo → platform recomposition
 *
 * Every decision is stored on the run (brief.engine and direction.design) with the skill versions.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { DESIGN_AVOID, DESIGN_STANDARD, logoReservation, type LogoMark } from '../brand/design-language.js';
import { BRAND } from '../brand/registry.js';
import type { Corner } from '../logo-resolution/resolver.js';
import { retrieveVisualReferences } from '../../../src/features/creative-studio/visual-references.js';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../../../src/domain/design-engine.js';
import { DESIGN_SKILLS } from './design.js';
import { platformDesigner } from './quality.js';
import { STRATEGY_SKILLS } from './strategy.js';
import { THEME_IDS, THEMES, themeSummary, type ThemeDefinition, type ThemeId } from './themes.js';
import { runStage, skillVersions, type StageContent, type Zone } from './types.js';

export const ENGINE_VERSION = 'design-engine:v1';

export const DEFAULT_SETTINGS: EngineSettings = DEFAULT_ENGINE_SETTINGS;
export type { EngineSettings };

/* Typed decisions of every stage (mirrors the skill schemas). */
export interface StrategyDecision {
  creativeDirector: { language: 'ar' | 'en'; objective: string; audience: string; message: string; desiredReaction: string; contentType: string; tone: string; creativeOpportunity: string };
  contentStrategist: { angle: string; motivation: string; proofPoints: string[]; mustAvoid: string[] };
  hookWriter: { hooks: { text: string; pattern: string; why: string }[]; chosen: number };
  copywriter: { headline: string; subheadline: string; cta: string; emphasis: string };
  captionWriter: { caption: string; captions: Record<'facebook' | 'instagram' | 'whatsapp' | 'linkedin' | 'tiktok' | 'snapchat' | 'website', string> & { youtube?: string } };
  referenceDirector: { references: { id: string; quality: 'excellent' | 'strong' | 'usable' | 'weak' | 'reject'; roles: string[]; analysis: Record<string, string>; useFor: string }[] };
  themeDirector: { directions: { name: string; theme: ThemeId; idea: string; whyThisTheme: string; subjectStrategy: string; references: string[] }[] };
}
export interface DesignDecision {
  layoutDesigner: { gridType: string; balance: string; primaryFocalPoint: string; secondaryFocalPoint: string; visualFlow: string; heroSubject: Zone; headlineZone: Zone; supportingCopyZone: Zone; factsZone: Zone; ctaZone: Zone; negativeSpaceZones: Zone[]; depthPlan: string; rationale: string };
  visualWeightDesigner: { regions: { region: string; weight: number; source: string }[]; balanceCheck: string; toneDown: string[] };
  spacingDesigner: { baseUnit: number; edgeMarginUnits: number; groupGapUnits: number; elementGapUnits: number; opticalCorrections: string[]; negativeSpacePurpose: string };
  typographyDirector: { headlineLines: string[]; scale: { headline: number; subheadline: number; facts: number; cta: number }; alignment: string; emphasis: string; mixedScriptNotes: string; leading: string };
  imageArtDirector: { scene: string; subject: string; subjectPlacement: string; environment: string; camera: { shot: string; angle: string; lens: string; depthOfField: string }; perspective: string; realism: string };
  lightingDirector: { setup: string; keyDirection: string; quality: string; temperature: string; rim: string; atmosphere: string; consistency: string };
  colorDirector: { roles: { dominant: string; secondary: string; accent: string; background: string; text: string; highlight: string }; harmony: string; brandExpression: string; why: string };
  brandDirector: { personality: string; brandColorUse: string; checks: string[] };
  logoDirector: { mark: LogoMark; corner: Corner; reason: string };
  photoshopCompositor: { layerStack: string[]; integration: string[]; risks: string[] };
}

export interface ReferenceInput { id: string; image: string; title: string; reason: string }

/** Up to three retrieved Engosoft references as small images, so the reference director sees them. */
export async function loadReferences(prompt: string, strength: EngineSettings['referenceStrength']): Promise<{ refs: ReferenceInput[]; content: StageContent[] }> {
  const picked = retrieveVisualReferences(prompt, 'general', strength === 'loose' ? 2 : 3);
  const refs: ReferenceInput[] = [], content: StageContent[] = [];
  for (const r of picked) {
    const file = resolve(process.cwd(), 'public', r.image.replace(/^\//, ''));
    if (!existsSync(file)) continue;
    try {
      const jpeg = await sharp(readFileSync(file)).resize({ width: 512, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      refs.push({ id: r.id, image: r.image, title: r.title, reason: r.reason });
      content.push({ type: 'input_text', text: `Reference ${r.id} (${r.title}):` }, { type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'low' });
    } catch { /* unreadable card: skip it */ }
  }
  return { refs, content };
}

const settingsText = (s: EngineSettings) => [
  `Creativity: ${s.creativity} (${s.creativity === 'safe' ? 'follow proven professional Engosoft patterns' : s.creativity === 'experimental' ? 'unusual, memorable concepts are welcome, experimental themes allowed' : 'professional creative variation'}).`,
  `Image style: ${s.imageStyle === 'auto' ? 'choose photo or graphic per direction' : s.imageStyle}. Detail: ${s.detail === 'auto' ? 'choose' : s.detail}.`,
  `Reference strength: ${s.referenceStrength} (${s.referenceStrength === 'loose' ? 'references inspire mood only' : s.referenceStrength === 'strong' ? 'follow the structure of strong references closely while staying original' : 'references influence composition and style'}).`,
  s.theme !== 'auto' ? `The user chose the theme ${s.theme} for direction 1; the other directions still use different themes.` : 'Themes: choose per direction.',
].join(' ');

export async function planStrategy(input: { prompt: string; format: string; count: number; facts: string[]; factContext: string; settings: EngineSettings; style?: string; env: NodeJS.ProcessEnv }): Promise<{ decision: StrategyDecision; references: ReferenceInput[] }> {
  const { refs, content } = await loadReferences(input.prompt, input.settings.referenceStrength);
  const catalogue = THEME_IDS.filter((id) => input.settings.creativity === 'experimental' || THEMES[id].risk !== 'experimental').map((id) => themeSummary(THEMES[id])).join('\n');
  const decision = await runStage<StrategyDecision>({
    name: 'strategy', env: input.env, reasoning: 'medium', skills: STRATEGY_SKILLS,
    intro: `You are the Engosoft creative team planning a social media creative. Return exactly ${input.count} directions in theme-director.directions.`,
    content: [
      { type: 'input_text', text: [
        `User request: ${input.prompt}`,
        input.style ? `Saved template style — make direction 1 follow it closely: ${input.style}` : '',
        `Format: ${input.format}`,
        `Verified facts from Odoo (use only these): ${input.factContext}`,
        settingsText(input.settings),
        `Theme catalogue:\n${catalogue}`,
        refs.length ? `Attached references (analyse them in order): ${refs.map((r) => `${r.id} — retrieved for: ${r.reason}`).join('; ')}` : 'No references attached.',
      ].filter(Boolean).join('\n\n') },
      ...content,
    ],
  });
  decision.themeDirector.directions = decision.themeDirector.directions.slice(0, input.count);
  if (input.settings.theme !== 'auto' && decision.themeDirector.directions[0]) decision.themeDirector.directions[0].theme = input.settings.theme;
  return { decision, references: refs };
}

export async function planDesign(input: { strategy: StrategyDecision; direction: StrategyDecision['themeDirector']['directions'][number]; format: { label: string; width: number; height: number }; facts: string[]; settings: EngineSettings; env: NodeJS.ProcessEnv }): Promise<DesignDecision> {
  const { strategy, direction } = input;
  const theme = THEMES[direction.theme] ?? THEMES['corporate-premium'];
  const refs = strategy.referenceDirector.references.filter((r) => direction.references.includes(r.id) && r.quality !== 'reject' && r.quality !== 'weak');
  return runStage<DesignDecision>({
    name: 'design_plan', env: input.env, reasoning: 'medium', skills: DESIGN_SKILLS,
    intro: 'You are the Engosoft design team turning one creative direction into a precise design plan before any image is generated. Decide every position in normalized coordinates of the final canvas.',
    content: [{ type: 'input_text', text: [
      `Canvas: ${input.format.label}, ${input.format.width}×${input.format.height}.`,
      `Objective: ${strategy.creativeDirector.objective}. Audience: ${strategy.creativeDirector.audience}. Message: ${strategy.creativeDirector.message}. Desired reaction: ${strategy.creativeDirector.desiredReaction}. Angle: ${strategy.contentStrategist.angle}.`,
      `Direction "${direction.name}": ${direction.idea} Subject strategy: ${direction.subjectStrategy}.`,
      `Theme ${theme.id}: ${JSON.stringify({ composition: theme.composition, photography: theme.photography, lighting: theme.lighting, typography: theme.typography, spacing: theme.spacing, graphics: theme.graphics, texture: theme.texture, imageTreatment: theme.imageTreatment, density: theme.density, mood: theme.mood, avoid: theme.avoid })}`,
      `Text to place: headline «${strategy.copywriter.headline}», supporting line «${strategy.copywriter.subheadline}», CTA «${strategy.copywriter.cta}»${input.facts.length ? `, fact lines ${input.facts.map((f) => `«${f}»`).join(', ')}` : ', no fact lines'}. Emphasis word: ${strategy.copywriter.emphasis || 'none'}.`,
      refs.length ? `References to use, with roles: ${refs.map((r) => `${r.id} [${r.roles.join(', ')}; ${r.quality}]: ${r.useFor}`).join(' | ')}` : 'No references for this direction.',
      settingsText(input.settings),
      `Design standard: ${DESIGN_STANDARD.join(' ')}`,
    ].join('\n\n') }],
  });
}

const pct = (n: number) => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
const where = (z: Zone) => `x ${pct(z.x)}–${pct(z.x + z.width)}, y ${pct(z.y)}–${pct(z.y + z.height)}`;
const hasArea = (z?: Zone) => Boolean(z && z.width > 0.01 && z.height > 0.01);

/** The GPT Image prompt, compiled from the design decisions — nothing here is a fixed creative. */
export function compileDesignPrompt(input: { strategy: StrategyDecision; direction: StrategyDecision['themeDirector']['directions'][number]; design: DesignDecision; copy: { headline: string; subheadline?: string; cta?: string; facts?: string[] }; format: { label: string; story: boolean }; adaptation?: boolean }): string {
  const { strategy, direction, design, copy } = input;
  const theme: ThemeDefinition = THEMES[direction.theme] ?? THEMES['corporate-premium'];
  const L = design.layoutDesigner, W = design.visualWeightDesigner, S = design.spacingDesigner, T = design.typographyDirector, I = design.imageArtDirector, Li = design.lightingDirector, C = design.colorDirector, P = design.photoshopCompositor;
  const text = [
    `Headline: «${copy.headline}»${T.headlineLines.length > 1 && T.headlineLines.join(' ').replace(/\s+/g, ' ').trim() === copy.headline.replace(/\s+/g, ' ').trim() ? ` — set on ${T.headlineLines.length} lines exactly as: ${T.headlineLines.map((l) => `«${l}»`).join(' / ')}` : ''}`,
    copy.subheadline ? `Supporting line: «${copy.subheadline}»` : '',
    ...(copy.facts ?? []).map((fact, i) => `Fact line ${i + 1}: «${fact}»`),
    copy.cta ? `Call-to-action: «${copy.cta}»` : '',
  ].filter(Boolean).map((line, i) => `${i + 1}. ${line}`).join('\n');
  const zones = [
    `Hero subject: ${where(L.heroSubject)}.`, `Headline: ${where(L.headlineZone)}.`,
    hasArea(L.supportingCopyZone) ? `Supporting line: ${where(L.supportingCopyZone)}.` : '', (copy.facts?.length && hasArea(L.factsZone)) ? `Facts: ${where(L.factsZone)}.` : '', hasArea(L.ctaZone) ? `CTA: ${where(L.ctaZone)}.` : '',
  ].filter(Boolean).join(' ');
  const weights = [...W.regions].sort((a, b) => b.weight - a.weight).slice(0, 3).map((r, i) => `${i === 0 ? 'primary' : 'secondary'}: ${r.source} (${r.region})`).join('; ');
  return [
    `DELIVERABLE\nA complete, finished, publish-ready social media creative for Engosoft (engineering and professional training). The image IS the final post — fully art-directed across the whole canvas with integrated typography; not a background and not a stock photo with empty space.`,
    `FORMAT\n${input.format.label}.${input.format.story ? ' Keep the top 12% and bottom 17% free of essential content (platform interface).' : ''}`,
    `OBJECTIVE\n${strategy.creativeDirector.objective} — ${strategy.creativeDirector.message}. Audience: ${strategy.creativeDirector.audience}. The viewer should feel: ${strategy.creativeDirector.desiredReaction}.`,
    `VISUAL IDEA\n${direction.idea}`,
    `THEME — ${theme.label.en}\n${theme.mood}. Graphics: ${theme.graphics}. Texture: ${theme.texture}. Image treatment: ${theme.imageTreatment}. Density: ${theme.density}.`,
    input.adaptation
      ? `COMPOSITION\nThe master was planned as: ${L.gridType}, ${L.balance} balance, reading path ${L.visualFlow}. Recompose those relationships for this canvas — do not reuse the master's positions.`
      : `COMPOSITION\n${L.gridType}, ${L.balance} balance. ${L.rationale} Reading path: ${L.visualFlow}. Positions (fractions of the canvas from the top-left): ${zones}`,
    `SUBJECT POSITION\n${I.subjectPlacement}. Subject: ${I.subject}. Scene: ${I.scene}. Environment: ${I.environment}. Unnamed professionals only; believable faces and hands; no real, identifiable people.`,
    `NEGATIVE SPACE\n${input.adaptation ? 'Planned around the headline, the subject and the logo corner' : L.negativeSpaceZones.filter(hasArea).map(where).join('; ') || 'as planned around the headline'} — ${S.negativeSpacePurpose}. Edge margin about ${Math.round(S.edgeMarginUnits * S.baseUnit * 100)}% of the width; related text grouped tightly, groups clearly separated. ${S.opticalCorrections.join(' ')}`,
    `VISUAL HIERARCHY\nFirst: ${L.primaryFocalPoint}. Then: ${L.secondaryFocalPoint}. Weight — ${weights}. ${W.toneDown.length ? `Keep subdued: ${W.toneDown.join('; ')}.` : ''}`,
    `CAMERA\n${I.camera.shot}, ${I.camera.angle}, ${I.camera.lens}, ${I.camera.depthOfField}. Perspective: ${I.perspective}. Rendering: ${I.realism}.`,
    `LIGHTING\n${Li.setup}; key ${Li.keyDirection}; ${Li.quality}; ${Li.temperature}; rim ${Li.rim}; atmosphere ${Li.atmosphere}. ${Li.consistency}`,
    `COLOR\nDominant ${C.roles.dominant}, secondary ${C.roles.secondary}, accent ${C.roles.accent}, background ${C.roles.background}, text ${C.roles.text}, highlight ${C.roles.highlight} — ${C.harmony}. ${C.brandExpression}. Engosoft brand blue ${BRAND.colors.core.brandBlue.hex} and orange ${BRAND.colors.core.brandOrange.hex} as intended accents, not a flat flood.`,
    `DEPTH AND INTEGRATION\n${L.depthPlan}. ${P.integration.join(' ')} One lighting world, matching perspective, scale, grain and colour across every element; real contact shadows; no halos or floating subjects.`,
    `TYPOGRAPHY\nHierarchy with clear size steps (headline cap height about ${pct(T.scale.headline)} of the width, supporting line about ${pct(T.scale.subheadline)}, CTA about ${pct(T.scale.cta)}). ${T.alignment} aligned. ${T.emphasis} ${T.mixedScriptNotes} Arabic set right-to-left in a bold, modern geometric Arabic sans-serif (similar to Almarai); Latin in a clean geometric sans (similar to Plus Jakarta Sans). Leading: ${T.leading}.`,
    `TEXT — render exactly these strings, verbatim, each once, and no other text:\n${text}\nSpell Arabic exactly with correctly joined letters. Copy digits exactly as written (Western digits).`,
    `BRAND-SAFE AREA\n${logoReservation(design.logoDirector.mark, design.logoDirector.corner)}`,
    `RIGHT-TO-LEFT\nThe layout reads right to left: arrows and directional cues point left.`,
    input.adaptation ? `ADAPTATION\n${platformDesigner.rules.join(' ')}` : '',
    `AVOID\n${[...theme.avoid, ...DESIGN_AVOID].join('; ')}. No extra words, fake UI, QR codes, prices, dates or names beyond the text above. No seals, badges or accreditation marks.`,
  ].filter(Boolean).join('\n\n');
}

/** Versions of every skill the engine ran, stored on the creative. */
export const ENGINE_SKILL_VERSIONS = { engine: ENGINE_VERSION, ...skillVersions([...STRATEGY_SKILLS, ...DESIGN_SKILLS]) };
