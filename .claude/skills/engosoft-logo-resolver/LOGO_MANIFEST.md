# Logo manifest for placement

Source of truth: `brand/logos.json`. Values the resolver uses:

| id | Ratio (w/h) | Main fill for contrast | Approved backgrounds |
| --- | --- | --- | --- |
| `lockup-reversed` | 1.5686 | `#FFFFFF` | `brand-blue` |
| `lockup-positive` | 1.5686 | `#0046FF` | `white`, `light` |
| `symbol-reversed` | 0.7408 | `#FFFFFF` | `brand-blue`, `brand-blue-texture` |
| `symbol-positive` | 0.7408 | `#0046FF` | `white`, `light` |

## Background classes

Produced by `regions.ts` from the pixels under the clear-space box:

| Class | Meaning |
| --- | --- |
| `brand-blue` | Near `#0046FF` hue and saturation, low complexity |
| `brand-blue-texture` | Brand-blue family with soft texture (e.g. the guideline wave pattern) |
| `brand-orange` | Near `#FF6600` — forbidden for every variant |
| `white` | Very light, near-neutral (low chroma), flat |
| `light` | Light surface or light photograph, quiet |
| `light-photographic` | Light but textured |
| `mid-tone-photographic` | Neither light nor dark — usually fails contrast |
| `dark-neutral` | Dark and flat |
| `dark-photographic` | Dark and textured |

A class in a variant's `unspecifiedBackgrounds` list is allowed only under the logged `engineering-default` policy (contrast and quietness must pass).

## Provisional geometry (pending brand confirmation)

- Clear space: 2 × the rendered orange-dot diameter on every side (dot = 0.0939 × lockup height, 0.2211 × symbol height).
- Minimum width on a 1080px-wide canvas: lockup 240px, symbol 44px; scale with canvas width.
- Edge margin: 48px on a 1080px canvas.
