import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from '../../app/router/router';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md';

interface Common {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  /** Icon after the label, e.g. a chevron. */
  trailing?: ReactNode;
  busy?: boolean;
}

const cls = (variant: ButtonVariant, size: ButtonSize, extra?: string) => `ui-btn ui-btn--${variant} ui-btn--${size}${extra ? ` ${extra}` : ''}`;

export function Button({ variant = 'secondary', size = 'md', icon, trailing, busy, className, children, disabled, type = 'button', ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cls(variant, size, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="ui-btn__spinner" aria-hidden /> : icon}
      {children != null && <span className="ui-btn__label">{children}</span>}
      {trailing}
    </button>
  );
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, trailing, className, children, to, ...rest }: Common & { to: string; className?: string; children?: ReactNode; title?: string }) {
  return (
    <Link to={to} className={cls(variant, size, className)} {...rest}>
      {icon}
      {children != null && <span className="ui-btn__label">{children}</span>}
      {trailing}
    </Link>
  );
}

/** Icon-only control. `label` is the accessible name and the tooltip. */
export function IconButton({ label, children, className, size = 'md', variant = 'ghost', type = 'button', ...rest }: { label: string; size?: ButtonSize; variant?: 'ghost' | 'secondary' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`ui-icon-btn ui-icon-btn--${size} ui-icon-btn--${variant}${className ? ` ${className}` : ''}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
