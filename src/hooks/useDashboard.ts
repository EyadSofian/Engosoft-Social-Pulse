import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage, request } from '../lib/api';
import { EMPTY_DASHBOARD, normalize, patchPlanLocally } from '../lib/analytics';
import type { Alert, ApiDashboard, Dashboard, ImportResult, PlanInput, PlanPatch, SyncResult } from '../types';

const POLL_MS = 60_000;

export type Phase = 'loading' | 'ready' | 'offline';

export function useDashboard(onNewAlert: (alert: Alert) => void) {
  const [data, setData] = useState<Dashboard>(EMPTY_DASHBOARD);
  const [phase, setPhase] = useState<Phase>('loading');
  const [staleError, setStaleError] = useState('');
  const [syncing, setSyncing] = useState(false);

  const phaseRef = useRef(phase);
  const loaded = useRef(false);
  const seenAlerts = useRef<Set<string> | null>(null);
  const notify = useRef(onNewAlert);
  phaseRef.current = phase;
  notify.current = onNewAlert;

  const load = useCallback(async () => {
    try {
      const raw = await request<ApiDashboard>('/dashboard');
      const next = normalize(raw);
      const open = next.alerts.filter((alert) => !alert.dismissedAt);
      if (seenAlerts.current === null) seenAlerts.current = new Set(open.map((alert) => alert.id));
      else
        for (const alert of open) {
          if (seenAlerts.current.has(alert.id)) continue;
          seenAlerts.current.add(alert.id);
          notify.current(alert);
        }
      loaded.current = true;
      setData(next);
      setStaleError('');
      setPhase('ready');
    } catch (error) {
      if (loaded.current) setStaleError(errorMessage(error, 'تعذّر تحديث البيانات.'));
      else {
        setStaleError(errorMessage(error, 'تعذّر تحميل البيانات.'));
        setPhase('offline');
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && phaseRef.current === 'ready') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const call = useCallback(<T,>(path: string, init?: RequestInit) => request<T>(path, init), []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const { results } = await call<{ results: SyncResult[] }>('/sync', { method: 'POST' });
      await load();
      return results;
    } finally {
      setSyncing(false);
    }
  }, [call, load]);

  const savePlan = useCallback(
    (plan: PlanInput) =>
      call<unknown>('/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan) }),
    [call],
  );

  /** Optimistic: the calendar moves the post at once; the reload settles the server's state either way. */
  const patchPlan = useCallback(
    async (id: string, patch: PlanPatch) => {
      setData((current) => ({
        ...current,
        plans: current.plans.map((plan) => (plan.id === id ? patchPlanLocally(plan, patch, Date.now()) : plan)),
      }));
      try {
        await call<unknown>(`/plans/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      } finally {
        void load();
      }
    },
    [call, load],
  );

  const deletePlan = useCallback((id: string) => call<{ deleted: boolean }>(`/plans/${id}`, { method: 'DELETE' }), [call]);

  const dismissAlert = useCallback(
    async (id: string) => {
      await call<{ dismissed: boolean }>(`/alerts/${id}/dismiss`, { method: 'POST' });
      await load();
    },
    [call, load],
  );

  const importCalendar = useCallback(
    async (file: File) => {
      const extension = file.name.toLowerCase().match(/\.(csv|xlsx)$/)?.[1];
      if (!extension) throw new ApiError('ارفع ملف CSV أو XLSX.', 400);
      // The server only reads the extension, and header values cannot carry Arabic file names.
      const result = await call<ImportResult>('/calendar/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': `calendar.${extension}` },
        body: await file.arrayBuffer(),
      });
      await load();
      return result;
    },
    [call, load],
  );

  return {
    data,
    phase,
    staleError,
    syncing,
    reload: load,
    sync,
    savePlan,
    patchPlan,
    deletePlan,
    dismissAlert,
    importCalendar,
  };
}

export type DashboardStore = ReturnType<typeof useDashboard>;
