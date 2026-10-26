import { Building2 } from 'lucide-react';
import { DemoSourceLine, Stat } from '../../components/data-display/Metric';
import { EmptyState } from '../../components/feedback/States';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { ButtonLink } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ROLES, departmentById } from '../../domain/catalog';
import { isOpen } from '../../domain/content';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useClock } from '../../features/workspace/hooks';
import { isOverdue, isTaskOpen, operationalKpis } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ContentListCard, CreditsMiniCard, PlanTargetsCard, TaskListCard } from '../home/widgets';
import { canSeePlan } from './DepartmentsPage';

export function DepartmentDetailPage({ id }: { id: string }) {
  const { t, tx, num, pct } = useI18n();
  const { state, me, can } = useWorkspace();
  const now = useClock();
  const department = departmentById(id);
  usePageMeta(department ? tx(department.name) : t('Department', 'قسم'), [{ label: t('Departments', 'الأقسام'), to: '/departments' }, { label: department ? tx(department.name) : t('Not found', 'غير موجود') }]);
  if (!department) return <EmptyState icon={<Building2 size={22} />} title={t('This department does not exist.', 'هذا القسم غير موجود.')} action={<ButtonLink to="/departments" variant="primary">{t('All departments', 'كل الأقسام')}</ButtonLink>} />;

  const visible = canSeePlan(me, department);
  const kpis = operationalKpis(state, now, { departmentId: department.id });
  const members = state.users.filter((user) => user.departmentId === department.id);
  const content = state.content.filter((item) => item.departmentId === department.id && isOpen(item));
  const overdue = content.filter((item) => isOverdue(item, now));
  const tasks = state.tasks.filter((task) => task.departmentId === department.id && isTaskOpen(task));

  return (
    <div className="u-stack u-stack--lg">
      <PageHeader title={tx(department.name)} description={tx(department.responsibility)} meta={department.id === me.departmentId ? <Badge tone="brand">{t('Your department', 'قسمك')}</Badge> : undefined} />
      <section aria-label={t('Operational KPIs', 'مؤشرات التشغيل')} className="u-stack u-stack--sm">
        <div className="stat-row">
          <Stat value={num(kpis.postsPublished)} label={t('Posts published this month', 'بوستات منشورة هذا الشهر')} />
          <Stat value={pct(kpis.postsOnTime)} label={t('Published on time', 'نُشرت في موعدها')} />
          <Stat value={num(kpis.tasksCompleted)} label={t('Tasks completed', 'مهام منجزة')} hint={kpis.tasksOnTime == null ? undefined : t(`${pct(kpis.tasksOnTime)} on time`, `${pct(kpis.tasksOnTime)} في الموعد`)} />
          <Stat value={num(kpis.openOverdue)} label={t('Overdue now', 'متأخر الآن')} tone={kpis.openOverdue ? 'danger' : undefined} />
        </div>
        <DemoSourceLine basis={t('operational KPIs measure delivery, not reach', 'مؤشرات التشغيل تقيس التسليم لا الوصول')} />
      </section>
      <div className="home-grid">
        <div className="home-grid__col">
          {department.plansContent && (visible ? <PlanTargetsCard now={now} departmentId={department.id} /> : <Card><CardBody><p className="u-sm u-muted">{t('This department’s plan is visible to its members and Marketing.', 'خطة هذا القسم متاحة لأعضائه وللتسويق.')}</p></CardBody></Card>)}
          <ContentListCard title={t('Content in progress', 'محتوى قيد العمل')} items={content} now={now} empty={{ title: t('No open content.', 'لا يوجد محتوى مفتوح.') }} more={`/content?department=${department.id}`} />
          {overdue.length > 0 && <ContentListCard title={t('Overdue', 'متأخر')} items={overdue} now={now} empty={{ title: '' }} />}
        </div>
        <div className="home-grid__col">
          <Card>
            <CardHeader title={t('People', 'الأشخاص')} count={members.length} />
            <ul className="workload">
              {members.map((user) => {
                const personal = operationalKpis(state, now, { userId: user.id });
                return (
                  <li key={user.id} className="workload__row">
                    <Avatar name={user.name} size={28} />
                    <span className="workload__who">
                      <b className="u-sm u-truncate">
                        {user.name} {department.managerId === user.id && <Badge tone="brand">{t('Manager', 'المدير')}</Badge>}
                      </b>
                      <small className="u-xs u-muted u-truncate">{tx(ROLES[user.role].name)}</small>
                    </span>
                    <span className="workload__nums u-tnum">
                      <span title={t('Tasks completed this month', 'مهام منجزة هذا الشهر')}>{t(`${num(personal.tasksCompleted)} done`, `${num(personal.tasksCompleted)} منجزة`)}</span>
                      <span title={t('Tasks on time', 'المهام في موعدها')}>{pct(personal.tasksOnTime)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <TaskListCard title={t('Open tasks', 'مهام مفتوحة')} tasks={tasks} now={now} empty={{ title: t('No open tasks.', 'لا مهام مفتوحة.') }} />
          {(can('credits.view_all') || me.departmentId === department.id) && can('credits.view') && <CreditsMiniCard now={now} departmentId={department.id} />}
        </div>
      </div>
    </div>
  );
}
