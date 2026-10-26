import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Code2, FileText, ImagePlus, Loader2, Save, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { CREATIVE_PLATFORMS, PLATFORM_FORMATS, type CreativePlatform } from '../creative-studio/platforms';
import { exportPng, fillSvg, FORMAT_LABEL, loadBrandFonts, odooValues, sampleValues, type OdooEvent, type SvgTemplate, type TemplateFormat } from './render';

export function useSvgTemplates() {
  const [items, setItems] = useState<SvgTemplate[] | null>(null);
  const [error, setError] = useState('');
  const reload = () => api<SvgTemplate[]>('/api/svg-templates').then(setItems).catch((e) => setError(errorMessage(e, '')));
  useEffect(() => {
    void reload();
  }, []);
  return { items, error, reload, setItems };
}

export function useOdooEvents() {
  const [events, setEvents] = useState<OdooEvent[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    fetch('/api/odoo/schedule')
      .then((r) => r.json())
      .then((data: { status: string; events?: OdooEvent[]; message?: string }) => {
        if (data.status === 'connected') setEvents((data.events ?? []).filter((e) => Date.parse(e.startsAt) > Date.now() - 86_400_000).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
        else setMessage(data.message || 'Odoo');
      })
      .catch(() => setMessage('Odoo'));
  }, []);
  return { events, message };
}

/** The filled template as live SVG, scaled to its container. */
export function TemplatePreview({ template, values, className }: { template: Pick<SvgTemplate, 'svg' | 'width' | 'height'>; values?: Record<string, string>; className?: string }) {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  useEffect(() => {
    void loadBrandFonts().then(() => setFontsLoaded(true));
  }, []);
  const markup = useMemo(() => fillSvg(template.svg, values ?? {}), [template.svg, values, fontsLoaded]);
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
  const [reference, setReference] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const generate = async () => {
    if (prompt.trim().length < 5) return setError(t('Describe the template in a few words.', 'صِف القالب في كلمتين على الأقل.'));
    setBusy(true);
    setError('');
    try {
      onCreated(await api<SvgTemplate>('/api/svg-templates/generate', { body: { prompt, format, ...(reference ? { reference } : {}) } }));
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
            <textarea dir="auto" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('Example: Course announcement with a big title, date and time badge, instructor name and a register button. Dark blue, modern.', 'مثال: إعلان دورة بعنوان كبير، وشارة للتاريخ والوقت، واسم المحاضر، وزر «سجّل الآن». أزرق داكن وتصميم عصري.')} />
            <div className="tpl-generator__row">
              <div className="tpl-formats" role="radiogroup" aria-label={t('Size', 'المقاس')}>
                {(Object.keys(FORMAT_LABEL) as TemplateFormat[]).map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={format === value} onClick={() => setFormat(value)}>
                    <span className="tpl-formats__shape" data-format={value} />
                    <b>{t(FORMAT_LABEL[value].en, FORMAT_LABEL[value].ar)}</b>
                    <small dir="ltr">{FORMAT_LABEL[value].size}</small>
                  </button>
                ))}
              </div>
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setReference(await asDataUrl(f)); e.target.value = ''; }} />
              {reference ? (
                <span className="tpl-reference"><img src={reference} alt="" /><button type="button" onClick={() => setReference('')} aria-label={t('Remove reference', 'أزل المرجع')}><X size={14} /></button></span>
              ) : (
                <Button variant="secondary" onClick={() => file.current?.click()}><ImagePlus size={15} /> {t('Reference design', 'تصميم مرجعي')}</Button>
              )}
              <Button variant="primary" className="cta-create" onClick={() => void generate()}><Sparkles size={17} className="cta-create__spark" /> {t('Design the template', 'صمّم القالب')}</Button>
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
          <TemplatePreview template={template} values={sampleValues(template.fields)} />
          <span className="tpl-card__meta">
            <b dir="auto">{template.name}</b>
            <small>{t(FORMAT_LABEL[template.format].en, FORMAT_LABEL[template.format].ar)} · <span dir="ltr">{FORMAT_LABEL[template.format].size}</span> · {t(`${template.usageCount} posts`, `${template.usageCount} منشور`)}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Fill a template's fields by hand or from an Odoo event. */
