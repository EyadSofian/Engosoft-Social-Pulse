import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Circle, Columns2, Heading1, Heading2, ImagePlus, Keyboard, Loader2, Minus, MousePointer2, MousePointerClick, Pilcrow, RectangleHorizontal, Redo2, RefreshCw, RotateCcw, Save, Shapes, Sparkles, Square, Type, Undo2, Wand2, X } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { useToast } from '../../components/feedback/Toast';
import { migrateStudioDoc, type Box, type StudioDoc, type StudioLayer, type StudioObject } from '../../domain/studio';
import { runCommand, type StudioCommand } from '../../features/studio/commands';
import { docColors, movable, moveLayers, moveLayerTo, newImage, newShape, newText, pasteLayers, removeLayers, updateLayer, updateLayers, type ShapePreset, type TextPreset } from '../../features/studio/edit';
import { StudioCanvas, type Tool } from '../../features/studio/StudioCanvas';
import { StudioPanel } from '../../features/studio/StudioPanel';
import { StudioAiPanel, type AiOutcome } from '../../features/studio/StudioAiPanel';
import { selectionMenu, StudioContextMenu, StudioQuickBar } from '../../features/studio/StudioQuickBar';
import { useHistory } from '../../features/studio/useHistory';
import { useOutlines } from '../../features/studio/useOutlines';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { EmptyState } from '../../components/feedback/States';
import { useAuth } from '../../features/auth/AuthProvider';
import { usePageMeta } from '../../shell/ShellContext';

/** What an AI step reports besides the document (see server/studio-routes.ts). */
interface JobResult { understood?: string; applied?: string[]; warnings?: string[]; notes?: string[]; refused?: string; candidates?: string[]; imageEdits?: number }
async function waitForResult(jobId: string): Promise<{ doc: StudioDoc; result: JobResult }> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const job = await api<{ status: string; doc?: StudioDoc; result?: JobResult; error?: string }>(`/api/studio/jobs/${jobId}`);
    if (job.status === 'done' && job.doc) return { doc: migrateStudioDoc(job.doc)!, result: job.result ?? {} };
    if (job.status === 'failed') throw new Error(job.error || 'Studio step failed');
  }
}
const waitForJob = async (jobId: string) => (await waitForResult(jobId)).doc;
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); });

/** Clipboard text that marks copied Studio layers, so they paste back as layers (also across posts). */
const CLIP = 'mobde3-studio-layers:';
/** Small fingerprint of the saved document, so a draft is offered only on top of the version it was made from. */
const fingerprint = (json: string | null) => { if (!json) return 'none'; let h = 5381; for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0; return String(h); };
interface Draft { doc: StudioDoc; base: string; at: number }
const draftKey = (id: string) => `studio-draft:${id}`;
function readDraft(id: string): Draft | null {
  try { const raw = localStorage.getItem(draftKey(id)); if (!raw) return null; const d = JSON.parse(raw) as Draft; const doc = migrateStudioDoc(d.doc); return doc ? { ...d, doc } : null; } catch { return null; }
}
const dropDraft = (id: string) => { try { localStorage.removeItem(draftKey(id)); } catch { /* storage unavailable */ } };

