import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, CircleAlert, CircleCheck, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info' | 'alert';

interface ToastItem {
  id: number;
  kind: Kind;
  title: string;
  text?: string;
  action?: { label: string; run: () => void };
}

export interface ToastApi {
  success: (title: string, text?: string, action?: ToastItem['action']) => void;
  error: (title: string, text?: string) => void;
  info: (title: string, text?: string) => void;
  alert: (title: string, text: string, action?: ToastItem['action']) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const ICONS: Record<Kind, ReactNode> = {
  success: <CircleCheck size={17} />,
  error: <CircleAlert size={17} />,
  info: <Info size={17} />,
  alert: <BellRing size={17} />,
};
const LIFETIME: Record<Kind, number> = { success: 4200, info: 4800, error: 7500, alert: 9000 };

/** One toast system for the whole app, the legacy calendar included. */
export function ToastProvider({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((item) => item.id !== id)), []);
  const push = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { ...item, id }]);
      // An undo button needs time to be reached.
      window.setTimeout(() => dismiss(id), item.action ? Math.max(LIFETIME[item.kind], 8000) : LIFETIME[item.kind]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, text, action) => push({ kind: 'success', title, text, action }),
      error: (title, text) => push({ kind: 'error', title, text }),
      info: (title, text) => push({ kind: 'info', title, text }),
      alert: (title, text, action) => push({ kind: 'alert', title, text, action }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="ui-toasts" role="region" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                className={`ui-toast ui-toast--${item.kind}`}
                role={item.kind === 'error' ? 'alert' : 'status'}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="ui-toast__icon">{ICONS[item.kind]}</span>
                <div className="ui-toast__text">
                  <b>{item.title}</b>
                  {item.text && <span>{item.text}</span>}
                </div>
                {item.action && (
                  <button
                    type="button"
                    className="ui-toast__action"
                    onClick={() => {
                      item.action?.run();
                      dismiss(item.id);
                    }}
                  >
                    {item.action.label}
                  </button>
                )}
                <button type="button" className="ui-toast__close" aria-label={closeLabel} onClick={() => dismiss(item.id)}>
                  <X size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>.');
  return api;
}
