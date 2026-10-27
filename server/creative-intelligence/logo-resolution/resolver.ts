/** Choose the approved logo variant, size and corner for a finished creative, from measured pixels and content zones. */
import { allLogoVariants, logoEdgeMargin, logoHeightFor, minimumLogoWidth, type LogoVariantId } from '../brand/registry.js';
import { MODULE_VERSIONS } from '../versions.js';
import { decodeImage, type Box, type RasterImage } from './regions.js';
import { validateLogoPlacement, type ContentZone, type LogoValidationResult, type SafeArea } from './validator.js';

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface LogoDecision {
  variantId: LogoVariantId;
  placement: { x: number; y: number; width: number; height: number; anchor: Corner };
  reason: string;
  confidence: number;
  backgroundAssessment: { backgroundClass: string; luminance: number; contrast: number; visualComplexity: number };
  policy: LogoValidationResult['policy'];
  requiresCreativeRepair: false;
  resolverVersion: string;
}
export interface NoLogoDecision { requiresCreativeRepair: true; reason: string; bestRejected?: { variantId: LogoVariantId; anchor: Corner; issues: string[] } }

/** Lockup widths as a fraction of canvas width; the symbol is the fallback when no lockup fits. */
const LOCKUP_WIDTHS = [0.26, 0.23];
const SYMBOL_WIDTHS = [0.085, 0.07];

function cornerPosition(corner: Corner, width: number, height: number, canvas: RasterImage, inset: number, safe?: SafeArea) {
  const top = Math.max(inset, safe?.top ?? 0), bottom = Math.max(inset, safe?.bottom ?? 0);
  const left = Math.max(inset, safe?.left ?? 0), right = Math.max(inset, safe?.right ?? 0);
  return {
    x: corner.endsWith('left') ? left : canvas.width - right - width,
    y: corner.startsWith('top') ? top : canvas.height - bottom - height,
  };
}

export async function resolveLogo(input: {
  creative: Buffer | RasterImage;
  zones: ContentZone[];
  /** Corner the art director reserved; it is tried first and preferred on ties. */
  preferredCorner?: Corner;
  /** Mark the art director chose for this design; the other mark is only a fallback. Without one, both compete on fit. */
  preferredMark?: 'lockup' | 'symbol';
  safeArea?: SafeArea;
}): Promise<LogoDecision | NoLogoDecision> {
  const image = Buffer.isBuffer(input.creative) ? await decodeImage(input.creative) : input.creative;
  const inset = Math.round(logoEdgeMargin(image.width) * 1.1);
  const corners: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  if (input.preferredCorner) corners.sort((a, b) => Number(b === input.preferredCorner) - Number(a === input.preferredCorner));
  let best: { score: number; decision: LogoDecision } | null = null;
  let bestRejected: NoLogoDecision['bestRejected'];
  let fewestErrors = Infinity;
  for (const corner of corners) {
    for (const variant of allLogoVariants()) {
      const fractions = variant.kind === 'lockup' ? LOCKUP_WIDTHS : SYMBOL_WIDTHS;
      for (const fraction of fractions) {
        const width = Math.max(minimumLogoWidth(variant, image.width), Math.round(fraction * image.width));
        const height = logoHeightFor(variant, width);
        const { x, y } = cornerPosition(corner, width, height, image, inset, input.safeArea);
        const result = await validateLogoPlacement({ creative: image, placement: { variantId: variant.id, x, y, width }, zones: input.zones, safeArea: input.safeArea });
        const errors = result.issues.filter((issue) => issue.severity === 'error');
        if (!result.pass || !result.measurements) {
          if (errors.length < fewestErrors) { fewestErrors = errors.length; bestRejected = { variantId: variant.id, anchor: corner, issues: errors.map((e) => e.code) }; }
          continue;
        }
        const m = result.measurements;
        // The planned mark first (or a slight edge for the lockup when nothing was planned), then official
        // pairings, contrast, quiet background, and the reserved corner.
        const markWeight = input.preferredMark ? (variant.kind === input.preferredMark ? 3 : 1.5) : (variant.kind === 'lockup' ? 2.2 : 2);
        const score = markWeight * (result.policy === 'official' ? 1.4 : 1) * Math.min(m.meanContrast, 8) / 8
          * (1 - m.region.complexity) * (corner === input.preferredCorner ? 1.25 : 1) * (fraction === fractions[0] ? 1.05 : 1);
        if (!best || score > best.score) {
          best = { score, decision: {
            variantId: variant.id,
            placement: { x, y, width, height, anchor: corner },
            reason: `${variant.label} on ${m.region.backgroundClass} (${result.policy === 'official' ? 'approved pairing' : 'outside the guidelines, contrast-checked'}), contrast ${m.meanContrast.toFixed(1)}:1, ${corner}`,
            confidence: Math.min(1, score / 4.5),
            backgroundAssessment: { backgroundClass: m.region.backgroundClass, luminance: m.region.meanLuminance, contrast: m.meanContrast, visualComplexity: m.region.complexity },
            policy: result.policy, requiresCreativeRepair: false, resolverVersion: MODULE_VERSIONS.logoResolver,
          } };
        }
      }
    }
  }
  return best?.decision ?? { requiresCreativeRepair: true, reason: 'No approved variant fits any corner without collisions or contrast failure', bestRejected };
}

/** Pixel box of the zone the generator was asked to keep clean, for a masked repair. */
export function reservedZoneBox(corner: Corner, width: number, height: number, fraction = { w: 0.32, h: 0.2 }): Box {
  const w = Math.round(width * fraction.w), h = Math.round(height * fraction.h);
  return { x: corner.endsWith('left') ? 0 : width - w, y: corner.startsWith('top') ? 0 : height - h, width: w, height: h };
}
