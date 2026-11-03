# LinkedIn through Zernio

LinkedIn organization pages are connected, measured and published through Zernio. Direct LinkedIn developer-app credentials and Apify are not needed. TikTok keeps its existing Buffer/Zernio route; there is no LinkedIn failover to Buffer in this implementation.

## Engosoft setup — 3 November 2026

- LinkedIn page: https://www.linkedin.com/company/3488623/ (`Engosoft`).
- Zernio account: `6ae9d68167115d66500cf7f0`, profile `6ae24ec72fa1ea8c50f5c0da` (`Default`).
- Zernio reports `platformUserId: urn:li:organization:3488623`, active, healthy, token valid, `canPost: true`, `canFetchAnalytics: true`.
- A separate key named **Engosoft LinkedIn Publishing & Analytics** was authorized by the owner. It is restricted to Default and resource groups **Publishing, Analytics, Accounts**. Ads, private messages, contacts, billing, files, money, admin and the remaining groups are disabled.
- The key is AES-256-GCM encrypted in `social_credentials`; no key is returned in the UI, committed to Git or stored in frontend environment variables. The existing TikTok key is unchanged.
- A real read of `/analytics?platform=linkedin&accountId=…` returned HTTP 200 and `hasAnalyticsAccess: true`. Initially its Analytics index contained no posts. A metadata-only refresh through `POST /posts/sync-external` returned 49 existing posts. Metadata is imported independently of pending metrics; an empty Analytics index is not evidence that the page has no content.
- Only two accounts were connected to Zernio at setup: TikTok and LinkedIn, within its current two-account free allowance. Adding Snapchat later would be a third account and needs a fresh pricing check before connection.
- No live content was uploaded, scheduled or published for verification.

## Inside Mobde3

1. Authorize the company page in Zernio's Connections screen.
2. Under Mobde3 **Connections → LinkedIn → Select a connected LinkedIn page**, load the candidates and select the exact organization.
3. `/api/social/linkedin/connect` verifies the selected Zernio account against its numeric organization ID and probes the actual key's Analytics permission. It does not start OAuth or publish.
4. LinkedIn appears in Connections, the publishing account list, the calendar and the existing analytics platform filters.
5. Approved posts can be published now or scheduled to LinkedIn through the ordinary publishing window. Text, one image and one MP4 video are supported there. The advanced publishing panel also supports 2–20 ordered photos. LinkedIn captions are capped at 3,000 characters; app uploads remain capped at 8 MiB per image and 200 MiB per video, with a 30-minute organization video limit.
6. PDF/document carousel, polls, personal profiles, DMs and ads are not implemented in Mobde3. Zernio supporting a feature does not mean it is exposed here.

## Background work and safety

- `server/social/linkedin.ts` calls Zernio server-side using the encrypted key. Every publication rechecks the exact organization URN and organization posting scope, so switching the Zernio account to a personal profile or another page stops the write.
- Publication uses the existing approval, publishing permission and explicit consent checks, unique job record, and a Zernio `Idempotency-Key` equal to the job ID.
- The remote handle is persisted. A pending publication is polled; a transport timeout, upstream failure or ambiguous duplicate remains `unknown`. It is never uploaded again automatically or sent to a second provider.
- Publication evidence must match the single selected LinkedIn destination and approved caption, and contain a native LinkedIn post URN. A scheduled/pending post is not reported as published.
- Existing server synchronization includes LinkedIn every 30 minutes and on startup. Each run reads at most 20 pages × 50 posts per collection (external metadata and analytics) in a 90-day window. History outside this window is retained locally if already imported, but is not backfilled by this connector.
- Only post metadata, metrics and remote media links are saved. Historical LinkedIn videos are not downloaded onto Railway. Publishing uses signed 24-hour URLs for already approved local assets, then the existing retention policy applies after confirmed publication.
- Analytics are scoped to the selected Zernio account; cross-account aggregate metrics are not imported. Missing or pending values remain null. Organization saves and non-video views remain unavailable rather than becoming invented zeroes.
- Zernio manages LinkedIn OAuth renewal. Mobde3 stores the expiry reported by its health endpoint and directs an administrator to reconnect in Zernio if access is revoked. No claim of indefinite connection is made.
- Disconnecting the page in Mobde3 stops synchronization and publishing there; it does not revoke Zernio's upstream OAuth grant. Manage/revoke that grant in Zernio or LinkedIn.

## Endpoints

- `GET /api/social/linkedin/candidates` — connection administrators only; sanitized organization candidates using the saved Zernio key.
- `POST /api/social/linkedin/connect` — connection administrators only; `{targetId, organizationId, consent: true}`, optional new `apiKey` for an authorized key replacement. A pending publication prevents replacement.
- `POST /api/social/linkedin/sync` — connection administrators only; existing sync machinery.
- Existing `/api/publishing/:contentId`, `/api/social/publish`, polling and reconciliation endpoints handle publication.

## References

- https://docs.zernio.com/platforms/linkedin
- https://docs.zernio.com/platforms/linkedin/analytics
- https://docs.zernio.com/analytics/get-analytics
- https://docs.zernio.com/posts/create-post
- https://docs.zernio.com/pricing
