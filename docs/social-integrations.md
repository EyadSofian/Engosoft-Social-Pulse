# Official social integrations — operational handoff

Checked 28 October 2026 (Africa/Cairo). No public content was published during implementation.

## Verified live setup

Deployment `64cb0982-bd6b-413d-81a0-6b2fc5e0b857` became SUCCESS after Railway's
build delay. `/api/health` returns 200 and the new protected social routes are live.
The owner subsequently requested connection setup only, with all content uploads and
publishing deferred, and explicitly deferred Snapchat.

- Facebook: five existing Engosoft Pages reauthorized through the live app with
  pages_manage_posts and publish_video. All five show text/image/video capability.
- Instagram: engosoftofficial and engosoft_eng reauthorized through the live app
  with instagram_content_publish; image/video/carousel capabilities are available.
- TikTok: official account reauthorized with video.publish and video.upload in Sandbox. Content
  Posting API and Direct Post are configured. Public Direct Post is still unapproved.
- YouTube: dedicated Web client saved securely in Railway, exact callback registered,
  Data API v3 and Analytics API enabled and confirmed. Existing OAuth audience is
  External/In production, with 2/100 users. Channel consent awaits deployment of
  the new client pair; the running deployment still has the earlier Desktop pair.
- The original 2 users, 7 plans, 7 content items, 4,272 observed posts and legacy
  encrypted token were preserved. No publishing job was created.

Meta's debugger confirmed current Page/User tokens have expires_at=0 and an actual
data_access_expires_at deadline. The earlier one-hour fallback was incorrect; all six
currently referenced encrypted Meta credentials were corrected from authoritative
debugger metadata without changing their tokens. Future OAuth callbacks now verify
the token's app/validity and retain the earliest real expiry/data-access deadline.

Further deploy submissions currently return **Deploys have been paused temporarily**.
The Business Login configuration, YouTube client update and subsequent callback/UI
fixes are committed for the next deployment. This is an active Railway incident;
do not report the latest source as deployed until a new deployment succeeds.

## Existing production and rollback

Starting commit: `be4a0b684405e9df391e95fb750563632cede03a` on `main`.
Starting successful Railway deployment: `aac090e9-dddd-41fd-a7b4-474ee79de563`.
Project `Engosoft-Social-Pulse`, service `web`, environment `production`.
PostgreSQL remains on its existing private Railway network; `/data` stays mounted.

Read-only SQL inventory before deployment: 2 users, 7 plans, 7 content items,
4,272 observed posts (166 Facebook, 316 Instagram, 3,790 TikTok), 1 legacy encrypted
OAuth token. These counts may increase through ordinary synchronization/user activity.
No historical records, credentials, encryption key, database resources, volumes or
network settings are replaced. Roll back the web service to the starting deployment
if necessary; all new tables/columns are additive and can remain with the old code.
Never roll the database back to an earlier snapshot just to revert application code.

## Integration implementation

- `server/social/`: account discovery, exact configured OAuth callbacks, hashed
  provider/user-bound single-use state plus HTTP-only state cookies; capabilities;
  AES-256-GCM credentials with per-credential AAD; single-flight token refresh and
  rotation persistence; approved-media validation; publication jobs and reconciliation.
- Existing Meta, TikTok and Snapchat readers remain in `server/connectors/`.
  YouTube uses Data API v3 uploads playlists and video statistics, plus authorized
  Analytics reports. YouTube, TikTok and Snapchat history checkpoints persist with
  imported posts in the same database transaction. Imports upsert stable external IDs.
- Existing 30-minute scheduler and manual refresh share one in-flight synchronization.
  Historical records are retained during failures and partial responses. Missing metrics
  remain null. Last success is stored separately from the latest failed check.
- Each authorized account gets an independent record. Existing encrypted TikTok
  credentials remain in `oauth_tokens` with their original encryption envelope and key.
  New OAuth authorizations do not overwrite the existing account's legacy token.
- Connections shows verified identity, scopes/capabilities, token health without
  credentials, last success/error, connect/reconnect/disconnect and manual sync.
  A configured environment variable alone does not establish a connection.
- `content.publish` is required independently of `content.schedule`. Only approved
  or scheduled content can be submitted explicitly; a calendar time never submits
  content. Selected copy comes from the locked content record. Videos must be
  attached before approval; generated images come only from that record's approved
  creative/Studio/upload path. External arbitrary media URLs are rejected.
- Media is inspected on the server. Current upload limit is 200 MB, MP4 only;
  generated images are converted to JPEG for platform compatibility. Media stays
  on `/data/social`; expiring signed URLs grant providers access to selected files.
- Unique per-content/account/attempt jobs prevent duplicate submissions across
  requests. Only explicitly retried, confirmed failed jobs get a new attempt;
  uncertain outcomes retain their original handles and cannot start another upload.
  Pending/uncertain jobs block withdrawing content approval. Initial upload acceptance
  never marks content published. The existing sync cycle and a manual check reconcile
  processing results; status checks are limited to once per minute per job.

