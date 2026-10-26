# Logo validation

`validateLogoPlacement` in `server/creative-intelligence/logo-resolution/validator.ts` returns `{ pass, issues[], measurements }`. Any issue with severity `error` blocks export.

| Code | Check | Severity |
| --- | --- | --- |
| `unknown_variant` | Variant id is one of the four in `brand/logos.json` | error |
| `asset_integrity` | File hash matches the manifest | error |
| `aspect_ratio` | Rendered height = width / ratio (±1px) | error |
| `out_of_canvas` | Logo box fully inside the canvas (no clipping) | error |
| `edge_margin` | Logo at least the edge margin from every edge | error |
| `below_minimum_size` | Width ≥ provisional minimum, scaled to canvas width | error |
| `clear_space_canvas` | Clear-space box fits inside the canvas | error |
| `forbidden_background` | Background class is in the variant's forbidden list | error |
| `low_contrast` | Main fill vs mean background contrast ≥ 3:1 | error |
| `busy_background` | Complexity under the clear-space box ≤ threshold | error |
| `zone_collision` | Clear-space box intersects a text, face, subject, CTA or platform-UI zone | error |
| `unspecified_background` | Class not covered by the guidelines; allowed by engineering default | warning |

## What validation does not prove

- Contrast and complexity are measured on the creative *before* compositing. Re-run after any background edit.
- Zones come from the art director plan and detectors. If no zones are supplied, collision checks cannot run and the result says so (`zonesChecked: false`); treat that as unverified, not as clean.
- A passing logo check does not make the creative publishable; the critic and other validators still run.
