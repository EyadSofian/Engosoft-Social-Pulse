# Handoff: the remaining phases of the AI design rebuild

For a coding agent picking this up. Read this file, then `docs/AI_DESIGN_AUDIT_2026-11-11.md` (Arabic, 17 numbered findings with file and line pointers). The numbers below (#1–#17) are that audit's numbers.

Project: `Engosoft-Social-Pulse` (React 19 + Vite + TypeScript, Express 5, Node 22, SQLite locally and Postgres on Railway). The user is Eyad, who talks Egyptian Arabic. Marketing and UI copy is Arabic, and the code and these docs are English.

## What the user wants

"Something very strong": templates and AI creation that work with the new or the old logo, in every size, with images that come out right. They judge by eye and pay per AI image. Rules from earlier in this project:

- **No hidden credits.** One design by default. The image count shown before running must be the real count. Never add image calls quietly.
- **Never stretch or edit one size into another.** Each size is drawn fresh for its own shape.
- **The user's own words go on the post verbatim.** Facts (prices, dates, names, course codes) come only from what they wrote or from Odoo, and are never invented. Two prices for two options (online/offline) are NOT an old and a new price.
- **Test with content unlike the sample.** The 50/50 template once broke as soon as the words changed. Always render with different lengths, no old price, English and Arabic, and every size.
- **Preview before wiring** a visual change, and show the user a picture.
- **Egyptian Arabic in chat, short and plain.** The user wants results, not narration. Offer to push to `main` only when they ask, and never push unasked.

## State of the code (main at `4a6ba8c`)

Done and pushed:

- Brand templates as code (`src/domain/brand-templates.ts`, `src/features/brand-templates/layout.ts`, `BrandTemplateComposer.tsx`, `server/brand-templates.ts`). They are laid out in the browser at every size.
- "Design it like this" (follow design): `server/creative-intelligence/generation/follow-design.ts` and `follow-content.ts`. A library design or an upload is read by vision, every text block is filled from the user's request, the image model redraws it as Image 1, and the stamp, hashtag and the design's own logo are placed from files.
- Phase 0 (4a6ba8c): the paid image is saved the moment it arrives; `salvageDirection` finishes a design when a later step fails; `trace.json` is written before drawing and after each design; `recoverInterruptedRuns` runs at server start; repairs are capped (`CREATIVE_REPAIR_CALLS`, default 1: wrong words first, then the logo corner, then cosmetic); `notes` (advice) are separate from `problems` (what holds a post back); other sizes use the design's model and quality; the cost on the Create page is a range. `tests/pipeline-safety.test.ts` drives `produceDirection` with a fake image model.

Done on branch `claude/design-foundation` (11 November, not merged or pushed):

- **1d** `src/features/creative-studio/creativeRequest.ts`: `fullCreativeBody` and `courseFacts` build the request on both screens. The Create page now sends the picked course's name and facts.
- **1a** `src/domain/brand-kits.ts` (kits `official` and `engo-soft-old`, files, ratios, size cap) is read by `layout.ts`, `svg-templates/render.ts`, `course-schedule.ts` and the server. `server/creative-intelligence/brand/place-logo.ts` `placeLogo(image, kit, spot)` places a kit (flat, verified official, or print treatment with grain and shadow). A template names its kit (`logo: { kit, place }`). The Studio keeps the design's kit on save (`StudioDoc.kit`, `ownLogoFor` in `studio-routes.ts`; audit #10).
- **1b** `src/domain/design-doc.ts`: the `DesignDoc` type, with converters from templates (round trip), followed designs (read blocks) and Studio docs.
- **1c** `server/creative-intelligence/render/template-render.ts`: `layout.ts` runs on the server, measured with HarfBuzz and the brand fonts. Text becomes outlines (coloured `<tspan>` runs too), pictures are embedded, and sharp rasterises. Widths match the browser's canvas to 0.1 px on the strings checked. Each line's box comes back, through rotated groups. `POST /api/brand-templates/render` serves any size.
- **2** `server/creative-intelligence/generation/skeleton.ts`, behind `CREATIVE_PATH=skeleton`, for library designs only. Template fill (`template-fill.ts`, which keeps the person's verbatim lines uncut) → DesignDoc → skeleton per size (full, without fixed files, fixed files alone, photo mask) → one edit call with the skeleton as Image 1 → fixed files laid back → `verifyLines` reads each line from its own crop → the finish ships, or the exact layout ships with the drawn photos. Other sizes, Studio bases and restarts work from `run.designDoc`. `tests/skeleton-path.test.ts`.
- **3 (#5)** `FallbackImageProvider` no longer switches model after a timeout.
- Layout fixes found while testing: `fit()` reported the wrapped width after joining lines (headlines ran off the story canvas), the 50/50 story and the offer layout now keep the story's side safe areas, and the offer badge stays on the canvas.

Not done yet: compare the skeleton path with the current redraw on real requests (needs a working key), then make it the default; skeleton for uploaded designs (needs a generic block renderer or phase 3's template from an upload); #9 (the large old-logo file); #13 (remove old paths once the skeleton is the default); template from an uploaded design; Studio re-adding the stamp and hashtag after an edit (it never did).

## How to work here

- Tests: `node --import tsx --test tests/*.test.ts`. Server tests listen on local ports, which the Claude sandbox blocks (`listen EPERM`), so run the full suite outside the sandbox. Typecheck with `npx tsc --noEmit` and build with `npx vite build`. All 428 tests passed at 4a6ba8c.
- **The local OpenAI key is expired (401).** No real image can be made locally. Everything must be testable with fakes: `tests/pipeline-safety.test.ts` and `tests/follow-content.test.ts` show how (a fake provider object with `generate` and `edit`, and a stubbed `fetch` for the `/v1/responses` calls, keyed by `text.format.name`). **Never ask the user to paste a key in chat.** If a real run is needed, ask them to put a capped key in their own `.env`.
- Looking at the UI: seed a throwaway sqlite DB (see the memory note `social-pulse-ui-check-method`): a scratch `.mts` sets `DATA_FILE`, imports `server/auth.ts` and `server/workspace.ts` before `initDb()`, then `createUser`. Add a temporary entry to the repo's `.claude/launch.json` with `DATA_FILE`, `PORT=4101`, `API_PROXY_TARGET=http://127.0.0.1:4101`, blank Telegram/Meta/TikTok/Snap/Odoo/SMTP/admin variables, and vite on its own port. Remove the entry and the files afterwards. Never run a dev server on a copy of the real DB. The Create page is `/`. When the browser pane is hidden, scripts stop; render SVG to PNG on the server with sharp instead and look at that.
- Don't use `rm -rf $VAR/*`; use `rm -rf -- "${VAR:?}"/*`.
- Commits: end with the attribution line given in the session's system reminder. Push to `main` only when the user says so.

## Phase 1 — one foundation (audit #14, #15, #16, #17, #10)

Goal: the pieces below become single things that everything else reads.

### 1a. `BrandKit`: one logo registry

Today there are five ways to place a logo: the verified registry (`server/creative-intelligence/brand/registry.ts`, `logo-resolution/*`, used by the AI path and the Studio), `placeOwnLogo` (follow-design.ts), `layout.ts` (`LOGO` constant, templates), `src/features/svg-templates/render.ts` (`LOGO_FILES`), and `server/course-schedule.ts`.

- Create a kit registry with at least two kits: `official` (the horizontal lockup, symbol and stacked lockup in `public/brand/logos/*.svg`) and `engo-soft-old` (the older «ENGO | SOFT» lockup). Each kit lists its files (white and blue versions, raster or vector), its native size, and its measured place per design shape.
- A design stores its kit id. The Studio (`studio/studio.ts` around line 456, `compositeLogo`) must re-composite the design's own kit, not always the official one (audit #10).
- One function, `placeLogo(image, kit, spot)`, replaces the five. Keep the shadow and grain treatment from `placeOwnLogo`.
- **The old logo file is a 214 px raster** cut from `public/brand-references/post-campaign-5050.jpg` (`public/brand/logos/engosoft-old-lockup-reversed.png`). It softens above about 270 px wide. **Ask the user for an SVG or a PNG at least 1000 px wide** and swap it in; nothing else about the kit changes. Until then keep the 1.25× size cap.

### 1b. `DesignDoc`: one description of a design

A JSON document: canvas size, background (colour, texture, grain), layers (photo, shape, text block with its words, role, box, font, size and colour, and the highlight phrase), fixed files (stamp, hashtag, logo kit) and their places. It is the common currency of:

- templates (`brand-templates.ts` inputs map to text blocks and fixed files),
- followed designs (`follow-content.ts` already produces blocks with `role`, `kind`, `was`, `text`, `highlight`, `box`; extend that shape rather than inventing a new one),
- the Studio (`studio/studio.ts` already has a document model; align with it before adding another),
- publishing (saved `creative` on a content item).

Start by writing the type and converters for the existing data. Do not rewrite everything at once.

### 1c. One renderer, on the server

`src/features/brand-templates/layout.ts` (about 800 lines) is the only exact renderer and it runs in the browser, so the server cannot make a size by itself. The server already has a second text engine, `server/creative-intelligence/typography/typeset.ts` and `text-outline.ts`, which measures with the real fonts.

- Make `layout.ts` run on the server with the same fonts (`server/creative-intelligence/brand/fonts.ts` has the font files; `layout.ts` takes a `measure(text, font)` function, so the change is mostly supplying a server measure and rasterising the SVG with sharp).
- Remove the duplicate typesetting paths once one covers the other's cases.
- Keep the browser preview, but make it show the server's output or the same code.

Acceptance: from a `DesignDoc` and a canvas size, the server returns a PNG that matches the browser preview pixel for pixel (a test renders a few templates at 1080×1350, 1080×1920, 1200×630 and 1702×630 and compares dimensions and a few sampled pixels).

### 1d. Same request, same result (audit #17)

The Create page's AI mode does not send the course name or facts, while the template screen does (`CreationHomePage.tsx` vs `BrandTemplateComposer.tsx`, both call `/api/ai/full-creative`). Make one shared function build the request body, and use it in both.

## Phase 2 — skeleton → AI finish → verify (audit #6, #7, #8)

The AI should not be asked for exact Arabic text, exact marks or re-layout. Code makes the exact structure; the model adds the art; code verifies.

```
request → fill the DesignDoc blocks (follow-content.ts, exists)
        → code renders the SKELETON at the requested size (phase 1c)
        → image model gets the skeleton as Image 1: "redraw this exactly, with art"
        → code places the fixed files on top (logo kit, stamp, hashtag)
        → VERIFY each text block by cropping it at its known box and reading it at full size
            match   → ship the redraw
            no match → ship the skeleton (exact by construction) with a note
```

Tasks:

1. `skeletonFor(doc, canvas)` using the phase 1c renderer. Put the user's photos or the AI-drawn photo into the photo layer. A skeleton with no art must still look like a clean design.
2. A new prompt for "redraw this skeleton with art" (the current `followDesignPrompt` copies a finished design and keeps its layout; the new one gets exact text already in place).
3. Verification (audit #6): split `criticism/inspect.ts`. Today one call at 1024 px JPEG with `reasoning: 'low'` does text reading, letter audit, element boxes, scoring and repair suggestions. Replace the text part with per-block crops read at full resolution against the known text; keep the scoring as an optional, separate call that only produces notes.
4. Other sizes (audit #7, #8): each size gets its own skeleton from the same `DesignDoc`, so the stamp, hashtag and logo stay in their places and the structure is exact. One image call per size, no repair calls.
5. Compare against the current path on the same requests before making it the default. The user's two samples (Interior and BIM on the 50/50 design) are in `outputs/campaign-5050-ai-2026-11-11/` and are good at the design's own shape; the new path must not be worse there.
6. Tests with the fake provider: the skeleton ships when verification fails; one image call per size; nothing is lost when the model fails.

What this does not solve: a free AI design with no template or reference. That stays model-dependent. Its best fix is to let the user upload a design that becomes a `DesignDoc` (phase 3).

## Phase 3 — clean-up and new templates without code (audit #5, #13, #9, #12)

1. **Fallback on timeout (#5).** `FallbackImageProvider` in `generation/provider.ts` switches model on a timeout, and the first call was probably already charged. Switch only on "model unavailable" (403/404, or a 400 about the model); on a timeout retry the same model once.
2. **Remove old paths (#13).** About 23 `CREATIVE_*`/`OPENAI_*` flags are read. After phase 2 is the default, delete the legacy director (`planCreative`, `engine: 'legacy'`), `CREATIVE_PROMPT=detailed`, and either typeset mode or the new skeleton path (whichever the skeleton replaces). Keep the tests green as you go.
3. **Template from an uploaded design.** Upload → vision extracts a `DesignDoc` (blocks, boxes, colours, fixed artwork) → the user adjusts boxes on screen → saved as a library template. `follow-content.ts` already reads blocks and boxes, so start from it. This replaces hand-written entries in `layout.ts` for new templates; the existing seven can stay hand-written.
4. **Logo (#9).** When the user supplies the large old-logo file, put it in the kit and delete the raster.
5. **Tests (#12).** Add a pipeline test for every new path with the fake provider, like `tests/pipeline-safety.test.ts`.

## Things that are easy to get wrong

- Inline SVG previews inherit the page's right-to-left direction. `layout.ts` sets `direction="ltr"` on the root for that reason; keep it.
- The browser's `fetch` for images in `exportPng` (`src/features/svg-templates/render.ts`) embeds every `<image>` including those inside masks; a new image reference must go through `embed`.
- A line cut at `maxChars` mid-word looked like a bug. Use `clipWords` and the one-shot shortening in `server/brand-templates.ts`.
- `numbersIn`/`digitsOf` fold Arabic-Indic digits and separators; use them when comparing numbers.
- The critic flags our own stamp and hashtag as watermarks. Those were moved to notes in phase 0; keep them out of `problems`.
- The cost shown to the user must match the real image count. If a new path adds calls, update `imagesPerDesign` / `repairCallsMax` in `server/usage.ts` and the estimate in `CreationHomePage.tsx`.
- `trace.json` is the run's record; write it through `writeTrace`/`updateTrace` (atomic rename), never `writeFileSync`.
- Railway restarts on every push to `main`. Anything long-running must survive that (that is what `recoverInterruptedRuns` is for).

## Order of work

1. Phase 1d (small, fixes a visible inconsistency), then 1a, 1b, 1c.
2. Phase 2 behind a flag (for example `CREATIVE_PATH=skeleton`), compared with the current path, then made the default.
3. Phase 3.

After each phase: typecheck, full test suite outside the sandbox, build, a rendered look at several sizes with content unlike the samples, then tell the user what changed and what was not verified. Offer to push; do not push unasked.
