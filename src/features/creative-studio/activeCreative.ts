import { useSyncExternalStore } from 'react';
import type { CreativePlatform } from './platforms';

/**
 * The design run in progress (or last finished) for this browser. Generation runs on the server, so leaving the
 * Create page must not lose it: the page restores it on return and the header shows it from anywhere.
 */
export interface ActiveCreative { jobId: string; requestId: string; prompt: string; platforms: CreativePlatform[]; startedAt: string; status: 'running' | 'done' | 'failed' }

const KEY = 'mobde3-active-creative';
const listeners = new Set<() => void>();
let current: ActiveCreative | null = read();

function read(): ActiveCreative | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null') as ActiveCreative | null;
    // Older than a day: the result is still in the content board if it was saved; do not reopen it here.
    return value && Date.now() - Date.parse(value.startedAt) < 86_400_000 ? value : null;
  } catch {
    return null;
  }
}

function write(next: ActiveCreative | null) {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* Storage blocked: the run still lives on the server and in notifications. */
  }
  listeners.forEach((listener) => listener());
}

export const getActiveCreative = () => current;
export const setActiveCreative = (value: ActiveCreative) => write(value);
export const updateActiveCreative = (patch: Partial<ActiveCreative>) => current && write({ ...current, ...patch });
export const clearActiveCreative = () => write(null);

export function useActiveCreative() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
