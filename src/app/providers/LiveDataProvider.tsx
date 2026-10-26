import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useToast } from '../../components/feedback/Toast';
import type { ContentItem } from '../../domain/content';
import { useDashboard, type DashboardStore } from '../../hooks/useDashboard';
import { useI18n } from '../../i18n/I18nProvider';
import { errorMessage } from '../../lib/api';
import { planToContentItem } from '../../services/adapters/live';
import type { Alert, Platform } from '../../types';
import { channelName } from '../../i18n/labels';

export interface LiveData {
  store: DashboardStore;
  /** Calendar plans from SQLite, shown in Content as read-only items. */
  liveContent: ContentItem[];
  /** Newest connector check across all sources (ms), 0 when none ran. */
  lastSync: number;
  runSync: () => Promise<void>;
}

const LiveDataContext = createContext<LiveData | null>(null);

/** Server alert text names platforms by id ("على facebook"). */
const readable = (message: string) =>
  message.replace(/على (facebook|instagram|tiktok|snapchat|website)/g, (_, id: Platform) => `على ${channelName[id]}`);

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { t } = useI18n();

  const onNewAlert = useCallback(
    (alert: Alert) => {
      const message = readable(alert.message);
      toast.alert(alert.kind === 'missed' ? t('Publishing not confirmed', 'نشر غير مؤكد') : t('Post due soon', 'منشور قريب'), message);
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Social Pulse', { body: message, tag: alert.id, lang: 'ar', dir: 'rtl' });
        } catch {
          /* Some browsers only allow notifications from a service worker. */
        }
      }
    },
    [toast, t],
  );

  const store = useDashboard(onNewAlert);
  const { data, sync } = store;

  const runSync = useCallback(async () => {
    try {
      const results = await sync();
      const connected = results.filter((item) => item.status === 'connected').length;
      toast.success(t('Sync finished', 'اكتملت المزامنة'), t(`${connected} of ${results.length} sources connected`, `${connected} من ${results.length} مصادر متصلة`));
    } catch (error) {
      toast.error(t('Sync failed', 'فشلت المزامنة'), errorMessage(error, t('Could not sync sources.', 'تعذّر مزامنة المصادر.')));
    }
  }, [sync, toast, t]);

  const value = useMemo<LiveData>(
    () => ({
      store,
      liveContent: data.plans.map(planToContentItem),
      lastSync: data.connectors.reduce((latest, item) => Math.max(latest, item.checkedAt ? Date.parse(item.checkedAt) : 0), 0),
      runSync,
    }),
    [store, data, runSync],
  );

  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

export function useLiveData(): LiveData {
  const value = useContext(LiveDataContext);
  if (!value) throw new Error('useLiveData must be used inside LiveDataProvider.');
  return value;
}
