import { useState, type ReactNode } from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround,
  AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronUp, Copy, Eye, EyeOff, FlipHorizontal2, FlipVertical2, Group, GripVertical,
  ImageIcon, Layers, Lock, LockOpen, Scissors, Shapes, SlidersHorizontal, Sparkles, Trash2, Type, Ungroup, Wand2,
} from 'lucide-react';
import type { ShapeLayer, StudioDoc, StudioLayer, StudioObject, TextLayer } from '../../domain/studio';
import { useI18n } from '../../i18n/I18nProvider';
import { IconButton } from '../../components/ui/Button';
import { groupState, type StudioCommand } from './commands';
import { ColorPicker, NumberField, Segmented } from './controls';
import { boxOf, type Heights } from './edit';

const KIND_ICON = { text: <Type size={14} />, shape: <Shapes size={14} />, image: <ImageIcon size={14} /> } as const;
const ARABIC = /[؀-ۿ]/;
type Tab = 'edit' | 'layers';

export interface PanelProps {
  doc: StudioDoc;
  selection: string[];
  heights: Heights;
  colors: string[];
  busy: boolean;
  onSelect: (ids: string[], additive?: boolean) => void;
  /** Applies to every selected layer; `commit` ends the undo step. */
  onPatch: (patch: Partial<StudioLayer>, commit?: boolean) => void;
  onPatchLayer: (id: string, patch: Partial<StudioLayer>) => void;
  onCommit: () => void;
  onCommand: (command: StudioCommand) => void;
  onReorder: (id: string, index: number) => void;
  onExtract: (object: StudioObject) => void;
  onAiObject: (object: StudioObject) => void;
  onHighlight: (object: StudioObject | null) => void;
}

function Section({ title, icon, children, actions }: { title: string; icon?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="studio__section">
      <header className="studio__section-head"><h3>{icon}{title}</h3>{actions}</header>
      {children}
    </section>
  );
}

export function layerName(l: StudioLayer, t: (en: string, ar: string) => string) {
  if (l.kind === 'text') return l.text.split('\n')[0].trim() || t('Empty text', 'نص فارغ');
  const known: Record<string, string> = { Button: 'زر', Panel: 'لوحة', Icon: 'أيقونة', Line: 'خط', Rectangle: 'مستطيل', Circle: 'دائرة', Shape: 'شكل' };
  if (l.name) return t(l.name, known[l.name] ?? l.name);
  return l.kind === 'shape' ? t('Shape', 'شكل') : t('Image', 'صورة');
}

/** Properties of the selection, the layer stack and the objects that can be lifted out of the background. */
export function StudioPanel(props: PanelProps) {
  const { t } = useI18n();
  const { doc, selection } = props;
  const [tab, setTab] = useState<Tab>('edit');
  const picked = doc.layers.filter((l) => selection.includes(l.id));
  return (
    <aside className="studio__panel glass">
      <div className="studio__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')}><SlidersHorizontal size={14} /> {t('Edit', 'تعديل')}</button>
        <button type="button" role="tab" aria-selected={tab === 'layers'} onClick={() => setTab('layers')}><Layers size={14} /> {t('Layers', 'الطبقات')} <span className="studio__count u-tnum">{doc.layers.length}</span></button>
      </div>
      {tab === 'edit' && (picked.length ? <SelectionFields {...props} picked={picked} /> : <PageHint objects={doc.objects.length > 0} />)}
      {tab === 'layers' && <LayerList {...props} />}
      {tab === 'edit' && doc.objects.length > 0 && <ObjectList {...props} />}
    </aside>
  );
}

