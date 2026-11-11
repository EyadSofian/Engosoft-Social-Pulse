import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, GraduationCap, ImagePlus, PenLine, Send, Sparkles, Wand2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { aiDrawable, BRAND_TEMPLATES, brandSamples, missingInputs, type BrandInput, type BrandSurface, type BrandTemplate } from '../../domain/brand-templates';
import { presetsFor, type PublishingPreset } from '../../domain/output-presets';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { takePostPlan, readPostPlan } from '../content/postPlan';
import { CoursePicker, runOf } from '../creative-studio/CoursePicker';
import { CREATIVE_PLATFORMS, DEFAULT_SIZES, mainFormat, PLATFORM_FORMATS, slotOf, type CreativePlatform } from '../creative-studio/platforms';
import { FullCreativeJob } from '../creative-studio/FullCreativeJob';
import { setActiveCreative } from '../creative-studio/activeCreative';
import { PublishHere, SavedHere } from '../publishing/PublishHere';
import { exportPng, loadBrandFonts } from '../svg-templates/render';
import { browserMeasure, layoutBrandTemplate } from './layout';

const asDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
});

/** Whether a picture has see-through pixels (a cut-out person or a campaign PNG). */
async function hasTransparency(url: string): Promise<boolean> {
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 200 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 200) clear++;
    return clear / (data.length / 4) > 0.05;
  } catch { return false; }
}

/** A grey "photo goes here" picture for the preview of an empty photo input. */
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#C9D3E6"/><path d="M220 360l70-90 60 70 40-45 70 85z" fill="#9AA9C6"/><circle cx="390" cy="220" r="34" fill="#9AA9C6"/></svg>')}`;

/** Campaign files are kept per template in this browser, so the next post of the same campaign starts with them. */
const keepKey = (id: string) => `engosoft-brand-artwork:${id}`;
const readKept = (template: BrandTemplate): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(keepKey(template.id)) || '{}') as Record<string, string>; } catch { return {}; }
};
const keep = (template: BrandTemplate, values: Record<string, string>) => {
  const artwork = Object.fromEntries(template.inputs.filter((i) => i.photo?.kind === 'artwork' && values[i.key]).map((i) => [i.key, values[i.key]]));
  try { localStorage.setItem(keepKey(template.id), JSON.stringify(artwork)); } catch { /* too large for this browser: not kept */ }
};

/**
 * A new template opens with its sample words and campaign files, so the design is visible at once; facts (names,
 * dates, prices, places) and real people's photos start empty and must be filled in.
 */
function startValues(template: BrandTemplate): Record<string, string> {
  const samples = brandSamples(template, 'ar');
  const kept = readKept(template);
  return Object.fromEntries(template.inputs.map((input) => {
    if (input.photo?.kind === 'artwork') return [input.key, kept[input.key] ?? samples[input.key]];
    if (input.fact || input.type === 'photo') return [input.key, ''];
    return [input.key, samples[input.key]];
  }));
}

/** An example request per template, in the words a marketer would type. */
const EXAMPLES: Record<string, string> = {
  'brand-headline': 'إعلان إن التسجيل فتح في دورات إدارة المشاريع المعتمدة، بخلفية زرقا',
  'brand-instructor': 'ويبينار مجاني عن إدارة المرافق مع د. محمد جمال، خبرة 15 سنة في CFM، يوم الثلاثاء 24 نوفمبر الساعة 8 مساءً بتوقيت السعودية أونلاين على Zoom',
  'brand-photo-card': 'بوست عن قيم الشركة: التدريب العملي والشهادات المعتمدة، والشريط برتقالي',
  'brand-cutout': 'حملة تسجيل لدورة Primavera، عنوان حماسي',
  'brand-offer': 'عرض الجمعة البيضاء خصم 50% على دورات إدارة المشروعات، 2500 ريال بدل 5000',
  'brand-campaign-offer': 'عرض الخمسين خمسين على دورة PMP، السعر 700 ريال بدل 1,400',
  'brand-carousel': 'الشريحة 02: خطوات الحصول على شهادة PMP',
};
const examplePrompt = (template: BrandTemplate) => EXAMPLES[template.id] ?? template.description.ar;

