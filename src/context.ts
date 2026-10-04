import { createContext, useContext } from 'react';
import type { DashboardStore } from './hooks/useDashboard';
import type { Route } from './hooks/ui';
import type { Filters } from './lib/analytics';
import type { Dashboard, Plan, Post } from './types';

export type PlanTarget = { mode: 'new'; day?: string } | { mode: 'edit'; plan: Plan };

export interface AppContextValue {
  store: DashboardStore;
  data: Dashboard;
  /** Ticks every 30 seconds; drives countdowns and what counts as "today". */
  now: number;
  todayNum: number;
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  route: Route;
  go: (route: Route) => void;
  openPlan: (target: PlanTarget) => void;
  openPost: (post: Post) => void;
  openAlerts: () => void;
  runSync: () => Promise<void>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside the app shell.');
  return value;
}
