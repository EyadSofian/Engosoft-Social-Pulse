# Google Sheets / Drive publishing

Calendar → **Publish from Google Sheets & Drive** connects a Google grant owned by the signed-in publishing manager. The assistant's connected Drive account is independent and is never copied into this app.

## Connect

1. In the Google Cloud project owning the OAuth client, enable Google Drive API and Google Sheets API.
2. Add this exact authorized redirect URI to the web OAuth client:
   `https://web-production-d07de.up.railway.app/api/oauth/drive/callback`.
3. Server configuration: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, optional `GOOGLE_DRIVE_REDIRECT_URI`. When unset, client ID/secret reuse `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` with an independent encrypted grant, callback and scopes. The YouTube grant and publishing permissions are unchanged. `TOKEN_ENCRYPTION_KEY` is required.
4. Connect Google from Calendar. The Google account must be allowed by the OAuth app's audience/testing settings and have access to the sheet and Drive assets.
5. Read the sheet tabs; choose only the publishing tab. Select the exact account for each platform. Save with automatic posting off to review drafts. Enable automatic posting when the inputs/account choices are ready; only future rows with `Ready=YES` queue.

Google consent is Drive read-only plus Sheets read/write, so it can read private media and return publication results without making the assets public. OAuth state is cookie-bound, expiring and single-use; refresh tokens are encrypted in the existing server credential store. A revoked/inaccessible source stops its own automatic publications.

## Format and behavior

The downloadable template is `public/templates/google-publishing-calendar.xlsx`. It contains Calendar, Example, Guide and Platforms. Rebuild it with `python3 scripts/build-google-calendar-template.py` (openpyxl). `docs/google-calendar-format.json` contains the Arabic field guide.

### Automatic IDs and optional fields

The publishing sheet has the bound simple `onEdit` trigger in `scripts/google-sheet-post-ids.gs`. It writes a literal `ENG-<UUID>` when a new row receives content, without changing an existing ID or requiring external access. It supports pasting multiple rows and uses a document lock. The app also seeds missing IDs during its regular sync, including API writes and uploaded CSV/XLSX snapshots which do not fire a Sheets edit trigger. It persists and re-reads IDs before creating content; failed write-back stops import. Row formulas such as `ROW()` are never used as publishing IDs.

`Notes` is entirely optional, including omitting its header. `Thumbnail` is optional for Reel/video rows and must be empty for images/carousels. It accepts a Drive image or an unambiguous image folder, downloads and normalizes the cover separately, and attaches it with the thumbnail role. Only the video enters the publication's media list. The saved `reelCover` flows through existing provider cover upload/verification. Unsupported custom TikTok covers are blocked during preflight; Snapchat keeps covers for preview only. Blank Thumbnail keeps the platform's default cover. Changing/removing a cover before submission replaces the approved media snapshot as part of the normal sheet edit flow.

`Ready=YES` is the user control for scheduling; `Ready=NO` cancels waiting publications on the next sync. `Status` remains an app-owned result, not a publish command.

- Header row 1, one post per row, stable unique `Post ID`. Header matching trims whitespace and ignores case; column order is flexible. Date is ISO `YYYY-MM-DD` or a native date; Time is `HH:mm` or a native time. Sheets is read as raw serials to avoid the source's `m-d-yyyy` ambiguity. Invalid and ambiguous DST times are rejected.
- `Platform` accepts comma, Arabic comma, slash, and the source's `FB - IG - Linkedin - X` syntax. One row shares copy, media and time across its chosen platforms. Different media/time needs another ID and row.
- `Design` is one Drive file/folder URL. Only direct folder children are scanned. One image/video must be unambiguous; a photo carousel has 2–20 images with unique numeric filename prefixes. Shortcuts, arbitrary URLs and implicit recursive searches are not followed. Download limit: 40 MiB/image, 200 MiB/MP4. Images retain their source resolution (up to 36 megapixels and 8 MiB per prepared JPEG). Safe JPEGs are stored byte-for-byte. Other sources are encoded directly from the original at quality 98 with 4:4:4 color; only exceeding the size budget reduces quality/resolution. Instagram gets a separate copy up to 1440 pixels wide, padded only when its aspect ratio requires it. This copy never replaces the higher-resolution Facebook/LinkedIn master or creates another carousel slide. Prepared JPEGs are not encoded again on attachment, and small images are not enlarged. Covers fit inside 1440×2560. Selected media is pinned to that imported snapshot; edits to the remote file alone do not change an already queued attachment. Previously submitted jobs keep their existing evidence and attachments; this improvement never republishes an existing post.
- Facebook, Instagram and LinkedIn use their existing providers. TikTok requires explicit privacy, AI-generated and commercial choices; comments/duets/stitches are disabled by this import path. Native/hybrid provider restrictions still apply, and services requiring per-post defaults consent use the post-page flow instead. YouTube requires video, privacy, category and audience. Snapchat requires a target. Permission, format and provider validation still apply; being listed does not imply a connected/approved account.
- X, WhatsApp and website remain manual in this app. They are imported as channels and explain why they wait; they never receive fake automatic success. Other supported platforms on the same row may proceed, with independent results.
- Background checks run every minute with a persistent source lease and revision checks. The ordinary publishing worker is independent: a large Drive import cannot delay other scheduled posts. A Google queue entry only sends after a successful, unlocked source check within two minutes. Source/API failures suspend that source's queue, preserving it for review.
- Changes, deleted rows, duplicate IDs, invalid rows and `Ready=NO` cancel waiting queue entries at the next successful check. Pause/disconnect in the app blocks the source immediately and cancels its waiting entries; it cannot recall a request already sent to a platform. After a remote attempt has started, changing its input is blocked and the original evidence is preserved. Unknown outcomes never auto-retry. Explicit retries apply only to failed attempts and never replay published accounts.
- `Status`, `Published URLs`, `Last Error` are outputs. Each account has its own persistent queue/job. `published` requires verified evidence for all requested channels; `partial` means some succeeded. A submitted/processing upload is not publication evidence. Results are resolved by stable ID after downloads, and concurrent input edits fail the source check before publication. Inputs use ordinary text; no sheet cell or note is executed as an AI instruction.
- At most 1,999 post rows / tab and 52 scanned columns. Setup and invalid-row errors are visible in the panel; valid independent rows can still proceed.

## XLSX / CSV upload

The panel's **Upload a publishing calendar** uses the same parser/media/queue flow with selected accounts and the automatic-posting checkbox. It reads Calendar (or the first sheet) and persists one uploaded snapshot per manager; re-upload uses stable IDs and does not duplicate successful posts. Results are in the app because a local file cannot receive live Sheets updates. The older **Upload a plan** action continues to import planning rows only.

## Validation

`tests/google-calendar.test.ts` covers serial/date parsing, normalized real publishing media, draft/ready/cancel paths, unsupported platforms, idempotence, moved/deleted/invalid/duplicate rows, past times, source leases, concurrent edits, per-account verified publication, encrypted refresh, and OAuth/CSRF/role enforcement. Provider tests cover the existing submission/polling rules. Tests use isolated databases and mocked publication endpoints; production authorization and an explicitly selected live test are separate checks.

Official references: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive download](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [Drive resource keys](https://developers.google.com/workspace/drive/api/guides/resource-keys), [Sheets values.get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get).
