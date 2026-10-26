import type { ReactNode } from 'react';
import { DateTime } from 'luxon';
import { CalendarDays, ClipboardList, Megaphone, Plus, SearchCheck } from 'lucide-react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { Stat } from '../../components/data-display/Metric';
import { Button, ButtonLink } from '../../components/ui/Button';
import { departmentById } from '../../domain/catalog';
import { isOpen } from '../../domain/content';
import { homeProfileOf, type DepartmentId, type HomeProfile } from '../../domain/users';
import { useCreateContent } from '../../features/content/CreateContent';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useClock } from '../../features/workspace/hooks';
import {
  allPlanProgress,
  companyCompletion,
  courseSignals,
  creditUsage,
  isOverdue,
  isTaskOpen,
  isTaskOverdue,
  reviewQueue,
  sameDay,
  scheduledThisWeek,
  visibleContent,
} from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { businessZone } from '../../lib/format';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import {
  AchievementPipelineCard,
  ActivityCard,
  BestTimeCard,
  ConnectionsCard,
  ContentListCard,
  CourseLifecycleCard,
  CreditsMiniCard,
  DepartmentProgressCard,
  EvaluationCard,
  OpportunitiesCard,
  PlanTargetsCard,
  PublishingQueueCard,
  ReviewQueueCard,
  TaskListCard,
  TopContentCard,
  WeekScheduleCard,
  WorkloadCard,
  openTasksFor,
} from './widgets';

const DESCRIPTION: Record<HomeProfile, [string, string]> = {
  marketing_manager: ['Reviews, publishing and every department’s plan in one place.', 'المراجعات والنشر وخطط كل الأقسام في مكان واحد.'],
  publisher: ['Approved content waiting for a slot, this week’s schedule and publishing issues.', 'المحتوى المعتمد بانتظار موعد، وجدول الأسبوع، ومشاكل النشر.'],
  ops_lead: ['Course starts, first sessions, endings and the content each one needs.', 'بدايات الدورات وأول المحاضرات والنهايات والمحتوى المطلوب لكل منها.'],
  evaluation: ['Evaluation videos, certificates and student achievements to follow up.', 'فيديوهات التقييم والشهادات وإنجازات الطلاب للمتابعة.'],
  hr: ['Recognition, new joiners and your monthly HR content plan.', 'التكريم والموظفون الجدد وخطة محتوى الموارد البشرية الشهرية.'],
  education: ['Course launches, new programs and educational content.', 'إطلاق الدورات والبرامج الجديدة والمحتوى التعليمي.'],
  corporate: ['Contracts, partnerships and corporate training stories.', 'العقود والشراكات وقصص تدريب الشركات.'],
  production: ['Your design and video tasks, revisions and deadlines.', 'مهام التصميم والفيديو والتعديلات والمواعيد.'],
  admin: ['People, connections, credits and system health.', 'المستخدمون والربط والرصيد وصحة النظام.'],
};

export function HomePage() {
  const { t } = useI18n();
  const { me } = useWorkspace();
  const now = useClock();
  usePageMeta(t('Home', 'الرئيسية'), [{ label: t('Home', 'الرئيسية') }]);
  const profile = homeProfileOf(me);
  const hour = DateTime.fromMillis(now, { zone: businessZone() }).hour;
  const greeting = hour >= 5 && hour < 12 ? t('Good morning', 'صباح الخير') : hour < 17 && hour >= 12 ? t('Good afternoon', 'مساء الخير') : t('Good evening', 'مساء الخير');
  const first = me.name.replace(/^(Dr|Eng)\.\s*/, '').split(' ')[0];
  const { date } = useI18n();

  return (
    <div className="u-stack u-stack--lg">
      <div className="home-hero"><PageHeader meta={`Social Pulse · ${date(now, 'month')}`} title={`${greeting}${t(', ', '، ')}${first}`} description={t(...DESCRIPTION[profile])} actions={<HomeActions profile={profile} />} /></div>
      <HomeBody profile={profile} now={now} />
    </div>
  );
}

