# Image model comparison — gpt-image-2 vs gpt-image-2.5-flare

Run 2026-10-26 with `scripts/creative/compare-models.ts scripts/creative/golden-core.json`. Three scenarios (CFM course with Odoo facts, PMP course launch with Odoo facts, engineering educational post without facts), two creative directions each, every direction rendered by both models from the **same brief and prompt**, `quality: high`, 1088×1360 → 1080×1350. Outputs and `results.json` are in `data/creatives/compare-core-2026-10-26/` (local, gitignored).

| | gpt-image-2 | gpt-image-2.5-flare |
| --- | --- | --- |
| Runs / API errors | 6 / 1 ("returned no image") | 6 / 0 |
| Median latency | 119 s (105–218) | **37 s** (32–94) |
| Logo placed by the resolver | 5/5 | 6/6 |
| Critic: design / marketing / image / brand (0–10) | 7.2 / 7.2 / 7.9 / 7.6 | 7.9 / 7.6 / 8.0 / 7.9 |
| Text problems seen on review | 1 misspelled headline («باحترارف») | 1 broken fact bar (time line split) |
| Streams partial images | Yes (verified) | No partials in the test |
| Look | More photographic | More polished 3D/illustrative |

The earlier single-direction run (same day) also had `gpt-image-2` at 115 s vs `flare` at 43 s with similar scores; `gpt-image-2.5-sunburst` returned HTTP 500.

## Recommendation

Use **gpt-image-2.5-flare** as the default: about 3× faster, no API errors, equal or slightly better critic scores, and every design had a valid logo placement. Keep `gpt-image-2` selectable (`OPENAI_IMAGE_MODEL`) for photographic campaigns and for the live partial-image preview, which only it provides.

Caveats: 12 images is a small sample, and critic scores come from one vision model. Both models still misspell Arabic sometimes, which is why the inspector now audits every approved string letter by letter (it caught the «باحترارف» typo that free transcription had auto-corrected).

## 2026-11-02 — why the designs looked weak, and the fix

Run with `scripts/creative/ab-engine.ts` (the design-engine path the Create page uses, not the legacy director) on the three golden scenarios, two directions each, `quality: high`. Outputs and logs are in `outputs/ai-quality-ab-2026-11-02/` (local); before/after sheets are in [`docs/evals/2026-11-02/`](evals/2026-11-02/).

**Findings in the pipeline**

1. The image prompt was 12,800–14,000 characters (about 2,000 words): every planned spec (lens, Kelvin, optical corrections, fractions of the canvas) plus sections that contradicted each other. The house style said "a vivid royal-blue world" and "one real photographic subject"; the colour section said "blue and orange as accents, not a flat flood"; a direction planned without people still got a person.
2. The colour director's rule was "Do NOT make everything blue … blue is an accent", the critic penalised "generic blue gradients" and suggested "reduce the blue saturation", and the corporate theme avoided "generic blue gradients". The real Engosoft feed is a royal-blue world, so every plan in the baseline came out light grey (`#EEF3F5`-like backgrounds in 4 of 4 checked plans) and looked like generic stock.
3. One image per direction, no choice.

**Changes**

- `compileBriefPrompt` (default; `CREATIVE_PROMPT=detailed` restores the old compiler): a short creative brief in the order OpenAI recommends — use and format, idea, scene and subject, the house look in one colour world, layout in words, logo space, exact text, constraints. About 4,500 characters. A person only when the plan's subject is one; the logo rule no longer forbids "Engosoft" when the approved copy contains it. Reference images are numbered with their role.
- `color-director:v2` chooses the world first (`royal-blue` by default, `engineering-paper` for educational/technical posts) and fills the roles inside it. The critic, repair examples and theme avoid-lists no longer push against blue.
- Best of N (`CREATIVE_CANDIDATES`, default 2): one API call draws two images; each is read by the critic and the best one goes on — correct copy first, then room for the official logo, then verdict and score.
- `OPENAI_IMAGE_QUALITY` (default `high`); `xhigh`/`max` accepted for 2.5 models (not evaluated: the account ran out of credits).

**Results** (6 designs per row; "failed" = no room for the logo)

| Variant | Ready | Needs review | Failed | Copy wrong | Mean critic score | Median time |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline: flare, detailed prompt, 1 image | 1 | 5 | 0 | 0 | 7.54 | 42 s |
| sunburst, detailed prompt, 1 image | 0 | 3 | 3 | 1 | 7.32 | 110 s |
| **New: flare, brief prompt, colour v2, best of 2** | 1 | 5 | 0 | 0 | **7.71** | **41 s** |
| sunburst, brief prompt, colour v2, best of 2 (5 of 6; credits ran out) | 0 | 4 | 1 | 0 | 7.53 | 92 s |

The critic's numbers move little (it scores almost everything 7–8); the visible difference is the brand world — compare the sheets. `gpt-image-2.5-sunburst` costs the same per token ($8 image in / $30 image out per 1M) but was 2–2.6× slower and drew a face or busy detail into the logo corner far more often, so **flare stays the default**. Two candidates add about $0.15 and no wall-clock time per run (measured ≈ $0.07–0.08 per 1088×1360 image at `high`).

Caveats: 24 designs, one critic model; the selection by logo room was added after the sunburst best-of-2 round, which is one reason that row failed once.
