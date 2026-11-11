/**
 * Engosoft design language: the art-direction standard every generated creative is planned, prompted and
 * critiqued against. One source for the creative director, the image prompt and the critic, so the three
 * never drift apart. Human-readable version: .claude/skills/engosoft-design-language/SKILL.md
 */
import type { Corner } from '../logo-resolution/resolver.js';

export const DESIGN_LANGUAGE_VERSION = 'design-language:v2';

/** The feel to aim for: a premium product launch, not a template. */
export const DESIGN_STANDARD = [
  'Premium launch quality: it should feel like a campaign from a top creative studio, not a generic template.',
  'Editorial layout with one clear focal point and a deliberate hierarchy: headline, then subject, then facts, then CTA.',
  'Strong typography carries the idea: few words, large and confident, with generous negative space. Short strong statements, never paragraphs.',
  'Controlled, layered construction: a considered background, one hero subject, intentional lighting, a clear graphic composition, a reserved headline space and restrained details. Nothing scattered.',
  'Light is soft and directional, with depth and gentle perspective, in the Engosoft colour world below.',
  'Engosoft house colours: a vivid royal-blue world (or a clean light-grey engineering-paper world), a bright green highlight bar behind a key phrase, and an orange call-to-action pill. Not a dark, moody, cinematic navy scene.',
  'Built for its own canvas: the layout uses the shape it is made for and keeps the platform’s covered areas free; every other size is designed again for its shape, never cropped from this one.',
];

/**
 * The house style, read from the approved Engosoft posts (public/design-references). The image model gets these
 * posts as reference images and this description, so new posts belong to the same feed.
 */
