# API notes

What the code uses today (`server/post-image.ts`, verified 2026-10-26):

- `POST /v1/images/generations` with `model`, `prompt`, `size` (`1024x1024`, `1024x1536`, `1536x1024`), `quality: "medium"`, `output_format: "png"`, `n`.
- `POST /v1/images/edits` (multipart) with a single `image` when the user uploads a reference.
- Response `data[].b64_json`.

Known gaps:

- No reference images are sent on the generations path; reference IDs are written as text the model cannot use.
- Quality is fixed at `medium` for every stage.
- Generation sizes do not match export sizes (1080-based), so exports are resampled.

Before Phase 6 changes, check the current OpenAI image API documentation for `gpt-image-2`: supported sizes and aspect ratios, quality values, how many input images an edit accepts, mask support, input fidelity options and pricing. Record the checked date here. Do not rely on remembered parameter lists.

Keys stay server-side (`OPENAI_API_KEY` in `.env`). Never log them.
