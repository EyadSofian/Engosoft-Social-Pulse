# Publication images and cover artwork

Every size lives in one registry, `src/domain/output-presets.ts`: 40 presets across Facebook, Instagram, YouTube, LinkedIn, X, WhatsApp, TikTok, Snapchat and the website. The Create page, the AI pipeline, the post page's sizes panel, reference templates and publishing all read it. It renders still images and covers; picking a Reel, Shorts or video cover does not generate or upload a video.

## How a size is drawn (image API rules)

The image model (`gpt-image-2.5-*`, OpenAI image generation guide, checked 2026-11-03) takes `size` as `WIDTHxHEIGHT` with: both edges multiples of 16, neither above 3840, the long edge at most 3× the short one, 655,360–8,294,400 pixels; above 2560×1440 is experimental. `generationSizeFor(width, height)` picks the drawn canvas for every size from those rules — nothing is typed by hand:

- the same shape as the output (within 0.5%), and at least the output in both directions, so nothing is ever upscaled;
- at least about a megapixel, because the model's lettering and detail go soft below that (so a 900 × 600 photo is drawn at 1248 × 832 and scaled down);
- the few extra pixels are trimmed evenly (`fit: cover`). Nothing is stretched (`fit: fill` was removed from reference designs).

Sizes wider than 3:1 (the LinkedIn page cover and the profile banner) are **band sizes**: the model draws a 3:1 canvas, the prompt tells it which central band is kept, and only that band is delivered. Repairs, masks and the logo corner are mapped into the band (`drawnBox`, `logoRepairZone`), never into the trimmed margin. The 4K YouTube thumbnail is the only size in the experimental range.

## Output canvases

| Placement | Pixels | Drawn at |
| --- | --- | --- |
| Facebook / Instagram / LinkedIn / X portrait, LinkedIn document slide | 1080 × 1350 | 1088 × 1360 |
| Instagram grid portrait (3:4) | 1080 × 1440 | 1088 × 1456 |
| Square, carousel card, LinkedIn multi-photo | 1080 × 1080 | 1088 × 1088 |
| Stories, status, Reel / Shorts cover, TikTok photo | 1080 × 1920 | 1088 × 1936 |
| Facebook link / website banner | 1200 × 630 | 1408 × 736 |
| LinkedIn landscape post and link image (1.91:1) | 1200 × 627 | 1408 × 736 |
| Facebook video cover, LinkedIn article / newsletter cover | 1920 × 1080 | 1936 × 1088 |
| LinkedIn event cover (16:9), X landscape | 1600 × 900 | 1616 × 912 |
| Facebook page cover (2× of 851 × 315) | 1702 × 630 | 1728 × 640 |
| Facebook event cover | 1920 × 1005 | 1920 × 1008 |
| YouTube thumbnail | 3840 × 2160 or 1280 × 720 | same / 1360 × 768 |
| YouTube channel banner | 2560 × 1440 | same |
| X profile header (3:1) | 1500 × 500 | 1776 × 592 |
| LinkedIn company page cover (≈5.9:1, band) | 1512 × 256 | 1776 × 592, band 25–75% |
| LinkedIn personal profile banner (4:1, band) | 1584 × 396 | 1776 × 592, band 12.5–87.5% |
| LinkedIn Life tab main image (3:1) | 1128 × 376 | 1776 × 592 |
| LinkedIn Life tab company photo (3:2) | 900 × 600 | 1248 × 832 |
| LinkedIn Life tab custom module | 502 × 282 | 1344 × 752 |

Each size also says where it is seen (a LinkedIn feed of professionals, a phone story under the interface, a page cover behind the logo…) and which areas the platform covers, in percentages of the drawn canvas (`describeCanvas`). Story copy keeps 250 px above, 390 px below and 60 px at the sides clear. The LinkedIn page cover keeps the lower left (page logo) and lower right clear; the profile banner keeps the lower left (round profile photo) clear. The YouTube banner keeps essential text and the logo in the central 1546 × 423 area.

**Copy per size** (`copyDensityOf`): feed and story sizes carry all approved lines; landscape and link-sized images drop the supporting line; thumbnails carry the headline and one fact; long-lived brand placements (page covers, banners, headers, Life tab images) carry only the headline and supporting line, no dates and no button. Dropped lines stay in the caption, and the copy check expects only what the size carries.

