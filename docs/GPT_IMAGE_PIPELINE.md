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
