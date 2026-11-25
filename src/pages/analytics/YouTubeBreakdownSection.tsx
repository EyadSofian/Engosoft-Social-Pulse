import { useEffect, useState } from 'react';
import { EmptyState } from '../../components/feedback/States';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Tabs';
import type { YouTubeActivityTotals, YouTubeAnalyticsPeriod, YouTubeBreakdownRow, YouTubeBreakdowns, YouTubeChannelMetrics } from '../../domain/youtube-analytics';
import { useI18n } from '../../i18n/I18nProvider';
import { request } from '../../lib/api';
import { dateFromKey } from '../../lib/format';
import { sliceLabel } from './audience';

const TABS = ['audience', 'devices', 'traffic', 'compare'] as const;
type Tab = typeof TABS[number];
const dimensions: Record<string, [string, string]> = {
  MOBILE: ['Mobile phone', 'موبايل'], DESKTOP: ['Computer', 'كمبيوتر'], TV: ['TV', 'تلفزيون'], TABLET: ['Tablet', 'تابلت'],
  GAME_CONSOLE: ['Game console', 'جهاز ألعاب'], ANDROID: ['Android', 'أندرويد'], IOS: ['iOS', 'آيفون'],
  SUBSCRIBED: ['Subscribed', 'مشتركين'], UNSUBSCRIBED: ['Not subscribed', 'غير مشتركين'],
  ADVERTISING: ['YouTube advertising', 'إعلانات يوتيوب'], YT_SEARCH: ['YouTube search', 'بحث يوتيوب'],
  SUBSCRIBER: ['Browse features', 'ميزات التصفح'], PLAYLIST: ['Playlists', 'قوائم التشغيل'],
  EXT_URL: ['External', 'مصادر خارج يوتيوب'], YT_CHANNEL: ['Channel pages', 'صفحات القنوات'],
  NO_LINK_OTHER: ['Direct or unknown', 'مباشر أو غير معروف'], RELATED_VIDEO: ['Suggested videos', 'فيديوهات مقترحة'],
  SHORTS: ['Shorts feed', 'خلاصة Shorts'], YT_OTHER_PAGE: ['Other YouTube features', 'ميزات يوتيوب الأخرى'],
  NOTIFICATION: ['Notifications', 'الإشعارات'], END_SCREEN: ['End screens', 'شاشات النهاية'],
  SHORTS_CONTENT_LINKS: ['Shorts links', 'روابط Shorts'], ANNOTATION: ['Annotations', 'التعليقات التوضيحية'],
  HASHTAGS: ['Hashtags', 'الهاشتاجات'], UNKNOWN: ['Unknown', 'غير معروف'],
};

const hours = (minutes: number | null) => minutes == null ? null : Math.round(minutes / 6) / 10;
const netSubscribers = (totals: YouTubeActivityTotals) =>
  totals.subscribersGained == null || totals.subscribersLost == null ? null : totals.subscribersGained - totals.subscribersLost;

