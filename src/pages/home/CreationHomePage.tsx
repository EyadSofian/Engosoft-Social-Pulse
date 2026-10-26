import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileUp, ImagePlus, Sparkles } from 'lucide-react';
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
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { CREATIVE_PLATFORMS, PLATFORM_FORMATS, type CreativePlatform } from '../../features/creative-studio/platforms';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type OdooEvent = { id: string; title: string; startsAt: string; endsAt: string; source: string; location?: string; registrationUrl?: string; websitePublished?: boolean };
type Stage = 'compose' | 'generating';
const FEED_PLATFORMS: CreativePlatform[] = ['instagram', 'facebook', 'linkedin'];
const OBJECTIVES: { value: Objective | 'auto'; ar: string; en: string }[] = [
  { value: 'auto', ar: 'حدده من الطلب', en: 'Detect from prompt' },
  { value: 'course_launch', ar: 'إعلان دورة', en: 'Course announcement' },
  { value: 'course_schedule', ar: 'جدول دورات', en: 'Course schedule' },
  { value: 'certificate', ar: 'شهادة أو إنجاز', en: 'Certificate or achievement' },
  { value: 'education', ar: 'محتوى تعليمي', en: 'Educational content' },
  { value: 'event', ar: 'فعالية أو مناسبة', en: 'Event or occasion' },
  { value: 'general', ar: 'بوست عام', en: 'General post' },
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
  return found;
}
function dateMention(prompt: string): { day: number; month: number } | null {
  const months: Record<string, number> = { يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12, january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const match = prompt.toLowerCase().match(/(\d{1,2})\s+(يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر|january|february|march|april|may|june|july|august|september|october|november|december)/i);
  return match ? { day: Number(match[1]), month: months[match[2].toLowerCase()] } : null;
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
    <div className="creative-home__section-title"><h2>{t('Continue your work', 'كمّل شغلك')}</h2><Link to="/content">{t('All content', 'كل المحتوى')} <ArrowLeft size={15} /></Link></div>
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
  const [prompt, setPrompt] = useState('');
  const [objective, setObjective] = useState<Objective | 'auto'>('auto');
  const [platforms, setPlatforms] = useState<CreativePlatform[]>(['instagram']);
  const [platformTouched, setPlatformTouched] = useState(false);
  const [references, setReferences] = useState<CreativeReference[]>([]);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [stage, setStage] = useState<Stage>('compose');
  const [jobId, setJobId] = useState('');
  const [template, setTemplate] = useState<AiTemplate | null>(null);
  useEffect(() => {
    if (!query.has('template')) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(TEMPLATE_PREFILL_KEY) || 'null') as AiTemplate | null;
      sessionStorage.removeItem(TEMPLATE_PREFILL_KEY);
      if (saved) { setTemplate(saved); setPrompt(saved.prompt); if (saved.channels.length) { setPlatforms(saved.channels as CreativePlatform[]); setPlatformTouched(true); } }
    } catch { /* bad prefill ignored */ }
  }, [query]);
  const [odooEvents, setOdooEvents] = useState<OdooEvent[]>([]);
  const [odooMessage, setOdooMessage] = useState('');
  const [sourcePanel, setSourcePanel] = useState<'course' | 'event' | 'post' | null>(null);
  const { items: pipeline } = usePipeline();
  usePageMeta(t('Create', 'إنشاء'), [{ label: t('Create', 'إنشاء') }]);
  useEffect(() => { void fetch('/api/odoo/schedule').then((response) => response.json()).then((data: { status: string; events?: OdooEvent[]; message?: string }) => { if (data.status === 'connected') setOdooEvents(data.events ?? []); else setOdooMessage(data.message || 'Odoo unavailable'); }).catch(() => setOdooMessage(t('Odoo is unavailable right now.', 'Odoo غير متاح حاليًا.'))); }, []);
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
    if (prompt.trim().length < 10) { setMessage(t('Describe the post in a little more detail.', 'اكتب وصف البوست بتفاصيل أكثر.')); return; }
    if (!platforms.length) { setMessage(t('Choose at least one platform.', 'اختار منصة واحدة على الأقل.')); return; }
    setCreating(true); setMessage('');
    try {
      // The master is a 4:5 feed post when any feed platform is selected; story platforms get an adapted 9:16 version.
      const format = platforms.some((p) => FEED_PLATFORMS.includes(p)) ? 'feed' : 'story';
      const response = await fetch('/api/ai/full-creative', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, format, directions: 3, ...(template ? { templateId: template.id } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('Generation could not start.', 'التوليد ما بدأش.'));
      setJobId(body.jobId); setStage('generating');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    setCreating(false);
  };
  return <div className="u-stack u-stack--lg creative-home">
    <div className="creative-home__hero">
      <PageHeader title={t('What would you like to create?', 'ماذا تريد أن تنشئ؟')} description={t('Describe the idea. We will check company context, suggest directions, then build editable posts for every selected platform.', 'اكتب الفكرة. هنراجع بيانات الشركة ونقترح اتجاهات، ثم نجهّز بوستات قابلة للتعديل لكل منصة.')} />
      {stage === 'compose' && <>
        <div className="creative-home__composer"><span className="creative-home__composer-icon"><Sparkles size={20} /></span><textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); if (!platformTouched) { const found = detectPlatforms(event.target.value); if (found.length) setPlatforms(found); } }} rows={4} placeholder={t('Example: Create a CFM course post for Facebook, Instagram and WhatsApp next week…', 'مثال: اعمل بوست عن دورة CFM اللي هتبدأ الأسبوع الجاي للفيسبوك وإنستجرام وواتساب…')} aria-label={t('Describe the content to create', 'صف المحتوى الذي تريد إنشاءه')} dir="auto" /></div>
        <div className="creative-home__tools">
          <input ref={upload} hidden type="file" multiple accept="image/*,.pdf,.docx,.txt,.md" onChange={(event) => void addFiles(event.target.files)} />
          <button type="button" onClick={() => upload.current?.click()}><FileUp size={16} />{t('Add reference', 'أضف مرجع')}</button>
          <button type="button" onClick={() => upload.current?.click()}><ImagePlus size={16} />{t('Upload image / file', 'ارفع صورة أو ملف')}</button>
          <button type="button" onClick={() => setSourcePanel(sourcePanel === 'post' ? null : 'post')}>{t('Use existing post', 'استخدم بوست سابق')}</button>
          <button type="button" onClick={() => setSourcePanel(sourcePanel === 'course' ? null : 'course')}>{t('Choose course', 'اختار كورس')}</button>
          <button type="button" onClick={() => setSourcePanel(sourcePanel === 'event' ? null : 'event')}>{t('Choose event', 'اختار إيفنت')}</button>
        </div>
        {sourcePanel && <div className="creative-home__source"><strong>{sourcePanel === 'post' ? t('Existing posts', 'بوستات سابقة') : sourcePanel === 'course' ? t('Odoo courses and training', 'كورسات وتدريبات Odoo') : t('Odoo events', 'إيفنتات Odoo')}</strong><p className="u-xs u-muted">{sourcePanel === 'post' ? t('Existing workspace posts are references only.', 'البوستات السابقة مراجع فقط.') : odooEvents.length ? t('Dates come from Odoo. Select the correct record.', 'التواريخ من Odoo. اختار السجل الصحيح.') : (odooMessage || t('Loading Odoo events…', 'بنحمّل مواعيد Odoo…'))}</p><div>{(sourcePanel === 'post' ? (pipeline ?? []).slice(0, 8).map((item) => ({ id: item.id, label: item.title })) : odooEvents.filter((event) => sourcePanel === 'course' ? /course|training|دورة|كورس|تدريب/i.test(event.title) : !/course|training|دورة|كورس|تدريب/i.test(event.title)).slice(0, 12).map((event) => ({ id: event.id, label: `${event.title} · ${event.startsAt.slice(0,10)}` }))).map((item) => <button key={item.id} type="button" onClick={() => { setPrompt((current) => `${current}${current ? ' — ' : ''}${item.label}`); setSourcePanel(null); }}>{item.label}</button>)}</div></div>}
        {references.length > 0 && <ul className="creative-home__references">{references.map((file, index) => <li key={`${file.name}-${index}`}>{file.mime.startsWith('image/') && file.dataUrl && <img src={file.dataUrl} alt="" />}<span>{file.name}</span><button type="button" onClick={() => setReferences((current) => current.filter((_, i) => i !== index))} aria-label={t(`Remove ${file.name}`, `احذف ${file.name}`)}>×</button></li>)}</ul>}
        <div className="creative-home__platforms" role="group" aria-label={t('Platforms', 'المنصات')}>{CREATIVE_PLATFORMS.map((platform) => <button key={platform} type="button" aria-pressed={platforms.includes(platform)} onClick={() => togglePlatform(platform)}><span className="creative-home__platform-icon"><ChannelIcon channel={platform} size={15} /></span>{PLATFORM_FORMATS[platform].label}</button>)}</div>
        <div className="creative-home__options"><label>{t('Objective', 'الهدف')}<select value={objective} onChange={(event) => setObjective(event.target.value as Objective | 'auto')}>{OBJECTIVES.map((entry) => <option key={entry.value} value={entry.value}>{t(entry.en, entry.ar)}</option>)}</select></label></div>
        <div className="creative-home__action"><p className="u-xs">{t('Images, PDF and text inform AI. DOCX is retained as a reference. Up to 6 files, 2 MB each.', 'الصور وPDF والنصوص تدخل في الـAI. ملف DOCX يبقى كمرجع. حتى ٦ ملفات، ٢ ميجابايت للملف.')}</p><Button variant="primary" className="cta-create" disabled={creating} busy={creating} onClick={() => void startFullCreative()}>{!creating && <Sparkles size={17} className="cta-create__spark" />}{creating ? t('Starting…', 'بنبدأ…') : t('Design the post', 'صمّم البوست')}</Button></div>
      </>}
      {stage === 'generating' && jobId && <FullCreativeJob jobId={jobId} platforms={platforms} prompt={prompt} onRestart={() => { setStage('compose'); setJobId(''); }} />}
      {message && <p role="alert" className="creative-home__error">{message}</p>}
    </div>
    <RecentContent />
  </div>;
}
