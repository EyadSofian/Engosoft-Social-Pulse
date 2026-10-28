import type { JSX } from 'react';
import { AnalyticsHub } from '../pages/analytics/AnalyticsHub';
import { CalendarPage } from '../pages/calendar/CalendarPage';
import { CoursesPage } from '../pages/courses/CoursesPage';
import { ContentBoardPage } from '../pages/content/ContentBoardPage';
import { CreationHomePage } from '../pages/home/CreationHomePage';
import { OverviewPage } from '../pages/overview/OverviewPage';
import { PublishPage } from '../pages/publish/PublishPage';
import { TemplatePage } from '../pages/library/TemplatePage';
import { UsagePage } from '../pages/usage/UsagePage';
import { LibraryPage } from '../pages/library/LibraryPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { StudioPage } from '../pages/studio/StudioPage';
import type { NavId } from '../shell/nav';
import { matchPath } from './router/router';

export interface RouteDef {
  pattern: string;
  /** The navigation entry that owns the route; access follows that entry's visibility. */
  nav: NavId;
  render: (params: Record<string, string>) => JSX.Element;
}

export const ROUTES: RouteDef[] = [
  { pattern: '/', nav: 'home', render: () => <CreationHomePage /> },
  { pattern: '/content', nav: 'content', render: () => <ContentBoardPage /> },
  { pattern: '/content/:id', nav: 'content', render: ({ id }) => <ContentBoardPage openId={id} /> },
  { pattern: '/studio/:id', nav: 'content', render: ({ id }) => <StudioPage key={id} id={id} /> },
  { pattern: '/calendar', nav: 'calendar', render: () => <CalendarPage /> },
  { pattern: '/publish', nav: 'publish', render: () => <PublishPage /> },
  { pattern: '/overview', nav: 'overview', render: () => <OverviewPage /> },
  { pattern: '/analytics', nav: 'analytics', render: () => <AnalyticsHub /> },
  // Older links to the separate tracking pages open the matching Analytics tab.
  { pattern: '/tracking', nav: 'analytics', render: () => <AnalyticsHub initial="posts" /> },
  { pattern: '/performance', nav: 'analytics', render: () => <AnalyticsHub initial="team" /> },
  { pattern: '/courses', nav: 'courses', render: () => <CoursesPage /> },
  { pattern: '/library', nav: 'library', render: () => <LibraryPage /> },
  { pattern: '/library/templates/:id', nav: 'library', render: ({ id }) => <TemplatePage key={id} id={id} /> },
  { pattern: '/usage', nav: 'usage', render: () => <UsagePage /> },
  { pattern: '/settings', nav: 'settings', render: () => <SettingsPage /> },
  { pattern: '/connections', nav: 'settings', render: () => <SettingsPage initialTab="connections" /> },
];

export function resolveRoute(path: string): { route: RouteDef; params: Record<string, string> } | null {
  for (const route of ROUTES) {
    const params = matchPath(route.pattern, path);
    if (params) return { route, params };
  }
  return null;
}
