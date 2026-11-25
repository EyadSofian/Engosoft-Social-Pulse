import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { SeriesChart } from '../../components/charts/Series';
import { EmptyState } from '../../components/feedback/States';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import type { YouTubeAnalyticsPeriod, YouTubeChannelMetrics } from '../../domain/youtube-analytics';
import { useI18n } from '../../i18n/I18nProvider';
import { ApiError, request } from '../../lib/api';
import { dateFromKey } from '../../lib/format';
import { YouTubeBreakdownSection } from './YouTubeBreakdownSection';

type ReportState = { key: string; data: YouTubeChannelMetrics } | { key: string; error: 'not_connected' | 'consent' | 'unavailable' };

export function YouTubeChannelSection({ days, account, refresh }: { days: YouTubeAnalyticsPeriod; account: string; refresh: number }) {
  const { t, num, date } = useI18n();
  const [report, setReport] = useState<ReportState | null>(null);
  const [retry, setRetry] = useState(0);
  const params = new URLSearchParams({ days: String(days), ...(account === 'all' ? {} : { channel: account }) }).toString();
  const key = `${params}:${refresh}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    void request<YouTubeChannelMetrics>(`/social/youtube/insights?${params}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setReport({ key, data }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code = error instanceof ApiError ? (error.details as { code?: string } | undefined)?.code : undefined;
        setReport({ key, error: code === 'not_connected' || code === 'consent' ? code : 'unavailable' });
      });
    return () => controller.abort();
  }, [key, params]);

  const state = report?.key === key ? report : null;
  const data = state && 'data' in state ? state.data : null;
  const showDay = (day: string) => date(dateFromKey(day).toMillis(), 'dayShort');
  const watchHours = data?.totals.minutes == null ? null : Math.round(data.totals.minutes / 6) / 10;
  const gained = data?.totals.subscribersGained;
  const lost = data?.totals.subscribersLost;
  const subscribers = gained == null || lost == null ? null : gained - lost;
  const daily = data?.daily.flatMap((row) => row.views == null ? [] : [{ key: row.date, label: showDay(row.date), title: showDay(row.date), value: row.views }]) ?? [];
  const title = t('YouTube channel analytics', 'تحليلات قناة يوتيوب');

  return (
    <>
    <Card aria-busy={!state}>
      <CardHeader
        title={title}
        description={data ? `${data.channel} · ${showDay(data.startDate)} – ${showDay(data.endDate)} · ${t('Pacific time', 'توقيت المحيط الهادئ')}` : t('Source: YouTube Analytics', 'المصدر الرسمي من YouTube Analytics')}
        actions={data && <a className="ui-btn ui-btn--secondary ui-btn--sm" href={`https://studio.youtube.com/channel/${encodeURIComponent(data.channelId)}/analytics/hub_overview`} target="_blank" rel="noreferrer">YouTube Studio <ExternalLink size={14} /></a>}
      />
      <CardBody className="u-stack">
        {!state && <p role="status">{t('Loading channel analytics…', 'بنحمّل تحليلات القناة…')}</p>}
        {state && 'error' in state && (
          <EmptyState compact
            title={state.error === 'consent' ? t('YouTube Analytics access is required', 'القناة محتاجة صلاحية YouTube Analytics')
              : state.error === 'not_connected' ? t('This YouTube channel is not connected', 'قناة يوتيوب دي مش مربوطة')
              : t('YouTube Analytics could not be loaded', 'تعذّر تحميل الأرقام من YouTube Analytics')}
            action={<Button size="sm" onClick={() => setRetry(value => value + 1)}>{t('Try again', 'جرّب تاني')}</Button>}
          />
        )}
        {data && (
          <>
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
