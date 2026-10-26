/** Pure color math and background classification. No Node or sharp imports, so the browser can use it. */
import type { BackgroundClass } from '../brand/registry.js';

const linear = (channel: number) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const LINEAR = Array.from({ length: 256 }, (_, i) => linear(i));
/** WCAG relative luminance of an sRGB color. */
export const relativeLuminance = (r: number, g: number, b: number) => 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
export const contrastFromLuminance = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const contrastRatio = (a: string, b: string) => contrastFromLuminance(relativeLuminance(...hexToRgb(a)), relativeLuminance(...hexToRgb(b)));

export function hsl(r: number, g: number, b: number) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? 60 * (((G - B) / d) % 6) : max === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
  return { h: (h + 360) % 360, s, l };
}
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Classification thresholds, versioned with MODULE_VERSIONS.logoRegions. Calibrate against reviewed placements. */
export const REGION_THRESHOLDS = {
  quietComplexity: 0.06,
  texturedComplexity: 0.2,
  quietSpread: 0.06,
  whiteLuminance: 0.85,
  whiteMaxChroma: 0.08,
  lightLuminance: 0.5,
  darkLuminance: 0.18,
  brandBlueHue: 224, brandBlueHueTolerance: 14, brandBlueMinSaturation: 0.55,
  brandOrangeHue: 24, brandOrangeHueTolerance: 12, brandOrangeMinSaturation: 0.6,
} as const;

export interface ColorStats {
  meanLuminance: number;
  /** Standard deviation of relative luminance: hard edges or mixed light/dark areas. */
  luminanceSpread: number;
  /** 0 = flat, 1 = noise. Mean absolute luminance gradient between neighboring pixels. */
  complexity: number;
  hue: number; saturation: number; lightness: number;
  /** max(R,G,B) − min(R,G,B) of the mean color, 0..1. */
  chroma: number;
}

export function classifyBackground(m: ColorStats): BackgroundClass {
  const t = REGION_THRESHOLDS;
  const quiet = m.complexity <= t.quietComplexity && m.luminanceSpread <= t.quietSpread;
  const textured = m.complexity <= t.texturedComplexity;
  if (hueDistance(m.hue, t.brandOrangeHue) <= t.brandOrangeHueTolerance && m.saturation >= t.brandOrangeMinSaturation && m.lightness >= 0.35 && m.lightness <= 0.7) return 'brand-orange';
  if (hueDistance(m.hue, t.brandBlueHue) <= t.brandBlueHueTolerance && m.saturation >= t.brandBlueMinSaturation && m.lightness >= 0.28 && m.lightness <= 0.65) {
    if (quiet) return 'brand-blue';
    if (textured) return 'brand-blue-texture';
    return 'dark-photographic';
  }
  // HSL saturation is unstable near white (#F2F5FA reads as 44%); chroma is not.
  if (m.meanLuminance >= t.whiteLuminance && m.chroma <= t.whiteMaxChroma && quiet) return 'white';
  if (m.meanLuminance >= t.lightLuminance) return quiet ? 'light' : 'light-photographic';
  if (m.meanLuminance <= t.darkLuminance) return quiet ? 'dark-neutral' : 'dark-photographic';
  return 'mid-tone-photographic';
}

export function statsForColor(rgb: [number, number, number]): ColorStats {
  const { h, s, l } = hsl(...rgb);
  return { meanLuminance: relativeLuminance(...rgb), luminanceSpread: 0, complexity: 0, hue: h, saturation: s, lightness: l, chroma: (Math.max(...rgb) - Math.min(...rgb)) / 255 };
}

/** Class of a flat fill. Only valid when the logo really sits on that flat color. */
export const classifyFlatColor = (hex: string): BackgroundClass => classifyBackground(statsForColor(hexToRgb(hex)));
