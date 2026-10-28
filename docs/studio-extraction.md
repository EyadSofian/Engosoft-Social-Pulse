# Studio extraction fidelity

Extraction defaults to text only. Buttons, badges, icons, shadows and the illustration stay in the original background. Rebuilding flat shapes remains an explicit alternative in the extraction selector; it approximates their geometry and appearance.

Reliable text has a transparent snapshot of its original glyphs. The canvas and exported render use that snapshot until the wording or typography changes. Moving, rotating and proportional corner resizing retain the glyphs; changed wording, color or wrapping uses the editable brand-font renderer. A raster image does not provide its original font file. The inline editor uses the same Latin/Arabic font stack and does not replace the original glyphs just because the user enters editing mode.

Quiet backgrounds are cleaned deterministically from original pixels. Complex surfaces use a narrowly masked image edit; pixels outside the clearing boxes remain unchanged. Text that cannot be separated confidently stays in the artwork, with a notice, instead of being erased and replaced with guessed white lettering.

Object extraction requests a silhouette mask, then applies its alpha to the original object pixels. Model-generated object colors/details are discarded. A missing or implausibly small mask fails without replacing the current document.

The selection toolbar is constrained to the visible workspace, wraps on narrow screens, and avoids adjacent layers where space permits. Studio also respects 16:9 masters when opening or extracting a YouTube creative.

Existing layer documents are retained. Use **Rebuild layers** to apply the safer extraction to an older split; that operation starts from the original creative and remains undoable in the editor.

Regression tests cover pixel reconstruction on quiet surfaces, retention of badge artwork and glyph snapshots, color/detail preservation through a cut-out mask, move/resize/edit behavior, toolbar edge cases, server validation and save/reopen, and component rendering during text editing. These tests use supplied analysis and synthetic images; they do not certify a live model's segmentation quality or replace visual browser testing.

## AI edits after generation

The Studio's **AI edit** tool is one request box (`POST /api/studio/:id/command`, `server/creative-intelligence/studio/edit-router.ts`). The router sees the composed design, the layer list, the selection and an optional drawn box, and returns the cheapest correct operations:

- Text and shape changes (wording, size, colour, weight, alignment, position, visibility, fill) are applied to the layers exactly: no image generation, brand fonts kept, one undo step. New numbers that appear nowhere in the request, the old text or the approved copy are flagged.
- Picture changes become masked edits **in context** (`editInContext`): the crop around the area is edited at the model's resolution, only the area is pasted back with a feather that grows with its size, and an unpainted hole is retried once.
- Logo requests change nothing; the official logo is placed on save by the resolver.

A drawn area with "two versions" goes to `POST /api/studio/:id/ai-edit` (`variants: 2`). Region requests are first rewritten into a precise English instruction with the area in view, and every picture edit is checked before/after for missed requests, stray letters and visible seams; the checks show as notes beside the result with Undo, Try again and a hold-to-compare "before". Planning and checks use `OPENAI_EDIT_MODEL` (falls back to `OPENAI_VISION_MODEL`).

Reference-guided designs keep a private copy without the logo (`<id>-raw.png`). On the Create page, "Change something in this design" (`POST /api/svg-templates/:id/edit`) edits that copy with one requested change and the exact approved copy, then places the logo again; every version stays selectable before saving.
