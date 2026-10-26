# Design document

The current `LayeredDesign` contains final canvas dimensions, viewBox, background, ordered shape/image/text/logo layers, direction and brand lock. Raster photography remains an image layer inside SVG; the SVG does **not** magically vectorize the photo. Arabic headline, detail, body and CTA are independent text layers. The official logo is an immutable crop from the user's supplied original file, not reconstructed geometry.

Semantic fields are `headline`, `eyebrow`, `body`, `detail`, `cta`, `hero_image`, and `official_logo`. A master creative carries global facts and concept; each platform variant carries local line breaks, copy density, crop and layout. Changing a global verified fact must update all variants. A platform-local edit affects only its variant. IndexedDB snapshots store the editable inputs and history; they are currently browser-local, not shared team records.

Platform output is selected by the format registry in `platforms.ts`. GPT Image generation size is separate from exact platform export dimensions. Recomposition uses the direction and target aspect ratio, not a stretched bitmap. Future document versions should store coordinates, crop transforms, groups, provenance, candidate IDs and Fabric JSON alongside semantic fields for full round-trip editing.
