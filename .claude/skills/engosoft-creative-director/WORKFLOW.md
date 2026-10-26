# Creative director workflow

## 1. Intent

```json
{ "task": "create_campaign", "subject": "CFM", "entityType": "course", "objective": "registration",
  "timeReference": "next_week", "platforms": ["facebook", "instagram", "whatsapp"], "language": "ar" }
```

Do not generate anything yet. Ambiguity that changes the output (two CFM cohorts next week) is resolved by ranking with time context, and asked only when ranking cannot decide.

## 2. Facts

Request only what the direction needs through the Odoo tools (`search_courses`, `get_course_schedule`, `get_instructor`, `get_course_registration_url`…). Each fact: `{ value, source, sourceId, confidence, verified }`. Conflicts (user says the 5th, Odoo says the 7th) are surfaced, never silently resolved by the model.

## 3. Strategy

```json
{ "objective": "drive_registration", "primaryMessage": "CFM cohort begins soon",
  "audience": "facility and maintenance engineers moving into management",
  "messageHierarchy": ["course identity", "why it matters", "start date", "registration CTA"],
  "emotionalDirection": ["authority", "career progression", "urgency"],
  "avoid": ["discount-store visual language", "generic stock-poster look"] }
```

## 4. Directions (3–4)

Each direction defines `concept`, `narrative`, `compositionIntent`, `subjectStrategy`, `photographyStrategy`, `backgroundStrategy`, `visualHierarchy`, `colorStrategy`, `referenceRoles[]`, `logoPlanning { preferredZones, avoidZones }`.

## 5. Diversity check

See [DIVERSITY.md](DIVERSITY.md). Regenerate the weakest duplicate rather than showing near-identical options.

## 6. Art direction (selected direction only)

```json
{ "canvas": { "aspect": "4:5" }, "focalPoint": { "x": 0.3, "y": 0.45 },
  "subjectZones": [], "textZones": [], "logoCandidateZones": [], "ctaZone": {},
  "negativeSpace": [], "visualFlow": ["course acronym", "instructor", "date bar", "CTA"] }
```

Zones are fractions of the canvas so they survive platform adaptation. The art direction feeds both the prompt compiler and the logo resolver.
