# Social post designer

Open `/ai-studio/post-designer` or use **Design post** on a content item. Pick the content, platform, output size, and one of 15 SVG designs. Edit the headline, post message, date, and CTA. Export SVG for editing or PNG for publishing. Nothing is published automatically.

## Design sources

- `public/post-templates/*.svg`: 15 editable square examples. The designer renders each layout at the selected output size and replaces the example copy.
- `public/data/post-design-templates.csv`: the layout catalog.
- `public/data/post-design-input-template.csv`: a working sheet for the team to draft copy and choose a layout, platform, and size.
- `public/data/facebook-design-references.csv`: 95 unique public Page links from a browser-visible sample captured on 2026-10-26. It contains caption excerpts and automatically assigned content families. It does **not** contain Facebook images and is **not** a complete Page archive. Rows marked `needs_visual_review` need a designer to inspect the linked creative before matching it to a layout. The SVG designs are new Engosoft layouts, not exact conversions of individual Facebook creatives.

Rebuild the reference CSV after changing `data/facebook-posts-raw.json` with `python3 scripts/build-facebook-library.py`. Rebuild the 15 sample SVGs and input CSV with `npm run build:post-templates`.

## AI picture generation

Set `OPENAI_API_KEY` on the API server. `OPENAI_IMAGE_MODEL` defaults to `gpt-image-1`. The endpoint generates a picture without baked-in text; headings and CTA stay editable in the SVG. Local generation is rate limited to three requests per IP per ten minutes. On a public host it stays disabled until an authenticated public access path is provided. The image result remains in the open designer session; download the SVG or PNG before leaving the page.

## Odoo schedule

Set `ODOO_URL` (HTTPS), `ODOO_API_KEY`, and, when needed, `ODOO_DATABASE`. The server reads Odoo 19+ JSON-2 `calendar.event` and `event.event` via `search_read`, then exposes read-only dates to the Calendar and Post Designer. To include a custom course model, also set `ODOO_COURSE_MODEL` and its start/end fields. Use a dedicated API key with read access. The actual Odoo version, database, course model, and fields must be confirmed against the instance's `/doc` page. Without credentials the UI explicitly says that setup is needed; demo course dates remain labelled as demo.

For older Odoo installations, set `ODOO_API_MODE=jsonrpc`, `ODOO_DATABASE`, and `ODOO_USERNAME` to use the legacy read-only `search_read` call. Odoo 19+ JSON-2 remains the default.

## Current limits

The content workspace is still in memory and resets on reload. SVG/PNG downloads are the saved design outputs for now. The CSV drafting sheet is not imported by the app. The original Facebook archive beyond the sampled posts requires Page export or a suitable Meta API token.
