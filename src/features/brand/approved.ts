/**
 * Browser-side access to the four approved Engosoft logo files (brand/logos, mirrored in public/brand/logos).
 * The artwork is always the exact file: no crop, plate, recolor or reconstruction.
 */
import {
  allLogoVariants, backgroundVerdict, BRAND, getLogoVariant, isLogoVariantId, logoContainer, logoEdgeMargin, logoHeightFor, minimumLogoWidth,
  type LogoVariantId,
} from '../../../server/creative-intelligence/brand/registry';
import { classifyFlatColor, contrastRatio } from '../../../server/creative-intelligence/logo-resolution/background-class';

export type LogoVariant = LogoVariantId;
export type LogoHrefs = Partial<Record<LogoVariantId, string>>;

/** Brand-asset set id stored on saved designs. */
export const APPROVED_LOGO = { id: `engosoft-logos-${BRAND.version}` } as const;

const LEGACY_VARIANTS: Record<string, LogoVariantId> = {
  whiteOnBlue: 'lockup-reversed', blueOnWhite: 'lockup-positive', markOnBlue: 'symbol-reversed', markOnWhite: 'symbol-positive',
};
/** Accept ids saved by older drafts (cropped-sheet names) and map them to the approved variants. */
export function normalizeLogoVariant(value: unknown): LogoVariantId | 'auto' {
  if (isLogoVariantId(value)) return value;
  return typeof value === 'string' && value in LEGACY_VARIANTS ? LEGACY_VARIANTS[value] : 'auto';
}

export const logoHref = (variant: LogoVariantId, hrefs: LogoHrefs = {}) => hrefs[variant] ?? getLogoVariant(variant).publicPath;

/**
 * Variant for a logo that sits on a flat fill (legacy layered layouts). Prefers a variant the guidelines
 * approve for that background, then an unspecified one that keeps 3:1 contrast. Photographic backgrounds
 * need pixel measurement on the server (logo-resolution/validator), which this cannot do.
 */
export function pickVariantForFlatBackground(backgroundHex: string, kind: 'lockup' | 'symbol'): LogoVariantId {
  const background = classifyFlatColor(backgroundHex);
  const blue = BRAND.colors.core.brandBlue.hex;
  const contrast = (id: LogoVariantId) => contrastRatio(id.endsWith('-reversed') ? '#FFFFFF' : blue, backgroundHex);
  const ranked = allLogoVariants()
    .filter((v) => v.kind === kind && backgroundVerdict(v, background) !== 'forbidden' && contrast(v.id) >= 3)
    .sort((a, b) => Number(backgroundVerdict(b, background) === 'approved') - Number(backgroundVerdict(a, background) === 'approved') || contrast(b.id) - contrast(a.id));
  if (ranked[0]) return ranked[0].id;
  return contrast(`${kind}-reversed`) >= contrast(`${kind}-positive`) ? `${kind}-reversed` : `${kind}-positive`;
}

const attr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
/** The exact approved file as an SVG image element. Height always follows the artwork's ratio. */
export function lockedLogoSvg(x: number, y: number, width: number, variant: LogoVariantId, href = ''): string {
  const logo = getLogoVariant(variant);
  return `<image data-brand-asset="${logo.sha256}" data-logo-variant="${logo.id}" href="${attr(href || logo.publicPath)}" x="${x}" y="${y}" width="${width}" height="${logoHeightFor(logo, width)}" preserveAspectRatio="xMidYMid meet" aria-label="Engosoft logo"/>`;
}

/**
 * The approved white circle badge holding the blue symbol. Used where the layout puts unmeasured photography
 * under the logo: it reads on any photo without a plate. Returns the markup and the symbol's rendered width.
 */
export function whiteBadgeSvg(x: number, y: number, diameter: number, hrefs: LogoHrefs = {}): string {
  const badge = logoContainer('white-circle');
  const variant = getLogoVariant(badge.symbolVariant);
  const width = badge.symbolWidth(diameter), height = logoHeightFor(variant, width), r = diameter / 2;
  return `<g data-logo-container="white-circle"><circle cx="${x + r}" cy="${y + r}" r="${r}" fill="${badge.fill}"/>${lockedLogoSvg(Math.round(x + r - width / 2), Math.round(y + r - height / 2), width, variant.id, logoHref(variant.id, hrefs))}</g>`;
}
/** Smallest badge whose symbol still meets the minimum symbol width. */
export const minimumBadgeDiameter = (canvasWidth: number) => Math.ceil(minimumLogoWidth(getLogoVariant('symbol-positive'), canvasWidth) / logoContainer('white-circle').symbolWidthToDiameter);

/** All four approved SVGs as data URLs, so an exported SVG file carries its logo with it. */
export async function loadLogoDataUrls(): Promise<Record<LogoVariantId, string>> {
  const entries = await Promise.all(allLogoVariants().map(async (variant) => {
    const response = await fetch(variant.publicPath);
    if (!response.ok) throw new Error(`Logo ${variant.id} unavailable (HTTP ${response.status})`);
    return [variant.id, `data:image/svg+xml;base64,${btoa(await response.text())}`] as const;
  }));
  return Object.fromEntries(entries) as Record<LogoVariantId, string>;
}

export interface BrandIssue { code: 'missing_logo' | 'unsafe_logo_position' | 'tiny_logo' | 'long_title'; message: string }
export function validateBrand(input: { logoReady: boolean; logoX: number; logoY: number; logoWidth: number; canvasWidth: number; title: string; logoVariant?: LogoVariantId | 'auto' }): BrandIssue[] {
  const issues: BrandIssue[] = [];
  const variant = getLogoVariant(input.logoVariant && input.logoVariant !== 'auto' ? input.logoVariant : 'lockup-reversed');
  const margin = logoEdgeMargin(input.canvasWidth);
  if (!input.logoReady) issues.push({ code: 'missing_logo', message: 'الشعار المعتمد لم يُحمّل بعد.' });
  if (input.logoX < margin || input.logoY < margin || input.logoX + input.logoWidth > input.canvasWidth - margin) issues.push({ code: 'unsafe_logo_position', message: 'الشعار خارج مساحة الأمان.' });
  if (input.logoWidth < minimumLogoWidth(variant, input.canvasWidth)) issues.push({ code: 'tiny_logo', message: 'الشعار أصغر من الحد الأدنى وقد يصعب قراءته.' });
  if (input.title.trim().length > 90) issues.push({ code: 'long_title', message: 'العنوان طويل وقد يفقد وضوحه؛ اختصره.' });
  return issues;
}
