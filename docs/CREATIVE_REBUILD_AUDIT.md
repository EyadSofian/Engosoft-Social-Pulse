# Creative rebuild audit (Phase 0)

Audited 2026-10-26 against the working tree of `Engosoft-Social-Pulse` (HEAD `62da5ab` plus uncommitted creative-studio work), the brand guidelines PDF, the social-plan deck and the strategic-roadmap deck. Every claim below was checked in code, in a rendered output, or in the PDF content stream.

## Summary

The current system is a **template-fill pipeline**. GPT Image 2 generates a text-free photo ("This is not a finished social poster"), which is pasted into one of six hard-coded SVG layouts with live text and a cropped logo. The image model never receives a reference image, the logo always ships inside a blue or white rectangle with an outdated tagline, Arabic text falls back to Arial with crude word-wrapping, and the 20 Majd reference cards are cropped across two posts. These are structural problems, not prompt problems: better wording cannot fix them.

## Answers to the seven focus questions

### 1. The four real Engosoft logo variants

The guidelines' "Correct Logo Usage — Approved" section shows four distinct artworks, all as outlined vector paths in the PDF. They are now extracted, unmodified, to `brand/logos/` by `scripts/brand/extract-logos-from-guidelines.py`:

| Variant | Artwork | Shown on, in the guidelines | Size (pt) |
| --- | --- | --- | --- |
| `lockup-reversed` | White symbol, wordmark and tagline; orange dot | `#0046FF` panels and pages | 97.34 × 62.05 |
| `lockup-positive` | `#0046FF` symbol and wordmark; orange dot; `#1A1A1A` tagline | White panel | 97.34 × 62.05 |
| `symbol-reversed` | White bars; orange dot | Blue circle badge; blue wave-texture page | 19.16 × 25.87 |
| `symbol-positive` | `#0046FF` bars; orange dot | Light page, standalone; white circle badge | 19.16 × 25.87 |

The blue and white circle badges are containers for the symbol, not further variants. "Incorrect Logo Usage" forbids recoloring any part (orange bars, white or blue dot, blue tagline, all-black symbol), orange backgrounds and orange or black circles, plus stretching, distortion and rotation. The guidelines give **no clear-space or minimum-size rule** and do not address photographic or dark-neutral backgrounds; `brand/logos.json` records engineering defaults for these under `provisional`, flagged for brand-team confirmation.

The tagline is **"Where Passion Becomes Success"**. The PNG the app uses today says "Empowering Educational Success".

Three generations of logo are in evidence:

| Where | Mark | Status |
| --- | --- | --- |
| Brand guidelines PDF | Three bars + orange dot, "Where Passion Becomes Success" | Current, approved |
| `public/brand/engosoft-approved-lockups.png` | Same bars, "Empowering Educational Success" | Outdated tagline; opaque raster |
| All 80 reference cards | "e │ ENGO SOFT" | Legacy; must not be imitated |

### 2. Why current creatives look weak

Rendered from `public/post-templates/*.svg` and `composeCreativeDesign`:

- **No composition is generated.** Six fixed layouts (`full_bleed_editorial`, `centered_portrait`, `technical_gallery`, `typographic_impact`, `floating_panel`, `offer_focus`) with hard-coded pixel coordinates. A photo is dropped into a rectangle and tinted. Every output reads as "image pasted into a card".
- **Logo on a white plate in every template.** `renderPosterSvg` draws `<rect … fill="#ffffff">` behind the logo (`src/features/post-design/templates.ts:105`) for all 15 templates.
- **Arabic typography is broken.** Fonts are not embedded, so renders use Arial. `wrap()` breaks lines on `floor(width / (size × 0.62))` characters, which splits "تعليم هندسي" into one word per line; this is why `tests/creative-engine.test.ts` test 12 fails today. Mixed Arabic/Latin lines ("… مع Engosoft") break bidi order.
- **Brand reduced to blue fill.** Palettes are `brand_blue`, `dark_navy`, `light_technical`, `emerald_gold`, `purple_tech`; most directions are blue/navy background + orange accent. Navy values (`#071A4B`, `#09215F`, `#0A245F`) are not brand colors.
- **Directions differ in layout id, not in idea.** The model chooses from fixed enums; if two share a composition, the server swaps in a deterministic fallback. Diversity is enforced by enum uniqueness, not by concept.
- **Body copy is too small** (26–32px on 1080) and CTA pills are generic.

