import { useRef, useState } from 'react';
import { ArrowRight, Cloud, Download, FileSpreadsheet, MoreHorizontal, Plus, Send, Upload } from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { useQueryState, useRouter } from '../../app/router/router';
import { EmptyState } from '../../components/feedback/States';
import { Drawer } from '../../components/overlay/Overlay';
import { Button } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { useI18n } from '../../i18n/I18nProvider';
import { LegacyCalendar } from '../../legacy/LegacyCalendar';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { PostCalendar } from './PostCalendar';
import { useAuth } from '../../features/auth/AuthProvider';
import { useCreateContent } from '../../features/content/CreateContent';
import { GoogleCalendarPanel } from '../../features/publishing/GoogleCalendarPanel';
import { CalendarPostHost, useCalendarBoard } from '../../features/publishing/CalendarPosts';

/**
 * The publishing calendar, built to stay simple: one header with one main action, one toolbar, and the posts on
 * their days. Google Sheets and the spreadsheet plan tools sit behind a button and a menu instead of stacking above it.
 */
export function CalendarPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const { navigate } = useRouter();
  const create = useCreateContent();
  const [query, setQuery] = useQueryState();
  const { store } = useLiveData();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const calendar = useCalendarBoard();
  usePageMeta(t('Calendar', 'التقويم'), [{ label: t('Calendar', 'التقويم') }]);
  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    setUploading(true);
    try {
      const result = await store.importCalendar(picked);
      if (result.imported) toast.success(t(`${result.imported} plan rows added`, `خانات أُضيفت للخطة: ${result.imported}`), result.duplicates ? t(`${result.duplicates} were already in the plan.`, `كانت موجودة بالفعل: ${result.duplicates}`) : undefined);
      else toast.info(t('Nothing new in the file', 'لا جديد في الملف'), result.duplicates ? t(`${result.duplicates} rows were already in the plan.`, `كانت موجودة بالفعل: ${result.duplicates}`) : undefined);
      if (result.errors.length) toast.error(t(`${result.errors.length} rows were skipped`, `أسطر لم تُقرأ: ${result.errors.length}`), result.errors.slice(0, 3).join(' · '));
    } catch (error) { toast.error(t('The plan could not be read', 'تعذّر قراءة الخطة'), error instanceof Error ? error.message : String(error)); }
    if (file.current) file.current.value = '';
    setUploading(false);
  };
  const plans = query.get('view') === 'live' && can('content.schedule');
  const refresh = () => { void store.reload(); void calendar.reload(); };
  const newPost = () => (calendar.allowed ? setQuery({ calendarPost: 'new' }) : create.open());
  const sheets = can('connections.manage') && can('content.publish') && can('content.schedule');

  return (
    <div className="u-stack">
      <PageHeader
        title={plans ? t('Spreadsheet plans', 'خطط الجداول') : t('Calendar', 'التقويم')}
        description={plans
          ? t('Import the XLSX template, export to CSV or ICS, and drag plans to a new time. Alerts fire before and after each post time. This view is Arabic-only.', 'ارفع قالب XLSX، صدّر CSV أو ICS، واسحب الخطة لموعد جديد. التنبيهات قبل وبعد موعد كل منشور. هذا العرض بالعربية فقط.')
          : t('Every post on its day. Drag a post to move it, or use + on a day to add one.', 'كل منشور في يومه. اسحب المنشور علشان تنقله، أو دوس + على أي يوم تضيف فيه.')}
        actions={plans
          ? <Button icon={<ArrowRight size={15} className="u-flip" />} onClick={() => setQuery({ view: null })}>{t('Back to the calendar', 'العودة للتقويم')}</Button>
          : <>
            {sheets && <Button variant="ghost" icon={<Cloud size={15} />} onClick={() => setSheetsOpen(true)}>{t('Google Sheets', 'Google Sheets')}</Button>}
            {can('content.schedule') && <>
              <input ref={file} hidden type="file" accept=".xlsx,.csv" onChange={(event) => void upload(event.target.files?.[0])} />
              <Menu label={t('More', 'المزيد')} trigger={(props) => <Button {...props} variant="ghost" busy={uploading} icon={<MoreHorizontal size={16} />}>{t('More', 'المزيد')}</Button>} items={[
                { key: 'import', label: t('Import a plan (XLSX/CSV)', 'استيراد خطة (XLSX/CSV)'), icon: <Upload size={15} />, onSelect: () => file.current?.click() },
                { key: 'template', label: t('Download the plan template', 'نزّل نموذج الخطة'), icon: <Download size={15} />, onSelect: downloadTemplate },
                { key: 'sheet', label: t('Spreadsheet view', 'عرض الجداول'), icon: <FileSpreadsheet size={15} />, onSelect: () => setQuery({ view: 'live' }) },
                ...(can('content.publish') ? [{ key: 'publish', label: t('Publishing page', 'صفحة النشر'), icon: <Send size={15} />, onSelect: () => navigate('/publish') }] : []),
              ]} />
            </>}
            {can('content.create') && <Button variant="primary" icon={<Plus size={16} />} onClick={newPost}>{t('New post', 'منشور جديد')}</Button>}
          </>}
      />
      {calendar.error && <p role="alert" className="creative-home__error">{calendar.error}</p>}
      {plans ? (
        store.phase === 'ready' ? <LegacyCalendar /> : <EmptyState title={store.phase === 'loading' ? t('Loading the calendar…', 'جارٍ تحميل التقويم…') : t('The calendar API is not reachable.', 'واجهة التقويم غير متاحة.')} text={store.staleError || undefined} action={store.phase === 'offline' ? <Button onClick={() => void store.reload()}>{t('Retry', 'أعد المحاولة')}</Button> : undefined} />
      ) : <PostCalendar board={calendar.board} nativeAllowed={calendar.allowed} onChanged={refresh} />}
      {calendar.allowed && <CalendarPostHost board={calendar.board} onChange={refresh} />}
      {sheets && <Drawer open={sheetsOpen} onClose={() => setSheetsOpen(false)} title={t('Publish from Google Sheets & Drive', 'النشر من Google Sheets وDrive')} label="Google Sheets" width="lg">
        <GoogleCalendarPanel onChange={refresh} />
      </Drawer>}
    </div>
  );
}

/** The Excel template: a Calendar sheet with dropdowns for platform and goal, and an instructions sheet. */
function downloadTemplate() {
  const link = Object.assign(document.createElement('a'), { href: '/templates/mobde3-plan-template.xlsx', download: 'mobde3-plan-template.xlsx' });
  link.click();
}
