import { useMemo, useState, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { AlarmClock, CalendarClock, CalendarX2, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, FilePen, Plus, Send, Upload } from 'lucide-react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { Link } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { EmptyState } from '../../components/feedback/States';
import { Button, ButtonLink } from '../../components/ui/Button';
import { GOAL_INFO, GOALS, goalResult } from '../../domain/goals';
import { planSlots, type Slot } from '../../features/content-pipeline/slots';
import { useAuth } from '../../features/auth/AuthProvider';
import { useCreateContent } from '../../features/content/CreateContent';
import { GOAL_ICON } from '../../features/content-pipeline/PostPlan';
import type { Channel, PipelineItem } from '../../features/content-pipeline/types';
import { usePipeline } from '../../features/content-pipeline/usePipeline';
import { PLATFORMS, usePublishingBoard } from '../../features/publishing/PublishDialog';
import { useClock } from '../../features/workspace/hooks';
import { useI18n } from '../../i18n/I18nProvider';
import { businessZone, compact, greeting, parseTimestamp } from '../../lib/format';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

const zoned = (ms: number) => DateTime.fromMillis(ms, { zone: businessZone() });
const dayOf = (iso: string) => zoned(parseTimestamp(iso)).toISODate() ?? '';
const IN_WORK = ['idea', 'draft', 'in_production', 'ready_for_review', 'changes_requested'];
/** The day a post belongs to: its publish time, its planned day, or when it went out. */
const dayTime = (item: PipelineItem) => item.scheduledAt ?? item.plannedFor ?? (item.status === 'published' ? item.published?.[0]?.publishedAt ?? item.updatedAt : null);

type Stage = 'published' | 'scheduled' | 'approved' | 'work' | 'missing';
const STAGES: { id: Stage; en: string; ar: string; to: string }[] = [
  { id: 'published', en: 'Published', ar: 'تم النشر', to: '/analytics?section=posts' },
  { id: 'scheduled', en: 'Scheduled', ar: 'مجدول', to: '/publish?view=scheduled' },
  { id: 'approved', en: 'Approved, needs a time', ar: 'معتمد ينتظر موعدًا', to: '/publish' },
  { id: 'work', en: 'Being made or reviewed', ar: 'قيد التنفيذ والمراجعة', to: '/content' },
  { id: 'missing', en: 'Not made yet', ar: 'لم يُصمَّم بعد', to: '/calendar' },
];
const stageOf = (item: PipelineItem): Stage => item.status === 'published' ? 'published' : item.status === 'scheduled' ? 'scheduled' : item.status === 'approved' ? 'approved' : 'work';

/**
 * The manager's view of one month: how much of the plan is out, what is stuck and with whom, which coming days
 * are empty, and how the published posts did against their goals. Every number links to where it is fixed.
 */
export function OverviewPage() {
  const { t, tx, date } = useI18n();
  const { user, can } = useAuth();
  const now = useClock();
  const create = useCreateContent();
  const { items, team, error } = usePipeline();
  const { store } = useLiveData();
  const { board } = usePublishingBoard();
  const [offset, setOffset] = useState(0);
  usePageMeta(t('Overview', 'نظرة عامة'), [{ label: t('Overview', 'نظرة عامة') }]);

  const start = zoned(now).startOf('month').plus({ months: offset });
  const end = start.endOf('month');
  const inMonth = (iso: string | null) => Boolean(iso) && parseTimestamp(iso!) >= start.toMillis() && parseTimestamp(iso!) <= end.toMillis();
  const live = useMemo(() => (items ?? []).filter((item) => !['archived', 'cancelled'].includes(item.status)), [items]);
  const slots: Slot[] = useMemo(() => (store.phase !== 'ready' ? [] : planSlots(store.data.plans)), [store]);
  const livePosts = store.phase === 'ready' ? store.data.posts.filter((post) => inMonth(post.publishedAt)) : [];

  const monthItems = live.filter((item) => inMonth(dayTime(item)));
  const monthSlots = slots.filter((slot) => inMonth(slot.scheduledAt));
  const counts: Record<Stage, number> = { published: 0, scheduled: 0, approved: 0, work: 0, missing: monthSlots.length };
  for (const item of monthItems) counts[stageOf(item)]++;
  const planned = monthItems.length + monthSlots.length;
  const undated = live.filter((item) => !dayTime(item) && IN_WORK.includes(item.status)).length;

  const isLate = (item: PipelineItem) => item.status !== 'published' && Boolean(dayTime(item)) && parseTimestamp(dayTime(item)!) < now;
  const late = [...live.filter(isLate).map((item) => ({ id: item.id, title: item.title, to: `/content/${item.id}`, at: dayTime(item)! })), ...slots.filter((slot) => slot.ms < now).map((slot) => ({ id: slot.id, title: slot.title, to: `/calendar?date=${dayOf(slot.scheduledAt)}`, at: slot.scheduledAt }))].sort((a, b) => a.at.localeCompare(b.at));
  const inReview = live.filter((item) => item.status === 'ready_for_review').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const changes = live.filter((item) => item.status === 'changes_requested');
  const toSchedule = live.filter((item) => item.status === 'approved');
  const failed = [...(board?.queue ?? []).filter((row) => row.state === 'failed'), ...(board?.jobs ?? []).filter((job) => job.state === 'failed' || job.state === 'unknown')];

  const loading = !items;
  if (error && !items) return <EmptyState title={t('The content service is not reachable.', 'خدمة المحتوى غير متاحة.')} text={error} />;
  const n = (value: number) => (loading ? '—' : value);
  const isThisMonth = offset === 0;

  return (
    <div className="u-stack u-stack--lg ov">
      <PageHeader
        title={<>{greeting(now)}، {user.name.split(' ')[0]}</>}
        description={t('Where this month’s content stands, what needs you now, and how it is doing.', 'أين يقف محتوى الشهر، وما الذي يحتاجك الآن، وكيف كان أداؤه.')}
        actions={<>
          {can('content.schedule') && <ButtonLink to="/calendar" variant="ghost" icon={<Upload size={15} />}>{t('Upload a plan', 'ارفع خطة')}</ButtonLink>}
          {can('content.create') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => create.open()}>{t('New post', 'منشور جديد')}</Button>}
        </>}
      />

      <section className="ov-plan">
        <header className="ov-plan__head">
          <div>
            <span className="ov-eyebrow">{t('Month plan', 'خطة الشهر')}</span>
            <div className="ov-month">
              <button type="button" onClick={() => setOffset(offset - 1)} aria-label={t('Previous month', 'الشهر السابق')}><ChevronRight size={16} className="u-flip" /></button>
              <h2>{date(start.toISODate()!, 'month')}</h2>
              <button type="button" onClick={() => setOffset(offset + 1)} aria-label={t('Next month', 'الشهر التالي')}><ChevronLeft size={16} className="u-flip" /></button>
              {!isThisMonth && <button type="button" className="ov-month__today" onClick={() => setOffset(0)}>{t('This month', 'هذا الشهر')}</button>}
            </div>
          </div>
          <div className="ov-plan__score">
            <span><b className="u-tnum">{n(counts.published)}</b> / <span className="u-tnum">{n(planned)}</span></span>
            <small>{t('planned posts published', 'من المنشورات المخططة تم نشرها')}</small>
          </div>
        </header>
        {planned ? <>
          <div className="ov-bar" role="img" aria-label={STAGES.map((stage) => `${tx({ en: stage.en, ar: stage.ar })}: ${counts[stage.id]}`).join('، ')}>
            {STAGES.filter((stage) => counts[stage.id]).map((stage) => <span key={stage.id} data-stage={stage.id} style={{ flexGrow: counts[stage.id] }} />)}
          </div>
          <ul className="ov-legend">{STAGES.map((stage) => <li key={stage.id}><Link to={stage.to} data-stage={stage.id}><i aria-hidden /><b className="u-tnum">{counts[stage.id]}</b> {t(stage.en, stage.ar)}</Link></li>)}</ul>
        </> : <p className="u-sm u-muted">{t('Nothing is planned for this month yet. Upload the month’s plan or give posts a planned day.', 'لا يوجد شيء مخطط لهذا الشهر بعد. ارفع خطة الشهر أو حدد يومًا مستهدفًا للمنشورات.')}</p>}
        {undated > 0 && isThisMonth && <p className="ov-note"><CalendarX2 size={14} /> {t(`${undated} posts in progress have no planned day, so they are not counted here.`, `${undated} منشور قيد العمل بدون يوم مستهدف، فلا يُحسب هنا.`)} <Link to="/content">{t('Give them a day', 'حدد لها يومًا')}</Link></p>}
      </section>

      <section aria-labelledby="ov-actions-title">
        <h2 className="ov-title" id="ov-actions-title">{t('Needs action now', 'مطلوب الآن')}</h2>
        <div className="ov-actions">
          <ActionTile tone="brand" icon={<FilePen size={16} />} count={n(inReview.length)} label={t('Waiting for approval', 'بانتظار الاعتماد')} who={t('Marketing manager', 'مدير التسويق')} rows={inReview.map((item) => ({ id: item.id, title: item.title, to: `/content/${item.id}` }))} to="/content" />
          <ActionTile tone="warning" icon={<AlarmClock size={16} />} count={n(changes.length)} label={t('Needs changes', 'مطلوب تعديل')} who={t('Post owner', 'صاحب المنشور')} rows={changes.map((item) => ({ id: item.id, title: item.title, to: `/content/${item.id}` }))} to="/content" />
          <ActionTile tone="success" icon={<CalendarClock size={16} />} count={n(toSchedule.length)} label={t('Approved, needs a time', 'معتمد ينتظر موعدًا')} who={t('Content supervisor', 'مسؤول المحتوى')} rows={toSchedule.map((item) => ({ id: item.id, title: item.title, to: `/content/${item.id}` }))} to={can('content.schedule') ? '/publish' : '/content'} />
          <ActionTile tone="danger" icon={<CircleAlert size={16} />} count={n(late.length)} label={t('Late', 'متأخر')} who={t('Its day passed, not published', 'فات يومه ولم يُنشر')} rows={late} to="/calendar" />
          {board && <ActionTile tone="danger" icon={<Send size={16} />} count={failed.length} label={t('Publishing failed', 'فشل النشر')} who={t('Check, then retry', 'راجع ثم أعد المحاولة')} rows={failed.slice(0, 3).map((row) => ({ id: row.id, title: live.find((item) => item.id === row.contentId)?.title ?? t('Post', 'منشور'), to: `/content/${row.contentId}` }))} to="/publish?view=results" />}
        </div>
      </section>

      {isThisMonth && <NextDays now={now} items={live} slots={slots} />}

      <div className="ov-grid">
        <GoalBreakdown items={monthItems} slots={monthSlots} />
        <PlatformBreakdown items={monthItems} slots={monthSlots} posts={livePosts} analytics={can('analytics.view')} />
      </div>

      <div className="ov-grid">
        <TeamTable items={monthItems} late={live.filter(isLate)} team={team} me={user} />
        {can('analytics.view') && <TopPosts posts={livePosts} />}
      </div>
    </div>
  );
}

