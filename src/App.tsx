import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { AlertsDrawer, openAlertItems } from './components/shell/AlertsDrawer';
import { Aurora, Dock, LoadingScreen, NAV, OfflineScreen, StaleBanner, TopNav } from './components/shell/Shell';
import { ToastProvider, useToast } from './components/ui/Toast';
import { AppContext, type AppContextValue, type PlanTarget } from './context';
import { PlanDrawer } from './features/calendar/PlanDrawer';
import { CalendarView } from './features/calendar/CalendarView';
import { ConnectionsView } from './features/connections/ConnectionsView';
import { ContentView } from './features/content/ContentView';
import { PostDrawer } from './features/content/PostDrawer';
import { InsightsView } from './features/insights/InsightsView';
import { OverviewView } from './features/overview/OverviewView';
import { useDashboard } from './hooks/useDashboard';
import { useNow, useRoute, useSpotlight, useTheme, type Route } from './hooks/ui';
import { todayNumber, type Filters } from './lib/analytics';
import { errorMessage } from './lib/api';
import { num, parseTimestamp } from './lib/format';
import { platformName } from './lib/platforms';
import type { Alert, Platform, Post } from './types';

const VIEWS: Record<Route, () => JSX.Element> = {
  overview: OverviewView,
  calendar: CalendarView,
  content: ContentView,
  insights: InsightsView,
  connections: ConnectionsView,
};

/** Server alert text names platforms by id ("على facebook"); show the display name instead. */
const readable = (message: string) =>
  message.replace(/على (facebook|instagram|tiktok|snapchat|website)/g, (_, id: Platform) => `على ${platformName[id]}`);

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <Root />
      </ToastProvider>
    </MotionConfig>
  );
}

function Root() {
  const toast = useToast();
  const { route, go } = useRoute();
  const { theme, toggle } = useTheme();
  const now = useNow();
  useSpotlight();

  const [filters, setFilterState] = useState<Filters>({ platform: 'all', account: 'all', period: 30 });
  const [planTarget, setPlanTarget] = useState<PlanTarget | null>(null);
  const [planOpenId, setPlanOpenId] = useState(0);
  const [post, setPost] = useState<Post | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const onNewAlert = useCallback(
    (alert: Alert) => {
      const message = readable(alert.message);
      toast.alert(alert.kind === 'missed' ? 'لم يتأكد نشر بوست' : 'بوست قريب', message, { label: 'عرض', run: () => setAlertsOpen(true) });
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Social Pulse', { body: message, tag: alert.id, lang: 'ar', dir: 'rtl' });
        } catch {
          /* Some browsers only allow notifications from a service worker. */
        }
      }
    },
    [toast],
  );

  const store = useDashboard(onNewAlert);
  const { data, sync } = store;
  const todayNum = todayNumber(now);

  const setFilters = useCallback((patch: Partial<Filters>) => setFilterState((current) => ({ ...current, ...patch })), []);
  const openPlan = useCallback((target: PlanTarget) => {
    setPlanOpenId((id) => id + 1);
    setPlanTarget(target);
  }, []);
  const openAlerts = useCallback(() => setAlertsOpen(true), []);

  const runSync = useCallback(async () => {
    try {
      const results = await sync();
      const connected = results.filter((item) => item.status === 'connected').length;
      const posts = results.reduce((sum, item) => sum + item.postCount, 0);
      toast.success('اكتملت المزامنة', `${connected} من ${results.length} مصادر متصلة · ${num(posts)} بوست محدَّث`);
    } catch (error) {
      toast.error('فشلت المزامنة', errorMessage(error, 'تعذّر مزامنة المصادر.'));
    }
  }, [sync, toast]);

  const alertItems = useMemo(() => openAlertItems(data, now), [data, now]);
  const attention = useMemo(
    () => data.plans.filter((plan) => plan.computedState === 'missed' || plan.computedState === 'due').length,
    [data.plans],
  );
  const lastSync = useMemo(
    () => data.connectors.reduce((latest, item) => Math.max(latest, item.checkedAt ? parseTimestamp(item.checkedAt) : 0), 0),
    [data.connectors],
  );
  const connectorIssue = data.connectors.some((item) => item.status === 'error');

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = `${NAV.find((item) => item.id === route)?.label ?? ''} · Social Pulse`;
  }, [route]);

  const context = useMemo<AppContextValue>(
    () => ({ store, data, now, todayNum, filters, setFilters, route, go, openPlan, openPost: setPost, openAlerts, runSync }),
    [store, data, now, todayNum, filters, setFilters, route, go, openPlan, openAlerts, runSync],
  );

  if (store.phase === 'offline')
    return (
      <>
        <Aurora />
        <OfflineScreen message={store.staleError} onRetry={() => void store.reload()} />
      </>
    );
  if (store.phase === 'loading')
    return (
      <>
        <Aurora />
        <LoadingScreen />
      </>
    );

  const View = VIEWS[route];
  return (
    <AppContext.Provider value={context}>
      <Aurora />
      <TopNav attention={attention} connectorIssue={connectorIssue} alerts={alertItems.length} lastSync={lastSync} theme={theme} onToggleTheme={toggle} />
      <main className="page">
        {store.staleError && (
          <StaleBanner
            message={store.staleError}
            action={
              <button type="button" className="link" onClick={() => void store.reload()}>
                أعد المحاولة
              </button>
            }
          />
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={route}
            className="view"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <View />
          </motion.div>
        </AnimatePresence>
      </main>
      <Dock attention={attention} connectorIssue={connectorIssue} />

      <PlanDrawer target={planTarget} openId={planOpenId} onClose={() => setPlanTarget(null)} />
      <PostDrawer post={post} onClose={() => setPost(null)} />
      <AlertsDrawer open={alertsOpen} onClose={() => setAlertsOpen(false)} items={alertItems} />
    </AppContext.Provider>
  );
}
