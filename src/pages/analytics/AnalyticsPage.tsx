import { useMemo } from 'react';
import { DateTime } from 'luxon';
import { ExternalLink } from 'lucide-react';
import { useQueryState } from '../../app/router/router';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { BarList, ColumnChart } from '../../components/charts/Bars';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { DataTable, type Column } from '../../components/data-display/DataTable';
import { DemoSourceLine, SourceLine, Stat } from '../../components/data-display/Metric';
import { DataNotice, EmptyState, ProgressBar, progressTone } from '../../components/feedback/States';
import { Badge } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Segmented, Tabs } from '../../components/ui/Tabs';
import { DEPARTMENTS, departmentById } from '../../domain/catalog';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useClock } from '../../features/workspace/hooks';
import { allPlanProgress, monthKey, operationalKpis } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { bestSlots, byPlatform, splitByPeriod, summarize, topPosts, websiteTotals, type Period } from '../../lib/analytics';
import { businessZone, dayNumber } from '../../lib/format';
import { sourceOf } from '../../services/adapters/live';
import type { Post } from '../../types';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { LiveGate } from '../home/widgets';

type Tab = 'executive' | 'content' | 'platforms' | 'departments' | 'team' | 'learning';
const TABS: Tab[] = ['executive', 'content', 'platforms', 'departments', 'team', 'learning'];
const PERIODS: Period[] = [7, 30, 90, 365];

/**
 * Two kinds of numbers live here and are labelled apart: performance from the
 * live connectors (with their source), and operational delivery from the
 * workspace. Reach never stands in for an employee's performance.
 */
export function AnalyticsPage() {
  const { t } = useI18n();
  const [query, setQuery] = useQueryState();
  usePageMeta(t('Analytics', 'التحليلات'), [{ label: t('Analytics', 'التحليلات') }]);
  const tab = (TABS as string[]).includes(query.get('tab') ?? '') ? (query.get('tab') as Tab) : 'executive';
  const period = (PERIODS.map(String).includes(query.get('period') ?? '') ? Number(query.get('period')) : 30) as Period;

  return (
    <div className="u-stack">
      <PageHeader
        title={t('Analytics', 'التحليلات')}
        description={t('Content performance from connected platforms, and delivery from the workflow. Every number names its source; missing values show —.', 'أداء المحتوى من المنصات المربوطة، والتسليم من سير العمل. كل رقم يذكر مصدره؛ القيم الناقصة تظهر —.')}
        actions={
          <Segmented
            label={t('Period', 'الفترة')}
            value={String(period) as `${Period}`}
            onChange={(value) => setQuery({ period: value === '30' ? null : value })}
            items={PERIODS.map((value) => ({ value: String(value) as `${Period}`, label: value === 365 ? t('1 year', 'سنة') : t(`${value} days`, `${value} يوم`) }))}
          />
        }
      />
      <Tabs
        label={t('Analytics sections', 'أقسام التحليلات')}
        value={tab}
        onChange={(value) => setQuery({ tab: value === 'executive' ? null : value })}
        items={[
          { value: 'executive', label: t('Executive', 'ملخص تنفيذي') },
          { value: 'content', label: t('Content', 'المحتوى') },
          { value: 'platforms', label: t('Platforms', 'المنصات') },
          { value: 'departments', label: t('Departments', 'الأقسام') },
          { value: 'team', label: t('Team', 'الفريق') },
          { value: 'learning', label: t('Learning', 'التعلم من السجل') },
        ]}
      />
      {tab === 'executive' && <Executive period={period} />}
      {tab === 'content' && <ContentTab period={period} />}
      {tab === 'platforms' && <Platforms period={period} />}
      {tab === 'departments' && <Departments />}
      {tab === 'team' && <Team />}
      {tab === 'learning' && <Learning />}
    </div>
  );
}

function usePeriodPosts(period: number) {
  const { store } = useLiveData();
  const now = useClock();
  return useMemo(() => splitByPeriod(store.data.posts, period, dayNumber(now)), [store.data.posts, period, now]);
}

