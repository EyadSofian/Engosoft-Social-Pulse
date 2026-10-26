import type { JSX } from 'react';
import { AchievementsPage } from '../pages/achievements/AchievementsPage';
import { AdminPage } from '../pages/admin/AdminPage';
import { AiStudioPage } from '../pages/ai-studio/AiStudioPage';
import { PostDesignerPage } from '../pages/ai-studio/PostDesignerPage';
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage';
import { CalendarPage } from '../pages/calendar/CalendarPage';
import { ConnectionsPage } from '../pages/connections/ConnectionsPage';
import { ContentDetailPage } from '../pages/content/ContentDetailPage';
import { ContentPage } from '../pages/content/ContentPage';
import { CreditsPage } from '../pages/credits/CreditsPage';
import { DepartmentDetailPage } from '../pages/departments/DepartmentDetailPage';
import { DepartmentsPage } from '../pages/departments/DepartmentsPage';
import { HomePage } from '../pages/home/HomePage';
import { MediaPage } from '../pages/media/MediaPage';
import { MyWorkPage } from '../pages/my-work/MyWorkPage';
import { TasksPage } from '../pages/tasks/TasksPage';
import { TemplateDetailPage } from '../pages/templates/TemplateDetailPage';
import { TemplatesPage } from '../pages/templates/TemplatesPage';
import type { NavId } from '../shell/nav';
import { matchPath } from './router/router';

export interface RouteDef {
  pattern: string;
  /** The navigation entry that owns the route; access follows that entry's visibility. */
  nav: NavId;
  render: (params: Record<string, string>) => JSX.Element;
}

export const ROUTES: RouteDef[] = [
  { pattern: '/', nav: 'home', render: () => <HomePage /> },
  { pattern: '/my-work', nav: 'my-work', render: () => <MyWorkPage /> },
  { pattern: '/content', nav: 'content', render: () => <ContentPage /> },
  { pattern: '/content/:id', nav: 'content', render: ({ id }) => <ContentDetailPage key={id} id={id} /> },
  { pattern: '/calendar', nav: 'calendar', render: () => <CalendarPage /> },
  { pattern: '/tasks', nav: 'tasks', render: () => <TasksPage /> },
  { pattern: '/templates', nav: 'templates', render: () => <TemplatesPage /> },
  { pattern: '/templates/:id', nav: 'templates', render: ({ id }) => <TemplateDetailPage key={id} id={id} /> },
  { pattern: '/ai-studio', nav: 'ai-studio', render: () => <AiStudioPage /> },
  { pattern: '/ai-studio/post-designer', nav: 'ai-studio', render: () => <PostDesignerPage /> },
  { pattern: '/media', nav: 'media', render: () => <MediaPage /> },
  { pattern: '/achievements', nav: 'achievements', render: () => <AchievementsPage /> },
  { pattern: '/departments', nav: 'departments', render: () => <DepartmentsPage /> },
  { pattern: '/departments/:id', nav: 'departments', render: ({ id }) => <DepartmentDetailPage key={id} id={id} /> },
  { pattern: '/analytics', nav: 'analytics', render: () => <AnalyticsPage /> },
  { pattern: '/credits', nav: 'credits', render: () => <CreditsPage /> },
  { pattern: '/connections', nav: 'connections', render: () => <ConnectionsPage /> },
  { pattern: '/admin', nav: 'admin', render: () => <AdminPage /> },
];

export function resolveRoute(path: string): { route: RouteDef; params: Record<string, string> } | null {
  for (const route of ROUTES) {
    const params = matchPath(route.pattern, path);
    if (params) return { route, params };
  }
  return null;
}
