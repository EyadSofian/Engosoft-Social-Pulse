import { useEffect, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, X } from 'lucide-react';
import { useRouter } from '../app/router/router';
import { useI18n } from '../i18n/I18nProvider';
import { api } from '../lib/api';

export interface ServerNotification { id: string; kind: string; title: string; body: string; link: string; createdAt: string; readAt: string | null }

/** One poller for the whole app: the bell, the drawer and the popups read the same list. */
let items: ServerNotification[] = [];
let popups: ServerNotification[] = [];
let started = false;
const seen = new Set<string>();
/** Ids already shown as a popup this browser session, so a reload does not pop the same item again. */
const POPPED_KEY = 'sp-popped-notifications';
const popped = new Set<string>((() => { try { return JSON.parse(sessionStorage.getItem(POPPED_KEY) || '[]') as string[]; } catch { return []; } })());
const remember = (ids: string[]) => { ids.forEach((id) => popped.add(id)); try { sessionStorage.setItem(POPPED_KEY, JSON.stringify([...popped].slice(-200))); } catch { /* private mode */ } };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
let snapshot = { items, popups };

async function poll(first: boolean) {
  try {
    const result = await api<{ items: ServerNotification[] }>('/api/notifications');
    const fresh = result.items.filter((item) => !item.readAt && !seen.has(item.id));
    result.items.forEach((item) => seen.add(item.id));
    items = result.items;
    // On first load only today's unread items pop up; after that, anything new.
    const pop = (first ? fresh.filter((item) => Date.now() - Date.parse(item.createdAt) < 15 * 60_000) : fresh).filter((item) => !popped.has(item.id));
    if (pop.length) { popups = [...pop.slice(0, 3), ...popups].slice(0, 3); remember(pop.map((item) => item.id)); }
    snapshot = { items, popups };
    emit();
  } catch {
    /* Signed out or offline: try again on the next tick. */
  }
}

function start() {
  if (started) return;
  started = true;
  void poll(true);
  setInterval(() => void poll(false), 20_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void poll(false));
}

export function useServerNotifications() {
  useEffect(start, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

export async function markServerRead(ids?: string[]) {
  const now = new Date().toISOString();
  items = items.map((item) => (!ids || ids.includes(item.id) ? { ...item, readAt: item.readAt ?? now } : item));
  snapshot = { items, popups };
  emit();
  await api('/api/notifications/read', { body: ids ? { ids } : {} }).catch(() => {});
}

function dismissPopup(id: string) {
  popups = popups.filter((item) => item.id !== id);
  snapshot = { items, popups };
  emit();
}

/** New post or review result: a card slides in at the corner, opens the post on click, leaves after a while. */
export function NotificationPopups() {
  const { popups: visible } = useServerNotifications();
  const { navigate } = useRouter();
  const { t } = useI18n();
  useEffect(() => {
    if (!visible.length) return;
    const timer = setTimeout(() => dismissPopup(visible[visible.length - 1].id), 9000);
    return () => clearTimeout(timer);
  }, [visible]);
  return (
    <div className="np-stack" aria-live="polite">
      <AnimatePresence initial={false}>
        {visible.map((item) => (
          <motion.div
            key={item.id}
            layout
            className="np-card"
            initial={{ opacity: 0, y: -18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <span className="np-card__icon"><BellRing size={17} /></span>
            <button type="button" className="np-card__main" onClick={() => { dismissPopup(item.id); void markServerRead([item.id]); navigate(item.link || '/content'); }}>
              <b dir="auto">{item.title}</b>
              <span dir="auto">{item.body}</span>
            </button>
            <button type="button" className="np-card__close" onClick={() => dismissPopup(item.id)} aria-label={t('Dismiss', 'إغلاق')}><X size={14} /></button>
            <span className="np-card__timer" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