function HomeActions({ profile }: { profile: HomeProfile }) {
  const { t } = useI18n();
  const { can } = useWorkspace();
  const create = useCreateContent();
  const createButton = can('content.create') ? (
    <Button variant="primary" icon={<Plus size={16} />} onClick={() => create.open()}>
      {t('Create content', 'إنشاء محتوى')}
    </Button>
  ) : null;
  if (profile === 'marketing_manager')
    return (
      <>
        <ButtonLink to="/calendar" icon={<CalendarDays size={15} />}>
          {t('Open calendar', 'افتح التقويم')}
        </ButtonLink>
        <ButtonLink to="/tasks?tab=approvals" icon={<SearchCheck size={15} />}>
          {t('Review approvals', 'راجع الاعتمادات')}
        </ButtonLink>
        <ButtonLink to="/departments" icon={<ClipboardList size={15} />}>
          {t('Monthly plans', 'الخطط الشهرية')}
        </ButtonLink>
        {createButton}
      </>
    );
  if (profile === 'admin')
    return (
      <>
        <ButtonLink to="/connections">{t('Connections', 'الربط')}</ButtonLink>
        <ButtonLink to="/admin" variant="primary">
          {t('Open admin', 'افتح الإدارة')}
        </ButtonLink>
      </>
    );
  if (profile === 'production')
    return (
      <>
        <ButtonLink to="/my-work" variant="primary">
          {t('Open my work', 'افتح عملي')}
        </ButtonLink>
      </>
    );
  if (profile === 'publisher')
    return (
      <>
        <ButtonLink to="/calendar" icon={<CalendarDays size={15} />}>
          {t('Open calendar', 'افتح التقويم')}
        </ButtonLink>
        {createButton}
      </>
    );
  return (
    <>
      <ButtonLink to="/templates" icon={<Megaphone size={15} />}>
        {t('Templates', 'القوالب')}
      </ButtonLink>
      {createButton}
    </>
  );
}

const Stats = ({ children }: { children: ReactNode }) => <div className="stat-row">{children}</div>;
const Grid = ({ children }: { children: ReactNode }) => <div className="home-grid">{children}</div>;
const Col = ({ children }: { children: ReactNode }) => <div className="home-grid__col">{children}</div>;

