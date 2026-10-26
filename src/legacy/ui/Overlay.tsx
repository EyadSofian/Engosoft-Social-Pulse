import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { legacyLayer } from '../layer';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useMediaQuery, useOverlay } from '../../hooks/ui';
import { IconButton } from './Button';

const SHEET_SPRING = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 } as const;

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
}

/** A floating glass sheet on the inline-end edge; a bottom sheet on phones. */
export function Drawer(props: DrawerProps) {
  return createPortal(<AnimatePresence>{props.open && <DrawerSheet key="sheet" {...props} />}</AnimatePresence>, legacyLayer());
}

function DrawerSheet({ onClose, title, subtitle, icon, footer, width = 540, children }: DrawerProps) {
  const ref = useOverlay(true, onClose);
  const phone = useMediaQuery('(max-width: 640px)');
  const hidden = phone ? { y: 48, opacity: 0 } : { x: -48, opacity: 0 };
  return (
    <div className="overlay overlay--drawer">
      <motion.div
        className="overlay__scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={onClose}
      />
      <motion.aside
        ref={ref}
        data-overlay
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="drawer glass glass--float"
        style={{ '--drawer-w': `${width}px` } as CSSProperties}
        initial={hidden}
        animate={{ x: 0, y: 0, opacity: 1 }}
        exit={{ ...hidden, transition: { duration: 0.18 } }}
        transition={SHEET_SPRING}
      >
        <header className="drawer__head">
          {icon}
          <div className="drawer__titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="إغلاق" tip="none" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__foot">{footer}</footer>}
      </motion.aside>
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal(props: ModalProps) {
  return createPortal(<AnimatePresence>{props.open && <ModalCard key="modal" {...props} />}</AnimatePresence>, legacyLayer());
}

function ModalCard({ onClose, title, icon, footer, children }: ModalProps) {
  const ref = useOverlay(true, onClose);
  return (
    <div className="overlay overlay--modal">
      <motion.div
        className="overlay__scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        ref={ref}
        data-overlay
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="modal glass glass--float"
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.16 } }}
        transition={SHEET_SPRING}
      >
        <header className="modal__head">
          {icon}
          <h2>{title}</h2>
          <IconButton label="إغلاق" tip="none" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </motion.div>
    </div>
  );
}
