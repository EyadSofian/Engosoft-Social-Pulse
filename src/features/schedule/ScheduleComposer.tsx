import { useRef, useState } from 'react';
import { CalendarRange, Download, FileSpreadsheet, Plus, RefreshCw, Send, Trash2, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage, request } from '../../lib/api';
import { useRouter } from '../../app/router/router';
import { takePostPlan } from '../content/postPlan';

/**
 * The monthly course schedule post ("جدول مواعيد دوراتنا خلال شهر …"): rows from the operations sheet (CSV/XLSX)
 * or Odoo, reviewed here, drawn by the server in the approved design for each Facebook/Instagram size and split
 * over as many posts as the month needs. No AI cost.
 */
export interface ScheduleRow { course: string; date: string; time: string; mode: 'online' | 'offline'; city: string }
type Format = 'feed' | 'square' | 'story';
type Pages = Partial<Record<Format, string[]>>;
const FORMATS: { value: Format; en: string; ar: string; size: string; platforms: string }[] = [
  { value: 'feed', en: 'Feed 4:5', ar: 'فيد 4:5', size: '1080×1350', platforms: 'Facebook · Instagram' },
  { value: 'square', en: 'Square 1:1', ar: 'مربع 1:1', size: '1080×1080', platforms: 'Facebook · Instagram' },
  { value: 'story', en: 'Story 9:16', ar: 'ستوري 9:16', size: '1080×1920', platforms: 'Stories · WhatsApp' },
];
const CHANNELS = ['facebook', 'instagram'] as const;
const DEFAULT_TITLE = 'جدول مواعيد دوراتنا خلال';
const nextMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const blank = (): ScheduleRow => ({ course: '', date: '', time: '19:00', mode: 'online', city: '' });

