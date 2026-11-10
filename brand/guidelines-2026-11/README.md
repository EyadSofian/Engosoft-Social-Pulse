# Engosoft brand guidelines — November 2026 pack

Source: *Brand Guidelines for UI-UX* (PDF) and the logo, SVG and Social Media Posts packages the team shared on
2026-11-10. This folder keeps the logo SVGs and 1080×1350 copies of the post designs (the masters are 4500×5625)
as references for the dashboard UI and, next, for the AI design layer.

## Colors

| Role | Base | Scale |
|---|---|---|
| Primary — Brand Blue | `#0046FF` | `#0C53FF` `#2F7CFF` `#56A1FF` `#85C5FF` `#B3DDFF` `#D5EDFF` |
| Secondary — Brand Dark Blue | `#001BB7` | `#001CE3` `#0328FF` `#0020FF` `#1444FF` `#3F74FF` `#A9CAFF` `#CFE3FF` `#E5F0FF` |
| Accent — Brand Orange | `#FF6600` | `#FF7D0A` `#FF9A32` `#FFC06D` `#FFDAA5` `#FFEFD3` `#FFF8EC` |
| Neutrals | `#1A1A1A` | `#272727` `#404040` `#737373` `#A3A3A3` `#D3D3D3` `#E6E6E6` `#F5F5F5` |
| Background — Soft Blue Gray | ≈ `#F1F4F9` | |
| UI semantic | success `#32B771` · danger `#E5484D` · warning ≈ `#FFC53D` · info `#0090FF` | |

The PDF's swatch labels repeat `0046ff` for several roles and `ffdaa5` / `404040` for a grey and the yellow; the
values above are read from the swatches themselves. The UI mock-ups are light: soft blue-grey page, white cards,
blue primary buttons, orange used sparingly as the accent (the logo dot, a tag, a highlight).

## Typography

- English: **Plus Jakarta Sans**, all weights.
- Arabic: **Almarai** (4 weights: 300, 400, 700, 800), modern Arabic sans-serif.

## Logo

Inspired by the letter E: three ascending strokes (growth) and an orange dot (the graduate ready for work).
Never stretch, distort or rotate it; use the approved forms and colors only.

| File | Use |
|---|---|
| `logos/lockup-horizontal-positive.svg` | Symbol + "engosoft" side by side + tagline, blue on light. **New**: not in `brand/logos`. |
| `logos/lockup-horizontal-reversed.svg` | Same, white on blue/photo. **New**. |
| `logos/lockup-stacked-positive.svg` / `lockup-stacked-on-blue.svg` | Stacked lockup (already approved as `engosoft-lockup-*`). |
| `logos/symbol-positive.svg` | The symbol alone (approved as `engosoft-symbol-positive`). |
| `logos/badge-circle-blue.svg` / `badge-circle-light.svg` | Symbol in a circle: avatars, profile pictures. |
| `logos/app-icon-square-blue.svg` | Square app icon. |

Tagline: *Where Passion Becomes Success*. The horizontal lockup is what the post designs put at the top.

## Post design system (from `posts/`)

All posts are 4:5 portrait. Two surfaces alternate: **light** (white/soft blue-grey with faint wave lines) and
**blue** (`#0046FF` with lighter wave gradients). Common to every design:

- Small horizontal lockup at the top (left on English layouts, centred on some), or the symbol alone when a photo fills the top.
- One very large, bold headline in Plus Jakarta Sans, two or three lines, left-aligned; tight leading.
- Short body text in a small regular weight; contact lines when the post sells (website, phone `+966 9200 16295`,
  "Engineering Training & Professional Development").
- `www.engosoft.com` at the bottom-left.
- **Signature motif** bottom-right: three short diagonal strokes plus the orange dot, taken from the symbol.
- Orange only as accent: a tracked word ("F R E E"), a label bar ("WHAT DRIVES THE COMPANY", "Over 15 years of
  experience in CFM"), a scalloped discount badge.

Templates in the pack:

| Post | Pattern |
|---|---|
| 01–02 Generic post | Eyebrow "Your Design Here", body, giant two-line headline at the lower left, dash pattern along the bottom. Light and blue. |
| 03–04 Webinar | Symbol top-centre, "webinar" huge, "FREE" tracked in orange, speaker photo in a soft wavy frame, name + orange credential bar. Light and blue. |
| 05–06 Core values | Rounded full-bleed photo card, symbol top-right, white headline, label bar (blue or orange), body. |
| 07 Creative | Huge headline behind a person cut-out (the person overlaps the words), soft blue gradient. |
| 08 Offer | Blue, headline top-left, person in a soft frame on an orange swoosh, scalloped orange "Discount 50%" badge. |
| 09–12 Carousel | Slide number huge at the bottom-right (01, 02, 03, 04), headline top-left, contact block, motif. Slides alternate light/blue. |
| 13–14 Carousel end | A near-empty frame with only the orange dot, then the horizontal logo end card with the tagline. |

### Carousel rules read from the pack

- Same 4:5 frame on every slide; alternate light and blue so the swipe is visible.
- The slide number is the largest element after the headline and sits in the same corner on every slide.
- The logo lockup stays at the top on content slides; the last slide is the logo end card.
- Each slide keeps the motif and the website in the same place, so the set reads as one piece.

These rules are the brief for the next step: teaching the AI design layer from these references and the Drive library.
