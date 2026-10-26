import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLiveData } from '../app/providers/LiveDataProvider';
import { useNow } from '../hooks/ui';
import { todayNumber, type Filters } from '../lib/analytics';
import type { Post } from '../types';
import { AppContext, LEGACY_PATHS, type AppContextValue, type LegacyView, type PlanTarget } from './context';
import { useRouter } from '../app/router/router';
import { ContentView } from './content/ContentView';
import { OverviewView } from './overview/OverviewView';
import { PlanDrawer } from './calendar/PlanDrawer';
import { CalendarView } from './calendar/CalendarView';
import { InsightsView } from './insights/InsightsView';
import { PostDrawer } from './PostDrawer';

/**
 * Runs the existing publishing calendar inside the new shell, unchanged:
 * month/week/day/agenda/board, drag to reschedule, CSV/XLSX import, ICS/CSV
 * export and the plan drawer all read and write the live `plans` table.
 * See MIGRATION_PLAN.md for its replacement path.
 */
export function LegacyCalendar() {
  return (
    <LegacyProvider>
      <CalendarView />
    </LegacyProvider>
  );
}

/** The monthly comparison, heatmap and account breakdown from the original dashboard, on the live synced posts. */
export function LegacyInsights() {
  return (
    <LegacyProvider>
      <InsightsView />
    </LegacyProvider>
  );
}

/** Every published post on every connected page and account, with its numbers, filters, search and CSV export. */
export function LegacyContent() {
  return (
    <LegacyProvider>
      <ContentView />
    </LegacyProvider>
  );
}

/** The original overview: this period against the last, trend, platform split, upcoming plans and best posts. */
export function LegacyOverview() {
  return (
    <LegacyProvider>
      <OverviewView />
    </LegacyProvider>
  );
}

function LegacyProvider({ children }: { children: ReactNode }) {
  const { store } = useLiveData();
  const { navigate } = useRouter();
  const now = useNow();
  const [filters, setFilterState] = useState<Filters>({ platform: 'all', account: 'all', period: 30 });
  const [planTarget, setPlanTarget] = useState<PlanTarget | null>(null);
  const [planOpenId, setPlanOpenId] = useState(0);
  const [post, setPost] = useState<Post | null>(null);

  const setFilters = useCallback((patch: Partial<Filters>) => setFilterState((current) => ({ ...current, ...patch })), []);
  const openPlan = useCallback((target: PlanTarget) => {
    setPlanOpenId((id) => id + 1);
    setPlanTarget(target);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({ store, data: store.data, now, todayNum: todayNumber(now), filters, setFilters, openPlan, openPost: setPost, go: (view: LegacyView) => navigate(LEGACY_PATHS[view]) }),
    [store, now, filters, setFilters, openPlan, navigate],
  );

  return (
    <AppContext.Provider value={value}>
      <div className="lg" lang="ar" dir="rtl">
        {children}
      </div>
      <PlanDrawer target={planTarget} openId={planOpenId} onClose={() => setPlanTarget(null)} />
      <PostDrawer post={post} onClose={() => setPost(null)} />
    </AppContext.Provider>
  );
}
