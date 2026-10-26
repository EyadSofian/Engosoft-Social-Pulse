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
