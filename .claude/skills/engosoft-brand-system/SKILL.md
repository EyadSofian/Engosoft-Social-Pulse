---
name: engosoft-brand-system
description: Engosoft brand rules as code — the four approved logo artworks, brand colors, Plus Jakarta Sans / Almarai typography and logo usage rules. Use when touching anything that renders, recolors, sizes, validates or exports Engosoft branding, when editing brand/*.json or brand/logos, or when a creative's colors or fonts need checking.
---

# Engosoft brand system

The brand is data in `brand/`, not prose scattered through components. Read the JSON; never restate a brand value from memory.

| File | Holds |
| --- | --- |
| `brand/manifest.json` | Version, tagline, source PDF hash, deprecated assets |
| `brand/logos.json` | The four approved logo artworks, hashes, geometry, approved and forbidden backgrounds, provisional clear-space and minimum size |
| `brand/colors.json` | Core palette, ramps, semantic colors, colors that are *not* brand |
| `brand/typography.json` | Plus Jakarta Sans (English), Almarai (Arabic) |
| `brand/usage-rules.json` | `official` rules from the guidelines and `provisional` engineering defaults |
| `brand/fonts/` | Vendored OFL font files used for server rendering |

Code entry point: `server/creative-intelligence/brand/registry.ts` (typed, schema-validated access) and `integrity.ts` (hash checks).

## Non-negotiable rules

1. The four logo artworks are immutable files. Never ask an image model to draw, edit, recolor or "include" the logo. Composite the exact file after generation.
2. Never stretch, rotate, recolor, fade, outline, shadow or box the logo. No plate or rectangle behind it, ever — pick another variant, another zone, or repair the creative.
3. The orange dot is always `#FF6600`. The positive lockup tagline is always `#1A1A1A`.
4. The tagline is "Where Passion Becomes Success". The old raster sheet saying "Empowering Educational Success" and the legacy "e │ ENGO SOFT" mark in reference posts are deprecated.
5. Brand is not "blue background + orange CTA". Brand can live in the logo, type, accents and layout discipline while campaigns use contextual palettes.
6. A `provisional` rule is not an official one. When a decision rests on one, say so and log it.

Details: [LOGOS.md](LOGOS.md) · [COLOR_AND_TYPE.md](COLOR_AND_TYPE.md) · [CHANGING_ASSETS.md](CHANGING_ASSETS.md)

## Verify

```bash
node --import tsx --test tests/brand-manifest.test.ts tests/brand-engine.test.ts
```

Run `node --import tsx .claude/skills/engosoft-brand-system/scripts/check-brand-assets.ts` for a readable integrity report.
