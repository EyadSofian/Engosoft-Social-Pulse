import { Link } from '../../app/router/router';
import { DemoSourceLine } from '../../components/data-display/Metric';
import { ProgressBar, progressTone } from '../../components/feedback/States';
import { Person } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { DEPARTMENTS } from '../../domain/catalog';
import { isOpen } from '../../domain/content';
import type { Department, User } from '../../domain/users';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useClock } from '../../features/workspace/hooks';
import { hasPermission } from '../../features/workspace/permissions';
import { allPlanProgress, isOverdue, isTaskOpen } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

/** Marketing and admins see every department's plan; everyone else sees their own in full. */
export const canSeePlan = (user: User, department: Department) => hasPermission(user, 'plans.view_all') || user.role === 'admin' || user.departmentId === department.id;

export function DepartmentsPage() {
  const { t, tx, num, pct, date, ratio } = useI18n();
  const { state, me } = useWorkspace();
  const now = useClock();
  usePageMeta(t('Departments', 'الأقسام'), [{ label: t('Departments', 'الأقسام') }]);
  const progress = allPlanProgress(state, now);
  const ordered = [...DEPARTMENTS].sort((a, b) => Number(b.id === me.departmentId) - Number(a.id === me.departmentId));

  return (
    <div className="u-stack">
      <PageHeader title={t('Departments', 'الأقسام')} description={t(`Monthly content plans and delivery for ${date(now, 'month')}. Production teams deliver work for every department and plan none of their own.`, `الخطط الشهرية والتسليم لشهر ${date(now, 'month')}. فرق الإنتاج تنفذ لكل الأقسام ولا تضع خطة خاصة.`)} />
      <ul className="dept-grid">
        {ordered.map((department) => {
          const plan = progress.find((row) => row.departmentId === department.id);
          const visible = canSeePlan(me, department);
          const members = state.users.filter((user) => user.departmentId === department.id && user.status !== 'suspended');
          const open = state.content.filter((item) => item.departmentId === department.id && isOpen(item)).length;
          const overdue = state.content.filter((item) => item.departmentId === department.id && isOverdue(item, now)).length;
          const tasks = state.tasks.filter((task) => task.departmentId === department.id && isTaskOpen(task)).length;
          return (
            <li key={department.id}>
              <Link to={`/departments/${department.id}`} className="dept-card">
                <span className="dept-card__head">
                  <b>{tx(department.name)}</b>
                  {department.id === me.departmentId && <Badge tone="brand">{t('Your department', 'قسمك')}</Badge>}
                </span>
                <span className="dept-card__desc">{tx(department.responsibility)}</span>
                {department.plansContent ? (
                  visible && plan ? (
                    <span className="dept-card__plan">
                      <span className="u-row u-row--between">
                        <span className="u-sm u-tnum">{t(`${ratio(plan.published, plan.target)} posts`, `${ratio(plan.published, plan.target)} منشور`)}</span>
                        <b className="u-tnum">{pct(plan.completion)}</b>
                      </span>
                      <ProgressBar value={plan.completion} tone={progressTone(plan.completion)} label={tx(department.name)} />
                    </span>
                  ) : (
                    <span className="u-xs u-muted">{visible ? t('No plan submitted this month.', 'لم تُرسل خطة هذا الشهر.') : t('Plan visible to the department and Marketing.', 'الخطة متاحة للقسم والتسويق.')}</span>
                  )
                ) : (
                  <span className="u-xs u-muted">{t(`${num(tasks)} open production tasks`, `${num(tasks)} مهام إنتاج مفتوحة`)}</span>
                )}
                <span className="dept-card__foot">
                  <Person users={state.users} id={department.managerId} size={20} />
                  <span className="u-xs u-muted u-tnum">
                    {t(`${num(members.length)} people · ${num(open)} open`, `${num(members.length)} أشخاص · ${num(open)} مفتوح`)}
                    {overdue > 0 && <span className="due due--overdue"> · {t(`${num(overdue)} overdue`, `${num(overdue)} متأخر`)}</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <DemoSourceLine basis={t('content items linked to each plan target', 'عناصر المحتوى المرتبطة بأهداف كل خطة')} />
    </div>
  );
}
