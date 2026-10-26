import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type BrandFontFamily = 'Almarai' | 'Plus Jakarta Sans';
export interface BrandFontFile { family: BrandFontFamily; file: string; weight: number | [number, number]; style: 'normal' | 'italic'; variable: boolean }

/** Vendored SIL OFL 1.1 files (licenses in brand/fonts). Almarai ships four static weights; Plus Jakarta Sans is variable. */
export const BRAND_FONT_FILES: readonly BrandFontFile[] = [
  { family: 'Almarai', file: 'brand/fonts/Almarai-Light.ttf', weight: 300, style: 'normal', variable: false },
  { family: 'Almarai', file: 'brand/fonts/Almarai-Regular.ttf', weight: 400, style: 'normal', variable: false },
  { family: 'Almarai', file: 'brand/fonts/Almarai-Bold.ttf', weight: 700, style: 'normal', variable: false },
  { family: 'Almarai', file: 'brand/fonts/Almarai-ExtraBold.ttf', weight: 800, style: 'normal', variable: false },
  { family: 'Plus Jakarta Sans', file: 'brand/fonts/PlusJakartaSans[wght].ttf', weight: [200, 800], style: 'normal', variable: true },
  { family: 'Plus Jakarta Sans', file: 'brand/fonts/PlusJakartaSans-Italic[wght].ttf', weight: [200, 800], style: 'italic', variable: true },
];

/** The file that serves a family at a weight: nearest static weight, or the variable file clamped to its axis. */
export function brandFontFor(family: BrandFontFamily, weight: number, style: 'normal' | 'italic' = 'normal'): { file: BrandFontFile; weight: number } {
  const candidates = BRAND_FONT_FILES.filter((f) => f.family === family && f.style === style);
  if (!candidates.length) throw new Error(`No vendored ${family} ${style} font`);
  const variable = candidates.find((f) => f.variable);
  if (variable && Array.isArray(variable.weight)) return { file: variable, weight: Math.min(variable.weight[1], Math.max(variable.weight[0], weight)) };
  const nearest = [...candidates].sort((a, b) => Math.abs((a.weight as number) - weight) - Math.abs((b.weight as number) - weight))[0];
  return { file: nearest, weight: nearest.weight as number };
}

export const readBrandFont = (file: BrandFontFile) => readFileSync(resolve(process.cwd(), file.file));

/**
 * @font-face rules with the font data inlined, for SVG or HTML that must render identically
 * wherever it is opened. Browsers honor these; librsvg (sharp) does not — use text-outline for rasters.
 */
export function brandFontFaceCss(use: { family: BrandFontFamily; weight: number }[]): string {
  const files = new Map<string, BrandFontFile>();
  for (const entry of use) { const { file } = brandFontFor(entry.family, entry.weight); files.set(file.file, file); }
  return [...files.values()].map((file) => {
    const weight = Array.isArray(file.weight) ? `${file.weight[0]} ${file.weight[1]}` : String(file.weight);
    return `@font-face{font-family:'${file.family}';font-style:${file.style};font-weight:${weight};src:url(data:font/ttf;base64,${readBrandFont(file).toString('base64')}) format('truetype');}`;
  }).join('');
}