### 3. How prompts are constructed

| Stage | File | Model | What it sends |
| --- | --- | --- | --- |
| Brief + 4 directions | `server/creative-brief.ts` | `gpt-4.1-mini` (default) | One long instruction string, user prompt, optional Odoo event, 2 reference cards as low-detail images, user uploads |
| Image prompt | `server/image-prompt-compiler.ts` (`engosoft-image-v2`) | — | Lookup tables keyed by `composition`, `family`, `colorMode`; asks for "ONE … IMAGE ASSET … not a finished social poster"; forbids all text |
| Generation | `server/post-image.ts` | `gpt-image-2`, `quality: medium`, 1024² / 1024×1536 / 1536×1024 | Text prompt only, unless the user uploaded one image (then `/images/edits` with that image) |
| Critic | `server/image-quality.ts` | `gpt-4.1-mini`, `detail: low` | Scores the bare photo 0–100; pass ≥ 75 and not fatal |
| Edit | `server/creative-edit.ts` | `gpt-4.1-mini` | Rewrites copy fields; `regenerate_image` triggers a full new image |

The user's prompt does not reach GPT Image raw, which is correct. But the compiled prompt is a template lookup, has no art-direction plan, no canvas plan, no logo reservation zone and no canonical copy. No module logs requests, prompt versions or cost.

### 4. Do references reach GPT Image?

**No.** `compileImagePrompt` writes lines like "Reference engineering-posts-2-3, role composition: …" into the text prompt. GPT Image has never seen those IDs, so the line carries no information. The generations endpoint receives no image inputs. Only the *text* brief model sees two low-detail reference thumbnails. Reference retrieval is keyword/tag overlap on hand-typed labels; roles are assigned by rank position (1st = content, 2nd = composition…), not by what each reference is good for.

Reference library state:

- 80 cards cropped from 5 montages by a fixed equal grid (`scripts/ingest-reference-montages.ts`).
- **All 20 `majd-promotions-*` crops are wrong**: that montage is a scrolled screenshot whose first row is cut off at the top, so each crop straddles two posts (verified visually for 1-1, 2-2, 3-3 and 4-4).
- Other sheets crop acceptably but trim card edges.
- All 80 are `analysisStatus: needs_review`, `manualVerified: false`, `qualityScore: null`.
- Every card carries the legacy "ENGO SOFT" logo, which would contaminate any generation that receives it.
- Montage resolution is about 400px per card: usable for analysis, too low to be strong image inputs.

### 5. Full creatives or template-fill?

Template-fill. The prompt compiler forbids letters, numerals and logos, and states the output is not a poster. Composition, text zones, hierarchy and CTA all come from `creative-renderer.ts` coordinates. GPT Image is a stock-photo generator in this architecture.

### 6. How platform variants are created

`src/features/creative-studio/platforms.ts` maps each platform to one size id (Facebook → square, Instagram → portrait, WhatsApp/TikTok/Snapchat → story, LinkedIn → wide) and truncates copy with `slice()`. The same layered layout is recomposed at the new aspect ratio by the coordinate table; the photo is cropped with `preserveAspectRatio="xMidYMid slice"`. There is no reframe/expand/edit, no safe-area model and no per-variant logo decision. The 1024-based generation sizes never match the 1080-based exports, so every export is a resample. Sizes are defined twice (`POST_SIZES` and `PLATFORM_FORMATS`).

### 7. Where brand assets are altered