## Choosing sizes and publishing them

On the Create page each chosen platform lists all its sizes. Its feed size is ticked by default (the old behaviour); the sizes of the main design's pixels are marked as included. Ticked sizes with the same pixels share one design (a 1080 × 1080 for Facebook, Instagram and LinkedIn is designed once, for the strictest safe area among them). After the two directions are ready, each card offers the other sizes, one by one or all at once, and saving the post stores them in `creative.sizes` under every preset they serve.

When the post is published, each platform gets the image made for it (`imageForChannel`): a size designed for that platform first (a LinkedIn landscape, an Instagram 3:4), then the 9:16 for TikTok, Snapchat and WhatsApp, the banner for the website, and finally the main design. Before, every platform got the main 4:5 design. Every finished size counts as approved media for the advanced publish panel and the server check (`creativeImageUrls`).

## Making every size from one design

The post page has **Sizes for every platform**: each size of the post's platforms, with the ones it already has (saved sizes, the main design when its pixels match, and the story, link-banner and YouTube slots). Every missing size is **designed again at its own dimensions** by AI, one image per size: a new layout built for that shape, with the same idea, palette, style and exact words. A size is never the old design stretched, cropped, framed or set on a blurred copy of itself.

| Design made with | How a size is made |
| --- | --- |
| AI full creative (Create page) | `adaptFullCreative` rebuilds the logo-free master for the size; the critic, repairs and the official logo run again |
| AI template from a reference | `adaptReferenceDesign` rebuilds the design for the size with the template's exact copy, then places the logo |
| Fixed template, upload or studio edit | `recreateDesign` rebuilds the finished design for the size (template posts pass their exact words; uploads keep the words they show), then the logo resolver places the official logo |

Each size's layout instructions come from `canvasBrief`: vertical, portrait, square, landscape or wide banner, plus the size's safe area. Sizes are stored in `creative.sizes` (`POST /api/content/:id/sizes`); an empty story, link-banner or YouTube slot is filled from the matching size, and a new design version clears the old sizes. Sizes can be added while the design is editable, before approval.

## Primary references checked 2026-10-27 (sizes added 2026-10-29, LinkedIn and image API rechecked 2026-11-03)

- [LinkedIn: Share photos or images in a post](https://www.linkedin.com/help/linkedin/answer/100983) — photos from 3:1 to 4:5, recommended 1080 px wide, up to 20 per post, multi-photo posts render at most 4:5, 5 MB.
- LinkedIn event cover: third-party guides disagree (1776 × 444 vs 1600 × 900); one cites LinkedIn's event help as requiring 16:9, which is what the preset uses.
- LinkedIn personal profile banner 1584 × 396 and article cover 1920 × 1080 come from consistent third-party guides.
- [YouTube: Add video thumbnails](https://support.google.com/youtube/answer/72431?hl=en) — thumbnail dimensions and Shorts behavior.
- [YouTube: Manage channel branding](https://support.google.com/youtube/answer/10456525?hl=en) — banner dimensions, safe area and file limit.
- [LinkedIn: Image specifications for Pages](https://www.linkedin.com/help/linkedin/answer/a563309/image-specifications-for-your-linkedin-pages-and-career-pages) — logo 400 × 400, page cover 1512 × 256 (trimmed on some screens; keep the lower right clear), Life tab main image 1128 × 376, custom modules 502 × 282, company photos 900 × 600, link image 1200 × 627.
- [Facebook: Page cover photo](https://www.facebook.com/help/125379114252045) — 851 × 315, mobile shows 2.4:1.
- [OpenAI: Image generation](https://developers.openai.com/api/docs/guides/image-generation) — edges multiples of 16, at most 3840, ratio within 1:3–3:1, 655,360–8,294,400 pixels, above 2560 × 1440 experimental.
- X, Instagram 3:4 and TikTok photo sizes come from consistent third-party guides; their own help pages were not reachable.
- [Meta Ads Guide](https://www.facebook.com/business/ads-guide) — access required sign-in during this review; Meta presets above are explicit canvas choices, not newly verified platform requirements.

No live image-provider or platform-publishing calls are needed by the regression suite. The renderer tests inject a provider, verify it receives the original reference, and inspect the actual saved PNG dimensions.
