import { ArrowRight, FileSpreadsheet, Send } from 'lucide-react';
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
  usePageMeta(t('Calendar', 'التقويم'), [{ label: t('Calendar', 'التقويم') }]);
  const plans = query.get('view') === 'live' && can('content.schedule');

  return (
    <div className="u-stack">
      <PageHeader
        title={plans ? t('Spreadsheet plans', 'خطط الجداول') : t('Calendar', 'التقويم')}
        description={plans
          ? t('Import the XLSX template, export to CSV or ICS, and drag plans to a new time. Alerts fire before and after each post time. This view is Arabic-only.', 'ارفع قالب XLSX، صدّر CSV أو ICS، واسحب الخطة لموعد جديد. التنبيهات قبل وبعد موعد كل منشور. هذا العرض بالعربية فقط.')
          : t('Every post by publishing day. Press + on a day to schedule an approved post there.', 'كل المنشورات حسب يوم النشر. اضغط + على أي يوم لجدولة منشور معتمد فيه.')}
        actions={plans
          ? <Button icon={<ArrowRight size={15} className="u-flip" />} onClick={() => setQuery({ view: null })}>{t('Back to the calendar', 'العودة للتقويم')}</Button>
          : <>
            {can('content.schedule') && <Button variant="ghost" icon={<FileSpreadsheet size={15} />} onClick={() => setQuery({ view: 'live' })}>{t('Import / export plans', 'استيراد وتصدير الخطط')}</Button>}
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
