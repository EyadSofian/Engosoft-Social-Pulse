import { useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Long text shows its first lines and a "More" button; short text shows whole. Pages lead with a headline and keep
 * the detail one click away instead of a paragraph wall.
 */
export function ClampText({ text, lines = 2, className }: { text: string; lines?: number; className?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 2);
  }, [text, open, lines]);
  return (
    <div className="clamp-text">
      <p ref={ref} className={className} dir="auto" data-clamped={open ? undefined : ''} style={{ ['--clamp-lines' as string]: lines }}>{text}</p>
      {(long || open) && <button type="button" className="clamp-text__more" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? t('Less', 'أقل') : t('More', 'اقرأ أكتر')}</button>}
    </div>
  );
}