| Location | Alteration |
| --- | --- |
| `src/features/brand/approved.ts` | "Variants" are viewBox crops of an opaque raster sheet; each ships its blue or white panel as a rectangle |
| `src/features/post-design/templates.ts:105` | White plate drawn behind every logo |
| `src/features/creative-studio/creative-renderer.ts:99` | `dark ? 'whiteOnBlue' : 'blueOnWhite'`: the primitive rule the mandate forbids, based on palette name, not pixels |
| `public/brand/engosoft-favicon.svg` | 150KB SVG embedding the whole lockup PNG as base64, cropped to the mark on its blue square |
| `public/post-templates/*.svg` | 15 baked exports (≈600–840KB each) carrying the plate and the outdated tagline |
| `scripts/build-post-templates.ts` | Regenerates the above from the raster sheet |
| `BRAND_REGISTRY` / `validateBrand` | Minimum widths (250px / 80px) and 24px safe area are invented, not from the guidelines; the logo is never stretched, which is correct |

No code asks an image model to draw the logo, and both image prompts forbid logos. That part is correct and is kept.

## Audit matrix

| Current component | Purpose | Decision | Reason | Replacement |
| --- | --- | --- | --- | --- |
| `server/odoo.ts` | Read-only Odoo schedule over JSON-2 / JSON-RPC | **Keep**, extend | Works, server-side, no secrets leak | Wrap as semantic tools (`search_courses`, `get_event`…) in `creative-intelligence/entities` |
| `server/connectors/*`, `sync.ts`, `store.ts`, plans, alerts | Social analytics and calendar | **Keep, do not touch** | Working integrations; out of scope | — |
| `server/creative-brief.ts` | Brief + 4 enum directions | **Rewrite** | One prompt does intent, strategy, direction and copy; enum directions | `intent/`, `strategy/`, `art-direction/` modules with versioned prompts |
| `server/image-prompt-compiler.ts` | Asset-only prompt from lookup tables | **Rewrite** | Forbids full creative; reference IDs meaningless to the model | `prompt-compiler/` full-creative compiler with logo reservation and canonical copy |
| `server/post-image.ts` | GPT Image call, retry, ranking | **Rewrite** | OpenAI syntax mixed with business logic; no image references; fixed `medium` quality | `CreativeImageProvider` + `OpenAIGPTImage2Provider` |
| `server/image-quality.ts` | 0–100 critic on the bare photo | **Rewrite** | Single score, low detail, critiques an asset not a creative | `criticism/` multi-axis critic with hard-fail rules |
| `server/creative-edit.ts` | Copy rewrite + regenerate flag | **Rewrite** | Two-way routing only | `edit-router` with the 10 operations in the mandate |
| `src/features/brand/approved.ts`, `registry.ts` | Logo crops, brand checks | **Rewritten** (Phase 2) | Raster-sheet crops, invented limits | Thin browser adapter over `server/creative-intelligence/brand` |
| `public/brand/engosoft-approved-lockups.png` | Logo source | **Remove** after migration | Outdated tagline, opaque | `brand/logos/*.svg` |
| `public/brand/engosoft-favicon.svg` | Favicon | **Rewrite** | Embeds whole sheet | Favicon from `symbol-reversed.svg` on a blue circle |
| `src/features/creative-studio/creative-renderer.ts` | Layered SVG composition | **Rewrite** | Fixed coordinates; Arabic wrap; logo rule | Overlay layer for exact facts + logo compositor; layout comes from the generation |
| `src/features/creative-studio/design-plan.ts` | Direction enums + local fallback | **Remove** | Fallback directions are static templates | Creative Director output schema |
| `src/features/post-design/templates.ts`, `public/post-templates/*`, `scripts/build-post-templates.ts`, `public/data/post-design-*.csv` | 15 static templates | **Remove** from the creation flow | Mandate rule 6 and 14; white logo plate | Request-specific directions. May survive only as a "saved layout" library later |
| `src/features/creative-studio/visual-references.ts` | Tag-overlap retrieval | **Rewrite** | Keyword scoring, positional roles | `references/` retrieval with explicit roles and embeddings |
| `scripts/ingest-reference-montages.ts` | Equal-grid montage crop | **Rewrite** | Breaks on the Majd sheet; trims edges | Card detection (gutter/edge projection) + per-card review |
| `public/reference-cards/*`, `reference-cards.json` | 80 cards + labels | **Re-ingest** | 20 bad crops; unverified labels; legacy logo | Re-cropped cards with vision analysis, `approved` flag, logo-region mask |
| `public/visual-references/*.jpg` | Source montages | **Keep** | Evidence | — |
| `public/post-assets/*.jpg` | 5 sample photos | **Keep** as test fixtures only | Never shown as a generated result | — |
| `src/features/creative-studio/context-resolver.ts` | Event matching, `VerifiedValue`, conflicts | **Keep**, extend | Correct idea | `Fact<T>` with provenance and confidence |
| `src/features/creative-studio/platforms.ts` + `POST_SIZES` | Platform → size | **Rewrite** | Duplicated, one format per platform, no safe areas | `platform-adaptation/registry` |
| `src/features/creative-studio/documents.ts` | IndexedDB versions | **Rewrite** | Browser-local, not team-shared | Server-side generation history in SQLite |
| `src/features/creative-studio/FabricCanvasProof.tsx` | Fabric proof | **Defer** | Editor comes after quality | Revisit in Phase 11 |
| `src/pages/home/CreationHomePage.tsx`, `src/pages/ai-studio/PostDesignerPage.tsx` | Creation UI | **Rewrite** in Phase 10 | Built around enums and template gallery | Composer → directions → campaign set |
| `.agents/skills/*` (8 skills) | Agent guidance | **Replace** | Wrong location for Claude Code (`.claude/skills/` is the project-skill path); single-file; encode the asset-only rule | `.claude/skills/engosoft-*` with progressive disclosure |
| `docs/*.md` (5 files) | Architecture notes | **Supersede** | Describe the asset-only design | The documents listed in the mandate |
| `tests/creative-engine.test.ts` | Engine tests | **Rewrite** alongside modules | Test 12 fails on the wrap bug | Per-module tests |
| `tests/fixtures/creative-scenarios.json` | 20 eval prompts | **Keep**, extend | Matches the golden-set idea | `evals/` runner storing full traces |

