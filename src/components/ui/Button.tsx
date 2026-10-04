import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'glass' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Common {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  busy?: boolean;
}

const classes = (variant: Variant, size: Size, extra?: string) => `btn btn--${variant} btn--${size}${extra ? ` ${extra}` : ''}`;

export function Button({
  variant = 'glass',
  size = 'md',
  icon,
  busy,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={classes(variant, size, className)} disabled={disabled || busy} data-busy={busy || undefined} {...rest}>
      {icon && <span className="btn__icon">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export function LinkButton({
  variant = 'glass',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={classes(variant, size, className)} {...rest}>
      {icon && <span className="btn__icon">{icon}</span>}
      <span>{children}</span>
    </a>
  );
}

export function IconButton({
  label,
  children,
  className,
  tone,
  tip = 'center',
  type = 'button',
  ...rest
}: { label: string; tone?: 'accent' | 'danger'; tip?: 'center' | 'start' | 'end' | 'none' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`icon-btn${className ? ` ${className}` : ''}`}
      aria-label={label}
      data-tip={tip === 'none' ? undefined : label}
      data-tip-align={tip}
      data-tone={tone}
      {...rest}
    >
      {children}
    </button>
  );
}
