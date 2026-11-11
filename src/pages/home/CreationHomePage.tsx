import { CampaignPicker } from '../../features/campaigns/Campaigns';
import { ScheduleComposer } from '../../features/schedule/ScheduleComposer';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Coins, Film, GraduationCap, ImagePlus, Layers, LayoutTemplate, Send, Sparkles, Upload, Wand2 } from 'lucide-react';
import { CaptionsEditor, type Captions } from '../../features/content/CaptionsEditor';
import { PublishHere, SavedHere } from '../../features/publishing/PublishHere';
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
import { coveredByMain, CREATIVE_PLATFORMS, DEFAULT_SIZES, mainFormat, masterChoices, masterOf, PLATFORM_FORMATS, sizeTargets, type CreativeMaster, type CreativePlatform } from '../../features/creative-studio/platforms';
import { presetsFor, type PublishingPreset } from '../../domain/output-presets';
import { channelName } from '../../i18n/labels';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useI18n } from '../../i18n/I18nProvider';

import { usePageMeta } from '../../shell/ShellContext';
import { DesignSettings } from '../../features/creative-studio/DesignSettings';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../../domain/design-engine';
import { BRAND_TEMPLATES, brandTemplate } from '../../domain/brand-templates';
import { BrandTemplateComposer, BrandTemplateGrid } from '../../features/brand-templates/BrandTemplateComposer';

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
  const followUpload = useRef<HTMLInputElement>(null);
  /** The design to follow: the AI makes the post as the same design, with new words and photos. */
  const [follow, setFollow] = useState<{ templateId: string; preview: string; name: string } | { dataUrl: string; preview: string; name: string } | null>(() => {
    const id = new URLSearchParams(window.location.search).get('follow');
    const entry = id ? brandTemplate(id) : undefined;
    return entry ? { templateId: entry.id, preview: entry.references.blue ?? entry.references.light ?? '', name: entry.name.ar } : null;
  });
  const [prompt, setPrompt] = useState(() => getActiveCreative()?.prompt ?? '');
  const [objective, setObjective] = useState<Objective | 'auto'>('auto');
  const [platforms, setPlatforms] = useState<CreativePlatform[]>(() => getActiveCreative()?.platforms ?? ['instagram']);
  const [platformTouched, setPlatformTouched] = useState(false);
  // Sizes ticked or unticked on top of each platform's defaults; restored with a running design.
  const [sizeChoice, setSizeChoice] = useState<Record<string, boolean>>(() => {
    const active = getActiveCreative();
    return active?.sizes ? Object.fromEntries(presetsFor(active.platforms).map((p) => [p.id, active.sizes!.includes(p.id)])) : {};
  });
  const chosenSizes = presetsFor(platforms).filter((p) => sizeChoice[p.id] ?? DEFAULT_SIZES[p.channel as CreativePlatform]?.includes(p.id)).map((p) => p.id);
  const [mainPick, setMainPick] = useState<CreativeMaster | null>(() => getActiveCreative()?.format ?? null);
  const main = mainFormat(platforms, chosenSizes, mainPick);
  // One design by default: each one is a full AI image and the person usually wants one. Two to compare.
  const [designs, setDesigns] = useState<1 | 2>(1);
  const [references, setReferences] = useState<CreativeReference[]>([]);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  // Coming back while a design is still running reopens it; links that name a template open that template.
  const [mode, setMode] = useState<Mode>(() => {
    if (free && (query.has('creative') || query.has('template') || query.has('follow') || getActiveCreative()?.status === 'running')) return 'ai';
    if ((query.has('svgTemplate') || query.has('schedule') || query.has('brand')) && ways.includes('template')) return 'template';
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
  // A library design picked from the AI screen: the template opens with the idea already written.
  const [brandPick] = useState<{ id: string; prompt: string } | null>(() => (query.get('brand') ? { id: query.get('brand')!, prompt: '' } : null));
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
  // null until the campaigns load and the one running today is picked; '' means no campaign.
  const [campaignId, setCampaignId] = useState<string | null>(null);
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
  const pickFollowFile = async (file: File | undefined) => {
    if (followUpload.current) followUpload.current.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setMessage(t('Use a PNG, JPEG or WebP image.', 'استخدم صورة PNG أو JPEG أو WebP.')); return; }
    if (file.size > 5_000_000) { setMessage(t('The design is larger than 5 MB.', 'التصميم أكبر من ٥ ميجابايت.')); return; }
    const dataUrl = await asDataUrl(file);
    setMessage(''); setFollow({ dataUrl, preview: dataUrl, name: file.name });
  };
  const startFullCreative = async () => {
    if (prompt.trim().length < 10) { setMessage(t('Describe the post in a little more detail.', 'اكتب وصف المنشور بتفاصيل أكثر.')); return; }
    if (!platforms.length) { setMessage(t('Choose at least one platform.', 'اختر منصة واحدة على الأقل.')); return; }
    setCreating(true); setMessage('');
    try {
      // Both designs are made at the main size; the other ticked shapes are adapted from the one picked.
      const format = main;
      const attachments = references.filter((file) => file.dataUrl).map(({ name, mime, dataUrl }) => ({ name, mime, dataUrl: dataUrl! }));
      const body = await api<{ jobId: string; requestId?: string }>('/api/ai/full-creative', { body: { prompt, ...(campaignId ? { campaignId } : {}), format, directions: designs, settings: designSettings, ...(objective !== 'auto' ? { objective } : {}), ...(attachments.length ? { attachments } : {}), ...(template ? { templateId: template.id } : {}), ...(follow ? { followDesign: 'templateId' in follow ? { templateId: follow.templateId } : { name: follow.name, dataUrl: follow.dataUrl } } : {}) } });
      setJobId(body.jobId); setRequestId(body.requestId ?? ''); setStage('generating');
      setActiveCreative({ jobId: body.jobId, requestId: body.requestId ?? '', prompt, platforms, sizes: chosenSizes, format, startedAt: new Date().toISOString(), status: 'running' });
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
    ai: ['Write the idea in your own words. We check Odoo, write the copy, design the post and place the official logo.', 'اكتب الفكرة بكلماتك. نراجع بيانات Odoo ونكتب النص ونصمّم المنشور ونضع الشعار الرسمي.'],
    template: ['Pick a template, change its text and photos, then send it for approval. No AI cost.', 'اختر قالبًا، غيّر نصوصه وصوره، ثم أرسله للاعتماد. بدون تكلفة ذكاء اصطناعي.'],
    upload: ['Already designed it? Upload the image, pick the platforms, write the caption and publish, all on this screen.', 'صمّمته بالفعل؟ ارفع الصورة، اختار المنصات، اكتب النص وانشر، كله من الشاشة دي.'],
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
        {[[ 'Choose how', 'اختر الطريقة'], ['Make the post', 'جهّز المنشور'], ['Publish, or send it to the publisher', 'انشره، أو ابعته للمسؤول عن النشر']].map(([en, ar], index) => {
          const current = mode === 'choose' ? 0 : 1;
          return <li key={en} data-state={index < current ? 'done' : index === current ? 'current' : undefined}><span className="u-tnum">{index + 1}</span>{t(en, ar)}</li>;
        })}
      </ol>
    </header>
    {mode === 'choose' && <div className="create-methods">
      {free && <button type="button" className="create-method glass" onClick={() => setMode('ai')}>
        <span className="create-method__icon" data-tone="brand"><Wand2 size={22} /></span>
        <b>{t('Describe it, AI designs it', 'اكتب الفكرة والذكاء الاصطناعي يصمّم')}</b>
        <small>{t('For a new idea. You write a sentence; you get a finished design with copy for each platform.', 'لفكرة جديدة. تكتب جملة وتحصل على تصميم جاهز مع النص لكل منصة.')}</small>
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
        <small>{t('Designed it elsewhere? Upload it, write the caption and publish from one screen.', 'صمّمته في برنامج تاني؟ ارفعه واكتب النص وانشره من شاشة واحدة.')}</small>
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
    {mode === 'template' && <TemplateMode key={brandPick?.id ?? ''} initialId={query.get('svgTemplate')} initialSchedule={query.has('schedule')} initialBrand={brandPick?.id ?? null} initialPrompt={brandPick?.prompt ?? ''} />}
    {mode === 'ai' && <div className={stage === 'compose' ? 'create-layout' : 'create-layout create-layout--single'}>
    <div className="creative-home__hero">
      {stage === 'compose' && <>
        <div className="creative-home__composer"><span className="creative-home__composer-icon"><Sparkles size={20} /></span><textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); if (!platformTouched) { const found = detectPlatforms(event.target.value); if (found.length) setPlatforms(found); } }} rows={4} placeholder={t('Example: Create a CFM course post for Facebook, Instagram and WhatsApp next week…', 'مثال: صمّم منشورًا عن دورة CFM التي تبدأ الأسبوع القادم لفيسبوك وإنستجرام وواتساب…')} aria-label={t('Describe the content to create', 'صف المحتوى الذي تريد إنشاءه')} dir="auto" /></div>
        <div className="creative-home__tools">
          <input ref={upload} hidden type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.txt,.md,text/plain,text/markdown" onChange={(event) => void addFiles(event.target.files)} />
          <button type="button" disabled={references.length >= 6} onClick={() => upload.current?.click()}><ImagePlus size={16} />{t('Attach an image or file', 'أرفق صورة أو ملفًا')}</button>
          <button type="button" onClick={() => setSourcePanel(sourcePanel === 'post' ? null : 'post')}>{t('Use existing post', 'استخدم منشورًا سابقًا')}</button>
          <button type="button" onClick={() => setSourcePanel(sourcePanel === 'course' ? null : 'course')}><GraduationCap size={16} />{t('Choose a course from the website', 'اختر دورة من الموقع')}</button>
        </div>
        {sourcePanel === 'post' && <div className="creative-home__source"><strong>{t('Existing posts', 'منشورات سابقة')}</strong><p className="u-xs u-muted">{t('Existing workspace posts are references only.', 'المنشورات السابقة مراجع فقط.')}</p><div>{(pipeline ?? []).slice(0, 8).map((item) => <button key={item.id} type="button" onClick={() => { setPrompt((current) => `${current}${current ? ' — ' : ''}${item.title}`); setSourcePanel(null); }}>{item.title}</button>)}</div></div>}
        {sourcePanel === 'course' && <div className="creative-home__source"><strong>{t('Website courses and their upcoming runs', 'دورات الموقع ومواعيدها القادمة')}</strong><p className="u-xs u-muted">{t('Dates and links come from Odoo; the design uses them exactly.', 'التواريخ والروابط من Odoo، ويستخدمها التصميم كما هي.')}</p><CoursePicker autoFocus onPick={(pick) => {
          const run = runOf(pick);
          const name = pick.type === 'course' ? pick.course.name : pick.event.title;
          const when = run ? ` — ${new Date(run.startsAt).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' })}` : '';
          setPrompt((current) => `${current}${current ? ' — ' : ''}${name}${when}`);
          setSourcePanel(null);
        }} /></div>}
        <div className="create-ai-templates">
          <span className="u-xs u-muted">{t('Design it like one of these: AI keeps the design and changes all the words and photos (optional):', 'صمّمه على نفس شكل تصميم من دول، والذكاء الاصطناعي يغيّر الكلام والصور كلها (اختياري):')}</span>
          <div className="create-ai-templates__list" role="radiogroup" aria-label={t('Design to follow', 'التصميم اللي يمشي عليه')}>
            {BRAND_TEMPLATES.map((entry) => {
              const on = Boolean(follow && 'templateId' in follow && follow.templateId === entry.id);
              const preview = entry.references.blue ?? entry.references.light ?? '';
              return <button key={entry.id} type="button" role="radio" aria-checked={on} onClick={() => setFollow(on ? null : { templateId: entry.id, preview, name: entry.name.ar })}>{on ? <Check size={14} strokeWidth={3} className="create-ai-templates__check" /> : null}<img src={preview} alt="" />{t(entry.name.en, entry.name.ar)}</button>;
            })}
            <input ref={followUpload} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pickFollowFile(event.target.files?.[0])} />
            <button type="button" role="radio" aria-checked={Boolean(follow && 'dataUrl' in follow)} onClick={() => followUpload.current?.click()}>{follow && 'dataUrl' in follow ? <img src={follow.preview} alt="" /> : <Upload size={14} />}{follow && 'dataUrl' in follow ? t('Your design', 'تصميمك') : t('Upload your own design', 'ارفع تصميم من عندك')}</button>
          </div>
          {follow && <div className="create-follow">
            <img src={follow.preview} alt="" />
            <span><b>{t('Same design, new words and photos', 'نفس التصميم، كلام وصور جديدة')}</b><small>{t('Write the whole post in the box above: the course, the offer, the price, the date. AI writes it into this design.', 'اكتب المنشور كله في الخانة اللي فوق: الدورة والعرض والسعر والميعاد، والذكاء الاصطناعي يحطه على التصميم ده.')}</small></span>
            <button type="button" onClick={() => setFollow(null)} aria-label={t('Remove the design', 'شيل التصميم')}>×</button>
          </div>}
        </div>
        {references.length > 0 && <ul className="creative-home__references">{references.map((file, index) => <li key={`${file.name}-${index}`}>{file.mime.startsWith('image/') && file.dataUrl && <img src={file.dataUrl} alt="" />}<span>{file.name}</span><button type="button" onClick={() => setReferences((current) => current.filter((_, i) => i !== index))} aria-label={t(`Remove ${file.name}`, `احذف ${file.name}`)}>×</button></li>)}</ul>}
        <CampaignPicker value={campaignId} onChange={setCampaignId} />
        <div className="creative-home__platforms" role="group" aria-label={t('Platforms', 'المنصات')}>{CREATIVE_PLATFORMS.map((platform) => <button key={platform} type="button" aria-pressed={platforms.includes(platform)} onClick={() => togglePlatform(platform)}><span className="creative-home__platform-icon"><ChannelIcon channel={platform} size={15} /></span>{PLATFORM_FORMATS[platform].label}</button>)}</div>
        <details className="create-advanced">
          <summary>{t('More options (optional)', 'خيارات إضافية (اختياري)')}</summary>
          <DesignSettings value={designSettings} onChange={setDesignSettings} />
          <div className="creative-home__options"><label>{t('Objective', 'الهدف')}<select value={objective} onChange={(event) => setObjective(event.target.value as Objective | 'auto')}>{OBJECTIVES.map((entry) => <option key={entry.value} value={entry.value}>{t(entry.en, entry.ar)}</option>)}</select></label></div>
        </details>
        <div className="creative-home__action"><p className="u-xs">{t('Attached images, PDFs and text files are read by the AI as context. Up to 6 files, 2 MB each.', 'يقرأ الذكاء الاصطناعي الصور وملفات PDF والنصوص المرفقة كسياق للتصميم. حتى ٦ ملفات، ٢ ميجابايت لكل ملف.')}</p><Button variant="primary" className="cta-create" disabled={creating} busy={creating} onClick={() => void startFullCreative()}>{!creating && <Sparkles size={17} className="cta-create__spark" />}{creating ? t('Starting…', 'جارٍ البدء…') : t('Design the post', 'صمّم المنشور')}</Button></div>
      </>}
      {stage === 'generating' && (jobId || requestId) && <FullCreativeJob key={`${jobId}:${requestId}`} jobId={jobId} requestId={requestId} platforms={platforms} sizes={getActiveCreative()?.requestId === requestId && getActiveCreative()?.sizes ? getActiveCreative()!.sizes! : chosenSizes} format={getActiveCreative()?.requestId === requestId ? getActiveCreative()?.format : main} prompt={prompt} onRestart={() => { setStage('compose'); setJobId(''); setRequestId(''); clearActiveCreative(); }} />}
      {message && <p role="alert" className="creative-home__error">{message}</p>}
    </div>
    {stage === 'compose' && <SizePicker platforms={platforms} chosen={chosenSizes} main={main} designs={designs} onDesigns={setDesigns} onToggle={(ids, on) => setSizeChoice((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, on])) }))} onMain={setMainPick} />}
    </div>}
    <RecentContent />
  </div>;
}

