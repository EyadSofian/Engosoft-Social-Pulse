/**
 * Engosoft design language: the art-direction standard every generated creative is planned, prompted and
 * critiqued against. One source for the creative director, the image prompt and the critic, so the three
 * never drift apart. Human-readable version: .claude/skills/engosoft-design-language/SKILL.md
 */
import type { Corner } from '../logo-resolution/resolver.js';

export const DESIGN_LANGUAGE_VERSION = 'design-language:v1';

/** The feel to aim for: a premium product launch, not a template. */
export const DESIGN_STANDARD = [
  'Premium launch quality: it should feel like a campaign from a top creative studio, not a generic template.',
  'Editorial layout with one clear focal point and a deliberate hierarchy: headline, then subject, then facts, then CTA.',
  'Strong typography carries the idea: few words, large and confident, with generous negative space. Short strong statements, never paragraphs.',
  'Controlled, layered construction: a considered background, one hero subject, intentional lighting, a clear graphic composition, a reserved headline space and restrained details. Nothing scattered.',
  'Light is soft and directional, with depth and gentle perspective; a subtle blue glow and at most one small orange accent of energy.',
  'Engosoft blue and orange are confident accents inside a contextual palette, never a flat flood.',
  'Keep the essential content (headline, subject, CTA) inside the central area so the design can be recomposed for 9:16 and 1.91:1 without losing meaning.',
];

/** Patterns that make a creative look cheap; the critic treats them as defects. */
export const DESIGN_AVOID = [
  'random flashy effects or lens flares',
  'excessive particles, sparkles or confetti',
  'gaming, cyberpunk or sci-fi HUD overload',
  'excessive neon or glow on everything',
  'generic AI brain, circuit-head or robot clichés',
  'childish cartoon mascots or clip-art',
  'cheap SaaS or stock template layouts',
  'paragraphs of text or more than a few short lines',
  'elements flying in from every direction with no structure',
];

/** Three composition archetypes that give genuinely different directions (not recolors of one layout). */
export const DIRECTION_ARCHETYPES = [
  'instructor- or professional-focused premium portrait: one confident person, strong light, headline beside them',
  'editorial professional course design: typographic, structured grid, a refined image panel, information laid out like a magazine page',
  'bold cinematic creative: a dramatic scene or metaphor filling the frame, headline set into the image with depth',
];

/**
 * Official logo treatments. Both come in positive and reversed artwork; the colour is chosen afterwards from
 * the measured background, so the director only picks the mark and the corner.
 */
export type LogoMark = 'lockup' | 'symbol';
export const LOGO_MARKS: LogoMark[] = ['lockup', 'symbol'];
export const LOGO_CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export const LOGO_GUIDANCE = [
  "logoMark: pick the official logo treatment that suits THIS composition. 'lockup' (the symbol above the Engosoft wordmark; needs a calm area about 30% of the width) suits spacious, editorial, text-light layouts where the brand name should read clearly. 'symbol' (the mark alone, about 9% of the width) suits dense, full-bleed, cinematic or subject-heavy layouts where a full lockup would crowd the design.",
  "logoCorner: the corner that is naturally calm in this composition, away from the headline, faces, the subject and the CTA. In right-to-left layouts the headline usually sits on the right, so a left corner is often calm; a bottom corner works only when the CTA is not there.",
  'Vary the logo treatment across directions so the set does not all use the same mark in the same corner.',
];

/** Area kept clean for the logo, as a fraction of the canvas, per mark. */
export const LOGO_ZONE: Record<LogoMark, { w: number; h: number }> = { lockup: { w: 0.32, h: 0.2 }, symbol: { w: 0.17, h: 0.15 } };

export const markOfVariant = (variantId: string): LogoMark => (variantId.startsWith('symbol') ? 'symbol' : 'lockup');

/** Prompt paragraph that keeps the planned logo corner clean in the generated image. */
export function logoReservation(mark: LogoMark, corner: Corner): string {
  const zone = LOGO_ZONE[mark];
  return `Keep the ${corner} area — about ${Math.round(zone.w * 100)}% of the width and ${Math.round(zone.h * 100)}% of the height — a calm, uncluttered continuation of the background with no text, faces, objects or graphics. The official logo (${mark === 'lockup' ? 'full lockup' : 'symbol'}) will be placed there afterwards. Do NOT draw any logo, brand mark, monogram, wordmark, watermark, or the word "Engosoft" anywhere.`;
}
