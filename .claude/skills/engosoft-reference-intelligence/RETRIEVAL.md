# Retrieval

Score candidates on: content similarity, objective similarity, campaign similarity, subject similarity, style fit for the chosen direction, platform fit, human approval, quality, historical performance (noncausal, only when present).

Then assign roles by **purpose**, not by rank position:

| Role | Pick a reference that is strong at |
| --- | --- |
| `COMPOSITION` | Layout structure the direction wants |
| `MOOD` | Emotional tone |
| `COLOR` | Palette strategy |
| `PHOTOGRAPHY` | Lens, lighting, realism level |
| `SUBJECT` | How a person/object is treated |
| `LIGHTING` | Light direction and contrast |
| `TYPOGRAPHY` | Type hierarchy (informs live text, not generated text) |
| `CAMPAIGN_LANGUAGE` | Recurring campaign motifs |
| `CONTENT_STRUCTURE` | Information order (date bar, credential stack) |

Diversify across source sheets. Cap at 6 and stay within the image model's input limits. Record `referenceIds` and roles on the generation.
