# Where elements go on each size

Gathered on 2026-11-03 from platform guides, for the layered story layout (`server/creative-intelligence/typography/typeset.ts`), the covered areas in `src/domain/output-presets.ts` and the placement rules the image prompt carries (`describeCanvas`). The guides disagree on exact pixels; where they do, the code takes the more conservative figure. Re-check against each platform's own preview before relying on a number for paid placements.

| Size | Covered by the platform | Where things go | In the code |
| --- | --- | --- | --- |
| Story / status 1080×1920 (Instagram, Facebook, WhatsApp, Snapchat) | Top 14% (profile row, progress bar), sides 6%; organic stories lose the bottom ~20% to the reply bar and stickers. Meta's ads guardrail keeps the bottom 35%. | Logo and headline inside the safe band, never in the top 14%. Subject in the middle. Button in the lower part of the central band, not on the reply bar. | `vertical` = top 270, bottom 390, sides 65 |
| Reel / TikTok / Shorts cover 1080×1920 | Top 14%, sides 6%, caption over the bottom ~35%, like / comment / share column over the right ~15% (TikTok 120–150 px). The profile grid shows the central 3:4. | Everything between 14% and 65% of the height, clear of the right column; the headline inside the central 3:4. | `verticalVideo` = top 270, bottom 672, left 65, right 160 |
| Feed portrait 4:5 (Instagram, Facebook, LinkedIn, X) | Instagram's profile grid shows only the central 3:4. | Headline, button and logo inside the central 3:4. | placement rule on `instagram-feed` |
| YouTube thumbnail 16:9 | The video length sits over the bottom-right ~15%. | Three to five very large words on one side, a big face or object on the other; essentials in the central 80%. | placement rule on both thumbnails |
| Facebook page cover | Phones show the central ~75% (640 of 851 px); the page photo overlaps the lower-left on desktop. | Headline and logo in the central 75%. | `facebookCover` sides 211 (of 1702) |
| X header 1500×500 | Phones keep about the central 1200×400; the profile photo covers the lower-left. | Headline centre-right. | `xHeader` sides 150 |
| LinkedIn company cover | The page logo covers about the left quarter; LinkedIn warns about the lower right. | One short line, centre-right. | `linkedinCover` left 390 (of 1512) |
| LinkedIn profile banner 1584×396 | The profile photo covers the lower-left on desktop and the centre on phones. | Text between x 420 and 1424, upper half. | `linkedinBanner` left 420, right 160 |

## The story layout (text on top)

Proportions measured from the story references the marketing team chose (8 story templates, 2026-11-03), kept in `STORY_PROPORTIONS`. The team chose the text-on-top arrangement; picture-top is kept as an option.

| Element | References | Layout |
| --- | --- | --- |
| Logo | 6–8% from the top, ~11% from the side, small | Full lockup at 6% from the top, 10% from the left, 23% of the width (the brand minimum is 22%) |
| Side margins | 10–11% of the width | 10% |
| Headline | starts at 13–20%; line pitch ~12.5% of the width; 3–4 short lines | Starts at 16% (or just under the logo); pitch 12.5% of the width, shrinking to 8.5% for long copy; the emphasis phrase whole on its own line, on the green bar |
| Body | right under the headline, small | Supporting line and facts, one per line, 3.8% of the width; text ends by 50% of the height |
| Picture | 35–45% of the height, lower half | The subject fills from under the body to ~91% |
| Button | badge over the photo's lower corner | Orange pill at the reading start, bottom edge at 86% |
| Website | ~93% | `www.engosoft.com` at 92.5% with a thin rule to the other margin |

The logo sits near the very top, where Instagram shows the progress bar and the account row; the team chose that placement knowing the account row may overlap it.

## Sources

- Meta 9:16 safe zones, unified for Stories and Reels in March 2026: [Billo](https://billo.app/blog/meta-ads-safe-zones/), [Biddy](https://www.biddyco.com/blog-posts/meta-ad-specs), [Lucid Media](https://www.lucidmedia.co.nz/blog/instagram-facebook-ad-safe-zones-2026/), [Blip](https://withblip.com/blog/how-to-use-meta-ad-safe-zones-without-cutting-off-your-creative/)
- Story dimensions and organic safe areas: [Inro](https://www.inro.social/blog/instagram-story-size), [Growthscribe](https://growthscribe.com/instagram-story-size/), [Socialync](https://www.socialync.io/tools/safe-zones/instagram-stories)
- TikTok: [Adaptlypost](https://adaptlypost.com/blog/social-media-safe-zones-2026-complete-guide), [Screensnap](https://www.screensnap.pro/blog/tiktok-video-size-guide)
- YouTube thumbnails: [Klap](https://klap.app/blog/thumbnail-size-for-youtube-videos), [Tubecore](https://tubecore.xpanddigital.io/blog/youtube-thumbnail-size-guide)
- Facebook cover: [Linearity](https://linearity.io/blog/facebook-size-guide/), [ContentStudio](https://contentstudio.io/blog/facebook-cover-photo-size)
- X header: [Neal Schaffer](https://nealschaffer.com/twitter-banner-size/), [Moda](https://moda.app/resources/sizes/twitter-banner)
- LinkedIn banners: [RightBlogger](https://rightblogger.com/blog/linkedin-banner-size), [ManyPixels](https://www.manypixels.co/blog/social-media-design/linkedin-banner-size)
