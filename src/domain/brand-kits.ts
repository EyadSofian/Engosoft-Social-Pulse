/**
 * The logo kits: one registry the browser renderers, the server compositors and the Studio all read (audit #16).
 * Pure data, no Node or DOM APIs.
 *
 * A design stores its kit id (`official` or `engo-soft-old`) and every size, preview, export and Studio save places
 * that kit's file, so a design made with the older lockup keeps it everywhere (audit #10).
 */

export type BrandKitId = 'official' | 'engo-soft-old';
export const BRAND_KIT_IDS: readonly BrandKitId[] = ['official', 'engo-soft-old'];

/** One file of a kit: where it is served, whether it is vector, and its shape. */
export interface KitFile {
  /** Path under `public/` as the browser fetches it, e.g. `/brand/logos/engosoft-horizontal-reversed.svg`. */
  src: string;
  /** Raster files soften when drawn much larger than they are; vectors never do. */
  vector: boolean;
  /** Width over height of the artwork. */
  ratio: number;
  /** Pixel width of a raster file (undefined for vectors). */
  nativeWidth?: number;
  /** Light artwork for dark backgrounds (`reversed`) or dark artwork for light ones (`positive`). */
  tone: 'reversed' | 'positive';
}

export type KitMark = 'horizontal' | 'symbol' | 'lockup';

export interface BrandKit {
  id: BrandKitId;
  label: { en: string; ar: string };
  /** Files by mark and tone; a kit may not have every combination. */
  files: Partial<Record<KitMark, Partial<Record<'reversed' | 'positive', KitFile>>>>;
  /** The mark a design uses when it does not say. */
  mainMark: KitMark;
  /**
   * How it sits on a design: `flat` puts the file on top unchanged (the official kit, verified pixel for pixel);
   * `print` adds the background's grain and a soft deep-blue shadow, as on the campaign posts.
   */
  treatment: 'flat' | 'print';
  /** A raster file is never drawn wider than this many times its own width, so it stays sharp. */
  maxScale?: number;
}

const OFFICIAL: BrandKit = {
  id: 'official',
  label: { en: 'Official logo', ar: 'اللوجو الرسمي' },
  mainMark: 'horizontal',
  treatment: 'flat',
  files: {
    horizontal: {
      positive: { src: '/brand/logos/engosoft-horizontal-positive.svg', vector: true, ratio: 266.21 / 68.52, tone: 'positive' },
      reversed: { src: '/brand/logos/engosoft-horizontal-reversed.svg', vector: true, ratio: 266.21 / 68.52, tone: 'reversed' },
    },
    symbol: {
      positive: { src: '/brand/logos/engosoft-symbol-positive.svg', vector: true, ratio: 19.164 / 25.871, tone: 'positive' },
      reversed: { src: '/brand/logos/engosoft-symbol-reversed.svg', vector: true, ratio: 19.164 / 25.871, tone: 'reversed' },
    },
    lockup: {
      positive: { src: '/brand/logos/engosoft-lockup-positive.svg', vector: true, ratio: 97.336 / 62.054, tone: 'positive' },
      reversed: { src: '/brand/logos/engosoft-lockup-reversed.svg', vector: true, ratio: 97.337 / 62.054, tone: 'reversed' },
    },
  },
};

/**
 * The older «ENGO | SOFT» lockup the campaign posts use, white on transparent. Today it is a 214 px raster cut from
 * the 50/50 campaign post (audit #9): it is capped at 1.25× its width until a vector or a ≥1000 px file replaces it.
 * Swapping the file only needs `src`, `ratio`, `nativeWidth` (and `vector: true` for an SVG) changed here.
 */
const ENGO_SOFT_OLD: BrandKit = {
  id: 'engo-soft-old',
  label: { en: 'Older ENGO | SOFT logo', ar: 'اللوجو القديم ENGO | SOFT' },
  mainMark: 'horizontal',
  treatment: 'print',
  maxScale: 1.25,
  files: {
    horizontal: {
      reversed: { src: '/brand/logos/engosoft-old-lockup-reversed.png', vector: false, ratio: 214 / 76, nativeWidth: 214, tone: 'reversed' },
    },
  },
};

export const BRAND_KITS: Record<BrandKitId, BrandKit> = { official: OFFICIAL, 'engo-soft-old': ENGO_SOFT_OLD };

export const isBrandKitId = (value: unknown): value is BrandKitId => BRAND_KIT_IDS.includes(value as BrandKitId);

export function brandKit(id: BrandKitId | undefined | null): BrandKit {
  return BRAND_KITS[id && isBrandKitId(id) ? id : 'official'];
}

/**
 * The file of a kit for a mark on a background. When the kit has no file in that tone (the old lockup is white
 * only), its other tone is returned, and when it has no such mark, its main mark.
 */
export function kitFile(kit: BrandKit, opts: { mark?: KitMark; onDark: boolean }): KitFile {
  const byTone = kit.files[opts.mark ?? kit.mainMark] ?? kit.files[kit.mainMark]!;
  const want = opts.onDark ? 'reversed' : 'positive';
  return byTone[want] ?? byTone[want === 'reversed' ? 'positive' : 'reversed']!;
}

/** The widest a file may be drawn: unlimited for vectors, `maxScale` × its width for rasters. */
export function maxDrawWidth(kit: BrandKit, file: KitFile): number {
  return file.vector || !file.nativeWidth ? Infinity : file.nativeWidth * (kit.maxScale ?? 1);
}
