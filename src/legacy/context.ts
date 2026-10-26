import { createContext, useContext } from 'react';
import type { DashboardStore } from '../hooks/useDashboard';
import type { Filters } from '../lib/analytics';
import type { Dashboard, Plan, PlanInput, PlanStatus, Post } from '../types';

export type PlanTarget =
  /** `time` is HH:mm in the business timezone; `template` pre-fills a duplicate or an occasion post. */
  | { mode: 'new'; day?: string; time?: string; template?: Partial<PlanInput> }
  /** `status` pre-selects a new status, e.g. a board card dropped on "published" that still needs proof. */
  | { mode: 'edit'; plan: Plan; status?: PlanStatus };

export interface AppContextValue {
  store: DashboardStore;
  data: Dashboard;
  /** Ticks every 30 seconds; drives countdowns and what counts as "today". */
  now: number;
  todayNum: number;
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  openPlan: (target: PlanTarget) => void;
  openPost: (post: Post) => void;
  /** Moves between the original dashboard's views, now pages of the new shell. */
  go: (view: LegacyView) => void;
}

export type LegacyView = 'overview' | 'calendar' | 'content' | 'insights' | 'connections';
export const LEGACY_PATHS: Record<LegacyView, string> = { overview: '/overview', calendar: '/calendar', content: '/tracking', insights: '/analytics', connections: '/settings' };

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside the app shell.');
  return value;
}
