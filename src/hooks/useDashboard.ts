import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage, request } from '../lib/api';
import { EMPTY_DASHBOARD, normalize } from '../lib/analytics';
import type { Alert, ApiDashboard, Dashboard, ImportResult, PlanInput, SyncResult } from '../types';

const SECRET_KEY = 'social-pulse-secret';
const POLL_MS = 60_000;

function readSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeSecret(value: string) {
  try {
    if (value) sessionStorage.setItem(SECRET_KEY, value);
    else sessionStorage.removeItem(SECRET_KEY);
  } catch {
    /* Storage can be blocked; the secret then lives for this page load only. */
  }
}

export type Phase = 'loading' | 'ready' | 'locked' | 'offline';

export function useDashboard(onNewAlert: (alert: Alert) => void) {
  const [secret, setSecret] = useState(readSecret);
  const [data, setData] = useState<Dashboard>(EMPTY_DASHBOARD);
  const [phase, setPhase] = useState<Phase>('loading');
  const [authError, setAuthError] = useState('');
  const [staleError, setStaleError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const secretRef = useRef(secret);
  const phaseRef = useRef(phase);
  const loaded = useRef(false);
  const seenAlerts = useRef<Set<string> | null>(null);
  const notify = useRef(onNewAlert);
  secretRef.current = secret;
  phaseRef.current = phase;
  notify.current = onNewAlert;

  const load = useCallback(async () => {
    const used = secretRef.current;
    try {
      const raw = await request<ApiDashboard>('/dashboard', used);
      if (used !== secretRef.current) return;
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
      setAuthError('');
      setPhase('ready');
    } catch (error) {
      if (used !== secretRef.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setAuthError(used ? 'رمز الدخول غير صحيح.' : '');
        writeSecret('');
        setPhase('locked');
      } else if (loaded.current) setStaleError(errorMessage(error, 'تعذّر تحديث البيانات.'));
      else {
        setStaleError(errorMessage(error, 'تعذّر تحميل البيانات.'));
        setPhase('offline');
      }
    } finally {
      if (used === secretRef.current) setVerifying(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (phaseRef.current !== 'locked' && document.visibilityState === 'visible') void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && phaseRef.current === 'ready') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [secret, load]);

  /** The gate stays on screen while the new secret is checked. */
  const unlock = useCallback(
    (value: string) => {
      writeSecret(value);
      setAuthError('');
      setVerifying(true);
      if (value === secretRef.current) void load();
      else setSecret(value);
    },
    [load],
  );

  const lock = useCallback(() => {
    writeSecret('');
    loaded.current = false;
    seenAlerts.current = null;
    setSecret('');
    setData(EMPTY_DASHBOARD);
    setAuthError('');
    setPhase('locked');
  }, []);

  const call = useCallback(
    <T,>(path: string, init?: RequestInit) => request<T>(path, secretRef.current, init),
    [],
  );

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
    authError,
    staleError,
    syncing,
    verifying,
    hasSecret: Boolean(secret),
    reload: load,
    unlock,
    lock,
    sync,
    savePlan,
    deletePlan,
    dismissAlert,
    importCalendar,
  };
}

export type DashboardStore = ReturnType<typeof useDashboard>;
