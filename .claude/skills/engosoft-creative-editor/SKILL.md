---
name: engosoft-creative-editor
description: Route conversational edits on an Engosoft creative to the cheapest correct operation (copy, text style, layout, image edit, image replace, background, logo re-evaluation, regenerate, platform adapt, asset insert), rerun the affected validators and keep version branches. Use for edit requests like "كبر عنوان CFM", "هات صورة أقوى", "حط اللوجو في مكان أحسن", the edit router, or creative version history.
---

# Engosoft creative editor

Edits change as little as possible and never destroy an accepted version.

| Operation | Example | Spends a generation? |
| --- | --- | --- |
| `COPY_EDIT` | "غير التاريخ" (fact edit → verify first) | No, unless the text is in pixels |
| `TEXT_STYLE_EDIT` | "كبر عنوان CFM" | No if live text; localized edit if in pixels |
| `LAYOUT_EDIT` | "حرك العنوان لفوق" | Usually an edit |
| `IMAGE_EDIT` | "خلي المحاضر أوضح" | Localized edit |
| `IMAGE_REPLACE` | "هات صورة محاضر أقوى" | Edit or new candidate for the subject |
| `BACKGROUND_EDIT` | "غير الخلفية" | Edit |
| `LOGO_REEVALUATE` | "حط اللوجو في مكان أحسن" | No — resolver only |
| `CREATIVE_REGENERATE` | "خلي التصميم كله مختلف" | Yes |
| `PLATFORM_ADAPT` | "اعملها واتساب" | Per adapter strategy |
| `ASSET_INSERT` | "حط صورة الشهادة" | Edit with the supplied asset |

A request can map to several operations ("هات صورة أقوى وخلي المحاضر أوضح" → `IMAGE_EDIT`); preserve everything else.

Details: [EDIT_ROUTER.md](EDIT_ROUTER.md) · [VERSIONING.md](VERSIONING.md)