interface SizeGroup { key: string; width: number; height: number; presets: PublishingPreset[] }
function sizeGroups(platforms: CreativePlatform[]): SizeGroup[] {
  const groups = new Map<string, SizeGroup>();
  for (const preset of presetsFor(platforms)) {
    const key = `${preset.width}x${preset.height}`;
    const group = groups.get(key) ?? { key, width: preset.width, height: preset.height, presets: [] };
    group.presets.push(preset);
    groups.set(key, group);
  }
  return [...groups.values()];
}
/** The strictest safe area among the presets sharing a size: the layout keeps every one of them clear. */
const safeOf = (group: SizeGroup) => group.presets.reduce((acc, p) => ({ top: Math.max(acc.top, p.safe.top), right: Math.max(acc.right, p.safe.right), bottom: Math.max(acc.bottom, p.safe.bottom), left: Math.max(acc.left, p.safe.left) }), { top: 0, right: 0, bottom: 0, left: 0 });
const RATIO: Record<string, string> = { '1080x1350': '4:5', '1080x1080': '1:1', '1080x1920': '9:16', '1080x1440': '3:4', '1200x630': '1.91:1', '1200x627': '1.91:1', '1280x720': '16:9', '1920x1080': '16:9', '1600x900': '16:9' };

/** The brand templates as cards with their reference design. */
export function BrandTemplateGrid({ onOpen, follow = false }: { onOpen: (template: BrandTemplate) => void; follow?: boolean }) {
  const { t } = useI18n();
  return <div className="brand-grid">{BRAND_TEMPLATES.map((template) => {
    const ref = template.references.blue ?? template.references.light!;
    const asks = template.inputs.filter((i) => i.required).map((i) => t(i.label.en, i.label.ar));
    return <button key={template.id} type="button" className="brand-card glass" onClick={() => onOpen(template)}>
      <img src={ref} alt="" loading="lazy" />
      <b>{t(template.name.en, template.name.ar)}</b>
      <small>{t(template.description.en, template.description.ar)}</small>
      <em>{follow ? t('Design with AI in this look', 'صمّم بالذكاء الاصطناعي على شكله') : <>{t('Asks for', 'بيطلب')}: {asks.join('، ')}</>}</em>
    </button>;
  })}</div>;
}

/**
 * One brand template, filled and published from this screen: the inputs it declares (photos uploaded, or drawn by
 * AI where allowed; words typed or written by AI from the idea or a course), every chosen size shown live and
 * laid out for its own shape, then saved with all sizes and published or sent to the publisher.
 */
