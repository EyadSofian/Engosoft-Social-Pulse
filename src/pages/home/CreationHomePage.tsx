import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CalendarDays, Coins, Film, GraduationCap, ImagePlus, LayoutTemplate, Sparkles, Upload, Wand2 } from 'lucide-react';
import { ReelMode } from '../../features/reels/ReelMode';
import { GoalPicker } from '../../features/content-pipeline/PostPlan';
import { clearPostPlan, readPostPlan, takePostPlan, writePostPlan, type PostPlan } from '../../features/content/postPlan';
import { fromInputValue, toInputValue } from '../../lib/format';
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
import { TemplateComposer, TemplateGrid, KindPicker, useSvgTemplates } from '../../features/svg-templates/SvgTemplates';
import { KIND_LABEL, type TemplateKind } from '../../features/svg-templates/render';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { CREATIVE_PLATFORMS, masterFormat, PLATFORM_FORMATS, type CreativePlatform } from '../../features/creative-studio/platforms';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useI18n } from '../../i18n/I18nProvider';

import { usePageMeta } from '../../shell/ShellContext';
import { DesignSettings } from '../../features/creative-studio/DesignSettings';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../../domain/design-engine';

type Stage = 'compose' | 'generating';
/** The three ways to make a post; `choose` is the first screen for people who may use more than one. */
type Mode = 'choose' | 'ai' | 'template' | 'upload' | 'reel';
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
  if (/تويتر|twitter|(^|\s)(x|إكس|اكس)(\s|$|[،,.])/.test(text)) found.push('x');
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
  const { can } = useAuth();
  // Each way of creating is its own permission; a person with one way goes straight to it.
  const free = can('design.free');
  const ways = ([['ai', free], ['template', can('design.templates')], ['upload', can('design.upload')], ['reel', can('design.video')]] as const).filter(([, allowed]) => allowed).map(([way]) => way);
  const upload = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(() => getActiveCreative()?.prompt ?? '');
  const [objective, setObjective] = useState<Objective | 'auto'>('auto');
  const [platforms, setPlatforms] = useState<CreativePlatform[]>(() => getActiveCreative()?.platforms ?? ['instagram']);
  const [platformTouched, setPlatformTouched] = useState(false);
  const [references, setReferences] = useState<CreativeReference[]>([]);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  // Coming back while a design is still running reopens it; links that name a template open that template.
  const [mode, setMode] = useState<Mode>(() => {
    if (free && (query.has('creative') || query.has('template') || getActiveCreative()?.status === 'running')) return 'ai';
    if (query.has('svgTemplate') && ways.includes('template')) return 'template';
    return ways.length === 1 ? ways[0] : 'choose';
  });
  // A plan left from an abandoned visit must not attach a new post to someone else's plan row.
  const [planKey, setPlanKey] = useState(() => { if (!query.has('create') && getActiveCreative()?.status !== 'running') clearPostPlan(); return 0; });
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
      if (saved) { setMode('ai'); setTemplate(saved); setPrompt(saved.prompt); if (saved.channels.length) { setPlatforms(saved.channels as CreativePlatform[]); setPlatformTouched(true); } }
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
      writePostPlan({ goal: prefill.goal ?? null, plannedFor: prefill.plannedFor ?? null, slotId: prefill.slotId ?? null, slotTitle: prefill.slotId ? prefill.title : undefined, channels: prefill.channels });
      setPlanKey((key) => key + 1);
      if (prefill.channels?.length) { setPlatforms(prefill.channels.filter((c): c is CreativePlatform => (CREATIVE_PLATFORMS as string[]).includes(c))); setPlatformTouched(true); }
      if (free) setMode('ai');
    } catch { /* bad transient prefill ignored */ }
  }, [query, state.courses, state.templates]);
  const [designSettings, setDesignSettings] = useState<EngineSettings>(DEFAULT_ENGINE_SETTINGS);
  const togglePlatform = (platform: CreativePlatform) => { setPlatformTouched(true); setPlatforms((current) => current.includes(platform) ? current.filter((value) => value !== platform) : [...current, platform]); };
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const incoming: CreativeReference[] = [];
    for (const file of [...list].slice(0, 6 - references.length)) {
      if (file.size > 2_000_000) { setMessage(t(`${file.name} exceeds 2 MB.`, `${file.name} أكبر من ٢ ميجابايت.`)); continue; }
      if (!/^image\/(png|jpeg|webp)$|^application\/pdf$|^text\//.test(file.type) && !/\.(txt|md|pdf)$/i.test(file.name)) { setMessage(t(`${file.name}: use an image, PDF or text file.`, `${file.name}: استخدم صورة أو PDF أو ملفًا نصيًا.`)); continue; }
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
      const attachments = references.filter((file) => file.dataUrl).map(({ name, mime, dataUrl }) => ({ name, mime, dataUrl: dataUrl! }));
      const body = await api<{ jobId: string; requestId?: string }>('/api/ai/full-creative', { body: { prompt, format, directions: 2, settings: designSettings, ...(objective !== 'auto' ? { objective } : {}), ...(attachments.length ? { attachments } : {}), ...(template ? { templateId: template.id } : {}) } });
      setJobId(body.jobId); setRequestId(body.requestId ?? ''); setStage('generating');
      setActiveCreative({ jobId: body.jobId, requestId: body.requestId ?? '', prompt, platforms, startedAt: new Date().toISOString(), status: 'running' });
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    setCreating(false);
  };
  const heading: Record<Mode, [string, string]> = {
    choose: ['How do you want to make the post?', 'كيف تريد إنشاء المنشور؟'],
    ai: ['Describe the post', 'اكتب فكرة المنشور'],
    template: [free ? 'Fill a ready template' : 'What kind of post is it?', free ? 'املأ قالبًا جاهزًا' : 'ما نوع المنشور؟'],
    upload: ['Upload your finished design', 'ارفع تصميمك الجاهز'],
    reel: ['Upload a Reel', 'ارفع ريل'],
  };
  const lead: Record<Mode, [string, string]> = {
    choose: ['Pick one way. You can come back and change it any time.', 'اختر طريقة واحدة، ويمكنك الرجوع وتغييرها في أي وقت.'],
    ai: ['Write the idea in your own words. We check Odoo, write the copy, design two options and place the official logo.', 'اكتب الفكرة بكلماتك. نراجع بيانات Odoo ونكتب النص ونصمّم خيارين ونضع الشعار الرسمي.'],
    template: ['Pick a template, change its text and photos, then send it for approval. No AI cost.', 'اختر قالبًا، غيّر نصوصه وصوره، ثم أرسله للاعتماد. بدون تكلفة ذكاء اصطناعي.'],
    upload: ['Already designed it? Upload the image, choose the platforms and send it for approval.', 'صمّمته بالفعل؟ ارفع الصورة واختر المنصات وأرسله للاعتماد.'],
    reel: ['Upload the finished video, check it fits each platform, pick a cover, and write the caption yourself or with AI from the idea or the script.', 'ارفع الفيديو الجاهز، اتأكد إنه مناسب لكل منصة، اختار غلاف، واكتب الكلام بإيدك أو بالذكاء الاصطناعي من الفكرة أو السكريبت.'],
  };
  return <div className="u-stack u-stack--lg creative-home">
    <header className="create-hero">
      <div className="create-hero__titles">
        {ways.length > 1 && mode !== 'choose' && stage === 'compose' && <button type="button" className="create-back" onClick={() => setMode('choose')}><ArrowRight size={15} className="u-flip" /> {t('Other ways to create', 'طرق إنشاء أخرى')}</button>}
        <h1 className="create-hero__title">{t(...heading[mode])}</h1>
        <p>{t(...lead[mode])}</p>
      </div>
      <ol className="create-steps" aria-label={t('Steps', 'الخطوات')}>
        {[[ 'Choose how', 'اختر الطريقة'], ['Make the post', 'جهّز المنشور'], ['Send for approval', 'أرسله للاعتماد']].map(([en, ar], index) => {
          const current = mode === 'choose' ? 0 : 1;
          return <li key={en} data-state={index < current ? 'done' : index === current ? 'current' : undefined}><span className="u-tnum">{index + 1}</span>{t(en, ar)}</li>;
        })}
      </ol>
    </header>
    {mode === 'choose' && <div className="create-methods">
      {free && <button type="button" className="create-method glass" onClick={() => setMode('ai')}>
        <span className="create-method__icon" data-tone="brand"><Wand2 size={22} /></span>
        <b>{t('Describe it, AI designs it', 'اكتب الفكرة والذكاء الاصطناعي يصمّم')}</b>
        <small>{t('For a new idea. You write a sentence; you get two finished designs with copy for each platform.', 'لفكرة جديدة. تكتب جملة وتحصل على تصميمين جاهزين مع النص لكل منصة.')}</small>
        <em>{t('e.g. “CFM course starts next week, for Facebook and Instagram”', 'مثال: «دورة CFM تبدأ الأسبوع القادم، لفيسبوك وإنستجرام»')}</em>
      </button>}
      {ways.includes('template') && <button type="button" className="create-method glass" onClick={() => setMode('template')}>
        <span className="create-method__icon" data-tone="success"><LayoutTemplate size={22} /></span>
        <b>{t('Fill a ready template', 'املأ قالبًا جاهزًا')}</b>
        <small>{t('For recurring posts. Approved layouts: change the text and photos only.', 'للمنشورات المتكررة. تصميمات معتمدة، تغيّر النص والصور فقط.')}</small>
        <em>{t('e.g. weekly course schedule, a student certificate', 'مثال: جدول الدورات الأسبوعي، شهادة طالب')}</em>
      </button>}
      {ways.includes('upload') && <button type="button" className="create-method glass" onClick={() => setMode('upload')}>
        <span className="create-method__icon" data-tone="accent"><Upload size={22} /></span>
        <b>{t('Upload a finished design', 'ارفع تصميمًا جاهزًا')}</b>
        <small>{t('Designed it elsewhere? Upload the image and send it for approval.', 'صمّمته في برنامج آخر؟ ارفع الصورة وأرسلها للاعتماد.')}</small>
        <em>{t('PNG, JPEG or WebP, up to 12 MB', 'PNG أو JPEG أو WebP حتى 12 ميجابايت')}</em>
      </button>}
      {ways.includes('reel') && <button type="button" className="create-method glass" onClick={() => setMode('reel')}>
        <span className="create-method__icon" data-tone="violet"><Film size={22} /></span>
        <b>{t('Upload a Reel', 'ارفع ريل / فيديو')}</b>
        <small>{t('A finished vertical video for Instagram, Facebook, TikTok, Snapchat or YouTube Shorts.', 'فيديو عمودي جاهز لإنستجرام وفيسبوك وتيك توك وسناب ويوتيوب شورتس.')}</small>
        <em>{t('MP4, 9:16, up to 200 MB', 'MP4، 9:16، لحد 200 ميجابايت')}</em>
      </button>}
      {!ways.length && <p className="u-sm u-muted">{t('No way of creating posts is part of your permissions yet. Ask an administrator.', 'لا توجد طريقة إنشاء ضمن صلاحياتك بعد. اطلبها من مسؤول النظام.')}</p>}
    </div>}
    {mode !== 'choose' && stage === 'compose' && <PostDetails key={planKey} />}
    {mode === 'upload' && <UploadMode />}
    {mode === 'reel' && <ReelMode />}
    {mode === 'template' && <TemplateMode initialId={query.get('svgTemplate')} />}
    {mode === 'ai' && <div className={stage === 'compose' ? 'create-layout' : 'create-layout create-layout--single'}>
    <div className="creative-home__hero">
      {stage === 'compose' && <>
        <div className="creative-home__composer"><span className="creative-home__composer-icon"><Sparkles size={20} /></span><textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); if (!platformTouched) { const found = detectPlatforms(event.target.value); if (found.length) setPlatforms(found); } }} rows={4} placeholder={t('Example: Create a CFM course post for Facebook, Instagram and WhatsApp next week…', 'مثال: صمّم منشورًا عن دورة CFM التي تبدأ الأسبوع القادم لفيسبوك وإنستجرام وواتساب…')} aria-label={t('Describe the content to create', 'صف المحتوى الذي تريد إنشاءه')} dir="auto" /></div>
        <div className="creative-home__tools">
          <input ref={upload} hidden type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.txt,.md,text/plain,text/markdown" onChange={(event) => void addFiles(event.target.files)} />
          <button type="button" disabled={references.length >= 6} onClick={() => upload.current?.click()}><ImagePlus size={16} />{t('Attach an image or file', 'أرفق صورة أو ملفًا')}</button>
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
        <details className="create-advanced">
          <summary>{t('More options (optional)', 'خيارات إضافية (اختياري)')}</summary>
          <DesignSettings value={designSettings} onChange={setDesignSettings} />
          <div className="creative-home__options"><label>{t('Objective', 'الهدف')}<select value={objective} onChange={(event) => setObjective(event.target.value as Objective | 'auto')}>{OBJECTIVES.map((entry) => <option key={entry.value} value={entry.value}>{t(entry.en, entry.ar)}</option>)}</select></label></div>
        </details>
        <div className="creative-home__action"><p className="u-xs">{t('Attached images, PDFs and text files are read by the AI as context. Up to 6 files, 2 MB each.', 'يقرأ الذكاء الاصطناعي الصور وملفات PDF والنصوص المرفقة كسياق للتصميم. حتى ٦ ملفات، ٢ ميجابايت لكل ملف.')}</p><Button variant="primary" className="cta-create" disabled={creating} busy={creating} onClick={() => void startFullCreative()}>{!creating && <Sparkles size={17} className="cta-create__spark" />}{creating ? t('Starting…', 'جارٍ البدء…') : t('Design the post', 'صمّم المنشور')}</Button></div>
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

