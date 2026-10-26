# Edit router

1. Classify the request into one or more operations with the target region or element.
2. Check facts for `COPY_EDIT`: a new date or price must come from a verified source or the user explicitly, and is flagged if it conflicts with Odoo.
3. Pick the cheapest operation that achieves it.
4. Execute, then rerun the affected validators:

| Changed | Rerun |
| --- | --- |
| Background or anything near the logo | Logo resolver + logo validator |
| Copy | Copy validator, fact validator |
| Platform | Platform validator + logo resolver |
| Any pixel edit | Visual critic (hard fails) |

5. Save a new version on the branch, with the operation, prompt version and validator results. If validation fails, keep the version as failed and show why.
