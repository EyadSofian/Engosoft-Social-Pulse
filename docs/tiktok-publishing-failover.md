# TikTok publishing through Buffer and Zernio

Connections → TikTok publishing backup attaches publishing services to an existing, verified TikTok account. Its direct OAuth credential and analytics stay unchanged. This enables **public video publishing only** through the connected service; it does not mark the Engosoft developer app audited or enable direct API access to other formats.

## Setup

1. Connect the intended TikTok account on each service's free plan and create a dedicated API key.
2. Select the existing TikTok account in Connections and enter each service key. The server reads the service's authenticated accounts and verifies posting authorization before saving an AES-256-GCM encrypted credential.
3. TikTok open IDs are scoped to each app. Match canonical creator usernames, rather than comparing open IDs. A service may return a display name instead of the username (observed with Zernio's Business integration). In that case automatic matching stops: an administrator must inspect the service's connection, select its exact account, and explicitly confirm the mapping. The service account ID, its returned label, canonical handle, and confirming actor are retained. A later label/identity change blocks the route until it is checked again.
4. Check both connections. A service can be disabled without losing an already-submitted post's tracking credential. Rotating a key preserves credentials used by existing attempts.

Keys are accepted only through authenticated `connections.manage` routes with same-origin protection and explicit consent. Keys are never returned by settings APIs. Do not put keys in frontend environment variables, chat, fixtures, committed files, or logs.

## Routing and duplicate protection

- Buffer is tried first for eligible videos, followed by Zernio. Both target the same explicitly verified account. The approved caption, video and disclosure settings are retained.
- Buffer's public API currently exposes only AI disclosure and photo title for TikTok metadata. Own-brand and paid-partnership disclosures use Zernio. Buffer additionally requires explicit per-publication consent to its own interaction settings. It is skipped if that consent is absent; privacy is limited to public video.
- A read-only preflight failure, service authentication/plan rejection, or service quota refusal before acceptance can select the backup. Confirmed service refusals enter a cooldown to avoid repeatedly spending requests on the same unavailable route.
- A transport timeout, 5xx, malformed response, upstream error, or ambiguous mutation response after submission is **unknown**, not a reason to try another service. After any remote ID exists, subsequent checks stay with that service, including when it reports a delayed failure requiring operator review.
- The central unique content/account/attempt job arbitrates concurrent requests across replicas. A separate unique job/service attempt is inserted **before** the remote write. Persisting a returned remote handle precedes interpreting its result. Restarted checks poll the retained handle; they never initiate a backup upload.
- Zernio creates carry the central job ID as `Idempotency-Key`. This is scoped to that service and does not replace central duplicate protection. There is no assumption of Buffer idempotent create support.
- A published state needs authenticated service confirmation, an account-matching service result and a TikTok post ID. Merely creating a service job or scheduling a post is not publication evidence.
- Platform-wide outages, content refusals and TikTok account-wide daily publishing limits cannot be solved by changing service. Posting on the service's website independently is outside the application's duplicate protection.

## Operational limits

No background publishing is enabled by setup. Actual publishing retains the existing content approval and explicit per-post consent. Calendar entries remain planning actions; no new scheduler is introduced. Pending jobs are checked by the existing sync worker and the manual check action. Unknown writes without a remote handle remain blocked for operator reconciliation; no speculative matching by caption or automatic reupload is performed.

Free service plans and platform caps can change. Buffer keys have an expiry (the current UI allows up to one year); service token refresh does not renew an expired API key. Use the connection check and cooldown status in Connections rather than treating setup as a permanent guarantee.

## Verification

`tests/hybrid-publishing.test.ts` exercises primary delivery, quota fallback, preflight outage, timeout/5xx/malformed-response ambiguity, duplicate and concurrent submissions, pinned identity changes, explicit alias confirmation, disclosure preservation, encrypted credentials, RBAC, consent and CSRF. All remote publication writes in these tests are mocked. A live account connection/creator-info read does not test video delivery; retain that distinction when reporting readiness.

Official contracts: [Buffer API](https://developers.buffer.com/reference.html), [Buffer rate limits](https://developers.buffer.com/guides/api-limits.html), [Zernio TikTok](https://docs.zernio.com/platforms/tiktok), [Zernio post creation](https://docs.zernio.com/posts/create-post).
