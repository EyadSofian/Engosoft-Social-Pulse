import type { ReactNode } from 'react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { EmptyState } from '../../components/feedback/States';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { LegacyContent, LegacyInsights, LegacyOverview } from '../../legacy/LegacyCalendar';

/** Platform tracking views from the original dashboard, on the posts the sync observed on every page and account. Shown as sections of Analytics. */
function TrackingPage({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { store } = useLiveData();
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

export const InsightsPage = () => <TrackingPage><LegacyInsights /></TrackingPage>;
export const ContentTrackingPage = () => <TrackingPage><LegacyContent /></TrackingPage>;
export const PlatformsPage = () => <TrackingPage><LegacyOverview /></TrackingPage>;
