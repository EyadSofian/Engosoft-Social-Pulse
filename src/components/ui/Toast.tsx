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

interface ToastApi {
  success: (title: string, text?: string) => void;
  error: (title: string, text?: string) => void;
  info: (title: string, text?: string) => void;
  alert: (title: string, text: string, action?: ToastItem['action']) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const ICONS: Record<Kind, ReactNode> = {
  success: <CircleCheck size={18} />,
  error: <CircleAlert size={18} />,
  info: <Info size={18} />,
  alert: <BellRing size={18} />,
};
const LIFETIME: Record<Kind, number> = { success: 4200, info: 4800, error: 7500, alert: 9000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((item) => item.id !== id)), []);
  const push = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { ...item, id }]);
      window.setTimeout(() => dismiss(id), LIFETIME[item.kind]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, text) => push({ kind: 'success', title, text }),
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
        <div className="toasts" role="region" aria-label="الإشعارات" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                className={`toast toast--${item.kind} glass glass--float`}
                role={item.kind === 'error' ? 'alert' : 'status'}
                initial={{ opacity: 0, y: 26, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              >
                <span className="toast__icon">{ICONS[item.kind]}</span>
                <div className="toast__text">
                  <b>{item.title}</b>
                  {item.text && <span>{item.text}</span>}
                </div>
                {item.action && (
                  <button
                    type="button"
                    className="toast__action"
                    onClick={() => {
                      item.action?.run();
                      dismiss(item.id);
                    }}
                  >
                    {item.action.label}
                  </button>
                )}
                <button type="button" className="toast__close" aria-label="إغلاق الإشعار" onClick={() => dismiss(item.id)}>
                  <X size={15} />
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
