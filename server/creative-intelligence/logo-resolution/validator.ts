/** Brand checks for one logo placement on one creative. Any error blocks export. */
import { backgroundVerdict, clearSpaceFor, getLogoVariant, isLogoVariantId, logoEdgeMargin, logoHeightFor, logoMainFill, minimumLogoWidth, type BackgroundVerdict, type LogoVariantId, logoSizeBasis } from '../brand/registry.js';
import { loadApprovedLogo } from '../brand/integrity.js';
import { MODULE_VERSIONS } from '../versions.js';
import type { LogoPlacement } from './compositor.js';
import { contrastProfile, decodeImage, expandBox, intersects, measureRegion, type Box, type RasterImage, type RegionMeasurement } from './regions.js';

export type ContentZoneKind = 'text' | 'face' | 'subject' | 'cta' | 'platform-ui' | 'salient';
export interface ContentZone { kind: ContentZoneKind; box: Box; label?: string }
/** Platform safe-area insets in pixels. */
export interface SafeArea { top: number; right: number; bottom: number; left: number }

export type LogoIssueCode =
  | 'unknown_variant' | 'asset_integrity' | 'aspect_ratio' | 'out_of_canvas' | 'edge_margin' | 'outside_safe_area'
  | 'below_minimum_size' | 'clear_space_canvas' | 'forbidden_background' | 'low_contrast' | 'busy_background'
  | 'zone_collision' | 'unspecified_background' | 'zones_not_checked';
export interface LogoValidationIssue { code: LogoIssueCode; severity: 'error' | 'warning'; message: string }
export interface LogoValidationResult {
  pass: boolean;
  issues: LogoValidationIssue[];
  /** 'engineering-default' when the background is not covered by the guidelines. */
  policy: 'official' | 'engineering-default';
  zonesChecked: boolean;
  measurements?: {
    logoBox: Box; clearSpacePx: number; clearSpaceBox: Box; minimumWidth: number;
    region: RegionMeasurement; verdict: BackgroundVerdict; meanContrast: number; lowContrastShare: number;
  };
  version: typeof MODULE_VERSIONS.logoValidator;
}

/** Validator limits; versioned with MODULE_VERSIONS.logoValidator. */
export const LOGO_LIMITS = {
  minContrast: 3,
  maxLowContrastShare: 0.1,
  maxComplexity: { lockup: 0.18, symbol: 0.3 },
} as const;

export interface LogoValidationInput {
  /** The creative before the logo is composited. */
  creative: Buffer | RasterImage;
  placement: LogoPlacement;
  /** Content the logo must stay clear of. Omit only when no plan or detector output exists. */
  zones?: ContentZone[];
  safeArea?: SafeArea;
}

export async function validateLogoPlacement(input: LogoValidationInput): Promise<LogoValidationResult> {
  const issues: LogoValidationIssue[] = [];
  const error = (code: LogoIssueCode, message: string) => issues.push({ code, severity: 'error', message });
  const warn = (code: LogoIssueCode, message: string) => issues.push({ code, severity: 'warning', message });
  const result = (extra: Partial<LogoValidationResult> = {}): LogoValidationResult => ({
    pass: !issues.some((issue) => issue.severity === 'error'), issues, policy: 'official', zonesChecked: Boolean(input.zones), version: MODULE_VERSIONS.logoValidator, ...extra,
  });

  const id: unknown = input.placement.variantId;
  if (!isLogoVariantId(id)) { error('unknown_variant', `"${String(id)}" is not one of the four approved logo variants`); return result({ zonesChecked: false }); }
  const variantId: LogoVariantId = id;
  try { loadApprovedLogo(variantId); } catch (cause) { error('asset_integrity', cause instanceof Error ? cause.message : 'Logo file failed its integrity check'); }

  const variant = getLogoVariant(variantId);
  const image = Buffer.isBuffer(input.creative) ? await decodeImage(input.creative) : input.creative;
  const width = Math.round(input.placement.width);
  const height = logoHeightFor(variant, width);
  if (input.placement.height !== undefined && Math.abs(input.placement.height - height) > 1) {
    error('aspect_ratio', `Height ${input.placement.height}px does not keep the artwork ratio (expected ${height}px)`);
  }
  const logoBox: Box = { x: Math.round(input.placement.x), y: Math.round(input.placement.y), width, height };
  const right = logoBox.x + logoBox.width, bottom = logoBox.y + logoBox.height;
  if (logoBox.x < 0 || logoBox.y < 0 || right > image.width || bottom > image.height) {
    error('out_of_canvas', 'Logo would be clipped by the canvas edge');
    return result();
  }
  const margin = logoEdgeMargin(image.width);
  if (logoBox.x < margin || logoBox.y < margin || image.width - right < margin || image.height - bottom < margin) {
    error('edge_margin', `Logo is closer than ${margin}px to the canvas edge`);
  }
  const safe = input.safeArea;
  if (safe && (logoBox.y < safe.top || logoBox.x < safe.left || image.width - right < safe.right || image.height - bottom < safe.bottom)) {
    error('outside_safe_area', 'Logo enters the platform UI area');
  }
  const minimumWidth = minimumLogoWidth(variant, logoSizeBasis(image.width, image.height));
  if (width < minimumWidth) error('below_minimum_size', `Logo is ${width}px wide; minimum for this canvas is ${minimumWidth}px (provisional rule)`);

  const clearSpacePx = clearSpaceFor(variant, width);
  const clearSpaceBox = expandBox(logoBox, clearSpacePx);
  if (clearSpaceBox.x < 0 || clearSpaceBox.y < 0 || clearSpaceBox.x + clearSpaceBox.width > image.width || clearSpaceBox.y + clearSpaceBox.height > image.height) {
    error('clear_space_canvas', 'Clear space around the logo runs off the canvas');
  }

  const region = measureRegion(image, clearSpaceBox);
  const verdict = backgroundVerdict(variant, region.backgroundClass);
  let policy: LogoValidationResult['policy'] = 'official';
  if (verdict === 'forbidden') error('forbidden_background', `${variant.id} is not allowed on a ${region.backgroundClass} background`);
  if (verdict === 'unspecified') {
    policy = 'engineering-default';
    warn('unspecified_background', `The guidelines do not cover ${variant.id} on ${region.backgroundClass}; allowed only because contrast and quietness pass. Log for brand review.`);
  }
  const contrast = contrastProfile(image, logoBox, logoMainFill(variant));
  if (contrast.meanContrast < LOGO_LIMITS.minContrast || contrast.lowContrastShare > LOGO_LIMITS.maxLowContrastShare) {
    error('low_contrast', `Artwork contrast ${contrast.meanContrast.toFixed(2)}:1 with ${(contrast.lowContrastShare * 100).toFixed(0)}% of pixels below 3:1`);
  }
  if (region.complexity > LOGO_LIMITS.maxComplexity[variant.kind]) {
    error('busy_background', `Background under the logo is too busy (${region.complexity.toFixed(2)} > ${LOGO_LIMITS.maxComplexity[variant.kind]})`);
  }

  if (input.zones) {
    for (const zone of input.zones) {
      if (intersects(clearSpaceBox, zone.box)) error('zone_collision', `Logo clear space overlaps ${zone.kind}${zone.label ? ` (${zone.label})` : ''}`);
    }
  } else {
    warn('zones_not_checked', 'No content zones supplied; collisions with text, faces and subjects were not checked');
  }

  return result({
    policy,
    measurements: { logoBox, clearSpacePx, clearSpaceBox, minimumWidth, region, verdict, meanContrast: contrast.meanContrast, lowContrastShare: contrast.lowContrastShare },
  });
}
