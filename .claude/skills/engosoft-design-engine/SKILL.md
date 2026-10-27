---
name: engosoft-design-engine
description: The runtime design engine of the Create page — the creative team as typed, versioned skills (creative director, content strategist, hook writer, copywriter, caption writer, reference director, theme director, layout designer, visual-weight designer, spacing designer, typography director, image art director, lighting director, colour director, brand director, logo director, Photoshop compositor, visual critic, creative repair, platform designer), 16 visual themes, the compiled image prompt, the critic rubric and the automatic repair router. Use when changing how generated posts are planned, prompted, critiqued or repaired, adding a skill or theme, debugging a poor design from its design plan, or running the A/B evaluation.
---

# Engosoft design engine

The engine behaves like a design team, not a prompt wrapper. Each specialist is a **runtime skill** in `server/creative-intelligence/skills/`: its rules, a strict JSON schema of the decision it returns, and a version. Stages compose skills into one structured call where each skill answers in its own field, so decisions stay separate, typed, logged and replaceable.

```
request → Odoo facts
  → STRATEGY  (strategy.ts)  creative-director · content-strategist · hook-writer · copywriter · caption-writer · reference-director (sees the reference images) · theme-director
  → DESIGN    (design.ts, per direction)  layout-designer · visual-weight-designer · spacing-designer · typography-director · image-art-director · lighting-director · color-director · brand-director · logo-director · photoshop-compositor
  → compileDesignPrompt (engine.ts) — the GPT Image prompt is built from those decisions; there is no static creative prompt
  → GPT Image → CRITIQUE (criticism/inspect.ts) visual-critic + creative-repair (+ compositor checks), on the real pixels
  → repair router (full-creative.ts `localRepairs`) → logo resolver → copy check → platform-designer for 9:16 / 1.91:1
```

| File | Contents |
| --- | --- |
| `skills/types.ts` | `DesignSkill`, strict schema helpers, `runStage`, `stageInstructions` |
| `skills/strategy.ts`, `design.ts`, `quality.ts` | The skills of each stage |
| `skills/themes.ts` | 16 themes: composition, photography, lighting, typography, spacing, graphics, texture, image treatment, density, mood, avoid |
| `skills/engine.ts` | `planStrategy`, `planDesign`, `compileDesignPrompt`, typed decisions, reference loading |
| `src/domain/design-engine.ts` | Theme ids and names, `EngineSettings` (shared with the Create page) |
| `brand/design-language.ts` | Design standard, avoid list, logo marks and guidance (see `engosoft-design-language`) |

## Rules for changing it

1. **Change the skill, not a prompt string.** Add or edit rules in the skill that owns the decision; bump its version (`layout-designer:v2`). Versions are stored on every run (`brief.engine.skills`).
2. **Schemas stay strict**: every object closes its properties and requires all of them (`obj()` does this). Optional data uses an empty value (a zone of width 0), not a missing field. `tests/design-engine.test.ts` checks this.
3. **Positions are normalized** (0..1, origin top-left) so a plan is format-independent; the compiler turns them into percentages. Adaptations recompose instead of reusing the master's positions.
4. **No static templates.** Never hard-code hero-left/text-right layouts; the layout designer decides the arrangement from the idea and the theme.
5. **Repairs are the smallest operation.** The router applies only local IMAGE/LIGHTING/COLOR/COMPOSITING/ASSET repairs (critical or major, modest region, not over text) in one masked edit that only replaces those regions, then re-inspects. Layout, spacing, typography and full regenerations are recorded for review — text is rendered by the image model, so repainting it would break the copy check.
6. **Image edits only change their boxes** (`generation/patch.ts` `pasteInside`), and an edit that comes back unpainted (`looksUnfilled`) is retried once, then dropped.
7. **The critic judges the pixels**: 12-axis rubric (idea, composition, visual hierarchy, visual weight, spacing, typography, image quality, compositing, lighting, colour, brand fit, professional finish), AI tells, compositing failures and a professional test. The overview scores (design, marketing, image, brand) stay for the UI.

## Controls

Create page → **خيارات التصميم**: theme (or auto), creativity (safe / balanced / experimental), photo or graphic, minimal or detailed, reference strength (loose / balanced / strong). API: `POST /api/ai/full-creative` with `settings`; `engine: 'legacy'` runs the previous single-prompt director for A/B tests.

## Debugging a poor design

Approvers and admins see **خطة التصميم (للمطورين)** under each result: idea, hooks and copy, theme, references and their grades, layout and spacing, visual weight, typography, image/lighting/compositing, colour/brand/logo, the compiled prompt, the critic and the repairs. API: `GET /api/ai/runs/:requestId/design`. Find the stage whose decision was wrong and fix that skill.

## Evaluation

```bash
node --import tsx scripts/eval-design-engine.ts            # every scenario, A = legacy, B = engine
node --import tsx scripts/eval-design-engine.ts cfm pmp     # chosen scenarios
```

Generates each scenario with both engines (real GPT Image cost: about 4 images per scenario), then a blind judge scores the images without knowing which engine made them. If B is not clearly better, the skill system is not finished.
