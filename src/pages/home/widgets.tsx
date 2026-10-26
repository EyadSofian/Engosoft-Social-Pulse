import { useMemo, useState, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { ArrowUpRight, CalendarClock, CalendarHeart, CircleCheck, ExternalLink, FilePenLine, GraduationCap, Inbox, ListTodo, PlugZap, Sparkles, Trophy, Users } from 'lucide-react';
import { Link } from '../../app/router/router';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { ChannelIcon, Channels } from '../../components/data-display/ChannelIcon';
import { DemoSourceLine, SourceLine } from '../../components/data-display/Metric';
import { DataNotice, EmptyState, ProgressBar, SkeletonRows, progressTone } from '../../components/feedback/States';
import { Avatar, Person } from '../../components/ui/Avatar';
import { ApprovalBadge, Badge, DemoBadge, TaskStatusBadge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { departmentById } from '../../domain/catalog';
import type { ContentItem } from '../../domain/content';
import type { DepartmentId } from '../../domain/users';
import type { Task } from '../../domain/workflow';
import { useCreateContent } from '../../features/content/CreateContent';
import { ContentLine, DepartmentName, DueLabel, useMove } from '../../features/content/parts';
import { upcomingOpportunities } from '../../features/planning/opportunities';
import { BestTime } from '../../features/publishing/BestTime';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useAct } from '../../features/workspace/hooks';
import { allowedTransitions } from '../../features/workspace/permissions';
import { allPlanProgress, courseSignals, creditUsage, isTaskOpen, reviewQueue, scheduledThisWeek, teamWorkload, userById, visibleContent } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName, eventKindLabel, taskKindLabel } from '../../i18n/labels';
import { topPosts } from '../../lib/analytics';
import { dayNumber, parseTimestamp } from '../../lib/format';
import { sourceOf } from '../../services/adapters/live';

const ms = (iso: string | null) => (iso ? parseTimestamp(iso) : NaN);

/* ── Review queue ──────────────────────────────────────────────────── */

