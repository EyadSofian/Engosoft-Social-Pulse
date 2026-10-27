import { useLiveData } from '../../app/providers/LiveDataProvider';
import { useQueryState } from '../../app/router/router';
import { EmptyState } from '../../components/feedback/States';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { useI18n } from '../../i18n/I18nProvider';
import { LegacyCalendar } from '../../legacy/LegacyCalendar';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ContentCalendar } from './ContentCalendar';
import { useAuth } from '../../features/auth/AuthProvider';

type View = 'plan' | 'live';

export function CalendarPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [query, setQuery] = useQueryState();
  const { store } = useLiveData();
  usePageMeta(t('Calendar', 'التقويم'), [{ label: t('Calendar', 'التقويم') }]);
  const view: View = query.get('view') === 'live' && can('content.schedule') ? 'live' : 'plan';

  return (
    <div className="u-stack">
      <PageHeader title={t('Calendar', 'التقويم')} description={t('Every post by publishing day, with course dates and occasions beside it.', 'كل المنشورات حسب يوم النشر، ومعها مواعيد الدورات والمناسبات.')} />
      {can('content.schedule') && <Tabs
        label={t('Calendars', 'التقاويم')}
        value={view}
        onChange={(value) => setQuery({ view: value === 'plan' ? null : value })}
        items={[
          { value: 'plan', label: t('Content calendar', 'تقويم المحتوى') },
          { value: 'live', label: t('Publishing plans (import)', 'خطط النشر (استيراد)'), count: store.phase === 'ready' ? store.data.plans.length : undefined },
        ]}
      />}
      {view === 'live' ? (
        <>
          <p className="u-sm u-muted">{t('Plans saved to the server: drag to reschedule, import the XLSX template, export to CSV or ICS. Alerts fire before and after each post time. This calendar is Arabic-only until it is rebuilt.', 'خطط محفوظة على الخادم: اسحب لتغيير الموعد، ارفع قالب XLSX، صدّر CSV أو ICS. التنبيهات قبل وبعد موعد كل منشور. هذا التقويم بالعربية فقط حتى إعادة بنائه.')}</p>
          {store.phase === 'ready' ? <LegacyCalendar /> : <EmptyState title={store.phase === 'loading' ? t('Loading the calendar…', 'جارٍ تحميل التقويم…') : t('The calendar API is not reachable.', 'واجهة التقويم غير متاحة.')} text={store.staleError || undefined} action={store.phase === 'offline' ? <Button onClick={() => void store.reload()}>{t('Retry', 'أعد المحاولة')}</Button> : undefined} />}
        </>
      ) : (
        <ContentCalendar />
      )}
    </div>
  );
}
