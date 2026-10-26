---
name: engosoft-imagegen
description: Compile Engosoft visual asset prompts and generate or edit images without baking in branding or copy.
---

# Image Generation

1. Start from `CreativeBrief`, selected `CreativeDirection`, target generation ratio and role-labelled references. Never forward the raw user request alone.
2. Specify subject, scene, focal point, lighting, visual style and reserved live-text zone. A style reference never supplies subject matter.
3. Generate a source image asset with `gpt-image-2`; add exact dimensions, live text, CTA and locked logo in the design document afterward.
4. Exclude words, fake diagrams, watermarks and logos. Do not fabricate named instructors or events.
5. Score candidates, repair only clear defects, cap automatic retries at two and preserve every candidate as a version branch.
