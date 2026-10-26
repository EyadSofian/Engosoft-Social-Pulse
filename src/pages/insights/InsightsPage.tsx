import type { ReactNode } from 'react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { EmptyState } from '../../components/feedback/States';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { LegacyContent, LegacyInsights, LegacyOverview } from '../../legacy/LegacyCalendar';
import { usePageMeta } from '../../shell/ShellContext';

/** Platform tracking pages from the original dashboard, on the posts the sync observed on every page and account. */
function TrackingPage({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const { store } = useLiveData();
  usePageMeta(title, [{ label: title }]);
  if (store.phase !== 'ready')
    return (
      <EmptyState
        title={store.phase === 'loading' ? t('Loading platform data…', 'جارٍ تحميل بيانات المنصات…') : t('The platform data API is not reachable.', 'واجهة بيانات المنصات غير متاحة.')}
        text={store.staleError || undefined}
        action={store.phase === 'offline' ? <Button onClick={() => void store.reload()}>{t('Retry', 'أعد المحاولة')}</Button> : undefined}
      />
    );
  return <>{children}</>;
}

export function InsightsPage() {
  const { t } = useI18n();
  return <TrackingPage title={t('Analytics', 'التحليلات')}><LegacyInsights /></TrackingPage>;
}
export function ContentTrackingPage() {
  const { t } = useI18n();
  return <TrackingPage title={t('Content performance', 'أداء المحتوى')}><LegacyContent /></TrackingPage>;
}
export function OverviewPage() {
  const { t } = useI18n();
  return <TrackingPage title={t('Overview', 'نظرة عامة')}><LegacyOverview /></TrackingPage>;
}