export function StudioPage({ id }: { id: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  if (!can('design.free')) return <EmptyState title={t('Free editing is not part of your role.', 'التعديل الحر ليس ضمن دورك.')} text={t('Use a template from Create to make or change a post.', 'استخدم قالبًا من صفحة الإنشاء لعمل منشور أو تعديله.')} />;
  return <StudioEditor id={id} />;
}

function StudioEditor({ id }: { id: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const { navigate } = useRouter();
  usePageMeta(t('Studio', 'الاستوديو'), [{ label: t('Content', 'المحتوى'), to: '/content' }, { label: t('Studio', 'الاستوديو') }]);
  const history = useHistory<StudioDoc>();
  const doc = history.present;
  const [imageUrl, setImageUrl] = useState('');
  const [splitMode, setSplitMode] = useState<'text' | 'all'>('text');
  const [phase, setPhase] = useState<'loading' | 'intro' | 'decomposing' | 'editing'>('loading');
  const [selection, setSelection] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [region, setRegion] = useState<Box | null>(null);
  const [highlight, setHighlight] = useState<Box | null>(null);
  const [aiOutcome, setAiOutcome] = useState<AiOutcome | null>(null);
  /** The last assistant request with the document it started from, for "try again". */
  const lastAi = useRef<{ request: string; variants: 1 | 2; region: Box | null; selection: string[]; from: StudioDoc } | null>(null);
  const [peek, setPeek] = useState(false);
  const [working, setWorking] = useState<null | 'ai' | 'extract' | 'upload'>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [compare, setCompare] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const savedJson = useRef<string | null>(null);
  const clipboard = useRef<StudioLayer[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const outlines = useOutlines(doc?.layers ?? []);
  const heights = useCallback((layerId: string) => outlines.get(layerId)?.height, [outlines]);

  useEffect(() => {
    void api<{ doc: StudioDoc | null; imageUrl: string }>(`/api/studio/${id}/doc`).then((r) => {
      setImageUrl(r.imageUrl);
      const saved = migrateStudioDoc(r.doc);
      savedJson.current = saved ? JSON.stringify(saved) : null;
      const found = readDraft(id);
      if (found && found.base === fingerprint(savedJson.current) && JSON.stringify(found.doc) !== savedJson.current) setDraft(found);
      else if (found) dropDraft(id);
      if (saved) { history.reset(saved); setPhase('editing'); } else setPhase('intro');
    }).catch((e) => { setError(errorMessage(e, '')); setPhase('intro'); });
  }, [id, history.reset]);

  // Unsaved work (including a fresh AI split, which costs credit) survives a reload or a closed tab.
  const writeDraft = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!doc || phase !== 'editing') return;
    const write = () => {
      writeDraft.current = null;
      try {
        const json = JSON.stringify(doc);
        if (json === savedJson.current) localStorage.removeItem(draftKey(id));
        else localStorage.setItem(draftKey(id), JSON.stringify({ doc, base: fingerprint(savedJson.current), at: Date.now() } satisfies Draft));
      } catch { /* storage full or blocked: the draft is a convenience */ }
    };
    writeDraft.current = write;
    const timer = setTimeout(write, 700);
    return () => clearTimeout(timer);
  }, [doc, id, phase]);
  // Leaving the page (another screen, reload, closed tab) writes the latest state right away.
  useEffect(() => {
    const flush = () => writeDraft.current?.();
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  // Drop selected ids that no longer exist (after undo, delete, rebuild).
  useEffect(() => {
    if (!doc) return;
    const alive = selection.filter((s) => doc.layers.some((l) => l.id === s));
    if (alive.length !== selection.length) setSelection(alive);
    if (editing && !doc.layers.some((l) => l.id === editing)) setEditing(null);
  }, [doc, selection, editing]);

  const select = useCallback((ids: string[]) => { setSelection(ids); setMenu(null); }, []);
  const command = (c: StudioCommand) => {
    if (!doc) return;
    const result = runCommand(doc, selection, c, heights);
    if (result.doc !== doc) history.apply(result.doc);
    setSelection(result.selection);
  };
  /** Live change to every selected layer; `commit` closes the undo step. */
  const patchSelection = (patch: Partial<StudioLayer>, commit = false) => {
    if (!doc || !selection.length) return;
    // With several layers selected, a property only reaches the layers that have it (text colour skips shapes).
    const fit = (l: StudioLayer) => (selection.length === 1 ? patch : Object.fromEntries(Object.entries(patch).filter(([k]) => k in l || k === 'opacity')));
    if (Object.keys(patch).length) history.live(updateLayers(doc, selection, fit));
    if (commit) history.commit();
  };
  const patchLayer = (layerId: string, patch: Partial<StudioLayer>) => { if (doc) history.live(updateLayer(doc, layerId, patch)); };
  const addLayer = (layer: StudioLayer) => {
    if (!doc) return;
    history.apply({ ...doc, layers: [...doc.layers, layer] });
    setSelection([layer.id]); setTool('select');
    if (layer.kind === 'text') setEditing(layer.id);
  };
  const addText = (preset: TextPreset) => doc && addLayer(newText(doc, preset === 'body' ? t('Add your text', 'أضف النص هنا') : preset === 'subheading' ? t('Subheading', 'عنوان فرعي') : t('Heading', 'عنوان رئيسي'), preset));
  const addShape = (preset: ShapePreset) => doc && addLayer(newShape(doc, preset));

  const copy = useCallback(() => {
    if (!doc) return '';
    clipboard.current = doc.layers.filter((l) => selection.includes(l.id));
    return CLIP + JSON.stringify(clipboard.current);
  }, [doc, selection]);
  const pasteFrom = (layers: StudioLayer[]) => {
    if (!doc || !layers.length) return;
    const r = pasteLayers(doc, layers);
    history.apply(r.doc); setSelection(r.ids); setTool('select');
  };

  const upload = async (file: File, at?: { x: number; y: number }) => {
    if (!doc) return;
    setWorking('upload'); setError('');
    try {
      const saved = await api<{ file: string; width: number; height: number }>(`/api/studio/${id}/upload`, { body: { data: await readAsDataUrl(file) } });
      addLayer(newImage(doc, saved, file.name || t('Image', 'صورة'), at));
    } catch (e) { setError(errorMessage(e, '')); }
    setWorking(null);
  };

  // Clipboard: layers copy and paste as layers; a pasted picture becomes an image layer, pasted text a text layer.
  useEffect(() => {
    if (phase !== 'editing') return;
    const onCopy = (event: ClipboardEvent) => {
      if (typing(event.target) || !selection.length) return;
      event.preventDefault();
      event.clipboardData?.setData('text/plain', copy());
      if (event.type === 'cut' && doc) { history.apply(removeLayers(doc, selection)); setSelection([]); }
    };
    const onPaste = (event: ClipboardEvent) => {
      if (typing(event.target) || !doc) return;
      const file = [...(event.clipboardData?.files ?? [])].find((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
      if (file) { event.preventDefault(); void upload(file); return; }
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (text.startsWith(CLIP)) {
        event.preventDefault();
        try { pasteFrom((JSON.parse(text.slice(CLIP.length)) as StudioLayer[]).filter((l) => l && ['text', 'shape', 'image'].includes(l.kind))); } catch { /* not ours after all */ }
      } else if (text.trim()) {
        event.preventDefault();
        addLayer({ ...newText(doc, text.trim().slice(0, 600), 'body'), align: 'start' });
      }
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    return () => { document.removeEventListener('copy', onCopy); document.removeEventListener('cut', onCopy); document.removeEventListener('paste', onPaste); };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!doc || phase !== 'editing' || typing(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo(); return; }
      if (mod && key === 'y') { event.preventDefault(); history.redo(); return; }
      if (event.key === 'Escape') { setMenu(null); setShortcuts(false); if (region) setRegion(null); else setSelection([]); return; }
      if (mod && key === 'a') { event.preventDefault(); command('select-all'); return; }
      if (event.key === '?') { setShortcuts((s) => !s); return; }
      if (!mod && !event.altKey && key === 't') { event.preventDefault(); addText('heading'); return; }
      if (!mod && !event.altKey && key === 'v') { setTool('select'); setRegion(null); return; }
      if (!selection.length) return;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); command('delete'); }
      else if (mod && key === 'd') { event.preventDefault(); command('duplicate'); }
      else if (mod && key === 'g') { event.preventDefault(); command(event.shiftKey ? 'ungroup' : 'group'); }
      else if (mod && (event.code === 'BracketRight' || event.code === 'BracketLeft')) { event.preventDefault(); command(event.code === 'BracketRight' ? (event.shiftKey ? 'front' : 'forward') : (event.shiftKey ? 'back' : 'backward')); }
      else if (event.altKey && event.shiftKey && event.code === 'KeyL') { event.preventDefault(); command('lock'); }
      else if (event.key === 'Enter') {
        const only = selection.length === 1 ? doc.layers.find((l) => l.id === selection[0]) : undefined;
        if (only?.kind === 'text' && !only.locked) { event.preventDefault(); setEditing(only.id); }
      } else if (event.key.startsWith('Arrow')) {
        // Holding an arrow nudges continuously; the whole nudge is one undo step (committed on key up).
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        history.live(moveLayers(doc, movable(doc, selection), dx, dy));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.key.startsWith('Arrow')) history.commit(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  });

  const makeEditable = async () => {
    setPhase('decomposing'); setError(''); setDraft(null);
    try {
      const { jobId } = await api<{ jobId: string }>(`/api/studio/${id}/decompose`, { method: 'POST', body: { mode: splitMode } });
      const next = await waitForJob(jobId);
      if (doc) history.apply(next); else history.reset(next);
      setSelection([]); setPhase('editing');
    } catch (e) { setError(errorMessage(e, '')); setPhase(doc ? 'editing' : 'intro'); }
  };
  /**
   * The assistant: a request (with the drawn area or the selected layers as context) goes to the edit router;
   * two versions of an area go straight to the region edit. The result is one undo step.
   */
  const runAssistant = async (request: string, variants: 1 | 2, again?: NonNullable<typeof lastAi.current>) => {
    const from = again?.from ?? doc;
    if (!from) return;
    const area = again ? again.region : region, picked = again ? again.selection : selection;
    lastAi.current = { request, variants, region: area, selection: picked, from };
    setWorking('ai'); setError(''); setAiOutcome(null);
    try {
      const { jobId } = area && variants === 2
        ? await api<{ jobId: string }>(`/api/studio/${id}/ai-edit`, { body: { doc: from, box: area, instruction: request, variants } })
        : await api<{ jobId: string }>(`/api/studio/${id}/command`, { body: { doc: from, command: request, selection: picked, ...(area ? { box: area } : {}) } });
      const { doc: next, result } = await waitForResult(jobId);
      const pixels = next.baseFile !== from.baseFile;
      history.apply(area && variants === 2 ? { ...from, baseFile: next.baseFile } : next);
      setAiOutcome({
        understood: result.understood, refused: result.refused, before: from.baseFile, pixels, candidates: result.candidates,
        applied: result.applied ?? (pixels ? [t('Edited the area', 'تم تعديل المنطقة')] : []), warnings: result.warnings ?? [], notes: result.notes ?? [],
      });
      setRegion(null);
    } catch (e) { setError(errorMessage(e, '')); }
    setWorking(null);
  };
  const extract = async (object: StudioObject) => {
    if (!doc) return;
    setWorking('extract'); setError(''); setHighlight(object.box);
    try {
      const { jobId } = await api<{ jobId: string }>(`/api/studio/${id}/extract`, { body: { doc, box: object.box, label: object.label, objectId: object.id } });
      const next = await waitForJob(jobId);
      history.apply(next);
      const added = next.layers.find((l) => !doc.layers.some((o) => o.id === l.id));
      setSelection(added ? [added.id] : []);
      toast.success(t('Object lifted into a layer', 'تم فصل العنصر في طبقة'), object.label);
    } catch (e) { setError(errorMessage(e, '')); }
    setHighlight(null); setWorking(null);
  };
  const save = async () => {
    if (!doc) return;
    setSaving(true); setError('');
    try {
      const result = await api<{ problems: string[] }>(`/api/studio/${id}/render`, { body: { doc, note: t('Studio edit', 'تعديل من الاستوديو') } });
      dropDraft(id); writeDraft.current = null;
      if (result.problems.length) toast.info(t('Saved with notes', 'تم الحفظ مع ملاحظات'), result.problems.join(' '));
      navigate(`/content/${id}`);
    } catch (e) { setError(errorMessage(e, '')); }
    setSaving(false);
  };
  const restoreDraft = () => {
    if (!draft) return;
    if (doc) history.apply(draft.doc); else history.reset(draft.doc);
    setDraft(null); setPhase('editing'); setSelection([]);
  };

  const colors = doc ? docColors(doc) : [];
  const editText = (layerId: string) => { setSelection([layerId]); setEditing(layerId); };
  const only = doc && selection.length === 1 ? doc.layers.find((l) => l.id === selection[0]) : undefined;
  const menuEntries = doc ? selectionMenu(t, doc, selection, command, {
    copy: () => { copy(); toast.success(t('Copied', 'تم النسخ')); },
    cut: () => { copy(); history.apply(removeLayers(doc, selection)); setSelection([]); },
    paste: () => pasteFrom(clipboard.current),
    canPaste: clipboard.current.length > 0,
    editText: only?.kind === 'text' && !only.locked ? () => editText(only.id) : undefined,
  }) : [];

  return <div className="studio">
    <header className="studio__bar glass">
      <button type="button" className="ui-link" onClick={() => navigate(`/content/${id}`)}><ArrowRight size={15} className="studio__back" /> {t('Back to the post', 'رجوع للمنشور')}</button>
      {phase === 'editing' && <div className="studio__tools" role="toolbar" aria-label={t('Tools', 'الأدوات')}>
        <button type="button" aria-pressed={tool === 'select'} onClick={() => { setTool('select'); setRegion(null); }} title={t('Select (V)', 'تحديد (V)')}><MousePointer2 size={15} /> <span>{t('Select', 'تحديد')}</span></button>
        <button type="button" aria-pressed={tool === 'ai'} onClick={() => setTool('ai')} title={t('Describe any change; draw a box to limit it to one area', 'اكتب أي تعديل؛ وارسم مربعًا لحصره في منطقة')}><Wand2 size={15} /> <span>{t('AI edit', 'تعديل بالذكاء')}</span></button>
        <span className="studio__tools-sep" aria-hidden />
        <Menu label={t('Add text', 'أضف نصًا')} align="start" trigger={(p) => <button type="button" {...p} title={t('Add text (T)', 'أضف نصًا (T)')}><Type size={15} /> <span>{t('Text', 'نص')}</span></button>} items={[
          { key: 'h', label: t('Heading', 'عنوان رئيسي'), icon: <Heading1 size={15} />, onSelect: () => addText('heading') },
          { key: 's', label: t('Subheading', 'عنوان فرعي'), icon: <Heading2 size={15} />, onSelect: () => addText('subheading') },
          { key: 'b', label: t('Body text', 'نص عادي'), icon: <Pilcrow size={15} />, onSelect: () => addText('body') },
        ]} />
        <Menu label={t('Add a shape', 'أضف شكلًا')} align="start" trigger={(p) => <button type="button" {...p}><Shapes size={15} /> <span>{t('Shape', 'شكل')}</span></button>} items={[
          { key: 'button', label: t('Button', 'زر'), icon: <RectangleHorizontal size={15} />, onSelect: () => addShape('button') },
          { key: 'rect', label: t('Rectangle', 'مستطيل'), icon: <Square size={15} />, onSelect: () => addShape('rect') },
          { key: 'circle', label: t('Circle', 'دائرة'), icon: <Circle size={15} />, onSelect: () => addShape('circle') },
          { key: 'line', label: t('Line', 'خط'), icon: <Minus size={15} />, onSelect: () => addShape('line') },
        ]} />
        <button type="button" disabled={Boolean(working)} onClick={() => fileInput.current?.click()} title={t('Add a picture — or drop / paste one on the design', 'أضف صورة — أو اسحبها أو الصقها على التصميم')}><ImagePlus size={15} /> <span>{t('Image', 'صورة')}</span></button>
        <span className="studio__tools-sep" aria-hidden />
        <button type="button" disabled={!history.canUndo} onClick={history.undo} aria-label={t('Undo', 'تراجع')} title={t('Undo (⌘Z)', 'تراجع (⌘Z)')}><Undo2 size={15} /></button>
        <button type="button" disabled={!history.canRedo} onClick={history.redo} aria-label={t('Redo', 'إعادة')} title={t('Redo (⇧⌘Z)', 'إعادة (⇧⌘Z)')}><Redo2 size={15} /></button>
      </div>}
      {phase === 'editing' && <div className="studio__bar-end">
        {imageUrl && <button type="button" className="studio__hold" aria-pressed={compare} title={t('Hold to see the original design', 'اضغط مطولًا لرؤية التصميم الأصلي')}
          onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} onKeyDown={(e) => { if (e.key === ' ') setCompare(true); }} onKeyUp={() => setCompare(false)}>
          <Columns2 size={15} /> <span>{t('Original', 'الأصل')}</span></button>}
        <button type="button" className="studio__hold" onClick={() => setShortcuts(true)} aria-label={t('Keyboard shortcuts', 'اختصارات لوحة المفاتيح')} title={t('Keyboard shortcuts (?)', 'اختصارات لوحة المفاتيح (?)')}><Keyboard size={15} /></button>
        <Button size="sm" variant="ghost" className="studio__rebuild" icon={<RefreshCw size={14} />} disabled={Boolean(working)} onClick={() => void makeEditable()} title={t('Split the original design into layers again (uses AI credit)', 'افصل التصميم الأصلي إلى طبقات من جديد (يستهلك رصيدًا)')}>{t('Rebuild layers', 'أعد فصل الطبقات')}</Button>
        <Button variant="primary" busy={saving} icon={<Save size={15} />} onClick={() => void save()}>{t('Save as new version', 'احفظ كنسخة جديدة')}</Button>
      </div>}
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
    </header>
    {doc?.notices?.map((notice, i) => <p key={i} className="u-sm u-muted" role="status">{notice}</p>)}
    {error && <p role="alert" className="creative-home__error">{error}</p>}
    {draft && <div className="studio__draft glass" role="status">
      <RotateCcw size={16} />
      <span>{t('You have unsaved changes from', 'لديك تعديلات غير محفوظة من')} <time className="u-tnum">{new Date(draft.at).toLocaleString()}</time></span>
      <Button size="sm" variant="primary" onClick={restoreDraft}>{t('Restore', 'استرجعها')}</Button>
      <Button size="sm" variant="ghost" onClick={() => { dropDraft(id); setDraft(null); }}>{t('Discard', 'تجاهلها')}</Button>
    </div>}

    {phase !== 'editing' && <div className="studio__intro">
      <div className={`studio__preview${phase === 'decomposing' ? ' is-scanning' : ''}`}>{imageUrl && <img src={imageUrl} alt="" />}<span className="studio__scan" aria-hidden /></div>
      <div className="studio__intro-text glass">
        <Sparkles size={22} />
        <h2>{phase === 'decomposing' ? t('Splitting the design into layers…', 'جارٍ فصل التصميم إلى طبقات…') : t('Choose what to make editable', 'اختَر العناصر المراد تعديلها')}</h2>
        <p>{t('Text-only extraction preserves artwork, icons and badges. Unchanged text keeps its original glyphs; edited wording uses the brand fonts. Extracting flat shapes also reconstructs their appearance.', 'استخراج النصوص فقط يحافظ على الرسومات والأيقونات والبادجات. يحتفظ النص غير المعدّل بشكله الأصلي؛ تعديل الصياغة يستخدم خطوط الهوية. استخراج الأشكال أيضًا يعيد بناء مظهرها.')}</p>
        <label className="studio__split-mode">{t('Extraction', 'الاستخراج')}<select value={splitMode} disabled={phase === 'decomposing'} onChange={e => setSplitMode(e.target.value as 'text' | 'all')}><option value="text">{t('Text only · preserve artwork', 'النصوص فقط · الحفاظ على الرسومات')}</option><option value="all">{t('Text and flat shapes · reconstruct appearance', 'النصوص والأشكال المسطّحة · إعادة بناء المظهر')}</option></select></label>
        <Button variant="primary" disabled={phase !== 'intro'} busy={phase === 'decomposing'} icon={<Sparkles size={16} />} onClick={() => void makeEditable()}>{phase === 'decomposing' ? t('About a minute', 'نحو دقيقة') : t('Make editable', 'ابدأ التعديل')}</Button>
      </div>
    </div>}

    {phase === 'editing' && doc && <div className="studio__workspace">
      <div className="studio__canvas-wrap">
        <StudioCanvas doc={doc} outlines={outlines} selection={selection} tool={tool} region={region} highlight={highlight} working={Boolean(working)}
          editing={editing} compare={compare} originalUrl={imageUrl} baseOverride={peek && aiOutcome?.pixels ? aiOutcome.before : undefined}
          toolbar={<StudioQuickBar doc={doc} selection={selection} colors={colors} onPatch={patchSelection} onCommit={history.commit} onCommand={command} onEditText={editText} onMore={setMenu} />}
          onSelect={select} onLive={history.live} onCommit={history.commit} onRegion={setRegion} onEdit={setEditing}
          onContextMenu={setMenu} onDropFiles={(files, at) => { for (const f of files.slice(0, 4)) void upload(f, at); }} />
        {working && <p className="studio__status glass" role="status"><Loader2 className="creative-job__spin" size={15} /> {working === 'extract' ? t('Lifting the object into a layer…', 'جارٍ فصل العنصر في طبقة…') : working === 'upload' ? t('Adding the image…', 'جارٍ إضافة الصورة…') : t('Editing with AI…', 'جارٍ التعديل بالذكاء الاصطناعي…')}</p>}
        {tool === 'ai' && !working && <p className="studio__status glass"><MousePointerClick size={15} /> {region ? t('Describe the change in the panel.', 'اكتب التعديل في اللوحة الجانبية.') : t('Write the change in the panel, or draw a box over one area.', 'اكتب التعديل في اللوحة، أو ارسم مربعًا حول منطقة.')}</p>}
      </div>
      {tool === 'ai' ? (
        <StudioAiPanel region={region} selectionCount={selection.length} working={working === 'ai'} outcome={aiOutcome} baseFile={doc.baseFile}
          onRun={(request, variants) => void runAssistant(request, variants)} onClearRegion={() => setRegion(null)} onClearSelection={() => setSelection([])}
          onPick={(file) => history.apply({ ...doc, baseFile: file })} onUndo={() => { history.undo(); setAiOutcome(null); }}
          onRetry={() => { const last = lastAi.current; if (last) void runAssistant(last.request, last.variants, last); }} onPeek={setPeek} />
      ) : (
        <StudioPanel doc={doc} selection={selection} heights={heights} colors={colors} busy={Boolean(working)}
          onSelect={(ids, additive) => setSelection(additive ? [...new Set([...selection, ...ids])] : ids)}
          onPatch={patchSelection} onPatchLayer={patchLayer} onCommit={history.commit} onCommand={command}
          onReorder={(layerId, index) => history.apply(moveLayerTo(doc, layerId, index))}
          onExtract={(o) => void extract(o)} onAiObject={(o) => { setTool('ai'); setSelection([]); setRegion(o.box); }} onHighlight={(o) => setHighlight(o?.box ?? null)} />
      )}
    </div>}

    {menu && doc && <StudioContextMenu at={menu} entries={menuEntries} onClose={() => setMenu(null)} />}
    {shortcuts && <Shortcuts onClose={() => setShortcuts(false)} />}
  </div>;
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const rows: [string, string, string][] = [
    ['V', 'Select tool', 'أداة التحديد'], ['T', 'Add a heading', 'إضافة عنوان'], ['Enter', 'Edit the selected text (or double-click it)', 'تعديل النص المحدد (أو اضغط عليه مرتين)'],
    ['⌘C  ⌘X  ⌘V', 'Copy, cut, paste (also pictures and text from other apps)', 'نسخ وقص ولصق (وأيضًا الصور والنصوص من برامج أخرى)'], ['⌘D', 'Duplicate', 'تكرار'],
    ['⌫', 'Delete', 'حذف'], ['⌘A', 'Select all', 'تحديد الكل'], ['⌘G  ⇧⌘G', 'Group, ungroup', 'تجميع، فك التجميع'],
    ['⌘]  ⌘[', 'Forward, backward (add ⇧ for front, back)', 'للأمام، للخلف (مع ⇧ للمقدمة، للخلفية)'], ['⌥⇧L', 'Lock or unlock', 'قفل أو إلغاء القفل'],
    ['← ↑ → ↓', 'Nudge 1px (⇧ for 10px)', 'تحريك 1px (مع ⇧ للتحريك 10px)'], ['⇧ + drag', 'Straight move · keep proportions · 15° rotation', 'تحريك مستقيم · الحفاظ على النسب · دوران كل 15°'],
    ['⌥ + drag', 'No snapping · resize from the centre', 'بدون التصاق · تغيير الحجم من المنتصف'], ['Space + drag', 'Pan', 'التنقل'],
    ['⌘ + wheel  ⌘+  ⌘−', 'Zoom', 'تكبير وتصغير'], ['⌘0  ⌘1', 'Fit, 100%', 'ملاءمة، 100%'], ['⌘Z  ⇧⌘Z', 'Undo, redo', 'تراجع، إعادة'],
  ];
  return (
    <div className="studio__modal" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="studio__dialog glass" role="dialog" aria-modal="true" aria-label={t('Keyboard shortcuts', 'اختصارات لوحة المفاتيح')}>
        <header><h3><Keyboard size={16} /> {t('Keyboard shortcuts', 'اختصارات لوحة المفاتيح')}</h3><button type="button" className="studio__icon-btn" onClick={onClose} aria-label={t('Close', 'إغلاق')} autoFocus><X size={16} /></button></header>
        <dl>{rows.map(([k, en, ar]) => <div key={k}><dt><kbd>{t(k, k.replace('drag', 'سحب').replace('wheel', 'العجلة'))}</kbd></dt><dd>{t(en, ar)}</dd></div>)}</dl>
      </div>
    </div>
  );
}
