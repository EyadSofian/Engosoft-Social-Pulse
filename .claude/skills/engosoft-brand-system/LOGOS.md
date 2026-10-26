# The four approved logo artworks

Extracted, path for path, from the guidelines' "Correct Logo Usage — Approved" section. `brand/logos.json` is authoritative; this table is a reading aid.

| id | Artwork | Approved on | Forbidden on |
| --- | --- | --- | --- |
| `lockup-reversed` | White symbol, wordmark, tagline; orange dot | Brand blue `#0046FF` | Orange, white, light |
| `lockup-positive` | Blue symbol and wordmark; orange dot; `#1A1A1A` tagline | White, light | Blue, orange, dark |
| `symbol-reversed` | White bars; orange dot | Brand blue, blue texture, blue circle badge | Orange, white, light, black/orange circle |
| `symbol-positive` | Blue bars; orange dot | White, light, white circle badge | Blue, orange, dark, black/orange circle |

Lockups are 97.34 × 62.05 (ratio 1.5686). Symbols are 19.16 × 25.87 (ratio 0.7408).

## Choosing between them

There is no "dark → white logo" shortcut. The resolver measures the actual pixels under each candidate zone and checks:

- Background class against each variant's approved, forbidden and unspecified lists.
- Contrast of the artwork's main fill against the zone.
- Visual complexity: busy texture under the tagline makes it unreadable.
- Room: a lockup needs about 2.1× the width of a symbol at the same height.
- Minimum size and clear space (provisional values in `brand/logos.json`).

Use a symbol when the composition has no room for a legible lockup, or when the brand name already appears in large type. Use a lockup when identity must be explicit.

## Unspecified backgrounds

The guidelines do not cover photography or dark non-blue surfaces. The current policy, marked `engineering-default`: a variant is allowed there only when contrast passes and the zone is quiet, and the decision is logged for brand-team review. Never present this as an official rule.

## Circle badges

The blue circle with `symbol-reversed` and the white circle (soft shadow) with `symbol-positive` are approved containers. Symbol width = 0.3157 × circle diameter. Draw them deterministically; they are not a fifth variant and not a license to put a plate behind a lockup.
