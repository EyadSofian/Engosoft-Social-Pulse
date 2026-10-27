import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Coins, FileUp, GraduationCap, ImagePlus, LayoutTemplate, Sparkles, Wand2 } from 'lucide-react';
import { Link, useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { CREATE_PREFILL_KEY, type CreatePrefill } from '../../features/content/CreateContent';
import { type CreativeReference, type Objective } from '../../features/creative-studio/brief';
import { FullCreativeJob } from '../../features/creative-studio/FullCreativeJob';
import { useAuth } from '../../features/auth/AuthProvider';
import { STATUS_LABEL, type PipelineItem } from '../../features/content-pipeline/types';
import { api } from '../../lib/api';
import { TEMPLATE_PREFILL_KEY, type AiTemplate } from '../../features/ai-templates/AiTemplatesPanel';
import { usePipeline } from '../../features/content-pipeline/usePipeline';
import { CoursePicker, runOf } from '../../features/creative-studio/CoursePicker';
import { clearActiveCreative, getActiveCreative, setActiveCreative } from '../../features/creative-studio/activeCreative';
import { TemplateComposer, TemplateGrid, useSvgTemplates } from '../../features/svg-templates/SvgTemplates';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { CREATIVE_PLATFORMS, masterFormat, PLATFORM_FORMATS, type CreativePlatform } from '../../features/creative-studio/platforms';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useI18n } from '../../i18n/I18nProvider';

import { usePageMeta } from '../../shell/ShellContext';
import { DesignSettings } from '../../features/creative-studio/DesignSettings';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../../domain/design-engine';

type Stage = 'compose' | 'generating';
const OBJECTIVES: { value: Objective | 'auto'; ar: string; en: string }[] = [
  { value: 'auto', ar: 'حدده من الطلب', en: 'Detect from prompt' },
  { value: 'course_launch', ar: 'إعلان دورة', en: 'Course announcement' },
  { value: 'course_schedule', ar: 'جدول دورات', en: 'Course schedule' },
  { value: 'certificate', ar: 'شهادة أو إنجاز', en: 'Certificate or achievement' },
  { value: 'education', ar: 'محتوى تعليمي', en: 'Educational content' },
  { value: 'event', ar: 'فعالية أو مناسبة', en: 'Event or occasion' },
  { value: 'general', ar: 'منشور عام', en: 'General post' },
];
const asDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
});
function detectPlatforms(prompt: string): CreativePlatform[] {
  const text = prompt.toLowerCase();
  const found: CreativePlatform[] = [];
  if (/فيس|facebook|fb\b/.test(text)) found.push('facebook');
  if (/[اإ]نست|instagram|ig\b/.test(text)) found.push('instagram');
  if (/واتس|whatsapp/.test(text)) found.push('whatsapp');
  if (/لينكد|linkedin/.test(text)) found.push('linkedin');
  if (/تيك|tiktok/.test(text)) found.push('tiktok');
  if (/سناب|snapchat/.test(text)) found.push('snapchat');
  if (/الموقع|ويب ?سايت|website|blog|مدونة/.test(text)) found.push('website');
  return found;
}
/** The signed-in person's posts that still need work: drafts and change requests first. */
function RecentContent() {
  const { t, tx } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<PipelineItem[]>([]);
  useEffect(() => { void api<PipelineItem[]>('/api/content').then(setItems).catch(() => {}); }, []);
  const mine = items.filter((item) => item.ownerId === user.id && !['published', 'archived', 'cancelled'].includes(item.status))
    .sort((a, b) => Number(b.status === 'changes_requested') - Number(a.status === 'changes_requested')).slice(0, 6);
  if (!mine.length) return null;
  return <section className="creative-home__recent-real">
    <div className="creative-home__section-title"><h2>{t('Continue your work', 'تابع عملك')}</h2><Link to="/content">{t('All content', 'كل المحتوى')} <ArrowLeft size={15} /></Link></div>
    <div className="library-grid">{mine.map((item) => <Link key={item.id} to={`/content/${item.id}`} className="library-card glass">
      {item.creative?.imageUrl && <img src={item.creative.imageUrl} alt="" loading="lazy" />}<b dir="auto">{item.title}</b><small>{tx(STATUS_LABEL[item.status])}</small>
    </Link>)}</div>
  </section>;
}

