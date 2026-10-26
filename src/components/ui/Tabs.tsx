import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
}

/** Roving-focus keys for a horizontal set; Left/Right follow the reading direction. */
function useArrowKeys<T extends string>(items: TabItem<T>[], value: T, onChange: (value: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const rtl = document.documentElement.dir === 'rtl';
    const index = items.findIndex((item) => item.value === value);
    let next = -1;
    if (event.key === 'ArrowRight') next = rtl ? index - 1 : index + 1;
    else if (event.key === 'ArrowLeft') next = rtl ? index + 1 : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    next = (next + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

/** Page-level tabs: an underline set that switches sections of one page. */
export function Tabs<T extends string>({ items, value, onChange, label }: { items: TabItem<T>[]; value: T; onChange: (value: T) => void; label: string }) {
  const { refs, onKeyDown } = useArrowKeys(items, value, onChange);
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className="ui-tabs__tab"
            onClick={() => onChange(item.value)}
            onKeyDown={onKeyDown}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.count != null && <span className="ui-tabs__count u-tnum">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Compact switch between views of the same data (Table / Cards / Board). */
export function Segmented<T extends string>({ items, value, onChange, label, iconOnly }: { items: TabItem<T>[]; value: T; onChange: (value: T) => void; label: string; iconOnly?: boolean }) {
  const { refs, onKeyDown } = useArrowKeys(items, value, onChange);
  return (
    <div className="ui-segmented" role="radiogroup" aria-label={label}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className="ui-segmented__item"
            onClick={() => onChange(item.value)}
            onKeyDown={onKeyDown}
            title={iconOnly && typeof item.label === 'string' ? item.label : undefined}
            aria-label={iconOnly && typeof item.label === 'string' ? item.label : undefined}
          >
            {item.icon}
            {!iconOnly && <span>{item.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
