---
name: engosoft-design-language
description: The Engosoft art-direction standard for generated creatives — premium launch feel, editorial hierarchy, strong minimal typography, controlled layered construction, three composition archetypes, the anti-patterns that look cheap, and how each design picks its own official logo treatment (lockup or symbol, and the corner). Use when writing or tuning direction prompts, image prompts or the critic, when a creative "looks cheap / like a template", or when deciding which logo mark and corner a design should use.
---

# Engosoft design language

The target: a viewer should feel this came from an AI creative director inside a professional design studio — not an image generator and not a template.

Code (single source for director, image prompt and critic): `server/creative-intelligence/brand/design-language.ts` (`design-language:v1`). Change the rules there, then update this file; the director, `compileFullCreativePrompt` and the inspector all read the same constants.

## Standard

1. **Premium launch quality.** A campaign from a top studio, never a generic template.
2. **Editorial hierarchy.** One focal point. Order of reading: headline → subject → facts → CTA.
3. **Typography carries the idea.** Few words, large and confident, generous negative space. Short strong statements; never paragraphs.
4. **Controlled, layered construction.** Considered background, one hero subject, intentional lighting, clear graphic composition, reserved headline space, restrained details. Nothing scattered, nothing flying in from every side.
5. **Light.** Soft and directional with depth and gentle perspective; a subtle blue glow and at most one small orange accent of energy.
6. **Colour.** Engosoft blue `#0046FF` and orange `#FF6600` are confident accents inside a contextual palette, never a flat flood.
7. **Adaptable.** Keep headline, subject and CTA in the central area so the master can be recomposed for 9:16 and 1.91:1 (recomposed — subject repositioned, headline reflowed, spacing and density changed — never just cropped).

## Avoid (the critic reports these as defects)

Random flashy effects or lens flares · excessive particles or sparkles · gaming, cyberpunk or sci-fi HUD overload · neon or glow on everything · generic AI-brain / circuit-head / robot clichés · childish cartoon mascots or clip-art · cheap SaaS or stock template layouts · paragraphs of text · unstructured elements flying in from everywhere.

## Directions: three archetypes

Directions differ in composition, not colour. Start from one archetype each:

| Archetype | Composition |
| --- | --- |
| Professional-focused premium | One confident (unnamed) professional, strong light, headline beside them |
| Editorial course design | Typographic, structured grid, refined image panel, information laid out like a magazine page |
| Bold cinematic | A dramatic scene or metaphor filling the frame, headline set into the image with depth |

## Logo: every design picks its own treatment

All four official artworks are in play; the design decides which one, the pixels decide the colour.

| Choice | Who decides | Rule |
| --- | --- | --- |
| Mark: `lockup` (symbol above the wordmark) or `symbol` (mark alone) | Creative director, per direction (`logoMark`) | Lockup for spacious, editorial, text-light layouts where the name should read; symbol for dense, full-bleed, cinematic or subject-heavy layouts where a lockup would crowd |
| Corner | Creative director (`logoCorner`) | The naturally calm corner, away from headline, faces, subject and CTA. In RTL layouts the headline usually sits right, so a left corner is often calm; bottom corners only when the CTA is not there |
| Positive or reversed | Logo resolver, from measured pixels | Never from a palette name; see `engosoft-logo-resolver` |

- Vary the treatment across the directions of one request — not the same mark in the same corner every time.
- The prompt reserves a clean area sized for the planned mark (lockup ≈ 32 % × 20 %, symbol ≈ 17 % × 15 % of the canvas).
- The resolver tries the planned mark and corner first; the other mark is only a fallback when the planned one cannot pass validation. With no plan (older runs) both marks compete on fit.
- The Studio keeps the treatment a design already has (last Studio save, else the generator's choice).
- Never stack, re-arrange, recolour or redraw a logo to get a "horizontal" version. Only the four approved files exist; a new layout needs an approved file from the brand team.

## Checks

```bash
node --import tsx --test tests/design-language.test.ts
```