function ActionTile({ tone, icon, count, label, who, rows, to }: { tone: 'brand' | 'warning' | 'success' | 'danger'; icon: ReactNode; count: number | string; label: string; who: string; rows: { id: string; title: string; to: string }[]; to: string }) {
  const { t } = useI18n();
  return <article className="ov-action" data-tone={tone} data-zero={count === 0 || undefined}>
    <Link to={to} className="ov-action__head"><span className="ov-action__icon">{icon}</span><span className="ov-action__text"><strong>{label}</strong><small>{who}</small></span><b className="u-tnum">{count}</b></Link>
    {rows.length > 0 ? <ul>{rows.slice(0, 3).map((row) => <li key={row.id}><Link to={row.to} dir="auto">{row.title}</Link></li>)}</ul> : <p className="ov-action__clear">{t('Nothing here.', 'لا شيء هنا.')}</p>}
    {rows.length > 3 && <Link to={to} className="ov-more">{t(`+${rows.length - 3} more`, `+${rows.length - 3} أخرى`)}</Link>}
  </article>;
}

/** Two weeks ahead: covered days, days with only plan rows (made by nobody yet), and empty days. */
function NextDays({ now, items, slots }: { now: number; items: PipelineItem[]; slots: Slot[] }) {
  const { t, date } = useI18n();
  const today = zoned(now).startOf('day');
  const days = Array.from({ length: 14 }, (_, index) => today.plus({ days: index }));
  const posts = new Map<string, number>(), planned = new Map<string, number>();
  for (const item of items) {
    const when = dayTime(item);
    if (when && item.status !== 'published' && parseTimestamp(when) >= today.toMillis()) posts.set(dayOf(when), (posts.get(dayOf(when)) ?? 0) + 1);
  }
  for (const slot of slots) planned.set(dayOf(slot.scheduledAt), (planned.get(dayOf(slot.scheduledAt)) ?? 0) + 1);
  const empty = days.filter((day) => !posts.get(day.toISODate()!) && !planned.get(day.toISODate()!)).length;
  return <section className="ov-card">
    <header className="ov-card__head"><div><h2>{t('Next 14 days', 'الأيام الـ14 القادمة')}</h2><p>{empty ? t(`${empty} days have nothing at all. Fill them from the calendar.`, `${empty} يومًا بلا أي شيء. املأها من التقويم.`) : t('Every day has something planned.', 'كل يوم فيه شيء مخطط.')}</p></div><Link to="/calendar" className="ov-link">{t('Open the calendar', 'افتح التقويم')}</Link></header>
    <ol className="ov-days">{days.map((day) => {
      const key = day.toISODate()!;
      const p = posts.get(key) ?? 0, s = planned.get(key) ?? 0;
      const state = p ? 'ready' : s ? 'planned' : 'empty';
      return <li key={key}><Link to={`/calendar?date=${key}`} data-state={state}>
        <small>{date(key, 'weekday')}</small><b className="u-tnum">{day.day}</b>
        <span>{p ? t(`${p} posts`, `${p} منشور`) : s ? t(`${s} planned`, `${s} مخطط`) : t('Empty', 'فارغ')}</span>
      </Link></li>;
    })}</ol>
    <ul className="ov-days__legend"><li data-state="ready">{t('Has a post', 'فيه منشور')}</li><li data-state="planned">{t('Planned, not made', 'مخطط ولم يُصمَّم')}</li><li data-state="empty">{t('Nothing', 'لا شيء')}</li></ul>
  </section>;
}