/** Ready templates: pick the kind of post, then a template, fill it and export without any image-model cost. */
function TemplateMode({ initialId }: { initialId: string | null }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { can } = useAuth();
  const free = can('design.free');
  const { items, error, reload } = useSvgTemplates();
  const [selected, setSelected] = useState<string | null>(initialId);
  const [kind, setKind] = useState<TemplateKind | 'all'>('all');
  const template = items?.find((item) => item.id === selected);
  if (error) return <div className="library-empty glass" role="alert"><p>{error}</p><Button variant="secondary" onClick={() => void reload()}>{t('Retry', 'أعد المحاولة')}</Button></div>;
  if (!items) return <div className="board-loading"><span className="ui-btn__spinner" /></div>;
  if (template) return <TemplateComposer key={template.id} template={template} onClose={() => setSelected(null)} />;
  const shown = kind === 'all' ? items : items.filter((item) => item.kind === kind);
  const kinds = (Object.keys(KIND_LABEL) as TemplateKind[]).filter((value) => items.some((item) => item.kind === value));
  return <section className="u-stack">
    {items.length > 0 && !free && kind === 'all' && kinds.length > 1
      ? <div className="kind-cards">{kinds.map((value) => <button key={value} type="button" className="kind-card glass" data-kind={value} onClick={() => setKind(value)}>
        <b>{t(KIND_LABEL[value].en, KIND_LABEL[value].ar)}</b><small>{t(KIND_LABEL[value].hint.en, KIND_LABEL[value].hint.ar)}</small><i className="u-tnum">{items.filter((item) => item.kind === value).length}</i>
      </button>)}</div>
      : <>
        {items.length > 0 && <KindPicker items={items} value={kind} onChange={setKind} />}
        {shown.length ? <TemplateGrid items={shown} onOpen={(item) => setSelected(item.id)} /> : <div className="library-empty glass"><LayoutTemplate size={22} /><p>{free ? t('No templates yet. Design one with AI in the Library once, then reuse it.', 'لا توجد قوالب بعد. صمّم قالبًا بالذكاء الاصطناعي في المكتبة مرة واحدة، ثم أعد استخدامه.') : t('No templates are ready yet. Ask marketing to add them.', 'لا توجد قوالب جاهزة بعد. اطلب من التسويق إضافتها.')}</p></div>}
      </>}
    {free && <div><Button variant="secondary" onClick={() => navigate('/library')}><Wand2 size={15} /> {t('Design a new template', 'صمّم قالبًا جديدًا')}</Button></div>}
  </section>;
}