## Publishing boundaries

| Provider | Implemented flow | Real production publishing verification |
|---|---|---|
| Facebook | Page text, image and video; Page task/token checks; read-after-write verification | Publishing scopes verified on all five Pages; content submission deferred by owner |
| Instagram | JPEG, Reel/video and mixed carousel containers, processing, quota check, media_publish, permalink verification | Publishing scope verified on both accounts; content submission deferred by owner |
| TikTok | Separate Direct Post and inbox upload; creator/privacy/interaction options; FILE_UPLOAD video chunks; verified-domain photo pull; publish-status checks | Sandbox video.publish/video.upload consent verified; public audit and content submission remain outstanding |
| Snapchat | AES-256-CBC encrypted multipart media upload, organic Story and Spotlight requests; Spotlight LIVE verification | Not performed; no authorized Public Profile token |
| YouTube | Owner OAuth; resumable videos.insert; metadata/privacy/audience; upload-session recovery; successful processing verification | Not performed; no working owner authorization |

Snapchat Story POST can return SUCCESS without a Story/post ID. Such jobs remain
unconfirmed and require the publisher to select an exact live ID, which is verified through the selected account before being recorded; they never become published from
SUCCESS alone. TikTok inbox delivery requires the creator to finish in TikTok.
Private TikTok completion may not return a public post ID; the job remains
unconfirmed until an ID can be verified. No public URL is fabricated.

## Exact outstanding access actions

### Meta

The original environment token grants read_insights, pages_show_list, instagram_basic,
instagram_manage_insights, pages_read_engagement and related messaging/read scopes.
It was preserved. New encrypted OAuth credentials now also grant pages_manage_posts,
instagram_content_publish and publish_video on the existing Engosoft accounts.
Keep the existing token and key. Configure the following exact OAuth redirects in
the current Meta app's Facebook Login settings, then use Connections → Authorize publishing:

- `https://web-production-d07de.up.railway.app/api/oauth/facebook/callback`
- `https://web-production-d07de.up.railway.app/api/oauth/instagram/callback`

Both callbacks were saved in Engosoft_test (app 2083451515603693), preserving the
existing Chatwoot callback. Matching `META_REDIRECT_URI` and
`META_INSTAGRAM_REDIRECT_URI` are configured on Railway. With the owner's approval,
the user-token Business Login configuration **Social Pulse Publishing** was created
(4744652375858071): pages_manage_posts, pages_show_list, publish_video,
instagram_content_publish, pages_read_engagement, instagram_basic,
instagram_manage_insights and read_insights. `META_PUBLISH_LOGIN_CONFIG_ID` selects
this configuration only for explicit publishing consent, replacing the scope query.
The optional `META_READ_LOGIN_CONFIG_ID` must reference a separate minimal read
configuration; otherwise read consent keeps the existing scope-based flow. Configuring
the app alone does not grant those permissions. The existing scope-based user-token
flow was sufficient for the owner to reauthorize both providers on the live deployment.
Obtain the relevant publishing permission's app access/review and the Page
CREATE_CONTENT/MANAGE role. Complete Page Publishing Authorization if Meta requires it.
The existing linked-Professional-account authentication method is preserved.
Unlinked Pages need a Professional Instagram account linked by their administrator.

### TikTok

Developer app “Engosoft N8n”, Sandbox “Social Pulse Demo”, retains Login Kit and
user.info.basic/video.list. With the owner's approval, Content Posting API was added,
Direct Post enabled, and video.publish/video.upload saved and confirmed after reload.
@engosoft_official is an existing target user. Production is still a Draft with no
submitted review/demo. The official account was reauthorized for both Direct Post and
inbox uploads in Sandbox; the persisted token was verified to retain both scopes.

Connections supports separate publishing/inbox consent and explicit combined
`publishing-and-draft` consent, so users requesting both retain both grants in one
credential. Read-only consent never requests either publishing scope.
For authorized private Sandbox tests only, set `TIKTOK_SANDBOX_POSTING=true`; privacy
must be SELF_ONLY and TikTok's unaudited account restrictions still apply. General
Direct Post requires audit approval, not merely Display API review. Only set
`TIKTOK_DIRECT_POST_APPROVED=true` after approval. Verify APP_URL in TikTok URL properties
and set `TIKTOK_VERIFIED_MEDIA_ORIGINS` to that exact origin before photo publishing.

**Policy constraint:** TikTok's current Direct Post guidelines exclude utilities
limited to accounts managed by an internal team. Engosoft's internal-only use cannot
be assumed eligible for audit. Confirm an eligible intended use with TikTok; use the
authorized inbox-upload flow and finish in TikTok where Direct Post is unavailable.
The required demonstration video must show actual consent, creator settings and the
app's export flow. No claim of public publishing approval is made.

