# Brand engine

The brand is data in `brand/` and code in `server/creative-intelligence/brand/`. UI components read it; they never restate a color, logo or font rule.

## Data (`brand/`)

| File | Content | Source |
| --- | --- | --- |
| `logos/*.svg` | The four approved artworks, transparent | Vector paths copied from the guidelines PDF (`scripts/brand/extract-logos-from-guidelines.py`) |
| `logos.json` | Hashes, geometry, fills, approved/forbidden/unspecified backgrounds, containers, provisional clear space and minimum size | Guidelines + measured geometry |
| `colors.json` | Core palette, ramps, semantic colors, non-brand colors in use | Swatch fills in the PDF (captions are wrong) |
| `typography.json` | Plus Jakarta Sans / Almarai | Guidelines |
| `usage-rules.json` | `official` rules with evidence, `provisional` engineering defaults | Guidelines |
| `spacing.json` | Provisional margins | Engineering default |
| `fonts/` | Almarai (4 static weights), Plus Jakarta Sans (variable, upright + italic), OFL licenses | google/fonts repository |

Forbidden backgrounds combine the guidelines' "Incorrect Logo Usage" page (orange) with pairings that are illegible by construction (white artwork on white or light, blue artwork on brand blue). Everything else is `unspecified` and only allowed behind a contrast check, logged as `engineering-default`.

## Modules (`server/creative-intelligence/`)

| Module | Runs in | Responsibility |
| --- | --- | --- |
| `brand/registry.ts` | Node + browser | Zod-validated access to `brand/*.json`; variant lookup; height from width; scaled minimum size; clear space; edge margin; background verdicts; circle containers |
| `brand/integrity.ts` | Node | `verifyBrandAssets()` compares every logo file and its public copy with the pinned hash; `loadApprovedLogo()` refuses a changed file |
| `brand/fonts.ts` | Node | Font file registry, weight resolution, `@font-face` CSS with inlined font data for SVG/HTML exports |
| `typography/text-outline.ts` | Node | HarfBuzz shaping + Unicode bidi + measured line breaking → vector outlines |
| `versions.ts` | both | Version strings to store on every creative |

## Why text is outlined

On macOS, sharp/librsvg resolves fonts through CoreText and ignores both fontconfig and sharp's `fontfile` option: an SVG asking for Almarai rendered in Geeza Pro/Helvetica with no error. Linux servers resolve through fontconfig instead. Rendering would differ per machine and fail silently.

`outlineText()` removes font lookup from rasterization: it shapes text with HarfBuzz (`harfbuzzjs`, MIT) against the vendored files, orders runs with the Unicode Bidirectional Algorithm (`bidi-js`, MIT), breaks lines by measured advance width, and emits `<path>` outlines. Output is identical everywhere and cannot fall back.

Behaviors worth knowing:

- `family: 'brand'` (default) uses Almarai for Arabic script and Plus Jakarta Sans for Latin letters, per the guidelines.
- Dates and times (`04-10-2026`, `7:30`) are wrapped in left-to-right isolates by default. Plain UBA turns digits after Arabic letters into Arabic numbers and shows "2026-10-04"; browsers do the same.
- Text that does not fit is reported as `overflow`, never truncated with an ellipsis. Missing glyphs are reported in `missingGlyphs`; both are validation failures for canonical copy.

Browser previews still use live `<text>` with Google Fonts. Exported SVGs that must render anywhere can inline fonts with `brandFontFaceCss()`.

## Legacy renderers

`src/features/brand/approved.ts` is the browser API over the registry: exact-file `<image>` layers, `pickVariantForFlatBackground()`, the white circle badge, data-URL loading for self-contained exports, and `normalizeLogoVariant()` for drafts saved with the old cropped-sheet names. The legacy template and direction renderers now use it; see `docs/LOGO_RESOLUTION.md` for how they choose a variant.

## Tests

`tests/brand-manifest.test.ts` (files, hashes, geometry, fills, transparency) and `tests/brand-engine.test.ts` (registry, integrity, region classes, compositor honesty, validator rules, text shaping and bidi, fonts).