/** A design made outside the app: upload the image, name it, pick platforms; it becomes a draft ready for review. */
function UploadMode() {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  // A post made for a plan row starts with the row's title.
  const [title, setTitle] = useState(() => readPostPlan().slotTitle ?? '');
  const [caption, setCaption] = useState('');
  const [platforms, setPlatforms] = useState<CreativePlatform[]>(() => {
    const planned = (readPostPlan().channels ?? []).filter((c): c is CreativePlatform => (CREATIVE_PLATFORMS as string[]).includes(c));
    return planned.length ? planned : ['facebook', 'instagram'];
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setMessage(t('Use a PNG, JPEG or WebP image.', 'استخدم صورة PNG أو JPEG أو WebP.')); return; }
    if (file.size > 12_000_000) { setMessage(t('The image is larger than 12 MB.', 'الصورة أكبر من 12 ميجابايت.')); return; }
    setMessage(''); setImage(await asDataUrl(file));
    if (!title.trim()) setTitle(file.name.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' '));
  };
  const toggle = (platform: CreativePlatform) => setPlatforms((current) => current.includes(platform) ? current.filter((value) => value !== platform) : [...current, platform]);
  const submit = async () => {
    if (!image) { setMessage(t('Choose the image first.', 'اختر الصورة أولًا.')); return; }
    if (title.trim().length < 2) { setMessage(t('Give the post a short title.', 'اكتب عنوانًا قصيرًا للمنشور.')); return; }
    if (!platforms.length) { setMessage(t('Choose at least one platform.', 'اختر منصة واحدة على الأقل.')); return; }
    setBusy(true); setMessage('');
    try {
      const { url } = await api<{ url: string }>('/api/uploads', { body: { dataUrl: image } });
      const captions = caption.trim() ? Object.fromEntries(platforms.map((platform) => [platform, caption.trim()])) : {};
      const item = await api<{ id: string }>('/api/content', { body: { ...takePostPlan(), title: title.trim(), channels: platforms, captions, creative: { requestId: 'upload', directionId: 'upload', imageUrl: url, directionName: 'Uploaded design' } } });
      navigate(`/content/${item.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    setBusy(false);
  };
  return <section className="create-upload glass">
    <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pick(event.target.files?.[0])} />
    <button type="button" className="create-upload__drop" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void pick(event.dataTransfer.files[0]); }}>
      {image ? <img src={image} alt="" /> : <><ImagePlus size={28} /><b>{t('Choose or drop the image', 'اختر الصورة أو اسحبها هنا')}</b><small>PNG · JPEG · WebP</small></>}
    </button>
    <div className="create-upload__form u-stack">
      <label className="ui-field"><span className="ui-field__label">{t('Title', 'العنوان')}</span><input className="ui-input" value={title} onChange={(event) => setTitle(event.target.value)} dir="auto" placeholder={t('e.g. CFM course — November cohort', 'مثال: دورة CFM — دفعة نوفمبر')} /></label>
      <div className="ui-field"><span className="ui-field__label">{t('Platforms', 'المنصات')}</span>
        <div className="creative-home__platforms" role="group" aria-label={t('Platforms', 'المنصات')}>{CREATIVE_PLATFORMS.map((platform) => <button key={platform} type="button" aria-pressed={platforms.includes(platform)} onClick={() => toggle(platform)}><span className="creative-home__platform-icon"><ChannelIcon channel={platform} size={15} /></span>{PLATFORM_FORMATS[platform].label}</button>)}</div>
      </div>
      <label className="ui-field"><span className="ui-field__label">{t('Caption (optional)', 'النص المرافق (اختياري)')}</span><textarea className="ui-input" rows={4} value={caption} onChange={(event) => setCaption(event.target.value)} dir="auto" placeholder={t('You can also write or improve it with AI on the post page.', 'يمكنك أيضًا كتابته أو تحسينه بالذكاء الاصطناعي من صفحة المنشور.')} /></label>
      {message && <p role="alert" className="creative-home__error">{message}</p>}
      <div><Button variant="primary" busy={busy} disabled={busy} onClick={() => void submit()}>{t('Create the post', 'أنشئ المنشور')}</Button></div>
      <p className="u-xs u-muted">{t('It is saved as a draft. Open it to check the caption, then send it for approval.', 'يُحفظ كمسودة. افتحه لمراجعة النص ثم أرسله للاعتماد.')}</p>
    </div>
  </section>;
}

/** What every new post needs besides its design: why it exists and the day it is planned for. */
function PostDetails() {
  const { t } = useI18n();
  const [plan, setPlan] = useState<PostPlan>(readPostPlan);
  const update = (patch: Partial<PostPlan>) => setPlan((current) => { const next = { ...current, ...patch }; writePostPlan(next); return next; });
  return <section className="create-plan glass">
    <div>
      {plan.slotId && <span className="create-plan__slot"><CalendarDays size={13} /> {t('For the plan row', 'لخانة الخطة')}: <bdi>{plan.slotTitle}</bdi></span>}
      <h2>{t('What is this post for?', 'ما هدف هذا المنشور؟')}</h2>
      <p>{t('The goal decides which number the post is judged by after publishing.', 'الهدف يحدد الرقم الذي يُقاس به المنشور بعد نشره.')}</p>
      <GoalPicker value={plan.goal} onChange={(goal) => update({ goal })} />
    </div>
    <label className="ui-field">
      <span className="ui-field__label">{t('Planned for (optional)', 'اليوم المستهدف (اختياري)')}</span>
      <input className="ui-input" type="datetime-local" value={plan.plannedFor ? toInputValue(plan.plannedFor) : ''} onChange={(event) => update({ plannedFor: event.target.value ? fromInputValue(event.target.value) : null })} />
      <span className="ui-field__hint">{t('The post shows on that day in the calendar until someone schedules it.', 'يظهر المنشور في التقويم في هذا اليوم حتى تتم جدولته.')}</span>
    </label>
  </section>;
}
