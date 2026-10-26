# Examples

## Brand-blue corner

Top-left is flat `#0046FF`, no text nearby → `brand-blue`, contrast of white about 6.3:1, complexity low.
`lockup-reversed` fits at 260px wide → choose it. `symbol-reversed` also passes; prefer the lockup when there is room and no other brand name on the canvas.

## Bright office photograph

Top-right is a pale wall (`light`), quiet. `lockup-positive` passes contrast with blue on light. `lockup-reversed` fails (`forbidden_background`).

## Instructor fills the frame

Every corner either overlaps the instructor's head, the headline or a busy machine background. No variant passes. Do not shrink the logo or add a plate. Set `requiresCreativeRepair: true` and request an edit:

```
Keep the complete existing composition.
Change only: create clean, calm negative space in the upper-left corner, about 24% of the canvas width and 14% of its height, continuing the existing background naturally.
Preserve: the instructor, facial identity and pose, lighting, color palette, headline area and overall style.
Do not add any logo, text, watermark or symbol.
```

Resolve again on the edited image. After two failed repairs, show another candidate instead of looping.

## Platform variants

The Instagram master has a dark top-left (`dark-photographic`); the WhatsApp story crop puts a bright sky behind the same corner. Resolve each separately: the Instagram version may use a reversed variant under the engineering-default policy, the WhatsApp one `lockup-positive`.
