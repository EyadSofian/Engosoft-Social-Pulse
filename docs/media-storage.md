# Media storage and retention

Production audit on 2026-10-29: approximately 130 MB of real files in `/data` (designs, editable sources, uploads and local application data), with over 48 GB available on the 50 GB web volume. Railway's displayed volume usage includes filesystem overhead. Social synchronization stores metadata, metrics and remote thumbnail/video links; it does not download Facebook, Instagram, TikTok or YouTube videos.

## Capacity and uploads

- `MEDIA_MAX_GB` defaults to **5 GiB of application files**, including quarantine. `MEDIA_RESERVE_GB` defaults to **1 GiB of disk headroom**. These are application guardrails, not changes to Railway capacity or its bill.
- New publishing uploads reserve capacity before writing. A full budget/disk returns HTTP 507 with an actionable message. Existing reads, analytics and publication records remain available. Design requests preflight capacity; asynchronous creative jobs retain a 128 MiB estimated reservation until completion. This estimate is not an exact per-design byte quota.
- MP4 ingestion streams directly to `social/.incoming/<uuid>.part`, capped at 200 MiB. Header inspection seeks over video payloads rather than buffering the entire MP4. One video ingestion runs per process; another returns HTTP 429 and can be retried. Aborted, invalid and failed uploads remove their temporary files.
- The content approval state is checked again under a database transaction before the final move/insert. Files from a failed insert are removed.
- Prepared JPEGs from the same approved design are hashed and reused within that content, across accounts/retries. Original design files and editable sources remain intact.
- Video ingestion no longer needs a 200 MiB request buffer. Some downstream provider transfer paths still buffer a video; this change does not claim that all publishing/AI work has constant memory usage.
- Reservations are local to the running process. The current service uses one instance and a mounted volume; before using multiple writers/replicas, use shared reservations and object storage.

## Retention

**Disabled by default.** The administrator can review and enable it under Usage → File storage. Enabling requires an explicit confirmation of permanent deletion. Defaults: 30 days after confirmed completion, then 7 days in the recovery bin. The hourly worker does not delete platform posts, plans, metrics, OAuth credentials or the database.

An attached publishing file is eligible only when:

1. Its content has status `published` and every selected channel has a verified `published` job with a remote ID.
2. There are no non-published jobs, including failed/unknown/awaiting-user attempts, and no queued/sending/failed queue rows for that content.
3. The file is not pinned, and the configured period has elapsed since the latest content/file/publication change.

Draft, approved, scheduled, archived and cancelled content is protected. Manual publication labels without API proof are insufficient. All files attached to protected content are kept; no attempt is made to guess which old upload a reviewer might need. Generated masters, raw images, Studio layers, content versions and reusable library assets do not expire under this policy.

Eligible files first move atomically to `social/.trash`; their records remain as tombstones, and the UI explains expired local attachments. Restore moves the file back and pins it against future expiry. After the recovery period, eligibility is checked again under row locks before final unlink. Files needed by changed content are restored and pinned. Quarantine still occupies disk until purge. Files already beyond the recovery period cannot be restored by this application.

Incomplete UUID `.part` files older than 24 hours are cleaned regardless of the retention setting; only this app-owned temporary directory is scanned for that cleanup. Library/source files are never treated as generic old-file garbage.

## Operations

- `GET /api/storage`: inventory, disk headroom, budget, saved policy, candidate preview and recovery bin. Admin-only; no filesystem paths or credentials are returned.
- `POST /api/storage/policy`: save `enabled`, `publishedDays` (7–365), `trashDays` (7–90); `confirmPermanentDeletion: true` is required when enabled.
- `POST /api/storage/assets/:id/keep`: pin or restore-and-pin a file.
- `POST /api/storage/assets/:id/restore`: restore-and-pin during the recovery period.
- `POST /api/storage/maintenance`: run maintenance using the saved policy. Startup also runs it after 10 seconds and hourly thereafter.

Preview is bounded to 2,000 published assets and exposes at most 100 candidates per response/run. Keep the dataset below that bound or implement paged maintenance before significantly increasing the storage budget. Do not put an indiscriminate age-based lifecycle rule on live drafts/scheduled media.

## If long-term volume grows

Use private S3-compatible object storage for large originals and signed delivery, while Railway runs the application/database. Upload directly from the browser to object storage to avoid application buffering and an additional service egress hop; validate completed uploads before attaching them to approved content. Any migration must verify the uploaded object before removing its local source, preserve pending/resumable jobs, and cover image editing paths that still require local sources.

At the documentation checked on 2026-10-29, [Railway Buckets](https://docs.railway.com/storage-buckets/billing) cost $0.015/GB-month with free bucket operations and bucket egress; [volume storage](https://docs.railway.com/pricing) is $0.15/GB-month. Service-to-bucket transfers still incur service egress. [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) includes 10 GB-month storage with operation allowances; excess use is billed. No bucket, paid plan or new third-party account was created as part of the capacity/retention changes.
