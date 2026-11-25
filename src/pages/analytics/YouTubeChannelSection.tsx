import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { SeriesChart } from '../../components/charts/Series';
import { EmptyState } from '../../components/feedback/States';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Tabs';
import type { YouTubeAnalyticsPeriod, YouTubeChannelMetrics, YouTubeWindow } from '../../domain/youtube-analytics';
import { useI18n } from '../../i18n/I18nProvider';
import { ApiError, request } from '../../lib/api';
import { dateFromKey } from '../../lib/format';
import { YouTubeBreakdownSection } from './YouTubeBreakdownSection';

type ReportState = { key: string; data?: YouTubeChannelMetrics; error?: 'not_connected' | 'consent' | 'unavailable' };
const REFRESH_MS = 5 * 60_000;

export function YouTubeChannelSection({ days, account, refresh, window: selectedWindow, onWindowChange }: {
  days: YouTubeAnalyticsPeriod;
  account: string;
  refresh: number;
  window: YouTubeWindow;
  onWindowChange: (value: YouTubeWindow) => void;
}) {
  const { t, num, date } = useI18n();
  const [report, setReport] = useState<ReportState | null>(null);
  const [retry, setRetry] = useState(0);
  const [checking, setChecking] = useState(false);
  const params = new URLSearchParams({ days: String(days), window: selectedWindow, ...(account === 'all' ? {} : { channel: account }) }).toString();
  useEffect(() => {
    let controller: AbortController;
    let lastStarted = 0;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      lastStarted = Date.now();
      setChecking(true);
      void request<YouTubeChannelMetrics>(`/social/youtube/insights?${params}`, { signal })
        .then(data => { if (!signal.aborted) setReport({ key: params, data }); })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          const code = error instanceof ApiError ? (error.details as { code?: string } | undefined)?.code : undefined;
          setReport(previous => ({
            key: params,
            data: code !== 'not_connected' && code !== 'consent' && previous?.key === params ? previous.data : undefined,
            error: code === 'not_connected' || code === 'consent' ? code : 'unavailable',
          }));
        })
        .finally(() => { if (!signal.aborted) setChecking(false); });
    };
    const loadIfDue = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastStarted >= REFRESH_MS) load();
    };
    load();
    const timer = window.setInterval(loadIfDue, REFRESH_MS);
    window.addEventListener('focus', loadIfDue);
    document.addEventListener('visibilitychange', loadIfDue);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', loadIfDue);
      document.removeEventListener('visibilitychange', loadIfDue);
    };
  }, [params, refresh, retry]);

  const state = report?.key === params ? report : null;
  const data = state?.data;
  const showDay = (day: string) => date(dateFromKey(day).toMillis(), 'dayShort');
  const watchHours = data?.totals.minutes == null ? null : Math.round(data.totals.minutes / 6) / 10;
  const gained = data?.totals.subscribersGained;
  const lost = data?.totals.subscribersLost;
  const subscribers = gained == null || lost == null ? null : gained - lost;
  const daily = data?.daily.flatMap((row) => row.views == null ? [] : [{ key: row.date, label: showDay(row.date), title: showDay(row.date), value: row.views }]) ?? [];
  const title = t('YouTube channel analytics', 'تحليلات قناة يوتيوب');
  const studioLabel = data?.studioReportThrough && data.studioReportThrough < data.endDate
    ? t(`Studio through ${showDay(data.studioReportThrough)}`, `Studio لحد ${showDay(data.studioReportThrough)}`)
    : t('Same dates in Studio', 'نفس التواريخ في Studio');

  return (
    <>
    <Card aria-busy={checking}>
      <CardHeader
        title={title}
        description={data ? `${data.channel} · ${showDay(data.startDate)} – ${showDay(data.endDate)} · ${t('Pacific time', 'توقيت المحيط الهادئ')}` : t('Source: YouTube Analytics', 'المصدر الرسمي من YouTube Analytics')}
        actions={(
          <>
            {data?.studioReportUrl && <a className="ui-btn ui-btn--secondary ui-btn--sm" href={data.studioReportUrl} target="_blank" rel="noreferrer">{studioLabel} <ExternalLink size={14} /></a>}
            <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} busy={checking} onClick={() => setRetry(value => value + 1)}>{t('Check YouTube now', 'تحقق من يوتيوب')}</Button>
          </>
        )}
      />
      <CardBody className="u-stack">
        <Segmented label={t('YouTube reporting window', 'فترة تقرير يوتيوب')} value={selectedWindow}
          onChange={value => onWindowChange(value === 'studio' ? 'studio' : 'complete')}
          items={[{ value: 'complete', label: t('Latest complete period', 'آخر فترة مكتملة') }, { value: 'studio', label: t('Studio preset dates', 'تواريخ فترة Studio') }]} />
        {!state && <p role="status">{t('Loading channel analytics…', 'بنحمّل تحليلات القناة…')}</p>}
        {state?.error && !data && (
          <EmptyState compact
            title={state.error === 'consent' ? t('YouTube Analytics access is required', 'القناة محتاجة صلاحية YouTube Analytics')
              : state.error === 'not_connected' ? t('This YouTube channel is not connected', 'قناة يوتيوب دي مش مربوطة')
              : t('YouTube Analytics could not be loaded', 'تعذّر تحميل الأرقام من YouTube Analytics')}
            action={<Button size="sm" onClick={() => setRetry(value => value + 1)}>{t('Try again', 'جرّب تاني')}</Button>}
          />
        )}
        {data && (
          <>
            <p className="an-youtube-note">
              {t(`Last checked ${date(data.checkedAt, 'dateTime')}.`, `آخر تحقق ${date(data.checkedAt, 'dateTime')}.`)}
              {state?.error && ` ${t('Refresh failed. Showing the last available figures.', 'التحديث تعذّر. بنعرض آخر أرقام متاحة.')}`}
              {data.endDate < data.studioEndDate && ` ${t(
                `Studio’s preset ends on ${showDay(data.studioEndDate)}. The API’s complete period ends on ${showDay(data.endDate)}.`,
                `فترة Studio الافتراضية بتنتهي ${showDay(data.studioEndDate)}، والفترة المتاحة من الـAPI بتنتهي ${showDay(data.endDate)}.`,
              )}`}
            </p>
            <div className="an-youtube-kpis">
              {[
                [t('Channel views', 'مشاهدات القناة'), num(data.totals.views)],
                [t('Watch time (hours)', 'ساعات المشاهدة'), num(watchHours)],
                [t('Net subscribers', 'صافي المشتركين'), num(subscribers)],
              ].map(([label, value]) => <div className="an-kpi" key={label}><h3 className="an-kpi__label">{label}</h3><p className="an-kpi__value">{value}</p></div>)}
            </div>
            <p className="an-youtube-note">
              {data.viewsThrough == null
                ? t('YouTube hasn’t returned views for this period yet.', 'يوتيوب لسه ما رجّعش مشاهدات للفترة دي.')
                : data.viewsThrough < data.endDate
                  ? t(`Views confirmed through ${showDay(data.viewsThrough)}. Later days are still pending.`, `المشاهدات مؤكدة لحد ${showDay(data.viewsThrough)}. باقي الأيام لسه ما ظهرتش في التقرير.`)
                  : t('Views earned during the selected dates across all videos on the channel.', 'مشاهدات حصلت خلال الفترة المختارة على كل فيديوهات القناة.')}
              {data.activityThrough && data.activityThrough < data.endDate && data.activityThrough !== data.viewsThrough
                ? ` ${t(`Watch time and subscribers through ${showDay(data.activityThrough)}.`, `وقت المشاهدة والمشتركين لحد ${showDay(data.activityThrough)}.`)}` : ''}
            </p>
            {daily.length > 0 && <SeriesChart data={daily} kind="area" unit={t('views', 'مشاهدة')} ariaLabel={t('Daily views reported by YouTube', 'المشاهدات اليومية من يوتيوب')} />}
          </>
        )}
      </CardBody>
    </Card>
    {data && <YouTubeBreakdownSection overview={data} days={days} refresh={refresh} />}
    </>
  );
}
