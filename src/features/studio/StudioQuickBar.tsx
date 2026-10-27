import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Bold, ChevronDown, ChevronUp, ClipboardPaste, Copy, CopyPlus, FlipHorizontal2, Group, Lock, LockOpen, Minus, MoreHorizontal, PencilLine, Plus, Scissors, Trash2, Ungroup } from 'lucide-react';
import type { StudioDoc, StudioLayer, TextLayer } from '../../domain/studio';
import { useI18n } from '../../i18n/I18nProvider';
import { groupState, type StudioCommand } from './commands';
import { ColorPicker } from './controls';

const ARABIC = /[؀-ۿ]/;
const NEXT_ALIGN: Record<TextLayer['align'], TextLayer['align']> = { start: 'center', center: 'end', end: 'start' };

function Btn({ label, onClick, children, pressed, disabled }: { label: string; onClick: (event: MouseEvent<HTMLButtonElement>) => void; children: ReactNode; pressed?: boolean; disabled?: boolean }) {
  return <button type="button" className="studio__qbtn" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</button>;
}

/** Quick actions floating above the selection, like Canva's element toolbar. */
export function StudioQuickBar({ doc, selection, colors, onPatch, onCommit, onCommand, onEditText, onMore }: {
  doc: StudioDoc;
  selection: string[];
  colors: string[];
  onPatch: (patch: Partial<StudioLayer>, commit?: boolean) => void;
  onCommit: () => void;
  onCommand: (command: StudioCommand) => void;
  onEditText: (id: string) => void;
  onMore: (at: { x: number; y: number }) => void;
}) {
  const { t } = useI18n();
  const picked = doc.layers.filter((l) => selection.includes(l.id));
  if (!picked.length) return null;
  const single = picked.length === 1 ? picked[0] : null;
  const locked = picked.every((l) => l.locked);
  const { canGroup, canUngroup } = groupState(doc, selection);
  const step = (layer: TextLayer, dir: 1 | -1) => { onPatch({ size: Math.max(8, Math.min(400, layer.size + dir * Math.max(1, Math.round(layer.size * 0.08)))) }); onCommit(); };

  return (
    <div className="studio__quickbar glass" role="toolbar" aria-label={t('Selection', 'التحديد')} onPointerDown={(e) => e.stopPropagation()}>
      {single?.kind === 'text' && !locked && <>
        <ColorPicker compact value={single.color} docColors={colors} label={t('Text colour', 'لون النص')} onChange={(color) => onPatch({ color }, true)} />
        <span className="studio__qsize">
          <Btn label={t('Smaller', 'أصغر')} onClick={() => step(single, -1)}><Minus size={13} /></Btn>
          <span className="u-tnum">{single.size}</span>
          <Btn label={t('Bigger', 'أكبر')} onClick={() => step(single, 1)}><Plus size={13} /></Btn>
        </span>
        <Btn label={t('Bold', 'عريض')} pressed={single.weight >= 700} onClick={() => onPatch({ weight: single.weight >= 700 ? 400 : 800 }, true)}><Bold size={15} /></Btn>
        <Btn label={t('Alignment', 'المحاذاة')} onClick={() => onPatch({ align: NEXT_ALIGN[single.align] }, true)}>
          {single.align === 'center' ? <AlignCenter size={15} /> : (single.align === 'start') === ARABIC.test(single.text) ? <AlignRight size={15} /> : <AlignLeft size={15} />}
        </Btn>
        <Btn label={t('Edit text (Enter)', 'تعديل النص (Enter)')} onClick={() => onEditText(single.id)}><PencilLine size={15} /></Btn>
        <span className="studio__qsep" />
      </>}
      {single?.kind === 'shape' && !locked && <>
        <ColorPicker compact value={single.fill} docColors={colors} label={t('Fill colour', 'لون التعبئة')} onChange={(fill) => onPatch({ fill }, true)} />
        <span className="studio__qsep" />
      </>}
      {single?.kind === 'image' && !locked && <>
        <Btn label={t('Flip', 'اقلب')} pressed={Boolean(single.flipX)} onClick={() => onCommand('flip-x')}><FlipHorizontal2 size={15} /></Btn>
        <span className="studio__qsep" />
      </>}
      {canGroup && <Btn label={t('Group (⌘G)', 'جمّع (⌘G)')} onClick={() => onCommand('group')}><Group size={15} /></Btn>}
      {canUngroup && picked.length > 1 && <Btn label={t('Ungroup (⇧⌘G)', 'فك التجميع (⇧⌘G)')} onClick={() => onCommand('ungroup')}><Ungroup size={15} /></Btn>}
      <Btn label={locked ? t('Unlock', 'إلغاء القفل') : t('Lock', 'قفل')} pressed={locked} onClick={() => onCommand('lock')}>{locked ? <Lock size={15} /> : <LockOpen size={15} />}</Btn>
      <Btn label={t('Duplicate (⌘D)', 'تكرار (⌘D)')} onClick={() => onCommand('duplicate')}><CopyPlus size={15} /></Btn>
      <Btn label={t('Delete', 'حذف')} disabled={locked} onClick={() => onCommand('delete')}><Trash2 size={15} /></Btn>
      <Btn label={t('More', 'المزيد')} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMore({ x: r.left, y: r.bottom + 6 }); }}><MoreHorizontal size={15} /></Btn>
    </div>
  );
}

