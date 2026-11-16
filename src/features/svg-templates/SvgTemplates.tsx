import { DialectPicker, usePreferredDialect } from '../content/ContentCopilot';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Code2, FileText, GraduationCap, ImagePlus, Loader2, PenLine, Save, Search, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { readPostPlan, takePostPlan } from '../content/postPlan';
import { api, errorMessage } from '../../lib/api';
import { CoursePicker, runOf } from '../creative-studio/CoursePicker';
import { CREATIVE_PLATFORMS, PLATFORM_FORMATS, type CreativePlatform } from '../creative-studio/platforms';
import { courseValues, exportPng, fillSvg, FORMAT_LABEL, KIND_LABEL, loadBrandFonts, odooValues, sampleValues, TEMPLATE_KINDS, type CourseProfile, type SvgTemplate, type TemplateFormat, type TemplateKind } from './render';
import type { CoursePick } from '../creative-studio/CoursePicker';
import { courseCopy, courseTemplateCopy } from '../../domain/course-copy';
import { publishingPreset } from '../../domain/output-presets';
import { PublishingPresetPicker } from '../publishing/PublishingPresetPicker';
import { useAuth } from '../auth/AuthProvider';
import { PublishHere } from '../publishing/PublishHere';
import { courseFacts } from '../creative-studio/creativeRequest';
import { LogoChoice } from '../creative-studio/LogoChoice';
import { referenceLogoOf } from '../../domain/reference-logos';
import type { BrandKitId } from '../../domain/brand-kits';

/** The platforms of the plan row a post is being made for, when there is one. */
const plannedChannels = (): CreativePlatform[] | undefined => {
  const planned = (readPostPlan().channels ?? []).filter((c): c is CreativePlatform => (CREATIVE_PLATFORMS as string[]).includes(c));
  return planned.length ? planned : undefined;
};

export function useSvgTemplates() {
  const [items, setItems] = useState<SvgTemplate[] | null>(null);
  const [error, setError] = useState('');
  const reload = () => api<SvgTemplate[]>('/api/svg-templates').then((data) => { setItems(data); setError(''); }).catch((e) => setError(errorMessage(e, '')));
  useEffect(() => {
    void reload();
  }, []);
  return { items, error, reload, setItems };
}

/** Goals, audience and outcomes marketing recorded for each course; they fill templates' `course.*` fields. */
export function useCourseProfiles() {
  const [profiles, setProfiles] = useState<CourseProfile[]>([]);
  const [error, setError] = useState('');
  const reload = () => api<CourseProfile[]>('/api/course-profiles').then(data => { setProfiles(data); setError(''); }).catch(e => { setError(errorMessage(e, 'تعذّر تحميل ملفات الدورات.')); throw e; });
  useEffect(() => { void reload().catch(() => {}); }, []);
  return { profiles, reload, error };
}

const norm = (value: string) => value.toLowerCase().replace(/[\s\-_:()]+/g, ' ').trim();
/** A catalog course matches by id; an Odoo session matches the profile whose course name appears in its title. */
export function profileFor(profiles: CourseProfile[], pick: CoursePick): CourseProfile | undefined {
  if (pick.type === 'course') return profiles.find((p) => p.courseId === pick.course.id) ?? profiles.find((p) => norm(p.courseName) === norm(pick.course.name));
  const title = norm(pick.event.title);
  return profiles.filter((p) => title.includes(norm(p.courseName))).sort((a, b) => b.courseName.length - a.courseName.length)[0];
}

/** Label chip for a template kind. */
export function KindChip({ kind }: { kind: TemplateKind }) {
  const { t } = useI18n();
  return <span className="tpl-kind" data-kind={kind}>{t(KIND_LABEL[kind].en, KIND_LABEL[kind].ar)}</span>;
}

/** The post types of the template library. The Operations team starts here: type first, then only matching templates. */
export function KindPicker({ items, value, onChange }: { items: SvgTemplate[]; value: TemplateKind | 'all'; onChange: (kind: TemplateKind | 'all') => void }) {
  const { t } = useI18n();
  const counts = (kind: TemplateKind) => items.filter((item) => item.kind === kind).length;
  const kinds = TEMPLATE_KINDS.filter((kind) => counts(kind) > 0);
  return (
    <div className="tpl-kinds" role="tablist" aria-label={t('Post type', 'نوع المنشور')}>
      <button type="button" role="tab" aria-selected={value === 'all'} onClick={() => onChange('all')}>{t('All', 'الكل')} <i>{items.length}</i></button>
      {kinds.map((kind) => <button key={kind} type="button" role="tab" aria-selected={value === kind} onClick={() => onChange(kind)} title={t(KIND_LABEL[kind].hint.en, KIND_LABEL[kind].hint.ar)}>{t(KIND_LABEL[kind].en, KIND_LABEL[kind].ar)} <i>{counts(kind)}</i></button>)}
    </div>
  );
}

