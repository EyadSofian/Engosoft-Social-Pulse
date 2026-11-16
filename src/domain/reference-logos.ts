/**
 * The logo each library reference design carries, measured on the reference files in `public/design-references/`.
 * Twelve of the thirteen use the older «ENGO | SOFT» lockup (white on blue, full colour on light); the Revit MEP one
 * uses the official stacked lockup. A design made from a reference starts on that reference's own logo, placed at the
 * same spot and the same share of the width, so the result looks like the reference instead of carrying a different
 * logo at a different size. Pure data, no Node or DOM APIs.
 */
import type { BrandKitId } from './brand-kits';

export interface ReferenceLogo {
  kit: BrandKitId;
  /** Where the logo sits on the reference, as fractions of its width and height (height with ~10% room). */
  place: { x: number; y: number; width: number; height: number };
  /** Width over height of the reference, so other shapes keep the logo in the same corner at the same share. */
  aspect: number;
  /** Whether the reference has the logo on a dark background (white artwork) or a light one (full colour). */
  onDark: boolean;
}

/** Measured in pixels on each file: [x, y, width, height, file width, file height]. */
const px = (kit: BrandKitId, onDark: boolean, [x, y, w, h, W, H]: number[]): ReferenceLogo => ({
  kit, onDark, aspect: W / H,
  place: { x: x / W, y: y / H, width: w / W, height: (h * 1.1) / H },
});

const LIGHT_GRID = px('engo-soft-old', false, [96, 98, 427, 143, 2250, 2812]);
const BLUE_HERO = px('engo-soft-old', true, [98, 94, 481, 159, 2250, 2812]);

export const REFERENCE_LOGOS: Record<string, ReferenceLogo> = {
  'artists-day.jpg': LIGHT_GRID,
  'participation.jpg': LIGHT_GRID,
  'student-ahmed.jpg': LIGHT_GRID,
  'student-esra.jpg': LIGHT_GRID,
  'student-lighting.jpg': LIGHT_GRID,
  'student-power.jpg': LIGHT_GRID,
  'automotive-enroll.jpg': BLUE_HERO,
  'automotive-hero.jpg': BLUE_HERO,
  'automotive-graduation.jpg': px('engo-soft-old', false, [94, 106, 528, 177, 2250, 2812]),
  'awareness.jpg': px('engo-soft-old', true, [106, 84, 429, 142, 2250, 2250]),
  'majed-ai.jpg': px('engo-soft-old', true, [106, 84, 429, 142, 2250, 2812]),
  'support.jpg': px('engo-soft-old', false, [107, 86, 427, 143, 2250, 2812]),
  'revit-mep.png': px('official', true, [53, 61, 281, 171, 1080, 1350]),
};

/** The logo of the reference behind `/design-references/<file>`, or undefined for a design without one on record. */
export function referenceLogoOf(sourceImage: string | null | undefined): ReferenceLogo | undefined {
  const file = sourceImage?.match(/^\/design-references\/([a-z0-9-]+\.(?:jpg|png))$/)?.[1];
  return file ? REFERENCE_LOGOS[file] : undefined;
}
