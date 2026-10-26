# Creative rebuild checklist

Tick a box only after the item is verified (test, render, or human review). See `docs/CREATIVE_REBUILD_AUDIT.md` for the findings behind each phase.

## Phase 0 — Deep audit
- [x] Inventory creative code, prompts, templates, references, platforms, Odoo bridge, tests
- [x] Identify the four approved logo artworks from the guidelines
- [x] Locate every logo transformation (plate, raster crops, favicon)
- [x] Explain weak output, prompt construction, reference flow, template-fill, platform variants
- [x] Write `docs/CREATIVE_REBUILD_AUDIT.md`
- [ ] Brand owner answers the four open questions in the audit

## Phase 1 — Claude project skills
- [x] Confirm project skill location for the installed Claude Code (2.1.310 discovers `.claude/skills/<name>/SKILL.md` from the repo root; all nine listed in a headless session)
- [x] Create focused skills with progressive disclosure (director, brand, references, gpt-image, logo-resolver, critic, platform, editor, video) — `scripts/check-skills.ts` passes
- [x] Retire `.agents/skills/*` (moved to `docs/archive/agents-v0/`)
- [x] Share skills in git (`.gitignore` keeps `.claude/*` private except `.claude/skills/`)
- [ ] Verify each skill is *invoked* on its intended requests — probes in place, blocked by the account usage limit on 2026-10-26; rerun `zsh scripts/skills/probe-triggers.sh`

## Phase 2 — Brand engine
- [x] Extract the four logos as exact transparent vectors (`brand/logos/`)
- [x] Machine-readable `brand/*.json` (logos, colors, typography, spacing, usage rules)
- [x] Manifest integrity tests (`tests/brand-manifest.test.ts`)
- [x] Logo asset registry module (`server/creative-intelligence/brand/registry.ts`, `integrity.ts`)
- [x] Logo compositor with honesty check (`logo-resolution/compositor.ts`)
- [x] Logo validator (variant, hash, ratio, clipping, margins, safe area, size, clear space, background class, contrast, complexity, zones)
- [x] Brand fonts vendored; exact server rendering via HarfBuzz outlines (`typography/text-outline.ts`); `@font-face` embedding for exports
- [x] Remove the white logo plate and raster-sheet crops from the legacy renderers, sidebar mark and favicon; 15 baked templates rebuilt
- [ ] Brand owner confirms provisional clear space, minimum sizes and photographic-background policy
- [ ] Calibrate region thresholds against human-reviewed placements on real generated creatives

## Phase 3 — Reference intelligence
- [ ] Card detection for montages (fixes the 20 broken Majd crops)
- [ ] Vision analysis per card (schema in the mandate) with cache
- [ ] Legacy-logo region mask before any reference reaches an image model
- [ ] Role-based retrieval (3–6 references, roles by purpose)
- [ ] Human approval flag; rejected work never becomes a positive reference

## Phase 4 — Context / Odoo
- [ ] Semantic Odoo tools (courses, events, instructors, schedule, registration URL, price, offer)
- [ ] `Fact<T>` provenance and conflict detection
- [ ] Time-aware entity ranking ("next week")

## Phase 5 — Creative intelligence
- [ ] Intent interpreter
- [ ] Creative strategist
- [ ] Creative director (3–4 concepts) + diversity validator
- [ ] Art director (canvas plan, text/logo/CTA zones)

## Vertical slice — full AI creative (2026-10-26, ahead of phases 5–9)
- [x] OpenAI key and Odoo verified from the server (117 Odoo events; CFM Course Online - 5745 resolved with Riyadh-time facts)
- [x] Full-creative pipeline: Odoo facts → creative director → compiled prompt → GPT Image → inspection → logo resolver (+ masked repair) → exact composite → copy check (`docs/GPT_IMAGE_PIPELINE.md`)
- [x] Create page runs it as a background job with progress; WhatsApp/Story 9:16 adaptation from the master
- [x] Real CFM run in the app: 3 directions + 1 WhatsApp version, every text field matched; logo placed on 3 of 3 after the scene-box fix
- [ ] Targeted repair of wrong Arabic text (today it only flags `needs_review`)
- [ ] Send masked reference images to GPT Image
- [ ] Golden-scenario comparison of gpt-image-2 vs gpt-image-2.5-flare before changing the default

## Phase 6 — GPT Image 2
- [ ] `CreativeImageProvider` + `OpenAIGPTImage2Provider` (verify current API parameters)
- [ ] Full-creative prompt compiler with logo reservation and canonical copy
- [ ] Reference images passed as real inputs with role instructions
- [ ] Candidate generation and edit operations

## Phase 7 — Visual QA
- [ ] Multi-axis critic with hard-fail rules
- [ ] Targeted repair with retry cap
- [ ] Copy validator for Arabic/English canonical text

## Phase 8 — Logo intelligence
- [ ] Region analysis (luminance, contrast, complexity, saliency, faces, text)
- [ ] Variant + placement selection
- [ ] Logo-first creative repair
- [ ] Test all four variants

## Phase 9 — Platform intelligence
- [ ] Format registry with safe areas
- [ ] Master creative → Facebook / Instagram / WhatsApp adaptations
- [ ] Per-variant LogoResolver and validators

## Phase 10 — Create Content UI
## Phase 11 — Editing and versioning
## Phase 12 — Evals (CFM webinar, course launch, engineering educational post first)
