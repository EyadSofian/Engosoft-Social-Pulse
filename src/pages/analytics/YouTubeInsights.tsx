import { useEffect, useState } from 'react';
import { Clock, ExternalLink, Eye, Heart, MessageCircle, Plug, RefreshCw, Share2, UserPlus } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Stat } from '../../components/data-display/Metric';
import { BarList, ColumnChart } from '../../components/charts/Bars';
import { EmptyState } from '../../components/feedback/States';
import { Button, ButtonLink } from '../../components/ui/Button';
import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import type { YouTubeInsights as Insights } from '../../../server/connectors/youtube';

type Days = 7 | 28 | 90;
type Failure = { code: 'not_connected' | 'consent' | 'unavailable' | 'error'; message: string };

const duration = (seconds: number | null) => (seconds == null ? '—' : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`);

/**
 * The connected YouTube channel in numbers, straight from YouTube Analytics: views, watch time, engagement and
 * subscribers for the period, day by day, and the videos that drew the most views. Missing numbers stay "—".
 */
export function YouTubeInsights() {
  const { t, num, date } = useI18n();
  const { can } = useAuth();
  const [days, setDays] = useState<Days>(28);
  const [data, setData] = useState<Insights | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true); setFailure(null);
    void fetch(`/api/social/youtube/insights?days=${days}`).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (response.ok) setData(body as Insights);
      else { setData(null); setFailure({ code: body.code ?? 'error', message: body.error ?? '' }); }
    }).catch(() => setFailure({ code: 'error', message: '' })).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [days]);

  const hours = (minutes: number | null) => (minutes == null ? '—' : num(Math.round(minutes / 60)));
  const range = <div className="yt__range" role="radiogroup" aria-label={t('Period', 'الفترة')}>
    {([7, 28, 90] as Days[]).map((value) => <button key={value} type="button" role="radio" aria-checked={days === value} onClick={() => setDays(value)}>{t(`${value} days`, `${value} يوم`)}</button>)}
  </div>;

  if (failure?.code === 'not_connected' || failure?.code === 'consent') return <EmptyState icon={<ChannelIcon channel="youtube" size={24} />}
    title={failure.code === 'consent' ? t('YouTube is connected without analytics access', 'يوتيوب مربوط من غير صلاحية التحليلات') : t('No YouTube channel is connected', 'مفيش قناة يوتيوب مربوطة')}
    text={failure.code === 'consent' ? t('Reconnect the channel and allow “View YouTube Analytics reports”.', 'اعمل إعادة ربط للقناة ووافق على «عرض تقارير YouTube Analytics».') : t('Connect the channel to see views, watch time and the best videos here.', 'اربط القناة علشان تشوف المشاهدات وساعات المشاهدة وأفضل الفيديوهات هنا.')}
    action={can('connections.manage') ? <ButtonLink to="/connections" variant="primary" size="sm" icon={<Plug size={14} />}>{t('Connections', 'ربط المنصات')}</ButtonLink> : undefined} />;
  if (failure) return <EmptyState icon={<ChannelIcon channel="youtube" size={24} />} title={t('YouTube Analytics did not answer', 'YouTube Analytics ما ردّش')} text={failure.message || undefined} action={<Button size="sm" icon={<RefreshCw size={14} />} onClick={load}>{t('Try again', 'حاول تاني')}</Button>} />;
  if (!data) return <p role="status" className="u-sm u-muted">{t('Loading YouTube…', 'بيتحمّل يوتيوب…')}</p>;

  const { totals } = data;
  const net = totals.subscribersGained == null && totals.subscribersLost == null ? null : (totals.subscribersGained ?? 0) - (totals.subscribersLost ?? 0);
  const step = data.daily.length > 31 ? 7 : 1;
  const weekly = step === 7
    ? Array.from({ length: Math.ceil(data.daily.length / 7) }, (_, i) => data.daily.slice(i * 7, i * 7 + 7))
    : data.daily.map((day) => [day]);
  const columns = (pick: 'views' | 'minutes') => weekly.map((group) => ({
    key: group[0].date,
    label: step === 7 ? t(`Week of ${date(group[0].date, 'dayShort')}`, `أسبوع ${date(group[0].date, 'dayShort')}`) : date(group[0].date, 'dayShort'),
    value: group.reduce((total, day) => total + (day[pick] ?? 0), 0) / (pick === 'minutes' ? 60 : 1),
  }));

  return (
    <div className="u-stack yt" aria-busy={loading}>
      <div className="yt__head">
        <span className="yt__channel"><ChannelIcon channel="youtube" size={18} /> <b>{data.channel}</b></span>
        {range}
      </div>
      <p className="u-xs u-muted">{t('Source: YouTube Analytics', 'المصدر: YouTube Analytics')} · {date(data.startDate, 'dayShort')} – {date(data.endDate, 'dayShort')} · {t('YouTube reports with a delay of about two days.', 'يوتيوب بيبعت الأرقام متأخرة حوالي يومين.')}</p>
      <div className="stat-row">
        <Stat tone="brand" icon={<Eye size={16} />} value={totals.views == null ? '—' : num(totals.views)} label={t('Views', 'المشاهدات')} />
        <Stat icon={<Clock size={16} />} value={hours(totals.minutes)} label={t('Watch hours', 'ساعات المشاهدة')} />
        <Stat icon={<Heart size={16} />} value={totals.likes == null ? '—' : num(totals.likes)} label={t('Likes', 'الإعجابات')} />
        <Stat icon={<MessageCircle size={16} />} value={totals.comments == null ? '—' : num(totals.comments)} label={t('Comments', 'التعليقات')} />
        <Stat icon={<Share2 size={16} />} value={totals.shares == null ? '—' : num(totals.shares)} label={t('Shares', 'المشاركات')} />
        <Stat tone={net != null && net < 0 ? 'danger' : 'success'} icon={<UserPlus size={16} />} value={net == null ? '—' : `${net > 0 ? '+' : ''}${num(net)}`} label={t('Net subscribers', 'صافي المشتركين')}
          hint={totals.subscribersGained == null ? undefined : t(`${totals.subscribersGained} gained · ${totals.subscribersLost ?? 0} lost`, `+${num(totals.subscribersGained)} · −${num(totals.subscribersLost ?? 0)}`)} />
      </div>
      <div className="yt__charts">
        <section className="yt__panel"><h3>{step === 7 ? t('Views per week', 'المشاهدات أسبوعيًا') : t('Views per day', 'المشاهدات يوميًا')}</h3>
          {data.daily.length ? <ColumnChart data={columns('views')} label={t('Views over time', 'المشاهدات على مدار الفترة')} format={(v) => num(Math.round(v))} /> : <p className="u-sm u-muted">—</p>}
        </section>
        <section className="yt__panel"><h3>{step === 7 ? t('Watch hours per week', 'ساعات المشاهدة أسبوعيًا') : t('Watch hours per day', 'ساعات المشاهدة يوميًا')}</h3>
          {data.daily.length ? <ColumnChart data={columns('minutes')} label={t('Watch hours over time', 'ساعات المشاهدة على مدار الفترة')} format={(v) => num(Math.round(v))} /> : <p className="u-sm u-muted">—</p>}
        </section>
      </div>
      <section className="yt__panel">
        <h3>{t('Top videos by views', 'أكتر الفيديوهات مشاهدة')}</h3>
        {data.videos.length ? <>
          <BarList label={t('Views per video', 'المشاهدات لكل فيديو')} format={(v) => num(v)} data={data.videos.map((video) => ({ key: video.id, value: video.views, label: <a href={video.url} target="_blank" rel="noreferrer" dir="auto">{video.title} <ExternalLink size={11} /></a> }))} />
          <table className="table yt__table">
            <thead><tr><th>{t('Video', 'الفيديو')}</th><th>{t('Views', 'مشاهدات')}</th><th>{t('Watch hours', 'ساعات')}</th><th>{t('Avg. view', 'متوسط المشاهدة')}</th><th>{t('Likes', 'إعجابات')}</th><th>{t('Shares', 'مشاركات')}</th></tr></thead>
            <tbody>{data.videos.map((video) => <tr key={video.id}>
              <td dir="auto"><a href={video.url} target="_blank" rel="noreferrer">{video.title}</a>{video.publishedAt && <small className="u-muted"> · {date(video.publishedAt, 'dayShort')}</small>}</td>
              <td className="num">{video.views == null ? '—' : num(video.views)}</td><td className="num">{hours(video.minutes)}</td><td className="num">{duration(video.averageViewSeconds)}</td>
              <td className="num">{video.likes == null ? '—' : num(video.likes)}</td><td className="num">{video.shares == null ? '—' : num(video.shares)}</td>
            </tr>)}</tbody>
          </table>
        </> : <p className="u-sm u-muted">{t('No video had views in this period.', 'مفيش فيديو اتشاف في الفترة دي.')}</p>}
      </section>
    </div>
  );
}