function PageHint({ objects }: { objects: boolean }) {
  const { t } = useI18n();
  const rows: [string, string, string, string][] = [
    ['Click', 'ضغطة', 'Select · click again inside a group to pick one layer', 'تحديد · اضغط مرة أخرى داخل مجموعة لاختيار عنصر واحد'],
    ['Double-click', 'ضغطتان', 'Edit text right on the design', 'تعديل النص مباشرة على التصميم'],
    ['Shift', 'Shift', 'Add to the selection · keep proportions · straight moves', 'إضافة للتحديد · الحفاظ على النسب · تحريك مستقيم'],
    ['Drag empty area', 'سحب في مكان فارغ', 'Select several layers', 'تحديد عدة طبقات'],
    ['Space + drag', 'مسافة + سحب', 'Move around the canvas', 'التنقل في مساحة العمل'],
    ['⌘ + wheel', '⌘ + العجلة', 'Zoom', 'تكبير وتصغير'],
  ];
  return (
    <div className="studio__hint">
      <p>{t('Select anything on the design to edit it. Drop or paste an image to add it.', 'اختر أي عنصر في التصميم لتعديله. اسحب صورة أو الصقها لإضافتها.')}</p>
      <dl>{rows.map(([k, kAr, en, ar]) => <div key={k}><dt><kbd>{t(k, kAr)}</kbd></dt><dd>{t(en, ar)}</dd></div>)}</dl>
      {objects && <p className="u-xs">{t('Objects found in the picture are listed below — lift one into its own layer to move or delete it.', 'العناصر الموجودة في الصورة بالأسفل — افصل أيًّا منها في طبقة لتحريكه أو حذفه.')}</p>}
    </div>
  );
}