/** Posts per goal this month, how many went out, and the goal's own number from the published ones. */
function GoalBreakdown({ items, slots }: { items: PipelineItem[]; slots: Slot[] }) {
  const { t, tx } = useI18n();
  const rows = GOALS.map((goal) => {
    const mine = items.filter((item) => item.goal === goal);
    const published = mine.filter((item) => item.status === 'published');
    const values = published.flatMap((item) => (item.published ?? []).map((post) => goalResult(goal, post.metrics))).filter((value): value is number => value != null);
    return { goal, planned: mine.length + slots.filter((slot) => slot.goal === goal).length, published: published.length, result: values.length ? values.reduce((a, b) => a + b, 0) : null };
  });
  const none = items.filter((item) => !item.goal).length + slots.filter((slot) => !slot.goal).length;
  const max = Math.max(1, ...rows.map((row) => row.planned));
  return <section className="ov-card">
    <header className="ov-card__head"><div><h2>{t('By goal', 'حسب الهدف')}</h2><p>{t('Published out of planned, and each goal’s own number.', 'المنشور من المخطط، ورقم كل هدف.')}</p></div></header>
    <ul className="ov-goals">{rows.map((row) => {
      const Icon = GOAL_ICON[row.goal];
      return <li key={row.goal} data-goal={row.goal}>
        <span className="ov-goals__name"><Icon size={15} /> {tx(GOAL_INFO[row.goal].label)}</span>
        <span className="ov-goals__track" aria-hidden><i style={{ width: `${(row.planned / max) * 100}%` }} /><i data-done style={{ width: `${(row.published / max) * 100}%` }} /></span>
        <span className="ov-goals__nums u-tnum">{row.published}/{row.planned}</span>
        <span className="ov-goals__result"><b className="u-tnum">{row.result == null ? '—' : compact(row.result)}</b><small>{tx(GOAL_INFO[row.goal].metric)}</small></span>
      </li>;
    })}</ul>
    {none > 0 && <p className="ov-note"><CircleAlert size={14} /> {t(`${none} planned posts have no goal, so they cannot be judged.`, `${none} منشور مخطط بلا هدف، فلا يمكن قياسه.`)}</p>}
  </section>;
}

