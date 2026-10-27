import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Pipette } from 'lucide-react';
import { HEX_COLOR } from '../../domain/studio';
import { useI18n } from '../../i18n/I18nProvider';

/** Engosoft palette first, then neutrals. */
export const BRAND_COLORS = ['#0046FF', '#001BB7', '#FF6600', '#FFFFFF', '#F5F4F3', '#1A1A1A', '#000000'];

/** The EyeDropper API (Chromium only). */
const EyeDropper = (globalThis as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;

/** A swatch that opens a picker: brand colours, colours already in the design, hex, native picker and eyedropper. */
export function ColorPicker({ value, onChange, docColors, label, compact }: { value: string; onChange: (color: string) => void; docColors: string[]; label: string; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => setHex(value), [value]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const pick = (c: string) => onChange(c.toUpperCase());
  const recent = docColors.filter((c) => !BRAND_COLORS.includes(c)).slice(0, 7);
  const swatch = (c: string) => <button key={c} type="button" className="studio__swatch" style={{ background: c }} aria-label={c} title={c} aria-pressed={value.toUpperCase() === c} onClick={() => pick(c)} />;
  return (
    <div className="studio__picker" ref={root}>
      <button type="button" className={`studio__chip${compact ? ' is-compact' : ''}`} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span style={{ background: value }} />{!compact && <code>{value.toUpperCase()}</code>}
      </button>
      {open && (
        <div className="studio__popover glass" role="dialog" aria-label={label}>
          <div className="studio__popover-row">
            <input type="color" value={value} aria-label={t('Any colour', 'أي لون')} onChange={(e) => pick(e.target.value)} />
            <input className="studio__hex" value={hex} spellCheck={false} maxLength={7} aria-label="Hex"
              onChange={(e) => { const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`; setHex(v); if (HEX_COLOR.test(v)) pick(v); }} />
            {EyeDropper && (
              <button type="button" className="studio__icon-btn" aria-label={t('Pick from screen', 'التقط لونًا من الشاشة')} title={t('Pick from screen', 'التقط لونًا من الشاشة')}
                onClick={() => { void new EyeDropper().open().then((r) => pick(r.sRGBHex)).catch(() => undefined); }}><Pipette size={15} /></button>
            )}
          </div>
          <small>{t('Brand colours', 'ألوان الهوية')}</small>
          <div className="studio__swatches">{BRAND_COLORS.map(swatch)}</div>
          {recent.length > 0 && <><small>{t('In this design', 'في هذا التصميم')}</small><div className="studio__swatches">{recent.map(swatch)}</div></>}
        </div>
      )}
    </div>
  );
}

/** Number input; drag the label sideways to scrub the value. `onCommit` ends one undo step. */
export function NumberField({ label, value, onChange, onCommit, min = -100_000, max = 100_000, step = 1, title }: { label: ReactNode; value: number; onChange: (n: number) => void; onCommit: () => void; min?: number; max?: number; step?: number; title?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; value: number } | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const onDown = (e: ReactPointerEvent<HTMLSpanElement>) => { scrub.current = { x: e.clientX, value }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e: ReactPointerEvent) => { const s = scrub.current; if (s) onChange(clamp(Math.round((s.value + ((e.clientX - s.x) / 2) * step) / step) * step)); };
  const onUp = () => { if (scrub.current) { scrub.current = null; onCommit(); } };
  return (
    <label className="studio__num" title={title}>
      <span onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>{label}</span>
      <input type="number" inputMode="decimal" value={draft ?? String(Math.round(value * 10) / 10)} min={min} max={max} step={step}
        onChange={(e) => { setDraft(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(clamp(n)); }}
        onBlur={() => { setDraft(null); onCommit(); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </label>
  );
}

/** A row of mutually exclusive buttons. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="studio__seg" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} title={o.title} aria-label={o.title} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
