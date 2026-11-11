import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, GraduationCap, ImagePlus, Send, Sparkles, Wand2, X } from 'lucide-react';
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
import { CREATIVE_PLATFORMS, DEFAULT_SIZES, PLATFORM_FORMATS, slotOf, type CreativePlatform } from '../creative-studio/platforms';
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
export function BrandTemplateGrid({ onOpen }: { onOpen: (template: BrandTemplate) => void }) {
  const { t } = useI18n();
  return <div className="brand-grid">{BRAND_TEMPLATES.map((template) => {
    const ref = template.references.blue ?? template.references.light!;
    const asks = template.inputs.filter((i) => i.required).map((i) => t(i.label.en, i.label.ar));
    return <button key={template.id} type="button" className="brand-card glass" onClick={() => onOpen(template)}>
      <img src={ref} alt="" loading="lazy" />
      <b>{t(template.name.en, template.name.ar)}</b>
      <small>{t(template.description.en, template.description.ar)}</small>
      <em>{t('Asks for', 'بيطلب')}: {asks.join('، ')}</em>
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
  const writeCopy = async () => {
    if (prompt.trim().length < 3) { setMessage(t('Write the idea of the post first.', 'اكتب فكرة المنشور الأول.')); return; }
    setBusy('copy'); setMessage('');
    try {
      const { values: written } = await api<{ values: Record<string, string> }>('/api/brand-templates/copy', { body: { templateId: template.id, prompt, language: /[a-z]/i.test(prompt) && !/[؀-ۿ]/.test(prompt) ? 'en' : 'ar', facts } });
      setValues((current) => ({ ...current, ...Object.fromEntries(Object.entries(written).filter(([, v]) => v)) }));
      setSaved(''); setCreated(null);
    } catch (error) { setMessage(errorMessage(error, t('Could not write the texts.', 'تعذّر كتابة النصوص.'))); }
    setBusy('');
  };
  const drawPhoto = async (input: BrandInput) => {
    const idea = prompt.trim() || Object.values(values).filter((v) => v && !v.startsWith('data:') && !v.startsWith('/')).join(' — ');
    if (idea.length < 3) { setMessage(t('Write the idea of the post first.', 'اكتب فكرة المنشور الأول.')); return; }
    setBusy(`photo:${input.key}`); setMessage('');
    try {
      const { url, cutout } = await api<{ url: string; cutout: boolean }>('/api/brand-templates/photo', { body: { templateId: template.id, inputKey: input.key, prompt: idea } });
      setCutouts((c) => ({ ...c, [input.key]: cutout }));
      set(input.key, url);
    } catch (error) { setMessage(errorMessage(error, t('Could not draw the photo.', 'تعذّر رسم الصورة.'))); }
    setBusy('');
  };
  const pickCourse = (pick: Parameters<Parameters<typeof CoursePicker>[0]['onPick']>[0]) => {
    const run = runOf(pick);
    const name = pick.type === 'course' ? pick.course.name : pick.event.title;
    const start = run ? new Date(run.startsAt) : null;
    const date = start ? start.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }) : '';
    const time = start ? start.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' }) : '';
    const place = run?.location ?? '';
    setFacts([`الدورة: ${name}`, date && `التاريخ: ${date}`, time && `الوقت: ${time}`, place && `المكان: ${place}`, run?.registrationUrl && `رابط التسجيل: ${run.registrationUrl}`].filter(Boolean).join('\n'));
    setPrompt((current) => current || name);
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
        <label className="ui-field"><span className="ui-field__label"><Sparkles size={14} /> {t('The idea (AI writes the texts)', 'فكرة المنشور (الذكاء الاصطناعي يكتب النصوص)')}</span>
          <textarea className="ui-input" rows={2} dir="auto" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('e.g. PMP course offer, 50% off for Black Friday', 'مثال: عرض دورة PMP خصم 50% في الجمعة البيضاء')} /></label>
        <div className="brand-ai__row">
          <Button size="sm" variant="primary" icon={<Wand2 size={14} />} busy={busy === 'copy'} disabled={Boolean(busy) || locked} onClick={() => void writeCopy()}>{t('Write the texts', 'اكتب النصوص')}</Button>
          <Button size="sm" variant="ghost" icon={<GraduationCap size={14} />} onClick={() => setCoursePanel(!coursePanel)}>{t('From a course (optional)', 'من دورة (اختياري)')}</Button>
        </div>
        {coursePanel && <div className="creative-home__source"><CoursePicker autoFocus onPick={pickCourse} /></div>}
        {facts && <p className="u-xs u-muted brand-ai__facts" dir="auto">{facts.split('\n').join(' · ')}</p>}
        <p className="u-xs u-muted">{t('AI writes only the wording. Names, dates, prices and places come from you or the course.', 'الذكاء الاصطناعي بيكتب الكلام بس. الأسماء والمواعيد والأسعار والأماكن منك أو من الدورة.')}</p>
      </div>
      <div className="brand-form u-stack">{template.inputs.map(field)}</div>
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
    <div className="brand-composer__previews" aria-label={t('Preview of every size', 'معاينة كل المقاسات')}>
      {!fonts && <div className="board-loading"><span className="ui-btn__spinner" /></div>}
      {previews.map(({ group, svg }) => <figure key={group.key} className="brand-preview" data-wide={group.width > group.height ? '' : undefined}>
        <div className="brand-preview__frame" style={{ aspectRatio: `${group.width} / ${group.height}` }} dangerouslySetInnerHTML={{ __html: svg }} />
        <figcaption><span className="creative-job__size-icons">{[...new Set(group.presets.map((p) => p.channel))].filter((c) => platforms.includes(c as CreativePlatform)).map((c) => <ChannelIcon key={c} channel={c} size={12} />)}</span> <span dir="ltr" className="u-tnum">{group.width}×{group.height}</span></figcaption>
      </figure>)}
    </div>
  </section>;
}