export const HOUSE_STYLE = [
  'Background: either a vivid, saturated royal blue world (#0046FF to deep #001BB7, photographic or graphic, bright and clean, never murky) or a clean light-grey engineering-paper world with faint technical drawings.',
  'Headline: very bold, geometric Arabic display type, white on blue (brand blue on light grey), set right-aligned, large and confident; one word may be stretched with a long horizontal kashida in the Engosoft manner.',
  'Kicker: a flat bright green (#4CFF7A) rectangular highlight bar behind one short phrase above or below the headline, with dark or white Arabic text on it.',
  'Subject: one real photographic subject (an engineer, trainee or the course equipment) cut out cleanly, blue-toned, large, with depth and real contact shadows; course-specific technical detail (drawings, models, machines) supporting it.',
  'Call to action: an orange (#FF6600) rounded pill with white Arabic text and a small left-pointing arrow.',
  'Details: thin white or green line accents, small rounded icons, generous margins, a clean grid and calm negative space; everything aligned, nothing floating.',
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
export type LogoMark = 'lockup' | 'symbol' | 'horizontal';
/** Marks a design may choose itself (CREATIVE_LOGO=auto); the horizontal lockup is the house mark. */
export const LOGO_MARKS: LogoMark[] = ['lockup', 'symbol', 'horizontal'];
export const LOGO_CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/**
 * The house logo: every design carries the horizontal lockup (symbol, engosoft and the tagline side by side, as on
 * every post of the November 2026 brand pack) in the same corner, at the same size, so a feed of Engosoft posts
 * reads as one brand. The stacked lockup needed a quarter of the canvas clear, which the image model rarely left,
 * so designs ended up with the small symbol or no logo at all. The corner is the calm one in an Arabic
 * layout, where the headline starts top-right. CREATIVE_LOGO=auto lets each design choose again (the old behaviour).
 */
export const HOUSE_LOGO: { mark: LogoMark; corner: Corner } = { mark: 'horizontal', corner: 'top-left' };
export const houseLogo = (env: NodeJS.ProcessEnv = process.env) => (env.CREATIVE_LOGO?.trim() === 'auto' ? null : HOUSE_LOGO);

export const LOGO_GUIDANCE = houseLogo() ? [
  `logoMark and logoCorner are fixed by the brand: always '${HOUSE_LOGO.mark}' in the '${HOUSE_LOGO.corner}' corner, on every design and every direction. Plan the layout so that corner (about 34% of the width, 11% of the height) is calm negative space: never the headline, a face, the subject or the CTA there.`,
] : [
  "logoMark: pick the official logo treatment that suits THIS composition. 'lockup' (the symbol above the Engosoft wordmark; needs a calm area about 30% of the width) suits spacious, editorial, text-light layouts where the brand name should read clearly. 'symbol' (the mark alone, about 9% of the width) suits dense, full-bleed, cinematic or subject-heavy layouts where a full lockup would crowd the design.",
  "logoCorner: the corner that is naturally calm in this composition, away from the headline, faces, the subject and the CTA. In right-to-left layouts the headline usually sits on the right, so a left corner is often calm; a bottom corner works only when the CTA is not there.",
];

/** Area kept clean for the logo, as a fraction of the canvas, per mark. */
export const LOGO_ZONE: Record<LogoMark, { w: number; h: number }> = { lockup: { w: 0.32, h: 0.2 }, symbol: { w: 0.17, h: 0.15 }, horizontal: { w: 0.34, h: 0.11 } };

export const markOfVariant = (variantId: string): LogoMark => (variantId.startsWith('symbol') ? 'symbol' : variantId.startsWith('horizontal') ? 'horizontal' : 'lockup');

/** The canvas a logo zone is measured on: output pixels and the edges the platform covers. */
export interface LogoCanvas { width: number; height: number; safe: { top: number; bottom: number; left: number; right: number } }

/**
 * Where the official logo will sit, as fractions of the canvas: in the corner, inside the safe area (below a
 * story's top bar), and as tall as the logo really is there. LOGO_ZONE is measured on the 4:5 feed; the logo is
 * sized from the canvas width, so on a 9:16 story the same logo takes a smaller share of the height.
 */
export function logoZoneOn(mark: LogoMark, corner: Corner, canvas?: LogoCanvas): { x: number; y: number; w: number; h: number } {
  const zone = LOGO_ZONE[mark];
  if (!canvas) return { x: corner.endsWith('left') ? 0 : 1 - zone.w, y: corner.startsWith('top') ? 0 : 1 - zone.h, w: zone.w, h: zone.h };
  const { width, height, safe } = canvas;
  const h = Math.min(0.5, Math.max(0.12, zone.h * (1350 / 1080) * (width / height)));
  const x = corner.endsWith('left') ? safe.left / width : 1 - safe.right / width - zone.w;
  const y = corner.startsWith('top') ? safe.top / height : 1 - safe.bottom / height - h;
  return { x: Math.max(0, x), y: Math.max(0, y), w: zone.w, h };
}

/** Prompt paragraph that keeps the planned logo corner clean in the generated image, where the logo will really go. */
export function logoReservation(mark: LogoMark, corner: Corner, canvas?: LogoCanvas): string {
  const z = logoZoneOn(mark, corner, canvas);
  const pct = (v: number) => Math.round(v * 100);
  const covered = canvas && (corner.startsWith('top') ? canvas.safe.top : canvas.safe.bottom) > 0;
  const where = covered
    ? `the ${corner.endsWith('left') ? 'left' : 'right'} area from ${pct(z.x)}% to ${pct(z.x + z.w)}% of the width and from ${pct(z.y)}% to ${pct(z.y + z.h)}% of the height (just ${corner.startsWith('top') ? 'below the platform bar at the top' : 'above the platform bar at the bottom'}, which stays background too)`
    : `the ${corner} area — about ${pct(z.w)}% of the width and ${pct(z.h)}% of the height —`;
  return `Keep ${where} a calm, uncluttered continuation of the background with no text, faces, objects or graphics; the headline starts beside it or below it, never inside it. The official logo (${mark === 'lockup' ? 'full lockup: the symbol above the Engosoft wordmark' : mark === 'horizontal' ? 'horizontal lockup: the symbol beside the Engosoft wordmark, one short line' : 'symbol'}) will be placed there afterwards. Do NOT draw any logo, brand mark, monogram, wordmark, watermark, or the word "Engosoft" anywhere.`;
}