export function ReviewQueueCard({ now, limit = 5, title }: { now: number; limit?: number; title?: string }) {
  const { t } = useI18n();
  const { state, me } = useWorkspace();
  const { request, dialog } = useMove();
  const queue = reviewQueue(state);
  return (
    <Card>
      <CardHeader
        title={title ?? t('Needs your review', 'بانتظار مراجعتك')}
        count={queue.length}
        icon={<Inbox size={16} />}
        actions={queue.length > limit ? <ButtonLink to="/tasks?tab=approvals" size="sm" variant="ghost">{t('Open queue', 'افتح القائمة')}</ButtonLink> : undefined}
      />
      {queue.length === 0 ? (
        <EmptyState compact icon={<CircleCheck size={18} />} title={t('No content is waiting for approval.', 'لا يوجد محتوى بانتظار الاعتماد.')} text={t('Everything submitted by your teams has been reviewed.', 'كل ما أرسلته الفرق تمت مراجعته.')} />
      ) : (
        <ul className="review-list">
          {queue.slice(0, limit).map(({ item, approval }) => {
            const moves = allowedTransitions(me, item).map((move) => move.to);
            const course = state.courses.find((entry) => entry.id === item.courseId);
            return (
              <li key={approval.id} className="review-item">
                <div className="review-item__main">
                  <Link to={`/content/${item.id}`} className="review-item__title" dir="auto">
                    {item.title}
                  </Link>
                  <span className="review-item__meta">
                    {course && <span>{course.code} {course.cohort}</span>}
                    <DepartmentName id={item.departmentId} />
                    <ApprovalBadge status="pending" />
                    {approval.round > 1 && <Badge tone="info">{t(`Round ${approval.round}`, `الجولة ${approval.round}`)}</Badge>}
                    <DueLabel iso={item.dueAt} now={now} />
                  </span>
                </div>
                <div className="review-item__actions">
                  <ButtonLink to={`/content/${item.id}`} size="sm" variant="ghost">
                    {t('Review', 'مراجعة')}
                  </ButtonLink>
                  {moves.includes('changes_requested') && (
                    <Button size="sm" variant="secondary" onClick={() => request(item, 'changes_requested')}>
                      {t('Request changes', 'طلب تعديلات')}
                    </Button>
                  )}
                  {moves.includes('approved') && (
                    <Button size="sm" variant="primary" onClick={() => request(item, 'approved')}>
                      {t('Approve', 'اعتماد')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </Card>
  );
}

/* ── Content lists ─────────────────────────────────────────────────── */

export function ContentListCard({ title, icon, items, now, empty, more, description }: { title: string; icon?: ReactNode; items: ContentItem[]; now: number; empty: { title: string; text?: string }; more?: string; description?: string }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader title={title} count={items.length} icon={icon} description={description} actions={more && items.length > 6 ? <ButtonLink to={more} size="sm" variant="ghost">{t('See all', 'عرض الكل')}</ButtonLink> : undefined} />
      {items.length === 0 ? (
        <EmptyState compact title={empty.title} text={empty.text} />
      ) : (
        <ul className="lines">
          {items.slice(0, 6).map((item) => (
            <ContentLine key={item.id} item={item} now={now} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function WeekScheduleCard({ now, items }: { now: number; items?: ContentItem[] }) {
  const { t, date } = useI18n();
  const { state, me } = useWorkspace();
  const week = scheduledThisWeek(items ?? visibleContent(state, me), now);
  const days = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const item of week) {
      const key = date(item.publishAt, 'weekdayDate');
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [week, date]);
  return (
    <Card>
      <CardHeader title={t('Publishing this week', 'النشر هذا الأسبوع')} count={week.length} icon={<CalendarClock size={16} />} actions={<ButtonLink to="/calendar" size="sm" variant="ghost">{t('Open calendar', 'افتح التقويم')}</ButtonLink>} />
      {week.length === 0 ? (
        <EmptyState compact title={t('Nothing is scheduled this week.', 'لا يوجد شيء مجدول هذا الأسبوع.')} text={t('Approved content appears here once Marketing gives it a slot.', 'المحتوى المعتمد يظهر هنا عندما يحدد له التسويق موعدًا.')} />
      ) : (
        <div className="week-list">
          {days.map(([day, list]) => (
            <div key={day} className="week-list__day">
              <p className="week-list__label">{day}</p>
              <ul>
                {list.map((item) => (
                  <li key={item.id} className="week-list__item">
                    <span className="week-list__time u-tnum">{date(item.publishAt, 'time')}</span>
                    <Link to={`/content/${item.id}`} className="u-truncate" dir="auto">
                      {item.title}
                    </Link>
                    <Channels channels={item.channels} size={12} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Approved items without a slot: the publisher's queue. */
export function PublishingQueueCard({ now }: { now: number }) {
  const { t } = useI18n();
  const { state } = useWorkspace();
  const { request, dialog } = useMove();
  const approved = state.content.filter((item) => item.status === 'approved').sort((a, b) => ms(a.dueAt) - ms(b.dueAt));
  return (
    <Card>
      <CardHeader title={t('Approved — needs a slot', 'معتمد — يحتاج موعد نشر')} count={approved.length} icon={<CalendarClock size={16} />} />
      {approved.length === 0 ? (
        <EmptyState compact title={t('Every approved item has a slot.', 'كل المحتوى المعتمد له موعد.')} />
      ) : (
        <ul className="lines">
          {approved.map((item) => (
            <ContentLine
              key={item.id}
              item={item}
              now={now}
              actions={
                <Button size="sm" variant="primary" onClick={() => request(item, 'scheduled')}>
                  {t('Schedule', 'جدولة')}
                </Button>
              }
            />
          ))}
        </ul>
      )}
      {dialog}
    </Card>
  );
}

/* ── Plans ─────────────────────────────────────────────────────────── */

export function DepartmentProgressCard({ now, only }: { now: number; only?: DepartmentId[] }) {
  const { t, tx, num, pct, date, ratio } = useI18n();
  const { state } = useWorkspace();
  const rows = allPlanProgress(state, now).filter((row) => !only || only.includes(row.departmentId));
  return (
    <Card>
      <CardHeader title={t('Department progress', 'تقدم الأقسام')} description={t(`Monthly plans · ${date(now, 'month')}`, `الخطط الشهرية · ${date(now, 'month')}`)} actions={<ButtonLink to="/departments" size="sm" variant="ghost">{t('Plans', 'الخطط')}</ButtonLink>} />
      {rows.length === 0 ? (
        <EmptyState compact title={t('No monthly plan submitted yet.', 'لم تُرسل خطة شهرية بعد.')} text={t('Each department submits its plan at the start of the month.', 'كل قسم يرسل خطته في بداية الشهر.')} />
      ) : (
        <CardBody>
          <ul className="progress-list">
            {rows.map((row) => (
              <li key={row.plan.id}>
                <Link to={`/departments/${row.departmentId}`} className="progress-list__row">
                  <span className="progress-list__name">{tx(departmentById(row.departmentId)!.name)}</span>
                  <span className="progress-list__count u-tnum">
                    {t(`${ratio(row.published, row.target)} posts`, `${ratio(row.published, row.target)} منشور`)}
                  </span>
                  <span className="progress-list__pct u-tnum">{pct(row.completion)}</span>
                  <ProgressBar value={row.completion} tone={progressTone(row.completion)} label={tx(departmentById(row.departmentId)!.name)} />
                  {row.overdue > 0 && <span className="progress-list__flag">{t(`${row.overdue} overdue`, `${row.overdue} متأخر`)}</span>}
                </Link>
              </li>
            ))}
          </ul>
          <DemoSourceLine basis={t('published items linked to plan targets', 'العناصر المنشورة المرتبطة بأهداف الخطة')} />
        </CardBody>
      )}
    </Card>
  );
}

export function PlanTargetsCard({ now, departmentId }: { now: number; departmentId: DepartmentId }) {
  const { t, tx, num, pct } = useI18n();
  const { state } = useWorkspace();
  const create = useCreateContent();
  const progress = allPlanProgress(state, now).find((row) => row.departmentId === departmentId);
  const department = departmentById(departmentId)!;
  return (
    <Card>
      <CardHeader
        title={t(`${department.name.en} plan`, `خطة ${department.name.ar}`)}
        description={progress ? t(`${num(progress.published)} of ${num(progress.target)} published · ${pct(progress.completion)}`, `${num(progress.published)} من ${num(progress.target)} منشور · ${pct(progress.completion)}`) : undefined}
        actions={<ButtonLink to={`/departments/${departmentId}`} size="sm" variant="ghost">{t('Open plan', 'افتح الخطة')}</ButtonLink>}
      />
      {!progress ? (
        <EmptyState compact title={t('No plan for this month yet.', 'لا توجد خطة لهذا الشهر بعد.')} text={t('Submit the monthly plan so Marketing can track it.', 'أرسل الخطة الشهرية ليتابعها التسويق.')} />
      ) : (
        <CardBody>
          <ul className="target-list">
            {progress.targets.map((target) => {
              const template = state.templates.find((entry) => entry.id === progress.plan.targets.find((item) => item.id === target.id)?.templateId);
              return (
                <li key={target.id} className="target-list__row">
                  <div className="u-grow">
                    <p className="u-strong u-sm">{tx(target.label)}</p>
                    <p className="u-xs u-muted u-tnum">
                      {t(`${num(target.published)} published · ${num(target.inFlight)} in progress · ${num(target.missing)} missing`, `${num(target.published)} منشور · ${num(target.inFlight)} قيد العمل · ${num(target.missing)} ناقص`)}
                    </p>
                    <ProgressBar value={(Math.min(target.published, target.target) / target.target) * 100} tone={progressTone((target.published / target.target) * 100)} label={tx(target.label)} />
                  </div>
                  <span className="u-tnum u-strong">
                    {num(target.published)}/{num(target.target)}
                  </span>
                  {target.missing > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => create.open({ templateId: template?.id, departmentId })}>
                      {t('Create', 'إنشاء')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      )}
    </Card>
  );
}

/* ── Opportunities ─────────────────────────────────────────────────── */

export function OpportunitiesCard({ now, departments, limit = 4 }: { now: number; departments?: DepartmentId[]; limit?: number }) {
  const { t, tx, date } = useI18n();
  const { state } = useWorkspace();
  const create = useCreateContent();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const list = upcomingOpportunities(state, now)
    .filter((entry) => !dismissed.has(entry.id) && (!departments || entry.departments.some((id) => departments.includes(id))))
    .slice(0, limit);
  return (
    <Card>
      <CardHeader title={t('Content opportunities', 'فرص المحتوى')} icon={<CalendarHeart size={16} />} description={t('Upcoming occasions and company events', 'مناسبات وفعاليات قادمة')} />
      {list.length === 0 ? (
        <EmptyState compact title={t('No occasions in the next six weeks.', 'لا مناسبات خلال الأسابيع الستة القادمة.')} />
      ) : (
        <ul className="opp-list">
          {list.map((entry) => (
            <li key={entry.id} className="opp">
              <div className="opp__date">
                <b className="u-tnum">{date(entry.date, 'dayShort')}</b>
                <small>{tx(eventKindLabel[entry.kind])}</small>
              </div>
              <div className="opp__main">
                <p className="opp__name" dir="auto">
                  {tx(entry.name)}
                  {entry.approximate && <span className="u-xs u-muted"> {t('(date may shift a day)', '(قد يتغير يومًا)')}</span>}
                </p>
                <p className="u-xs u-muted">
                  {entry.departments.map((id) => tx(departmentById(id)!.name)).join(' · ')} — {t('Suggested', 'مقترح')}: {tx(entry.suggestion)}
                </p>
                {entry.covered && <Badge tone="success">{t('Already planned', 'مخطط بالفعل')}</Badge>}
              </div>
              <div className="opp__actions">
                <Button size="sm" variant="secondary" onClick={() => create.open({ title: tx(entry.name), departmentId: entry.departments[0], type: entry.suggestedType, templateId: 't-event', dueDate: DateTime.fromISO(entry.date).minus({ days: 1 }).toISODate() ?? undefined })}>
                  {t('Create content', 'إنشاء محتوى')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissed((set) => new Set(set).add(entry.id))}>
                  {t('Dismiss', 'تجاهل')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="ui-source ui-source--demo">{t('Occasions come from the curated catalog shipped with Mobde3 and events your team entered. No AI is involved yet.', 'المناسبات من القائمة المعدّة مسبقًا في مبدع ومن فعاليات أدخلها فريقك. لا يوجد ذكاء اصطناعي هنا بعد.')}</p>
    </Card>
  );
}

/* ── Live data ─────────────────────────────────────────────────────── */

/** Loading / offline / not-connected handling shared by every live block. */
export function LiveGate({ children, needs }: { children: ReactNode; needs?: 'posts' }) {
  const { t } = useI18n();
  const { store } = useLiveData();
  if (store.phase === 'loading') return <SkeletonRows rows={3} />;
  if (store.phase === 'offline') return <DataNotice status="error" message={store.staleError || t('The Mobde3 API did not respond.', 'واجهة مبدع لم تستجب.')} onRetry={() => void store.reload()} />;
  if (needs === 'posts' && !store.data.posts.length) {
    const connected = store.data.connectors.some((connector) => connector.status === 'connected');
    return connected ? (
      <EmptyState compact title={t('Connected sources returned no posts yet.', 'المصادر المتصلة لم ترجع منشورات بعد.')} text={t('Run a sync from Connections.', 'شغّل المزامنة من صفحة الربط.')} />
    ) : (
      <DataNotice status="needs_setup" message={t('Connect a platform to see performance.', 'اربط منصة لعرض الأداء.')} setupHref="/connections" />
    );
  }
  return (
    <>
      {store.staleError && <DataNotice status="stale" message={store.staleError} onRetry={() => void store.reload()} />}
      {children}
    </>
  );
}

export function TopContentCard({ now }: { now: number }) {
  const { t, compact, date } = useI18n();
  const { store } = useLiveData();
  const today = dayNumber(now);
  const recent = store.data.posts.filter((post) => today - post.dayNum <= 30);
  const top = topPosts(recent, 4);
  return (
    <Card>
      <CardHeader title={t('Top content · last 30 days', 'أفضل محتوى · آخر 30 يومًا')} icon={<ArrowUpRight size={16} />} actions={<ButtonLink to="/analytics?tab=content" size="sm" variant="ghost">{t('Analytics', 'التحليلات')}</ButtonLink>} />
      <CardBody>
        <LiveGate needs="posts">
          {top.length === 0 ? (
            <EmptyState compact title={t('No measured posts in the last 30 days.', 'لا منشورات مقاسة خلال آخر 30 يومًا.')} text={t('Posts appear once a connected platform returns engagement.', 'تظهر المنشورات عندما ترجع منصة متصلة بيانات التفاعل.')} />
          ) : (
            <>
              <ol className="top-posts">
                {top.map((post) => (
                  <li key={post.key} className="top-post">
                    <ChannelIcon channel={post.platform} size={16} />
                    <div className="u-grow">
                      <a href={post.permalink} target="_blank" rel="noreferrer" className="top-post__title u-truncate" dir="auto">
                        {post.title || t('(no caption)', '(بدون نص)')}
                        <ExternalLink size={12} aria-hidden />
                      </a>
                      <span className="u-xs u-muted">
                        {post.accountName || channelName[post.platform]} · {date(post.ts, 'dayShort')}
                      </span>
                    </div>
                    <span className="top-post__metric">
                      <b className="u-tnum">{compact(post.measured ? post.interactions : null)}</b>
                      <small>{t('interactions', 'تفاعل')}</small>
                    </span>
                  </li>
                ))}
              </ol>
              <SourceLine source={[...new Set(top.map((post) => post.platform))].map((platform) => sourceOf(platform, store.data.connectors))} now={now} />
            </>
          )}
        </LiveGate>
      </CardBody>
    </Card>
  );
}

export function ConnectionsCard({ now }: { now: number }) {
  const { t, relative } = useI18n();
  const { store } = useLiveData();
  return (
    <Card>
      <CardHeader title={t('Platform connections', 'ربط المنصات')} icon={<PlugZap size={16} />} actions={<ButtonLink to="/connections" size="sm" variant="ghost">{t('Manage', 'إدارة')}</ButtonLink>} />
      <CardBody>
        <LiveGate>
          <ul className="conn-mini">
            {store.data.connectors.map((connector) => (
              <li key={connector.platform}>
                <ChannelIcon channel={connector.platform} size={15} />
                <span className="u-grow">{channelName[connector.platform]}</span>
                <Badge tone={connector.status === 'connected' ? 'success' : connector.status === 'error' ? 'danger' : 'neutral'} dot>
                  {connector.status === 'connected' ? t('Connected', 'متصل') : connector.status === 'error' ? t('Error', 'خطأ') : t('Needs setup', 'يحتاج إعداد')}
                </Badge>
                <span className="u-xs u-muted u-tnum">{connector.checkedAt ? relative(connector.checkedAt, now) : '—'}</span>
              </li>
            ))}
          </ul>
        </LiveGate>
      </CardBody>
    </Card>
  );
}

export function BestTimeCard({ now }: { now: number }) {
  const { t } = useI18n();
  const [channel, setChannel] = useState<'instagram' | 'facebook' | 'tiktok'>('instagram');
  return (
    <Card>
      <CardHeader
        title={t('Best publishing time', 'أفضل وقت للنشر')}
        icon={<Sparkles size={16} />}
        actions={
          <div className="u-row">
            {(['instagram', 'facebook', 'tiktok'] as const).map((value) => (
              <button key={value} type="button" className="chip-btn" aria-pressed={channel === value} onClick={() => setChannel(value)} title={channelName[value]}>
                <ChannelIcon channel={value} size={13} />
                <span className="sr-only">{channelName[value]}</span>
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        <BestTime channels={[channel]} now={now} />
      </CardBody>
    </Card>
  );
}

/* ── People and tasks ──────────────────────────────────────────────── */

export function WorkloadCard({ now, departments }: { now: number; departments?: DepartmentId[] }) {
  const { t, tx, num } = useI18n();
  const { state } = useWorkspace();
  const rows = teamWorkload(state, now, departments ? state.users.filter((user) => user.departmentId && departments.includes(user.departmentId)) : state.users).slice(0, 6);
  return (
    <Card>
      <CardHeader title={t('Team workload', 'حمل عمل الفريق')} icon={<Users size={16} />} />
      {rows.length === 0 ? (
        <EmptyState compact title={t('No open work assigned.', 'لا يوجد عمل مفتوح مُسند.')} />
      ) : (
        <ul className="workload">
          {rows.map((row) => (
            <li key={row.user.id} className="workload__row">
              <Avatar name={row.user.name} size={26} />
              <span className="workload__who">
                <b className="u-sm u-truncate">{row.user.name}</b>
                <small className="u-xs u-muted u-truncate">{tx(row.user.title)}</small>
              </span>
              <span className="workload__nums u-tnum">
                <span title={t('Open tasks', 'مهام مفتوحة')}>{t(`${num(row.open)} tasks`, `${num(row.open)} مهام`)}</span>
                <span title={t('Open content assigned', 'محتوى مُسند')}>{t(`${num(row.content)} items`, `${num(row.content)} عناصر`)}</span>
                {row.overdue > 0 && <span className="workload__late">{t(`${num(row.overdue)} late`, `${num(row.overdue)} متأخرة`)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TaskListCard({ title, tasks, now, empty, icon }: { title: string; tasks: Task[]; now: number; empty: { title: string; text?: string }; icon?: ReactNode }) {
  const { t, tx } = useI18n();
  const { state, setTaskStatus, me } = useWorkspace();
  const act = useAct();
  const sorted = [...tasks].sort((a, b) => ms(a.dueAt) - ms(b.dueAt));
  return (
    <Card>
      <CardHeader title={title} count={tasks.length} icon={icon ?? <ListTodo size={16} />} actions={<ButtonLink to="/tasks" size="sm" variant="ghost">{t('All tasks', 'كل المهام')}</ButtonLink>} />
      {sorted.length === 0 ? (
        <EmptyState compact title={empty.title} text={empty.text} />
      ) : (
        <ul className="lines">
          {sorted.slice(0, 7).map((task) => {
            const linked = task.link?.kind === 'content' ? state.content.find((item) => item.id === task.link!.id) : null;
            const course = task.link?.kind === 'course' ? state.courses.find((item) => item.id === task.link!.id) : null;
            const blocked = task.dependsOn.some((id) => state.tasks.find((entry) => entry.id === id)?.status !== 'done');
            return (
              <li key={task.id} className="line">
                <div className="line__main">
                  <Link to={`/tasks?task=${task.id}`} className="line__title" dir="auto">
                    {task.title}
                  </Link>
                  <span className="line__meta">
                    <span>{tx(taskKindLabel[task.kind])}</span>
                    {linked && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="u-truncate" dir="auto">{linked.title}</span>
                      </>
                    )}
                    {course && <span>· {course.code} {course.cohort}</span>}
                    {blocked && <Badge tone="warning">{t('Blocked by another task', 'متوقفة على مهمة أخرى')}</Badge>}
                  </span>
                </div>
                <div className="line__side">
                  <TaskStatusBadge status={task.status} />
                  <DueLabel iso={task.dueAt} now={now} />
                  {task.assigneeId === me.id && task.status !== 'done' && (
                    <Button size="sm" variant="ghost" onClick={() => act(setTaskStatus(task.id, task.status === 'todo' ? 'in_progress' : 'done'), task.status === 'todo' ? t('Started', 'بدأت') : t('Marked done', 'تمت'))}>
                      {task.status === 'todo' ? t('Start', 'ابدأ') : t('Done', 'تم')}
                    </Button>
                  )}
                  {task.assigneeId !== me.id && (
                    <span className="line__person">
                      <Person users={state.users} id={task.assigneeId} size={20} />
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export const openTasksFor = (tasks: Task[], userId: string) => tasks.filter((task) => task.assigneeId === userId && isTaskOpen(task));

/* ── Course lifecycle ──────────────────────────────────────────────── */

export function CourseLifecycleCard({ now }: { now: number }) {
  const { t, date, num } = useI18n();
  const { state } = useWorkspace();
  const create = useCreateContent();
  const signals = courseSignals(state, now);
  const upcoming = [...state.courses].filter((course) => course.endDate >= (DateTime.fromMillis(now).toISODate() ?? '')).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const flags = (id: string) => {
    const list: { tone: 'warning' | 'danger' | 'brand' | 'neutral'; label: string; action?: () => void }[] = [];
    if (signals.startingToday.some((course) => course.id === id)) list.push({ tone: 'brand', label: t('Starts today', 'يبدأ اليوم') });
    if (signals.endingToday.some((course) => course.id === id)) list.push({ tone: 'brand', label: t('Ends today', 'ينتهي اليوم') });
    if (signals.firstSessionNeeded.some((course) => course.id === id)) list.push({ tone: 'warning', label: t('First-session post needed', 'مطلوب منشور أول محاضرة'), action: () => create.open({ templateId: 't-first-session', courseId: id }) });
    if (signals.missingInfo.some((course) => course.id === id)) list.push({ tone: 'danger', label: t('Missing lecturer or student count', 'ينقص المحاضر أو عدد الطلاب') });
    return list;
  };
  return (
    <Card>
      <CardHeader title={t('Course lifecycle', 'دورة حياة الدورات')} icon={<GraduationCap size={16} />} description={t('Starts, first sessions and endings that need content', 'بدايات وأول محاضرات ونهايات تحتاج محتوى')} actions={<ButtonLink to="/calendar?layer=courses" size="sm" variant="ghost">{t('Calendar', 'التقويم')}</ButtonLink>} />
      <div className="ui-table-scroll">
        <table className="ui-table ui-table--dense">
          <caption className="sr-only">{t('Courses', 'الدورات')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('Course', 'الدورة')}</th>
              <th scope="col">{t('Starts', 'يبدأ')}</th>
              <th scope="col" className="ui-table__secondary">{t('Ends', 'ينتهي')}</th>
              <th scope="col" className="ui-table__end">{t('Students', 'الطلاب')}</th>
              <th scope="col">{t('Needs', 'المطلوب')}</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.slice(0, 7).map((course) => (
              <tr key={course.id}>
                <td>
                  <span dir="ltr"><b>{course.code}</b> <span className="u-muted">{course.cohort}</span></span>
                </td>
                <td className="u-tnum">{date(course.startDate, 'dayShort')}</td>
                <td className="u-tnum ui-table__secondary">{date(course.endDate, 'dayShort')}</td>
                <td className="ui-table__end u-tnum">{num(course.studentCount)}</td>
                <td>
                  <div className="u-row u-row--wrap">
                    {flags(course.id).map((flag) =>
                      flag.action ? (
                        <button key={flag.label} type="button" className={`ui-badge ui-badge--${flag.tone} ui-badge--action`} onClick={flag.action}>
                          {flag.label} · {t('Create', 'إنشاء')}
                        </button>
                      ) : (
                        <Badge key={flag.label} tone={flag.tone}>
                          {flag.label}
                        </Badge>
                      ),
                    )}
                    {flags(course.id).length === 0 && <span className="u-subtle">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function EvaluationCard({ now }: { now: number }) {
  const { t, date } = useI18n();
  const { state } = useWorkspace();
  const create = useCreateContent();
  const signals = courseSignals(state, now);
  return (
    <Card>
      <CardHeader title={t('Evaluation videos required', 'فيديوهات تقييم مطلوبة')} count={signals.evaluationNeeded.length} icon={<FilePenLine size={16} />} description={t('Lecturer → Evaluation → Technical Support / Media → Marketing → Publish', 'المحاضر ← التقييم ← الدعم الفني / الميديا ← التسويق ← النشر')} />
      {signals.evaluationNeeded.length === 0 ? (
        <EmptyState compact title={t('Every finished course has its evaluation post live.', 'كل دورة منتهٍ نُشر له منشور التقييم.')} />
      ) : (
        <ul className="lines">
          {signals.evaluationNeeded.map((course) => {
            const item = state.content.find((entry) => entry.courseId === course.id && (entry.templateId === 't-evaluation-video' || entry.templateId === 't-course-finished'));
            return (
              <li key={course.id} className="line">
                <div className="line__main">
                  <span className="line__title">
                    {course.code} — {course.cohort}
                  </span>
                  <span className="line__meta">{t(`Ended ${date(course.endDate, 'dayShort')}`, `انتهى ${date(course.endDate, 'dayShort')}`)}</span>
                </div>
                <div className="line__side">
                  {item ? (
                    <ButtonLink to={`/content/${item.id}`} size="sm" variant="secondary">
                      {t('Open item', 'افتح العنصر')}
                    </ButtonLink>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => create.open({ templateId: 't-evaluation-video', courseId: course.id })}>
                      {t('Start evaluation post', 'ابدأ منشور التقييم')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function AchievementPipelineCard() {
  const { t, num } = useI18n();
  const { state } = useWorkspace();
  const open = state.achievements.filter((entry) => !entry.historical && Object.values(entry.steps).some((done) => !done));
  return (
    <Card>
      <CardHeader title={t('Certificates & achievements', 'الشهادات والإنجازات')} count={open.length} icon={<Trophy size={16} />} actions={<ButtonLink to="/achievements?tab=workflow" size="sm" variant="ghost">{t('Open workflow', 'افتح المسار')}</ButtonLink>} />
      {open.length === 0 ? (
        <EmptyState compact title={t('Every achievement is fully followed up.', 'كل الإنجازات متابعة بالكامل.')} />
      ) : (
        <ul className="lines">
          {open.slice(0, 6).map((entry) => {
            const done = Object.values(entry.steps).filter(Boolean).length;
            const total = Object.values(entry.steps).length;
            return (
              <li key={entry.id} className="line">
                <div className="line__main">
                  <Link to={`/achievements?student=${entry.id}`} className="line__title">
                    {entry.studentName}
                  </Link>
                  <span className="line__meta">
                    {entry.certification} · {entry.kind === 'international_exam' ? t('International exam', 'امتحان دولي') : t('Certificate', 'شهادة')}
                    {!entry.photo && <Badge tone="warning">{t('No photo', 'بدون صورة')}</Badge>}
                  </span>
                </div>
                <div className="line__side">
                  <span className="u-xs u-muted u-tnum">{t(`${num(done)}/${num(total)} steps`, `${num(done)}/${num(total)} خطوات`)}</span>
                  <ProgressBar value={(done / total) * 100} label={entry.studentName} tone={progressTone((done / total) * 100)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ── Admin ─────────────────────────────────────────────────────────── */

export function CreditsMiniCard({ now, departmentId }: { now: number; departmentId?: DepartmentId }) {
  const { t, tx, num, pct, ratio } = useI18n();
  const { state } = useWorkspace();
  const rows = creditUsage(state, now).filter((row) => !departmentId || row.departmentId === departmentId);
  return (
    <Card>
      <CardHeader title={t('AI credits', 'رصيد الذكاء الاصطناعي')} actions={<ButtonLink to="/credits" size="sm" variant="ghost">{t('Details', 'التفاصيل')}</ButtonLink>} />
      <CardBody>
        <ul className="progress-list">
          {rows.map((row) => (
            <li key={row.departmentId} className="progress-list__row">
              <span className="progress-list__name">{tx(departmentById(row.departmentId)!.name)}</span>
              <span className="progress-list__count u-tnum">
                {ratio(row.used, row.budget)}
              </span>
              <span className="progress-list__pct u-tnum">{pct(row.share)}</span>
              <ProgressBar value={row.share} tone={row.share >= 90 ? 'danger' : row.share >= 75 ? 'warning' : 'brand'} label={tx(departmentById(row.departmentId)!.name)} />
            </li>
          ))}
        </ul>
        <DemoSourceLine basis={t('credit transactions this month', 'معاملات الرصيد هذا الشهر')} />
      </CardBody>
    </Card>
  );
}

export function ActivityCard({ now, limit = 8 }: { now: number; limit?: number }) {
  const { t, relative } = useI18n();
  const { state } = useWorkspace();
  const recent = [...state.activity].sort((a, b) => ms(b.at) - ms(a.at)).slice(0, limit);
  const label = (action: string) =>
    ({
      created: t('created', 'أنشأ'),
      submitted_for_review: t('submitted for review', 'أرسل للمراجعة'),
      approved: t('approved', 'اعتمد'),
      changes_requested: t('requested changes on', 'طلب تعديلات على'),
      rejected: t('rejected', 'رفض'),
      scheduled: t('scheduled', 'جدول'),
      published_recorded: t('recorded publishing of', 'سجّل نشر'),
      commented: t('commented on', 'علّق على'),
      task_created: t('created a task on', 'أنشأ مهمة على'),
      task_completed: t('completed', 'أنهى'),
      assigned: t('assigned', 'أسند'),
      asset_attached: t('attached media to', 'أرفق وسائط إلى'),
      status_changed: t('updated', 'حدّث'),
      ai_used: t('used AI on', 'استخدم AI على'),
    })[action] ?? action;
  const titleOf = (entry: (typeof recent)[number]) =>
    entry.entity.kind === 'content' ? state.content.find((item) => item.id === entry.entity.id)?.title : entry.entity.kind === 'task' ? state.tasks.find((item) => item.id === entry.entity.id)?.title : entry.entity.kind === 'user' ? userById(state, entry.entity.id)?.name : undefined;
  return (
    <Card>
      <CardHeader title={t('System activity', 'نشاط النظام')} icon={<DemoBadge />} />
      <ul className="activity">
        {recent.map((entry) => (
          <li key={entry.id} className="activity__row">
            <Avatar name={userById(state, entry.actorId)?.name ?? '?'} size={22} />
            <p className="u-sm">
              <b>{userById(state, entry.actorId)?.name ?? '—'}</b> {label(entry.action)}{' '}
              <span dir="auto" className="u-muted">
                {titleOf(entry) ?? ''}
              </span>
            </p>
            <span className="u-xs u-subtle u-tnum">{relative(entry.at, now)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
