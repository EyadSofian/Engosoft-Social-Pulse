import { useCallback, useMemo, useState } from 'react';
import { useLiveData } from '../app/providers/LiveDataProvider';
import { useNow } from '../hooks/ui';
import { todayNumber, type Filters } from '../lib/analytics';
import type { Post } from '../types';
import { AppContext, type AppContextValue, type PlanTarget } from './context';
import { PlanDrawer } from './calendar/PlanDrawer';
import { CalendarView } from './calendar/CalendarView';
import { PostDrawer } from './PostDrawer';

/**
 * Runs the existing publishing calendar inside the new shell, unchanged:
 * month/week/day/agenda/board, drag to reschedule, CSV/XLSX import, ICS/CSV
 * export and the plan drawer all read and write the live `plans` table.
 * See MIGRATION_PLAN.md for its replacement path.
 */
export function LegacyCalendar() {
  const { store } = useLiveData();
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
    () => ({ store, data: store.data, now, todayNum: todayNumber(now), filters, setFilters, openPlan, openPost: setPost }),
    [store, now, filters, setFilters, openPlan],
  );

  return (
    <AppContext.Provider value={value}>
      <div className="lg" lang="ar" dir="rtl">
        <CalendarView />
      </div>
      <PlanDrawer target={planTarget} openId={planOpenId} onClose={() => setPlanTarget(null)} />
      <PostDrawer post={post} onClose={() => setPost(null)} />
    </AppContext.Provider>
  );
}
