/**
 * Every GET route of the Mobde3 API an outside agent may read over MCP.
 *
 * Read from the live Express router, so a new tab is reachable the day it
 * ships. Left out, with the reason: sign-in and OAuth, push keys, the MCP
 * endpoint itself, and anything that serves a file or image instead of JSON.
 */
import type express from 'express';

const TABS: [string, string, string][] = [
  ['/api/dashboard', 'Analytics', 'Everything the analytics tabs show: every post on every platform with its metrics, totals, website (GA4), alerts and connectors.'],
  ['/api/insights', 'Insights', 'Generated insights about performance.'],
  ['/api/social/youtube', 'YouTube analytics', 'YouTube channel analytics: audience, devices, traffic sources, watch time and period comparisons.'],
  ['/api/social/accounts', 'Accounts', 'Per-account analytics and creator info.'],
  ['/api/social', 'Social', 'Connections, content, assets and publishing services.'],
  ['/api/publishing', 'Publishing', 'Publishing queue and each post\'s publishing state.'],
  ['/api/calendar-posts', 'Calendar', 'The content calendar.'],
  ['/api/google-calendar', 'Calendar', 'Linked Google calendars.'],
  ['/api/content', 'Content board', 'Content items, their stages, versions and kits.'],
  ['/api/campaigns', 'Campaigns', 'Campaigns and their analysis.'],
  ['/api/radar', 'Competitor radar', 'Competitor posts and findings.'],
  ['/api/course-profiles', 'Courses', 'Course profiles used for content.'],
  ['/api/odoo', 'Courses', 'Courses and schedule from Odoo.'],
  ['/api/schedule', 'Courses', 'Course schedule from Odoo.'],
  ['/api/ai-templates', 'Studio', 'AI templates.'],
  ['/api/svg-templates', 'Studio', 'Design templates.'],
  ['/api/studio', 'Studio', 'Studio documents and jobs.'],
  ['/api/ai', 'Studio', 'AI generation runs and jobs.'],
  ['/api/reference-design', 'Studio', 'Reference design jobs.'],
  ['/api/notifications', 'Notifications', 'Notifications.'],
  ['/api/settings', 'Settings', 'Notification settings.'],
  ['/api/storage', 'Settings', 'Storage use and retention.'],
  ['/api/usage', 'Settings', 'AI usage and budgets.'],
  ['/api/users', 'Team', 'Accounts and roles.'],
  ['/api/permissions', 'Team', 'Permission catalogue.'],
  ['/api/health', 'System', 'Server health.'],
];

export const EXCLUDED_ROUTES: [RegExp, string][] = [
  [/^\/api\/mcp(\/|$)/, 'The MCP endpoint itself.'],
  [/^\/api\/auth(\/|$)/, 'Sign-in.'],
  [/^\/api\/oauth(\/|$)/, 'OAuth handshakes.'],
  [/^\/api\/push(\/|$)/, 'Browser push keys.'],
  [/^\/api\/webhooks\//, 'Provider webhook handshake.'],
  [/^\/api\/analytics\/thumbnail\//, 'Image.'],
  [/^\/api\/creatives\//, 'Image file.'],
  [/^\/api\/radar\/picture\//, 'Image.'],
  [/^\/api\/social\/media\//, 'Media file.'],
  [/^\/api\/uploads\//, 'File.'],
  [/^\/api\/studio\/:file$/, 'File.'],
  [/^\/api\/?$/, 'Not an endpoint.'],
];

export function excludedReason(path: string): string | null {
  return EXCLUDED_ROUTES.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}

export function tabOf(path: string) {
  const hit = TABS.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'));
  return hit ? { tab: hit[1], about: hit[2] } : { tab: 'Other', about: '' };
}

type Layer = { route?: { path: unknown; methods?: Record<string, boolean> } };

/** Every readable GET route registered on `app`, with its tab. */
export function readableRoutes(app: express.Express) {
  const stack = ((app as unknown as { router?: { stack?: Layer[] }; _router?: { stack?: Layer[] } }).router?.stack
    ?? (app as unknown as { _router?: { stack?: Layer[] } })._router?.stack
    ?? []) as Layer[];
  const paths = new Set<string>();
  for (const layer of stack) {
    if (!layer.route?.methods?.get) continue;
    for (const path of Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path]) {
      if (typeof path === 'string' && path.startsWith('/api/') && !excludedReason(path)) paths.add(path);
    }
  }
  return [...paths].sort().map((path) => ({ path, ...tabOf(path) }));
}

const patternRegex = (pattern: string) =>
  new RegExp(`^${pattern.split('/').map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/')}$`);

/** Resolves a concrete path to a readable route, or null. No scheme, host, `..` or query. */
export function matchReadable(app: express.Express, requested: unknown) {
  const path = String(requested ?? '').trim().split('?')[0].replace(/\/+$/, '');
  if (!/^\/api\/[A-Za-z0-9/_.:%@-]+$/.test(path) || path.includes('..') || path.includes('//') || path.includes(':')) return null;
  if (excludedReason(path)) return null;
  const routes = readableRoutes(app);
  const exact = routes.find((route) => route.path === path);
  if (exact) return { ...exact, concrete: path };
  const hit = routes.find((route) => route.path.includes(':') && patternRegex(route.path).test(path));
  return hit && !excludedReason(hit.path) ? { ...hit, concrete: path } : null;
}
