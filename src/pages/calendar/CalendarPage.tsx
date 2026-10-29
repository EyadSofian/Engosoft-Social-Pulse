import { useRef, useState } from 'react';
import { ArrowRight, Download, FileSpreadsheet, Send, Upload } from 'lucide-react';
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

  return (
    <div className="u-stack">
      <PageHeader
        title={plans ? t('Spreadsheet plans', 'خطط الجداول') : t('Calendar', 'التقويم')}
        description={plans
          ? t('Import the XLSX template, export to CSV or ICS, and drag plans to a new time. Alerts fire before and after each post time. This view is Arabic-only.', 'ارفع قالب XLSX، صدّر CSV أو ICS، واسحب الخطة لموعد جديد. التنبيهات قبل وبعد موعد كل منشور. هذا العرض بالعربية فقط.')
          : t('The month’s plan and every post on its day. Upload the plan, turn each planned row into a post, then schedule approved posts with + on any day.', 'خطة الشهر وكل منشور في يومه. ارفع الخطة، حوّل كل سطر مخطط لمنشور، ثم جدول المنشورات المعتمدة بزر + على أي يوم.')}
        actions={plans
          ? <Button icon={<ArrowRight size={15} className="u-flip" />} onClick={() => setQuery({ view: null })}>{t('Back to the calendar', 'العودة للتقويم')}</Button>
          : <>
            {can('content.schedule') && <>
              <input ref={file} hidden type="file" accept=".xlsx,.csv" onChange={(event) => void upload(event.target.files?.[0])} />
              <Button variant="primary" icon={<Upload size={15} />} busy={uploading} onClick={() => file.current?.click()}>{t('Upload a plan', 'ارفع خطة')}</Button>
              <Button variant="ghost" icon={<Download size={15} />} onClick={downloadTemplate}>{t('Plan template', 'نموذج الخطة')}</Button>
              <Button variant="ghost" icon={<FileSpreadsheet size={15} />} onClick={() => setQuery({ view: 'live' })}>{t('Spreadsheet view', 'عرض الجداول')}</Button>
            </>}
            {(can('content.publish') || can('content.schedule')) && <ButtonLink to="/publish" icon={<Send size={15} />}>{t('Publishing', 'النشر')}</ButtonLink>}
          </>}
      />
      {plans ? (
        store.phase === 'ready' ? <LegacyCalendar /> : <EmptyState title={store.phase === 'loading' ? t('Loading the calendar…', 'جارٍ تحميل التقويم…') : t('The calendar API is not reachable.', 'واجهة التقويم غير متاحة.')} text={store.staleError || undefined} action={store.phase === 'offline' ? <Button onClick={() => void store.reload()}>{t('Retry', 'أعد المحاولة')}</Button> : undefined} />
      ) : (
        <ContentCalendar />
      )}
    </div>
  );
}

/** The Excel template: a Calendar sheet with dropdowns for platform and goal, and an instructions sheet. */
function downloadTemplate() {
  const link = Object.assign(document.createElement('a'), { href: '/templates/mobde3-plan-template.xlsx', download: 'mobde3-plan-template.xlsx' });
  link.click();
}