function SelectionFields({ doc, picked, heights, colors, onPatch, onPatchLayer, onCommit, onCommand }: PanelProps & { picked: StudioLayer[] }) {
  const { t } = useI18n();
  const single = picked.length === 1 ? picked[0] : null;
  const locked = picked.every((l) => l.locked);
  const { canGroup, canUngroup } = groupState(doc, picked.map((l) => l.id));
  const title = single ? layerName(single, t) : t(`${picked.length} layers`, `${picked.length} طبقات`);
  const texts = picked.filter((l): l is TextLayer => l.kind === 'text');

  return (
    <>
      <Section title={title} icon={single ? KIND_ICON[single.kind] : <Layers size={14} />} actions={
        <div className="studio__actions">
          <IconButton size="sm" label={locked ? t('Unlock', 'إلغاء القفل') : t('Lock', 'قفل')} onClick={() => onCommand('lock')}>{locked ? <Lock size={15} /> : <LockOpen size={15} />}</IconButton>
          <IconButton size="sm" label={t('Duplicate (⌘D)', 'تكرار (⌘D)')} onClick={() => onCommand('duplicate')}><Copy size={15} /></IconButton>
          <IconButton size="sm" label={t('Delete', 'حذف')} disabled={locked} onClick={() => onCommand('delete')}><Trash2 size={15} /></IconButton>
        </div>
      }>
        {locked && <p className="studio__note"><Lock size={13} /> {t('Locked: unlock to move or change it.', 'مقفلة: ألغِ القفل لتحريكها أو تعديلها.')}</p>}
      </Section>

      {single?.kind === 'text' && <TextFields layer={single} colors={colors} onPatch={onPatch} onCommit={onCommit} />}
      {!single && texts.length > 1 && (
        <Section title={t('Text', 'النص')} icon={<Type size={14} />}>
          <div className="studio__row"><span>{t('Colour', 'اللون')}</span><ColorPicker value={texts[0].color} docColors={colors} label={t('Text colour', 'لون النص')} onChange={(color) => { onPatch({ color }); onCommit(); }} /></div>
        </Section>
      )}
      {single?.kind === 'shape' && <ShapeFields layer={single} colors={colors} onPatch={onPatch} onCommit={onCommit} />}
      {single?.kind === 'image' && (
        <Section title={t('Image', 'الصورة')} icon={<ImageIcon size={14} />}>
          <div className="studio__btn-row">
            <button type="button" className="studio__pill" aria-pressed={Boolean(single.flipX)} onClick={() => onCommand('flip-x')}><FlipHorizontal2 size={14} /> {t('Flip', 'اقلب أفقيًا')}</button>
            <button type="button" className="studio__pill" aria-pressed={Boolean(single.flipY)} onClick={() => onCommand('flip-y')}><FlipVertical2 size={14} /> {t('Flip vertical', 'اقلب رأسيًا')}</button>
          </div>
        </Section>
      )}

      <Section title={picked.length > 1 ? t('Align to each other', 'محاذاة مع بعض') : t('Position on the page', 'الموضع في الصفحة')} icon={<AlignCenterHorizontal size={14} />}>
        <div className="studio__align">
          <IconButton size="sm" label={t('Align left', 'محاذاة لليسار')} onClick={() => onCommand('align-left')}><AlignStartVertical size={16} /></IconButton>
          <IconButton size="sm" label={t('Align centre', 'توسيط أفقي')} onClick={() => onCommand('align-hcenter')}><AlignCenterVertical size={16} /></IconButton>
          <IconButton size="sm" label={t('Align right', 'محاذاة لليمين')} onClick={() => onCommand('align-right')}><AlignEndVertical size={16} /></IconButton>
          <IconButton size="sm" label={t('Align top', 'محاذاة للأعلى')} onClick={() => onCommand('align-top')}><AlignStartHorizontal size={16} /></IconButton>
          <IconButton size="sm" label={t('Align middle', 'توسيط رأسي')} onClick={() => onCommand('align-vcenter')}><AlignCenterHorizontal size={16} /></IconButton>
          <IconButton size="sm" label={t('Align bottom', 'محاذاة للأسفل')} onClick={() => onCommand('align-bottom')}><AlignEndHorizontal size={16} /></IconButton>
          {picked.length > 2 && <>
            <IconButton size="sm" label={t('Space evenly across', 'توزيع أفقي متساوٍ')} onClick={() => onCommand('distribute-x')}><AlignHorizontalSpaceAround size={16} /></IconButton>
            <IconButton size="sm" label={t('Space evenly down', 'توزيع رأسي متساوٍ')} onClick={() => onCommand('distribute-y')}><AlignVerticalSpaceAround size={16} /></IconButton>
          </>}
        </div>
        {single && !single.locked && (
          <div className="studio__grid">
            <NumberField label="X" value={single.x} onChange={(x) => onPatchLayer(single.id, { x: Math.round(x) })} onCommit={onCommit} />
            <NumberField label="Y" value={single.y} onChange={(y) => onPatchLayer(single.id, { y: Math.round(y) })} onCommit={onCommit} />
            <NumberField label={t('W', 'ع')} title={t('Width', 'العرض')} min={12} value={single.width} onChange={(width) => onPatchLayer(single.id, { width: Math.round(width) })} onCommit={onCommit} />
            {single.kind === 'text'
              ? <NumberField label={t('H', 'ط')} title={t('Height follows the text', 'الارتفاع يتبع النص')} value={Math.round(boxOf(single, heights(single.id)).height)} onChange={() => undefined} onCommit={() => undefined} />
              : <NumberField label={t('H', 'ط')} title={t('Height', 'الارتفاع')} min={12} value={single.height} onChange={(height) => onPatchLayer(single.id, { height: Math.round(height) })} onCommit={onCommit} />}
            <NumberField label="°" title={t('Rotation', 'الدوران')} min={-180} max={180} value={single.rotation ?? 0} onChange={(rotation) => onPatchLayer(single.id, { rotation: rotation || undefined })} onCommit={onCommit} />
          </div>
        )}
        <div className="studio__btn-row">
          <IconButton size="sm" label={t('Bring to front', 'إلى المقدمة')} onClick={() => onCommand('front')}><ArrowUpToLine size={15} /></IconButton>
          <IconButton size="sm" label={t('Bring forward (⌘])', 'للأمام (⌘])')} onClick={() => onCommand('forward')}><ChevronUp size={15} /></IconButton>
          <IconButton size="sm" label={t('Send backward (⌘[)', 'للخلف (⌘[)')} onClick={() => onCommand('backward')}><ChevronDown size={15} /></IconButton>
          <IconButton size="sm" label={t('Send to back', 'إلى الخلفية')} onClick={() => onCommand('back')}><ArrowDownToLine size={15} /></IconButton>
          <span className="studio__spacer" />
          {canGroup && <button type="button" className="studio__pill" onClick={() => onCommand('group')}><Group size={14} /> {t('Group', 'جمّع')}</button>}
          {canUngroup && <button type="button" className="studio__pill" onClick={() => onCommand('ungroup')}><Ungroup size={14} /> {t('Ungroup', 'فك التجميع')}</button>}
        </div>
      </Section>

      <Section title={t('Transparency', 'الشفافية')}>
        <div className="studio__row">
          <input type="range" min={0} max={100} value={Math.round((single ?? picked[0]).opacity * 100)} aria-label={t('Transparency', 'الشفافية')}
            onChange={(e) => onPatch({ opacity: Number(e.target.value) / 100 })} onPointerUp={onCommit} onKeyUp={onCommit} />
          <output className="u-tnum">{Math.round((single ?? picked[0]).opacity * 100)}%</output>
        </div>
      </Section>
    </>
  );
}

