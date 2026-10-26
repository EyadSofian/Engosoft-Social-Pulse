import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Loader2, MousePointer2, Plus, Save, Sparkles, Trash2, Type, Undo2, Wand2 } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { usePageMeta } from '../../shell/ShellContext';

interface TextLayer { id: string; text: string; x: number; y: number; width: number; size: number; color: string; weight: number; align: 'start' | 'center' | 'end'; lineHeight: number }
interface StudioDoc { version: 'studio:v1'; width: number; height: number; baseFile: string; layers: TextLayer[]; zones: unknown[]; logo: { variantId: string; x: number; y: number; width: number } | null }
interface Box { x: number; y: number; width: number; height: number }
type Tool = 'select' | 'ai';

const ARABIC = /[؀-ۿ]/;
async function waitForJob(jobId: string): Promise<StudioDoc> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 2500));
    const job = await api<{ status: string; doc?: StudioDoc; error?: string }>(`/api/studio/jobs/${jobId}`);
    if (job.status === 'done' && job.doc) return job.doc;
    if (job.status === 'failed') throw new Error(job.error || 'Studio step failed');
  }
}

export function StudioPage({ id }: { id: string }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  usePageMeta(t('Studio', 'الاستوديو'), [{ label: t('Content', 'المحتوى'), to: '/content' }, { label: t('Studio', 'الاستوديو') }]);
  const [doc, setDoc] = useState<StudioDoc | null>(null);
  const [history, setHistory] = useState<StudioDoc[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [phase, setPhase] = useState<'loading' | 'intro' | 'decomposing' | 'editing'>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [region, setRegion] = useState<Box | null>(null);
  const [instruction, setInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    void api<{ doc: StudioDoc | null; imageUrl: string }>(`/api/studio/${id}/doc`).then((r) => {
      setImageUrl(r.imageUrl);
      if (r.doc) { setDoc(r.doc); setPhase('editing'); } else setPhase('intro');
    }).catch((e) => { setError(errorMessage(e, '')); setPhase('intro'); });
  }, [id]);
  useEffect(() => {
    const el = stage.current;
    if (!el || !doc) return;
    const fit = () => setScale(el.clientWidth / doc.width);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc, phase]);

  const commit = useCallback((next: StudioDoc) => { setHistory((h) => (doc ? [...h.slice(-30), doc] : h)); setDoc(next); }, [doc]);
  const patchLayer = (layerId: string, patch: Partial<TextLayer>) => doc && commit({ ...doc, layers: doc.layers.map((l) => l.id === layerId ? { ...l, ...patch } : l) });
  const undo = () => setHistory((h) => { if (!h.length) return h; setDoc(h[h.length - 1]); return h.slice(0, -1); });

  const makeEditable = async () => {
    setPhase('decomposing'); setError('');
    try { const { jobId } = await api<{ jobId: string }>(`/api/studio/${id}/decompose`, { method: 'POST' }); const next = await waitForJob(jobId); setDoc(next); setHistory([]); setPhase('editing'); }
    catch (e) { setError(errorMessage(e, '')); setPhase('intro'); }
  };
  const runAiEdit = async () => {
    if (!doc || !region || !instruction.trim()) return;
    setAiBusy(true); setError('');
    try { const { jobId } = await api<{ jobId: string }>(`/api/studio/${id}/ai-edit`, { body: { doc, box: region, instruction } }); const next = await waitForJob(jobId); commit({ ...doc, baseFile: next.baseFile }); setRegion(null); setInstruction(''); setTool('select'); }
    catch (e) { setError(errorMessage(e, '')); }
    setAiBusy(false);
  };
  const save = async () => {
    if (!doc) return;
    setSaving(true); setError('');
    try { await api(`/api/studio/${id}/render`, { body: { doc, note: t('Studio edit', 'تعديل من الاستوديو') } }); navigate(`/content/${id}`); }
    catch (e) { setError(errorMessage(e, '')); }
    setSaving(false);
  };
  const addLayer = () => {
    if (!doc) return;
    const layer: TextLayer = { id: `t${Date.now().toString(36)}`, text: t('New text', 'نص جديد'), x: Math.round(doc.width * 0.1), y: Math.round(doc.height * 0.45), width: Math.round(doc.width * 0.8), size: 56, color: '#FFFFFF', weight: 800, align: 'start', lineHeight: 1.3 };
    commit({ ...doc, layers: [...doc.layers, layer] }); setSelected(layer.id);
  };

  // Dragging a layer (select tool) or drawing an AI region (AI tool), in document pixels.
  const drag = useRef<{ kind: 'move' | 'region'; startX: number; startY: number; layer?: TextLayer; base?: StudioDoc } | null>(null);
  const toDoc = (event: ReactPointerEvent) => { const rect = stage.current!.getBoundingClientRect(); return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale }; };
  const onStageDown = (event: ReactPointerEvent) => {
    if (tool !== 'ai' || !doc) { setSelected(null); return; }
    const p = toDoc(event);
    drag.current = { kind: 'region', startX: p.x, startY: p.y };
    setRegion({ x: p.x, y: p.y, width: 0, height: 0 });
    (event.target as Element).setPointerCapture(event.pointerId);
  };
  const onLayerDown = (event: ReactPointerEvent, layer: TextLayer) => {
    if (tool !== 'select' || !doc) return;
    event.stopPropagation();
    setSelected(layer.id);
    const p = toDoc(event);
    drag.current = { kind: 'move', startX: p.x, startY: p.y, layer, base: doc };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };
  const onMove = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !doc) return;
    const p = toDoc(event);
    if (d.kind === 'region') setRegion({ x: Math.max(0, Math.min(d.startX, p.x)), y: Math.max(0, Math.min(d.startY, p.y)), width: Math.abs(p.x - d.startX), height: Math.abs(p.y - d.startY) });
    else if (d.layer) setDoc({ ...doc, layers: doc.layers.map((l) => l.id === d.layer!.id ? { ...l, x: Math.round(d.layer!.x + p.x - d.startX), y: Math.round(d.layer!.y + p.y - d.startY) } : l) });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'move' && d.base && doc && JSON.stringify(d.base) !== JSON.stringify(doc)) setHistory((h) => [...h.slice(-30), d.base!]);
    if (d?.kind === 'region' && region && (region.width < 16 || region.height < 16)) setRegion(null);
  };

  const layer = doc?.layers.find((l) => l.id === selected) ?? null;

  return <div className="studio">
    <header className="studio__bar glass">
      <button type="button" className="ui-link" onClick={() => navigate(`/content/${id}`)}><ArrowRight size={15} className="studio__back" /> {t('Back to the post', 'رجوع للمنشور')}</button>
      {phase === 'editing' && <div className="studio__tools" role="toolbar">
        <button type="button" aria-pressed={tool === 'select'} onClick={() => { setTool('select'); setRegion(null); }}><MousePointer2 size={15} /> {t('Select', 'تحديد')}</button>
        <button type="button" aria-pressed={tool === 'ai'} onClick={() => { setTool('ai'); setSelected(null); }}><Wand2 size={15} /> {t('AI edit area', 'تعديل منطقة بالذكاء الاصطناعي')}</button>
        <button type="button" onClick={addLayer}><Plus size={15} /> {t('Text', 'نص')}</button>
        <button type="button" disabled={!history.length} onClick={undo}><Undo2 size={15} /> {t('Undo', 'تراجع')}</button>
      </div>}
      {phase === 'editing' && <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="creative-job__spin" size={15} /> : <Save size={15} />} {t('Save as new version', 'احفظ كنسخة جديدة')}</Button>}
    </header>
    {error && <p role="alert" className="creative-home__error">{error}</p>}

    {(phase === 'intro' || phase === 'decomposing' || phase === 'loading') && <div className="studio__intro">
      <div className={`studio__preview${phase === 'decomposing' ? ' is-scanning' : ''}`}>{imageUrl && <img src={imageUrl} alt="" />}<span className="studio__scan" aria-hidden /></div>
      <div className="studio__intro-text glass">
        <Type size={22} />
        <h2>{phase === 'decomposing' ? t('Separating the text from the design…', 'جارٍ فصل النص عن التصميم…') : t('Make this design editable', 'اجعل التصميم قابلًا للتعديل')}</h2>
        <p>{t('The AI removes the text from the image and rebuilds the background behind it. Every text then becomes a layer you can retype, move, resize or recolor, always rendered in the Engosoft brand fonts. The logo is placed again automatically when you save.', 'يزيل الذكاء الاصطناعي النص من الصورة ويُكمل الخلفية خلفه، ثم يصبح كل نص طبقة مستقلة يمكنك إعادة كتابتها أو تحريكها أو تكبيرها أو تغيير لونها، ويُعرض دائمًا بخط هوية إنجوسوفت. ويُعاد وضع الشعار تلقائيًا عند الحفظ.')}</p>
        <Button variant="primary" disabled={phase !== 'intro'} onClick={() => void makeEditable()}>{phase === 'decomposing' ? <><Loader2 className="creative-job__spin" size={16} /> {t('About a minute', 'نحو دقيقة')}</> : <><Sparkles size={16} /> {t('Make editable', 'ابدأ التعديل')}</>}</Button>
      </div>
    </div>}

    {phase === 'editing' && doc && <div className="studio__workspace">
      <div className="studio__canvas-wrap">
        <div ref={stage} className="studio__canvas" data-tool={tool} style={{ aspectRatio: `${doc.width} / ${doc.height}` }} onPointerDown={onStageDown} onPointerMove={onMove} onPointerUp={onUp}>
          <AnimatePresence mode="popLayout"><motion.img key={doc.baseFile} src={`/api/studio/${doc.baseFile}`} alt="" draggable={false} initial={{ opacity: 0, filter: 'blur(12px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} /></AnimatePresence>
          {doc.layers.map((l) => <div key={l.id} className="studio__layer" data-selected={l.id === selected || undefined} onPointerDown={(e) => onLayerDown(e, l)}
            style={{ left: l.x * scale, top: l.y * scale, width: l.width * scale, fontSize: l.size * scale, color: l.color, fontWeight: l.weight, lineHeight: l.lineHeight, direction: ARABIC.test(l.text) ? 'rtl' : 'ltr', textAlign: l.align === 'center' ? 'center' : l.align, fontFamily: ARABIC.test(l.text) ? 'Almarai, sans-serif' : "'Plus Jakarta Sans', sans-serif" }}>{l.text}</div>)}
          <div className="studio__logo-slot" aria-hidden title={t('The official logo is placed here on save', 'يُضاف الشعار الرسمي عند الحفظ')} style={doc.logo ? { left: doc.logo.x * scale, top: doc.logo.y * scale, width: doc.logo.width * scale } : undefined} />
          {region && <div className={`studio__region${aiBusy ? ' is-working' : ''}`} style={{ left: region.x * scale, top: region.y * scale, width: region.width * scale, height: region.height * scale }} />}
        </div>
      </div>

      <aside className="studio__panel glass">
        {tool === 'ai' ? <div className="studio__ai">
          <h3><Wand2 size={16} /> {t('Edit an area with AI', 'عدّل منطقة بالذكاء الاصطناعي')}</h3>
          <p className="u-sm u-muted">{t('Draw a box over what to change, then describe it. Only that area changes; text layers stay on top.', 'ارسم مربعًا حول ما تريد تغييره واكتب التعديل. تتغير هذه المنطقة وحدها وتبقى النصوص فوقها.')}</p>
          <textarea rows={3} dir="auto" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={t('e.g. replace the tablet with a laptop', 'مثلًا: استبدل الجهاز اللوحي بحاسوب محمول')} />
          <Button variant="primary" disabled={!region || !instruction.trim() || aiBusy} onClick={() => void runAiEdit()}>{aiBusy ? <><Loader2 className="creative-job__spin" size={15} /> {t('Editing…', 'جارٍ التعديل…')}</> : t('Apply', 'نفّذ')}</Button>
          {!region && <small className="u-muted">{t('Draw a box on the image first.', 'ارسم مربعًا على الصورة أولًا.')}</small>}
        </div> : layer ? <div className="studio__inspector">
          <h3><Type size={16} /> {t('Text layer', 'طبقة نص')}</h3>
          <textarea rows={3} dir="auto" value={layer.text} onChange={(e) => patchLayer(layer.id, { text: e.target.value })} />
          <label>{t('Size', 'الحجم')} <input type="range" min={14} max={180} value={layer.size} onChange={(e) => patchLayer(layer.id, { size: Number(e.target.value) })} /><span className="u-tnum">{layer.size}</span></label>
          <label>{t('Width', 'العرض')} <input type="range" min={80} max={doc.width} value={layer.width} onChange={(e) => patchLayer(layer.id, { width: Number(e.target.value) })} /><span className="u-tnum">{layer.width}</span></label>
          <label>{t('Color', 'اللون')} <input type="color" value={layer.color} onChange={(e) => patchLayer(layer.id, { color: e.target.value.toUpperCase() })} />
            <span className="studio__swatches">{['#FFFFFF', '#0046FF', '#FF6600', '#1A1A1A', '#001BB7'].map((c) => <button key={c} type="button" style={{ background: c }} aria-label={c} onClick={() => patchLayer(layer.id, { color: c })} />)}</span></label>
          <label>{t('Weight', 'السُّمك')} <select value={layer.weight} onChange={(e) => patchLayer(layer.id, { weight: Number(e.target.value) })}><option value={300}>Light</option><option value={400}>Regular</option><option value={700}>Bold</option><option value={800}>ExtraBold</option></select></label>
          <label>{t('Align', 'المحاذاة')} <select value={layer.align} onChange={(e) => patchLayer(layer.id, { align: e.target.value as TextLayer['align'] })}><option value="start">{t('Start', 'البداية')}</option><option value="center">{t('Center', 'المنتصف')}</option><option value="end">{t('End', 'النهاية')}</option></select></label>
          <button type="button" className="ui-link studio__delete" onClick={() => { commit({ ...doc, layers: doc.layers.filter((l) => l.id !== layer.id) }); setSelected(null); }}><Trash2 size={14} /> {t('Delete layer', 'احذف الطبقة')}</button>
        </div> : <div className="studio__layers">
          <h3>{t('Layers', 'الطبقات')}</h3>
          <ul>{[...doc.layers].reverse().map((l) => <li key={l.id}><button type="button" onClick={() => setSelected(l.id)}><Type size={13} /><span dir="auto" className="u-truncate">{l.text}</span></button></li>)}
            <li className="studio__layers-fixed">{t('Official logo · placed on save', 'الشعار الرسمي · يُضاف عند الحفظ')}</li>
            <li className="studio__layers-fixed">{t('Background image', 'الصورة الخلفية')}</li></ul>
          <p className="u-xs u-muted">{t('Click a text to edit it. Drag to move. Text is rendered in Almarai / Plus Jakarta Sans on save.', 'انقر أي نص لتعديله واسحبه لتحريكه. يُحفظ النص بخط المراعي / Plus Jakarta Sans.')}</p>
        </div>}
      </aside>
    </div>}
  </div>;
}
