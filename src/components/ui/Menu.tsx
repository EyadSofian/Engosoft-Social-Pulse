import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Shown instead of running when disabled, e.g. which permission is missing. */
  reason?: string;
  onSelect: () => void;
}

/** A button that opens a list of actions. Arrow keys move, Escape closes, focus returns to the trigger. */
export function Menu({ trigger, items, label, align = 'end', header }: { trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu'; 'aria-controls': string; id: string }) => ReactNode; items: MenuItem[]; label: string; align?: 'start' | 'end'; header?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus());
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    root.current?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-trigger`)}`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      entries[(index + step + entries.length) % entries.length]?.focus();
    } else if (event.key === 'Tab') setOpen(false);
  };

  return (
    <div className="ui-menu" ref={root}>
      {trigger({ onClick: () => setOpen((value) => !value), 'aria-expanded': open, 'aria-haspopup': 'menu', 'aria-controls': `${id}-list`, id: `${id}-trigger` })}
      {open && (
        <div className={`ui-menu__list ui-menu__list--${align}`} role="menu" id={`${id}-list`} aria-label={label} ref={list} onKeyDown={onKeyDown}>
          {header && <div className="ui-menu__header">{header}</div>}
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`ui-menu__item${item.danger ? ' ui-menu__item--danger' : ''}`}
              aria-disabled={item.disabled || undefined}
              title={item.disabled ? item.reason : undefined}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              <span className="ui-menu__label">
                {item.label}
                {(item.hint || (item.disabled && item.reason)) && <small>{item.disabled ? item.reason : item.hint}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
