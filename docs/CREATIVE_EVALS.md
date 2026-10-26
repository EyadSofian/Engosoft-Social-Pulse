# Creative evaluations

The benchmark is `tests/fixtures/creative-scenarios.json` with 20 initial requests. Capture for each run: prompt, verified context, reference IDs/roles, compiled prompt version, candidates, critic scores, human score, selected result, latency and estimated API cost. Never include API keys.

Human reviewers rate 1–5 for professional appearance, Engosoft identity, hierarchy, image quality, Arabic, creativity, reference use, marketing usability and whether they would publish without major redesign. The decisive question is whether a marketing designer would publish it. A model score is only triage, not proof.

Run three vertical-slice scenarios first: CFM webinar, course launch and educational engineering post. Inspect full-resolution exports for crop, anatomy, overlap, RTL, contrast, factual accuracy and logo. Compare against the previous prompt version before changing thresholds. Keep rejected examples for regression tests but never mark them as approved references.