/** Familiar names for the shapes most posts use; rarer sizes are named after their placements. */
const GROUP_NAME: Record<string, [string, string]> = {
  '1080x1350': ['Portrait post', 'بوست طولي'], '1080x1080': ['Square post', 'بوست مربع'], '1080x1920': ['Story · Reel · Status', 'ستوري · ريل · حالة'],
  '1080x1440': ['Instagram grid', 'طولي للجريد'], '1200x630': ['Link · banner', 'رابط · بانر'], '1200x627': ['Landscape post', 'بوست عرضي'],
  '1280x720': ['YouTube thumbnail', 'صورة مصغرة'], '1600x900': ['Landscape post', 'بوست عرضي'],
};
const RATIO: Record<string, string> = { '1080x1350': '4:5', '1080x1080': '1:1', '1080x1920': '9:16', '1080x1440': '3:4', '1200x630': '1.91:1', '1200x627': '1.91:1', '1920x1005': '1.91:1', '900x600': '3:2', '1500x500': '3:1', '1128x376': '3:1', '1584x396': '4:1' };
const ratioOf = (width: number, height: number) => RATIO[`${width}x${height}`] ?? (Math.abs(width / height - 16 / 9) < 0.01 ? '16:9' : `${(width / height).toFixed(1)}:1`);
/** Sizes most posts need; covers, banners and long-lived placements sit under "More sizes". */
const COMMON = new Set(['website-banner', 'facebook-link', 'linkedin-landscape', 'x-landscape', 'youtube-thumbnail-hd']);
const MAIN_LABEL: Record<CreativeMaster, [string, string]> = { feed: ['Portrait 4:5', 'طولي 4:5'], story: ['Story 9:16', 'ستوري 9:16'], landscape: ['Banner 1.91:1', 'بانر 1.91:1'], video: ['Thumbnail 16:9', 'مصغرة 16:9'] };

