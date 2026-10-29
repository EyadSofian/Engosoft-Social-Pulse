import { useQueryState } from '../../app/router/router';
import { Tabs } from '../../components/ui/Tabs';
import { useI18n } from '../../i18n/I18nProvider';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ContentTrackingPage, InsightsPage, PlatformsPage } from '../insights/InsightsPage';
import { AnalyticsPage } from './AnalyticsPage';
import { YouTubeInsights } from './YouTubeInsights';

type Section = 'platforms' | 'youtube' | 'posts' | 'insights' | 'team';
const SECTIONS: Section[] = ['platforms', 'youtube', 'posts', 'insights', 'team'];

/** Every results view under one tab: platform totals, each published post, month-on-month analysis and team delivery. */
export function AnalyticsHub({ initial = 'platforms' }: { initial?: Section }) {
  const { t } = useI18n();
  const [query, setQuery] = useQueryState();
  const requested = query.get('section') as Section | null;
  const section = requested && SECTIONS.includes(requested) ? requested : initial;
  usePageMeta(t('Analytics', 'التحليلات'), [{ label: t('Analytics', 'التحليلات') }]);
  return (
    <div className="u-stack">
      <PageHeader title={t('Analytics', 'التحليلات')} description={t('What was published and how it performed, from the connected pages and accounts.', 'ما نُشر وكيف كان أداؤه، من الصفحات والحسابات المربوطة.')} />
      <Tabs
        label={t('Analytics', 'التحليلات')}
        value={section}
        onChange={(value) => setQuery({ section: value === 'platforms' ? null : value, tab: null })}
        items={[
          { value: 'platforms', label: t('Platforms', 'المنصات') },
          { value: 'youtube', label: t('YouTube', 'يوتيوب') },
          { value: 'posts', label: t('Published posts', 'المنشورات المنشورة') },
          { value: 'insights', label: t('Monthly analysis', 'التحليل الشهري') },
          { value: 'team', label: t('Team performance', 'أداء الفريق') },
        ]}
      />
      {section === 'platforms' && <PlatformsPage />}
      {section === 'youtube' && <YouTubeInsights />}
      {section === 'posts' && <ContentTrackingPage />}
      {section === 'insights' && <InsightsPage />}
      {section === 'team' && <AnalyticsPage embedded />}
    </div>
  );
}
