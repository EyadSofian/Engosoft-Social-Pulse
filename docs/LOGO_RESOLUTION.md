# Logo resolution

Status: Phase 2 delivers measurement, compositing and validation. Automatic variant/zone selection across a generated creative and logo-first repair are Phase 8.

## Pipeline

```
creative (no logo) → measureRegion per candidate zone → validateLogoPlacement → compositeLogo → verifyComposite
```

All in `server/creative-intelligence/logo-resolution/`.

### `background-class.ts` (pure)

WCAG luminance and contrast, HSL, chroma, and `classifyBackground()` into the nine classes listed in `.claude/skills/engosoft-logo-resolver/LOGO_MANIFEST.md`. Thresholds live in `REGION_THRESHOLDS` and are versioned (`logo-regions:v1`). White uses chroma, not HSL saturation, because near-white saturation is unstable (`#F2F5FA` reads as 44% saturated).

### `regions.ts`

`measureRegion(image, box)` returns mean color, luminance, luminance spread, complexity (mean neighbor gradient) and class. `contrastProfile()` reports mean contrast and the share of pixels below 3:1 against the artwork's main fill.

### `compositor.ts`

`rasterizeLogo()` renders the verified SVG at 2× and reduces to the exact width; height always follows the artwork ratio. `compositeLogo()` refuses placements that would clip. `verifyComposite()` proves the result is honest: no pixel outside the logo box changed (catches plates and tints), the ratio is intact, and the logo box equals a fresh render of the approved file over the original background (max channel difference 2).

### `validator.ts`

`validateLogoPlacement()` returns `{ pass, issues, policy, zonesChecked, measurements }`. Error codes and their meaning are in `.claude/skills/engosoft-logo-resolver/VALIDATION.md`. Limits: contrast ≥ 3:1 with ≤ 10% low-contrast pixels; complexity ≤ 0.18 under a lockup (thin tagline), ≤ 0.30 under a symbol.

## Calibration so far

Sweep of 4 variants × 4 corners on the five sample photos in `public/post-assets` plus the guideline wave texture: each photo got at least one valid placement; choices were visually correct (reversed on blue/dark, positive on the CAD drawing's white margin); `verifyComposite` passed for every composite. This is a smoke test, not a calibrated benchmark. Thresholds need review against human-judged placements on real generated creatives.

## Legacy renderers (until Phase 10 replaces them)

The browser cannot measure pixels synchronously, so the legacy template and direction renderers decide this way:

1. If the layout puts photography under the top-left corner, use the approved **white circle badge with the blue symbol**. It reads on any photo without a plate. Which layouts do this is a table in `templates.ts`, checked by a pixel test (`tests/post-designer.test.ts`) that renders every template with a red photo and fails if the table misses one.
2. Otherwise choose from the flat fill with `pickVariantForFlatBackground()`: prefer a variant the guidelines approve for that class, then an unspecified one with ≥ 3:1 contrast.

The approved lockup is stacked (symbol above wordmark), about twice the height of the old horizontal crop. Landscape formats therefore default to the symbol.

Known legacy issues not fixed here: character-count line wrapping (visible overlaps in the typographic direction) and no clear-space check against headline zones. Server-side validation with zones is required before any export is treated as publishable.