/** Every platform the month touches: planned, published from the workflow, and what the sync saw live. */
function PlatformBreakdown({ items, slots, posts, analytics }: { items: PipelineItem[]; slots: Slot[]; posts: { platform: Channel; interactions: number }[]; analytics: boolean }) {
  const { t } = useI18n();
  const rows = PLATFORMS.map((platform) => ({
    ...platform,
    planned: items.filter((item) => item.channels.includes(platform.channel)).length + slots.filter((slot) => (slot.platforms as Channel[]).includes(platform.channel)).length,
    published: items.filter((item) => item.status === 'published' && item.channels.includes(platform.channel)).length,
    live: posts.filter((post) => post.platform === platform.channel),
  })).filter((row) => row.planned || row.live.length);
  return <section className="ov-card">
    <header className="ov-card__head"><div><h2>{t('By platform', 'حسب المنصة')}</h2><p>{analytics ? t('Planned and published here, and what went live on the accounts.', 'المخطط والمنشور هنا، وما ظهر فعليًا على الحسابات.') : t('Planned and published this month.', 'المخطط والمنشور هذا الشهر.')}</p></div><Link to="/publish?view=accounts" className="ov-link">{t('Accounts', 'الحسابات')}</Link></header>
    {rows.length ? <table className="ov-table">
      <thead><tr><th>{t('Platform', 'المنصة')}</th><th>{t('Planned', 'مخطط')}</th><th>{t('Published', 'منشور')}</th>{analytics && <th>{t('Live', 'فعلي')}</th>}{analytics && <th>{t('Interactions', 'التفاعل')}</th>}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.channel}>
        <td><span className="ov-platform"><ChannelIcon channel={row.channel} size={15} /> {row.name}</span></td>
        <td className="u-tnum">{row.planned}</td><td className="u-tnum">{row.published}</td>
        {analytics && <td className="u-tnum">{row.live.length}</td>}
        {analytics && <td className="u-tnum">{row.live.length ? compact(row.live.reduce((sum, post) => sum + post.interactions, 0)) : '—'}</td>}
      </tr>)}</tbody>
    </table> : <p className="u-sm u-muted">{t('No platform has anything this month yet.', 'لا توجد منصة عليها شيء هذا الشهر بعد.')}</p>}
  </section>;
}