## Other findings

- **Security.** Creative endpoints refuse non-loopback hosts until authentication exists (`server/index.ts`), and keys stay server-side. Keep this. Rate limits are in-memory per IP.
- **Odoo.** Reads `event.event` (and an optional custom model) with name/date/address/website URL only. No instructor, price, seats or course model is read yet. `.env` has Odoo credentials configured; the live connection was not exercised during this audit.
- **Text model default** is `gpt-4.1-mini`. The orchestration layer is moving to Claude per the mandate; the provider split should cover text models too.
- **Observability.** No request log, cost estimate or prompt-version record per creative.
- **Brand guidelines copy errors.** Every core swatch in the PDF is captioned `0046ff`. `brand/colors.json` uses the swatch fills, which are unambiguous.
- **Business context** (from the two decks). The tool must serve course lifecycle posts (weekly/monthly schedule, one-week-before teaser, first-lecture Zoom post, closing review video), certificate and exam-pass recognition, HR recognition, new courses and corporate contracts, with marketing approval before publishing.

## What changed in this phase

- `brand/` created with `manifest.json`, `logos.json`, `colors.json`, `typography.json`, `spacing.json`, `usage-rules.json` and four extracted SVGs (also copied to `public/brand/logos/`).
- `scripts/brand/extract-logos-from-guidelines.py` reproduces the extraction and its hashes.
- `tests/brand-manifest.test.ts` pins hashes, geometry, fills, transparency and color rules (5 tests, passing).
- No template, renderer, prompt or UI code was changed.

## Later phases

Phase 1 (skills) and Phase 2 (brand engine) are recorded in `CREATIVE_REBUILD_CHECKLIST.md`, `docs/BRAND_ENGINE.md` and `docs/LOGO_RESOLUTION.md`.

## Open questions for the brand owner

1. Are master SVG/AI exports of the four artworks available? The extracted vectors are faithful to the PDF, but a master file is the better source of truth.
2. Official clear-space and minimum-size rules (currently provisional).
3. Which variant may sit on photography or dark non-blue backgrounds (currently allowed only behind a contrast check, logged for review).
4. Should the legacy "ENGO SOFT" mark appear anywhere still? It is in every published reference.
