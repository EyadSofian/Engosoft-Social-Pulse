import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

/** Label, control, hint and error, wired for screen readers. */
export function Field({ label, hint, error, required, children, wide }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; wide?: boolean; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`ui-field${wide ? ' ui-field--wide' : ''}`}>
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="ui-field__req" aria-hidden>
            *
          </span>
        )}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => <input className={`ui-input${className ? ` ${className}` : ''}`} {...rest} />;

export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={`ui-input ui-textarea${className ? ` ${className}` : ''}`} {...rest} />;

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`ui-select${className ? ` ${className}` : ''}`}>
      <select {...rest}>{children}</select>
      <ChevronDown size={14} aria-hidden className="ui-select__chevron" />
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder, label, shortcut, inputRef }: { value: string; onChange: (value: string) => void; placeholder: string; label: string; shortcut?: string; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <div className="ui-search">
      <Search size={15} aria-hidden className="ui-search__icon" />
      <input ref={inputRef} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} />
      {value ? (
        <button type="button" className="ui-search__clear" onClick={() => onChange('')} aria-label={label}>
          <X size={14} />
        </button>
      ) : (
        shortcut && <kbd className="ui-kbd">{shortcut}</kbd>
      )}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="ui-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** A filter control: a labelled select that reads as one chip. */
export function FilterSelect<T extends string>({ label, value, onChange, options, allLabel }: { label: string; value: T | 'all'; onChange: (value: T | 'all') => void; options: { value: T; label: string }[]; allLabel: string }) {
  return (
    <label className={`ui-filter${value !== 'all' ? ' ui-filter--on' : ''}`}>
      <span className="ui-filter__label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T | 'all')}>
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} aria-hidden />
    </label>
  );
}