function Executive({ period }: { period: number }) {
  const { t, tx, num, compact, pct } = useI18n();
  const { store } = useLiveData();
  const { state } = useWorkspace();
  const now = useClock();
  const { current, previous } = usePeriodPosts(period);
  const summary = summarize(current);
  const before = summarize(previous);
  const platforms = [...new Set(current.map((post) => post.platform))];
  const sources = platforms.map((platform) => sourceOf(platform, store.data.connectors));

  const weeks = useMemo(() => {
    const start = DateTime.fromMillis(now, { zone: businessZone() }).startOf('week');
    return Array.from({ length: 12 }, (_, index) => {
      const from = start.minus({ weeks: 11 - index });
      const to = from.plus({ weeks: 1 });
      const count = store.data.posts.filter((post) => post.ts >= from.toMillis() && post.ts < to.toMillis()).length;
      return { key: from.toISODate() ?? String(index), label: from.toFormat('d LLL'), value: count, partial: index === 11 };
    });
  }, [store.data.posts, now]);
  const activeWeeks = weeks.filter((week) => week.value > 0).length;

  const month = monthKey(now);
  const published = state.content.filter((item) => item.status === 'published' && item.publishAt && DateTime.fromISO(item.publishAt, { zone: businessZone() }).toFormat('yyyy-LL') === month);
  const campaigns = state.campaigns
    .map((campaign) => ({ campaign, count: published.filter((item) => item.campaignId === campaign.id).length + state.content.filter((item) => item.campaignId === campaign.id && item.status === 'scheduled').length }))
    .sort((a, b) => b.count - a.count);

  const change = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : ((a - b) / b) * 100);
  const delta = (value: number | null) => (value == null ? t('no earlier period to compare', 'لا فترة سابقة للمقارنة') : `${value >= 0 ? '+' : '−'}${pct(Math.abs(value))} ${t('vs previous period', 'عن الفترة السابقة')}`);

  return (
    <div className="u-stack u-stack--lg">
      <Card>
        <CardHeader title={t('Content performance', 'أداء المحتوى')} description={t(`Live connectors · last ${period} days`, `المصادر الحية · آخر ${period} يوم`)} />
        <CardBody>
          <LiveGate needs="posts">
            <div className="stat-row">
              <Stat value={num(summary.count)} label={t('Posts published', 'بوستات منشورة')} hint={delta(change(summary.count, before.count))} />
              <Stat value={summary.reachCount ? compact(summary.reach) : '—'} label={t('Reach', 'الوصول')} hint={summary.count ? t(`reported by ${num(summary.reachCount)} of ${num(summary.count)} posts`, `متاح في ${num(summary.reachCount)} من ${num(summary.count)} بوست`) : undefined} />
              <Stat value={summary.measured ? compact(summary.interactions) : '—'} label={t('Engagement (interactions)', 'التفاعل')} hint={delta(change(summary.measured ? summary.interactions : null, before.measured ? before.interactions : null))} />
              <Stat value="—" label={t('Leads', 'العملاء المحتملون')} hint={t('No lead source connected (CRM / forms)', 'لا مصدر عملاء محتملين مربوط (CRM / نماذج)')} />
            </div>
            <SourceLine source={sources} now={now} />
          </LiveGate>
        </CardBody>
      </Card>
      <div className="u-grid u-grid--2">
        <Card>
          <CardHeader title={t('Publishing consistency', 'انتظام النشر')} description={t(`${activeWeeks} of the last 12 weeks had at least one post`, `${activeWeeks} من آخر 12 أسبوعًا فيها بوست واحد على الأقل`)} />
          <CardBody>
            <LiveGate needs="posts">
              <ColumnChart data={weeks} label={t('Posts per week', 'بوستات لكل أسبوع')} format={num} />
              <SourceLine source={store.data.connectors.filter((connector) => connector.status === 'connected').map((connector) => sourceOf(connector.platform, store.data.connectors))} now={now} />
            </LiveGate>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('Department participation', 'مشاركة الأقسام')} description={t('Published items this month, by department', 'العناصر المنشورة هذا الشهر حسب القسم')} />
          <CardBody>
            <BarList
              label={t('Department participation', 'مشاركة الأقسام')}
              data={DEPARTMENTS.filter((department) => department.plansContent).map((department) => ({ key: department.id, label: tx(department.name), value: published.filter((item) => item.departmentId === department.id).length }))}
              format={num}
            />
            <DemoSourceLine basis={t('workflow records, not platform data', 'سجلات سير العمل، لا بيانات المنصات')} />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title={t('Campaigns', 'الحملات')} description={t('Items published or scheduled this month per campaign', 'العناصر المنشورة أو المجدولة هذا الشهر لكل حملة')} />
        <CardBody>
          <BarList label={t('Campaigns', 'الحملات')} data={campaigns.map(({ campaign, count }) => ({ key: campaign.id, label: campaign.name, value: count }))} format={num} />
          <DemoSourceLine basis={t('campaign reach needs posts linked to campaigns on the server', 'وصول الحملات يحتاج ربط البوستات بالحملات على السيرفر')} />
        </CardBody>
      </Card>
    </div>
  );
}