/** The filled template as live SVG, scaled to its container. */
export function TemplatePreview({ template, values, className }: { template: Pick<SvgTemplate, 'svg' | 'width' | 'height' | 'sourceImage'>; values?: Record<string, string>; className?: string }) {
  const prefix = useId().replace(/[^a-z0-9]/gi, '');
  const [fontsLoaded, setFontsLoaded] = useState(false);
  useEffect(() => {
    void loadBrandFonts().then(() => setFontsLoaded(true));
  }, []);
  const markup = useMemo(() => {
    const filled = fillSvg(template.svg, values ?? {});
    // Each inline preview needs its own paint servers and clip paths.
    return filled.replace(/id="([^"]+)"/g, `id="${prefix}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`).replace(/href="#([^"]+)"/g, `href="#${prefix}-$1"`);
  }, [template.svg, values, fontsLoaded, prefix]);
  if (template.sourceImage) return <div className={`tpl-preview ${className ?? ''}`} style={{ aspectRatio: `${template.width} / ${template.height}` }}><img src={template.sourceImage} alt="" loading="lazy" /></div>;
  return <div className={`tpl-preview ${className ?? ''}`} style={{ aspectRatio: `${template.width} / ${template.height}` }} dangerouslySetInnerHTML={{ __html: markup }} />;
}

const asDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** Describe a template, optionally attach a reference design; the AI draws an editable SVG once. */
export function TemplateGenerator({ onCreated }: { onCreated: (template: SvgTemplate) => void }) {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState<TemplateFormat>('feed');
  const [kind, setKind] = useState<TemplateKind>('course');
  const [reference, setReference] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const takeReference = async (f: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setError(t('Use a PNG, JPG or WebP image.', 'استخدم صورة PNG أو JPG أو WebP.'));
    if (f.size > 6_000_000) return setError(t('The image is larger than 6 MB.', 'الصورة أكبر من ٦ ميجابايت.'));
    setError('');
    setReference(await asDataUrl(f));
  };
  const starters: { label: string; text: string; kind: TemplateKind }[] = [
    { label: t('Course announcement', 'إعلان دورة'), kind: 'course', text: t('Course announcement with a big title, date and time badge, instructor name and a register button. Dark blue, modern.', 'إعلان دورة بعنوان كبير، وشارة للتاريخ والوقت، واسم المحاضر، وزر «سجّل الآن». أزرق داكن وتصميم عصري.') },
    { label: t('Graduation', 'تخريج وإنجاز'), kind: 'graduation', text: t('Graduation congratulation with the graduate photo, name, course title and a certificate badge. Bright and celebratory.', 'تهنئة تخرج بصورة الخريج واسمه واسم الدورة وشارة الشهادة. ألوان مبهجة واحتفالية.') },
    { label: t('Webinar', 'ندوة أونلاين'), kind: 'event', text: t('Free webinar invitation with the topic, speaker, date, time and a join button. Clean and professional.', 'دعوة لندوة مجانية بموضوعها والمتحدث والتاريخ والوقت وزر الانضمام. تصميم نظيف واحترافي.') },
  ];
  const generate = async () => {
    if (prompt.trim().length < 5) return setError(t('Describe the template in a few words.', 'صِف القالب في كلمتين على الأقل.'));
    setBusy(true);
    setError('');
    try {
      onCreated(await api<SvgTemplate>('/api/svg-templates/generate', { body: { prompt, format, kind, ...(reference ? { reference } : {}) } }));
      setPrompt('');
      setReference('');
    } catch (e) {
      setError(errorMessage(e, ''));
    }
    setBusy(false);
  };
  return (
    <section className="tpl-generator glass">
      <div className="tpl-generator__head">
        <span className="tpl-generator__icon"><Wand2 size={20} /></span>
        <div>
          <h2>{t('Design a template with AI', 'صمّم قالبًا بالذكاء الاصطناعي')}</h2>
          <p>{t('The AI designs the template once; then make posts from it: edit the text, change the event date, export.', 'يصمّم الذكاء الاصطناعي القالب مرة واحدة، ثم تُنشئ منه المنشورات: عدّل النص، وغيّر موعد الفعالية، ثم صدّر.')}</p>
        </div>
      </div>
      <AnimatePresence mode="wait">
        {busy ? (
          <motion.div key="busy" className="tpl-generator__busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="tpl-forming" style={{ aspectRatio: FORMAT_LABEL[format].size.replace('×', ' / ') }}>
              <span className="tpl-forming__grid" />
              <span className="tpl-forming__bar" />
              <span className="tpl-forming__bar tpl-forming__bar--2" />
              <span className="tpl-forming__bar tpl-forming__bar--3" />
              <span className="tpl-forming__orb" />
            </div>
            <p>{t('Drawing the layout, typography and editable fields…', 'جارٍ رسم التصميم والخطوط والحقول القابلة للتعديل…')}</p>
          </motion.div>
        ) : (
          <motion.div key="form" className="tpl-generator__form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="tpl-field">
              <label className="tpl-field__label" htmlFor="tpl-prompt">{t('Describe the template', 'صِف القالب')}<small className="u-tnum" data-ready={prompt.trim().length >= 5 || undefined}>{prompt.trim().length}</small></label>
              <textarea id="tpl-prompt" dir="auto" rows={3} value={prompt} onChange={(e) => { setPrompt(e.target.value); if (error) setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void generate(); } }} placeholder={t('Example: Course announcement with a big title, date and time badge, instructor name and a register button. Dark blue, modern.', 'مثال: إعلان دورة بعنوان كبير، وشارة للتاريخ والوقت، واسم المحاضر، وزر «سجّل الآن». أزرق داكن وتصميم عصري.')} />
              <div className="tpl-starters" aria-label={t('Start from an idea', 'ابدأ من فكرة')}>
                {starters.map((starter) => <button key={starter.label} type="button" onClick={() => { setPrompt(starter.text); setKind(starter.kind); }}><Sparkles size={12} /> {starter.label}</button>)}
              </div>
            </div>
            <div className="tpl-generator__options">
              <div className="tpl-field">
                <span className="tpl-field__label" id="tpl-kind-label">{t('Post type', 'نوع المنشور')}</span>
                <div className="tpl-kinds" role="radiogroup" aria-labelledby="tpl-kind-label">
                  {TEMPLATE_KINDS.map((value) => <button key={value} type="button" role="radio" aria-checked={kind === value} title={t(KIND_LABEL[value].hint.en, KIND_LABEL[value].hint.ar)} onClick={() => setKind(value)}>{t(KIND_LABEL[value].en, KIND_LABEL[value].ar)}</button>)}
                </div>
                <small className="tpl-field__hint">{t(KIND_LABEL[kind].hint.en, KIND_LABEL[kind].hint.ar)}</small>
              </div>
              <div className="tpl-field">
                <span className="tpl-field__label" id="tpl-size-label">{t('Size', 'المقاس')}</span>
                <div className="tpl-formats" role="radiogroup" aria-labelledby="tpl-size-label">
                  {(Object.keys(FORMAT_LABEL) as TemplateFormat[]).map((value) => (
                    <button key={value} type="button" role="radio" aria-checked={format === value} onClick={() => setFormat(value)}>
                      <span className="tpl-formats__shape" data-format={value} />
                      <b>{t(FORMAT_LABEL[value].en, FORMAT_LABEL[value].ar)}</b>
                      <small dir="ltr">{FORMAT_LABEL[value].size}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="tpl-field tpl-field--reference">
                <span className="tpl-field__label">{t('Reference design', 'تصميم مرجعي')}<em>{t('optional', 'اختياري')}</em></span>
                <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeReference(f); e.target.value = ''; }} />
                {reference ? (
                  <div className="tpl-dropzone tpl-dropzone--filled">
                    <img src={reference} alt="" />
                    <span><b>{t('Reference attached', 'تم إرفاق المرجع')}</b><small>{t('The AI copies its style and layout.', 'يقلّد الذكاء أسلوبه وتوزيعه.')}</small></span>
                    <button type="button" onClick={() => setReference('')} aria-label={t('Remove reference', 'أزل المرجع')}><X size={14} /></button>
                  </div>
                ) : (
                  <button type="button" className="tpl-dropzone" data-over={dragging || undefined} onClick={() => file.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void takeReference(f); }}>
                    <ImagePlus size={20} />
                    <span><b>{t('Add a design you like', 'أضف تصميمًا يعجبك')}</b><small>{t('Click or drop an image: PNG, JPG or WebP', 'اضغط أو اسحب صورة: PNG أو JPG أو WebP')}</small></span>
                  </button>
                )}
              </div>
            </div>
            <div className="tpl-generator__footer">
              <small className="u-muted">{t('Designed once, then reused for every post. ⌘↵ to start.', 'يُصمَّم مرة واحدة ثم يُعاد استخدامه في كل منشور. ⌘↵ للبدء.')}</small>
              <Button variant="primary" className="cta-create" disabled={prompt.trim().length < 5} onClick={() => void generate()}><Sparkles size={17} className="cta-create__spark" /> {t('Design the template', 'صمّم القالب')}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p role="alert" className="creative-home__error">{error}</p>}
    </section>
  );
}

/** Grid of saved templates with live previews. */
export function TemplateGrid({ items, onOpen }: { items: SvgTemplate[]; onOpen: (template: SvgTemplate) => void }) {
  const { t } = useI18n();
  return (
    <div className="tpl-grid">
      {items.map((template) => (
        <button key={template.id} type="button" className="tpl-card glass" onClick={() => onOpen(template)}>
          <span className="tpl-card__canvas"><TemplatePreview template={template} values={sampleValues(template.fields)} /></span>
          <span className="tpl-card__meta">
            <b dir="auto">{template.name}</b>
            <KindChip kind={template.kind} />
            <small>{template.sourceImage ? t('Write the idea · same look and logo', 'اكتب الفكرة بس · نفس الشكل واللوجو') : t(FORMAT_LABEL[template.format].en, FORMAT_LABEL[template.format].ar)}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Fill a template's fields by hand or from an Odoo event. */
function FieldsForm({ template, values, onChange, onCourseCopy }: { template: SvgTemplate; values: Record<string, string>; onChange: (next: Record<string, string>) => void; onCourseCopy?: (copy: Record<string, string>, profile?: CourseProfile) => void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const usesOdoo = template.fields.some((field) => field.source !== 'manual');
  const { profiles } = useCourseProfiles();
  const usesCourse = template.fields.some((field) => field.source.startsWith('course.'));
  return (
    <div className="tpl-fields">
      {usesOdoo && (
        <div className="tpl-fields__odoo">
          <span><CalendarClock size={15} /> {t('Choose a course to fill its copy', 'اختَر الدورة لملء النص تلقائيًا')}</span>
          {picking ? (
            <CoursePicker autoFocus onPick={(pick) => {
              const run = runOf(pick);
              const filled = run ? odooValues(run, template.fields) : {};
              // A catalog course: its own name and page link win over the run's session title.
              if (pick.type === 'course') {
                const titleField = template.fields.find((f) => f.source === 'odoo.title');
                const linkField = template.fields.find((f) => f.source === 'odoo.link');
                if (titleField) filled[titleField.key] = pick.course.name;
                if (linkField && (pick.course.url || run?.registrationUrl)) filled[linkField.key] = (run?.registrationUrl || pick.course.url)!;
              }
              const profile = profileFor(profiles, pick);
              const cleared = Object.fromEntries(template.fields.filter((f) => f.source !== 'manual' || ['title','subtitle','body','objectives','audience','outcomes','cta'].includes(f.key)).map((f) => [f.key, '']));
              const merged = { ...values, ...cleared, ...(profile ? courseTemplateCopy(profile, template.fields) : {}), ...filled, ...courseValues(profile, template.fields) };
              onChange(Object.fromEntries(template.fields.map(field => [field.key, field.type === 'image' ? merged[field.key] ?? '' : (merged[field.key] ?? '').slice(0, field.maxChars ?? 2000)])));
              onCourseCopy?.(profile ? courseCopy(profile) : { caption: '' }, profile);
              setNote(profile ? (profile.reviewStatus === 'suggested' ? t('Copy filled from a suggested profile. Review it before submitting.', 'تم ملء النص من ملف مقترح. راجعه قبل الإرسال للاعتماد.') : t('Copy filled from the approved course profile. You can edit it below.', 'تم ملء النص من ملف الدورة المعتمد. يمكنك تعديله بالأسفل.')) : usesCourse ? t('No goals are recorded for this course yet; ask marketing to add them on the Courses page.', 'لا توجد أهداف مسجلة لهذه الدورة بعد؛ اطلب من التسويق إضافتها من صفحة الدورات.') : '');
              setPicking(false);
            }} />
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setPicking(true)}><Search size={14} /> {t('Search courses', 'ابحث في الدورات')}</Button>
          )}
          {note && <p className="u-xs tpl-fields__note">{note}</p>}
        </div>
      )}
      {template.fields.map((field) => (
        <label key={field.key} className="tpl-fields__field">
          <span>{field.label}{field.source.startsWith('course.') ? <i>{t('Course goals', 'أهداف الدورة')}</i> : field.source !== 'manual' && <i>{t('Course data', 'بيانات الدورة')}</i>}</span>
          {field.type === 'image' ? (
            <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange({ ...values, [field.key]: await asDataUrl(f) }); }} />
          ) : field.type === 'multiline' ? (
            <textarea dir="auto" rows={3} readOnly={field.source.startsWith('course.') && !can('templates.manage')} maxLength={field.maxChars} value={values[field.key] ?? ''} onChange={(e) => onChange({ ...values, [field.key]: e.target.value })} />
          ) : (
            <input dir="auto" readOnly={field.source.startsWith('course.') && !can('templates.manage')} maxLength={field.maxChars} value={values[field.key] ?? ''} onChange={(e) => onChange({ ...values, [field.key]: e.target.value })} />
          )}
        </label>
      ))}
    </div>
  );
}

/** Photos are stored as local upload URLs so a reopened template keeps the chosen artwork. */
const storedValues = (template: SvgTemplate, values: Record<string, string>) =>
  Object.fromEntries(template.fields.map((field) => [field.key, (values[field.key] ?? '').slice(0, 2000)]));

/**
 * Template → post: fill the fields, pick platforms, get captions, export the PNG in the browser and send the post
 * into the pipeline. With `contentId`, saves a new version of an existing template post instead.
 */
interface ComposerProps { template: SvgTemplate; initialValues?: Record<string, string>; contentId?: string; initialChannels?: CreativePlatform[]; initialImageUrl?: string; initialFormat?: TemplateFormat; initialContext?: string; initialPreset?: string; initialIdea?: string; initialDirection?: string; initialLogoKit?: BrandKitId; onClose?: () => void }
export function TemplateComposer(props: ComposerProps) {
  return props.template.sourceImage ? <ReferenceComposer {...props} /> : <SvgTemplateComposer {...props} />;
}

/** An example idea per kind of post, in the words a marketer would type. */
const IDEA_EXAMPLES: Record<TemplateKind, [string, string]> = {
  course: ['e.g. Electric vehicle maintenance course, starts 5 December online, for engineers and technicians', 'مثال: كورس صيانة العربيات الكهربائية، بيبدأ 5 ديسمبر أونلاين، للمهندسين والفنيين'],
  graduation: ['e.g. Congratulations to the October cohort of the Interior Design Diploma', 'مثال: تهنئة لخريجي دبلومة التصميم الداخلي دفعة أكتوبر'],
  event: ['e.g. A contest for the best trainee design; the prize is a free course', 'مثال: مسابقة لأحسن تصميم من المتدربين، والجايزة كورس مجاني'],
  announcement: ['e.g. Why project managers need the PMP certificate', 'مثال: بوست توعوي عن أهمية شهادة PMP لمديري المشاريع'],
  general: ['e.g. What the post is about, for whom, and what they should do', 'مثال: البوست عن إيه، لمين، وعايزهم يعملوا إيه'],
};
/** One-click design notes, added to the "how should it look" box. */
const DIRECTION_PICKS: [string, string][] = [
  ['Smaller, calmer text', 'كلام أصغر وهادي'],
  ['More empty space', 'مساحة فاضية أكتر'],
  ['The picture bigger than the text', 'الصورة أكبر من الكلام'],
  ['A one-line headline', 'عنوان في سطر واحد'],
  ['Light background', 'خلفية فاتحة'],
  ['Blue background', 'خلفية زرقا'],
];
type ReferenceJob = { status: string; result?: { imageUrl: string; values?: Record<string, string>; caption?: string; logoKit?: BrandKitId }; error?: string };
/** What a design request was made from, kept until its job comes back so the result is matched to it. */
interface PendingRender { idea: string; direction: string; fresh: boolean; values: Record<string, string>; format: TemplateFormat; presetId: string }
const signatureOf = (input: { idea: string; direction: string; values: Record<string, string>; format: TemplateFormat; presetId: string }) => JSON.stringify({ idea: input.idea.trim(), direction: input.direction.trim(), values: input.values, format: input.format, presetId: input.presetId });

/**
 * A post in the look of a library reference design, from one idea: the AI writes every line the design needs (and
 * the caption), draws new artwork in the reference's look, and the logo is placed from its file: the reference's own
 * logo by default, or the other one. The written words fold under "edit by hand"; a later design uses them as they
 * are until the idea changes.
 */
function ReferenceComposer({ template, initialValues, contentId, initialChannels, initialImageUrl, initialFormat, initialContext, initialPreset, initialIdea, initialDirection, initialLogoKit, onClose }: ComposerProps) {
  const { t } = useI18n();
  const publisher = useAuth().can('content.publish');
  const [publishing, setPublishing] = useState<string | null>(null);
  const { user } = useAuth();
  const { navigate } = useRouter();
  const draftKey = `engosoft-reference-draft:v2:${user.id}:${template.id}:${contentId ?? 'new'}`;
  const saved = useMemo(() => { try { const data = JSON.parse(sessionStorage.getItem(draftKey) || '{}'); return data && typeof data === 'object' ? data : {}; } catch { return {}; } }, [draftKey]);
  const startIdea = initialIdea ?? initialContext ?? '';
  const [idea, setIdea] = useState<string>(saved.idea ?? startIdea);
  /** How the person wants it designed (layout, text size, colours, picture): it steers the image, not the facts. */
  const [direction, setDirection] = useState<string>(saved.direction ?? initialDirection ?? '');
  /** The idea the words on screen were written from: the same idea again keeps them, a new one writes new words. */
  const [writtenFor, setWrittenFor] = useState<string>(saved.writtenFor ?? (initialValues ? startIdea.trim() : ''));
  const [values, setValues] = useState<Record<string, string>>(saved.values ?? initialValues ?? {});
  const [course, setCourse] = useState<{ name: string; facts: string } | null>(saved.course ?? null);
  const [coursePanel, setCoursePanel] = useState(false);
  /** The reference's own logo: a new design starts on it; a saved post keeps the one it was made with. */
  const ownLogo = referenceLogoOf(template.sourceImage)?.kit;
  const [logoKit, setLogoKit] = useState<BrandKitId>(saved.logoKit ?? initialLogoKit ?? (contentId ? 'official' : ownLogo ?? 'official'));
  const [format, setFormat] = useState<TemplateFormat>(saved.format ?? initialFormat ?? template.format);
  const [channels, setChannels] = useState<CreativePlatform[]>(initialChannels ?? plannedChannels() ?? saved.channels ?? ['instagram', 'facebook']);
  const [presetId, setPresetId] = useState<string>(saved.presetId ?? initialPreset ?? '');
  const preset = publishingPreset(presetId);
  const [caption, setCaption] = useState<string>(saved.caption ?? '');
  /** The last caption the AI wrote: a new one replaces it, never a caption the person typed. */
  const aiCaption = useRef<string>(saved.aiCaption ?? '');
  const [imageUrl, setImageUrl] = useState<string>(saved.imageUrl ?? initialImageUrl ?? '');
  const [jobId, setJobId] = useState<string>(saved.jobId ?? '');
  const [createdId, setCreatedId] = useState<string>(contentId ?? saved.createdId ?? '');
  /** Every image made for the current content (generated or edited), newest last; any of them can be saved. */
  const [versions, setVersions] = useState<string[]>(saved.versions ?? (initialImageUrl ? [initialImageUrl] : []));
  const [jobKind, setJobKind] = useState<'generate' | 'edit'>(saved.jobKind ?? 'generate');
  const pending = useRef<PendingRender | null>(saved.pending ?? null);
  const [change, setChange] = useState('');
  const savedSignature = useRef<string>(saved.savedSignature ?? '');
  const [renderedFor, setRenderedFor] = useState<string>(saved.renderedFor ?? (initialImageUrl ? signatureOf({ idea: startIdea, direction: initialDirection ?? '', values: initialValues ?? {}, format: initialFormat ?? template.format, presetId: initialPreset ?? '' }) : ''));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const signature = signatureOf({ idea, direction, values, format, presetId });
  const current = Boolean(imageUrl && renderedFor === signature);
  /** A changed idea writes new words; the same idea keeps the words on screen (the person may have edited them). */
  const fresh = idea.trim().length > 0 && idea.trim() !== writtenFor;
  const ready = fresh ? idea.trim().length >= 8 : Boolean(values.title?.trim()) || idea.trim().length >= 8;
  useEffect(() => { try { sessionStorage.setItem(draftKey, JSON.stringify({ idea, direction, writtenFor, values, course, logoKit, format, presetId, channels, caption, aiCaption: aiCaption.current, imageUrl, jobId, jobKind, pending: pending.current, versions, renderedFor, createdId, savedSignature: savedSignature.current })); } catch { /* Private storage: the current session still works. */ } }, [draftKey, idea, direction, writtenFor, values, course, logoKit, format, presetId, channels, caption, imageUrl, jobId, jobKind, versions, renderedFor, createdId]);
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const job = await api<ReferenceJob>(`/api/reference-design/jobs/${jobId}`);
        if (!alive) return;
        if (job.status === 'done' && job.result) {
          const { imageUrl: url, values: words, caption: written } = job.result;
          setImageUrl(url); setVersions((list) => [...list.filter((v) => v !== url), url].slice(-8)); setJobId('');
          const request = pending.current;
          if (request) {
            const next = words ?? request.values;
            setValues(next);
            if (request.fresh) setWrittenFor(request.idea);
            setRenderedFor(signatureOf({ idea: request.idea, direction: request.direction, values: next, format: request.format, presetId: request.presetId }));
            pending.current = null;
          }
          if (written) setCaption((now) => { if (now.trim() && now !== aiCaption.current) return now; aiCaption.current = written; return written; });
        }
        else if (job.status === 'failed') { setError(job.error ?? t('Could not generate the design.', 'تعذّر توليد التصميم.')); setJobId(''); pending.current = null; }
        else timer = setTimeout(poll, 2500);
      } catch (e) { if (alive) { setError(errorMessage(e, '')); setJobId(''); } }
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [jobId, t]);
  const generate = async () => {
    if (!ready) { setError(t('Write the idea of the post in a sentence or two.', 'اكتب فكرة المنشور في جملة أو اتنين.')); return; }
    setBusy('generate'); setError('');
    try {
      const request: PendingRender = { idea: idea.trim(), direction: direction.trim(), fresh, values: fresh ? {} : values, format, presetId };
      const facts = course ? [`الدورة: ${course.name}`, course.facts].filter(Boolean).join('\n') : '';
      const body = fresh
        ? { idea: request.idea, facts, values: {}, direction: request.direction, format, logoKit, ...(presetId ? { outputPreset: presetId } : {}) }
        : { values, context: request.idea.slice(0, 800), direction: request.direction, format, logoKit, ...(presetId ? { outputPreset: presetId } : {}) };
      const result = await api<{ jobId: string }>(`/api/svg-templates/${template.id}/render`, { body });
      pending.current = request;
      // A new design starts a new set of versions: an older one may carry other words.
      setJobKind('generate'); setJobId(result.jobId); setVersions([]);
    } catch (e) { setError(errorMessage(e, '')); }
    setBusy('');
  };
  /** The other logo on the design on screen: placed again on its logo-free original, no new image. */
  const pickLogo = async (kit: BrandKitId) => {
    if (kit === logoKit || busy || jobId) return;
    const was = logoKit;
    setLogoKit(kit);
    if (!imageUrl) return;
    setBusy('logo'); setError('');
    try {
      const out = await api<{ imageUrl: string }>(`/api/svg-templates/${template.id}/logo`, { body: { imageUrl, logoKit: kit, format, ...(presetId ? { outputPreset: presetId } : {}) } });
      setImageUrl(out.imageUrl); setVersions((list) => list.map((v) => (v === imageUrl ? out.imageUrl : v)));
    } catch (e) { setLogoKit(was); setError(errorMessage(e, '')); }
    setBusy('');
  };
  /** One change to the current design; the layout, the copy and the logo placement stay. */
  const applyChange = async (instruction = change) => {
    if (!current || instruction.trim().length < 3 || busy || jobId) return;
    setBusy('edit'); setError('');
    try {
      const result = await api<{ jobId: string }>(`/api/svg-templates/${template.id}/edit`, { body: { imageUrl, instruction: instruction.trim(), values, format, logoKit, ...(presetId ? { outputPreset: presetId } : {}) } });
      pending.current = null;
      setJobKind('edit'); setJobId(result.jobId); setChange('');
    } catch (e) { setError(errorMessage(e, '')); }
    setBusy('');
  };
  const quickChanges = [
    t('Fix the spelling of all text', 'صحّح كتابة كل النصوص'),
    t('Make the photo brighter and sharper', 'خلّي الصورة أفتح وأوضح'),
    t('Make the headline stand out more', 'خلّي العنوان أوضح وأبرز'),
    t('Simplify the background', 'بسّط الخلفية'),
  ];
  const save = async (send: boolean) => {
    if (!current || busy || jobId) return;
    setBusy(send ? 'send' : 'save'); setError('');
    try {
      const svgTemplate = { id: template.id, values, format, context: idea.trim().slice(0, 800), idea: idea.trim().slice(0, 2000), ...(direction.trim() ? { direction: direction.trim().slice(0, 1000) } : {}), logoKit, ...(presetId ? { outputPreset: presetId } : {}) };
      const title = (values.title || idea.trim() || template.name).slice(0, 300);
      const stamp = `${signature}|${imageUrl}`;
      let id = createdId;
      if (id && savedSignature.current !== stamp) await api(`/api/content/${id}/versions`, { body: { imageUrl, studio: { svgTemplate }, note: t('New design from the approved reference', 'تصميم جديد من المرجع المعتمد') } });
      if (id) await api(`/api/content/${id}`, { method: 'PATCH', body: { title, ...(!contentId ? { channels, captions: Object.fromEntries(channels.map((c) => [c, caption])) } : {}) } });
      if (!id) {
        const item = await api<{ id: string }>('/api/content', { body: { ...takePostPlan(), title, channels, captions: Object.fromEntries(channels.map((c) => [c, caption])), creative: { requestId: 'reference-design', directionId: format, imageUrl, model: 'reference-guided', directionName: template.name, svgTemplate } } });
        id = item.id;
        setCreatedId(id);
        void api(`/api/svg-templates/${template.id}/used`, { body: {} }).catch(() => {});
      }
      savedSignature.current = stamp;
      if (send && !publisher) await api(`/api/content/${id}/transition`, { body: { to: 'ready_for_review' } });
      try { sessionStorage.removeItem(draftKey); } catch { /* Storage may be disabled. */ }
      // The publisher publishes right here (their publish is the approval); the publish window opens on this page.
      if (send && publisher) { setPublishing(id ?? null); setBusy(''); return; }
      navigate(`/content/${id}`);
    } catch (e) { setError(errorMessage(e, '')); }
    setBusy('');
  };
  const wordFields = template.fields.filter((field) => field.type !== 'image');
  const hasWords = wordFields.some((field) => values[field.key]?.trim());
  const working = Boolean(jobId || busy);
  return <div className="tpl-composer">
    <div className="tpl-composer__stage">
      <span className="tpl-reference-label">{imageUrl ? t('Your generated design', 'تصميمك المولّد') : t('Visual reference', 'المرجع البصري')}</span>
      <TemplatePreview template={imageUrl ? { ...template, sourceImage: imageUrl, width: preset?.width ?? (format === 'landscape' ? 1200 : 1080), height: preset?.height ?? (format === 'story' ? 1920 : format === 'square' ? 1080 : format === 'landscape' ? 630 : 1350) } : template} className="tpl-composer__preview" />
      {imageUrl && <a href={template.sourceImage} target="_blank" rel="noreferrer" className="ui-link">{t('Compare with the reference', 'قارن بالمرجع')}</a>}
      {jobId && <p role="status"><Loader2 size={15} className="creative-job__spin" /> {jobKind === 'edit' ? t('Applying your change; the layout and copy stay…', 'جارٍ تنفيذ التعديل مع الحفاظ على التوزيع والنص…') : pending.current?.fresh ? t('Writing the words from your idea, then drawing the design in this look…', 'بيكتب الكلام من فكرتك، وبعدين بيرسم التصميم بنفس الشكل ده…') : t('Creating new artwork in this visual family…', 'جارٍ توليد تصميم جديد من نفس العائلة البصرية…')}</p>}
      {versions.length > 1 && <div className="tpl-versions" role="radiogroup" aria-label={t('Versions', 'النسخ')}>
        {versions.map((url, i) => <button key={url} type="button" role="radio" aria-checked={imageUrl === url} disabled={Boolean(jobId)} onClick={() => setImageUrl(url)}><img src={url} alt="" /><small>{i === 0 ? t('First', 'الأولى') : t(`Version ${i + 1}`, `نسخة ${i + 1}`)}</small></button>)}
      </div>}
    </div>
    <div className="tpl-composer__panel glass">
      <div className="tpl-composer__title"><h3>{template.name}</h3>{onClose && <button type="button" className="content-drawer__close" aria-label={t('Close', 'إغلاق')} onClick={onClose}><X size={16} /></button>}</div>
      <p className="u-sm u-muted">{t('Write the idea only. AI writes every line the design needs and the caption, draws new artwork in this look, and places the logo you pick from its file.', 'اكتب فكرة المنشور بس. الذكاء الاصطناعي بيكتب كل الكلام اللي التصميم محتاجه والكابشن، ويرسم تصميم جديد بنفس شكل وهوية المرجع ده، ويحط اللوجو اللي تختاره من ملفه.')}</p>
      <fieldset disabled={working} className="tpl-reference-fields">
        <label className="tpl-fields__field">{t('Idea of the post', 'فكرة المنشور')}
          {/* Empty, the box follows the page's direction so the Arabic example reads right to left. */}
          <textarea dir={idea ? 'auto' : undefined} rows={4} maxLength={2000} value={idea} onChange={(e) => { setIdea(e.target.value); if (error) setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void generate(); } }}
            placeholder={t(...IDEA_EXAMPLES[template.kind] ?? IDEA_EXAMPLES.general)} />
          <small className="tpl-field__hint">{t('Dates, prices and names come only from what you write or the course you pick. Lines you write one per line go on the design as they are.', 'المواعيد والأسعار والأسماء بتتاخد من كلامك أو من الدورة اللي تختارها بس. ولو كتبت سطور (كل سطر لوحده) هتتحط على التصميم زي ما هي.')}</small>
        </label>
        <label className="tpl-fields__field">{t('How should it look? (optional)', 'عايزه يبقى شكله إزاي؟ (اختياري)')}
          <textarea dir={direction ? 'auto' : undefined} rows={2} maxLength={1000} value={direction} onChange={(e) => setDirection(e.target.value)}
            placeholder={t('e.g. small, calm text; the photo is the hero; light background', 'مثال: الكلام صغير وهادي، الصورة هي البطل، وخلفية فاتحة')} />
          <span className="tpl-direction__picks" role="group" aria-label={t('Quick picks', 'اختيارات سريعة')}>
            {DIRECTION_PICKS.map(([en, ar]) => { const pick = t(en, ar); const on = direction.includes(pick); return <button key={en} type="button" aria-pressed={on} onClick={() => setDirection((now) => on ? now.split('، ').filter((part) => part.trim() !== pick).join('، ') : [now.trim(), pick].filter(Boolean).join('، '))}>{pick}</button>; })}
          </span>
          <small className="tpl-field__hint">{t('Layout, text size, colours, the picture and the mood. Words and facts come from the idea.', 'الترتيب وحجم الكلام والألوان والصورة والإحساس. الكلام والمعلومات بتيجي من الفكرة.')}</small>
        </label>
        <div className="tpl-idea__course">
          {course
            ? <span className="tpl-idea__picked"><GraduationCap size={14} /><bdi>{course.name}</bdi>{course.facts && <small>{course.facts.split('\n').map((line) => line.replace(/^[^:]+:\s*/, '')).join(' · ')}</small>}<button type="button" aria-label={t('Remove the course', 'شيل الدورة')} onClick={() => setCourse(null)}><X size={13} /></button></span>
            : <Button variant="ghost" size="sm" icon={<GraduationCap size={14} />} onClick={() => setCoursePanel(!coursePanel)}>{t('From a course (optional)', 'من دورة (اختياري)')}</Button>}
        </div>
        {coursePanel && !course && <div className="creative-home__source"><CoursePicker autoFocus onPick={(pick) => {
          const picked = courseFacts(pick);
          setCourse({ name: picked.course, facts: picked.facts });
          setIdea((now) => now.trim() ? now : picked.course);
          setCoursePanel(false);
        }} /></div>}
        <LogoChoice value={logoKit} own={ownLogo} onChange={(kit) => void pickLogo(kit)} disabled={working} />
        <PublishingPresetPicker value={presetId} format={format} onFormatChange={setFormat} onChange={id => {
          setPresetId(id);
          const next = publishingPreset(id);
          if (next) { setFormat(next.format); setChannels(old => old.includes(next.channel as CreativePlatform) ? old : [...old, next.channel as CreativePlatform]); }
        }} />
      </fieldset>
      <Button variant="primary" busy={Boolean(jobId) || busy === 'generate'} disabled={working || !ready} onClick={() => void generate()}><Sparkles size={16} />{imageUrl ? t('Design another version (1 image)', 'صمّم نسخة تانية (صورة واحدة)') : t('Design the post (1 image)', 'صمّم المنشور (صورة واحدة)')}</Button>
      {hasWords && <details className="tpl-words">
        <summary><PenLine size={14} /> {t('The words on the design: edit them by hand', 'الكلام اللي على التصميم: عدّله بإيدك')}</summary>
        <fieldset disabled={working} className="tpl-reference-fields">
          {wordFields.map((field) => <label key={field.key} className="tpl-fields__field">{field.label}
            {field.type === 'multiline'
              ? <textarea dir="auto" rows={2} maxLength={field.maxChars} value={values[field.key] ?? ''} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
              : <input dir="auto" maxLength={field.maxChars} value={values[field.key] ?? ''} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />}
          </label>)}
          <small className="tpl-field__hint">{t('After an edit, design it again: it keeps your words exactly. Change the idea to have new words written.', 'بعد ما تعدّل، صمّمه تاني وهيستخدم كلامك بالظبط. غيّر الفكرة لو عايز كلام جديد يتكتب.')}</small>
        </fieldset>
      </details>}
      {!contentId && <><div className="creative-home__platforms tpl-composer__platforms">{CREATIVE_PLATFORMS.map((channel) => <button key={channel} type="button" aria-pressed={channels.includes(channel)} onClick={() => setChannels((c) => c.includes(channel) ? c.filter((p) => p !== channel) : [...c, channel])}><ChannelIcon channel={channel} size={14} />{PLATFORM_FORMATS[channel].label}</button>)}</div><label className="tpl-fields__field">{t('Caption', 'النص المرافق')}<textarea dir="auto" rows={3} value={caption} placeholder={t('Written by AI with the design; you can change it.', 'بيتكتب بالذكاء الاصطناعي مع التصميم، وتقدر تغيّره.')} onChange={(e) => setCaption(e.target.value)} /></label></>}
      {current && <div className="tpl-change">
        <label className="tpl-fields__field">{t('Change something in this design', 'عدّل شيئًا في هذا التصميم')}
          <textarea rows={2} dir="auto" maxLength={600} value={change} disabled={working} onChange={(e) => setChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void applyChange(); } }}
            placeholder={t('e.g. make the engineer wear a helmet, fix the spelling of the headline', 'مثلًا: خلّي المهندس لابس خوذة، صحّح كتابة العنوان')} />
        </label>
        <div className="tpl-change__chips">{quickChanges.map((q) => <button key={q} type="button" disabled={working} onClick={() => void applyChange(q)}>{q}</button>)}</div>
        <Button variant="secondary" icon={<Wand2 size={15} />} disabled={change.trim().length < 3 || working} busy={busy === 'edit'} onClick={() => void applyChange()}>{t('Apply the change', 'نفّذ التعديل')}</Button>
        <small className="u-muted">{t('Keeps the layout, your copy and the logo; changes only what you ask. Each change uses one image. Earlier versions stay above to pick from.', 'يحافظ على التوزيع ونصك والشعار، ويغيّر ما تطلبه فقط. كل تعديل يستهلك صورة واحدة، والنسخ السابقة تبقى فوق للاختيار.')}</small>
      </div>}
      {imageUrl && !current && !jobId && <p className="u-sm u-muted">{t('The idea or the words changed. Design it again before saving.', 'الفكرة أو الكلام اتغيّر؛ صمّمه تاني قبل الحفظ.')}</p>}
      <div className="tpl-composer__actions"><Button variant="primary" disabled={!current || working || !channels.length} busy={busy === 'send'} onClick={() => void save(!contentId)}><Send size={15} />{contentId ? t('Save a new version', 'احفظ نسخة جديدة') : publisher ? t('Save and publish', 'احفظ وانشر') : t('Send to the publisher', 'ابعته للمسؤول عن النشر')}</Button>{!contentId && <Button variant="secondary" disabled={!current || working || !channels.length} onClick={() => void save(false)}>{t('Save draft', 'احفظ مسودة')}</Button>}{current && <a href={imageUrl} download className="ui-link">PNG</a>}</div>
      {error && <p role="alert" className="creative-home__error">{error}</p>}
      <PublishHere contentId={publishing} onClose={() => setPublishing(null)} />
    </div>
  </div>;
}

function SvgTemplateComposer({ template, initialValues, contentId, initialChannels, onClose }: ComposerProps) {
  const { t } = useI18n();
  const publisher = useAuth().can('content.publish');
  const [publishing, setPublishing] = useState<string | null>(null);
  const { navigate } = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...sampleValues(template.fields), ...initialValues }));
  const [channels, setChannels] = useState<CreativePlatform[]>(initialChannels ?? plannedChannels() ?? ['instagram', 'facebook']);
  const [captions, setCaptions] = useState<Partial<Record<CreativePlatform, string>>>({});
  const [dialect, setDialect] = usePreferredDialect();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const facts = template.fields.filter((field) => field.type !== 'image').map((field) => `${field.label}: ${values[field.key] ?? ''}`).join('\n');
  const title = values.title || values[template.fields[0]?.key] || template.name;

  const writeCaptions = async () => {
    setBusy('captions');
    setError('');
    try {
      const result = await api<{ captions: Partial<Record<CreativePlatform, string>> }>('/api/ai/captions', { body: { facts, channels, dialect } });
      setCaptions((current) => ({ ...current, ...result.captions }));
    } catch (e) {
      setError(errorMessage(e, ''));
    }
    setBusy('');
  };
  const save = async (send: boolean) => {
    setBusy(send ? 'send' : 'draft');
    setError('');
    try {
      const png = await exportPng(template, values);
      const { url } = await api<{ url: string }>('/api/uploads', { body: { dataUrl: png } });
      const savedValues = { ...values };
      for (const field of template.fields.filter((f) => f.type === 'image')) {
        if (savedValues[field.key]?.startsWith('data:image/')) {
          const photo = await api<{ url: string }>('/api/uploads', { body: { dataUrl: savedValues[field.key] } });
          savedValues[field.key] = photo.url;
        }
      }
      const svgTemplate = { id: template.id, values: storedValues(template, savedValues) };
      if (contentId) {
        await api(`/api/content/${contentId}/versions`, { body: { imageUrl: url, studio: { svgTemplate }, note: t('Template edit', 'تعديل من القالب') } });
        navigate(`/content/${contentId}`);
      } else {
        const item = await api<{ id: string }>('/api/content', {
          body: { ...takePostPlan(), title: title.slice(0, 300), channels, captions: Object.fromEntries(channels.map((c) => [c, captions[c] ?? ''])), creative: { requestId: 'svg-template', directionId: 'svg', imageUrl: url, model: 'svg-template', directionName: template.name.slice(0, 200), svgTemplate } },
        });
        void api(`/api/svg-templates/${template.id}/used`, { body: {} }).catch(() => {});
        if (send && !publisher) await api(`/api/content/${item.id}/transition`, { body: { to: 'ready_for_review' } });
        if (send && publisher) { setPublishing(item.id); setBusy(''); return; }
        navigate(`/content/${item.id}`);
      }
    } catch (e) {
      setError(errorMessage(e, ''));
    }
    setBusy('');
  };
  const download = async () => {
    setBusy('png');
    try {
      const png = await exportPng(template, values);
      const link = document.createElement('a');
      link.href = png;
      link.download = `engosoft-${template.format}-${Date.now()}.png`;
      link.click();
    } catch (e) {
      setError(errorMessage(e, ''));
    }
    setBusy('');
  };

  return (
    <div className="tpl-composer">
      <div className="tpl-composer__stage">
        <TemplatePreview template={template} values={values} className="tpl-composer__preview" />
        <p className="tpl-composer__size"><span dir="ltr">{template.width}×{template.height}</span> · {t(FORMAT_LABEL[template.format].en, FORMAT_LABEL[template.format].ar)}</p>
      </div>
      <div className="tpl-composer__panel glass">
        <div className="tpl-composer__title">
          <h3 dir="auto">{template.name}</h3>
          {onClose && <button type="button" className="content-drawer__close" onClick={onClose} aria-label={t('Close', 'إغلاق')}><X size={16} /></button>}
        </div>
        <FieldsForm template={template} values={values} onChange={setValues} />
        {!contentId && (
          <>
            <div className="creative-home__platforms tpl-composer__platforms" role="group" aria-label={t('Platforms', 'المنصات')}>
              {CREATIVE_PLATFORMS.map((platform) => (
                <button key={platform} type="button" aria-pressed={channels.includes(platform)} onClick={() => setChannels((current) => current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform])}>
                  <span className="creative-home__platform-icon"><ChannelIcon channel={platform} size={14} /></span>{PLATFORM_FORMATS[platform].label}
                </button>
              ))}
            </div>
            <div className="tpl-captions">
              <div className="tpl-captions__head">
                <b>{t('Captions', 'النص المرافق')}</b>
                <Button variant="subtle" size="sm" busy={busy === 'captions'} disabled={!channels.length || Boolean(busy)} onClick={() => void writeCaptions()}><Sparkles size={14} /> {t('Write with AI', 'اكتبه بالذكاء الاصطناعي')}</Button>
              </div>
              <DialectPicker value={dialect} onChange={setDialect} />
              {channels.map((channel) => (
                <label key={channel}>
                  <span><ChannelIcon channel={channel} size={13} /> {PLATFORM_FORMATS[channel].label}</span>
                  <textarea dir="auto" rows={3} value={captions[channel] ?? ''} onChange={(e) => setCaptions((current) => ({ ...current, [channel]: e.target.value }))} />
                </label>
              ))}
            </div>
          </>
        )}
        <div className="tpl-composer__actions">
          {contentId ? (
            <Button variant="primary" busy={busy === 'draft'} disabled={Boolean(busy)} onClick={() => void save(false)}><Save size={15} /> {t('Save as new version', 'احفظ نسخة جديدة')}</Button>
          ) : (
            <>
              <Button variant="primary" busy={busy === 'send'} disabled={Boolean(busy) || !channels.length} onClick={() => void save(true)}><Send size={15} /> {publisher ? t('Save and publish', 'احفظ وانشر') : t('Send to the publisher', 'ابعته للمسؤول عن النشر')}</Button>
              <Button variant="secondary" busy={busy === 'draft'} disabled={Boolean(busy) || !channels.length} onClick={() => void save(false)}><FileText size={15} /> {t('Save as draft', 'احفظه مسودة')}</Button>
            </>
          )}
          <Button variant="ghost" busy={busy === 'png'} disabled={Boolean(busy)} onClick={() => void download()}>PNG</Button>
        </div>
        {error && <p role="alert" className="creative-home__error">{error}</p>}
        <PublishHere contentId={publishing} onClose={() => setPublishing(null)} />
      </div>
    </div>
  );
}

/** Template detail: fill and preview, tweak with AI, or edit the SVG code by hand. */
export function TemplateEditor({ template: initial, contentId, initialValues, onDeleted }: { template: SvgTemplate; contentId?: string; initialValues?: Record<string, string>; onDeleted?: () => void }) {
  const { t } = useI18n();
  const [template, setTemplate] = useState(initial);
  const [tab, setTab] = useState<'use' | 'ai' | 'code'>('use');
  const [instruction, setInstruction] = useState('');
  const [code, setCode] = useState(initial.svg);
  const [name, setName] = useState(initial.name);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const revise = async () => {
    if (instruction.trim().length < 3) return;
    setBusy('ai');
    setError('');
    try {
      const next = await api<SvgTemplate>(`/api/svg-templates/${template.id}/revise`, { body: { instruction } });
      setTemplate(next);
      setCode(next.svg);
      setInstruction('');
      setNotice(t('Updated. The old version is replaced.', 'تم التعديل.'));
    } catch (e) {
      setError(errorMessage(e, ''));
    }
    setBusy('');
  };
  const saveCode = async () => {
    setBusy('code');
    setError('');
    try {
      const next = await api<SvgTemplate>(`/api/svg-templates/${template.id}`, { method: 'PUT', body: { name, description: template.description, svg: code, fields: template.fields } });
      setTemplate(next);
      setCode(next.svg);
      setNotice(t('Saved.', 'تم الحفظ.'));
    } catch (e) {
      setError(errorMessage(e, ''));
    }
    setBusy('');
  };
  const changeKind = async (kind: TemplateKind) => {
    setError('');
    try {
      setTemplate(await api<SvgTemplate>(`/api/svg-templates/${template.id}`, { method: 'PUT', body: { name, description: template.description, kind, svg: template.svg, fields: template.fields } }));
      setNotice(t('Post type updated.', 'تم تغيير نوع المنشور.'));
    } catch (e) {
      setError(errorMessage(e, ''));
    }
  };
  const remove = async () => {
    if (!window.confirm(t('Delete this template?', 'هل تريد حذف هذا القالب؟'))) return;
    try {
      await api(`/api/svg-templates/${template.id}`, { method: 'DELETE' });
      onDeleted?.();
    } catch (e) {
      setError(errorMessage(e, ''));
    }
  };
  return (
    <div className="tpl-editor">
      <div className="tpl-editor__bar glass">
        <input className="tpl-editor__name" dir="auto" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== template.name && void saveCode()} aria-label={t('Template name', 'اسم القالب')} />
        <select className="tpl-kind-select__input" value={template.kind} onChange={(e) => void changeKind(e.target.value as TemplateKind)} aria-label={t('Post type', 'نوع المنشور')}>{TEMPLATE_KINDS.map((value) => <option key={value} value={value}>{t(KIND_LABEL[value].en, KIND_LABEL[value].ar)}</option>)}</select>
        <div className="board-scope" role="tablist">
          <button type="button" aria-pressed={tab === 'use'} onClick={() => setTab('use')}><Send size={14} /> {contentId ? t('Edit post', 'عدّل المنشور') : t('Make a post', 'أنشئ منشورًا')}</button>
          <button type="button" aria-pressed={tab === 'ai'} onClick={() => setTab('ai')}><Wand2 size={14} /> {t('Change with AI', 'عدّل بالذكاء الاصطناعي')}</button>
          <button type="button" aria-pressed={tab === 'code'} onClick={() => setTab('code')}><Code2 size={14} /> SVG</button>
        </div>
        {!contentId && <Button variant="ghost" size="sm" onClick={() => void remove()}><Trash2 size={14} /></Button>}
      </div>
      {notice && <p className="settings-notice">{notice}</p>}
      {error && <p role="alert" className="creative-home__error">{error}</p>}
      {tab === 'use' && <TemplateComposer key={template.updatedAt} template={template} contentId={contentId} initialValues={initialValues} />}
      {tab === 'ai' && (
        <div className="tpl-composer">
          <div className="tpl-composer__stage">
            <div className={busy === 'ai' ? 'tpl-scan is-scanning' : 'tpl-scan'}>
              <TemplatePreview template={template} values={sampleValues(template.fields)} className="tpl-composer__preview" />
              <span className="studio__scan" />
            </div>
          </div>
          <div className="tpl-composer__panel glass">
            <h3><Wand2 size={16} /> {t('Describe the change', 'صِف التعديل')}</h3>
            <p className="u-sm u-muted">{t('Small text call, not an image: cents. Examples: "make the title bigger", "use an orange date badge", "add a field for the price".', 'طلب نصي صغير وليس توليد صورة، لذا تكلفته زهيدة. أمثلة: «كبّر العنوان»، «اجعل شارة التاريخ برتقالية»، «أضف حقلًا للسعر».')}</p>
            <textarea dir="auto" rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
            <Button variant="primary" busy={busy === 'ai'} disabled={Boolean(busy)} onClick={() => void revise()}>{busy === 'ai' ? <Loader2 size={15} className="creative-job__spin" /> : <Sparkles size={15} />} {t('Apply', 'نفّذ')}</Button>
          </div>
        </div>
      )}
      {tab === 'code' && (
        <div className="tpl-composer">
          <div className="tpl-composer__stage">
            <TemplatePreview template={{ ...template, svg: code }} values={sampleValues(template.fields)} className="tpl-composer__preview" />
          </div>
          <div className="tpl-composer__panel glass">
            <h3><Code2 size={16} /> SVG</h3>
            <p className="u-xs u-muted">{t('Text with data-field="key" is filled per post; the image with data-role="logo" always gets the official logo.', 'يُملأ النص الذي يحمل data-field في كل منشور، وتأخذ الصورة التي تحمل data-role="logo" الشعار الرسمي دائمًا.')}</p>
            <textarea className="tpl-code" dir="ltr" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
            <Button variant="primary" busy={busy === 'code'} disabled={Boolean(busy)} onClick={() => void saveCode()}><Save size={15} /> {t('Save template', 'احفظ القالب')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
