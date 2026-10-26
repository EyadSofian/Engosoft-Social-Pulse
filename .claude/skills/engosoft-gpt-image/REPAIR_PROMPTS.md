# Repair prompts

Template:

```
Keep the complete existing composition.
Change only:
- <exact problem 1, with location>
- <exact problem 2>
Preserve:
- <subject identity, pose, lighting, palette, headline area, style…>
Do not add any logo, text, watermark or symbol.
```

| Critic finding | Change only |
| --- | --- |
| No valid logo zone | Create calm negative space in the <corner>, about <w>% × <h>% of the canvas, continuing the background |
| Fake text in background | Remove the illegible lettering on the <object/area>; replace with plain continuation of that surface |
| Misspelled Arabic headline | Replace the headline in the <zone> with exactly: «<canonical text>», same style and size |
| Broken hand | Correct the <left/right> hand of the <person> to a natural relaxed pose with five fingers |
| Subject cut off | Extend the canvas <direction> so the <subject> is fully visible; keep everything else |
| Reference contamination | Remove the <object> that came from a style reference; it does not belong to <subject> |

Never "make it better". If the finding cannot be phrased as a concrete change, the critic output is not good enough to act on.