function PostTable({ posts, now, caption }: { posts: Post[]; now: number; caption: string }) {
  const { t, compact, date, pct } = useI18n();
  const { store } = useLiveData();
  const columns: Column<Post>[] = [
    {
      key: 'title',
      header: t('Post', 'البوست'),
      cell: (post) => (
        <a href={post.permalink} target="_blank" rel="noreferrer" className="cell-title__link u-row" dir="auto">
          <ChannelIcon channel={post.platform} />
          <span className="u-truncate">{post.title || t('(no caption)', '(بدون نص)')}</span>
          <ExternalLink size={12} aria-hidden />
        </a>
      ),
    },
    { key: 'account', header: t('Account', 'الحساب'), cell: (post) => <span className="u-sm">{post.accountName || channelName[post.platform]}</span>, secondary: true },
    { key: 'date', header: t('Published', 'النشر'), sort: (post) => post.ts, cell: (post) => <span className="u-tnum u-sm">{date(post.ts, 'dayShort')}</span> },
    { key: 'reach', header: t('Reach', 'الوصول'), align: 'end', sort: (post) => post.metrics.reach, cell: (post) => <span className="u-tnum">{compact(post.metrics.reach)}</span>, secondary: true },
    { key: 'views', header: t('Views', 'المشاهدات'), align: 'end', sort: (post) => post.metrics.views, cell: (post) => <span className="u-tnum">{compact(post.metrics.views)}</span> },
    { key: 'interactions', header: t('Interactions', 'التفاعل'), align: 'end', sort: (post) => (post.measured ? post.interactions : null), cell: (post) => <span className="u-tnum">{compact(post.measured ? post.interactions : null)}</span> },
    { key: 'rate', header: t('Rate', 'المعدل'), align: 'end', sort: (post) => post.engagementRate, cell: (post) => <span className="u-tnum">{pct(post.engagementRate, 1)}</span>, secondary: true },
  ];
  return (
    <>
      <DataTable caption={caption} rows={posts} columns={columns} rowKey={(post) => post.key} pageSize={10} dense empty={<EmptyState compact title={t('No posts in this period.', 'لا بوستات في هذه الفترة.')} />} />
      <SourceLine source={[...new Set(posts.map((post) => post.platform))].map((platform) => sourceOf(platform, store.data.connectors))} now={now} />
    </>
  );
}

function ContentTab({ period }: { period: number }) {
  const { t, num, oneDecimal } = useI18nPlus();
  const now = useClock();
  const { current } = usePeriodPosts(period);
  const top = topPosts(current, 10);
  const measured = current.filter((post) => post.measured);
  const weak = [...measured].sort((a, b) => a.interactions - b.interactions).slice(0, 10);
  const types = [...new Set(current.map((post) => post.contentType || 'post'))].map((type) => {
    const list = current.filter((post) => (post.contentType || 'post') === type);
    const s = summarize(list);
    return { key: type, label: type, value: s.average, display: `${oneDecimal(s.average)} · n=${num(s.measured)}` };
  });
  const hours = Array.from({ length: 24 }, (_, hour) => ({ key: String(hour), label: `${String(hour).padStart(2, '0')}:00`, value: current.filter((post) => post.hour === hour).length }));

  return (
    <LiveGate needs="posts">
      <div className="u-stack u-stack--lg">
        <Card>
          <CardHeader title={t('Top posts', 'أفضل البوستات')} description={t('By interactions, measured posts only', 'حسب التفاعل، البوستات المقاسة فقط')} />
          <PostTable posts={top} now={now} caption={t('Top posts', 'أفضل البوستات')} />
        </Card>
        <div className="u-grid u-grid--2">
          <Card>
            <CardHeader title={t('Content types', 'أنواع المحتوى')} description={t('Average interactions per measured post (n = sample size)', 'متوسط التفاعل لكل بوست مقاس (n = حجم العينة)')} />
            <CardBody>
              <BarList label={t('Content types', 'أنواع المحتوى')} data={types} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('Publishing time', 'وقت النشر')} description={t('Posts by hour of day (business time zone)', 'البوستات حسب ساعة النشر (توقيت الشركة)')} />
            <CardBody>
              <ColumnChart data={hours} label={t('Posts by hour', 'البوستات حسب الساعة')} format={num} height={110} />
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title={t('Weakest measured posts', 'أضعف البوستات المقاسة')} description={t('Worth reviewing: topic, format or timing', 'تستحق المراجعة: الموضوع أو الشكل أو التوقيت')} />
          <PostTable posts={weak} now={now} caption={t('Weakest posts', 'أضعف البوستات')} />
        </Card>
      </div>
    </LiveGate>
  );
}

