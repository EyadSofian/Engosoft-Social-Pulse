import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Download, ImagePlus, RefreshCw, Save, Sparkles } from 'lucide-react';
import { Link, useQueryState, useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import type { Channel } from '../../domain/shared';
import { canEditContent } from '../../features/workspace/permissions';
import { POST_SIZES, POST_TEMPLATES, SAMPLE_IMAGE_BY_TEMPLATE, renderPosterSvg, templateLogoPlacement, type PostSizeId } from '../../features/post-design/templates';
import { APPROVED_LOGO, loadLogoDataUrls, normalizeLogoVariant, validateBrand, type LogoHrefs, type LogoVariant } from '../../features/brand/approved';
import { readBrief } from '../../features/creative-studio/brief';
import { composeCreativeDesign, renderCreativeSvg, upgradeLegacyDesign, type LayeredDesign } from '../../features/creative-studio/creative-renderer';
import { DIRECTION_SAMPLE_IMAGE, type CreativeDirection } from '../../features/creative-studio/design-plan';
import { getDesignDocument, saveDesignVersion, type DesignDocument, type DesignSnapshot } from '../../features/creative-studio/documents';
import { PLATFORM_FORMATS, type CreativePlatform, type PlatformVariant } from '../../features/creative-studio/platforms';
import { useI18n } from '../../i18n/I18nProvider';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type OdooEvent = { id: string; title: string; startsAt: string; endsAt: string; source: string };
const FabricCanvasProof = lazy(() => import('../../features/creative-studio/FabricCanvasProof').then((module) => ({ default: module.FabricCanvasProof })));

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
  const { state, me, createContent, editContent, transition } = useWorkspace();
  const { navigate } = useRouter();
  const [query, setQuery] = useQueryState();
  usePageMeta(t('Post designer', 'مصمم المنشورات'), [{ label: t('AI Studio', 'استوديو الذكاء الاصطناعي'), to: '/ai-studio' }, { label: t('Post designer', 'مصمم المنشورات') }]);
  const editable = state.content.filter((entry) => canEditContent(me, entry) && !['published', 'archived', 'cancelled'].includes(entry.status));
  const fromBrief = query.get('from') === 'brief';
  const directTemplate = query.get('template');
  const draftParam = query.get('draft');
  const item = query.get('content') ? (editable.find((entry) => entry.id === query.get('content')) ?? null) : (fromBrief || directTemplate || draftParam ? null : editable[0] ?? null);
  const [brief, setBrief] = useState(() => fromBrief ? readBrief() : null);
  const [variants, setVariants] = useState<PlatformVariant[]>(() => fromBrief ? readBrief()?.variants ?? [] : []);
  const [compare, setCompare] = useState(false);
  const [draftId, setDraftId] = useState(() => draftParam || (fromBrief ? readBrief()?.id : null) || crypto.randomUUID());
  const [savedDocument, setSavedDocument] = useState<DesignDocument | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [channel, setChannel] = useState('instagram');
  const [sizeId, setSizeId] = useState<PostSizeId>('portrait');
  const [templateId, setTemplateId] = useState(POST_TEMPLATES[0].id);
  const [direction, setDirection] = useState<CreativeDirection | null>(() => {
    const initial = fromBrief ? readBrief() : null;
    return initial?.directions.find((entry) => entry.id === (query.get('direction') || initial.selectedDirectionId)) ?? null;
  });
  const [title, setTitle] = useState(item?.title ?? 'مهاراتك تفتح لك فرص جديدة');
  const [eyebrow, setEyebrow] = useState('ENGOSOFT · تعلّم وتطوّر');
  const [body, setBody] = useState(item?.caption ?? 'تعلم بطرق عملية مع خبراء المجال.');
  const [cta, setCta] = useState('سجّل الآن');
  const [detail, setDetail] = useState('');
  const [prompt, setPrompt] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [imageCandidates, setImageCandidates] = useState<string[]>([]);
  const [imageState, setImageState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [imageMessage, setImageMessage] = useState('');
  const [showFabric, setShowFabric] = useState(false);
  const [canvasOverride, setCanvasOverride] = useState<{ key: string; design: LayeredDesign } | null>(null);
  const [editCommand, setEditCommand] = useState('');
  const [editState, setEditState] = useState<'idle' | 'loading'>('idle');
  const [editMessage, setEditMessage] = useState('');
  const [useReferenceImage, setUseReferenceImage] = useState(true);
  const [events, setEvents] = useState<OdooEvent[]>([]);
  const [odooState, setOdooState] = useState('');
  const [logoHrefs, setLogoHrefs] = useState<LogoHrefs>({});
  const logoReady = Object.keys(logoHrefs).length === 4;
  const [logoVariant, setLogoVariant] = useState<LogoVariant | 'auto'>('auto');
  useEffect(() => {
    if (imageDataUrl || draftParam) return;
    const samplePath = direction ? DIRECTION_SAMPLE_IMAGE[direction.family] : SAMPLE_IMAGE_BY_TEMPLATE[templateId];
    if (!samplePath) return;
    let active = true;
    void fetch(samplePath).then((response) => response.blob()).then((blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
    })).then((sample) => { if (active) setImageDataUrl((current) => current || sample); }).catch(() => {});
    return () => { active = false; };
  }, [templateId, direction, imageDataUrl, draftParam]);

  useEffect(() => {
    let active = true;
    // Data URLs make exported SVG files self-contained.
    void loadLogoDataUrls().then((hrefs) => { if (active) setLogoHrefs(hrefs); }).catch(() => { if (active) setLogoHrefs({}); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (fromBrief) {
      const next = readBrief();
      setBrief(next);
      if (next) {
        setVariants(next.variants);
        setDirection(next.directions.find((entry) => entry.id === (query.get('direction') || next.selectedDirectionId)) ?? next.directions[0] ?? null);
        setChannel(next.platform); setSizeId(next.sizeId); setTemplateId(next.templateId);
        setTitle(next.variants[0]?.headline || next.headline); setBody(next.variants[0]?.caption || next.supportingCopy); setCta(next.cta);
        setDetail(next.verifiedEvent ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: 'Africa/Cairo' }).format(new Date(next.verifiedEvent.startsAt)) : '');
        setPrompt(next.visualDirection); setEyebrow(next.objective.replaceAll('_', ' '));
      }
    } else if (!draftParam) {
      setBrief(null);
      setDirection(null);
      setVariants([]);
      setTitle(item?.title ?? 'مهاراتك تفتح لك فرص جديدة');
      setBody(item?.caption ?? 'تعلم بطرق عملية مع خبراء المجال.');
      if (directTemplate && POST_TEMPLATES.some((entry) => entry.id === directTemplate)) setTemplateId(directTemplate);
    }
    setImageDataUrl('');
  }, [item?.id, fromBrief, directTemplate, draftParam]);
  useEffect(() => {
    if (!draftParam) return;
    let active = true;
    void getDesignDocument(draftParam).then((record) => {
      if (!active || !record?.versions[0]) return;
      setDraftId(draftParam); setSavedDocument(record);
      const version = record.versions[0];
      setDirection(version.direction ?? null);
      setLogoVariant(normalizeLogoVariant(version.logoVariant));
      setVariants(version.variants ?? []);
      setTemplateId(version.templateId); setChannel(version.platform); setSizeId(version.sizeId);
      setImageDataUrl(version.layers.backgroundImage); setEyebrow(version.layers.eyebrow);
      setTitle(version.layers.headline); setBody(version.layers.body); setDetail(version.layers.detail); setCta(version.layers.cta);
    }).catch(() => { if (active) setSaveMessage(t('Saved draft could not be opened.', 'تعذّر فتح المسودة المحفوظة.')); });
    return () => { active = false; };
  }, [draftParam]);
  useEffect(() => {
    void fetch('/api/odoo/schedule').then(async (response) => {
      const data = await response.json();
      setEvents(data.events ?? []);
      setOdooState(data.status === 'connected' ? '' : (data.message ?? 'Odoo غير متصل'));
    }).catch(() => setOdooState('Odoo غير متاح الآن'));
  }, []);

  const selected = POST_TEMPLATES.find((entry) => entry.id === templateId) ?? POST_TEMPLATES[0];
  const sizes = POST_SIZES.filter((entry) => channel === 'whatsapp' ? entry.id === 'story' : (entry.channels as readonly string[]).includes(channel));
  const data = { title, eyebrow, body, cta, detail, imageDataUrl };
  const canvasKey = JSON.stringify([direction?.id, sizeId, title, eyebrow, body, cta, detail, imageDataUrl.length, imageDataUrl.slice(0, 80), logoReady, logoVariant]);
  const baseDesign = useMemo(() => direction ? composeCreativeDesign(direction, sizeId, { headline: title, eyebrow, body, cta, detail, imageDataUrl }, logoHrefs, logoVariant) : null, [direction, sizeId, title, eyebrow, body, cta, detail, imageDataUrl, logoHrefs, logoVariant]);
  const activeDesign = canvasOverride?.key === canvasKey ? canvasOverride.design : baseDesign;
  const svg = useMemo(() => activeDesign ? renderCreativeSvg(activeDesign) : renderPosterSvg(selected, sizeId, data, logoHrefs), [activeDesign, selected, sizeId, title, eyebrow, body, cta, detail, imageDataUrl, logoHrefs]);
  const preview = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, [svg]);
  const size = POST_SIZES.find((entry) => entry.id === sizeId)!;
  const currentVariant = variants.find((entry) => entry.platform === channel);
  const allVariants = variants.map((entry) => entry.platform === channel ? { ...entry, headline: title, caption: body, sizeId, templateId } : entry);
  const switchPlatform = (nextPlatform: CreativePlatform) => {
    const updated = allVariants;
    setVariants(updated);
    const next = updated.find((entry) => entry.platform === nextPlatform);
    if (!next) return;
    setChannel(next.platform); setSizeId(next.sizeId); setTemplateId(next.templateId);
    setTitle(next.headline); setBody(next.caption);
  };
  const activeLogo = activeDesign?.layers.find((layer) => layer.type === 'logo');
  const templateLogo = templateLogoPlacement(selected, sizeId, Boolean(imageDataUrl));
  const checks = validateBrand({ logoReady, logoX: activeLogo?.x ?? templateLogo.x, logoY: activeLogo?.y ?? templateLogo.y, logoWidth: activeLogo?.width ?? templateLogo.width, logoVariant: activeLogo?.variant ?? templateLogo.variant, canvasWidth: 1080, title });

  const generateImage = async () => {
    setImageState('loading'); setImageMessage('');
    try {
      const referenceImageDataUrl = useReferenceImage ? brief?.references.find((reference) => reference.mime.startsWith('image/') && reference.dataUrl)?.dataUrl : undefined;
      const response = await fetch('/api/ai/post-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: brief?.prompt || prompt || title, objective: brief?.objective || 'general', direction, size: sizeId, referenceImageDataUrl, count: 3 }) });
      const result = await response.json();
      if (!response.ok || !result.imageDataUrl) throw new Error(result.error ?? 'تعذّر توليد الصورة');
      setImageCandidates(result.imageDataUrls ?? [result.imageDataUrl]);
      setImageDataUrl(result.imageDataUrl);
      setImageMessage(result.candidateScores?.length ? `${t('Quality scores', 'تقييم الجودة')}: ${result.candidateScores.join(' · ')} / 100` : '');
      setImageState('ready');
    } catch (error) { setImageState('error'); setImageMessage(error instanceof Error ? error.message : 'تعذّر توليد الصورة'); }
  };
  const applyAiEdit = async () => {
    if (editCommand.trim().length < 3) return;
    setEditState('loading'); setEditMessage('');
    try {
      const response = await fetch('/api/ai/creative-edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: editCommand, platform: channel, headline: title, body, cta, detail, visualDirection: prompt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذّر تطبيق التعديل');
      setTitle(result.headline); setBody(result.body); setCta(result.cta); setDetail(result.detail); setPrompt(result.visualDirection);
      setEditMessage(result.explanation);
      setEditCommand('');
      if (result.action === 'regenerate_image' || result.action === 'both') setEditMessage(`${result.explanation} ${t('Use Generate image to review the new visual.', 'استخدم «ولّد صورة» لمراجعة الصورة الجديدة.')}`);
    } catch (error) { setEditMessage(error instanceof Error ? error.message : 'تعذّر تطبيق التعديل'); }
    finally { setEditState('idle'); }
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
  const restoreVersion = (version: DesignSnapshot) => {
    setVariants(version.variants ?? []);
    setDirection(version.direction ?? null);
    setTemplateId(version.templateId); setChannel(version.platform); setSizeId(version.sizeId);
    setImageDataUrl(version.layers.backgroundImage); setEyebrow(version.layers.eyebrow);
    setTitle(version.layers.headline); setBody(version.layers.body); setDetail(version.layers.detail); setCta(version.layers.cta);
    setCanvasOverride(version.canvasDocument ? { key: JSON.stringify([version.direction?.id, version.sizeId, version.layers.headline, version.layers.eyebrow, version.layers.body, version.layers.cta, version.layers.detail, version.layers.backgroundImage.length, version.layers.backgroundImage.slice(0, 80), logoReady, normalizeLogoVariant(version.logoVariant)]), design: upgradeLegacyDesign(version.canvasDocument, logoHrefs) } : null);
    setLogoVariant(normalizeLogoVariant(version.logoVariant));
    setSaveMessage(t('Version restored. Save to keep it as the latest version.', 'استُعيدت النسخة. احفظها لتصبح أحدث نسخة.'));
  };
  const save = async (): Promise<boolean> => {
    try {
      const record = await saveDesignVersion(draftId, title || 'Untitled post', { templateId, direction: direction ?? undefined, platform: channel, sizeId, variants: allVariants, canvasDocument: activeDesign ?? undefined, logoVariant, layers: {
        backgroundImage: imageDataUrl, eyebrow, headline: title, body, detail, cta,
        approvedLogo: { locked: true, assetId: APPROVED_LOGO.id },
      } });
      setSavedDocument(record); setSaveMessage(t('Draft version saved in this browser.', 'حُفظت نسخة من المسودة في المتصفح.'));
      if (!draftParam) setQuery({ draft: draftId, from: null, template: null });
      return true;
    } catch { setSaveMessage(t('Could not save this draft in the browser.', 'تعذّر حفظ المسودة في المتصفح.')); return false; }
  };
  const sendToReview = async () => {
    if (checks.length || !await save()) return;
    const channels = (allVariants.length ? allVariants.map((variant) => variant.platform) : [channel]).filter((value): value is Channel => ['facebook','instagram','whatsapp','linkedin','tiktok','snapchat','website'].includes(value));
    const versions = allVariants.map((variant) => ({ channel: variant.platform as Channel, caption: variant.caption, note: `${PLATFORM_FORMATS[variant.platform].format} · ${variant.sizeId}` }));
    let contentId = item?.id;
    if (contentId) {
      const updated = editContent(contentId, { title, caption: body, channels, versions, designDocumentId: draftId });
      if (!updated.ok) { setSaveMessage(t('Could not update the content item.', 'تعذّر تحديث عنصر المحتوى.')); return; }
    } else {
      const created = createContent({ title, caption: body, type: 'post', departmentId: me.departmentId ?? 'marketing', channels, templateId: null, courseId: null, dueAt: null, status: 'draft', assigneeId: null, priority: 'normal', designDocumentId: draftId });
      if (!created.ok || !created.id) { setSaveMessage(t('Could not create a content item for review.', 'تعذّر إنشاء عنصر للمراجعة.')); return; }
      contentId = created.id;
      if (versions.length) editContent(contentId, { versions });
    }
    const result = transition(contentId, { to: 'ready_for_review' });
    if (!result.ok) { setSaveMessage(t('Draft saved. Open the content item to submit it for review.', 'حُفظت المسودة. افتح عنصر المحتوى لإرساله للمراجعة.')); navigate(`/content/${contentId}`); return; }
    navigate(`/content/${contentId}`);
  };

  return <div className="u-stack">
    <PageHeader title={t('Post designer', 'مصمم المنشورات')} description={t('Build an editable post and export the right size for each platform.', 'جهّز منشور قابلًا للتعديل وصدّره بمقاس كل منصة.')} />
    {brief && <section className="post-designer__brief"><strong>{brief.source === 'ai' ? t('AI creative brief', 'الفكرة الإبداعية من AI') : t('Local draft', 'مسودة محلية')}</strong><p dir="auto">{brief.prompt}</p><div className="u-row u-row--wrap"><span>{brief.objective.replaceAll('_', ' ')}</span><span>{brief.platforms.join(' · ')}</span><span>{brief.references.length} {t('references', 'مراجع')}</span>{brief.verifiedEvent && <span>{t('Date verified from Odoo', 'التاريخ موثّق من Odoo')} · {brief.verifiedEvent.title}</span>}</div></section>}
    {variants.length > 1 && <div className="post-designer__platform-tabs" role="tablist" aria-label={t('Platform variants', 'نسخ المنصات')}>{allVariants.map((variant) => <button role="tab" aria-selected={channel === variant.platform} key={variant.platform} type="button" onClick={() => switchPlatform(variant.platform)}>{PLATFORM_FORMATS[variant.platform].label}<small>{PLATFORM_FORMATS[variant.platform].format}</small></button>)}<button type="button" role="tab" aria-selected={compare} onClick={() => setCompare((value) => !value)}>{t('Compare all', 'قارن الكل')}</button></div>}
    <div className="post-designer__ai-command"><Sparkles size={18} /><input aria-label={t('AI edit command', 'أمر تعديل AI')} value={editCommand} onChange={(event) => setEditCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void applyAiEdit(); }} placeholder={t('Ask AI: shorten the headline, make it more premium, improve the picture…', 'اطلب من AI: قصّر العنوان، خلّيه أفخم، هات صورة أقوى…')} dir="auto" /><Button disabled={editState === 'loading' || editCommand.trim().length < 3} onClick={() => void applyAiEdit()}>{editState === 'loading' ? t('Editing…', 'بيعدّل…') : t('Apply', 'طبّق')}</Button>{editMessage && <p role="status">{editMessage}</p>}</div>
    <div className="post-designer">
      <div className="post-designer__controls u-stack">
        <label className="post-designer__field">{t('Content item', 'عنصر المحتوى')}
          <select value={item?.id ?? ''} onChange={(event) => setQuery({ content: event.target.value || null, from: null, template: null })}>
            <option value="">{t('Standalone draft', 'مسودة مستقلة')}</option>
            {editable.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
          </select>
        </label>
        {!item && <p className="u-sm u-muted">{t('Attach this draft to a content item when it is ready for review.', 'اربط المسودة بعنصر محتوى عندما تجهز للمراجعة.')} <Link to="/content">{t('Open content', 'افتح المحتوى')}</Link></p>}
        <div className="post-designer__fields">
          <label className="post-designer__field">{t('Platform', 'المنصة')}
            <select value={channel} onChange={(event) => { const next = event.target.value; if (variants.length) switchPlatform(next as CreativePlatform); else { setChannel(next); const first = POST_SIZES.find((entry) => next === 'whatsapp' ? entry.id === 'story' : (entry.channels as readonly string[]).includes(next)); if (first) setSizeId(first.id); } }}>
              {(variants.length ? variants.map((entry) => entry.platform) : ['instagram', 'facebook', 'whatsapp', 'linkedin', 'tiktok', 'snapchat', 'website']).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label className="post-designer__field">{t('Format', 'المقاس')}
            <select value={sizeId} onChange={(event) => setSizeId(event.target.value as PostSizeId)}>
              {sizes.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {entry.width}×{entry.height}</option>)}
            </select>
          </label>
        </div>
        {direction && <label className="post-designer__field">{t('Approved logo form', 'شكل الشعار المعتمد')}
          <select value={logoVariant} onChange={(event) => setLogoVariant(event.target.value as LogoVariant | 'auto')}>
            <option value="auto">{t('Automatic for background', 'تلقائي حسب الخلفية')}</option>
            <option value="lockup-reversed">{t('White lockup · on brand blue', 'الشعار الكامل الأبيض · على الأزرق')}</option>
            <option value="lockup-positive">{t('Blue lockup · on white or light', 'الشعار الكامل الأزرق · على الأبيض أو الفاتح')}</option>
            <option value="symbol-reversed">{t('White symbol · on brand blue', 'الرمز الأبيض · على الأزرق')}</option>
            <option value="symbol-positive">{t('Blue symbol · on white or light', 'الرمز الأزرق · على الأبيض أو الفاتح')}</option>
          </select>
        </label>}
        <label className="post-designer__field">{t('Odoo schedule', 'موعد من Odoo')}
          <select defaultValue="" onChange={(event) => { const found = events.find((entry) => entry.id === event.target.value); if (found) { setTitle(found.title); setDetail(new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(found.startsAt))); } }}>
            <option value="">{events.length ? t('Choose a course or event', 'اختر دورة أو فعالية') : (odooState || t('Loading…', 'جارٍ التحميل…'))}</option>
            {events.map((entry) => <option key={entry.id} value={entry.id}>{entry.title} · {entry.startsAt.slice(0, 10)}</option>)}
          </select>
        </label>
        <div className="post-designer__fields">
          <label className="post-designer__field">{t('Headline', 'العنوان')}<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={130} dir="auto" /></label>
          <label className="post-designer__field">{t('Label', 'التصنيف')}<input value={eyebrow} onChange={(event) => setEyebrow(event.target.value)} maxLength={30} dir="auto" /></label>
        </div>
        <label className="post-designer__field">{t('Post message', 'نص المنشور')}<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={260} dir="auto" /></label>
        <div className="post-designer__fields">
          <label className="post-designer__field">{t('Date or detail', 'الموعد أو التفاصيل')}<input value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={90} dir="auto" /></label>
          <label className="post-designer__field">{t('Call to action', 'دعوة الإجراء')}<input value={cta} onChange={(event) => setCta(event.target.value)} maxLength={28} dir="auto" /></label>
        </div>
        <div className="post-designer__ai">
          <label className="post-designer__field">{t('AI picture subject', 'وصف الصورة للذكاء الاصطناعي')}<input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t('Describe the visual, without text', 'صف المشهد، بدون كتابة داخل الصورة')} dir="auto" /></label>
          {brief?.references.some((reference) => reference.mime.startsWith('image/') && reference.dataUrl) && <label className="post-designer__reference-toggle"><input type="checkbox" checked={useReferenceImage} onChange={(event) => setUseReferenceImage(event.target.checked)} />{t('Use the uploaded image as a visual reference', 'استخدم الصورة المرفوعة كمرجع بصري')}</label>}
          <Button onClick={() => void generateImage()} disabled={imageState === 'loading'}><ImagePlus size={16} />{imageState === 'loading' ? t('Generating options…', 'بنولّد اختيارات…') : t('Generate 3 visual options', 'ولّد ٣ اختيارات للصورة')}</Button>
          {imageCandidates.length > 0 && <div className="post-designer__image-options">{imageCandidates.map((candidate, index) => <button type="button" key={index} aria-pressed={imageDataUrl === candidate} onClick={() => setImageDataUrl(candidate)}><img src={candidate} alt={t(`Visual option ${index + 1}`, `اختيار الصورة ${index + 1}`)} /><span>{t(`Option ${index + 1}`, `اختيار ${index + 1}`)}</span></button>)}</div>}
          {imageState === 'error' && <p role="alert" className="u-sm">{imageMessage}</p>}
          {imageState === 'ready' && <button type="button" className="ui-link" onClick={() => setImageDataUrl('')}><RefreshCw size={14} /> {t('Remove generated image', 'احذف الصورة المولّدة')}</button>}
        </div>
        <section className="post-designer__versions">
          <div className="u-row u-row--wrap"><strong>{t('Design versions', 'نسخ التصميم')}</strong><Button variant="secondary" onClick={() => void save()}><Save size={15} />{t('Save version', 'احفظ نسخة')}</Button></div>
          <p className="u-xs u-muted">{t('Headline, copy, picture, layout and format stay editable. The approved logo layer is locked.', 'العنوان والنص والصورة والقالب والمقاس قابلين للتعديل. طبقة الشعار المعتمد مقفولة.')}</p>
          {saveMessage && <p className="u-xs" role="status">{saveMessage}</p>}
          {savedDocument?.versions.map((version, index) => <button className="post-designer__version" type="button" key={version.id} onClick={() => restoreVersion(version)}><span>{t(`Version ${savedDocument.versions.length - index}`, `نسخة ${savedDocument.versions.length - index}`)}</span><time dateTime={version.savedAt}>{new Intl.DateTimeFormat(t('en', 'ar-EG'), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(version.savedAt))}</time></button>)}
        </section>
      </div>
      <div className="post-designer__gallery">
        {currentVariant && <p className="u-xs u-muted">{PLATFORM_FORMATS[currentVariant.platform].label} · {PLATFORM_FORMATS[currentVariant.platform].format} · {t('copy and layout can differ from other platforms', 'النص والتكوين ممكن يختلفوا عن باقي المنصات')}</p>}
        <p className="u-sm u-muted">{direction ? t('Creative direction rendered as editable layers', 'اتجاه إبداعي مرسوم بطبقات قابلة للتعديل') : t('Operational layouts', 'قوالب تشغيلية متكررة')}</p>
        <p className="u-xs u-muted">{t('The approved Engosoft logo is a locked asset. AI changes only the picture behind it.', 'شعار Engosoft المعتمد طبقة مقفولة. الذكاء الاصطناعي يغيّر الصورة خلفه فقط.')}</p>
        {brief?.directions.length ? <div className="post-designer__directions" role="group" aria-label={t('Creative directions', 'الاتجاهات الإبداعية')}>{brief.directions.map((entry) => <button type="button" key={entry.id} aria-pressed={direction?.id === entry.id} onClick={() => { setDirection(entry); if (!imageCandidates.length) setImageDataUrl(''); }}><strong>{entry.name}</strong><small>{entry.composition.replaceAll('_', ' ')} · {entry.ctaTreatment.replaceAll('_', ' ')}</small></button>)}</div> : <div className="post-designer__templates">{POST_TEMPLATES.filter((entry) => ['monthly-calendar','certification','achievement'].includes(entry.id)).map((entry) => <button type="button" key={entry.id} className="post-designer__template" aria-pressed={templateId === entry.id} onClick={() => setTemplateId(entry.id)}><img src={`/post-templates/${entry.id}.svg`} alt="" /><span>{entry.name}</span></button>)}</div>}
        <div className="post-designer__output">
          {baseDesign && <button className="ui-link" type="button" onClick={() => setShowFabric((value) => !value)}>{showFabric ? t('Close layer canvas', 'اقفل لوحة الطبقات') : t('Edit layers on canvas', 'عدّل الطبقات على اللوحة')}</button>}
          {showFabric && baseDesign && <Suspense fallback={<p className="u-sm u-muted">بنفتح لوحة الطبقات…</p>}><FabricCanvasProof design={baseDesign} onChange={(next) => setCanvasOverride({ key: canvasKey, design: next })} /></Suspense>}
          <img src={preview} alt={t(`Preview: ${title}`, `معاينة: ${title}`)} />
          {checks.length > 0 && <ul className="post-designer__checks">{checks.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul>}
          <div className="u-row u-row--wrap">
            <Button disabled={!logoReady} onClick={() => download(`${direction?.id ?? selected.id}-${size.id}.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))}><Download size={16} /> SVG</Button>
            <Button disabled={!logoReady} variant="secondary" onClick={() => void exportPng()}><Download size={16} /> PNG</Button>
            <span className="u-sm u-muted" dir="ltr">{size.width} × {size.height}</span>
          </div>
          {(!item || ['idea','draft','in_production','changes_requested'].includes(item.status)) && <Button disabled={checks.length > 0} onClick={() => void sendToReview()}>{t('Send to Marketing review', 'أرسل لمراجعة التسويق')}</Button>}
          <p className="u-xs u-muted">{t('Review currently uses the local demo workspace; it resets on reload. Saved design versions stay in this browser.', 'المراجعة حاليًا في مساحة العمل التجريبية وتُعاد عند تحديث الصفحة. تبقى نسخ التصميم المحفوظة في المتصفح.')}</p>
        </div>
        {compare && variants.length > 1 && <section className="post-designer__compare"><h3>{t('Campaign variants', 'نسخ الحملة')}</h3><div>{allVariants.map((variant) => { const format = POST_SIZES.find((entry) => entry.id === variant.sizeId)!; const variantTemplate = POST_TEMPLATES.find((entry) => entry.id === variant.templateId) ?? POST_TEMPLATES[0]; const variantSvg = direction ? renderCreativeSvg(composeCreativeDesign(direction, variant.sizeId, { headline: variant.headline, body: variant.caption, eyebrow, detail, cta, imageDataUrl }, logoHrefs, logoVariant)) : renderPosterSvg(variantTemplate, variant.sizeId, { title: variant.headline, body: variant.caption, eyebrow, detail, cta, imageDataUrl }, logoHrefs); return <article key={variant.platform}><strong>{PLATFORM_FORMATS[variant.platform].label}</strong><small>{format.width} × {format.height}</small><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(variantSvg)}`} alt={`${variant.platform} preview`} /><Button variant="secondary" disabled={!logoReady} onClick={() => download(`${direction?.id ?? variantTemplate.id}-${variant.platform}.svg`, new Blob([variantSvg], { type: 'image/svg+xml;charset=utf-8' }))}><Download size={14} />SVG</Button></article>; })}</div></section>}
      </div>
    </div>
  </div>;
}
