# MCP endpoint for Nod

`POST /api/mcp` is a stateless MCP server (Streamable HTTP, JSON responses) for outside agents such as Nod.

## Who Nod acts as

Calls run as one real Social Pulse account, named by `NOD_MCP_USER_EMAIL`, and each tool checks that account's permissions the same way `/api/dashboard` and `/api/plans` do. A **Supervisor** role covers every tool; a **Creator** cannot read analytics or add drafts.

## Tools

| Tool | Kind | Permission |
| --- | --- | --- |
| `pulse_overview` | read: totals per platform, top posts, website, alerts, connectors | `analytics.view` |
| `pulse_list_posts` | read: published posts and metrics | `analytics.view` |
| `pulse_calendar` | read: planned posts and their computed state | `plans.view_all`, `content.schedule` or `content.create` |
| `pulse_alerts` | read: open publishing alerts | `analytics.view` |
| `pulse_website` | read: GA4 views, sessions and top pages | `analytics.view` |
| `pulse_create_draft` | action: adds a **draft** to the calendar | `content.schedule` |

An outside agent never approves, schedules or publishes. Those stay with the team in the app.

## Enable it

1. Generate a token: `openssl rand -base64 32`.
2. On Railway set `NOD_MCP_TOKEN` and `NOD_MCP_USER_EMAIL`, then redeploy. Without both the endpoint answers 503.
3. In Nod: **Apps → Connect MCP**, name `Engosoft Social Pulse`, URL `https://web-production-d07de.up.railway.app/api/mcp`, choose an access token and paste the same value.