function FieldsForm({ template, values, onChange }: { template: SvgTemplate; values: Record<string, string>; onChange: (next: Record<string, string>) => void }) {
  const { t } = useI18n();
  const { events, message } = useOdooEvents();
  const usesOdoo = template.fields.some((field) => field.source !== 'manual');
  return (
    <div className="tpl-fields">
      {usesOdoo && (
        <label className="tpl-fields__odoo">
          <span><CalendarClock size={15} /> {t('Fill from an Odoo event', 'املأ الحقول من فعالية في Odoo')}</span>
          <select defaultValue="" onChange={(e) => { const event = events.find((entry) => entry.id === e.target.value); if (event) onChange({ ...values, ...odooValues(event, template.fields) }); }}>
            <option value="" disabled>{events.length ? t('Choose an event or course…', 'اختر فعالية أو دورة…') : message ? t('Odoo is not available', 'Odoo غير متاح') : t('Loading Odoo…', 'جارٍ تحميل Odoo…')}</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.title} · {event.startsAt.slice(0, 10)}</option>)}
          </select>
        </label>
      )}
      {template.fields.map((field) => (
        <label key={field.key} className="tpl-fields__field">
          <span>{field.label}{field.source !== 'manual' && <i>Odoo</i>}</span>
          {field.type === 'image' ? (
            <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange({ ...values, [field.key]: await asDataUrl(f) }); }} />
          ) : field.type === 'multiline' ? (
            <textarea dir="auto" rows={3} maxLength={field.maxChars} value={values[field.key] ?? ''} onChange={(e) => onChange({ ...values, [field.key]: e.target.value })} />
          ) : (
            <input dir="auto" maxLength={field.maxChars} value={values[field.key] ?? ''} onChange={(e) => onChange({ ...values, [field.key]: e.target.value })} />
          )}
        </label>
      ))}
    </div>
  );
}

/** Values kept with a post: text only (photos are baked into the exported image). */
const storedValues = (template: SvgTemplate, values: Record<string, string>) =>
  Object.fromEntries(template.fields.filter((field) => field.type !== 'image').map((field) => [field.key, (values[field.key] ?? '').slice(0, 2000)]));

/**
 * Template → post: fill the fields, pick platforms, get captions, export the PNG in the browser and send the post
 * into the pipeline. With `contentId`, saves a new version of an existing template post instead.
 */
export function TemplateComposer({ template, initialValues, contentId, initialChannels, onClose }: { template: SvgTemplate; initialValues?: Record<string, string>; contentId?: string; initialChannels?: CreativePlatform[]; onClose?: () => void }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...sampleValues(template.fields), ...initialValues }));
  const [channels, setChannels] = useState<CreativePlatform[]>(initialChannels ?? ['instagram', 'facebook']);
  const [captions, setCaptions] = useState<Partial<Record<CreativePlatform, string>>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const facts = template.fields.filter((field) => field.type !== 'image').map((field) => `${field.label}: ${values[field.key] ?? ''}`).join('\n');
  const title = values.title || values[template.fields[0]?.key] || template.name;

  const writeCaptions = async () => {
    setBusy('captions');
    setError('');
    try {
      const result = await api<{ captions: Partial<Record<CreativePlatform, string>> }>('/api/ai/captions', { body: { facts, channels } });
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
      const svgTemplate = { id: template.id, values: storedValues(template, values) };
      if (contentId) {
        await api(`/api/content/${contentId}/versions`, { body: { imageUrl: url, studio: { svgTemplate }, note: t('Template edit', 'تعديل من القالب') } });
        navigate(`/content/${contentId}`);
      } else {
        const item = await api<{ id: string }>('/api/content', {
          body: { title: title.slice(0, 300), channels, captions: Object.fromEntries(channels.map((c) => [c, captions[c] ?? ''])), creative: { requestId: 'svg-template', directionId: 'svg', imageUrl: url, model: 'svg-template', directionName: template.name.slice(0, 200), svgTemplate } },
        });
        void api(`/api/svg-templates/${template.id}/used`, { body: {} }).catch(() => {});
        if (send) await api(`/api/content/${item.id}/transition`, { body: { to: 'ready_for_review' } });
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
              <Button variant="primary" busy={busy === 'send'} disabled={Boolean(busy) || !channels.length} onClick={() => void save(true)}><Send size={15} /> {t('Send to marketing', 'أرسله إلى التسويق')}</Button>
              <Button variant="secondary" busy={busy === 'draft'} disabled={Boolean(busy) || !channels.length} onClick={() => void save(false)}><FileText size={15} /> {t('Save as draft', 'احفظه مسودة')}</Button>
            </>
          )}
          <Button variant="ghost" busy={busy === 'png'} disabled={Boolean(busy)} onClick={() => void download()}>PNG</Button>
        </div>
        {error && <p role="alert" className="creative-home__error">{error}</p>}
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
