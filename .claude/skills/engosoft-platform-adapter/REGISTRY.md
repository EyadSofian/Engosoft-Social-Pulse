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

Today's code defines sizes twice (`POST_SIZES` in `src/features/post-design/templates.ts`, `PLATFORM_FORMATS` in `src/features/creative-studio/platforms.ts`) and maps Facebook to square. Both are replaced by the registry.
