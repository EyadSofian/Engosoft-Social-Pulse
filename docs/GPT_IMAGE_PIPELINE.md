# GPT Image full-creative pipeline

GPT Image renders the **entire post**: scene, subject, typography, info bars, CTA. Only the official logo is added afterwards, as the exact approved file.

```
request
 → Odoo context      context/odoo-context.ts         best upcoming matching event; facts converted to the event's time zone
 → creative director generation/full-creative.ts      gpt-5.5: canonical copy (headline, subheadline, CTA) + 3 distinct directions
                                                      fact lines (date, time, mode) are built in code from Odoo, never by a model
 → prompt compiler   compileFullCreativePrompt        complete-post task, exact text list, reserved top-left logo zone, RTL cues, bans
 → image model       generation/provider.ts           OpenAIImageProvider (generations / edits), one retry on 5xx/429/network
 → resize            1088×1360 → 1080×1350 (4:5), 1088×1936 → 1080×1920 (9:16): same ratio, nothing cropped away
 → inspection        criticism/inspect.ts             gpt-5.5 vision: text transcription, face/subject/text boxes, generated logos, defects, scores
 → logo resolver     logo-resolution/resolver.ts      4 corners × 4 variants × 2 sizes, validated on real pixels and zones
   ↳ if nothing fits: masked edit of the reserved corner, re-inspect, resolve again (one repair)
 → composite         logo-resolution/compositor.ts    exact SVG, verifyComposite proves nothing else changed
 → copy check        typography-validation/copy-check.ts   word-level match; dates/times digit-for-digit
 → status            ready | needs_review | failed — never shown as success when a check failed
```

Every run is saved in `data/creatives/<requestId>/` (raw images, final PNGs, `trace.json` with brief, prompts, model, inspection, logo decision, copy checks). The folder is gitignored.

## API

| Route | Purpose |
| --- | --- |
| `POST /api/ai/full-creative` `{ prompt, format: 'feed' \| 'story', directions: 1-3 }` | Starts a job, returns `{ jobId }` |
| `GET /api/ai/jobs/:id` | Status, current stage, and the public run when done |
| `POST /api/ai/full-creative/:requestId/adapt` `{ directionId, format }` | Recomposes a finished direction for another format (edit with the master as input), then the same checks |
| `GET /api/creatives/:requestId/:file` | Final PNGs only (`d1.png`, `d1-story.png`) |

All routes are loopback-only until user authentication exists, rate-limited to 6 requests per 10 minutes, and keys never leave the server. Jobs live in memory; results survive on disk.

## Models

| Setting | Default | Note |
| --- | --- | --- |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-flare` | Chosen after `docs/MODEL_COMPARISON.md`; `gpt-image-2` remains selectable |
| `OPENAI_CREATIVE_TEXT_MODEL` | `gpt-5.5` | Creative director |
| `OPENAI_VISION_MODEL` | `gpt-5.5` | Inspection, including a letter-by-letter audit of every approved string |

## Known limits

- Generated Arabic is checked, not repaired: a text mismatch marks the post `needs_review`. Targeted text repair (localized edit or live overlay) is the next step.
- Inspection boxes are model estimates (inflated by 1.5%); the logo validator's pixel checks are exact, its zone checks are only as good as those boxes.
- Reference images are not yet sent to GPT Image; every reference card carries the legacy logo and needs masking first.
- Each format beyond the master is a separate edit call (cost and 1–2 minutes).

## Typeset mode (default since 2026-11-01)

Every saved run before this change ended `needs_review`, almost always because the image model misspelled Arabic, and a run took 3.5–4 minutes (two medium-reasoning planning calls of ~1 minute each, then inspection, a repair edit and a second inspection). Design-engine runs now split the work:

```
strategy (low reasoning, no captions) → design plans ∥ captions (parallel)
 → image model draws a text-free visual, leaving the layout designer's text zones calm
 → typography/typeset.ts sets headline, supporting line, fact chips and CTA in Almarai / Plus Jakarta Sans
   (HarfBuzz shaping; light or dark text and scrim chosen from the real pixels)
 → logo resolver uses the exact text boxes (no vision call needed) → one critic pass on the image before the logo
 → only critical, local, non-text repairs run unattended (safe: the picture has no text to damage)
```

The copy is exact by construction, so the letter-by-letter audit is skipped. Text the critic reads outside the typeset boxes (fake writing, a 3D «CFM» sign) is reported as a problem. Each result stores `textMode`, the `typeset` layout and a `dN-clean.png` without text or logo, ready for the Studio to open as editable layers.

| Setting | Default | Note |
| --- | --- | --- |
| `CREATIVE_TEXT_MODE` | `model` | The image model designs the typography into the post, with approved Engosoft posts attached as references and a masked re-lettering for misspelt strings. `typeset` sets the copy in the brand fonts on a text-free visual instead. |
| `CREATIVE_REFERENCE_IMAGES` | on | `off` stops attaching the approved posts in public/design-references to new generations. |
| `OPENAI_STRATEGY_REASONING` | `low` | `medium` / `high` for richer strategy at about a minute more. |
| `OPENAI_DESIGN_REASONING` | `low` | Same for the per-direction design plan. |

Measured on one real CFM request (2 directions, `gpt-image-2.5-flare`, high quality): 136 s end to end with low reasoning, versus 210–240 s for earlier runs.
