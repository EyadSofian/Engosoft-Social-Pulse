# GPT Image 2 prompting

`IMAGE_PROMPT_VERSION` identifies the compiler rules. Inputs are actual subject, selected direction, target generation ratio and 3–4 role-labelled references. The compiler writes: image asset purpose; subject and scene; direction-specific composition; negative-space zone for later text; relevant mood and lighting; reference roles; and invariants that forbid embedded words, logo, UI or invented business facts. The raw user request is never the only image prompt.

Content references may inform topic. Composition/mood references inform only visual grammar. An automotive style card must never introduce a car into a BIM request. If an uploaded photo is used in the edits endpoint, it must be treated as a visual/subject reference with the same invariants. Never request final Arabic text from the image model; text stays live and factual in the design document. The exact official logo is placed after generation.

The critic returns score, fatal flag, issues, strengths and a concrete revision. Candidates below 75 or with fatal defects are rejected. At most two repair batches are issued. Accepted candidates are ranked by score; selection is recorded separately from API order. A targeted image edit should preserve untouched scene elements; a text or crop edit should use the deterministic document layer instead of spending a new generation call.