function TextFields({ layer, colors, onPatch, onCommit }: { layer: TextLayer; colors: string[]; onPatch: (patch: Partial<TextLayer>, commit?: boolean) => void; onCommit: () => void }) {
  const { t } = useI18n();
  const rtl = ARABIC.test(layer.text);
  return (
    <Section title={t('Text', 'النص')} icon={<Type size={14} />}>
      <textarea className="studio__text" rows={Math.min(6, Math.max(2, layer.text.split('\n').length + 1))} dir="auto" value={layer.text} onChange={(e) => onPatch({ text: e.target.value })} onBlur={onCommit} aria-label={t('Text', 'النص')} />
      <div className="studio__row">
        <span>{t('Size', 'الحجم')}</span>
        <input type="range" min={10} max={260} value={Math.min(260, layer.size)} aria-label={t('Size', 'الحجم')} onChange={(e) => onPatch({ size: Number(e.target.value) })} onPointerUp={onCommit} onKeyUp={onCommit} />
        <NumberField label="px" min={8} max={400} value={layer.size} onChange={(size) => onPatch({ size: Math.round(size) })} onCommit={onCommit} />
      </div>
      <div className="studio__row">
        <span>{t('Weight', 'السُّمك')}</span>
        <Segmented label={t('Weight', 'السُّمك')} value={layer.weight} onChange={(weight) => onPatch({ weight }, true)} options={[
          { value: 300, label: <span style={{ fontWeight: 300 }}>أ</span>, title: t('Light', 'خفيف') },
          { value: 400, label: <span style={{ fontWeight: 400 }}>أ</span>, title: t('Regular', 'عادي') },
          { value: 700, label: <span style={{ fontWeight: 700 }}>أ</span>, title: t('Bold', 'عريض') },
          { value: 800, label: <span style={{ fontWeight: 800 }}>أ</span>, title: t('Extra bold', 'عريض جدًا') },
        ]} />
      </div>
      <div className="studio__row">
        <span>{t('Align', 'المحاذاة')}</span>
        <Segmented label={t('Align', 'المحاذاة')} value={layer.align} onChange={(align) => onPatch({ align }, true)} options={[
          { value: 'start', label: rtl ? <AlignRight size={15} /> : <AlignLeft size={15} />, title: t('Start', 'البداية') },
          { value: 'center', label: <AlignCenter size={15} />, title: t('Centre', 'المنتصف') },
          { value: 'end', label: rtl ? <AlignLeft size={15} /> : <AlignRight size={15} />, title: t('End', 'النهاية') },
        ]} />
      </div>
      <div className="studio__row">
        <span>{t('Line spacing', 'تباعد الأسطر')}</span>
        <input type="range" min={80} max={250} value={Math.round(layer.lineHeight * 100)} aria-label={t('Line spacing', 'تباعد الأسطر')} onChange={(e) => onPatch({ lineHeight: Number(e.target.value) / 100 })} onPointerUp={onCommit} onKeyUp={onCommit} />
        <output className="u-tnum">{layer.lineHeight.toFixed(2)}</output>
      </div>
      <div className="studio__row">
        <span>{t('Colour', 'اللون')}</span>
        <ColorPicker value={layer.color} docColors={colors} label={t('Text colour', 'لون النص')} onChange={(color) => onPatch({ color }, true)} />
      </div>
      <label className="studio__check"><input type="checkbox" checked={Boolean(layer.shadow)} onChange={(e) => onPatch({ shadow: e.target.checked || undefined }, true)} /> {t('Shadow behind the text', 'ظل خلف النص')}</label>
    </Section>
  );
}

