import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, Download, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n/I18nProvider';
import { Button } from '../../components/ui/Button';
import { Link } from '../../app/router/router';
import { useAuth } from '../auth/AuthProvider';

interface Source { id: string; spreadsheet_id: string; tab: string; targets: Record<string, string>; enabled: number; last_sync_at: number | null; error: string | null; validationErrors: string[] }
interface Outcome { sourceId: string; postId: string; contentId: string; status: string; urls: string; errors: string }
interface State { connected: boolean; oauthConfigured: boolean; callbackUrl: string; sources: Source[]; rows: Outcome[]; accounts: { id: string; provider: string; name: string }[] }
const platforms = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'snapchat'];
const sourceUrl = 'https://docs.google.com/spreadsheets/d/1XoPiQAr-OMF7Z6rXyxfijUVd7SvpKSCqbB0UE7RD46M/edit';
const statuses: Record<string, [string, string]> = { draft: ['Draft', 'مسودة'], scheduled: ['Scheduled', 'مجدول'], publishing: ['Publishing / awaiting confirmation', 'جارٍ النشر / انتظار التأكيد'], published: ['Published', 'تم النشر'], partial: ['Partially published', 'نُشر على بعض المنصات'], failed: ['Failed', 'فشل'], blocked: ['Needs attention', 'يحتاج مراجعة'], cancelled: ['Cancelled', 'ملغي'] };

