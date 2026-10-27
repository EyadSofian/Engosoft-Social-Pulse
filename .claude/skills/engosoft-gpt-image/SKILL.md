---
name: engosoft-gpt-image
description: Generate and edit complete Engosoft social creatives with GPT Image 2 — full-creative prompt compilation, reference image inputs with roles, logo reservation zones, candidate generation, targeted repair edits and the provider adapter. Use when writing or changing image prompts, calling the OpenAI image API, choosing generation settings, or debugging why generated creatives look wrong.
---

# Engosoft GPT Image 2

Production model: `gpt-image-2`. Do not switch it silently. All calls go through `CreativeImageProvider` (`generate`, `edit`) so business logic never touches OpenAI request syntax. Current adapter: `OpenAIGPTImage2Provider` (Phase 6; today's direct calls live in `server/post-image.ts`).

## Default mode: `full-creative`

GPT Image renders the **whole creative**: composition, subject, background, decorative graphics, depth, headline and CTA regions, campaign mood, across the entire canvas. It is not a background or stock-photo generator, and the output must not look like a photo pasted into a card.

Two things never come from generated pixels:

1. **The official logo.** The prompt reserves a clean brand-safe region and forbids logos, watermarks, brand names and fake lettering there. The exact asset is composited afterwards (see `engosoft-logo-resolver`).
2. **Unverified exact facts.** Dates, prices, URLs, instructor names and times come from canonical copy and are checked after generation; wrong ones are repaired or overlaid as live text.

The prompt carries the art-direction standard and avoid list from `engosoft-design-language`, and reserves the corner and size for the logo mark the director planned for that direction.

## Rules

1. Never send the raw user prompt. The compiler takes intent, verified facts, strategy, direction, art direction, references with roles, brand context, platform, logo zones and canonical copy.
2. References are real image inputs, each with a stated role. Never "copy these references". Mask the legacy logo in reference images.
3. Settings follow the stage: efficient previews, high quality for the selected direction, the edit workflow for localized changes, cached derivatives for thumbnails. Verify parameter names and allowed values against the current OpenAI docs before changing them.
4. Generate several candidates for a new direction; never accept candidate #1 automatically. A text-only change never spends a generation call.
5. Repair prompts name exactly what is wrong and what to preserve. Retry cap: one targeted repair, optionally a second, then move to another candidate.
6. Stamp every output with `image-prompt-compiler:vN`, model, settings, reference IDs and roles.

Details: [PROMPT_STRUCTURE.md](PROMPT_STRUCTURE.md) · [REPAIR_PROMPTS.md](REPAIR_PROMPTS.md) · [API_NOTES.md](API_NOTES.md)
