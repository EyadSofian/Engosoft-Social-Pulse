---
name: engosoft-reference-intelligence
description: Engosoft Creative Memory — ingest reference posts and montages, split contact sheets into individual cards, analyze each design, assign reference roles, and retrieve 3–6 purposeful references for a request. Use when working on reference ingestion, public/reference-cards, montage cropping, reference analysis schemas, retrieval ranking, or approved/rejected creative memory.
---

# Engosoft reference intelligence

References are memory, not templates. Each stored design has provenance, a structured analysis, a natural-language "DNA" description, explicit approval state and optional performance data.

Current state (audit 2026-10-26): 80 cards in `public/reference-cards/` cut by a fixed grid from 5 montages in `public/visual-references/`. The 20 `majd-promotions-*` crops straddle two posts; all labels are `needs_review`; every card shows the legacy "ENGO SOFT" logo.

## Rules

1. The individual design is the unit. Montages are split by detecting card edges and gutters, never by an equal grid, and each crop is reviewed or marked `needs_review`.
2. Analyze once and cache (keyed by image hash and analyzer version).
3. Retrieve 3–6 references per request, each with a role. Content roles may inform subject; style roles (composition, mood, lighting…) must not import their subject matter.
4. Reference images sent to an image model have the legacy logo region masked, and the prompt states what each image is for.
5. Only explicitly approved designs become positive references. Rejected or failed generations never do.
6. Unknown quality or performance stays `null` and never boosts ranking.

Details: [INGESTION.md](INGESTION.md) · [ANALYSIS_SCHEMA.md](ANALYSIS_SCHEMA.md) · [RETRIEVAL.md](RETRIEVAL.md)
