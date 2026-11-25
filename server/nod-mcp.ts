/**
 * MCP endpoint for outside agents such as Nod: POST /api/mcp.
 *
 * Calls run as one real Social Pulse user, named by NOD_MCP_USER_EMAIL, and
 * every tool checks that user's permissions exactly as /api/dashboard and
 * /api/plans do. The only write is adding a post to the calendar as a DRAFT:
 * nothing is scheduled, approved or published by an outside agent.
 *
 * pulse_list_endpoints / pulse_get read every tab in full the same way.
 *
 * Off until both NOD_MCP_TOKEN and NOD_MCP_USER_EMAIL are set.
 */
import type express from 'express';
import { listUsers, normalizeEmail, userCan } from './auth.js';
import { checkAlerts } from './alerts.js';
import { engagementRate, isPlanPlatform, newPlan, planState } from './domain.js';
import { McpToolError, mcpHandler, optInt, optString, type McpServerSpec, type McpTool } from './mcp-core.js';
import { getAlerts, getConnectorStatuses, getObserved, getPlans, getWebsiteDaily, getWebsitePages, savePlan } from './store.js';
import type { AuthUser } from './auth.js';
import type { ObservedPost, PlanPlatform } from './types.js';
import { EXCLUDED_ROUTES, matchReadable, readableRoutes } from './nod-mcp-catalog.js';
import { SLICE_INPUT_PROPERTIES, sliceJson } from './mcp-json-slice.js';
import { internalHeaders, selfOrigin } from './internal-caller.js';

type Ctx = { user: AuthUser; app: express.Express };
type Tool = McpTool<Ctx>;

const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'snapchat', 'youtube', 'linkedin', 'website'];
const PLAN_PLATFORMS = [...PLATFORMS, 'x'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const timeZone = () => process.env.BUSINESS_TIME_ZONE || 'Africa/Cairo';

function need(ctx: Ctx, ...permissions: Parameters<typeof userCan>[1][]) {
  if (!permissions.some((permission) => userCan(ctx.user, permission))) {
    throw new McpToolError(`The connected Social Pulse account lacks permission: ${permissions.join(' or ')}.`);
  }
}

/** Inclusive date window from YYYY-MM-DD args; defaults to the last `days` days. */
function windowFrom(args: Record<string, unknown>, days: number) {
  const from = optString(args, 'from');
  const to = optString(args, 'to');
  for (const [key, value] of [['from', from], ['to', to]]) {
    if (value && !DATE.test(value)) throw new McpToolError(`"${key}" must be YYYY-MM-DD.`);
  }
  const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - days * 86_400_000);
  return { start, end, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

const inWindow = (iso: string, w: { start: Date; end: Date }) => {
  const t = new Date(iso).getTime();
  return t >= w.start.getTime() && t <= w.end.getTime();
};

const sum = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => typeof v === 'number');
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};

const postView = (post: ObservedPost) => ({
  platform: post.platform,
  account: post.accountName,
  title: post.title,
  publishedAt: post.publishedAt,
  contentType: post.contentType,
  permalink: post.permalink,
  metrics: post.metrics,
  engagementRate: engagementRate(post),
});

const platformArg = (args: Record<string, unknown>, allowed: string[]) => {
  const platform = optString(args, 'platform').toLowerCase();
  if (platform && !allowed.includes(platform)) throw new McpToolError(`"platform" must be one of: ${allowed.join(', ')}.`);
  return platform;
};