export function CreationHomePage() {
  const { t } = useI18n();
  const { query } = useRouter();
  const { state } = useWorkspace();
  const upload = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(() => getActiveCreative()?.prompt ?? '');
  const [objective, setObjective] = useState<Objective | 'auto'>('auto');
  const [platforms, setPlatforms] = useState<CreativePlatform[]>(() => getActiveCreative()?.platforms ?? ['instagram']);
  const [platformTouched, setPlatformTouched] = useState(false);
  const [references, setReferences] = useState<CreativeReference[]>([]);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'ai' | 'template'>(() => (query.has('svgTemplate') ? 'template' : 'ai'));
  // A run in progress (or just finished) survives leaving the page; ?creative= opens one from a notification.
  const active = getActiveCreative();
  const opened = query.get('creative');
  const [stage, setStage] = useState<Stage>(() => (opened || active ? 'generating' : 'compose'));
  const [jobId, setJobId] = useState(() => (opened && opened !== active?.requestId ? '' : active?.jobId ?? ''));
  const [requestId, setRequestId] = useState(() => opened ?? active?.requestId ?? '');
  useEffect(() => {
    // Opened from a "your design is ready" notification while already on this page.
    if (!opened || opened === requestId) return;
    setMode('ai'); setRequestId(opened); setJobId(getActiveCreative()?.requestId === opened ? getActiveCreative()!.jobId : ''); setStage('generating');
  }, [opened]);
  const [template, setTemplate] = useState<AiTemplate | null>(null);
  useEffect(() => {
    if (!query.has('template')) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(TEMPLATE_PREFILL_KEY) || 'null') as AiTemplate | null;
      sessionStorage.removeItem(TEMPLATE_PREFILL_KEY);
      if (saved) { setTemplate(saved); setPrompt(saved.prompt); if (saved.channels.length) { setPlatforms(saved.channels as CreativePlatform[]); setPlatformTouched(true); } }
    } catch { /* bad prefill ignored */ }
  }, [query]);
  const [sourcePanel, setSourcePanel] = useState<'course' | 'post' | null>(null);
  const { items: pipeline } = usePipeline();
  usePageMeta(t('Create', 'إنشاء'), [{ label: t('Create', 'إنشاء') }]);
  useEffect(() => {
    if (!query.has('create')) return;
    const raw = sessionStorage.getItem(CREATE_PREFILL_KEY);
    sessionStorage.removeItem(CREATE_PREFILL_KEY);
    if (!raw) return;
    try {
      const prefill = JSON.parse(raw) as CreatePrefill;
      const course = state.courses.find((entry) => entry.id === prefill.courseId);
      const template = state.templates.find((entry) => entry.id === prefill.templateId);
      const parts = [prefill.title, course ? `${course.code} ${course.title}` : '', template?.name.en, prefill.caption].filter(Boolean);
      if (parts.length) setPrompt(parts.join(' — '));
    } catch { /* bad transient prefill ignored */ }
  }, [query, state.courses, state.templates]);
  const [designSettings, setDesignSettings] = useState<EngineSettings>(DEFAULT_ENGINE_SETTINGS);
  const togglePlatform = (platform: CreativePlatform) => { setPlatformTouched(true); setPlatforms((current) => current.includes(platform) ? current.filter((value) => value !== platform) : [...current, platform]); };
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const incoming: CreativeReference[] = [];
    for (const file of [...list].slice(0, 6 - references.length)) {
      if (file.size > 2_000_000) { setMessage(t(`${file.name} exceeds 2 MB.`, `${file.name} أكبر من ٢ ميجابايت.`)); continue; }
      incoming.push({ name: file.name, mime: file.type || 'application/octet-stream', size: file.size, dataUrl: await asDataUrl(file) });
    }
    setReferences((current) => [...current, ...incoming]);
    if (upload.current) upload.current.value = '';
  };
  const startFullCreative = async () => {
    if (prompt.trim().length < 10) { setMessage(t('Describe the post in a little more detail.', 'اكتب وصف المنشور بتفاصيل أكثر.')); return; }
    if (!platforms.length) { setMessage(t('Choose at least one platform.', 'اختر منصة واحدة على الأقل.')); return; }
    setCreating(true); setMessage('');
    try {
      // The master is a 4:5 feed post when any feed platform is selected; 9:16 and website versions are adapted from it.
      const format = masterFormat(platforms);
      const response = await fetch('/api/ai/full-creative', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, format, directions: 2, settings: designSettings, ...(template ? { templateId: template.id } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('Generation could not start.', 'تعذّر بدء التوليد.'));
      setJobId(body.jobId); setRequestId(body.requestId ?? ''); setStage('generating');
      setActiveCreative({ jobId: body.jobId, requestId: body.requestId ?? '', prompt, platforms, startedAt: new Date().toISOString(), status: 'running' });
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    setCreating(false);
  };
  return <div className="u-stack u-stack--lg creative-home">
    <header className="create-hero">
      <div className="create-hero__titles">
        <span className="create-hero__eyebrow"><Sparkles size={14} /> Engosoft Creative Studio</span>
        <h1 className="create-hero__title">{t('What would you like to create?', 'ماذا تريد أن تنشئ؟')}</h1>
        <p>{mode === 'ai' ? t('Describe the idea. We check Odoo, write the copy, design two directions and place the official logo.', 'اكتب الفكرة، وسنراجع بيانات Odoo ونكتب النص ونصمّم اتجاهين ونضع الشعار الرسمي.') : t('Pick a ready template, fill it by hand or from an Odoo event, and export it instantly.', 'اختر قالبًا جاهزًا، واملأه يدويًا أو من فعالية في Odoo، ثم صدّره فورًا.')}</p>
      </div>
      <div className="create-mode" role="tablist" aria-label={t('How to create', 'طريقة الإنشاء')}>
        {(['ai', 'template'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)}>
          {mode === value && <motion.span layoutId="create-mode-pill" className="create-mode__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="create-mode__label">{value === 'ai' ? <><Wand2 size={16} /> {t('Full AI design', 'تصميم كامل بالذكاء الاصطناعي')}</> : <><LayoutTemplate size={16} /> {t('From a template', 'من قالب جاهز')}</>}</span>
        </button>)}
      </div>
    </header>
    {mode === 'template' ? <TemplateMode initialId={query.get('svgTemplate')} /> : <div className={stage === 'compose' ? 'create-layout' : 'create-layout create-layout--single'}>
    <div className="creative-home__hero">
      {stage === 'compose' && <>
        <div className="creative-home__composer"><span className="creative-home__composer-icon"><Sparkles size={20} /></span><textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); if (!platformTouched) { const found = detectPlatforms(event.target.value); if (found.length) setPlatforms(found); } }} rows={4} placeholder={t('Example: Create a CFM course post for Facebook, Instagram and WhatsApp next week…', 'مثال: صمّم منشورًا عن دورة CFM التي تبدأ الأسبوع القادم لفيسبوك وإنستجرام وواتساب…')} aria-label={t('Describe the content to create', 'صف المحتوى الذي تريد إنشاءه')} dir="auto" /></div>
        <div className="creative-home__tools">
          <input ref={upload} hidden type="file" multiple accept="image/*,.pdf,.docx,.txt,.md" onChange={(event) => void addFiles(event.target.files)} />
          <button type="button" onClick={() => upload.current?.click()}><FileUp size={16} />{t('Add reference', 'أضف مرجعًا')}</button>
          <button type="button" onClick={() => upload.current?.click()}><ImagePlus size={16} />{t('Upload image / file', 'ارفع صورة أو ملفًا')}</button>
          <button type="button" onClick={() => setSourcePanel(sourcePanel === 'post' ? null : 'post')}>{t('Use existing post', 'استخدم منشورًا سابقًا')}</button>
          <button type="button" onClick={() => setSourcePanel(sourcePanel === 'course' ? null : 'course')}><GraduationCap size={16} />{t('Choose a course from Odoo', 'اختر دورة من Odoo')}</button>
        </div>
        {sourcePanel === 'post' && <div className="creative-home__source"><strong>{t('Existing posts', 'منشورات سابقة')}</strong><p className="u-xs u-muted">{t('Existing workspace posts are references only.', 'المنشورات السابقة مراجع فقط.')}</p><div>{(pipeline ?? []).slice(0, 8).map((item) => <button key={item.id} type="button" onClick={() => { setPrompt((current) => `${current}${current ? ' — ' : ''}${item.title}`); setSourcePanel(null); }}>{item.title}</button>)}</div></div>}
        {sourcePanel === 'course' && <div className="creative-home__source"><strong>{t('Odoo courses and upcoming runs', 'دورات Odoo ومواعيدها القادمة')}</strong><p className="u-xs u-muted">{t('Dates and links come from Odoo; the design uses them exactly.', 'التواريخ والروابط من Odoo، ويستخدمها التصميم كما هي.')}</p><CoursePicker autoFocus onPick={(pick) => {
          const run = runOf(pick);
          const name = pick.type === 'course' ? pick.course.name : pick.event.title;
          const when = run ? ` — ${new Date(run.startsAt).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' })}` : '';
          setPrompt((current) => `${current}${current ? ' — ' : ''}${name}${when}`);
          setSourcePanel(null);
        }} /></div>}
        {references.length > 0 && <ul className="creative-home__references">{references.map((file, index) => <li key={`${file.name}-${index}`}>{file.mime.startsWith('image/') && file.dataUrl && <img src={file.dataUrl} alt="" />}<span>{file.name}</span><button type="button" onClick={() => setReferences((current) => current.filter((_, i) => i !== index))} aria-label={t(`Remove ${file.name}`, `احذف ${file.name}`)}>×</button></li>)}</ul>}
        <div className="creative-home__platforms" role="group" aria-label={t('Platforms', 'المنصات')}>{CREATIVE_PLATFORMS.map((platform) => <button key={platform} type="button" aria-pressed={platforms.includes(platform)} onClick={() => togglePlatform(platform)}><span className="creative-home__platform-icon"><ChannelIcon channel={platform} size={15} /></span>{PLATFORM_FORMATS[platform].label}</button>)}</div>
        <DesignSettings value={designSettings} onChange={setDesignSettings} />
        <div className="creative-home__options"><label>{t('Objective', 'الهدف')}<select value={objective} onChange={(event) => setObjective(event.target.value as Objective | 'auto')}>{OBJECTIVES.map((entry) => <option key={entry.value} value={entry.value}>{t(entry.en, entry.ar)}</option>)}</select></label></div>
        <div className="creative-home__action"><p className="u-xs">{t('Images, PDF and text inform AI. DOCX is retained as a reference. Up to 6 files, 2 MB each.', 'تُرسَل الصور وملفات PDF والنصوص إلى الذكاء الاصطناعي، ويُحفظ ملف DOCX مرجعًا. حتى ٦ ملفات، ٢ ميجابايت لكل ملف.')}</p><Button variant="primary" className="cta-create" disabled={creating} busy={creating} onClick={() => void startFullCreative()}>{!creating && <Sparkles size={17} className="cta-create__spark" />}{creating ? t('Starting…', 'جارٍ البدء…') : t('Design the post', 'صمّم المنشور')}</Button></div>
      </>}
      {stage === 'generating' && (jobId || requestId) && <FullCreativeJob key={`${jobId}:${requestId}`} jobId={jobId} requestId={requestId} platforms={platforms} prompt={prompt} onRestart={() => { setStage('compose'); setJobId(''); setRequestId(''); clearActiveCreative(); }} />}
      {message && <p role="alert" className="creative-home__error">{message}</p>}
    </div>
    {stage === 'compose' && <PlatformPreview platforms={platforms} />}
    </div>}
    <RecentContent />
  </div>;
}

