/**
 * Typed, schema-checked access to the brand data in brand/*.json.
 * Pure module (no Node APIs) so the browser can import it too.
 */
import { z } from 'zod';
import colorsJson from '../../../brand/colors.json';
import logosJson from '../../../brand/logos.json';
import manifestJson from '../../../brand/manifest.json';
import spacingJson from '../../../brand/spacing.json';
import typographyJson from '../../../brand/typography.json';
import usageRulesJson from '../../../brand/usage-rules.json';

export const LOGO_VARIANT_IDS = ['lockup-reversed', 'lockup-positive', 'symbol-reversed', 'symbol-positive'] as const;
export type LogoVariantId = (typeof LOGO_VARIANT_IDS)[number];

export const BACKGROUND_CLASSES = [
  'brand-blue', 'brand-blue-texture', 'brand-orange', 'white', 'light',
  'light-photographic', 'mid-tone-photographic', 'dark-neutral', 'dark-photographic',
] as const;
export type BackgroundClass = (typeof BACKGROUND_CLASSES)[number];

const hex = z.string().regex(/^#[0-9A-F]{6}$/);
const backgroundClass = z.enum(BACKGROUND_CLASSES);
const variantSchema = z.object({
  id: z.enum(LOGO_VARIANT_IDS),
  label: z.string(),
  assetPath: z.string(),
  publicPath: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  format: z.literal('svg'),
  kind: z.enum(['lockup', 'symbol']),
  width: z.number().positive(),
  height: z.number().positive(),
  aspectRatio: z.number().positive(),
  hasTransparentBackground: z.literal(true),
  fills: z.array(hex).min(2),
  parts: z.array(z.string()),
  usage: z.object({
    approvedBackgrounds: z.array(backgroundClass),
    forbiddenBackgrounds: z.array(backgroundClass),
    unspecifiedBackgrounds: z.array(backgroundClass),
    approvedContainers: z.array(z.string()).optional(),
    forbiddenContainers: z.array(z.string()).optional(),
  }),
  immutable: z.literal(true),
});
const logosSchema = z.object({
  source: z.object({ sha256: z.string(), tagline: z.string() }).loose(),
  variants: z.array(variantSchema).length(4),
  containers: z.object({
    'brand-blue-circle': z.object({ fill: hex, symbolVariant: z.enum(LOGO_VARIANT_IDS), symbolWidthToDiameter: z.number().positive() }),
    'white-circle': z.object({ fill: hex, symbolVariant: z.enum(LOGO_VARIANT_IDS), symbolWidthToDiameter: z.number().positive() }),
  }).loose(),
  provisional: z.object({
    status: z.literal('pending_brand_confirmation'),
    clearSpaceUnits: z.number().positive(),
    orangeDotDiameterToHeight: z.object({ lockup: z.number().positive(), symbol: z.number().positive() }),
    minimumRenderedWidthPx: z.object({ lockup: z.number().positive(), symbol: z.number().positive() }),
    referenceCanvasWidthPx: z.number().positive(),
  }).loose(),
}).loose();

const logos = logosSchema.parse(logosJson);
for (const variant of logos.variants) {
  const classes = [...variant.usage.approvedBackgrounds, ...variant.usage.forbiddenBackgrounds, ...variant.usage.unspecifiedBackgrounds];
  if (new Set(classes).size !== classes.length) throw new Error(`brand/logos.json: ${variant.id} lists a background class twice`);
}
if (new Set(logos.variants.map((v) => v.id)).size !== 4) throw new Error('brand/logos.json: duplicate variant id');

export type LogoVariant = z.infer<typeof variantSchema>;
export type BackgroundVerdict = 'approved' | 'forbidden' | 'unspecified';

export const BRAND = {
  version: manifestJson.version,
  tagline: manifestJson.tagline,
  colors: z.object({ core: z.record(z.string(), z.object({ hex, role: z.string() })) }).loose().parse(colorsJson),
  typography: typographyJson,
  spacing: z.object({ referenceCanvasWidthPx: z.number(), edgeMarginPx: z.number(), logoEdgeMarginPx: z.number() }).loose().parse(spacingJson),
  usageRules: usageRulesJson,
  logos,
} as const;

export const BRAND_BLUE = BRAND.colors.core.brandBlue.hex;
export const BRAND_ORANGE = BRAND.colors.core.brandOrange.hex;

export const isLogoVariantId = (value: unknown): value is LogoVariantId => LOGO_VARIANT_IDS.includes(value as LogoVariantId);

export function getLogoVariant(id: LogoVariantId): LogoVariant {
  const variant = logos.variants.find((entry) => entry.id === id);
  if (!variant) throw new Error(`Unknown logo variant ${id}`);
  return variant;
}
export const allLogoVariants = (): readonly LogoVariant[] => logos.variants;

/** The fill that carries the artwork: white on reversed variants, brand blue on positive ones. */
export const logoMainFill = (variant: LogoVariant) => variant.id.endsWith('-reversed') ? '#FFFFFF' : BRAND_BLUE;

export const logoHeightFor = (variant: LogoVariant, width: number) => Math.round(width / variant.aspectRatio);

/** Provisional minimum width, scaled from the 1080px reference canvas. */
export function minimumLogoWidth(variant: LogoVariant, canvasWidth: number): number {
  const p = logos.provisional;
  return Math.ceil(p.minimumRenderedWidthPx[variant.kind] * canvasWidth / p.referenceCanvasWidthPx);
}

/** Provisional clear space on every side: N orange-dot diameters of the rendered artwork. */
export function clearSpaceFor(variant: LogoVariant, renderedWidth: number): number {
  const p = logos.provisional;
  return Math.ceil(p.clearSpaceUnits * p.orangeDotDiameterToHeight[variant.kind] * logoHeightFor(variant, renderedWidth));
}

export function logoEdgeMargin(canvasWidth: number): number {
  return Math.round(BRAND.spacing.logoEdgeMarginPx * canvasWidth / BRAND.spacing.referenceCanvasWidthPx);
}

export type LogoContainerId = 'brand-blue-circle' | 'white-circle';
/** An approved circle badge: its fill, the symbol it holds, and the symbol width for a given diameter. */
export function logoContainer(id: LogoContainerId) {
  const container = logos.containers[id];
  return { ...container, symbolWidth: (diameter: number) => Math.round(diameter * container.symbolWidthToDiameter) };
}

export function backgroundVerdict(variant: LogoVariant, background: BackgroundClass): BackgroundVerdict {
  if (variant.usage.approvedBackgrounds.includes(background)) return 'approved';
  if (variant.usage.forbiddenBackgrounds.includes(background)) return 'forbidden';
  return 'unspecified';
}