const windowProps = {
  from: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
  to: { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
};

const overview: Tool = {
  name: 'pulse_overview',
  title: 'Social media overview',
  description:
    'Organic social media performance for Engosoft over a period: posts and totals per platform (views, reach, likes, comments, shares, engagement), the top posts, website views, open alerts and connector health. Defaults to the last 30 days. Metrics a platform does not report are null, not zero.',
  inputSchema: { type: 'object', properties: windowProps, additionalProperties: false },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: async (args, ctx) => {
    need(ctx, 'analytics.view');
    const w = windowFrom(args, 30);
    const [posts, alerts, connectors, website] = await Promise.all([getObserved(), getAlerts(), getConnectorStatuses(), getWebsiteDaily()]);
    const inRange = posts.filter((post) => inWindow(post.publishedAt, w));
    const byPlatform = [...new Set(inRange.map((post) => post.platform))].map((platform) => {
      const rows = inRange.filter((post) => post.platform === platform);
      const metric = (key: keyof ObservedPost['metrics']) => sum(rows.map((row) => row.metrics[key]));
      return { platform, posts: rows.length, views: metric('views'), reach: metric('reach'), likes: metric('likes'), comments: metric('comments'), shares: metric('shares'), engagement: metric('engagement') };
    });
    const top = [...inRange]
      .filter((post) => post.metrics.engagement !== null || post.metrics.views !== null)
      .sort((a, b) => (b.metrics.engagement ?? 0) - (a.metrics.engagement ?? 0) || (b.metrics.views ?? 0) - (a.metrics.views ?? 0))
      .slice(0, 5)
      .map(postView);
    const days = (website as { date: string; views: number; sessions: number }[]).filter((day) => day.date >= w.from && day.date <= w.to);
    return {
      period: { from: w.from, to: w.to, timeZone: timeZone() },
      posts: inRange.length,
      byPlatform,
      topPosts: top,
      website: { views: sum(days.map((d) => d.views)), sessions: sum(days.map((d) => d.sessions)), days: days.length },
      openAlerts: alerts.filter((alert) => !alert.dismissedAt).length,
      connectors,
    };
  },
};

const listPosts: Tool = {
  name: 'pulse_list_posts',
  title: 'List published posts',
  description:
    'Published organic posts read from the connected accounts, newest first or sorted by engagement or views, with their metrics and links. Filter by platform and date range (default last 30 days).',
  inputSchema: {
    type: 'object',
    properties: {
      ...windowProps,
      platform: { type: 'string', enum: PLATFORMS },
      sort: { type: 'string', enum: ['newest', 'engagement', 'views'], description: 'Defaults to newest.' },
      limit: { type: 'integer', description: 'Maximum posts, default 20, at most 100.' },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: async (args, ctx) => {
    need(ctx, 'analytics.view');
    const w = windowFrom(args, 30);
    const platform = platformArg(args, PLATFORMS);
    const sort = optString(args, 'sort') || 'newest';
    const limit = optInt(args, 'limit', 20, 100);
    let rows = (await getObserved()).filter((post) => inWindow(post.publishedAt, w) && (!platform || post.platform === platform));
    if (sort === 'engagement') rows = rows.sort((a, b) => (b.metrics.engagement ?? -1) - (a.metrics.engagement ?? -1));
    else if (sort === 'views') rows = rows.sort((a, b) => (b.metrics.views ?? -1) - (a.metrics.views ?? -1));
    return { period: { from: w.from, to: w.to }, total: rows.length, returned: Math.min(rows.length, limit), posts: rows.slice(0, limit).map(postView) };
  },
};

const calendar: Tool = {
  name: 'pulse_calendar',
  title: 'Content calendar',
  description:
    'Planned posts on the content calendar with their status (draft, approved, scheduled, published, cancelled) and computed state (for example overdue or not yet confirmed as published). Defaults to the next 14 days; pass from/to for another range.',
  inputSchema: {
    type: 'object',
    properties: {
      ...windowProps,
      platform: { type: 'string', enum: PLAN_PLATFORMS },
      status: { type: 'string', enum: ['draft', 'approved', 'scheduled', 'published', 'cancelled'] },
      limit: { type: 'integer', description: 'Maximum posts, default 50, at most 200.' },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: async (args, ctx) => {
    need(ctx, 'plans.view_all', 'content.schedule', 'content.create');
    const from = optString(args, 'from');
    const to = optString(args, 'to');
    const now = new Date();
    const w = windowFrom({ from: from || now.toISOString().slice(0, 10), to: to || new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10) }, 14);
    const platform = platformArg(args, PLAN_PLATFORMS);
    const status = optString(args, 'status');
    const limit = optInt(args, 'limit', 50, 200);
    const [plans, posts] = await Promise.all([getPlans(), getObserved()]);
    const grace = Number(process.env.ALERT_GRACE_MINUTES) || 15;
    const rows = plans
      .filter((plan) => inWindow(plan.scheduledAt, w) && (!platform || plan.platform === platform) && (!status || plan.status === status))
      .map((plan) => ({
        id: plan.id,
        platform: plan.platform,
        title: plan.title,
        caption: plan.caption.slice(0, 500),
        scheduledAt: plan.scheduledAt,
        status: plan.status,
        computedState: planState(plan, posts, now, grace),
        owner: plan.owner,
        contentType: plan.contentType,
        campaign: plan.campaign,
        permalink: plan.permalink,
      }));
    return { period: { from: w.from, to: w.to, timeZone: timeZone() }, total: rows.length, returned: Math.min(rows.length, limit), posts: rows.slice(0, limit) };
  },
};

const alertsTool: Tool = {
  name: 'pulse_alerts',
  title: 'Publishing alerts',
  description: 'Open alerts: posts due within the hour, and scheduled posts not yet confirmed as published after their time.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: async (_args, ctx) => {
    need(ctx, 'analytics.view');
    const open = (await getAlerts()).filter((alert) => !alert.dismissedAt);
    return { open: open.length, alerts: open.map(({ id, planId, kind, message, createdAt }) => ({ id, planId, kind, message, createdAt })) };
  },
};

const websiteTool: Tool = {
  name: 'pulse_website',
  title: 'Website traffic',
  description: 'Website views and sessions per day from GA4, and the most viewed pages, over a date range (default last 30 days).',
  inputSchema: { type: 'object', properties: { ...windowProps, topPages: { type: 'integer', description: 'How many top pages, default 10, at most 50.' } }, additionalProperties: false },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: async (args, ctx) => {
    need(ctx, 'analytics.view');
    const w = windowFrom(args, 30);
    const top = optInt(args, 'topPages', 10, 50);
    const [daily, pages] = await Promise.all([getWebsiteDaily(), getWebsitePages()]);
    const days = (daily as { date: string; views: number; sessions: number; engagedSessions: number }[]).filter((d) => d.date >= w.from && d.date <= w.to);
    const totals = new Map<string, { path: string; title: string; views: number; activeUsers: number }>();
    for (const page of pages as { date: string; path: string; title: string; views: number; activeUsers: number }[]) {
      if (page.date < w.from || page.date > w.to) continue;
      const row = totals.get(page.path) ?? { path: page.path, title: page.title, views: 0, activeUsers: 0 };
      row.views += Number(page.views) || 0;
      row.activeUsers += Number(page.activeUsers) || 0;
      totals.set(page.path, row);
    }
    return {
      period: { from: w.from, to: w.to },
      views: sum(days.map((d) => d.views)),
      sessions: sum(days.map((d) => d.sessions)),
      daily: days,
      topPages: [...totals.values()].sort((a, b) => b.views - a.views).slice(0, top),
    };
  },
};

const createDraft: Tool = {
  name: 'pulse_create_draft',
  title: 'Add a draft post to the calendar',
  description:
    'Adds a post to the content calendar as a DRAFT for the team to review. It is not approved, scheduled or published. Only call this when the owner asks to add or plan a post; do not invent a date or caption they did not give.',
  inputSchema: {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: PLAN_PLATFORMS },
      title: { type: 'string', description: 'Short post title.' },
      caption: { type: 'string', description: 'Post text, optional.' },
      scheduledAt: { type: 'string', description: 'Planned time, ISO 8601 with offset, e.g. 2026-12-01T18:00:00+02:00.' },
      contentType: { type: 'string', description: 'post, reel, story, video… Defaults to post.' },
      campaign: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['platform', 'title', 'scheduledAt'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  run: async (args, ctx) => {
    need(ctx, 'content.schedule');
    const platform = platformArg(args, PLAN_PLATFORMS);
    if (!platform || !isPlanPlatform(platform)) throw new McpToolError('"platform" is required.');
    const title = optString(args, 'title');
    if (!title || title.length > 300) throw new McpToolError('"title" is required, up to 300 characters.');
    const caption = optString(args, 'caption');
    if (caption.length > 5000) throw new McpToolError('"caption" is limited to 5000 characters.');
    const scheduled = new Date(optString(args, 'scheduledAt'));
    if (Number.isNaN(scheduled.getTime())) throw new McpToolError('"scheduledAt" must be an ISO 8601 date-time.');
    const plan = newPlan({
      platform: platform as PlanPlatform,
      title,
      caption,
      scheduledAt: scheduled.toISOString(),
      status: 'draft',
      owner: ctx.user.name.slice(0, 120),
      contentType: optString(args, 'contentType').slice(0, 60) || 'post',
      campaign: optString(args, 'campaign').slice(0, 120),
      notes: optString(args, 'notes').slice(0, 1000),
    });
    const saved = await savePlan(plan);
    await checkAlerts();
    return { created: true, status: saved.status, post: { id: saved.id, platform: saved.platform, title: saved.title, scheduledAt: saved.scheduledAt } };
  },
};

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

/**
 * Every tab, read in full. Each call is an ordinary GET to this server as the
 * MCP account, so the route's own permission checks decide what comes back.
 */
const listEndpoints: Tool = {
  name: 'pulse_list_endpoints',
  title: 'List every Mobde3 data endpoint',
  description:
    'Lists every data endpoint behind every Mobde3 tab: analytics for every post on every platform, YouTube channel analytics (audience, devices, traffic, watch time), per-account analytics, insights, publishing queue, content calendar, content board, campaigns, competitor radar, courses from Odoo, studio, usage and team. Read any of them in full with pulse_get.',
  inputSchema: {
    type: 'object',
    properties: { tab: { type: 'string', description: 'Optional tab to narrow the list, e.g. Analytics or YouTube.' } },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  run: async (args, ctx) => {
    const tab = optString(args, 'tab').toLowerCase();
    const routes = readableRoutes(ctx.app).filter((route) => !tab || route.tab.toLowerCase().includes(tab));
    const tabs: Record<string, { about: string; endpoints: string[] }> = {};
    for (const route of routes) {
      tabs[route.tab] ??= { about: route.about, endpoints: [] };
      tabs[route.tab].endpoints.push(route.path);
    }
    return {
      count: routes.length,
      tabs,
      leftOut: EXCLUDED_ROUTES.map(([pattern, reason]) => ({ pattern: String(pattern), reason })),
      paging: 'pulse_get returns small answers whole. A large one comes back as an outline; then pass path and page lists with offset/limit until nextOffset is gone.',
    };
  },
};

const getEndpoint: Tool = {
  name: 'pulse_get',
  title: 'Read any Mobde3 endpoint in full',
  description:
    'Reads one endpoint from pulse_list_endpoints and returns everything that tab shows, e.g. /api/dashboard (every post and metric), /api/social/youtube/insights, /api/social/youtube/breakdowns, /api/insights, /api/publishing. Replace :name segments with real ids. Large answers come back as an outline first; then read parts with path and page lists with offset and limit.',
  inputSchema: {
    type: 'object',
    properties: {
      endpoint: { type: 'string', description: 'Concrete path, e.g. /api/dashboard or /api/social/accounts/<id>/analytics.' },
      params: {
        type: 'object',
        description: 'Query parameters the tab uses, e.g. {"from":"2026-11-01","to":"2026-11-25"}.',
        additionalProperties: { type: ['string', 'number', 'boolean'] },
      },
      ...SLICE_INPUT_PROPERTIES,
    },
    required: ['endpoint'],
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  run: async (args, ctx) => {
    const match = matchReadable(ctx.app, args.endpoint);
    if (!match) throw new McpToolError('Unknown or excluded endpoint. Call pulse_list_endpoints for the readable paths.');
    const raw = args.params;
    if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
      throw new McpToolError('"params" must be an object.');
    }
    const url = new URL(match.concrete, selfOrigin());
    for (const [key, value] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      headers: { accept: 'application/json', ...internalHeaders(ctx.user.id) },
      redirect: 'manual',
      signal: AbortSignal.timeout(120_000),
    });
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('json')) {
      throw new McpToolError(`${match.concrete} answered HTTP ${response.status} with ${type || 'no content type'}, not JSON.`);
    }
    const body = (await response.json()) as unknown;
    const slice = sliceJson(body, {
      path: typeof args.path === 'string' ? args.path : '',
      offset: typeof args.offset === 'number' ? args.offset : undefined,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    });
    return { endpoint: match.concrete, route: match.path, tab: match.tab, httpStatus: response.status, ...slice };
  },
};

export const SOCIAL_PULSE_MCP: McpServerSpec<Ctx> = {
  name: 'engosoft-social-pulse',
  version: '1.0.0',
  instructions:
    "Engosoft Social Pulse: organic social media (Facebook, Instagram, TikTok, Snapchat, YouTube, LinkedIn), the content calendar and website traffic from GA4. Start with pulse_overview. For everything a tab shows (every post, YouTube channel analytics, insights, publishing, campaigns, radar) use pulse_list_endpoints then pulse_get. Null metrics mean the platform did not report them, never zero. Times are in the business time zone (Africa/Cairo by default). pulse_create_draft only adds a draft; approving, scheduling and publishing stay with the team in the app.",
  tools: [overview, listPosts, calendar, alertsTool, websiteTool, listEndpoints, getEndpoint, createDraft],
};

async function resolveContext(req: express.Request): Promise<Ctx | { error: string; status: number }> {
  const raw = String(process.env.NOD_MCP_USER_EMAIL || '').trim();
  if (!raw) return { status: 503, error: 'Set NOD_MCP_USER_EMAIL to the Social Pulse account Nod acts as.' };
  const email = normalizeEmail(raw);
  const user = (await listUsers()).find((candidate) => candidate.email === email);
  if (!user || user.status !== 'active') return { status: 403, error: 'The MCP account is missing or suspended.' };
  return { user, app: req.app as express.Express };
}

export function registerNodMcpRoute(app: express.Express) {
  app.all('/api/mcp', mcpHandler(SOCIAL_PULSE_MCP, resolveContext));
}
