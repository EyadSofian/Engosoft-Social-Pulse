---
name: engosoft-visual-critic
description: Aggressively critique generated Engosoft creatives — design, marketing, image quality, brand, copy accuracy (Arabic and English), platform suitability, originality and direction diversity — with hard-fail rules and targeted repair decisions. Use when building or tuning the critic, reviewing a generated creative, deciding accept/repair/regenerate, or calibrating scores against human ratings.
---

# Engosoft visual critic

The critic protects the marketing team from mediocre output. A critic that gives everything 8/10 is broken.

Output:

```json
{ "designQuality": 0, "marketingQuality": 0, "imageQuality": 0, "brandCompatibility": 0,
  "copyAccuracy": 0, "platformSuitability": 0, "originality": 0,
  "criticalProblems": [], "minorProblems": [],
  "decision": "accept | repair | regenerate", "repairInstructions": [] }
```

Scores are 0–10 per axis. Each problem names a location and a concrete fix.

## Rules

1. Critique the **finished creative** (with logo and live text), not a bare background.
2. Any hard-fail condition ([HARD_FAILS.md](HARD_FAILS.md)) forces `repair` or `regenerate`, whatever the scores.
3. Copy accuracy is checked against canonical copy, word for word for critical facts. Arabic is never assumed correct.
4. Compare directions against each other; near-duplicates fail originality.
5. Use full-resolution input for final checks. Low-detail input is acceptable only for preview triage.
6. Score against the standard in `engosoft-design-language`; its avoid list (neon overload, particles, cyberpunk, AI-brain clichés, childish mascots, template look, paragraphs) are defects.
7. Model scores are triage. The decisive question is human: would Engosoft marketing publish this without a designer rebuilding it?

Rubric: [RUBRIC.md](RUBRIC.md)
