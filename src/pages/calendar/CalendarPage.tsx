import { useRef, useState } from 'react';
import { ArrowRight, Download, FileSpreadsheet, Plus, Send, Upload } from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { useQueryState } from '../../app/router/router';
import { EmptyState } from '../../components/feedback/States';
import { Button, ButtonLink } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { LegacyCalendar } from '../../legacy/LegacyCalendar';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ContentCalendar } from './ContentCalendar';
import { useAuth } from '../../features/auth/AuthProvider';
import { GoogleCalendarPanel } from '../../features/publishing/GoogleCalendarPanel';
import { CalendarPosts } from '../../features/publishing/CalendarPosts';

/**
 * One calendar for every post. Approved posts are scheduled straight onto a day, and Facebook / Instagram
 * publish themselves at that time. The spreadsheet plans (import, export, alerts) open as a secondary view.
 */
export function CalendarPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [query, setQuery] = useQueryState();
  const { store } = useLiveData();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
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
  const native = ['connections.manage','content.create','content.edit_own','content.schedule','content.publish'].every(p => can(p as never));
  const [calendarRevision, setCalendarRevision] = useState(0);
  const refresh = () => { void store.reload(); setCalendarRevision(value => value + 1); };

  return (
    <div className="u-stack">
      <PageHeader
        title={plans ? t('Spreadsheet plans', 'خطط الجداول') : t('Calendar', 'التقويم')}
        description={plans
          ? t('Import the XLSX template, export to CSV or ICS, and drag plans to a new time. Alerts fire before and after each post time. This view is Arabic-only.', 'ارفع قالب XLSX، صدّر CSV أو ICS، واسحب الخطة لموعد جديد. التنبيهات قبل وبعد موعد كل منشور. هذا العرض بالعربية فقط.')
          : t('Create, plan and publish. Your content, accounts and results in one calendar.', 'جهّز المحتوى، اختار المنصات وحدد الميعاد. كل منشوراتك ونتايجها في كالندر واحد.')}
        actions={plans
          ? <Button icon={<ArrowRight size={15} className="u-flip" />} onClick={() => setQuery({ view: null })}>{t('Back to the calendar', 'العودة للتقويم')}</Button>
          : <>
            {native && <Button variant="primary" icon={<Plus size={16}/>} onClick={() => setQuery({calendarPost:'new'})}>{t('Add calendar post','أضف منشور للكـالندر')}</Button>}
            {can('content.schedule') && <>
              <input ref={file} hidden type="file" accept=".xlsx,.csv" onChange={(event) => void upload(event.target.files?.[0])} />
              <Button variant="ghost" icon={<Upload size={15} />} busy={uploading} onClick={() => file.current?.click()}>{t('Import a plan', 'استيراد خطة')}</Button>
              <Button variant="ghost" icon={<Download size={15} />} onClick={downloadTemplate}>{t('Plan template', 'نموذج الخطة')}</Button>
              <Button variant="ghost" icon={<FileSpreadsheet size={15} />} onClick={() => setQuery({ view: 'live' })}>{t('Spreadsheet view', 'عرض الجداول')}</Button>
            </>}
            {(can('content.publish') || can('content.schedule')) && <ButtonLink to="/publish" icon={<Send size={15} />}>{t('Publishing', 'النشر')}</ButtonLink>}
          </>}
      />
      {!plans && <CalendarPosts onChange={refresh}/>}
      <GoogleCalendarPanel onChange={refresh} />
      {plans ? (
        store.phase === 'ready' ? <LegacyCalendar /> : <EmptyState title={store.phase === 'loading' ? t('Loading the calendar…', 'جارٍ تحميل التقويم…') : t('The calendar API is not reachable.', 'واجهة التقويم غير متاحة.')} text={store.staleError || undefined} action={store.phase === 'offline' ? <Button onClick={() => void store.reload()}>{t('Retry', 'أعد المحاولة')}</Button> : undefined} />
      ) : query.get('view') !== 'publishing' ? (
        <ContentCalendar key={calendarRevision}/>
      ) : (
        null
      )}
    </div>
  );
}

/** The Excel template: a Calendar sheet with dropdowns for platform and goal, and an instructions sheet. */
function downloadTemplate() {
  const link = Object.assign(document.createElement('a'), { href: '/templates/mobde3-plan-template.xlsx', download: 'mobde3-plan-template.xlsx' });
  link.click();
}
