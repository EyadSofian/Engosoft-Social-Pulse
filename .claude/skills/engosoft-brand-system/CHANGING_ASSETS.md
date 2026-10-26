# Changing brand assets

The logo files are pinned by SHA-256 in `brand/logos.json`, and tests fail on any byte change. That is intentional.

## Replacing the logos with master files

1. Put the master SVG exports in `brand/logos/` with the existing file names.
2. Confirm each one visually against the guidelines (fills, dot color, tagline text).
3. Update `sha256`, `width`, `height`, `aspectRatio` and `fills` in `brand/logos.json`, and set `source` to the master file provenance.
4. Copy the files to `public/brand/logos/` (the test checks the copies are byte-identical).
5. Run the brand tests and the logo-resolver examples.

## Re-extracting from the guidelines PDF

```bash
PYTHONPATH=<pymupdf dir> python3 scripts/brand/extract-logos-from-guidelines.py "<guidelines.pdf>" brand/logos
```

The script prints the hashes and writes `brand/logos/extraction-report.json`. Drawing indices are specific to the current PDF; a new PDF revision needs them re-checked.

## Adding a rule

Add it to `brand/usage-rules.json` under `official` only when the guidelines state or show it, with the evidence. Everything else goes under `provisional`.