/** Exact delivery sizes of the chosen platforms, drawn to scale, with the expected AI cost. */
function PlatformPreview({ platforms }: { platforms: CreativePlatform[] }) {
  const { t } = useI18n();
  const [estimate, setEstimate] = useState<{ usd: number } | null>(null);
  useEffect(() => {
    void api<{ averageImageUsd: number | null }>('/api/usage').then((report) => setEstimate({ usd: report.averageImageUsd ?? 0.2 })).catch(() => {});
  }, []);
  const groups = (['feed', 'story', 'landscape'] as const).map((format) => ({ format, items: platforms.filter((p) => PLATFORM_FORMATS[p].master === format) })).filter((group) => group.items.length);
  const extra = groups.length - 1;
  return <aside className="create-preview glass" aria-label={t('Sizes', 'المقاسات')}>
    <h2>{t('What you will get', 'ما ستحصل عليه')}</h2>
    <div className="create-preview__frames">
      <AnimatePresence initial={false}>
        {groups.map(({ format, items }) => {
          const spec = PLATFORM_FORMATS[items[0]];
          return <motion.figure layout key={format} className="create-frame" data-format={format} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
            <div className="create-frame__shape" style={{ aspectRatio: `${spec.width} / ${spec.height}` }}>
              <span className="create-frame__shine" />
              <span className="create-frame__icons">{items.map((p) => <ChannelIcon key={p} channel={p} size={15} />)}</span>
            </div>
            <figcaption><b>{t(spec.format, spec.format)}</b><span dir="ltr">{spec.width}×{spec.height}</span><small>{items.map((p) => PLATFORM_FORMATS[p].label).join(' · ')}</small></figcaption>
          </motion.figure>;
        })}
      </AnimatePresence>
      {!groups.length && <p className="u-sm u-muted">{t('Choose at least one platform.', 'اختر منصة واحدة على الأقل.')}</p>}
    </div>
    {estimate && groups.length > 0 && <p className="create-preview__cost"><Coins size={15} /> {t('Expected AI cost', 'التكلفة المتوقعة')}: <b dir="ltr">≈ ${((2 + extra) * estimate.usd).toFixed(2)}</b> <small>{t(`2 designs${extra ? ` + ${extra} resize` : ''}`, `تصميمان${extra ? ` + ${extra} مقاس إضافي` : ''}`)}</small></p>}
  </aside>;
}

/** Ready templates: choose one, fill it (or let an Odoo event fill it) and export without any image-model cost. */
function TemplateMode({ initialId }: { initialId: string | null }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { items } = useSvgTemplates();
  const [selected, setSelected] = useState<string | null>(initialId);
  const template = items?.find((item) => item.id === selected);
  if (!items) return <div className="board-loading"><span className="ui-btn__spinner" /></div>;
  if (template) return <TemplateComposer key={template.id} template={template} onClose={() => setSelected(null)} />;
  return <section className="u-stack">
    {items.length ? <TemplateGrid items={items} onOpen={(item) => setSelected(item.id)} /> : <div className="library-empty glass"><LayoutTemplate size={22} /><p>{t('No templates yet. Design one with AI in the Library once, then reuse it.', 'لا توجد قوالب بعد. صمّم قالبًا بالذكاء الاصطناعي في المكتبة مرة واحدة، ثم أعد استخدامه.')}</p></div>}
    <div><Button variant="secondary" onClick={() => navigate('/library')}><Wand2 size={15} /> {t('Design a new template', 'صمّم قالبًا جديدًا')}</Button></div>
  </section>;
}