function HomeBody({ profile, now }: { profile: HomeProfile; now: number }) {
  const { t, num, pct, ratio } = useI18n();
  const { state, me } = useWorkspace();
  const { store } = useLiveData();
  const mine = visibleContent(state, me);
  const myTasks = openTasksFor(state.tasks, me.id);

  if (profile === 'marketing_manager') {
    const queue = reviewQueue(state);
    const progress = allPlanProgress(state, now);
    const company = companyCompletion(progress);
    const overdue = mine.filter((item) => isOverdue(item, now));
    const changes = mine.filter((item) => item.status === 'changes_requested');
    return (
      <>
        <Stats>
          <Stat value={num(queue.length)} label={t('Awaiting review', 'بانتظار المراجعة')} tone={queue.length ? 'warning' : undefined} to="/tasks?tab=approvals" />
          <Stat value={num(scheduledThisWeek(mine, now).length)} label={t('Scheduled this week', 'مجدول هذا الأسبوع')} to="/calendar" />
          <Stat value={num(overdue.length)} label={t('Overdue', 'متأخر')} tone={overdue.length ? 'danger' : undefined} to="/content?due=overdue" />
          <Stat value={pct(company.completion)} label={t('Monthly plan', 'الخطة الشهرية')} hint={t(`${num(company.published)} of ${num(company.target)} posts`, `${num(company.published)} من ${num(company.target)} منشور`)} to="/departments" />
        </Stats>
        <Grid>
          <Col>
            <ReviewQueueCard now={now} title={t('Needs your attention', 'يحتاج انتباهك')} />
            <WeekScheduleCard now={now} />
            <ContentListCard title={t('Changes requested & overdue', 'تعديلات مطلوبة ومتأخرات')} items={[...changes, ...overdue.filter((item) => item.status !== 'changes_requested')]} now={now} empty={{ title: t('Nothing is stuck.', 'لا يوجد شيء متعطل.') }} more="/content?due=overdue" />
          </Col>
          <Col>
            <DepartmentProgressCard now={now} />
            <OpportunitiesCard now={now} />
            <TopContentCard now={now} />
            <WorkloadCard now={now} />
          </Col>
        </Grid>
      </>
    );
  }

  if (profile === 'publisher') {
    const approved = state.content.filter((item) => item.status === 'approved');
    const today = state.content.filter((item) => item.status === 'scheduled' && sameDay(item.publishAt, now));
    const missed = store.data.alerts.filter((alert) => !alert.dismissedAt && alert.kind === 'missed').length;
    const drafts = mine.filter((item) => (item.status === 'draft' || item.status === 'in_production') && (item.ownerId === me.id || item.assigneeId === me.id || item.departmentId === 'marketing'));
    return (
      <>
        <Stats>
          <Stat value={num(approved.length)} label={t('Approved, needs a slot', 'معتمد يحتاج موعد')} tone={approved.length ? 'warning' : undefined} />
          <Stat value={num(today.length)} label={t('Publishing today', 'نشر اليوم')} to="/calendar" />
          <Stat value={num(scheduledThisWeek(state.content, now).length)} label={t('Scheduled this week', 'مجدول هذا الأسبوع')} to="/calendar" />
          <Stat value={store.phase === 'ready' ? num(missed) : '—'} label={t('Not confirmed (live)', 'نشر غير مؤكد (مباشر)')} tone={missed ? 'danger' : undefined} to="/calendar?view=live" hint={t('From calendar alerts', 'من تنبيهات التقويم')} />
        </Stats>
        <Grid>
          <Col>
            <PublishingQueueCard now={now} />
            <WeekScheduleCard now={now} items={state.content} />
            <ContentListCard title={t('Drafts and incomplete posts', 'مسودات ومنشورات غير مكتملة')} items={drafts} now={now} empty={{ title: t('No drafts in progress.', 'لا توجد مسودات قيد العمل.') }} more="/content?status=draft" />
          </Col>
          <Col>
            <ReviewQueueCard now={now} limit={4} title={t('In Marketing review', 'في مراجعة التسويق')} />
            <BestTimeCard now={now} />
            <TopContentCard now={now} />
          </Col>
        </Grid>
      </>
    );
  }

  if (profile === 'ops_lead') {
    const signals = courseSignals(state, now);
    const opsTasks = state.tasks.filter((task) => task.departmentId === 'operations' && isTaskOpen(task));
    const opsContent = mine.filter((item) => item.departmentId === 'operations' && isOpen(item) && item.status !== 'scheduled');
    return (
      <>
        <Stats>
          <Stat value={num(signals.startingSoon.length)} label={t('Courses starting within 7 days', 'دورات تبدأ خلال 7 أيام')} />
          <Stat value={num(signals.startingToday.length)} label={t('Starting today', 'تبدأ اليوم')} tone={signals.startingToday.length ? 'brand' : undefined} />
          <Stat value={num(signals.evaluationNeeded.length)} label={t('Evaluation videos required', 'فيديوهات تقييم مطلوبة')} tone={signals.evaluationNeeded.length ? 'warning' : undefined} />
          <Stat value={num(opsTasks.length)} label={t('Pending operational tasks', 'مهام تشغيلية معلقة')} to="/tasks" />
        </Stats>
        <CourseLifecycleCard now={now} />
        <Grid>
          <Col>
            <ContentListCard title={t('Operations content in progress', 'محتوى التشغيل قيد العمل')} items={opsContent} now={now} empty={{ title: t('No operations content in progress.', 'لا يوجد محتوى تشغيل قيد العمل.') }} more="/content?department=operations" />
            <TaskListCard title={t('Pending operational tasks', 'مهام تشغيلية معلقة')} tasks={opsTasks} now={now} empty={{ title: t('No open tasks in Operations.', 'لا مهام مفتوحة في التشغيل.') }} />
          </Col>
          <Col>
            <EvaluationCard now={now} />
            <PlanTargetsCard now={now} departmentId="operations" />
          </Col>
        </Grid>
      </>
    );
  }

  if (profile === 'evaluation') {
    const signals = courseSignals(state, now);
    const certs = mine.filter((item) => (item.templateId === 't-certificate' || item.templateId === 't-intl-exam' || item.templateId === 't-hall-of-fame') && isOpen(item));
    const pending = state.achievements.filter((entry) => !entry.historical && Object.values(entry.steps).some((done) => !done));
    const reposts = state.tasks.filter((task) => task.assigneeId === me.id && isTaskOpen(task) && /repost/i.test(task.title));
    return (
      <>
        <Stats>
          <Stat value={num(signals.evaluationNeeded.length)} label={t('Evaluation videos required', 'فيديوهات تقييم مطلوبة')} tone={signals.evaluationNeeded.length ? 'warning' : undefined} />
          <Stat value={num(certs.length)} label={t('Certificate posts in progress', 'منشورات شهادات قيد العمل')} />
          <Stat value={num(pending.length)} label={t('Achievements to follow up', 'إنجازات للمتابعة')} to="/achievements?tab=workflow" />
          <Stat value={num(reposts.length)} label={t('Repost tasks', 'مهام إعادة نشر')} />
        </Stats>
        <Grid>
          <Col>
            <EvaluationCard now={now} />
            <AchievementPipelineCard />
          </Col>
          <Col>
            <TaskListCard title={t('My tasks', 'مهامي')} tasks={myTasks} now={now} empty={{ title: t('No open tasks.', 'لا مهام مفتوحة.') }} />
            <ContentListCard title={t('Certificate & achievement posts', 'منشورات الشهادات والإنجازات')} items={certs} now={now} empty={{ title: t('No certificate posts in progress.', 'لا منشورات شهادات قيد العمل.') }} />
          </Col>
        </Grid>
      </>
    );
  }

  if (profile === 'hr' || profile === 'education' || profile === 'corporate') {
    const departmentId: DepartmentId = profile;
    const dept = mine.filter((item) => item.departmentId === departmentId);
    const progress = allPlanProgress(state, now).find((row) => row.departmentId === departmentId);
    const review = dept.filter((item) => item.status === 'ready_for_review');
    const changes = dept.filter((item) => item.status === 'changes_requested');
    const working = dept.filter((item) => ['idea', 'draft', 'in_production', 'changes_requested'].includes(item.status));
    const recentCourses = state.courses.filter((course) => course.endDate <= (DateTime.fromMillis(now).toISODate() ?? '') && course.endDate >= (DateTime.fromMillis(now).minus({ days: 21 }).toISODate() ?? ''));
    return (
      <>
        <Stats>
          <Stat value={pct(progress?.completion ?? null)} label={t('Monthly plan', 'الخطة الشهرية')} hint={progress ? t(`${num(progress.published)} of ${num(progress.target)}`, `${num(progress.published)} من ${num(progress.target)}`) : t('No plan yet', 'لا توجد خطة')} to={`/departments/${departmentId}`} />
          <Stat value={num(review.length)} label={t('In Marketing review', 'في مراجعة التسويق')} />
          <Stat value={num(changes.length)} label={t('Changes requested', 'مطلوب تعديلات')} tone={changes.length ? 'danger' : undefined} />
          <Stat value={num(scheduledThisWeek(dept, now).length)} label={t('Publishing this week', 'نشر هذا الأسبوع')} />
        </Stats>
        <Grid>
          <Col>
            <ContentListCard title={t('Your department’s content', 'محتوى قسمك')} description={departmentById(departmentId)?.responsibility.en && t(departmentById(departmentId)!.responsibility.en, departmentById(departmentId)!.responsibility.ar)} items={working} now={now} empty={{ title: t('Nothing in progress.', 'لا شيء قيد العمل.'), text: t('Start from a template to keep the plan on track.', 'ابدأ من قالب لتبقى الخطة على المسار.') }} more={`/content?department=${departmentId}`} />
            {profile === 'education' && (
              <ContentListCard
                title={t('Recently finished courses', 'دورات انتهت مؤخرًا')}
                items={state.content.filter((item) => recentCourses.some((course) => course.id === item.courseId))}
                now={now}
                empty={{ title: t('No course finished in the last three weeks.', 'لم ينتهِ دورة خلال آخر ثلاثة أسابيع.') }}
              />
            )}
            <TaskListCard title={t('My tasks', 'مهامي')} tasks={myTasks} now={now} empty={{ title: t('No open tasks.', 'لا مهام مفتوحة.') }} />
          </Col>
          <Col>
            <PlanTargetsCard now={now} departmentId={departmentId} />
            <WeekScheduleCard now={now} items={dept} />
            <OpportunitiesCard now={now} departments={[departmentId]} limit={3} />
          </Col>
        </Grid>
      </>
    );
  }

  if (profile === 'production') {
    const overdue = myTasks.filter((task) => isTaskOverdue(task, now));
    const today = myTasks.filter((task) => sameDay(task.dueAt, now) && !isTaskOverdue(task, now));
    const revisions = state.content.filter((item) => item.status === 'changes_requested' && item.assigneeId === me.id);
    const revisionTasks = myTasks.filter((task) => task.kind === 'revision');
    return (
      <>
        <Stats>
          <Stat value={num(myTasks.length)} label={t('Open tasks', 'مهام مفتوحة')} to="/my-work" />
          <Stat value={num(today.length)} label={t('Due today', 'مطلوب اليوم')} tone={today.length ? 'warning' : undefined} />
          <Stat value={num(overdue.length)} label={t('Overdue', 'متأخر')} tone={overdue.length ? 'danger' : undefined} />
          <Stat value={num(revisionTasks.length + revisions.length)} label={t('Revision requests', 'طلبات تعديل')} />
        </Stats>
        <Grid>
          <Col>
            <TaskListCard title={t('My tasks', 'مهامي')} tasks={myTasks} now={now} empty={{ title: t('You have no open tasks.', 'ليس لديك مهام مفتوحة.'), text: t('New design and video tasks appear here when they are assigned to you.', 'مهام التصميم والفيديو الجديدة تظهر هنا عند إسنادها لك.') }} />
          </Col>
          <Col>
            <ContentListCard title={t('Revision requests', 'طلبات التعديل')} items={revisions} now={now} empty={{ title: t('No revisions requested.', 'لا توجد تعديلات مطلوبة.') }} />
            <ContentListCard title={t('Assets awaiting production', 'محتوى بانتظار الإنتاج')} items={mine.filter((item) => item.status === 'in_production' && item.assigneeId === me.id)} now={now} empty={{ title: t('Nothing waiting for production.', 'لا شيء بانتظار الإنتاج.') }} />
          </Col>
        </Grid>
      </>
    );
  }

  // Admin.
  const active = state.users.filter((user) => user.status === 'active').length;
  const connected = store.data.connectors.filter((connector) => connector.status === 'connected').length;
  const credits = creditUsage(state, now);
  const used = credits.reduce((sum, row) => sum + row.used, 0);
  const budget = credits.reduce((sum, row) => sum + row.budget, 0);
  const missed = store.data.alerts.filter((alert) => !alert.dismissedAt && alert.kind === 'missed').length;
  return (
    <>
      <Stats>
        <Stat value={num(active)} label={t('Active users', 'مستخدمون نشطون')} hint={t(`${num(state.users.length - active)} invited or suspended`, `${num(state.users.length - active)} مدعو أو موقوف`)} to="/admin" />
        <Stat value={store.phase === 'ready' ? ratio(connected, store.data.connectors.length) : '—'} label={t('Connections working', 'مصادر متصلة')} to="/connections" tone={store.data.connectors.some((connector) => connector.status === 'error') ? 'danger' : undefined} />
        <Stat value={pct(budget ? (used / budget) * 100 : null)} label={t('AI credits used', 'رصيد AI المستخدم')} hint={ratio(used, budget)} to="/credits" />
        <Stat value={store.phase === 'ready' ? num(missed) : '—'} label={t('Publishing errors (live)', 'أخطاء نشر (مباشر)')} tone={missed ? 'danger' : undefined} />
      </Stats>
      <Grid>
        <Col>
          <ConnectionsCard now={now} />
          <ActivityCard now={now} />
        </Col>
        <Col>
          <CreditsMiniCard now={now} />
          <DepartmentProgressCard now={now} />
        </Col>
      </Grid>
    </>
  );
}