export function BrandTemplateComposer({ template, initialPrompt = '', onClose }: { template: BrandTemplate; initialPrompt?: string; onClose: () => void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const publisher = can('content.publish') || can('content.schedule');
  const [surface, setSurface] = useState<BrandSurface>(template.surfaces[0]);
  const [values, setValues] = useState<Record<string, string>>(() => startValues(template));
  const [cutouts, setCutouts] = useState<Record<string, boolean>>({});
  const [prompt, setPrompt] = useState(initialPrompt);
  const [facts, setFacts] = useState('');
  /** The course name the person types (or picks from a course): it goes on the post exactly as written. */
  const [course, setCourse] = useState('');
  const asksCourse = template.kind === 'course';
  /** The facts the AI gets: the course name first, then what came from a picked course (date, time, place, link). */
  const allFacts = [asksCourse && course.trim() ? `الدورة: ${course.trim()}` : '', facts].filter(Boolean).join('\n');
  /** Whether the request has filled the post once: later requests are changes to the current post. */
  const [filled, setFilled] = useState(false);
  const [manual, setManual] = useState(false);
  /** Errors of the design request, shown under it rather than at the bottom of the form. */
  const [designError, setDesignError] = useState('');
  const [lastRequest, setLastRequest] = useState('');
  /** An AI design made on this template's look (the image model redraws it; it is not slot filling). */
  const [aiRun, setAiRun] = useState<{ jobId: string; requestId: string; prompt: string } | null>(null);
  const canDesign = can('design.free');
  const [coursePanel, setCoursePanel] = useState(false);
  const [platforms, setPlatforms] = useState<CreativePlatform[]>(() => {
    const planned = (readPostPlan().channels ?? []).filter((c): c is CreativePlatform => (CREATIVE_PLATFORMS as string[]).includes(c));
    return planned.length ? planned : ['facebook', 'instagram'];
  });
  const groups = sizeGroups(platforms);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const isPicked = (group: SizeGroup) => picked[group.key] ?? group.presets.some((p) => DEFAULT_SIZES[p.channel as CreativePlatform]?.includes(p.id));
  const chosen = groups.filter(isPicked);
  const [fonts, setFonts] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [saved, setSaved] = useState<'' | 'draft' | 'sent'>('');
  const files = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(() => { void loadBrandFonts().then(() => document.fonts.ready).then(() => setFonts(true)); }, []);
  // Campaign files that came with the template may be transparent PNGs: check once.
  useEffect(() => {
    for (const input of template.inputs) if (input.type === 'photo' && values[input.key]) void hasTransparency(values[input.key]).then((clear) => setCutouts((c) => ({ ...c, [input.key]: clear })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const set = (key: string, value: string) => { setValues((current) => ({ ...current, [key]: value })); setSaved(''); setCreated(null); };
  const missing = missingInputs(template, values);
  const svgFor = (group: SizeGroup, preview: boolean) => layoutBrandTemplate({
    template, surface, measure: browserMeasure, cutouts,
    values: preview ? Object.fromEntries(template.inputs.map((i) => [i.key, i.type === 'photo' && !values[i.key] && i.required ? PLACEHOLDER : values[i.key] ?? ''])) : values,
    canvas: { width: group.width, height: group.height, safe: safeOf(group) },
  });
  const previews = useMemo(() => (fonts ? chosen.map((group) => ({ group, svg: svgFor(group, true) })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fonts, values, surface, cutouts, chosen.map((g) => g.key).join(',')]);

  const upload = async (input: BrandInput, file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setMessage(t('Use a PNG, JPEG or WebP image.', 'استخدم صورة PNG أو JPEG أو WebP.')); return; }
    if (file.size > 8_000_000) { setMessage(t('The image is larger than 8 MB.', 'الصورة أكبر من 8 ميجابايت.')); return; }
    setMessage('');
    const url = await asDataUrl(file);
    setCutouts((c) => ({ ...c, [input.key]: false }));
    set(input.key, url);
    void hasTransparency(url).then((clear) => setCutouts((c) => ({ ...c, [input.key]: clear })));
  };
  /** Preset ids of the ticked sizes, for the AI design and its other sizes. */
  const chosenIds = chosen.flatMap((group) => group.presets.filter((p) => platforms.includes(p.channel as CreativePlatform)).map((p) => p.id));
  /**
   * The creative path: the request goes to the AI designer with this template as the design to follow. It plans the
   * copy and the composition and draws a new design in the same look, instead of putting words into fixed places.
   */
  const designWithAi = async () => {
    const request = (prompt.trim() || lastRequest).trim();
    if (request.length < 10) { setDesignError(t('Describe the post in a little more detail.', 'اكتب طلب التصميم بتفاصيل أكتر.')); return; }
    if (!platforms.length) { setDesignError(t('Choose at least one platform.', 'اختار منصة واحدة على الأقل.')); return; }
    setBusy('ai'); setDesignError('');
    try {
      const format = mainFormat(platforms, chosenIds);
      const body = await api<{ jobId: string; requestId?: string }>('/api/ai/full-creative', { body: { prompt: request, format, directions: 1, followDesign: { templateId: template.id, surface }, ...(facts.trim() ? { facts } : {}), ...(asksCourse && course.trim() ? { course: course.trim() } : {}) } });
      setActiveCreative({ jobId: body.jobId, requestId: body.requestId ?? '', prompt: request, platforms, sizes: chosenIds, format, startedAt: new Date().toISOString(), status: 'running' });
      setAiRun({ jobId: body.jobId, requestId: body.requestId ?? '', prompt: request });
    } catch (error) { setDesignError(errorMessage(error, t('Could not start the design.', 'تعذّر بدء التصميم.'))); }
    setBusy('');
  };
  /** Photos AI will draw with this request: empty, required, and allowed (never a real person or a campaign file). */
  const toDraw = template.inputs.filter((input) => aiDrawable(input) && input.required && !values[input.key]);
  const languageOf = (text: string) => (/[a-z]/i.test(text) && !/[؀-ۿ]/.test(text) ? 'en' : 'ar');
  /** One request makes the whole post: every word and fact it gives, the background, and the photo AI may draw. */
  const design = async (request = prompt) => {
    if (request.trim().length < 3) { setDesignError(t('Describe the post first.', 'اكتب طلب التصميم الأول.')); return; }
    setBusy('design'); setMessage(''); setDesignError('');
    try {
      const current = filled ? Object.fromEntries(template.inputs.filter((i) => i.type !== 'photo').map((i) => [i.key, values[i.key] ?? ''])) : undefined;
      const out = await api<{ values: Record<string, string>; surface: BrandSurface }>('/api/brand-templates/fill', { body: { templateId: template.id, prompt: request, language: languageOf(request), facts: allFacts, surface, current } });
      // A first fill replaces the sample words; facts it could not find stay as they were (empty, or from the course).
      setValues((now) => ({ ...now, ...Object.fromEntries(Object.entries(out.values).filter(([key, v]) => v || !template.inputs.find((i) => i.key === key)?.fact)) }));
      if (out.surface && template.surfaces.includes(out.surface)) setSurface(out.surface);
      setFilled(true); setSaved(''); setCreated(null);
      for (const input of toDraw) await drawPhoto(input, request, true);
      setLastRequest(request); setPrompt('');
    } catch (error) { setDesignError(errorMessage(error, t('Could not make the design.', 'تعذّر عمل التصميم.'))); }
    setBusy('');
  };
  useEffect(() => { if (initialPrompt.trim().length >= 3) void design(initialPrompt); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  const drawPhoto = async (input: BrandInput, request = prompt, inside = false) => {
    const idea = request.trim() || Object.values(values).filter((v) => v && !v.startsWith('data:') && !v.startsWith('/')).join(' — ');
    if (idea.length < 3) { setDesignError(t('Describe the post first.', 'اكتب طلب التصميم الأول.')); return; }
    const alone = !inside;
    if (alone) setBusy(`photo:${input.key}`);
    setMessage('');
    try {
      const { url, cutout } = await api<{ url: string; cutout: boolean }>('/api/brand-templates/photo', { body: { templateId: template.id, inputKey: input.key, prompt: idea } });
      setCutouts((c) => ({ ...c, [input.key]: cutout }));
      set(input.key, url);
    } catch (error) { setDesignError(errorMessage(error, t('Could not draw the photo.', 'تعذّر رسم الصورة.'))); }
    if (alone) setBusy('');
  };
  const pickCourse = (pick: Parameters<Parameters<typeof CoursePicker>[0]['onPick']>[0]) => {
    const run = runOf(pick);
    const name = pick.type === 'course' ? pick.course.name : pick.event.title;
    const start = run ? new Date(run.startsAt) : null;
    const date = start ? start.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }) : '';
    const time = start ? start.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' }) : '';
    const place = run?.location ?? '';
    setCourse(name);
    setFacts([date && `التاريخ: ${date}`, time && `الوقت: ${time}`, place && `المكان: ${place}`, run?.registrationUrl && `رابط التسجيل: ${run.registrationUrl}`].filter(Boolean).join('\n'));
    setPrompt((current) => current || name);
    setFilled(false);
    setValues((current) => ({ ...current, ...(template.inputs.some((i) => i.key === 'date') && date ? { date } : {}), ...(template.inputs.some((i) => i.key === 'time') && time ? { time } : {}), ...(template.inputs.some((i) => i.key === 'place') && place ? { place } : {}) }));
    setCoursePanel(false);
  };

  const save = async (): Promise<string | null> => {
    if (missing.length) { setMessage(t(`Fill in: ${missing.map((i) => i.label.en).join(', ')}`, `كمّل: ${missing.map((i) => i.label.ar).join('، ')}`)); return null; }
    if (!chosen.length) { setMessage(t('Choose at least one size.', 'اختار مقاس واحد على الأقل.')); return null; }
    if (created) return created;
    // Every size is rasterised from its own layout; the 4:5 post (or the first size) is the main image.
    const made: { group: SizeGroup; url: string }[] = [];
    for (const group of chosen) {
      const png = await exportPng({ svg: svgFor(group, false), width: group.width, height: group.height }, {});
      made.push({ group, url: (await api<{ url: string }>('/api/uploads', { body: { dataUrl: png } })).url });
    }
    const main = made.find((m) => m.group.key === '1080x1350') ?? made[0];
    const sizes = Object.fromEntries(made.flatMap(({ group, url }) => group.presets.filter((p) => platforms.includes(p.channel as CreativePlatform)).map((p) => [p.id, url])));
    const slots = Object.fromEntries(made.flatMap(({ group, url }) => { const slot = slotOf(group.width, group.height); return slot ? [[slot, url]] : []; }));
    const title = (values.headline || values.title || values.tape || values.line1 || template.name.ar).slice(0, 200);
    keep(template, values);
    const item = await api<{ id: string }>('/api/content', { body: { ...takePostPlan(), title, channels: platforms, captions: {}, creative: { requestId: 'brand-template', directionId: template.id.slice(0, 40), imageUrl: main.url, ...slots, sizes, directionName: template.name.ar } } });
    setCreated(item.id);
    return item.id;
  };
  const run = async (action: 'publish' | 'draft' | 'send') => {
    setBusy(action); setMessage(''); setSaved('');
    try {
      const id = await save();
      if (id && action === 'publish') setPublishing(id);
      if (id && action === 'send') { await api(`/api/content/${id}/transition`, { body: { to: 'ready_for_review' } }); setSaved('sent'); }
      if (id && action === 'draft') setSaved('draft');
    } catch (error) { setMessage(errorMessage(error, t('Could not save the post.', 'تعذّر حفظ المنشور.'))); }
    setBusy('');
  };

  const field = (input: BrandInput) => {
    const label = <span className="ui-field__label">{t(input.label.en, input.label.ar)}{input.required && <b className="brand-form__req" aria-hidden> *</b>}</span>;
    const hint = input.hint && <span className="ui-field__hint">{t(input.hint.en, input.hint.ar)}</span>;
    if (input.type === 'photo') {
      const value = values[input.key];
      const drawing = busy === `photo:${input.key}`;
      return <div key={input.key} className="ui-field brand-form__photo">
        {label}
        <div className="brand-photo">
          <span className="brand-photo__thumb" data-clear={cutouts[input.key] ? '' : undefined}>{value ? <img src={value} alt="" /> : <ImagePlus size={20} />}</span>
          <span className="brand-photo__actions">
            <input ref={(el) => { files.current[input.key] = el; }} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void upload(input, event.target.files?.[0]); event.target.value = ''; }} />
            <Button size="sm" variant="secondary" icon={<ImagePlus size={14} />} onClick={() => files.current[input.key]?.click()}>{value ? t('Change', 'غيّر الصورة') : t('Upload', 'ارفع صورة')}</Button>
            {aiDrawable(input) && <Button size="sm" variant="ghost" icon={<Wand2 size={14} />} busy={drawing} disabled={Boolean(busy)} onClick={() => void drawPhoto(input)}>{t('Draw with AI (1 image)', 'ارسمها بالذكاء الاصطناعي (صورة واحدة)')}</Button>}
            {value && !input.required && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => set(input.key, '')}>{t('Remove', 'شيلها')}</Button>}
          </span>
        </div>
        {hint}
      </div>;
    }
    if (input.key === 'labelColor') return <label key={input.key} className="ui-field">{label}<select className="mc-select" value={values[input.key] || 'blue'} onChange={(e) => set(input.key, e.target.value)}><option value="blue">{t('Blue', 'أزرق')}</option><option value="orange">{t('Orange', 'برتقالي')}</option></select></label>;
    const common = { className: 'ui-input', dir: 'auto' as const, value: values[input.key] ?? '', maxLength: input.maxChars, placeholder: input.sample.ar, onChange: (e: { target: { value: string } }) => set(input.key, e.target.value) };
    return <label key={input.key} className="ui-field">{label}{input.type === 'multiline' ? <textarea rows={3} {...common} /> : <input {...common} />}{hint}</label>;
  };

  const locked = saved === 'sent';
  const photoInputs = template.inputs.filter((i) => i.type === 'photo');
  const textInputs = template.inputs.filter((i) => i.type !== 'photo');
  return <section className="brand-composer">
    <div className="brand-composer__form glass u-stack">
      <button type="button" className="create-back" onClick={onClose}><ArrowRight size={15} className="u-flip" /> {t('Other templates', 'قوالب تانية')}</button>
      <div className="brand-composer__title">
        <h2>{t(template.name.en, template.name.ar)}</h2>
        {template.surfaces.length > 1 && <div className="size-plan__switch" role="radiogroup" aria-label={t('Background', 'الخلفية')}>
          {template.surfaces.map((s) => <button key={s} type="button" role="radio" aria-checked={surface === s} onClick={() => setSurface(s)}>{s === 'blue' ? t('Blue', 'أزرق') : t('Light', 'فاتح')}</button>)}
        </div>}
      </div>
      <div className="brand-ai">
        {asksCourse && <label className="ui-field"><span className="ui-field__label"><GraduationCap size={14} /> {t('Course name', 'اسم الكورس')}</span>
          <input className="ui-input" dir="auto" maxLength={160} value={course} onChange={(e) => { setCourse(e.target.value); if (designError) setDesignError(''); }}
            placeholder={t('e.g. Interior Design Diploma', 'مثال: دبلومة التصميم الداخلي')} />
          <span className="ui-field__hint">{t('It goes on the post exactly as you write it.', 'هيظهر على البوست زي ما كتبته بالظبط.')}</span></label>}
        <label className="ui-field"><span className="ui-field__label"><Sparkles size={14} /> {filled ? t('Ask for a change', 'اطلب تعديل') : t('Describe the whole post', 'اكتب المنشور كله في طلب واحد')}</span>
          <textarea className="ui-input" rows={filled ? 2 : 5} data-first={filled ? undefined : ""} dir="auto" value={prompt} onChange={(e) => { setPrompt(e.target.value); if (designError) setDesignError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void design(); } }}
            placeholder={filled
              ? t('e.g. blue background, shorter headline, the price is 900', 'مثال: خلّي الخلفية زرقا، العنوان أقصر، السعر 900')
              : t(template.brief, 'مثال: ' + examplePrompt(template))} /></label>
        <div className="brand-ai__row">
          {canDesign && <Button size="sm" variant="primary" icon={<Sparkles size={14} />} busy={busy === 'ai'} disabled={Boolean(busy) || locked} onClick={() => void designWithAi()}>{t('Design it with AI in this look (1 image)', 'صمّمه بالذكاء الاصطناعي على الشكل ده (صورة واحدة)')}</Button>}
          <Button size="sm" variant={canDesign ? 'secondary' : 'primary'} icon={<Wand2 size={14} />} busy={busy === 'design'} disabled={Boolean(busy) || locked} onClick={() => void design()}>
            {canDesign ? t('Quick fill (words only)', 'ملء سريع للقالب (الكلام بس)') : filled ? t('Apply the change', 'نفّذ التعديل') : t('Make the design', 'صمّم')}{toDraw.length ? t(` + ${toDraw.length} AI image`, ` + ${toDraw.length === 1 ? 'صورة واحدة' : `${toDraw.length} صور`} بالذكاء الاصطناعي`) : ''}
          </Button>
          <Button size="sm" variant="ghost" icon={<GraduationCap size={14} />} onClick={() => setCoursePanel(!coursePanel)}>{asksCourse ? t('Find the course (optional)', 'دوّر على الكورس (اختياري)') : t('From a course (optional)', 'من دورة (اختياري)')}</Button>
        </div>
        {designError && <p role="alert" className="creative-home__error">{designError}</p>}
        {lastRequest && !designError && <p className="u-xs u-muted brand-ai__facts" dir="auto">{t('Last request', 'آخر طلب')}: {lastRequest}</p>}
        {coursePanel && <div className="creative-home__source"><CoursePicker autoFocus onPick={pickCourse} /></div>}
        {facts && <p className="u-xs u-muted brand-ai__facts" dir="auto">{facts.split('\n').join(' · ')}</p>}
        {canDesign && <p className="u-xs u-muted">{t('AI design: it plans the words and the composition and draws a new post in this look, with every size made for its shape. It takes a few minutes. Quick fill only puts the words into the template\'s fixed places.', 'التصميم بالذكاء الاصطناعي بيفكّر في الكلام والتكوين ويرسم بوست جديد على نفس الشكل، وكل مقاس بيتعمل لشكله، وبياخد كام دقيقة. الملء السريع بيحط الكلام في أماكن القالب الثابتة بس.')}</p>}
        <p className="u-xs u-muted">{t('Names, dates and prices are taken only from what you write or the course, never made up.', 'الأسماء والمواعيد والأسعار بتتاخد من كلامك أو من الدورة بس، عمرها ما تتألف.')}</p>
      </div>
      {photoInputs.length > 0 && <div className="brand-form u-stack">{photoInputs.map(field)}</div>}
      {filled && missing.length > 0 && <p className="u-sm brand-ai__missing" dir="auto">{t(`Still missing: ${missing.map((i) => i.label.en).join(', ')}. Add it to the request or type it below.`, `لسه ناقص: ${missing.map((i) => i.label.ar).join('، ')}. قولها في الطلب أو اكتبها تحت.`)}</p>}
      <details className="brand-manual" open={manual} onToggle={(e) => setManual((e.target as HTMLDetailsElement).open)}>
        <summary><PenLine size={14} /> {t('Edit the words by hand', 'عدّل الكلام بإيدك')}</summary>
        <div className="brand-form u-stack">{textInputs.map(field)}</div>
      </details>
      <div className="ui-field"><span className="ui-field__label">{t('Platforms', 'المنصات')}</span>
        <div className="creative-home__platforms" role="group" aria-label={t('Platforms', 'المنصات')}>{CREATIVE_PLATFORMS.map((platform) => <button key={platform} type="button" disabled={locked} aria-pressed={platforms.includes(platform)} onClick={() => { setPlatforms((current) => current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform]); setCreated(null); }}><span className="creative-home__platform-icon"><ChannelIcon channel={platform} size={15} /></span>{PLATFORM_FORMATS[platform].label}</button>)}</div>
      </div>
      <div className="ui-field"><span className="ui-field__label">{t('Sizes', 'المقاسات')}</span>
        <div className="brand-sizes">{groups.map((group) => {
          const on = isPicked(group);
          return <button key={group.key} type="button" className="brand-size" aria-pressed={on} disabled={locked} title={group.presets.map((p) => `${channelName[p.channel]}: ${t(p.name.en, p.name.ar)}`).join('\n')} onClick={() => { setPicked((c) => ({ ...c, [group.key]: !on })); setCreated(null); }}>
            {on && <Check size={12} strokeWidth={3} />}<b dir="ltr">{RATIO[group.key] ?? `${(group.width / group.height).toFixed(1)}:1`}</b><small dir="ltr" className="u-tnum">{group.width}×{group.height}</small>
          </button>;
        })}</div>
        <span className="ui-field__hint">{t('Each size is laid out for its own shape. No AI images: free.', 'كل مقاس بيتصمم لشكله. من غير صور ذكاء اصطناعي: ببلاش.')}</span>
      </div>
      {message && <p role="alert" className="creative-home__error">{message}</p>}
      <div className="create-upload__actions">
        {publisher
          ? <Button variant="primary" icon={<Send size={15} />} busy={busy === 'publish'} disabled={Boolean(busy)} onClick={() => void run('publish')}>{t('Save and publish', 'احفظ وانشر')}</Button>
          : <Button variant="primary" icon={<Send size={15} />} busy={busy === 'send'} disabled={Boolean(busy) || locked} onClick={() => void run('send')}>{t('Send to the publisher', 'ابعته للمسؤول عن النشر')}</Button>}
        <Button variant="secondary" icon={<FileText size={15} />} busy={busy === 'draft'} disabled={Boolean(busy) || locked} onClick={() => void run('draft')}>{t('Save as draft', 'احفظه مسودة')}</Button>
      </div>
      {saved && <SavedHere contentId={created} sent={saved === 'sent'} />}
      <PublishHere contentId={publishing} onClose={() => setPublishing(null)} />
    </div>
    {aiRun ? <div className="brand-composer__ai">
      <FullCreativeJob key={aiRun.jobId} jobId={aiRun.jobId} requestId={aiRun.requestId} platforms={platforms} sizes={chosenIds} format={mainFormat(platforms, chosenIds)} prompt={aiRun.prompt} onRestart={() => setAiRun(null)} />
    </div> : <div className="brand-composer__previews" aria-label={t('Preview of every size', 'معاينة كل المقاسات')}>
      {!fonts && <div className="board-loading"><span className="ui-btn__spinner" /></div>}
      {previews.map(({ group, svg }) => <figure key={group.key} className="brand-preview" data-wide={group.width > group.height ? '' : undefined}>
        <div className="brand-preview__frame" style={{ aspectRatio: `${group.width} / ${group.height}` }} dangerouslySetInnerHTML={{ __html: svg }} />
        <figcaption><span className="creative-job__size-icons">{[...new Set(group.presets.map((p) => p.channel))].filter((c) => platforms.includes(c as CreativePlatform)).map((c) => <ChannelIcon key={c} channel={c} size={12} />)}</span> <span dir="ltr" className="u-tnum">{group.width}×{group.height}</span></figcaption>
      </figure>)}
    </div>}
  </section>;
}