function ShapeFields({ layer, colors, onPatch, onCommit }: { layer: ShapeLayer; colors: string[]; onPatch: (patch: Partial<ShapeLayer>, commit?: boolean) => void; onCommit: () => void }) {
  const { t } = useI18n();
  const maxRadius = Math.floor(Math.min(layer.width, layer.height) / 2);
  return (
    <Section title={t('Shape', 'الشكل')} icon={<Shapes size={14} />}>
      <div className="studio__row">
        <span>{t('Fill', 'التعبئة')}</span>
        <ColorPicker value={layer.fill} docColors={colors} label={t('Fill colour', 'لون التعبئة')} onChange={(fill) => onPatch({ fill }, true)} />
      </div>
      <label className="studio__check"><input type="checkbox" checked={Boolean(layer.fill2)} onChange={(e) => onPatch({ fill2: e.target.checked ? '#0046FF' : null }, true)} /> {t('Gradient', 'تدرّج لوني')}</label>
      {layer.fill2 && <div className="studio__row"><span>{t('To', 'إلى')}</span><ColorPicker value={layer.fill2} docColors={colors} label={t('Second colour', 'اللون الثاني')} onChange={(fill2) => onPatch({ fill2 }, true)} /></div>}
      <div className="studio__row">
        <span>{t('Corners', 'الحواف')}</span>
        <input type="range" min={0} max={maxRadius} value={Math.min(layer.radius, maxRadius)} aria-label={t('Corners', 'الحواف')} onChange={(e) => onPatch({ radius: Number(e.target.value) })} onPointerUp={onCommit} onKeyUp={onCommit} />
        <output className="u-tnum">{Math.min(layer.radius, maxRadius)}</output>
      </div>
      <label className="studio__check"><input type="checkbox" checked={Boolean(layer.stroke)} onChange={(e) => onPatch({ stroke: e.target.checked ? '#FFFFFF' : null, strokeWidth: layer.strokeWidth ?? 4 }, true)} /> {t('Border', 'إطار')}</label>
      {layer.stroke && (
        <div className="studio__row studio__row--stroke">
          <ColorPicker value={layer.stroke} docColors={colors} label={t('Border colour', 'لون الإطار')} onChange={(stroke) => onPatch({ stroke }, true)} />
          <input type="range" min={1} max={40} value={layer.strokeWidth ?? 4} aria-label={t('Border width', 'سُمك الإطار')} onChange={(e) => onPatch({ strokeWidth: Number(e.target.value) })} onPointerUp={onCommit} onKeyUp={onCommit} />
          <output className="u-tnum">{layer.strokeWidth ?? 4}</output>
        </div>
      )}
      <label className="studio__check"><input type="checkbox" checked={Boolean(layer.shadow)} onChange={(e) => onPatch({ shadow: e.target.checked }, true)} /> {t('Soft shadow', 'ظل خفيف')}</label>
    </Section>
  );
}

