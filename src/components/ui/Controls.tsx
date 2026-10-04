import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { PLATFORMS, platformColor, platformName } from '../../lib/platforms';
import type { Platform } from '../../types';
import { PlatformIcon } from './Platform';

/**
 * Measures the active child of a container so one indicator can slide between options.
 * Positions are container-relative, so page scroll and sticky parents never disturb it.
 */
export function useSlidingIndicator<T extends HTMLElement>(activeKey: string | number) {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const active = container.querySelector<HTMLElement>('[data-active="true"]');
      setBox(active ? { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const child of container.children) observer.observe(child);
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [activeKey]);

  const style: CSSProperties = box
    ? { transform: `translate3d(${box.x}px, ${box.y}px, 0)`, width: box.w, height: box.h, opacity: 1 }
    : { opacity: 0 };
  return { ref, style, ready };
}

export interface Option<T> {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  iconOnly,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  label: string;
  size?: 'sm' | 'md';
  iconOnly?: boolean;
}) {
  const { ref, style, ready } = useSlidingIndicator<HTMLDivElement>(String(value));
  return (
    <div className={`seg seg--${size}`} role="group" aria-label={label} ref={ref}>
      <span className="seg__thumb" style={style} data-ready={ready} aria-hidden />
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className="seg__item"
          data-active={option.value === value}
          aria-pressed={option.value === value}
          aria-label={iconOnly ? option.label : undefined}
          title={iconOnly ? option.label : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {!iconOnly && <span>{option.label}</span>}
          {option.badge}
        </button>
      ))}
    </div>
  );
}

export function PlatformFilter({
  value,
  onChange,
  counts,
}: {
  value: Platform | 'all';
  onChange: (value: Platform | 'all') => void;
  counts?: Partial<Record<Platform, number>>;
}) {
  return (
    <div className="pfilter" role="group" aria-label="تصفية حسب المنصة">
      <button type="button" className="pchip" data-active={value === 'all'} aria-pressed={value === 'all'} onClick={() => onChange('all')}>
        <span>كل المنصات</span>
      </button>
      {PLATFORMS.map((platform) => (
        <button
          key={platform}
          type="button"
          className="pchip"
          data-active={value === platform}
          aria-pressed={value === platform}
          style={{ '--p': platformColor(platform) } as CSSProperties}
          onClick={() => onChange(value === platform ? 'all' : platform)}
        >
          <span className="pchip__icon">
            <PlatformIcon platform={platform} size={14} />
          </span>
          <span>{platformName[platform]}</span>
          {counts?.[platform] != null && <span className="pchip__count">{counts[platform]}</span>}
        </button>
      ))}
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`select${className ? ` ${className}` : ''}`}>
      <select {...rest}>{children}</select>
      <ChevronDown size={15} aria-hidden />
    </span>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="search">
      <Search size={16} aria-hidden />
      <input type="search" value={value} placeholder={placeholder} aria-label={label} onChange={(event) => onChange(event.target.value)} />
      {value && (
        <button type="button" className="search__clear" aria-label="مسح البحث" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field${wide ? ' field--wide' : ''}`} data-invalid={error ? true : undefined}>
      <span className="field__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

export const TextInput = (props: InputHTMLAttributes<HTMLInputElement>) => <input className="input" {...props} />;
