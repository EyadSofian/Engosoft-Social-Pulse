import { useEffect, useMemo, useState } from 'react';
import { Download, ImagePlus, RefreshCw } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { canEditContent } from '../../features/workspace/permissions';
import { POST_SIZES, POST_TEMPLATES, renderPosterSvg, type PostSizeId } from '../../features/post-design/templates';
import { useI18n } from '../../i18n/I18nProvider';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type OdooEvent = { id: string; title: string; startsAt: string; endsAt: string; source: string };

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PostDesignerPage() {
  const { t } = useI18n();
  const { state, me } = useWorkspace();
  const [query, setQuery] = useQueryState();
  usePageMeta(t('Post designer', 'مصمم البوستات'), [{ label: t('AI Studio', 'استوديو الذكاء الاصطناعي'), to: '/ai-studio' }, { label: t('Post designer', 'مصمم البوستات') }]);
  const editable = state.content.filter((entry) => canEditContent(me, entry) && !['published', 'archived', 'cancelled'].includes(entry.status));
  const item = editable.find((entry) => entry.id === query.get('content')) ?? editable[0] ?? null;
  const [channel, setChannel] = useState('instagram');
  const [sizeId, setSizeId] = useState<PostSizeId>('portrait');
  const [templateId, setTemplateId] = useState(POST_TEMPLATES[0].id);
  const [title, setTitle] = useState(item?.title ?? 'مهاراتك تفتح لك فرص جديدة');
  const [eyebrow, setEyebrow] = useState('ENGOSOFT · تعلّم وتطوّر');
  const [body, setBody] = useState(item?.caption ?? 'تعلم بطرق عملية مع خبراء المجال.');
  const [cta, setCta] = useState('سجّل الآن');
  const [detail, setDetail] = useState('');
  const [prompt, setPrompt] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [imageState, setImageState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [imageMessage, setImageMessage] = useState('');
  const [events, setEvents] = useState<OdooEvent[]>([]);
  const [odooState, setOdooState] = useState('');

  useEffect(() => {
    setTitle(item?.title ?? 'مهاراتك تفتح لك فرص جديدة');
    setBody(item?.caption ?? 'تعلم بطرق عملية مع خبراء المجال.');
    setImageDataUrl('');
  }, [item?.id]);
  useEffect(() => {
    void fetch('/api/odoo/schedule').then(async (response) => {
      const data = await response.json();
      setEvents(data.events ?? []);
      setOdooState(data.status === 'connected' ? '' : (data.message ?? 'Odoo غير متصل'));
    }).catch(() => setOdooState('Odoo غير متاح الآن'));
  }, []);

  const selected = POST_TEMPLATES.find((entry) => entry.id === templateId) ?? POST_TEMPLATES[0];
  const sizes = POST_SIZES.filter((entry) => (entry.channels as readonly string[]).includes(channel));
  const data = { title, eyebrow, body, cta, detail, imageDataUrl };
  const svg = useMemo(() => renderPosterSvg(selected, sizeId, data), [selected, sizeId, title, eyebrow, body, cta, detail, imageDataUrl]);
  const preview = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, [svg]);
  const size = POST_SIZES.find((entry) => entry.id === sizeId)!;

  const generateImage = async () => {
    setImageState('loading'); setImageMessage('');
    try {
      const response = await fetch('/api/ai/post-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: prompt || title, size: sizeId }) });
      const result = await response.json();
      if (!response.ok || !result.imageDataUrl) throw new Error(result.error ?? 'تعذّر توليد الصورة');
      setImageDataUrl(result.imageDataUrl);
      setImageState('ready');
    } catch (error) { setImageState('error'); setImageMessage(error instanceof Error ? error.message : 'تعذّر توليد الصورة'); }
  };
  const exportPng = async () => {
    const image = new Image();
    image.src = preview;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0, size.width, size.height);
    canvas.toBlob((blob) => { if (blob) download(`${selected.id}-${size.id}.png`, blob); }, 'image/png');
  };

  return <div className="u-stack">
    <PageHeader title={t('Post designer', 'مصمم البوستات')} description={t('Build a post from its content, choose an SVG layout and export the right size for each platform.', 'حوّل عنصر المحتوى إلى بوست: اختر قالب SVG ومقاس المنصة، ثم نزّل التصميم.')} />
    <div className="post-designer">
      <div className="post-designer__controls u-stack">
        <label className="post-designer__field">{t('Content item', 'عنصر المحتوى')}
          <select value={item?.id ?? ''} onChange={(event) => setQuery({ content: event.target.value || null })}>
            {editable.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
          </select>
        </label>
        {!item && <p className="u-sm u-muted">{t('Create a content item first to attach this design to its workflow.', 'أنشئ عنصر محتوى أولًا حتى يرتبط التصميم بمسار المراجعة.')} <Link to="/content">{t('Open content', 'افتح المحتوى')}</Link></p>}
        <div className="post-designer__fields">
          <label className="post-designer__field">{t('Platform', 'المنصة')}
            <select value={channel} onChange={(event) => { const next = event.target.value; setChannel(next); const first = POST_SIZES.find((entry) => (entry.channels as readonly string[]).includes(next)); if (first) setSizeId(first.id); }}>
              {['instagram', 'facebook', 'linkedin', 'tiktok', 'snapchat', 'website'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label className="post-designer__field">{t('Format', 'المقاس')}
            <select value={sizeId} onChange={(event) => setSizeId(event.target.value as PostSizeId)}>
              {sizes.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {entry.width}×{entry.height}</option>)}
            </select>
          </label>
        </div>
        <label className="post-designer__field">{t('Odoo schedule', 'موعد من Odoo')}
          <select defaultValue="" onChange={(event) => { const found = events.find((entry) => entry.id === event.target.value); if (found) { setTitle(found.title); setDetail(new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(found.startsAt))); } }}>
            <option value="">{events.length ? t('Choose a course or event', 'اختر كورس أو إيفنت') : (odooState || t('Loading…', 'جارٍ التحميل…'))}</option>
            {events.map((entry) => <option key={entry.id} value={entry.id}>{entry.title} · {entry.startsAt.slice(0, 10)}</option>)}
          </select>
        </label>
        <div className="post-designer__fields">
          <label className="post-designer__field">{t('Headline', 'العنوان')}<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={130} dir="auto" /></label>
          <label className="post-designer__field">{t('Label', 'التصنيف')}<input value={eyebrow} onChange={(event) => setEyebrow(event.target.value)} maxLength={30} dir="auto" /></label>
        </div>
        <label className="post-designer__field">{t('Post message', 'نص البوست')}<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={260} dir="auto" /></label>
        <div className="post-designer__fields">
          <label className="post-designer__field">{t('Date or detail', 'الموعد أو التفاصيل')}<input value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={90} dir="auto" /></label>
          <label className="post-designer__field">{t('Call to action', 'دعوة الإجراء')}<input value={cta} onChange={(event) => setCta(event.target.value)} maxLength={28} dir="auto" /></label>
        </div>
        <div className="post-designer__ai">
          <label className="post-designer__field">{t('AI picture subject', 'وصف الصورة للذكاء الاصطناعي')}<input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t('Describe the visual, without text', 'صف المشهد، بدون كتابة داخل الصورة')} dir="auto" /></label>
          <Button onClick={() => void generateImage()} disabled={imageState === 'loading'}><ImagePlus size={16} />{imageState === 'loading' ? t('Generating…', 'جارٍ التوليد…') : t('Generate image', 'ولّد صورة')}</Button>
          {imageState === 'error' && <p role="alert" className="u-sm">{imageMessage}</p>}
          {imageState === 'ready' && <button type="button" className="ui-link" onClick={() => setImageDataUrl('')}><RefreshCw size={14} /> {t('Remove generated image', 'احذف الصورة المولّدة')}</button>}
        </div>
      </div>
      <div className="post-designer__gallery">
        <p className="u-sm u-muted">{t('SVG layout library · 15 editable designs', 'مكتبة SVG · 15 تصميم قابل للتعديل')}</p>
        <div className="post-designer__templates">
          {POST_TEMPLATES.map((entry) => <button type="button" key={entry.id} className="post-designer__template" aria-pressed={templateId === entry.id} onClick={() => setTemplateId(entry.id)}>
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderPosterSvg(entry, 'square', { title: entry.name, eyebrow: 'ENGOSOFT', body: '', cta: 'ابدأ الآن' }))}`} alt="" />
            <span>{entry.name}</span>
          </button>)}
        </div>
        <div className="post-designer__output">
          <img src={preview} alt={t(`Preview: ${title}`, `معاينة: ${title}`)} />
          <div className="u-row u-row--wrap">
            <Button onClick={() => download(`${selected.id}-${size.id}.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))}><Download size={16} /> SVG</Button>
            <Button variant="secondary" onClick={() => void exportPng()}><Download size={16} /> PNG</Button>
            <span className="u-sm u-muted" dir="ltr">{size.width} × {size.height}</span>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