/** num + a one-decimal formatter that keeps missing values as —. */
function useI18nPlus() {
  const i18n = useI18n();
  return { ...i18n, oneDecimal: (value: number | null) => (value == null ? '—' : new Intl.NumberFormat(i18n.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { maximumFractionDigits: 1 }).format(value)) };
}

function Platforms({ period }: { period: number }) {
  const { t, num, compact, relative, oneDecimal } = useI18nPlus();
  const { store } = useLiveData();
  const now = useClock();
  const { current } = usePeriodPosts(period);
  const rows = byPlatform(current).filter((row) => row.platform !== 'website');
  const web = websiteTotals(store.data.website, period, dayNumber(now));
  const connector = (platform: string) => store.data.connectors.find((entry) => entry.platform === platform);
  return (
    <LiveGate>
      <div className="platform-grid">
        {rows.map((row) => {
          const status = connector(row.platform);
          return (
            <Card key={row.platform}>
              <CardHeader
                title={
                  <span className="u-row">
                    <ChannelIcon channel={row.platform} size={16} /> {channelName[row.platform]}
                  </span>
                }
                actions={<Badge tone={status?.status === 'connected' ? 'success' : status?.status === 'error' ? 'danger' : 'neutral'} dot>{status?.status === 'connected' ? t('Connected', 'متصل') : status?.status === 'error' ? t('Error', 'خطأ') : t('Needs setup', 'يحتاج إعداد')}</Badge>}
              />
              <CardBody>
                {status?.status !== 'connected' && row.count === 0 ? (
                  <DataNotice status={status?.status === 'error' ? 'error' : 'needs_setup'} message={status?.message} setupHref="/connections" />
                ) : (
                  <>
                    <dl className="metric-grid">
                      <div>
                        <dt>{t('Posts', 'بوستات')}</dt>
                        <dd className="u-tnum">{num(row.count)}</dd>
                      </div>
                      <div>
                        <dt>{t('Interactions', 'التفاعل')}</dt>
                        <dd className="u-tnum">{row.measured ? compact(row.interactions) : '—'}</dd>
                      </div>
                      <div>
                        <dt>{t('Avg / post', 'المتوسط / بوست')}</dt>
                        <dd className="u-tnum">{oneDecimal(row.average)}</dd>
                      </div>
                      <div>
                        <dt>{t('Reach', 'الوصول')}</dt>
                        <dd className="u-tnum">{row.reachCount ? compact(row.reach) : '—'}</dd>
                      </div>
                      <div>
                        <dt>{t('Views', 'المشاهدات')}</dt>
                        <dd className="u-tnum">{row.viewsCount ? compact(row.views) : '—'}</dd>
                      </div>
                      <div>
                        <dt>{t('Measured', 'مقاس')}</dt>
                        <dd className="u-tnum">{row.count ? `${num(row.measured)}/${num(row.count)}` : '—'}</dd>
                      </div>
                    </dl>
                    <SourceLine source={sourceOf(row.platform, store.data.connectors)} now={now} />
                  </>
                )}
              </CardBody>
            </Card>
          );
        })}
        <Card>
          <CardHeader
            title={
              <span className="u-row">
                <ChannelIcon channel="website" size={16} /> {t('Website (GA4)', 'الموقع (GA4)')}
              </span>
            }
          />
          <CardBody>
            {connector('website')?.status !== 'connected' && !web.days ? (
              <DataNotice status={connector('website')?.status === 'error' ? 'error' : 'needs_setup'} message={connector('website')?.message} setupHref="/connections" />
            ) : (
              <>
                <dl className="metric-grid">
                  <div>
                    <dt>{t('Page views', 'مشاهدات الصفحات')}</dt>
                    <dd className="u-tnum">{compact(web.views)}</dd>
                  </div>
                  <div>
                    <dt>{t('Sessions', 'الجلسات')}</dt>
                    <dd className="u-tnum">{compact(web.sessions)}</dd>
                  </div>
                  <div>
                    <dt>{t('Days with data', 'أيام ببيانات')}</dt>
                    <dd className="u-tnum">{num(web.days)}</dd>
                  </div>
                </dl>
                <SourceLine source={sourceOf('website', store.data.connectors)} now={now} />
              </>
            )}
          </CardBody>
        </Card>
      </div>
      <p className="u-xs u-muted">{t(`Last connector check: ${relative(store.data.connectors.reduce((latest, entry) => Math.max(latest, entry.checkedAt ? Date.parse(entry.checkedAt) : 0), 0) || null)}`, `آخر فحص للمصادر: ${relative(store.data.connectors.reduce((latest, entry) => Math.max(latest, entry.checkedAt ? Date.parse(entry.checkedAt) : 0), 0) || null)}`)}</p>
    </LiveGate>
  );
}

