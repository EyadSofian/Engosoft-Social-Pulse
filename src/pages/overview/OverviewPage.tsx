import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { AlarmClock, CalendarClock, CalendarX2, CheckCircle2, FilePen, PenLine, Rocket, Send } from 'lucide-react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { Link } from '../../app/router/router';
import { BarList } from '../../components/charts/Bars';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Stat } from '../../components/data-display/Metric';
import { EmptyState } from '../../components/feedback/States';
import { Badge } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Tabs';
import { useAuth } from '../../features/auth/AuthProvider';
import { useCreateContent } from '../../features/content/CreateContent';
import { CHANNEL_LABEL, STATUS_LABEL, type Channel, type PipelineItem } from '../../features/content-pipeline/types';
import { usePipeline } from '../../features/content-pipeline/usePipeline';
import { useClock } from '../../features/workspace/hooks';
import { useI18n } from '../../i18n/I18nProvider';
import { businessZone, parseTimestamp } from '../../lib/format';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type Period = 'week' | 'month';
const DONE = ['archived', 'cancelled'];
const DECIDED = ['approved', 'scheduled', 'published'];

const zoned = (ms: number) => DateTime.fromMillis(ms, { zone: businessZone() });
const dayOf = (iso: string) => zoned(parseTimestamp(iso)).toISODate() ?? '';
/** When a published post went out: the platform's own time when sync matched it, otherwise when it was marked. */
const publishedAt = (item: PipelineItem) => item.published?.[0]?.publishedAt ?? item.scheduledAt ?? item.updatedAt;

/**
 * Where all content stands: how much was made in the period, what is waiting on whom,
 * which coming days and platforms have nothing planned, and who made what.
 */
