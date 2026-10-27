# Publication images and cover artwork

The placement picker in reference creation uses `src/domain/output-presets.ts`. It contains 23 presets across Facebook, Instagram, YouTube, LinkedIn, WhatsApp, TikTok, Snapchat and the website. It renders still images and covers; selecting a Reel, Shorts or video cover does not generate or upload a video. Publishing and analytics connectors are separate from content channels.

## Output canvases

| Placement | Pixels |
| --- | --- |
| Facebook / Instagram portrait | 1080 × 1350 |
| Square and carousel card | 1080 × 1080 |
| Stories, status, Reel / Shorts cover | 1080 × 1920 |
| Facebook link / website banner | 1200 × 630 |
| Facebook video cover | 1920 × 1080 |
| YouTube thumbnail | 3840 × 2160 or 1280 × 720 |
| YouTube channel banner | 2560 × 1440 |
| LinkedIn landscape | 1200 × 627 |

These are production canvas choices, not claims that every platform requires one fixed pixel size. The model may generate at a nearby supported resolution; the server returns the selected pixel dimensions. Story copy uses a conservative inset of 250 px above, 390 px below and 60 px at the sides. Device overlays vary. The YouTube banner keeps essential text and the composited official logo in a central 1546 × 423 area.

Free creative creation uses a separate YouTube 16:9 master at 1280 × 720, so combining it with a website banner does not stretch the website's 1.91:1 artwork into a thumbnail. Adaptations can be downloaded separately.

## Primary references checked 2026-10-27

- [YouTube: Add video thumbnails](https://support.google.com/youtube/answer/72431?hl=en) — thumbnail dimensions and Shorts behavior.
- [YouTube: Manage channel branding](https://support.google.com/youtube/answer/10456525?hl=en) — banner dimensions, safe area and file limit.
- [Meta Ads Guide](https://www.facebook.com/business/ads-guide) — access required sign-in during this review; Meta presets above are explicit canvas choices, not newly verified platform requirements.

No live image-provider or platform-publishing calls are needed by the regression suite. The renderer tests inject a provider, verify it receives the original reference, and inspect the actual saved PNG dimensions.
