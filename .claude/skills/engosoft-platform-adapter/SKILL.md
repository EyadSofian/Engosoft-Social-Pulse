---
name: engosoft-platform-adapter
description: Adapt one Engosoft master creative into Facebook, Instagram, WhatsApp, LinkedIn, TikTok and Snapchat versions — format registry, safe areas, reframe/expand/edit/recompose strategies, per-platform copy density and independent logo resolution. Use when working on platform sizes, the format registry, campaign variants, safe zones, or "اعملها واتساب"-type requests.
---

# Engosoft platform adapter

Users pick platforms, never pixels. A campaign is one **master creative** plus platform variants that keep its identity: subject, visual idea, mood and assets.

```
CFM Campaign
├── Facebook
├── Instagram
└── WhatsApp
```

## Rules

1. All formats come from one configurable registry (`PlatformFormat`: id, platform, purpose, aspect ratio, output size, safe area, max text density). No pixel sizes anywhere else.
2. Adapting is not resizing. Choose a strategy per variant: **reframe** (crop with a moved focal point), **expand** (outpaint), **edit** (move/reflow elements), **recompose** (regenerate with the master as reference). Prefer the cheapest strategy that keeps quality.
3. Variants may move the subject, extend background, change headline breaks, cut supporting copy, move the CTA, move the logo, or switch to another approved logo variant.
4. Each variant reruns the logo resolver, safe-area validator and copy validator independently.
5. Global verified facts propagate to every variant; platform-local edits stay local.

Details: [REGISTRY.md](REGISTRY.md) · [ADAPTATION.md](ADAPTATION.md)
