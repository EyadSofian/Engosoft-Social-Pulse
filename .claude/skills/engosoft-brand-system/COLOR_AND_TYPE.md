# Color and typography

## Core palette (from the guidelines' swatch fills)

| Token | Hex | Role |
| --- | --- | --- |
| `brandBlue` | `#0046FF` | Primary |
| `brandDarkBlue` | `#001BB7` | Secondary |
| `brandOrange` | `#FF6600` | Accent |
| `neutralDark` | `#1A1A1A` | Neutral |
| `neutralLight` | `#727272` | Neutral |
| `softBlueGray` | `#F2F5FA` | Secondary surface |

Ramps and semantic colors are in `brand/colors.json`. The PDF captions every core swatch "0046ff"; that is a typo in the document, so trust the JSON.

Navy values the old renderer used (`#071A4B`, `#09215F`, `#0A245F`, `#081A50`) are **not** brand colors. A campaign may still use contextual color (photography, cultural palettes), but never label it as brand.

## Typography

- English: **Plus Jakarta Sans**, all weights.
- Arabic: **Almarai**, weights 300 / 400 / 700 / 800.

Rendering must use the real fonts. Falling back to Arial or a system font is a validation **failure**. Server rendering loads `brand/fonts/` through `server/creative-intelligence/brand/fonts.ts`; exported SVGs embed the fonts as `@font-face` data.

## Arabic text

- Never trust Arabic produced inside generated pixels; canonical copy lives separately and is compared after generation.
- Line breaks are decided by measured shaping (Pango/HarfBuzz), not character counts.
- Mixed Arabic/Latin lines ("دورة CFM") need correct bidi order; check the rendered output, not the string.
