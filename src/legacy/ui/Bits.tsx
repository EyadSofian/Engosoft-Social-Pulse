import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock3,
  Hourglass,
  Minus,
  PlugZap,
  TriangleAlert,
} from 'lucide-react';
import { MISSING, num, signedPct } from '../../lib/format';
import { connectorLabel, stateLabel } from '../../lib/platforms';
import type { ConnectorStatus, PlanState, Platform } from '../../types';
import { PlatformIcon } from './Platform';

export function Logo({ size = 38 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <defs>
          <linearGradient id="logo-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c3aed" />
            <stop offset="0.55" stopColor="#e23a85" />
            <stop offset="1" stopColor="#f7913f" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="19" fill="url(#logo-fill)" />
        <path
          className="logo__pulse"
          d="M11 34h10l5-14 9 26 6-18 3 6h9"
          fill="none"
          stroke="#fff"
          strokeWidth="4.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
        />
      </svg>
    </span>
  );
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Staggered entrance for the blocks of a view; `i` sets the order. */
export function Reveal({ i = 0, className, children }: { i?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.03 + i * 0.06, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Counts from the previous value to the new one; text is written directly to skip re-renders. */
export function AnimatedNumber({ value, format = num }: { value: number | null; format?: (value: number) => string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const shown = useRef(0);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (value == null) {
      node.textContent = MISSING;
      shown.current = 0;
      return;
    }
    if (reduced || document.visibilityState !== 'visible' || shown.current === value) {
      node.textContent = format(value);
      shown.current = value;
      return;
    }
    const whole = Number.isInteger(value);
    node.textContent = format(shown.current);
    const controls = animate(shown.current, value, {
      duration: 0.95,
      ease: EASE,
      onUpdate: (latest) => {
        shown.current = latest;
        node.textContent = format(whole ? Math.round(latest) : latest);
      },
      onComplete: () => {
        shown.current = value;
        node.textContent = format(value);
      },
    });
    return () => controls.stop();
  }, [value, format, reduced]);

  return <span ref={ref} className="anum" />;
}

/** Signed change against a named period. Direction is carried by the arrow and sign, not colour alone. */
export function Delta({ value, goodWhenUp = true, label }: { value: number | null; goodWhenUp?: boolean; label: string }) {
  if (value == null) return <span className="delta delta--none">{label}</span>;
  const flat = Math.abs(value) < 0.05;
  const tone = flat ? 'flat' : value > 0 === goodWhenUp ? 'good' : 'bad';
  return (
    <span className={`delta delta--${tone}`}>
      <span className="delta__chip">
        {flat ? <Minus size={13} /> : value > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
        <b>{flat ? '0%' : signedPct(value)}</b>
      </span>
      <span className="delta__label">{label}</span>
    </span>
  );
}

const STATE_ICON: Record<PlanState, ReactNode> = {
  published: <CircleCheck size={13} />,
  upcoming: <Clock3 size={13} />,
  due: <Hourglass size={13} />,
  missed: <CircleAlert size={13} />,
  draft: <CircleDashed size={13} />,
  cancelled: <Ban size={13} />,
};

export function StatePill({ state, compact }: { state: PlanState; compact?: boolean }) {
  return (
    <span className={`pill pill--${state}`} title={compact ? stateLabel[state] : undefined}>
      {STATE_ICON[state]}
      {!compact && <span>{stateLabel[state]}</span>}
    </span>
  );
}

const CONNECTOR_ICON: Record<ConnectorStatus, ReactNode> = {
  connected: <CircleCheck size={13} />,
  error: <TriangleAlert size={13} />,
  needs_setup: <PlugZap size={13} />,
};

export function ConnectorPill({ status }: { status: ConnectorStatus }) {
  return (
    <span className={`pill pill--${status}`}>
      {CONNECTOR_ICON[status]}
      <span>{connectorLabel[status]}</span>
    </span>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={`skeleton${className ? ` ${className}` : ''}`} style={style} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  compact,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty${compact ? ' empty--compact' : ''}`}>
      <span className="empty__icon">{icon}</span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Post thumbnail; CDN links from the platforms expire, so a failed image falls back to the platform glyph. */
export function Thumb({ src, platform, className }: { src: string; platform: Platform; className?: string }) {
  const [failed, setFailed] = useState('');
  const classes = `thumb${className ? ` ${className}` : ''}`;
  if (!src || failed === src)
    return (
      <span className={`${classes} thumb--empty`} style={{ '--p': `var(--p-${platform})` } as CSSProperties}>
        <PlatformIcon platform={platform} size={18} />
      </span>
    );
  return (
    <span className={classes}>
      <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(src)} />
    </span>
  );
}

/** A meter: one ratio against its limit, on a track of the same hue. */
export function Ring({
  value,
  size = 74,
  stroke = 7,
  tone = 'accent',
  children,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  tone?: 'accent' | 'ok';
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const ratio = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <span className={`ring ring--${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring__label">{children}</span>
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  className,
  flush,
  children,
}: {
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`glass panel${flush ? ' panel--flush' : ''}${className ? ` ${className}` : ''}`} data-spot>
      {(title || actions) && (
        <header className="panel__head">
          <div className="panel__titles">
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function ViewHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="view-head">
      <div className="view-head__titles">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="view-head__actions">{children}</div>}
    </header>
  );
}