interface SizeGroup { key: string; width: number; height: number; presets: PublishingPreset[]; common: boolean }
/** The chosen platforms' sizes, one entry per distinct pixel size (a 1080×1080 for three platforms is one design). */
function sizeGroups(platforms: CreativePlatform[]): SizeGroup[] {
  const groups = new Map<string, SizeGroup>();
  for (const preset of presetsFor(platforms)) {
    const key = `${preset.width}x${preset.height}`;
    const group = groups.get(key) ?? { key, width: preset.width, height: preset.height, presets: [], common: false };
    group.presets.push(preset);
    group.common ||= preset.format !== 'landscape' || COMMON.has(preset.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * The sizes the post will be delivered in, as shapes to tick: the designs are made at the main size, and every
 * other ticked shape is a new design drawn for its own shape from the design you pick.
 */
function SizePicker({ platforms, chosen, main, designs, onDesigns, onToggle, onMain }: { platforms: CreativePlatform[]; chosen: string[]; main: CreativeMaster; designs: 1 | 2; onDesigns: (count: 1 | 2) => void; onToggle: (ids: string[], on: boolean) => void; onMain: (format: CreativeMaster) => void }) {
  const { t, tx } = useI18n();
  const [estimate, setEstimate] = useState<{ usd: number; perDesign: number; repairs: number } | null>(null);
  useEffect(() => {
    void api<{ averageImageUsd: number | null; imagesPerDesign?: number; repairCallsMax?: number }>('/api/usage').then((report) => setEstimate({ usd: report.averageImageUsd ?? 0.2, perDesign: report.imagesPerDesign ?? 1, repairs: report.repairCallsMax ?? 1 })).catch(() => {});
  }, []);
  const groups = sizeGroups(platforms);
  const covered = coveredByMain(platforms, main);
  const targets = sizeTargets(platforms, chosen, main);
  const options = [...new Set([...masterChoices(platforms, chosen), main])];
  const isOn = (group: SizeGroup) => group.presets.some((p) => chosen.includes(p.id) || covered.includes(p.id));
  const isMain = (group: SizeGroup) => masterOf(group.width, group.height) === main;
  const toggle = (group: SizeGroup) => onToggle(group.presets.map((p) => p.id), !isOn(group));
  const common = groups.filter((g) => g.common);
  const more = groups.filter((g) => !g.common);
  const moreOn = more.filter(isOn).length;
  const tile = (group: SizeGroup) => {
    const on = isOn(group);
    const channels = [...new Set(group.presets.map((p) => p.channel))];
    const name = GROUP_NAME[group.key] ?? [group.presets.map((p) => p.name.en).join(' · '), group.presets.map((p) => p.name.ar).join(' · ')];
    const ratio = group.width / group.height;
    return <button key={group.key} type="button" className="size-tile" aria-pressed={on} data-main={on && isMain(group) ? '' : undefined} onClick={() => toggle(group)}
      title={group.presets.map((p) => `${channelName[p.channel]}: ${tx(p.name)}`).join('\n')}>
      <span className="size-tile__stage"><span className="size-tile__shape" style={ratio >= 1 ? { width: '100%', aspectRatio: `${group.width} / ${group.height}` } : { height: '100%', aspectRatio: `${group.width} / ${group.height}` }}><b dir="ltr">{ratioOf(group.width, group.height)}</b></span></span>
      <span className="size-tile__name">{t(name[0], name[1])}</span>
      <span className="size-tile__meta"><span className="size-tile__icons">{channels.map((c) => <ChannelIcon key={c} channel={c} size={12} />)}</span><small dir="ltr" className="u-tnum">{group.width}×{group.height}</small></span>
      <span className="size-tile__check" aria-hidden>{on && <Check size={12} strokeWidth={3} />}</span>
      {on && isMain(group) && <em className="size-tile__badge">{t('Main', 'الأساسي')}</em>}
    </button>;
  };
  return <aside className="create-preview glass" aria-label={t('Sizes', 'المقاسات')}>
    <div className="create-preview__head"><h2>{t('Sizes', 'المقاسات')}</h2><p className="u-xs u-muted">{t('Tap every shape you need.', 'دوس على كل مقاس محتاجه.')}</p></div>
    {!platforms.length && <p className="u-sm u-muted">{t('Choose at least one platform.', 'اختر منصة واحدة على الأقل.')}</p>}
    {platforms.length > 0 && <>
      <div className="size-tiles">{common.map(tile)}</div>
      {more.length > 0 && <details className="size-more">
        <summary>{t('Covers, banners and more', 'أغلفة وبانرات ومقاسات تانية')} {moreOn > 0 && <small className="u-tnum">{t(`${moreOn} ticked`, `${moreOn} متعلّم`)}</small>}</summary>
        <div className="size-tiles">{more.map(tile)}</div>
      </details>}
      <div className="size-plan">
        <div className="size-plan__row">
          <span>{t('How many designs', 'عدد التصاميم')}</span>
          <div className="size-plan__switch" role="radiogroup" aria-label={t('How many designs', 'عدد التصاميم')}>
            <button type="button" role="radio" aria-checked={designs === 1} onClick={() => onDesigns(1)}>{t('One design', 'تصميم واحد')}</button>
            <button type="button" role="radio" aria-checked={designs === 2} onClick={() => onDesigns(2)}>{t('Two to compare', 'اتنين للمقارنة')}</button>
          </div>
        </div>
        <div className="size-plan__row">
          <span>{designs === 1 ? t('The design comes out as', 'التصميم هيطلع') : t('Both designs come out as', 'التصميمين هيطلعوا')}</span>
          {options.length > 1
            ? <div className="size-plan__switch" role="radiogroup" aria-label={t('Main size', 'المقاس الأساسي')}>{options.map((format) => <button key={format} type="button" role="radio" aria-checked={format === main} onClick={() => onMain(format)}>{t(...MAIN_LABEL[format])}</button>)}</div>
            : <b>{t(...MAIN_LABEL[main])}</b>}
        </div>
        {targets.length > 0 && <p className="size-plan__extra"><Layers size={14} /> <span>{t(`Then ${targets.map((x) => ratioOf(x.width, x.height)).join(', ')}: each drawn from scratch for its own shape, with the same idea and words, with one tap under the design you pick.`, `وبعدها ${targets.map((x) => ratioOf(x.width, x.height)).join('، ')}: كل مقاس بيتصمم من الأول لشكله، بنفس الفكرة والكلام، بضغطة تحت التصميم اللي تختاره.`)}</span></p>}
        {estimate && (() => {
          const images = designs * estimate.perDesign + targets.length;
          // Each design and each size may take one repair image, only when its words or its logo corner need it.
          const most = images + (designs + targets.length) * estimate.repairs;
          const range = most > images ? ` – $${(most * estimate.usd).toFixed(2)}` : '';
          return <p className="create-preview__cost"><Coins size={15} /> {t('Expected AI cost', 'التكلفة المتوقعة')}: <b dir="ltr">≈ ${(images * estimate.usd).toFixed(2)}{range}</b> <small>{most > images ? t(`${images} AI images, up to ${most} if words or the logo need a repair`, `${images} صورة ذكاء اصطناعي، ولحد ${most} لو الكلام أو اللوجو احتاجوا تصليح`) : t(`${images} AI images`, `${images} صورة ذكاء اصطناعي`)}</small></p>;
        })()}
      </div>
    </>}
  </aside>;
}

/** Ready templates: pick the kind of post, then a template, fill it and export without any image-model cost. */
function TemplateMode({ initialId, initialSchedule, initialBrand, initialPrompt }: { initialId: string | null; initialSchedule: boolean; initialBrand: string | null; initialPrompt: string }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { can } = useAuth();
  const free = can('design.free');
  const { items, error, reload } = useSvgTemplates();
  const [selected, setSelected] = useState<string | null>(initialId);
  const [kind, setKind] = useState<TemplateKind | 'all'>('all');
  const [schedule, setSchedule] = useState(initialSchedule);
  const [brand, setBrand] = useState(() => brandTemplate(initialBrand) ?? null);
  const template = items?.find((item) => item.id === selected);
  if (schedule) return <ScheduleComposer onClose={() => setSchedule(false)} />;
  if (brand) return <BrandTemplateComposer key={brand.id} template={brand} initialPrompt={initialBrand === brand.id ? initialPrompt : ''} onClose={() => setBrand(null)} />;
  if (error) return <div className="library-empty glass" role="alert"><p>{error}</p><Button variant="secondary" onClick={() => void reload()}>{t('Retry', 'أعد المحاولة')}</Button></div>;
  if (!items) return <div className="board-loading"><span className="ui-btn__spinner" /></div>;
  if (template) return <TemplateComposer key={template.id} template={template} onClose={() => setSelected(null)} />;
  const shown = kind === 'all' ? items : items.filter((item) => item.kind === kind);
  const kinds = (Object.keys(KIND_LABEL) as TemplateKind[]).filter((value) => items.some((item) => item.kind === value));
  return <section className="u-stack">
    <div className="library-section">
      <div className="library-section__head"><h2><LayoutTemplate size={18} /> {t('Engosoft brand designs', 'تصاميم هوية إنجوسوفت')}</h2><small className="u-muted">{t('Every size, the exact logo, your photos', 'كل المقاسات، الشعار الصح، وصورك')}</small></div>
      <BrandTemplateGrid onOpen={setBrand} />
    </div>
    {/* The monthly course schedule is a template of its own: rows from a sheet or Odoo, as many posts as the month needs. */}
    <button type="button" className="schedule-card glass" onClick={() => setSchedule(true)}>
      <span className="schedule-card__icon"><CalendarDays size={22} /></span>
      <span><b>{t('Course schedule of the month', 'جدول مواعيد الدورات للشهر')}</b><small>{t('Upload the CSV/Excel sheet or read Odoo; get every Facebook and Instagram post in the approved design (4:5 and 1:1).', 'ارفع شيت CSV/Excel أو اقرأ من Odoo، وخد كل بوستات فيسبوك وإنستجرام بالتصميم المعتمد (4:5 و1:1).')}</small></span>
      <img src="/post-assets/schedule-preview.jpg" alt="" />
    </button>
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

/**
 * A design made outside the app, published from this one screen: upload the image, pick platforms, write or
 * refine the caption per platform (with AI if wanted), then publish or schedule here. Nothing moves to another page.
 */
function UploadMode() {
  const { t } = useI18n();
  const { can } = useAuth();
  const publisher = can('content.publish') || can('content.schedule');
  const input = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  // A post made for a plan row starts with the row's title.
  const [title, setTitle] = useState(() => readPostPlan().slotTitle ?? '');
  const [captions, setCaptions] = useState<Captions>({});
  const [captionBusy, setCaptionBusy] = useState(false);
  const [platforms, setPlatforms] = useState<CreativePlatform[]>(() => {
    const planned = (readPostPlan().channels ?? []).filter((c): c is CreativePlatform => (CREATIVE_PLATFORMS as string[]).includes(c));
    return planned.length ? planned : ['facebook', 'instagram'];
  });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  /** The saved post: saving again updates it instead of making a second one. */
  const [created, setCreated] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [saved, setSaved] = useState<'' | 'draft' | 'sent'>('');
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setMessage(t('Use a PNG, JPEG or WebP image.', 'استخدم صورة PNG أو JPEG أو WebP.')); return; }
    if (file.size > 12_000_000) { setMessage(t('The image is larger than 12 MB.', 'الصورة أكبر من 12 ميجابايت.')); return; }
    setMessage(''); setImage(await asDataUrl(file)); setUploaded(null); setCreated(null); setSaved('');
    if (!title.trim()) setTitle(file.name.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' '));
  };
  const toggle = (platform: CreativePlatform) => setPlatforms((current) => current.includes(platform) ? current.filter((value) => value !== platform) : [...current, platform]);
  /** Saves the post (once) with what is on screen and returns its id. */
  const save = async (): Promise<string | null> => {
    if (!image) { setMessage(t('Choose the image first.', 'اختر الصورة أولًا.')); return null; }
    if (title.trim().length < 2) { setMessage(t('Give the post a short title.', 'اكتب عنوانًا قصيرًا للمنشور.')); return null; }
    if (!platforms.length) { setMessage(t('Choose at least one platform.', 'اختر منصة واحدة على الأقل.')); return null; }
    setMessage('');
    const text = Object.fromEntries(platforms.map((platform) => [platform, captions[platform]?.trim() ?? '']).filter(([, value]) => value));
    if (created) { await api(`/api/content/${created}`, { method: 'PATCH', body: { title: title.trim(), channels: platforms, captions: text } }); return created; }
    const url = uploaded ?? (await api<{ url: string }>('/api/uploads', { body: { dataUrl: image } })).url;
    setUploaded(url);
    const item = await api<{ id: string }>('/api/content', { body: { ...takePostPlan(), title: title.trim(), channels: platforms, captions: text, creative: { requestId: 'upload', directionId: 'upload', imageUrl: url, directionName: 'Uploaded design' } } });
    setCreated(item.id);
    return item.id;
  };
  const run = async (action: 'publish' | 'draft' | 'send') => {
    setBusy(action); setSaved('');
    try {
      const id = await save();
      if (id && action === 'publish') setPublishing(id);
      if (id && action === 'send') { await api(`/api/content/${id}/transition`, { body: { to: 'ready_for_review' } }); setSaved('sent'); }
      if (id && action === 'draft') setSaved('draft');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    setBusy('');
  };
  const locked = saved === 'sent';
  return <section className="create-upload glass">
    <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pick(event.target.files?.[0])} />
    <button type="button" className="create-upload__drop" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void pick(event.dataTransfer.files[0]); }}>
      {image ? <img src={image} alt="" /> : <><ImagePlus size={28} /><b>{t('Choose or drop the image', 'اختر الصورة أو اسحبها هنا')}</b><small>PNG · JPEG · WebP</small></>}
    </button>
    <div className="create-upload__form u-stack">
      <label className="ui-field"><span className="ui-field__label">{t('Title', 'العنوان')}</span><input className="ui-input" value={title} disabled={locked} onChange={(event) => setTitle(event.target.value)} dir="auto" placeholder={t('e.g. CFM course — November cohort', 'مثال: دورة CFM — دفعة نوفمبر')} /></label>
      <div className="ui-field"><span className="ui-field__label">{t('Platforms', 'المنصات')}</span>
        <div className="creative-home__platforms" role="group" aria-label={t('Platforms', 'المنصات')}>{CREATIVE_PLATFORMS.map((platform) => <button key={platform} type="button" disabled={locked} aria-pressed={platforms.includes(platform)} onClick={() => toggle(platform)}><span className="creative-home__platform-icon"><ChannelIcon channel={platform} size={15} /></span>{PLATFORM_FORMATS[platform].label}</button>)}</div>
      </div>
      <div className="ui-field create-upload__captions"><span className="ui-field__label">{t('Caption for each platform', 'النص لكل منصة')}</span>
        {platforms.length
          ? <CaptionsEditor channels={platforms} value={captions} onChange={setCaptions} readOnly={locked} onBusy={setCaptionBusy} ai={{ facts: `عنوان المنشور: ${title.trim() || 'منشور من Engosoft'}` }} />
          : <p className="u-sm u-muted">{t('Choose a platform to write its caption.', 'اختار منصة علشان تكتب نصها.')}</p>}
      </div>
      {message && <p role="alert" className="creative-home__error">{message}</p>}
      <div className="create-upload__actions">
        {publisher
          ? <Button variant="primary" icon={<Send size={15} />} busy={busy === 'publish'} disabled={Boolean(busy) || captionBusy} onClick={() => void run('publish')}>{t('Publish or schedule', 'انشر أو جدول')}</Button>
          : <Button variant="primary" icon={<Send size={15} />} busy={busy === 'send'} disabled={Boolean(busy) || captionBusy || locked} onClick={() => void run('send')}>{t('Send to the publisher', 'ابعته للمسؤول عن النشر')}</Button>}
        <Button variant="secondary" busy={busy === 'draft'} disabled={Boolean(busy) || captionBusy || locked} onClick={() => void run('draft')}>{t('Save as draft', 'احفظه مسودة')}</Button>
      </div>
      {saved && <SavedHere contentId={created} sent={saved === 'sent'} />}
      <PublishHere contentId={publishing} onClose={() => setPublishing(null)} />
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