export function YouTubeBreakdownSection({ overview, days, refresh }: { overview: YouTubeChannelMetrics; days: YouTubeAnalyticsPeriod; refresh: number }) {
  const { t, date, num } = useI18n();
  const [tab, setTab] = useState<Tab>('audience');
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data: YouTubeBreakdowns | null } | null>(null);
  const params = new URLSearchParams({ channel: overview.channelId, days: String(days), startDate: overview.startDate, endDate: overview.viewsThrough ?? '' }).toString();
  const key = `${params}:${refresh}:${retry}`;
  const through = overview.viewsThrough;
  useEffect(() => {
    if (!through) return;
    const controller = new AbortController();
    void request<YouTubeBreakdowns>(`/social/youtube/breakdowns?${params}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, data: null }); });
    return () => controller.abort();
  }, [key, params, through]);
  if (!through) return null;
  const active = result?.key === key ? result : null;
  const data = active?.data;
  const day = (value: string) => date(dateFromKey(value).toMillis(), 'dayShort');
  const tabs: Record<Tab, string> = {
    audience: t('Audience', 'الجمهور'), devices: t('Devices', 'الأجهزة'),
    traffic: t('Traffic sources', 'مصادر المشاهدات'), compare: t('Compare figures', 'المقارنات'),
  };
  return (
    <Card aria-busy={!active}>
      <CardHeader title={t('YouTube audience and comparisons', 'جمهور يوتيوب والمقارنات')}
        description={t(`Reports requested for ${day(overview.startDate)} – ${day(through)}. Dates use Pacific time.`, `التقارير مطلوبة من ${day(overview.startDate)} لحد ${day(through)} بتوقيت المحيط الهادئ.`)} />
      <CardBody className="u-stack">
        {!active && <p role="status">{t('Loading the detailed YouTube reports…', 'بنحمّل تقارير يوتيوب بالتفصيل…')}</p>}
        {active && !data && <EmptyState compact title={t('YouTube reports could not be loaded', 'تعذّر تحميل التقارير التفصيلية')}
          action={<Button size="sm" onClick={() => setRetry(value => value + 1)}>{t('Try again', 'جرّب تاني')}</Button>} />}
        {data && (
          <>
            <Segmented label={t('YouTube reports', 'تقارير يوتيوب')} value={tab} onChange={value => setTab(TABS.find(item => item === value) ?? 'audience')}
              items={TABS.map(value => ({ value, label: tabs[value] }))} />
            {tab === 'audience' && (
              <>
                {data.subscriberSnapshot?.count != null && <p className="an-youtube-note">{t(
                  `Latest subscriber count: ${num(data.subscriberSnapshot.count)} on ${day(data.subscriberSnapshot.date)}.`,
                  `آخر عدد للمشتركين ${num(data.subscriberSnapshot.count)} يوم ${day(data.subscriberSnapshot.date)}.`,
                )}</p>}
                <div className="an-youtube-detail-grid">
                  <PercentGroup title={t('Viewer age', 'أعمار الجمهور')} rows={data.age} dimension="age" />
                  <PercentGroup title={t('Viewer gender', 'النوع')} rows={data.gender} dimension="gender" />
                  <ActivityGroup title={t('Top countries', 'أهم الدول')} rows={data.countries} country />
                  <ActivityGroup title={t('Subscription status', 'حالة الاشتراك')} rows={data.subscribed} share />
                </div>
                <p className="an-youtube-note">{t('Age and gender are percentages reported by YouTube. The monthly audience, unique viewers, impressions and click-through rate are available in YouTube Studio.', 'نسب الأعمار والنوع جاية من يوتيوب. الجمهور الشهري والمشاهدون الفريدون ومرات الظهور ونسبة النقر متاحين في YouTube Studio.')}</p>
              </>
            )}
            {tab === 'devices' && (
              <>
                <div className="an-youtube-detail-grid">
                  <ActivityGroup title={t('By device', 'حسب الجهاز')} rows={data.devices} share />
                  <ActivityGroup title={t('Mobile operating systems', 'أنظمة تشغيل الموبايل')} rows={data.mobileSystems} share />
                </div>
                <p className="an-youtube-note">{t('YouTube Studio’s device card uses watch time share. Percentages here use just the watch time or views classified in each table.', 'بطاقة الأجهزة في Studio بتعرض نسبة وقت المشاهدة. النسب هنا محسوبة من وقت المشاهدة أو المشاهدات المصنّفة داخل كل جدول.')}</p>
              </>
            )}
            {tab === 'traffic' && <ActivityGroup title={t('How viewers found the channel', 'المشاهدات جت منين')} rows={data.traffic} share />}
            {tab === 'compare' && <PeriodComparison overview={overview} data={data} />}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function PercentGroup({ title, rows, dimension }: { title: string; rows: YouTubeBreakdowns['age']; dimension: 'age' | 'gender' }) {
  const { t, pct, lang } = useI18n();
  return (
    <section className="an-demo__group an-youtube-breakdown">
      <h3>{title}</h3>
      {rows?.length ? (
        <ul>{rows.map(row => (
          <li key={row.key}>
            <span>{sliceLabel(dimension, row.key.replace(/^age/, ''), lang)}</span>
            <b>{pct(row.percentage, 1)}</b>
            <span className="an-time__bar" aria-hidden><i style={{ inlineSize: `${Math.min(100, row.percentage)}%` }} /></span>
          </li>
        ))}</ul>
      ) : <p className="an-youtube-note">{t('No figures available for these dates.', 'مفيش بيانات متاحة للتواريخ دي.')}</p>}
    </section>
  );
}

function ActivityGroup({ title, rows, country, share }: { title: string; rows: YouTubeBreakdownRow[] | null; country?: boolean; share?: boolean }) {
  const { t, num, pct, lang } = useI18n();
  const totalViews = rows?.reduce((total, row) => total + (row.views ?? 0), 0) ?? 0;
  const totalMinutes = rows?.reduce((total, row) => total + (row.minutes ?? 0), 0) ?? 0;
  const cell = (value: number | null, total: number, display: number | null = value) =>
    <><bdi>{num(display)}</bdi>{share && value != null && total > 0 && <small><bdi>{pct(100 * value / total, 1)}</bdi></small>}</>;
  const labelOf = (id: string) => country ? sliceLabel('country', id, lang) : dimensions[id] ? t(...dimensions[id]) : id;
  return (
    <section className="an-youtube-breakdown">
      <h3>{title}</h3>
      {rows?.length ? <div className="an-youtube-table-wrap"><table className="an-youtube-table">
        <thead><tr><th scope="col">{t('Breakdown', 'التقسيم')}</th><th scope="col">{t('Views', 'المشاهدات')}</th><th scope="col">{t('Hours watched', 'ساعات المشاهدة')}</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{labelOf(row.key)}</th><td>{cell(row.views, totalViews)}</td><td>{cell(row.minutes, totalMinutes, hours(row.minutes))}</td></tr>)}</tbody>
      </table></div> : <p className="an-youtube-note">{t('No figures available for these dates.', 'مفيش بيانات متاحة للتواريخ دي.')}</p>}
    </section>
  );
}

function PeriodComparison({ overview, data }: { overview: YouTubeChannelMetrics; data: YouTubeBreakdowns }) {
  const { t, date, num, pct } = useI18n();
  const previous = data.previous;
  const balanced = previous && previous.availableThrough === previous.endDate;
  const activityMatches = overview.activityThrough === data.endDate;
  const current = overview.totals;
  const before = balanced ? previous?.totals : null;
  const rows = [
    [t('Views', 'المشاهدات'), current.views, before?.views],
    [t('Watch time (hours)', 'ساعات المشاهدة'), activityMatches ? hours(current.minutes) : null, activityMatches ? hours(before?.minutes ?? null) : null],
    [t('Subscribers gained', 'الاشتراكات الجديدة'), activityMatches ? current.subscribersGained : null, activityMatches ? before?.subscribersGained : null],
    [t('Subscribers lost', 'إلغاء الاشتراك'), activityMatches ? current.subscribersLost : null, activityMatches ? before?.subscribersLost : null],
    [t('Net subscribers', 'صافي المشتركين'), activityMatches ? netSubscribers(current) : null, activityMatches && before ? netSubscribers(before) : null],
    [t('Likes', 'الإعجابات'), activityMatches ? current.likes : null, activityMatches ? before?.likes : null],
    [t('Comments', 'التعليقات'), activityMatches ? current.comments : null, activityMatches ? before?.comments : null],
    [t('Shares', 'المشاركات'), activityMatches ? current.shares : null, activityMatches ? before?.shares : null],
  ] as const;
  const day = (d: string) => date(dateFromKey(d).toMillis(), 'dayShort');
  const range = (start: string, end: string) => `${day(start)} – ${day(end)}`;
  const videoTotals = overview.publishedVideoTotals;
  const interactions = activityMatches && current.likes != null && current.comments != null && current.shares != null
    ? current.likes + current.comments + current.shares : null;
  return (
    <div className="u-stack">
      {videoTotals && (
        <section className="an-youtube-breakdown">
          <h3>{t('Why these counts differ', 'سبب الفرق بين الأرقام')}</h3>
          <div className="an-youtube-table-wrap"><table className="an-youtube-table">
            <thead><tr><th scope="col">{t('Source and dates', 'المصدر والفترة')}</th><th scope="col">{t('Views', 'المشاهدات')}</th><th scope="col">{t('Interactions', 'التفاعلات')}</th></tr></thead>
            <tbody>
              <tr><th scope="row">{t('Channel activity during the available dates', 'نشاط القناة خلال الأيام اللي بياناتها متاحة')}
                <small>{range(data.startDate, data.endDate)}</small></th><td><bdi>{num(current.views)}</bdi></td><td><bdi>{num(interactions)}</bdi></td></tr>
              <tr><th scope="row">{t(`Lifetime totals for ${num(videoTotals.count)} videos published in the selected window`, `الإجمالي على مدار عمر ${num(videoTotals.count)} فيديو نزلوا في الفترة المختارة`)}
                <small>{range(overview.startDate, overview.endDate)}</small></th><td><bdi>{num(videoTotals.views)}</bdi></td><td><bdi>{num(videoTotals.interactions)}</bdi></td></tr>
            </tbody>
          </table></div>
          <p className="an-youtube-note">{t('Channel interactions sum likes, comments and shares. Video totals use the interactions available on each upload.', 'تفاعلات القناة تجمع الإعجابات والتعليقات والمشاركات. إجمالي الفيديوهات بيجمع التفاعلات المتاحة على كل فيديو.')}</p>
        </section>
      )}
      <p className="an-youtube-note">{t('The comparison uses the same number of available days in the previous period.', 'المقارنة دي بتستخدم نفس عدد الأيام المتاحة من الفترة اللي قبلها.')}</p>
      {!activityMatches && <p className="an-youtube-note">{t('Some metrics are waiting for reports covering the same dates.', 'بعض المقاييس لسه مستنية تقارير تغطي نفس التواريخ.')}</p>}
      <div className="an-youtube-table-wrap"><table className="an-youtube-table">
        <thead><tr><th scope="col">{t('Metric', 'المقياس')}</th>
          <th scope="col">{t('Current', 'الحالية')}<small>{range(data.startDate, data.endDate)}</small></th>
          <th scope="col">{t('Previous', 'السابقة')}{previous && <small>{range(previous.startDate, previous.endDate)}</small>}</th>
          <th scope="col">{t('Change', 'التغيّر')}</th></tr></thead>
        <tbody>{rows.map(([label, value, previousValue]) => {
          const delta = value != null && previousValue != null && previousValue > 0 ? 100 * (value / previousValue - 1) : null;
          return <tr key={label}><th scope="row">{label}</th><td><bdi>{num(value)}</bdi></td><td><bdi>{num(previousValue)}</bdi></td><td><bdi>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${pct(delta, 1)}`}</bdi></td></tr>;
        })}</tbody>
      </table></div>
      {data.averageViewSeconds != null && <p className="an-youtube-note">{t(
        `YouTube reports an average view duration of ${num(data.averageViewSeconds)} seconds${data.averageViewPercentage == null ? '.' : ` and an average percentage viewed of ${pct(data.averageViewPercentage, 1)}.`}`,
        `متوسط مدة المشاهدة من يوتيوب ${num(data.averageViewSeconds)} ثانية${data.averageViewPercentage == null ? '.' : ` ومتوسط نسبة الفيديو اللي اتشاف ${pct(data.averageViewPercentage, 1)}.`}`,
      )}</p>}
    </div>
  );
}