function Departments() {
  const { t, tx, num, pct, ratio } = useI18n();
  const { state } = useWorkspace();
  const now = useClock();
  const progress = allPlanProgress(state, now);
  return (
    <div className="u-stack">
      <Card>
        <CardHeader title={t('Monthly plan completion', 'إنجاز الخطط الشهرية')} />
        <div className="ui-table-scroll">
          <table className="ui-table">
            <caption className="sr-only">{t('Monthly plan completion', 'إنجاز الخطط الشهرية')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('Department', 'القسم')}</th>
                <th scope="col" className="ui-table__end">{t('Published', 'منشور')}</th>
                <th scope="col" className="ui-table__end">{t('In progress', 'قيد العمل')}</th>
                <th scope="col" className="ui-table__end">{t('Missing', 'ناقص')}</th>
                <th scope="col" className="ui-table__end">{t('Overdue', 'متأخر')}</th>
                <th scope="col">{t('Completion', 'الإنجاز')}</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((row) => {
                const kpis = operationalKpis(state, now, { departmentId: row.departmentId });
                return (
                  <tr key={row.plan.id}>
                    <td>{tx(departmentById(row.departmentId)!.name)}</td>
                    <td className="ui-table__end u-tnum">
                      {ratio(row.published, row.target)}
                    </td>
                    <td className="ui-table__end u-tnum">{num(row.inFlight)}</td>
                    <td className="ui-table__end u-tnum">{num(row.missing)}</td>
                    <td className="ui-table__end u-tnum">{num(kpis.openOverdue)}</td>
                    <td>
                      <span className="u-row">
                        <ProgressBar value={row.completion} tone={progressTone(row.completion)} label={tx(departmentById(row.departmentId)!.name)} />
                        <span className="u-tnum u-sm">{pct(row.completion)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <CardBody>
          <DemoSourceLine basis={t('workflow records', 'سجلات سير العمل')} />
        </CardBody>
      </Card>
    </div>
  );
}

function Team() {
  const { t, tx, num, pct } = useI18n();
  const { state } = useWorkspace();
  const now = useClock();
  const people = state.users.filter((user) => user.status === 'active' && user.role !== 'admin');
  return (
    <Card>
      <CardHeader title={t('Operational KPIs', 'مؤشرات التشغيل')} description={t('Delivery this month: completed, on time, reviewed. Social reach is deliberately not an employee KPI.', 'التسليم هذا الشهر: المنجز، في الموعد، المراجع. وصول السوشيال ليس مؤشر أداء للموظف عن قصد.')} />
      <div className="ui-table-scroll">
        <table className="ui-table">
          <caption className="sr-only">{t('Operational KPIs per person', 'مؤشرات التشغيل لكل شخص')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('Person', 'الشخص')}</th>
              <th scope="col" className="ui-table__secondary">{t('Department', 'القسم')}</th>
              <th scope="col" className="ui-table__end">{t('Tasks done', 'مهام منجزة')}</th>
              <th scope="col" className="ui-table__end">{t('On time', 'في الموعد')}</th>
              <th scope="col" className="ui-table__end">{t('Posts published', 'بوستات منشورة')}</th>
              <th scope="col" className="ui-table__end">{t('Reviews', 'مراجعات')}</th>
              <th scope="col" className="ui-table__end">{t('Overdue now', 'متأخر الآن')}</th>
            </tr>
          </thead>
          <tbody>
            {people.map((user) => {
              const kpis = operationalKpis(state, now, { userId: user.id });
              return (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td className="ui-table__secondary">{user.departmentId ? tx(departmentById(user.departmentId)!.name) : '—'}</td>
                  <td className="ui-table__end u-tnum">{num(kpis.tasksCompleted)}</td>
                  <td className="ui-table__end u-tnum">{pct(kpis.tasksOnTime)}</td>
                  <td className="ui-table__end u-tnum">{num(kpis.postsPublished)}</td>
                  <td className="ui-table__end u-tnum">{num(kpis.reviewsCompleted)}</td>
                  <td className="ui-table__end u-tnum">{kpis.openOverdue ? <span className="due due--overdue">{num(kpis.openOverdue)}</span> : num(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CardBody>
        <DemoSourceLine basis={t('tasks, approvals and content records this month', 'المهام والاعتمادات وعناصر المحتوى هذا الشهر')} />
      </CardBody>
    </Card>
  );
}

function Learning() {
  const { t, num, date, oneDecimal } = useI18nPlus();
  const { store } = useLiveData();
  const { state } = useWorkspace();
  const now = useClock();
  const slots = bestSlots(store.data.posts, dayNumber(now)).slice(0, 6);
  const templates = state.templates
    .map((template) => ({ template, count: state.content.filter((item) => item.templateId === template.id && item.status === 'published').length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const weekday = (value: number) => (value ? date(DateTime.fromObject({ weekday: value as 1 }, { zone: businessZone() }).toMillis(), 'weekday') : t('Any day', 'أي يوم'));
  return (
    <div className="u-grid u-grid--2">
      <Card>
        <CardHeader title={t('Best timing patterns', 'أفضل أوقات النشر')} description={t('Weekday and hour slots ranked by average interactions. A slot needs at least two measured posts.', 'أوقات مرتبة حسب متوسط التفاعل. الوقت يحتاج بوستين مقاسين على الأقل.')} />
        <CardBody>
          <LiveGate needs="posts">
            {slots.length === 0 ? (
              <EmptyState compact title={t('Not enough measured history yet.', 'لا يوجد سجل مقاس كافٍ بعد.')} />
            ) : (
              <>
                <BarList
                  label={t('Best slots', 'أفضل الأوقات')}
                  data={slots.map((slot) => ({ key: `${slot.weekday}-${slot.hour}`, label: `${weekday(slot.weekday)} · ${String(slot.hour).padStart(2, '0')}:00`, value: slot.average, display: `${oneDecimal(slot.average)} · n=${num(slot.posts)}` }))}
                />
                <p className="u-xs u-muted">{t('Small samples (n < 4) are low confidence.', 'العينات الصغيرة (n أقل من 4) ثقتها منخفضة.')}</p>
                <SourceLine source={store.data.connectors.filter((connector) => connector.status === 'connected').map((connector) => sourceOf(connector.platform, store.data.connectors))} now={now} />
              </>
            )}
          </LiveGate>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Recurring formats that ship', 'قوالب متكررة يتم نشرها')} description={t('Templates by items published', 'القوالب حسب العناصر المنشورة')} />
        <CardBody>
          {templates.length === 0 ? (
            <EmptyState compact title={t('No template-based posts published yet.', 'لم يُنشر محتوى من قوالب بعد.')} />
          ) : (
            <BarList label={t('Templates', 'القوالب')} data={templates.map(({ template, count }) => ({ key: template.id, label: t(template.name.en, template.name.ar), value: count }))} format={num} />
          )}
          <DemoSourceLine basis={t('linking published items to live posts will add their performance here', 'ربط العناصر المنشورة بالبوستات الحية سيضيف أداءها هنا')} />
        </CardBody>
      </Card>
    </div>
  );
}
