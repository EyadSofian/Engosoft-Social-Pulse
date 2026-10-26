# Compiled prompt structure

Sections, in order. Write intentionally; length is not quality.

```
TASK        Create a complete professional social media campaign creative for Engosoft (engineering training).
OBJECTIVE   What the viewer must understand and do.
CANVAS      Aspect ratio and orientation; the whole canvas is designed.
CONTENT     Canonical copy to render, verbatim, with its hierarchy (headline, support, date line, CTA).
SUBJECT     Who/what is shown; verified identity only (supplied instructor photo) or an unnamed professional.
COMPOSITION Focal point, subject zone, text zones, visual flow — from the art direction, in canvas fractions.
ART DIRECTION  Lighting, lens, depth, graphic language, density.
REFERENCE USAGE  Image 1: composition only. Image 2: lighting and photographic treatment. Image 3: mood. Do not reproduce their text, people or logos.
TYPOGRAPHY INTENT  Weight, scale contrast, Arabic-first hierarchy, Almarai-like geometric Arabic sans / Plus Jakarta Sans-like Latin.
BRAND FEEL  Engosoft blue #0046FF and orange #FF6600 as identity accents where they serve the idea; not a blue flood.
LOGO RESERVATION  Keep the [zone] region visually calm and clean, about [w]% × [h]% of the canvas. Do not place logos, watermarks, brand names or lettering there.
MUST PRESERVE  (edits only) What must not change.
DO NOT      Invent dates, prices, names, certificates, discounts, URLs; add any logo or watermark; add fake UI; distort faces or hands.
```

## Arabic in generated pixels

Ask for the canonical Arabic headline verbatim and keep it short. Treat the result as unverified: the copy validator compares it to canonical copy, and critical text that is not `exact` is repaired (localized edit, or cleared region + live text, or recomposition with live typography).

## Example logo reservation

"Keep the upper-left 26% × 15% of the canvas a calm continuation of the background, with no text, faces, objects or lettering. An official brand mark will be placed there later."
