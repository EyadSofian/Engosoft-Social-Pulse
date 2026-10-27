---
name: engosoft-logo-resolver
description: Choose, place, composite and validate the exact official Engosoft logo on a finished creative — region analysis, variant selection among the four approved artworks, clear space, contrast, collision checks and logo-first creative repair. Use for any logo placement, logo validation failure, "move the logo", platform variant logo decisions, or code under server/creative-intelligence/logo-resolution.
---

# Engosoft logo resolver

The logo is never part of the generated pixels. The creative is generated with a reserved brand-safe zone; afterwards this pipeline places the exact file:

```
creative → region analysis → candidate zones → variant compatibility
         → variant + placement → composite exact asset → validate → (repair → retry)
```

Code: `server/creative-intelligence/logo-resolution/`

| Module | Responsibility |
| --- | --- |
| `regions.ts` | Measure a box: luminance, contrast against a fill, visual complexity, background class |
| `compositor.ts` | Rasterize the exact SVG at the target width and composite it; returns the placement record |
| `validator.ts` | Checks a placement against brand rules and content zones; returns issues and pass/fail |

## Rules

1. Variant comes from measured pixels and `brand/logos.json`, never from a palette name or "dark → white".
2. Candidate zones: the four corners inside platform safe areas, plus custom zones only if the art director planned them.
3. Never put the logo over a face, headline, CTA, important subject or platform UI.
4. If no variant fits any zone: do **not** shrink below minimum, lower opacity, add a plate or overlap content. Set `requiresCreativeRepair` and issue a targeted edit that clears negative space (see [EXAMPLES.md](EXAMPLES.md)), then resolve again.
5. A failed validation blocks export. Never show a failed placement as a success.
6. Each platform variant resolves independently; the same campaign can use different variants per platform.
7. The mark (lockup or symbol) and corner follow the design: the director plans them per direction and `resolveLogo({ preferredMark, preferredCorner })` tries them first; the other mark is a fallback only. Do not default every design to the lockup. Rules: `engosoft-design-language`.

Details: [LOGO_MANIFEST.md](LOGO_MANIFEST.md) · [VALIDATION.md](VALIDATION.md) · [EXAMPLES.md](EXAMPLES.md)

## Check a placement

```bash
node --import tsx .claude/skills/engosoft-logo-resolver/scripts/validate-logo-placement.ts <creative.png> <variantId> <x> <y> <width> [zones.json]
```

Prints the region measurements and every validator issue; exits non-zero on failure.
