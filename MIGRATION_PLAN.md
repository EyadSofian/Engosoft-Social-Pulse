# Migration plan

How the old five-tab dashboard became the Content Operations Platform, what was reused, what was removed, and the backend work still to do.

The backend did not change, apart from the TikTok OAuth return route. Express, SQLite, the Meta / TikTok / Snapchat / GA4 connectors, the plans table, the alerts, the imports and exports and the 30-minute sync all run as before. The 11 original tests still pass, alongside 10 new tests for the workflow engine.

## Old screens → new pages

| Old (hash route) | Old component | New page | Notes |
| --- | --- | --- | --- |
| `#/overview` | `features/overview/OverviewView.tsx` | Home `/` | Replaced by role-based homes. Live numbers (top posts, connections) moved into Home cards and Analytics. |
| `#/calendar` | `features/calendar/CalendarView.tsx` and parts | Calendar `/calendar` | New content-plan calendar (month / week / agenda with courses and occasions). The old calendar runs unchanged under **Publishing calendar (live)**, `/calendar?view=live`. |
| `#/content` | `features/content/ContentView.tsx` | Analytics `/analytics?tab=content` | Post performance by platform and type, with sources. |
| `#/insights` | `features/insights/InsightsView.tsx` | Analytics `/analytics` | Executive, content, platform, department, team and historical-learning tabs. |
| `#/connections` | `features/connections/ConnectionsView.tsx` | Connections `/connections` | Same data, plus data available / missing and setup guides. Tokens are never shown. |
| — | `components/shell/Shell.tsx`, `AlertsDrawer.tsx` | `src/shell/*` | New sidebar, header, breadcrumbs, command palette, notification center. Calendar alerts appear in the notification center. |

`src/app/router/router.tsx` turns old hash links into the new routes, so bookmarks and shared links keep working.

## Reused logic

| Module | Used by |
| --- | --- |
| `src/lib/analytics.ts` | Analytics, Home top posts, best publishing time |
| `src/lib/api.ts`, `src/hooks/useDashboard.ts` | `LiveDataProvider`, the single loader of `/api/dashboard` |
| `src/lib/calendar.ts`, `calendarExport.ts` | Legacy calendar (imports, CSV and ICS export) |
| `src/lib/occasions.ts` | Content opportunities on Home and the content-plan calendar |
| `src/lib/platforms.ts`, `platformIcons.ts` | Channel icons and names |
| `src/lib/format.ts` | Business timezone and timestamp parsing |
| `src/types.ts` | Types of the API payload |
| The whole legacy calendar | Moved to `src/legacy/`. It is wrapped by `LegacyCalendar.tsx`, its CSS is scoped with `@scope (.lg)`, and `legacy-base.css` maps its old token names onto the new palette. Its overlays render into a scoped `#lg-layer`. |

## Data adapters (no SQLite migration)

`src/services/adapters/live.ts` maps the existing records onto the new entities when the dashboard loads. Nothing is copied or rewritten in the database.

| Existing record | New entity | Rule |
| --- | --- | --- |
| `Plan` | `ContentItem` + `ScheduledPublication` | `id` becomes `live-{id}`, the status maps one to one, the owner name is kept as an external owner, provenance is `live`. These items are read-only in the new workflow. |
| `ObservedPost` | `Publication` + `AnalyticsSnapshot` | The snapshot keeps `null` for metrics the platform did not return, and names its provider and account. |
| `Connector` | `PlatformAccount`-like status and `MetricSource` | Drives every source line and every needs-setup or error state. |
| `Alert` | Notification group | Reminders and "publishing not confirmed" alerts. Dismissing one still calls `POST /api/alerts/:id/dismiss`. |
| `WebsiteDay`, `WebsitePageDay` | Analytics → Platform → Website | Unchanged numbers, now with a source line. |

## Deleted code

Removed only after the replacement page existed and the build passed:

- `src/features/overview/OverviewView.tsx`
- `src/features/content/ContentView.tsx`
- `src/features/insights/InsightsView.tsx`
- `src/features/connections/ConnectionsView.tsx`
- `src/components/shell/Shell.tsx`, `src/components/shell/AlertsDrawer.tsx`
- `src/components/charts/Heatmap.tsx`, `src/components/charts/SeriesChart.tsx`
- `src/styles/{base,tokens,shell,views,charts}.css` (the Aurora / glass styles)
- The hash router and the pointer spotlight effect in `src/hooks/ui.ts`

Moved without changes to `src/legacy/`: the calendar views, `PlanDrawer`, `PostDrawer`, the old UI kit and `context.ts`.

## Changed on the server

- `server/index.ts`: the TikTok OAuth callback redirects to `/connections?tiktok=…` instead of `/#/connections?tiktok=…`. The old form would still work through the hash upgrade, but the new form avoids a redirect hop.

## Pending backend work

In priority order:

1. **Authentication.** Real users and sessions, replacing the "View as" switcher. All `/api` routes are public today.
2. **Server permissions.** Enforce the same rules as `src/features/workspace/permissions.ts` on every write.
3. **Persist the workspace entities.** Add SQLite tables and REST endpoints for content items, tasks, approvals, comments, activity, notifications, monthly plans and targets, campaigns, courses, achievements, assets, credit wallets and transactions, and templates. The pure functions in `src/features/workspace/actions.ts` already define the behaviour each endpoint needs. The frontend swaps `WorkspaceProvider`'s in-memory reducer for API calls.
4. **Fold calendar plans into content items.** Once (3) exists, make `plans` rows content items (or link them one to one) so live calendar entries join the review workflow. Keep `/api/plans` working until the legacy calendar is retired.
5. **Retire the legacy calendar.** Add drag-to-reschedule, import and export to the new calendar, then delete `src/legacy/`.
6. **Media storage.** Uploads and downloads for the media library (object storage), with usage history.
7. **AI endpoints.** Caption generation and rewriting, platform variants, and image and video jobs, charged to department credit wallets. AI Studio already has the interface, and Generate is disabled until an endpoint is configured.
8. **Course and student data source.** Read courses and enrolment counts from the training system instead of the demo seed, so the "starts in 7 days" triggers fire on real dates.
9. **LinkedIn connector and lead tracking.** Both are shown as missing (`—`) today.
10. **Notification delivery.** Email or Telegram for assignments and reviews (Telegram already exists for publishing alerts).
