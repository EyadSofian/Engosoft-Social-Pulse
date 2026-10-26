# Ingestion

Sources: single posts, screenshots, Facebook/Instagram exports, montages/contact sheets, approved generated creatives, user-uploaded inspiration (flag as external, never brand-approved by default).

## Montage splitting

1. Convert to grayscale; compute row and column projections of "background-like" pixels (the gutter color, usually white or page gray).
2. Gutters are long runs of background rows/columns. Cards are the spans between them.
3. Drop spans that touch the image edge and are shorter than 80% of the median card height — they are cut-off cards from a scrolled screenshot (the Majd sheet's first row).
4. Ignore UI chrome (floating buttons, scrollbars) by trimming spans narrower than 50% of the median card width.
5. Save each card with `sheet`, `bbox` in the source, and a crop hash. Show a review grid before indexing.

The current `scripts/ingest-reference-montages.ts` uses an equal grid with fixed insets; replace it rather than tuning offsets.

## Provenance record

`source`, `capturedAt`, `platform`, `parentSheet`, `bbox`, `sha256`, `uploadedBy`, `approved`, `approvedBy`, `approvedAt`, `rejectedReason`.