export function ScheduleComposer({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [highlight, setHighlight] = useState('');
  const [defaultCity, setDefaultCity] = useState('Riyadh');
  const [formats, setFormats] = useState<Format[]>(['feed', 'square']);
  const [month, setMonth] = useState(nextMonth);
  const [pages, setPages] = useState<Pages | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'file' | 'odoo' | 'render' | 'post'>('');
  const [postTitle, setPostTitle] = useState('');

  const loaded = (result: { rows: ScheduleRow[]; errors: string[]; highlight: string }) => {
    setRows(result.rows); setProblems(result.errors); setPages(null);
    if (result.highlight) { setHighlight(result.highlight); setPostTitle(`جدول مواعيد ${result.highlight}`); }
  };
  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    setBusy('file'); setError('');
    try {
      loaded(await request<{ rows: ScheduleRow[]; errors: string[]; highlight: string }>('/schedule/parse', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(picked.name) }, body: picked }));
    } catch (reason) {
      setError(errorMessage(reason, t('The file could not be read.', 'تعذّر قراءة الملف.')));
      const details = (reason as { details?: { errors?: string[] } }).details;
      if (details?.errors) setProblems(details.errors);
    }
    if (file.current) file.current.value = '';
    setBusy('');
  };
  const fromOdoo = async () => {
    setBusy('odoo'); setError('');
    try { loaded(await api(`/api/schedule/odoo?month=${month}`)); }
    catch (reason) { setError(errorMessage(reason, t('Odoo could not be read.', 'تعذّر قراءة Odoo.'))); }
    setBusy('');
  };
  const edit = (index: number, patch: Partial<ScheduleRow>) => { setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row))); setPages(null); };
  const ready = rows.filter((row) => row.course.trim() && row.date && row.time);
  const render = async () => {
    if (!ready.length) { setError(t('Add at least one course with a name, date and time.', 'أضف دورة واحدة على الأقل باسمها وتاريخها ووقتها.')); return; }
    if (!formats.length) { setError(t('Choose at least one size.', 'اختر مقاسًا واحدًا على الأقل.')); return; }
    setBusy('render'); setError('');
    try { setPages((await api<{ pages: Pages }>('/api/schedule/render', { body: { rows: ready, formats, title, highlight, defaultCity } })).pages); }
    catch (reason) { setError(errorMessage(reason, t('The schedule could not be drawn.', 'تعذّر رسم الجدول.'))); }
    setBusy('');
  };
  const createPost = async () => {
    if (!pages) return;
    const first = pages.feed?.[0] ?? pages.square?.[0] ?? pages.story?.[0];
    if (!first) return;
    setBusy('post'); setError('');
    // Page 1 of each size is also registered as that platform size, so the size panel and publishing pick it up.
    const sizes: Record<string, string> = {};
    if (pages.feed?.[0]) Object.assign(sizes, { 'facebook-feed': pages.feed[0], 'instagram-feed': pages.feed[0] });
    if (pages.square?.[0]) Object.assign(sizes, { 'facebook-square': pages.square[0], 'instagram-square': pages.square[0] });
    if (pages.story?.[0]) Object.assign(sizes, { 'facebook-story': pages.story[0], 'instagram-story': pages.story[0] });
    try {
      const item = await api<{ id: string }>('/api/content', { body: {
        ...takePostPlan(), title: postTitle.trim() || `${title} ${highlight}`.trim(), channels: [...CHANNELS], captions: {},
        creative: { requestId: 'schedule', directionId: 'schedule', imageUrl: first, directionName: t('Course schedule', 'جدول مواعيد الدورات'), sizes, pages, schedule: { title, highlight, defaultCity, rows: ready } },
      } });
      navigate(`/content/${item.id}`);
    } catch (reason) { setError(errorMessage(reason, t('The post could not be created.', 'تعذّر إنشاء المنشور.'))); }
    setBusy('');
  };
  const pageCount = (list?: string[]) => list?.length ?? 0;

  return <section className="schedule glass">
    <header className="schedule__head">
      <div><h2><CalendarRange size={20} /> {t('Course schedule', 'جدول مواعيد الدورات')}</h2>
        <p className="u-sm u-muted">{t('Upload the month sheet (or read it from Odoo), check the rows, and get every post in the approved design for Facebook and Instagram. Long months are split over several posts automatically.', 'ارفع شيت الشهر (أو اقرأه من Odoo)، راجع الصفوف، وخد كل البوستات بالتصميم المعتمد لفيسبوك وإنستجرام. الشهر الطويل بيتقسم على أكتر من بوست تلقائيًا.')}</p></div>
      <Button variant="ghost" size="sm" onClick={onClose}>{t('Back to templates', 'رجوع للقوالب')}</Button>
    </header>

    <div className="schedule__sources">
      <input ref={file} hidden type="file" accept=".csv,.xlsx" onChange={(event) => void upload(event.target.files?.[0])} />
      <Button variant="primary" icon={<Upload size={15} />} busy={busy === 'file'} onClick={() => file.current?.click()}>{t('Upload CSV or Excel', 'ارفع CSV أو Excel')}</Button>
      <a className="ui-btn ui-btn--ghost ui-btn--md" href="/templates/course-schedule-template.xlsx" download><FileSpreadsheet size={15} /> {t('Excel template', 'قالب Excel')}</a>
      <a className="ui-btn ui-btn--ghost ui-btn--md" href="/templates/course-schedule-template.csv" download><Download size={15} /> {t('CSV template', 'قالب CSV')}</a>
      <span className="schedule__odoo">
        <input className="ui-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('Month', 'الشهر')} />
        <Button variant="secondary" icon={<RefreshCw size={15} />} busy={busy === 'odoo'} onClick={() => void fromOdoo()}>{t('Read from Odoo', 'اقرأ من Odoo')}</Button>
      </span>
    </div>
    <p className="u-xs u-muted">{t('Columns: Course Name, Type (Online/Offline), Start Date, Start Time KSA, City (optional). Arabic headers work too.', 'الأعمدة: Course Name، Type (Online/Offline)، Start Date، Start Time KSA، City (اختياري). العناوين بالعربي بتشتغل كمان.')}</p>
    {problems.length > 0 && <ul className="schedule__problems" role="alert">{problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}{problems.length > 8 && <li>{t(`…and ${problems.length - 8} more`, `…و${problems.length - 8} غيرهم`)}</li>}</ul>}

    <div className="schedule__titles">
      <label className="ui-field"><span className="ui-field__label">{t('Headline', 'العنوان')}</span><input className="ui-input" dir="auto" value={title} onChange={(e) => { setTitle(e.target.value); setPages(null); }} /></label>
      <label className="ui-field"><span className="ui-field__label">{t('Green highlight', 'الشريط الأخضر')}</span><input className="ui-input" dir="auto" value={highlight} placeholder="شهر نوفمبر" onChange={(e) => { setHighlight(e.target.value); setPages(null); }} /></label>
      <label className="ui-field"><span className="ui-field__label">{t('City for in-person rows', 'مدينة الحضوري الافتراضية')}</span><input className="ui-input" dir="auto" value={defaultCity} onChange={(e) => { setDefaultCity(e.target.value); setPages(null); }} /><span className="ui-field__hint">{t('Shown under Offline when a row has no city.', 'بتظهر تحت Offline لو الصف من غير مدينة.')}</span></label>
    </div>

    <div className="schedule__table-wrap">
      <table className="schedule__table">
        <thead><tr><th>{t('Course', 'الدورة')}</th><th>{t('Date', 'التاريخ')}</th><th>{t('Time (KSA)', 'الوقت (السعودية)')}</th><th>{t('Type', 'النوع')}</th><th>{t('City', 'المدينة')}</th><th /></tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>
          <td><input className="ui-input" dir="ltr" value={row.course} onChange={(e) => edit(i, { course: e.target.value })} /></td>
          <td><input className="ui-input" type="date" value={row.date} onChange={(e) => edit(i, { date: e.target.value })} /></td>
          <td><input className="ui-input" type="time" value={row.time} onChange={(e) => edit(i, { time: e.target.value })} /></td>
          <td><select className="ui-input" value={row.mode} onChange={(e) => edit(i, { mode: e.target.value as ScheduleRow['mode'] })}><option value="online">Online</option><option value="offline">Offline</option></select></td>
          <td><input className="ui-input" dir="ltr" value={row.city} disabled={row.mode === 'online'} placeholder={row.mode === 'offline' ? defaultCity : ''} onChange={(e) => edit(i, { city: e.target.value })} /></td>
          <td><button type="button" className="schedule__remove" aria-label={t('Remove row', 'احذف الصف')} onClick={() => { setRows((list) => list.filter((_, j) => j !== i)); setPages(null); }}><Trash2 size={15} /></button></td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="u-sm u-muted schedule__empty">{t('No rows yet: upload the sheet, read Odoo, or add rows by hand.', 'لسه مفيش صفوف: ارفع الشيت أو اقرأ من Odoo أو أضف صفوف بإيدك.')}</p>}
      <Button variant="ghost" size="sm" icon={<Plus size={15} />} onClick={() => { setRows((list) => [...list, blank()]); setPages(null); }}>{t('Add a row', 'أضف صف')}</Button>
    </div>

    <div className="schedule__sizes" role="group" aria-label={t('Sizes', 'المقاسات')}>
      {FORMATS.map((f) => <button key={f.value} type="button" aria-pressed={formats.includes(f.value)} onClick={() => { setFormats((list) => (list.includes(f.value) ? list.filter((v) => v !== f.value) : [...list, f.value])); setPages(null); }}>
        <span className="schedule__shape" data-format={f.value} /><b>{t(f.en, f.ar)}</b><small dir="ltr">{f.size}</small><small>{f.platforms}</small>
      </button>)}
    </div>

    {error && <p role="alert" className="creative-home__error">{error}</p>}
    <div className="u-row"><Button variant="primary" busy={busy === 'render'} onClick={() => void render()}>{pages ? t('Draw again', 'ارسم تاني') : t(`Preview the posts (${ready.length} courses)`, `اعرض البوستات (${ready.length} دورة)`)}</Button></div>

    {pages && <div className="schedule__pages">
      {FORMATS.filter((f) => pageCount(pages[f.value])).map((f) => <div key={f.value}>
        <h3>{t(f.en, f.ar)} <small dir="ltr">{f.size}</small> · {t(`${pageCount(pages[f.value])} posts`, `${pageCount(pages[f.value])} بوست`)}</h3>
        <div className="schedule__strip">{pages[f.value]!.map((url, i) => <figure key={url}><a href={url} target="_blank" rel="noreferrer"><img src={url} alt={t(`Page ${i + 1}`, `صفحة ${i + 1}`)} data-format={f.value} /></a><figcaption><span>{t(`Page ${i + 1}`, `صفحة ${i + 1}`)}</span><a href={url} download={`engosoft-schedule-${f.value}-${i + 1}.png`}><Download size={13} /> PNG</a></figcaption></figure>)}</div>
      </div>)}
      <div className="schedule__post">
        <label className="ui-field"><span className="ui-field__label">{t('Post title', 'عنوان المنشور')}</span><input className="ui-input" dir="auto" value={postTitle} onChange={(e) => setPostTitle(e.target.value)} /></label>
        <span className="schedule__channels">{CHANNELS.map((c) => <ChannelIcon key={c} channel={c} size={16} />)}</span>
        <Button variant="primary" icon={<Send size={15} />} busy={busy === 'post'} onClick={() => void createPost()}>{t('Create the post', 'أنشئ المنشور')}</Button>
      </div>
      <p className="u-xs u-muted">{t('One post holds every page: publish it as a carousel, or each page on its own. It is saved as a draft for approval.', 'المنشور الواحد فيه كل الصفحات: انشره كاروسيل أو كل صفحة لوحدها. بيتحفظ كمسودة للاعتماد.')}</p>
    </div>}
  </section>;
}
