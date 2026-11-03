# Format registry

```ts
interface PlatformFormat {
  id: string; platform: Platform;
  purpose: 'feed' | 'story' | 'status' | 'vertical' | 'landscape';
  aspectRatio: number; outputWidth: number; outputHeight: number;
  safeArea: { top: number; right: number; bottom: number; left: number }; // canvas fractions
  maxRecommendedTextDensity: number;
}
```

Starting values for the Phase 9 registry. They are common current practice, **not verified platform specs**; check each platform's current guidance when building the registry and record the date.

| Platform | Purpose | Ratio | Output |
| --- | --- | --- | --- |
| Instagram | feed | 4:5 | 1080 × 1350 |
| Instagram | story | 9:16 | 1080 × 1920 |
| Facebook | feed | 4:5 | 1080 × 1350 |
| WhatsApp | status | 9:16 | 1080 × 1920 |
| LinkedIn | feed | 4:5 or 1.91:1 | 1080 × 1350 / 1200 × 627 |
| TikTok | vertical | 9:16 | 1080 × 1920 |
| Snapchat | vertical | 9:16 | 1080 × 1920 |

Vertical formats have UI overlays at the top and bottom; their safe areas are larger than feed formats'.

**Current registry (2026-11-03):** `PUBLISHING_PRESETS` in `src/domain/output-presets.ts` is the one source — 40 sizes, 11 of them LinkedIn, with official sources in `docs/publishing-formats.md`. The drawn size of each comes from the image API rules (`generationSizeFor`: multiples of 16, at most 3:1, never upscaled); sizes wider than 3:1 are drawn at 3:1 and keep a planned central band. `describeCanvas` gives the model where the size is seen, its shape recipe and the covered areas; `copyDensityOf` decides how many copy lines it carries; `imageForChannel` picks the image each platform publishes. `POST_SIZES` (fixed SVG templates) and `PLATFORM_FORMATS` (Create-page masters) remain for their own renderers.
