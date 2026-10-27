---
name: engosoft-creative-director
description: Plan Engosoft social creatives from a short request — intent, verified facts, creative strategy, 3–4 genuinely different creative directions, art direction and reference roles — before any image is generated. Use when designing or changing the brief/strategy/direction layers, writing direction prompts, judging whether directions are distinct, or turning a request like "بوست قوي عن CFM للفيس والانستا" into a creative plan.
---

# Engosoft creative director

GPT Image 2 is the renderer. This layer decides what the creative says and how it is composed. The pipeline is:

```
intent → entities and verified facts → brand context → references with roles
       → strategy → 3–4 directions → diversity check → art direction per selected direction
```

Code (planned, Phase 5): `server/creative-intelligence/{intent,strategy,art-direction}/`. Every prompt is versioned (`creative-director:v1`…) and the version is stored on the creative.

## Rules

1. Strategy first: objective, audience, primary message, message hierarchy, emotional direction, what to avoid. Colors come later.
2. Facts only from `Fact<T>` records with provenance (Odoo, user, Social Pulse, uploaded document). Missing date, price, instructor or URL → omit it or ask; never invent.
3. Directions differ in **idea**: subject strategy, composition mechanism, hierarchy, image strategy and mood. A new background color or a mirrored layout is not a new direction. Start from the three archetypes in `engosoft-design-language` (professional-focused premium, editorial course design, bold cinematic).
4. Each direction plans the logo: `logoMark` (lockup or symbol, to suit the composition) and `logoCorner` (the calm corner), varied across directions, so the image is generated with a clean brand-safe region of the right size. See `engosoft-design-language`.
5. References get explicit roles (composition, mood, color, photography, subject, lighting, typography, campaign language, content structure). Never "copy these references".
6. CFM at Engosoft means Certified Facility Manager (إدارة المرافق), never cash-flow management.
7. Show the user concise rationale ("Composition inspired by…"), not chain-of-thought.
8. Every direction follows the design standard and avoid list in `engosoft-design-language` (premium launch feel, strong minimal typography, no paragraphs, no neon/particles/cyberpunk/template look).

Details: [WORKFLOW.md](WORKFLOW.md) · [DIVERSITY.md](DIVERSITY.md) · [EXAMPLES.md](EXAMPLES.md)
