import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useMediaQuery, useOverlay } from '../../hooks/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { IconButton } from '../ui/Button';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Accessible name when the title is not plain text. */
  label: string;
  subtitle?: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
  children: ReactNode;
}

/** A side sheet on the inline-end edge (a bottom sheet on phones). 240ms in, faster out. */
export function Drawer(props: DrawerProps) {
  return createPortal(<AnimatePresence>{props.open && <DrawerSheet key="drawer" {...props} />}</AnimatePresence>, document.body);
}

function DrawerSheet({ onClose, title, label, subtitle, headerExtra, footer, width = 'md', children }: DrawerProps) {
  const ref = useOverlay(true, onClose);
  const { t, dir } = useI18n();
  const phone = useMediaQuery('(max-width: 640px)');
  const titleId = useId();
  const offset = phone ? { y: 32, x: 0 } : { x: dir === 'rtl' ? -32 : 32, y: 0 };
  return (
    <div className="ui-overlay ui-overlay--drawer">
      <motion.div className="ui-overlay__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
      <motion.aside
        ref={ref}
        data-overlay
        role="dialog"
        aria-modal="true"
        aria-labelledby={typeof title === 'string' ? titleId : undefined}
        aria-label={typeof title === 'string' ? undefined : label}
        tabIndex={-1}
        className={`ui-drawer ui-drawer--${width}`}
        initial={{ ...offset, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        exit={{ ...offset, opacity: 0, transition: { duration: 0.16 } }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="ui-drawer__head">
          <div className="ui-drawer__titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <div className="ui-drawer__subtitle">{subtitle}</div>}
          </div>
          {headerExtra}
          <IconButton label={t('Close', 'إغلاق')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="ui-drawer__body">{children}</div>
        {footer && <footer className="ui-drawer__foot">{footer}</footer>}
      </motion.aside>
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

export function Dialog(props: DialogProps) {
  return createPortal(<AnimatePresence>{props.open && <DialogBox key="dialog" {...props} />}</AnimatePresence>, document.body);
}

function DialogBox({ onClose, title, description, footer, size = 'md', children }: DialogProps) {
  const ref = useOverlay(true, onClose);
  const { t } = useI18n();
  const titleId = useId();
  const descId = useId();
  return (
    <div className="ui-overlay ui-overlay--dialog">
      <motion.div className="ui-overlay__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} />
      <motion.div
        ref={ref}
        data-overlay
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`ui-dialog ui-dialog--${size}`}
        initial={{ opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="ui-dialog__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && (
              <p id={descId} className="ui-dialog__desc">
                {description}
              </p>
            )}
          </div>
          <IconButton label={t('Close', 'إغلاق')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        {children && <div className="ui-dialog__body">{children}</div>}
        {footer && <footer className="ui-dialog__foot">{footer}</footer>}
      </motion.div>
    </div>
  );
}