### Snapchat

Sign into the business account that owns Engosoft's Public Profile. Create/use the
OAuth app in **Business Manager → Business Details**, not the Snap Kit developer portal.
Have Snap allowlist its client ID for the Public Profile API and grant the user profile
permissions. The existing n8n Business Manager app client ID/secret and
`SNAP_REDIRECT_URI=https://web-production-d07de.up.railway.app/api/oauth/snapchat/callback`
were copied securely into Railway (without importing its Ads refresh token);
connect with snapchat-profile-api consent. SNAP_PROFILE_ID is retained as a supported
explicit selection; otherwise OAuth discovery uses my_profile. Existing manual
SNAP_PROFILE_ACCESS_TOKEN/SNAP_PROFILE_REFRESH_TOKEN configuration remains supported.

The authorized browser currently reaches Snapchat login. The existing n8n Snapchat
refresh grant was tested: it has **snapchat-marketing-api**, and Public Profile
my_profile returned HTTP 403. Advertising credentials do not establish organic access.

### YouTube

The Google account Engosoft AiBot owns project **Engosoft Insights Hub**
(`engosoft-insights-hub`, number 65809133944). The reused Insights Hub Google client
was discovered to be a Desktop client, unsuitable for this web callback. With explicit
owner approval, a separate Web client **Engosoft Social Pulse YouTube** was created
(65809133944-ipmck8qhjh9ve76gles4mf6n4ac7f20c.apps.googleusercontent.com), preserving
all existing clients. Its only redirect is:

`https://web-production-d07de.up.railway.app/api/oauth/youtube/callback`

The new Web client replaces only the initially copied YouTube client pair in Social
Pulse Railway; the source Hub credentials and clients remain untouched.
YouTube Data API v3/YouTube Analytics API are enabled and the audience was checked:
External, In production (2/100 users). The latest client pair needs deployment before
channel-owner consent can complete. Its Ads refresh token was not imported. Read consent requests youtube.readonly and
yt-analytics.readonly; publishing separately adds youtube.upload. API keys and
Google Ads/Sheets scopes do not grant owner upload/Analytics authorization.
Use Google's current verification rules for the selected audience and scopes.
The current official videos.insert documentation no longer describes a universal
private-only restriction for unverified projects; enforce the actual project's
quota/consent policy and the user-selected privacy rather than assuming an old rule.

## Additional authorized sources checked

- Engosoft-Insights-Hub source and Railway variable **names** were inspected without
  modifying that repository/service. Its TikTok integration is Marketing API, not
  Display/Content Posting. Its Google credentials are Ads/Sheets authorizations.
- n8n's official public API was accessed using the user-provided key, without copying
  that key into source or application configuration. Workflows were inspected in memory;
  secret values were suppressed. Meta tokens in both n8n and Insights Hub grant
  ads_management/ads_read/business_management/pages_read_engagement/public_profile,
  without the required publishing or Instagram scopes; they were not substituted.
- The existing n8n “YouTube account” credential was tested through an isolated,
  authenticated native YouTube read node. It returned no verified channel and a provider
  error. The temporary workflow and its temporary header credentials were removed;
  all pre-existing n8n workflows/credentials were preserved. Reconnect that credential
  if n8n is to be used separately; the direct application flow remains implemented.

## Official API references reviewed

- [Meta Pages posts](https://developers.facebook.com/documentation/pages-api/posts)
- [Instagram publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- [TikTok Display API](https://developers.tiktok.com/doc/display-api-overview)
- [TikTok Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [TikTok photos](https://developers.tiktok.com/doc/content-posting-api-reference-photo-post)
- [TikTok upload](https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content)
- [TikTok creator settings](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info)
- [TikTok status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status)
- [TikTok intended use and required UX](https://developers.tiktok.com/doc/content-sharing-guidelines)
- [Snap OAuth/access](https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted)
- [Snap profile discovery](https://developers.snap.com/marketing-api/Public-Profile-API/Profiles)
- [Snap organic assets/publishing](https://developers.snap.com/marketing-api/Public-Profile-API/ProfileAssetManagement)
- [Snap metrics](https://developers.snap.com/marketing-api/Public-Profile-API/Metrics)
- [YouTube upload](https://developers.google.com/youtube/v3/docs/videos/insert)
- [YouTube resumable upload](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol)
- [YouTube Analytics](https://developers.google.com/youtube/analytics/reference/reports/query)
- [Google owner OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [n8n official API authentication](https://docs.n8n.io/api/authentication)

Routine verification uses mocked providers and throwaway SQLite databases. It covers
OAuth state expiry/replay/provider binding/owner suspension; encrypted credentials;
refresh rotation; discovery; deduplication; unavailable metrics; quotas/retries;
permission separation; media restrictions; asynchronous publication evidence;
ambiguous outcomes; MP4 upload transfer; and preservation of the approval/calendar flow.
