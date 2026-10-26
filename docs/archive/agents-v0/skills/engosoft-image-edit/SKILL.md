---
name: engosoft-image-edit
description: Route natural-language edits to text, layout, asset or image operations.
---

# Image Editing

1. Classify requests as text/data edit, layout edit, asset replacement, image edit, image regeneration, platform reflow or brand operation.
2. Use deterministic changes for copy, positioning, crop and resize. Do not spend image generation calls on these.
3. For an image edit, specify the exact object or region and preserve all other scene invariants.
4. Keep previous candidate and edited branch; show before/after for user comparison.
5. Never mutate the locked official logo or convert live Arabic text into pixels.
