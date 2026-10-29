# Publication images and cover artwork

The placement picker in reference creation uses `src/domain/output-presets.ts`. It contains 34 presets across Facebook, Instagram, YouTube, LinkedIn, X, WhatsApp, TikTok, Snapchat and the website. It renders still images and covers; selecting a Reel, Shorts or video cover does not generate or upload a video. Publishing and analytics connectors are separate from content channels.

## Output canvases

| Placement | Pixels |
| --- | --- |
| Facebook / Instagram / LinkedIn / X portrait, LinkedIn document slide | 1080 × 1350 |
| Instagram grid portrait (3:4) | 1080 × 1440 |
| Square and carousel card | 1080 × 1080 |
| Stories, status, Reel / Shorts cover, TikTok photo | 1080 × 1920 |
| Facebook link / LinkedIn link / website banner | 1200 × 630 (LinkedIn 1200 × 627) |
| Facebook video cover, LinkedIn article cover | 1920 × 1080 |
| Facebook page cover (2× of 851 × 315) | 1702 × 630 |
| Facebook event cover | 1920 × 1005 |
| YouTube thumbnail | 3840 × 2160 or 1280 × 720 |
| YouTube channel banner | 2560 × 1440 |
| LinkedIn event cover, X landscape (16:9) | 1600 × 900 |
| X profile header (3:1) | 1500 × 500 |

Not offered: the LinkedIn company page cover (1512 × 256, about 6:1) and the personal profile banner (1584 × 396, 4:1). The image model generates at most 3:1, so these cannot be made without cropping.

These are production canvas choices, not claims that every platform requires one fixed pixel size. The model may generate at a nearby supported resolution; the server returns the selected pixel dimensions. Story copy uses a conservative inset of 250 px above, 390 px below and 60 px at the sides. Device overlays vary. The YouTube banner keeps essential text and the composited official logo in a central 1546 × 423 area.

Free creative creation uses a separate YouTube 16:9 master at 1280 × 720, so combining it with a website banner does not stretch the website's 1.91:1 artwork into a thumbnail. Adaptations can be downloaded separately.

## Making every size from one design

The post page has **Sizes for every platform**: each size of the post's platforms, with the ones it already has (saved sizes, the main design when its pixels match, and the story, link-banner and YouTube slots). Every missing size is **designed again at its own dimensions** by AI, one image per size: a new layout built for that shape, with the same idea, palette, style and exact words. A size is never the old design stretched, cropped, framed or set on a blurred copy of itself.

| Design made with | How a size is made |
| --- | --- |
| AI full creative (Create page) | `adaptFullCreative` rebuilds the logo-free master for the size; the critic, repairs and the official logo run again |
| AI template from a reference | `adaptReferenceDesign` rebuilds the design for the size with the template's exact copy, then places the logo |
| Fixed template, upload or studio edit | `recreateDesign` rebuilds the finished design for the size (template posts pass their exact words; uploads keep the words they show), then the logo resolver places the official logo |

Each size's layout instructions come from `canvasBrief`: vertical, portrait, square, landscape or wide banner, plus the size's safe area. Sizes are stored in `creative.sizes` (`POST /api/content/:id/sizes`); an empty story, link-banner or YouTube slot is filled from the matching size, and a new design version clears the old sizes. Sizes can be added while the design is editable, before approval.

## Primary references checked 2026-10-27 (sizes added 2026-10-29)

- [YouTube: Add video thumbnails](https://support.google.com/youtube/answer/72431?hl=en) — thumbnail dimensions and Shorts behavior.
- [YouTube: Manage channel branding](https://support.google.com/youtube/answer/10456525?hl=en) — banner dimensions, safe area and file limit.
- [LinkedIn: Image specifications for Pages](https://www.linkedin.com/help/linkedin/answer/a563309/image-specifications-for-your-linkedin-pages-and-career-pages) — page cover 1512 × 256, link image 1200 × 627.
- [Facebook: Page cover photo](https://www.facebook.com/help/125379114252045) — 851 × 315, mobile shows 2.4:1.
- [OpenAI: Image generation](https://developers.openai.com/api/docs/guides/image-generation) — edges divisible by 16, at most 3:1.
- X, Instagram 3:4 and TikTok photo sizes come from consistent third-party guides; their own help pages were not reachable.
- [Meta Ads Guide](https://www.facebook.com/business/ads-guide) — access required sign-in during this review; Meta presets above are explicit canvas choices, not newly verified platform requirements.

No live image-provider or platform-publishing calls are needed by the regression suite. The renderer tests inject a provider, verify it receives the original reference, and inspect the actual saved PNG dimensions.
