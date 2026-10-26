# Versioning

```
Direction A
├─ Original
├─ Edit 1 — stronger image
├─ Edit 2 — shorter headline
└─ WhatsApp variant
```

Each version stores: parent id, operation, user command, prompt versions, model and settings, references, validator results, author, timestamp, status (`draft`, `accepted`, `approved`, `rejected`).

- Never overwrite an accepted or approved version; branch instead.
- Restore creates a new head pointing at the old content.
- Explicit marketing approval sets `approvedCreative = true` and makes it eligible for Creative Memory. Rejected versions are never positive references.
- History lives server-side (SQLite), not only in browser IndexedDB as `src/features/creative-studio/documents.ts` does today.