export function GoogleCalendarPanel({ onChange }: { onChange: () => void }) {
  const { can } = useAuth(), { t, date } = useI18n();
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(sourceUrl), [tab, setTab] = useState('Sheet1'), [tabs, setTabs] = useState<string[]>([]), [targets, setTargets] = useState<Record<string, string>>({}), [enabled, setEnabled] = useState(false), [selected, setSelected] = useState('');
  const hydrated = useRef(false), file = useRef<HTMLInputElement>(null);
  const allowed = can('connections.manage') && can('content.publish') && can('content.schedule');
  const reload = useCallback(async () => {
    const data = await api<State>('/api/google-calendar'); setState(data);
    if (!hydrated.current) {
      hydrated.current = true;
      const first = data.sources[0];
      if (first) { setSelected(first.id); setUrl(first.spreadsheet_id.startsWith('upload:') ? sourceUrl : `https://docs.google.com/spreadsheets/d/${first.spreadsheet_id}/edit`); setTab(first.tab); setTargets(first.targets); setEnabled(Boolean(first.enabled)); }
    }
  }, []);
  useEffect(() => {
    if (!allowed) return;
    void reload().catch(e => setError(e.message));
    const timer = setInterval(() => { void reload().catch(() => {}); }, 30_000);
    return () => clearInterval(timer);
  }, [allowed, reload]);
  if (!allowed) return null;
  const act = async (work: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await work(); await reload(); onChange(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const sync = async (id: string, recheck = false) => {
    const result = await api<{ errors: string[] }>(`/api/google-calendar/${id}/${recheck ? 'recheck' : 'sync'}`, { body: {} });
    setNotice(result.errors.length ? result.errors.join('\n') : t('Calendar checked; results are below and in the sheet.', 'اتراجع الكالندر؛ النتائج تحت وفي الشيت.'));
  };
  const pickSource = (id: string) => {
    setSelected(id); const s = state?.sources.find(s => s.id === id);
    if (s) { setTab(s.tab); setTargets(s.targets); setEnabled(Boolean(s.enabled)); if (!s.spreadsheet_id.startsWith('upload:')) setUrl(`https://docs.google.com/spreadsheets/d/${s.spreadsheet_id}/edit`); }
  };
  const upload = async (picked?: File) => {
    if (!picked) return;
    await act(async () => {
      const response = await fetch('/api/google-calendar/import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(picked.name), 'X-Targets': JSON.stringify(targets), 'X-Autopublish': String(enabled), 'X-Consent': 'true' }, body: picked });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Upload failed.');
      setSelected(data.id); await sync(data.id);
    });
    if (file.current) file.current.value = '';
  };
  const oauth = new URLSearchParams(window.location.search).get('google');
  return <details className="ui-card" open={oauth ? true : undefined}>
    <summary className="ui-card__head"><span className="u-row"><Cloud size={18} /><strong>{t('Publish from Google Sheets & Drive', 'النشر من Google Sheets وDrive')}</strong></span></summary>
    <div className="ui-card__body u-stack">
      <p className="u-sm">{t('One row per post: caption, Drive media, time and platforms. Ready = YES sends validated posts to the calendar and automatic queue. Results return to the sheet.', 'صف لكل بوست: النص وميديا الدرايف والميعاد والمنصات. Ready = YES يدخل البوست بعد التحقق للكـالندر وطابور النشر؛ والنتيجة ترجع للشيت.')}</p>
      {oauth && <p role="status">{oauth === 'connected' ? t('Google connected.', 'تم ربط Google.') : t('Google authorization was not completed. Enable Drive/Sheets APIs and check the callback URL.', 'تفويض Google لم يكتمل. تأكد من تفعيل Drive وSheets API ورابط العودة.')}</p>}
      <div className="u-row u-row--wrap">
        {state?.oauthConfigured && <a className="ui-btn ui-btn--secondary" href="/api/oauth/drive/start">{state.connected ? t('Reconnect Google', 'إعادة ربط Google') : t('Connect Google Drive & Sheets', 'اربط Google Drive وSheets')}</a>}
        <a className="ui-btn ui-btn--ghost" href="/templates/google-publishing-calendar.xlsx" download><Download size={15} />{t('Publishing template', 'قالب كالندر النشر')}</a>
        {state?.connected && <Button size="sm" disabled={busy} onClick={() => void act(async () => { await api('/api/google-calendar/disconnect', { body: {} }); setEnabled(false); setNotice(t('Google disconnected and pending automatic posts stopped.', 'اتوقف ربط Google والبوستات التلقائية المنتظرة.')); })}>{t('Disconnect Google', 'فصل Google')}</Button>}
      </div>
      {state && !state.connected && <div className="u-stack u-stack--xs"><p className="u-sm">{t('Server setup: Google OAuth client, Drive API and Sheets API. Add this exact authorized redirect URI in Google Cloud, then connect above:', 'إعداد الخادم: تطبيق Google OAuth مع تفعيل Drive API وSheets API. أضف رابط العودة ده في Google Cloud، ثم اضغط الربط:')}</p><code dir="ltr">{state.callbackUrl}</code>{!state.oauthConfigured && <p className="u-sm">{t('Google OAuth server credentials need configuration.', 'بيانات تطبيق Google OAuth محتاجة إعداد على الخادم.')}</p>}</div>}
      {state?.connected && <>
        {state.sources.length > 0 && <label className="ui-field"><span className="ui-field__label">{t('Connected calendars', 'الكالندرات المربوطة')}</span><select className="ui-input" value={selected} onChange={e => pickSource(e.target.value)}><option value="">{t('New sheet', 'شيت جديد')}</option>{state.sources.map(s => <option key={s.id} value={s.id}>{s.spreadsheet_id.startsWith('upload:') ? t('Uploaded calendar', 'الكالندر المرفوع') : s.tab} · {s.enabled ? t('Enabled', 'مفعّل') : t('Paused', 'متوقف')}</option>)}</select></label>}
        <label className="ui-field"><span className="ui-field__label">{t('Google Sheets URL', 'لينك Google Sheets')}</span><input className="ui-input" dir="ltr" value={url} onChange={e => { setUrl(e.target.value); setTabs([]); setSelected(''); }} /></label>
        <div className="u-row u-row--wrap"><Button size="sm" busy={busy} onClick={() => void act(async () => { const meta = await api<{ sheets: { properties: { title: string } }[] }>('/api/google-calendar/inspect', { body: { spreadsheetUrl: url } }); const names = meta.sheets.map(s => s.properties.title); setTabs(names); if (!names.includes(tab)) setTab(names[0]); })}>{t('Read sheet tabs', 'اقرأ تابات الشيت')}</Button><label className="ui-field"><span className="ui-field__label">{t('Calendar tab', 'تابة الكالندر')}</span>{tabs.length ? <select className="ui-input" value={tab} onChange={e => setTab(e.target.value)}>{tabs.map(name => <option key={name}>{name}</option>)}</select> : <input className="ui-input" dir="ltr" value={tab} onChange={e => setTab(e.target.value)} />}</label></div>
        <div className="u-stack u-stack--sm"><strong>{t('Choose the exact publishing accounts', 'اختار حساب النشر المقصود لكل منصة')}</strong>{platforms.map(provider => <label className="ui-field" key={provider}><span className="ui-field__label">{provider}</span><select className="ui-input" value={targets[provider] || ''} onChange={e => setTargets(previous => { const next = { ...previous }; if (e.target.value) next[provider] = e.target.value; else delete next[provider]; return next; })}><option value="">{t('Not selected — posts wait', 'غير محدد — المنشورات تنتظر')}</option>{state.accounts.filter(a => a.provider === provider).map(a => <option key={a.id} value={a.id}>{a.name} · {a.id}</option>)}</select></label>)}</div>
        <p className="u-xs">{t('TikTok needs privacy and AI/commercial choices; YouTube needs privacy, category and audience; Snapchat needs Story/Spotlight. X, WhatsApp and website are tracked for manual publishing.', 'تيك توك يحتاج اختيارات الخصوصية والذكاء الاصطناعي والمحتوى التجاري؛ يوتيوب يحتاج الخصوصية والتصنيف والجمهور؛ سناب يحتاج Story أو Spotlight. X وواتساب والموقع يُسجلوا للنشر اليدوي.')}</p>
        <label className="u-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> {t('Enable automatic posting for future rows marked Ready = YES to the accounts selected above.', 'تفعيل النشر التلقائي للصفوف ذات المواعيد المستقبلية وReady = YES على الحسابات المختارة فوق.')}</label>
        <div className="u-row u-row--wrap"><Button variant="primary" busy={busy} onClick={() => void act(async () => { const result = await api<{ id: string }>('/api/google-calendar', { body: { spreadsheetUrl: url, tab, targets, enabled, consent: true } }); setSelected(result.id); await sync(result.id); })}>{t('Save and check the sheet', 'احفظ وافحص الشيت')}</Button><input ref={file} hidden type="file" accept=".xlsx,.csv" onChange={e => void upload(e.target.files?.[0])} /><Button busy={busy} onClick={() => file.current?.click()}>{t('Upload a publishing calendar', 'ارفع كالندر للنشر')}</Button></div>
      </>}
      {state?.sources.map(s => <div className="u-stack u-stack--xs" key={s.id}><div className="u-row u-row--wrap"><strong>{s.tab}</strong><small>{t('Last checked', 'آخر مراجعة')}: {s.last_sync_at ? date(new Date(s.last_sync_at).toISOString(), 'dateTime') : '—'}</small><Button size="sm" icon={<RefreshCw size={14} />} busy={busy} onClick={() => void act(() => sync(s.id))}>{t('Check now', 'افحص الآن')}</Button><Button size="sm" disabled={busy} onClick={() => void act(() => sync(s.id, true))}>{t('Recheck blocked posts', 'راجع البوستات المتوقفة')}</Button>{Boolean(s.enabled) && <Button size="sm" disabled={busy} onClick={() => void act(async () => { await api(`/api/google-calendar/${s.id}/pause`, { body: {} }); if (selected === s.id) setEnabled(false); })}>{t('Pause automatic posting', 'إيقاف النشر التلقائي')}</Button>}</div>{s.error && <p role="alert" className="u-sm">{s.error}</p>}</div>)}
      {state && state.rows.length > 0 && <div className="ui-table-scroll"><table className="ui-table"><thead><tr><th>Post ID</th><th>{t('State', 'الحالة')}</th><th>{t('Details', 'التفاصيل')}</th><th>{t('Post', 'البوست')}</th></tr></thead><tbody>{state.rows.map(row => <tr key={`${row.sourceId}:${row.postId}`}><td dir="ltr">{row.postId}</td><td>{t(...(statuses[row.status] || [row.status, row.status]))}</td><td style={{ whiteSpace: 'pre-wrap' }}>{[row.urls, row.errors].filter(Boolean).join('\n') || '—'}</td><td><Link to={`/content/${row.contentId}`}>{t('Open', 'افتح')}</Link>{row.status === 'failed' && <Button size="sm" disabled={busy} onClick={() => void act(async () => { const result = await api<{ retried: number }>(`/api/google-calendar/${row.sourceId}/rows/${encodeURIComponent(row.postId)}/retry`, { body: {} }); setNotice(t(`${result.retried} failed publications queued again; completed posts are kept.`, `أُعيدت جدولة ${result.retried} محاولة فاشلة؛ المنشورات الناجحة محفوظة.`)); })}>{t('Retry failed only', 'أعد الفاشل فقط')}</Button>}</td></tr>)}</tbody></table></div>}
      {state?.sources.flatMap(s => s.validationErrors.map((message, i) => <p role="alert" className="u-sm" key={`${s.id}:${i}`}>{s.tab}: {message}</p>))}
      {notice && <p role="status" className="u-sm" style={{ whiteSpace: 'pre-wrap' }}>{notice}</p>}
      {error && <p role="alert" className="u-sm">{error}</p>}
    </div>
  </details>;
}