export function OverviewPage() {
  const { t, tx, date, relative } = useI18n();
  const { user, can } = useAuth();
  const now = useClock();
  const create = useCreateContent();
  const { items, team, error } = usePipeline();
  const { store } = useLiveData();
  const [period, setPeriod] = useState<Period>('month');
  usePageMeta(t('Overview', 'نظرة عامة'), [{ label: t('Overview', 'نظرة عامة') }]);

  const today = zoned(now);
  const since = period === 'week' ? today.minus({ days: 6 }).startOf('day') : today.startOf('month');
  const sinceMs = since.toMillis();
  const live = useMemo(() => (items ?? []).filter((item) => !DONE.includes(item.status)), [items]);
  const made = live.filter((item) => parseTimestamp(item.createdAt) >= sinceMs);
  const published = live.filter((item) => item.status === 'published' && parseTimestamp(publishedAt(item)) >= sinceMs);
  const inReview = live.filter((item) => item.status === 'ready_for_review');
  const changes = live.filter((item) => item.status === 'changes_requested');
  const readyToPublish = live.filter((item) => item.status === 'approved');
  const upcoming = live.filter((item) => item.status === 'scheduled' && item.scheduledAt && parseTimestamp(item.scheduledAt) >= now)
    .sort((a, b) => parseTimestamp(a.scheduledAt!) - parseTimestamp(b.scheduledAt!));

  // Calendar entries outside the content pipeline (imported plans) count as planned days too.
  const plans = store.phase === 'ready' ? store.data.plans.filter((plan) => plan.status !== 'cancelled') : [];
  const plannedDays = new Set([...upcoming.map((item) => dayOf(item.scheduledAt!)), ...plans.filter((plan) => plan.ts >= now).map((plan) => dayOf(plan.scheduledAt))]);
  const nextDays = Array.from({ length: 14 }, (_, index) => today.plus({ days: index }).toISODate() ?? '');
  const emptyDays = nextDays.filter((day) => !plannedDays.has(day));
  // Imported plan rows not linked to a post yet: on the calendar, but nobody has made them.
  const notMade = plans.filter((plan) => plan.ts >= now && !plan.notes.startsWith('content:') && plan.status !== 'published').sort((a, b) => a.ts - b.ts);

  const usedChannels = [...new Set(live.flatMap((item) => item.channels))] as Channel[];
  const weekEnd = now + 7 * 86_400_000;
  const silentChannels = usedChannels.filter((channel) => !upcoming.some((item) => item.channels.includes(channel) && parseTimestamp(item.scheduledAt!) < weekEnd));

  const stages = [
    { key: 'draft', statuses: ['idea', 'draft', 'in_production'] },
    { key: 'ready_for_review', statuses: ['ready_for_review'] },
    { key: 'changes_requested', statuses: ['changes_requested'] },
    { key: 'approved', statuses: ['approved'] },
    { key: 'scheduled', statuses: ['scheduled'] },
    { key: 'published', statuses: ['published'] },
  ] as const;

  const people = useMemo(() => {
    const rows = new Map<string, { created: number; review: number; decided: number; published: number }>();
    for (const item of made) {
      const row = rows.get(item.ownerId) ?? { created: 0, review: 0, decided: 0, published: 0 };
      row.created++;
      if (item.status === 'ready_for_review') row.review++;
      if (DECIDED.includes(item.status)) row.decided++;
      if (item.status === 'published') row.published++;
      rows.set(item.ownerId, row);
    }
    return [...rows.entries()].map(([id, row]) => ({ id, name: team.find((member) => member.id === id)?.name ?? (id === user.id ? user.name : t('Former member', 'عضو سابق')), ...row })).sort((a, b) => b.created - a.created);
  }, [made, team, user, t]);

  const attention = [
    ...changes.map((item) => ({ item, tone: 'warning' as const, why: t('Changes requested', 'مطلوب تعديل') })),
    ...[...inReview].sort((a, b) => parseTimestamp(a.updatedAt) - parseTimestamp(b.updatedAt)).map((item) => ({ item, tone: 'brand' as const, why: t(`Sent for approval ${relative(item.updatedAt, now)}`, `أُرسل للاعتماد ${relative(item.updatedAt, now)}`) })),
    ...readyToPublish.map((item) => ({ item, tone: 'success' as const, why: t('Approved, not scheduled', 'معتمد ولم يُجدول') })),
  ].slice(0, 8);

  if (error && !items) return <EmptyState title={t('The content service is not reachable.', 'خدمة المحتوى غير متاحة.')} text={error} />;
  const loading = !items;
  const n = (value: number) => (loading ? '—' : value);

  return (
    <div className="u-stack u-stack--lg overview">
      <PageHeader
        title={t('Overview', 'نظرة عامة')}
        description={t('Everything at a glance: what was made, what is waiting, and what has not been made yet.', 'كل شيء في مكان واحد: ما أُنشئ، وما ينتظر، وما لم يُنشأ بعد.')}
        actions={<Segmented label={t('Period', 'الفترة')} value={period} onChange={setPeriod} items={[{ value: 'week', label: t('Last 7 days', 'آخر 7 أيام') }, { value: 'month', label: t('This month', 'هذا الشهر') }]} />}
      />

      <div className="overview-stats">
        <Stat icon={<PenLine size={16} />} value={n(made.length)} label={t('Created', 'تم إنشاؤه')} hint={period === 'week' ? t('last 7 days', 'آخر 7 أيام') : t('this month', 'هذا الشهر')} to="/content" />
        <Stat icon={<FilePen size={16} />} value={n(inReview.length)} label={t('Waiting for approval', 'ينتظر الاعتماد')} tone={inReview.length ? 'brand' : undefined} to="/content" />
        <Stat icon={<AlarmClock size={16} />} value={n(changes.length)} label={t('Needs changes', 'مطلوب تعديل')} tone={changes.length ? 'warning' : undefined} to="/content" />
        <Stat icon={<CheckCircle2 size={16} />} value={n(readyToPublish.length)} label={t('Ready to publish', 'جاهز للنشر')} hint={t('approved, no date yet', 'معتمد وبدون موعد')} tone={readyToPublish.length ? 'success' : undefined} to={can('content.schedule') || can('content.publish') ? '/publish' : '/content'} />
        <Stat icon={<CalendarClock size={16} />} value={n(upcoming.length)} label={t('Scheduled', 'مجدول')} hint={t('coming up', 'قادم')} to="/calendar" />
        <Stat icon={<Rocket size={16} />} value={n(published.length)} label={t('Published', 'تم نشره')} hint={period === 'week' ? t('last 7 days', 'آخر 7 أيام') : t('this month', 'هذا الشهر')} tone={published.length ? 'success' : undefined} to="/analytics?section=posts" />
      </div>

      <div className="overview-grid">
        <Card>
          <CardHeader title={t('Not made yet', 'لم يُنشأ بعد')} icon={<CalendarX2 size={16} />} description={t('Gaps in the next two weeks of the calendar.', 'الفراغات في التقويم خلال الأسبوعين القادمين.')} />
          <CardBody className="u-stack">
            <div>
              <p className="overview-label">{t(`${emptyDays.length} of the next 14 days have nothing scheduled`, `${emptyDays.length} من الأيام الـ14 القادمة بلا أي منشور`)}</p>
              {emptyDays.length ? <div className="overview-days">{emptyDays.map((day) => <Link key={day} to={`/calendar?date=${day}`} className="overview-day" title={t('Open this day in the calendar', 'افتح اليوم في التقويم')}>{date(day, 'weekday')} <b className="u-tnum">{date(day, 'dayShort')}</b></Link>)}</div> : <p className="u-sm u-muted">{t('Every day has at least one post.', 'كل يوم فيه منشور واحد على الأقل.')}</p>}
            </div>
            {silentChannels.length > 0 && <div>
              <p className="overview-label">{t('Platforms with nothing this week', 'منصات بلا منشورات هذا الأسبوع')}</p>
              <div className="overview-days">{silentChannels.map((channel) => <span key={channel} className="overview-day"><ChannelIcon channel={channel} size={14} /> {CHANNEL_LABEL[channel]}</span>)}</div>
            </div>}
            {notMade.length > 0 && <div>
              <p className="overview-label">{t('On the calendar, no post made yet', 'في التقويم ولم يُصمَّم بعد')}</p>
              <ul className="overview-list">{notMade.slice(0, 5).map((plan) => <li key={plan.id}>
                <ChannelIcon channel={plan.platform} size={14} /><span className="u-grow u-truncate" dir="auto">{plan.title}</span><small className="u-muted">{date(plan.scheduledAt, 'dateTime')}</small>
                {can('content.create') && <button type="button" className="overview-link" onClick={() => create.open({ title: plan.title, caption: plan.caption })}>{t('Create it', 'أنشئه')}</button>}
              </li>)}</ul>
            </div>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('Needs attention', 'يحتاج متابعة')} icon={<AlarmClock size={16} />} count={attention.length || undefined} />
          <CardBody>
            {attention.length ? <ul className="overview-list">{attention.map(({ item, tone, why }) => <li key={item.id}>
              <Badge tone={tone}>{tx(STATUS_LABEL[item.status])}</Badge>
              <Link to={`/content/${item.id}`} className="u-grow u-truncate" dir="auto">{item.title}</Link>
              <small className="u-muted">{why}</small>
            </li>)}</ul> : <p className="u-sm u-muted">{loading ? t('Loading…', 'جارٍ التحميل…') : t('Nothing is waiting. Nice.', 'لا شيء ينتظر الآن.')}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('Where the content is', 'أين يقف المحتوى')} description={t('Every open post by stage.', 'كل المنشورات المفتوحة حسب المرحلة.')} />
          <CardBody>
            <BarList label={t('Posts by stage', 'المنشورات حسب المرحلة')} data={stages.map((stage) => ({ key: stage.key, label: tx(STATUS_LABEL[stage.key]), value: loading ? null : live.filter((item) => (stage.statuses as readonly string[]).includes(item.status)).length }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('Coming up this week', 'القادم هذا الأسبوع')} icon={<Send size={16} />} count={upcoming.filter((item) => parseTimestamp(item.scheduledAt!) < weekEnd).length || undefined} actions={<Link to="/calendar" className="overview-link">{t('Calendar', 'التقويم')}</Link>} />
          <CardBody>
            {upcoming.some((item) => parseTimestamp(item.scheduledAt!) < weekEnd) ? <ul className="overview-list">{upcoming.filter((item) => parseTimestamp(item.scheduledAt!) < weekEnd).slice(0, 8).map((item) => <li key={item.id}>
              <span className="overview-when u-tnum">{date(item.scheduledAt!, 'weekday')} {date(item.scheduledAt!, 'time')}</span>
              <Link to={`/content/${item.id}`} className="u-grow u-truncate" dir="auto">{item.title}</Link>
              <span className="overview-icons">{item.channels.map((channel) => <ChannelIcon key={channel} channel={channel} size={14} />)}</span>
            </li>)}</ul> : <p className="u-sm u-muted">{t('Nothing is scheduled for the next 7 days.', 'لا شيء مجدول في الأيام السبعة القادمة.')}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('Who made what', 'من أنشأ ماذا')} description={period === 'week' ? t('Posts created in the last 7 days.', 'المنشورات التي أُنشئت في آخر 7 أيام.') : t('Posts created this month.', 'المنشورات التي أُنشئت هذا الشهر.')} />
          <CardBody>
            {people.length ? <table className="overview-table">
              <thead><tr><th>{t('Person', 'الشخص')}</th><th>{t('Created', 'أنشأ')}</th><th>{t('In review', 'في المراجعة')}</th><th>{t('Approved', 'اعتُمد')}</th><th>{t('Published', 'نُشر')}</th></tr></thead>
              <tbody>{people.map((row) => <tr key={row.id}><td>{row.name}</td><td className="u-tnum">{row.created}</td><td className="u-tnum">{row.review}</td><td className="u-tnum">{row.decided}</td><td className="u-tnum">{row.published}</td></tr>)}</tbody>
            </table> : <p className="u-sm u-muted">{loading ? t('Loading…', 'جارٍ التحميل…') : t('No posts were created in this period.', 'لم تُنشأ منشورات في هذه الفترة.')}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('By platform', 'حسب المنصة')} description={t('Scheduled ahead, and published in the period.', 'المجدول القادم، والمنشور في الفترة.')} />
          <CardBody>
            {usedChannels.length ? <table className="overview-table">
              <thead><tr><th>{t('Platform', 'المنصة')}</th><th>{t('Scheduled', 'مجدول')}</th><th>{t('Published', 'منشور')}</th></tr></thead>
              <tbody>{usedChannels.map((channel) => <tr key={channel}>
                <td><span className="overview-channel"><ChannelIcon channel={channel} size={14} /> {CHANNEL_LABEL[channel]}</span></td>
                <td className="u-tnum">{upcoming.filter((item) => item.channels.includes(channel)).length}</td>
                <td className="u-tnum">{published.filter((item) => item.channels.includes(channel)).length}</td>
              </tr>)}</tbody>
            </table> : <p className="u-sm u-muted">{loading ? t('Loading…', 'جارٍ التحميل…') : t('No posts yet.', 'لا توجد منشورات بعد.')}</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