export interface MenuEntry { key: string; label: string; icon?: ReactNode; hint?: string; danger?: boolean; disabled?: boolean; run: () => void }

/** Right-click menu at a screen point. */
export function StudioContextMenu({ at, entries, onClose }: { at: { x: number; y: number }; entries: (MenuEntry | 'sep')[]; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)), y: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)) });
  }, [at]);
  useEffect(() => {
    const close = (e: Event) => { if (!root.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', key, true); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return (
    <div ref={root} className="studio__menu glass" role="menu" style={{ left: pos.x, top: pos.y }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }}>
      {entries.map((entry, i) => entry === 'sep' ? <hr key={`sep${i}`} /> : (
        <button key={entry.key} type="button" role="menuitem" className={entry.danger ? 'is-danger' : undefined} disabled={entry.disabled} onClick={() => { onClose(); entry.run(); }}>
          {entry.icon ?? <span className="studio__menu-gap" />}<span>{entry.label}</span>{entry.hint && <kbd>{entry.hint}</kbd>}
        </button>
      ))}
    </div>
  );
}

/** Menu entries for the current selection; the page supplies the clipboard actions. */
export function selectionMenu(t: (en: string, ar: string) => string, doc: StudioDoc, selection: string[], run: (c: StudioCommand) => void, clip: { copy: () => void; cut: () => void; paste: () => void; canPaste: boolean; editText?: () => void }): (MenuEntry | 'sep')[] {
  const picked = doc.layers.filter((l) => selection.includes(l.id));
  const locked = picked.length > 0 && picked.every((l) => l.locked);
  const { canGroup, canUngroup } = groupState(doc, selection);
  const has = picked.length > 0;
  const entries: (MenuEntry | 'sep')[] = [];
  if (clip.editText) entries.push({ key: 'edit', label: t('Edit text', 'تعديل النص'), icon: <PencilLine size={14} />, hint: 'Enter', run: clip.editText }, 'sep');
  entries.push(
    { key: 'copy', label: t('Copy', 'نسخ'), icon: <Copy size={14} />, hint: '⌘C', disabled: !has, run: clip.copy },
    { key: 'cut', label: t('Cut', 'قص'), icon: <Scissors size={14} />, hint: '⌘X', disabled: !has || locked, run: clip.cut },
    { key: 'paste', label: t('Paste', 'لصق'), icon: <ClipboardPaste size={14} />, hint: '⌘V', disabled: !clip.canPaste, run: clip.paste },
    { key: 'dup', label: t('Duplicate', 'تكرار'), icon: <CopyPlus size={14} />, hint: '⌘D', disabled: !has, run: () => run('duplicate') },
    'sep',
    { key: 'front', label: t('Bring to front', 'إلى المقدمة'), icon: <ArrowUpToLine size={14} />, hint: '⇧⌘]', disabled: !has, run: () => run('front') },
    { key: 'fwd', label: t('Bring forward', 'للأمام'), icon: <ChevronUp size={14} />, hint: '⌘]', disabled: !has, run: () => run('forward') },
    { key: 'bwd', label: t('Send backward', 'للخلف'), icon: <ChevronDown size={14} />, hint: '⌘[', disabled: !has, run: () => run('backward') },
    { key: 'back', label: t('Send to back', 'إلى الخلفية'), icon: <ArrowDownToLine size={14} />, hint: '⇧⌘[', disabled: !has, run: () => run('back') },
    'sep',
  );
  if (canGroup) entries.push({ key: 'group', label: t('Group', 'جمّع'), icon: <Group size={14} />, hint: '⌘G', run: () => run('group') });
  if (canUngroup) entries.push({ key: 'ungroup', label: t('Ungroup', 'فك التجميع'), icon: <Ungroup size={14} />, hint: '⇧⌘G', run: () => run('ungroup') });
  entries.push(
    { key: 'lock', label: locked ? t('Unlock', 'إلغاء القفل') : t('Lock', 'قفل'), icon: locked ? <LockOpen size={14} /> : <Lock size={14} />, hint: '⌥⇧L', disabled: !has, run: () => run('lock') },
    { key: 'delete', label: t('Delete', 'حذف'), icon: <Trash2 size={14} />, hint: '⌫', danger: true, disabled: !has || locked, run: () => run('delete') },
  );
  return entries;
}
