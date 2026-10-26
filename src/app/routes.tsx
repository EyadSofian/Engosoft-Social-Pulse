import type { JSX } from 'react';
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage';
import { CalendarPage } from '../pages/calendar/CalendarPage';
import { ContentBoardPage } from '../pages/content/ContentBoardPage';
import { CreationHomePage } from '../pages/home/CreationHomePage';
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
  { pattern: '/performance', nav: 'performance', render: () => <AnalyticsPage /> },
  { pattern: '/library', nav: 'library', render: () => <LibraryPage /> },
  { pattern: '/settings', nav: 'settings', render: () => <SettingsPage /> },
];

export function resolveRoute(path: string): { route: RouteDef; params: Record<string, string> } | null {
  for (const route of ROUTES) {
    const params = matchPath(route.pattern, path);
    if (params) return { route, params };
  }
  return null;
}