function LayerList({ doc, selection, onSelect, onPatchLayer, onCommit, onCommand, onReorder }: PanelProps) {
  const { t } = useI18n();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const shown = [...doc.layers].reverse();
  const toggle = (l: StudioLayer, command: 'lock' | 'hide') => {
    onPatchLayer(l.id, command === 'lock' ? { locked: !l.locked || undefined } : { hidden: !l.hidden || undefined });
    onCommit();
  };
  return (
    <Section title={t('Top to bottom', 'من الأعلى للأسفل')}>
      <ul className="studio__layer-list" onDragLeave={() => setOver(null)}>
        {shown.map((l, i) => (
          <li key={l.id} draggable={renaming !== l.id} data-selected={selection.includes(l.id) || undefined} data-hidden={l.hidden || undefined} data-grouped={l.group ? true : undefined}
            data-drop={over === i && dragId && dragId !== l.id ? true : undefined}
            onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(i); } }}
            onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== l.id) onReorder(dragId, doc.layers.length - 1 - i); setDragId(null); setOver(null); }}
            onDragEnd={() => { setDragId(null); setOver(null); }}>
            <GripVertical size={13} className="studio__grip" aria-hidden />
            <Thumb layer={l} />
            {renaming === l.id ? (
              <input className="studio__rename" autoFocus defaultValue={l.name ?? ''} maxLength={60} aria-label={t('Layer name', 'اسم الطبقة')}
                onBlur={(e) => { onPatchLayer(l.id, { name: e.target.value.trim() || undefined }); onCommit(); setRenaming(null); }}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
            ) : (
              <button type="button" className="studio__layer-pick" onClick={(e) => onSelect([l.id], e.shiftKey || e.metaKey || e.ctrlKey)} onDoubleClick={() => { if (l.kind !== 'text') setRenaming(l.id); }}
                title={l.kind !== 'text' ? t('Double-click to rename', 'اضغط مرتين لإعادة التسمية') : undefined}>
                <span dir="auto" className="u-truncate">{layerName(l, t)}</span>
              </button>
            )}
            <IconButton size="sm" className="studio__row-btn" data-on={l.locked || undefined} label={l.locked ? t('Unlock', 'إلغاء القفل') : t('Lock', 'قفل')} onClick={() => toggle(l, 'lock')}>{l.locked ? <Lock size={13} /> : <LockOpen size={13} />}</IconButton>
            <IconButton size="sm" className="studio__row-btn" data-on={l.hidden || undefined} label={l.hidden ? t('Show', 'إظهار') : t('Hide', 'إخفاء')} onClick={() => toggle(l, 'hide')}>{l.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</IconButton>
          </li>
        ))}
        <li className="studio__layer-fixed"><ImageIcon size={13} /> {t('Background picture', 'الصورة الخلفية')}</li>
      </ul>
      {selection.length > 0 && <div className="studio__btn-row">
        <button type="button" className="studio__pill" onClick={() => onCommand('front')}><ArrowUpToLine size={14} /> {t('To front', 'للمقدمة')}</button>
        <button type="button" className="studio__pill" onClick={() => onCommand('back')}><ArrowDownToLine size={14} /> {t('To back', 'للخلف')}</button>
      </div>}
    </Section>
  );
}

function Thumb({ layer }: { layer: StudioLayer }) {
  if (layer.kind === 'image') return <span className="studio__thumb"><img src={`/api/studio/${layer.file}`} alt="" loading="lazy" /></span>;
  if (layer.kind === 'shape') return <span className="studio__thumb" style={{ background: layer.fill2 ? `linear-gradient(90deg, ${layer.fill}, ${layer.fill2})` : layer.fill, borderRadius: layer.radius ? 999 : 3 }} />;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(layer.color.slice(i, i + 2), 16));
  const dark = 0.299 * r + 0.587 * g + 0.114 * b < 140;
  return <span className="studio__thumb is-text" style={{ color: layer.color, background: dark ? '#e8ecf4' : '#1a2240' }}><Type size={12} /></span>;
}

function ObjectList({ busy, doc, onExtract, onAiObject, onHighlight }: PanelProps) {
  const { t } = useI18n();
  return (
    <Section title={t('Objects in the picture', 'عناصر في الصورة')} icon={<Sparkles size={14} />}>
      <p className="u-xs u-muted">{t('Lift an object into its own layer to move, resize or delete it, or redraw it with AI. Each uses AI credit.', 'افصل أي عنصر في طبقة مستقلة لتحريكه أو تكبيره أو حذفه، أو أعد رسمه بالذكاء الاصطناعي. كل عملية تستهلك من رصيد الذكاء الاصطناعي.')}</p>
      <ul className="studio__objects">
        {doc.objects.map((o) => (
          <li key={o.id} onPointerEnter={() => onHighlight(o)} onPointerLeave={() => onHighlight(null)}>
            <span dir="auto" className="u-truncate">{o.label}</span>
            <IconButton size="sm" label={t('Lift into a layer', 'افصله في طبقة')} disabled={busy} onClick={() => onExtract(o)}><Scissors size={14} /></IconButton>
            <IconButton size="sm" label={t('Change with AI', 'غيّره بالذكاء الاصطناعي')} disabled={busy} onClick={() => onAiObject(o)}><Wand2 size={14} /></IconButton>
          </li>
        ))}
      </ul>
    </Section>
  );
}
