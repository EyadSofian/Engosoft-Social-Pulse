# Creative AI architecture

## Current vertical slice

`CreationHomePage` accepts a request, optional files and platforms. Odoo event records are fetched server-side, matched by name and explicitly selected before factual details enter the brief. `server/creative-brief.ts` uses a structured Responses API output for copy and four distinct directions. `visual-references.ts` ranks individual cropped posts and records the role of each selected reference. The selected direction enters the editor. `server/image-prompt-compiler.ts` compiles an asset-only GPT Image 2 prompt; `server/post-image.ts` generates candidates; `server/image-quality.ts` scores each from 0–100 and supplies a repair instruction. Up to two repair batches are allowed. Approved candidates are ranked by score. The chosen asset is composed under live text and the exact locked logo in `creative-renderer.ts`. Platform variants and IndexedDB versions are available in the editor.

## Boundaries

| Module | Responsibility |
| --- | --- |
| Odoo bridge / context resolver | Read-only event facts, source and conflicts |
| Reference library | Provenance, panel crops, visual metadata, retrieval roles |
| Creative director | Brief, copy, concept diversity |
| Prompt compiler | Convert brief + direction + roles into an image asset brief |
| Image service | GPT Image 2 request, bounded retry and score ranking |
| Design document / renderer | Live semantic text, asset layer, logo lock, variants and export |
| Brand guardian | Approved mark, palette, typography, factual/visual checks |

No API key is sent to the browser. Local generation endpoints remain disabled on public hosts until authentication is implemented. Logs must store request IDs, prompt versions, reference IDs, model settings, scores and latency, never keys or raw credentials.

## Quality gates

An asset is rejected on fatal defects or score below 75. A composed export still needs an independent brand/layout check and human publishability review. A passing asset score is not a publish-ready poster. Failed attempts stay visible as candidates/history, never enter the approved reference library.

## Remaining gaps

The current Odoo bridge reads event records, not all course/instructor/price models. The reference panel metadata is an initial annotation and awaits per-card visual review. The Fabric editor is a proof of concept, not yet a complete layer editor. Image critic scores still need calibration against human review. Production authorization and durable shared storage are required before team use.