function TeamTable({ items, late, team, me }: { items: PipelineItem[]; late: PipelineItem[]; team: { id: string; name: string }[]; me: { id: string; name: string } }) {
  const { t } = useI18n();
  const rows = [...new Set([...items, ...late].map((item) => item.ownerId))].map((id) => {
    const mine = items.filter((item) => item.ownerId === id);
    return {
      id, name: team.find((member) => member.id === id)?.name ?? (id === me.id ? me.name : t('Former member', 'عضو سابق')),
      total: mine.length, done: mine.filter((item) => item.status === 'published').length,
      review: mine.filter((item) => item.status === 'ready_for_review').length,
      late: late.filter((item) => item.ownerId === id).length,
    };
  }).sort((a, b) => b.total - a.total);
  return <section className="ov-card">
    <header className="ov-card__head"><div><h2>{t('Team', 'الفريق')}</h2><p>{t('Each person’s posts this month, and what is late.', 'منشورات كل شخص هذا الشهر، وما تأخر منها.')}</p></div></header>
    {rows.length ? <table className="ov-table">
      <thead><tr><th>{t('Person', 'الشخص')}</th><th>{t('Published', 'تم نشره')}</th><th>{t('In review', 'في المراجعة')}</th><th>{t('Late', 'متأخر')}</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td>{row.name}</td>
        <td><span className="ov-progress"><span><i style={{ width: `${row.total ? (row.done / row.total) * 100 : 0}%` }} /></span><small className="u-tnum">{row.done}/{row.total}</small></span></td>
        <td className="u-tnum">{row.review}</td>
        <td className="u-tnum" data-late={row.late || undefined}>{row.late}</td>
      </tr>)}</tbody>
    </table> : <p className="u-sm u-muted">{t('Nobody has posts this month yet.', 'لا أحد لديه منشورات هذا الشهر بعد.')}</p>}
  </section>;
}

function TopPosts({ posts }: { posts: { externalId: string; platform: Channel; accountName: string; title: string; permalink: string; thumbnail: string; interactions: number; metrics: { reach: number | null; views: number | null } }[] }) {
  const { t } = useI18n();
  const top = [...posts].sort((a, b) => b.interactions - a.interactions).slice(0, 5);
  return <section className="ov-card">
    <header className="ov-card__head"><div><h2>{t('Best posts this month', 'أفضل منشورات الشهر')}</h2><p>{t('From the connected accounts, by interactions.', 'من الحسابات المربوطة، حسب التفاعل.')}</p></div><Link to="/analytics?section=posts" className="ov-link">{t('All posts', 'كل المنشورات')}</Link></header>
    {top.length ? <ol className="ov-top">{top.map((post) => <li key={`${post.platform}-${post.externalId}`}>
      {post.thumbnail ? <img src={post.thumbnail} alt="" loading="lazy" /> : <span className="ov-top__thumb"><ChannelIcon channel={post.platform} size={16} /></span>}
      <span className="ov-top__body"><b dir="auto">{post.title || t('Untitled post', 'منشور بلا عنوان')}</b><small><ChannelIcon channel={post.platform} size={11} /> <bdi>{post.accountName}</bdi> · {t('reach', 'وصول')} {compact(post.metrics.reach ?? post.metrics.views)}</small></span>
      <span className="ov-top__num u-tnum" title={t('Interactions', 'التفاعلات')}>{compact(post.interactions)}</span>
      {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" aria-label={t('Open the post', 'افتح المنشور')}><ExternalLink size={14} /></a>}
    </li>)}</ol> : <p className="u-sm u-muted">{t('No synced posts this month yet.', 'لا توجد منشورات مزامنة هذا الشهر بعد.')}</p>}
  </section>;
}
