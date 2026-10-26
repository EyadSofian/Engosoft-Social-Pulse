import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { DataTable, type Column } from '../../components/data-display/DataTable';
import { EmptyState } from '../../components/feedback/States';
import { FilterSelect, SearchInput } from '../../components/forms/Field';
import { Person, displayName } from '../../components/ui/Avatar';
import { ApprovalBadge, PriorityBadge, TaskStatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Segmented, Tabs } from '../../components/ui/Tabs';
import { DEPARTMENTS } from '../../domain/catalog';
import type { DepartmentId } from '../../domain/users';
import type { Task, TaskKind, TaskStatus } from '../../domain/workflow';
import { TASK_STATUSES } from '../../domain/workflow';
import { DepartmentName, DueLabel } from '../../features/content/parts';
import { NewTaskDialog, TaskDrawer } from '../../features/tasks/TaskParts';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useAct, useClock } from '../../features/workspace/hooks';
import { isTaskOpen, reviewQueue, userById } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { taskKindLabel, taskStatusLabel } from '../../i18n/labels';
import { parseTimestamp } from '../../lib/format';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ReviewQueueCard } from '../home/widgets';

type Tab = 'tasks' | 'approvals';
const KINDS: TaskKind[] = ['design', 'video_edit', 'copy', 'capture', 'revision', 'review', 'coordination'];

export function TasksPage() {
  const { t } = useI18n();
  const { state, can } = useWorkspace();
  const now = useClock();
  const [query, setQuery] = useQueryState();
  const [creating, setCreating] = useState(false);
  usePageMeta(t('Tasks & Approvals', 'المهام والاعتمادات'), [{ label: t('Tasks & Approvals', 'المهام والاعتمادات') }]);
  const tab: Tab = query.get('tab') === 'approvals' ? 'approvals' : 'tasks';
  const openTask = state.tasks.find((task) => task.id === query.get('task')) ?? null;
  const pending = reviewQueue(state).length;

  return (
    <div className="u-stack">
      <PageHeader
        title={t('Tasks & Approvals', 'المهام والاعتمادات')}
        description={t('Production work and Marketing’s review decisions. Tasks and posts are separate: one post can need several tasks.', 'أعمال الإنتاج وقرارات مراجعة التسويق. المهام منفصلة عن البوستات: البوست الواحد قد يحتاج عدة مهام.')}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            {t('New task', 'مهمة جديدة')}
          </Button>
        }
      />
      <Tabs
        label={t('Sections', 'الأقسام')}
        value={tab}
        onChange={(value) => setQuery({ tab: value === 'tasks' ? null : value })}
        items={[
          { value: 'tasks', label: t('Tasks', 'المهام'), count: state.tasks.filter(isTaskOpen).length },
          { value: 'approvals', label: t('Approvals', 'الاعتمادات'), count: pending },
        ]}
      />
      {tab === 'tasks' ? <TaskTable now={now} /> : <Approvals now={now} canApprove={can('content.approve')} />}
      <TaskDrawer task={openTask} onClose={() => setQuery({ task: null })} now={now} />
      <NewTaskDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function TaskTable({ now }: { now: number }) {
  const { t, tx, num } = useI18n();
  const { state, me, setTaskStatus } = useWorkspace();
  const act = useAct();
  const [query, setQuery] = useQueryState();
  const scope = (query.get('scope') ?? 'open') as 'open' | 'mine' | 'all';
  const status = (query.get('status') ?? 'all') as TaskStatus | 'all';
  const assignee = query.get('assignee') ?? 'all';
  const department = (query.get('department') ?? 'all') as DepartmentId | 'all';
  const kind = (query.get('kind') ?? 'all') as TaskKind | 'all';
  const q = query.get('q') ?? '';

  const rows = useMemo(
    () =>
      state.tasks.filter((task) => {
        if (scope === 'open' && !isTaskOpen(task)) return false;
        if (scope === 'mine' && task.assigneeId !== me.id) return false;
        if (status !== 'all' && task.status !== status) return false;
        if (assignee !== 'all' && task.assigneeId !== assignee) return false;
        if (department !== 'all' && task.departmentId !== department) return false;
        if (kind !== 'all' && task.kind !== kind) return false;
        if (q && !`${task.title} ${task.description}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [state.tasks, scope, status, assignee, department, kind, q, me.id],
  );

  const linkLabel = (task: Task) => {
    if (task.link?.kind === 'content') return state.content.find((item) => item.id === task.link!.id)?.title ?? '—';
    if (task.link?.kind === 'course') {
      const course = state.courses.find((item) => item.id === task.link!.id);
      return course ? `${course.code} — ${course.cohort}` : '—';
    }
    if (task.link?.kind === 'plan') return t('Monthly plan', 'الخطة الشهرية');
    if (task.link?.kind === 'campaign') return state.campaigns.find((item) => item.id === task.link!.id)?.name ?? '—';
    return '—';
  };

  const columns: Column<Task>[] = [
    {
      key: 'title',
      header: t('Task', 'المهمة'),
      sort: (task) => task.title,
      cell: (task) => (
        <div className="cell-title">
          <span className="cell-title__link" dir="auto">
            {task.title}
          </span>
          <span className="cell-title__meta">
            {tx(taskKindLabel[task.kind])}
            <PriorityBadge priority={task.priority} />
            {task.dependsOn.some((id) => state.tasks.find((entry) => entry.id === id)?.status !== 'done') && <span className="u-xs due due--today">{t('Waiting on another task', 'تنتظر مهمة أخرى')}</span>}
          </span>
        </div>
      ),
    },
    { key: 'link', header: t('Linked to', 'مرتبطة بـ'), cell: (task) => <span className="u-truncate u-sm" dir="auto">{linkLabel(task)}</span>, secondary: true },
    { key: 'assignee', header: t('Assignee', 'المسند إليه'), sort: (task) => displayName(state.users, task.assigneeId), cell: (task) => <Person users={state.users} id={task.assigneeId} /> },
    { key: 'department', header: t('Department', 'القسم'), sort: (task) => task.departmentId, cell: (task) => <DepartmentName id={task.departmentId} />, secondary: true },
    { key: 'due', header: t('Due', 'الموعد'), sort: (task) => (task.dueAt ? parseTimestamp(task.dueAt) : null), cell: (task) => <DueLabel iso={task.dueAt} now={now} done={!isTaskOpen(task)} /> },
    { key: 'status', header: t('Status', 'الحالة'), sort: (task) => TASK_STATUSES.indexOf(task.status), cell: (task) => <TaskStatusBadge status={task.status} /> },
    {
      key: 'action',
      header: <span className="sr-only">{t('Actions', 'إجراءات')}</span>,
      align: 'end',
      cell: (task) =>
        task.assigneeId === me.id && isTaskOpen(task) ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              act(setTaskStatus(task.id, task.status === 'todo' ? 'in_progress' : 'done'), task.status === 'todo' ? t('Started', 'بدأت') : t('Marked done', 'تمت'));
            }}
          >
            {task.status === 'todo' ? t('Start', 'ابدأ') : t('Done', 'تم')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="u-stack">
      <div className="toolbar">
        <div className="toolbar__search">
          <SearchInput value={q} onChange={(value) => setQuery({ q: value || null })} placeholder={t('Search tasks', 'ابحث في المهام')} label={t('Search tasks', 'ابحث في المهام')} />
        </div>
        <Segmented
          label={t('Scope', 'النطاق')}
          value={scope}
          onChange={(value) => setQuery({ scope: value === 'open' ? null : value })}
          items={[
            { value: 'open', label: t('Open', 'المفتوحة') },
            { value: 'mine', label: t('Mine', 'مهامي') },
            { value: 'all', label: t('All', 'الكل') },
          ]}
        />
      </div>
      <div className="filters">
        <FilterSelect label={t('Status', 'الحالة')} allLabel={t('All', 'الكل')} value={status} onChange={(value) => setQuery({ status: value === 'all' ? null : value })} options={TASK_STATUSES.map((value) => ({ value, label: tx(taskStatusLabel[value]) }))} />
        <FilterSelect label={t('Assignee', 'المسند إليه')} allLabel={t('Anyone', 'أي شخص')} value={assignee} onChange={(value) => setQuery({ assignee: value === 'all' ? null : value })} options={state.users.map((user) => ({ value: user.id, label: user.name }))} />
        <FilterSelect label={t('Department', 'القسم')} allLabel={t('All', 'الكل')} value={department} onChange={(value) => setQuery({ department: value === 'all' ? null : value })} options={DEPARTMENTS.map((entry) => ({ value: entry.id, label: tx(entry.name) }))} />
        <FilterSelect label={t('Kind', 'النوع')} allLabel={t('All', 'الكل')} value={kind} onChange={(value) => setQuery({ kind: value === 'all' ? null : value })} options={KINDS.map((value) => ({ value, label: tx(taskKindLabel[value]) }))} />
      </div>
      <p className="u-sm u-muted u-tnum">{t(`${num(rows.length)} tasks`, `${num(rows.length)} مهمة`)}</p>
      <DataTable
        caption={t('Tasks', 'المهام')}
        rows={rows}
        columns={columns}
        rowKey={(task) => task.id}
        rowLabel={(task) => task.title}
        onRowClick={(task) => setQuery({ task: task.id }, { replace: false })}
        initialSort={{ key: 'due', dir: 'asc' }}
        empty={<EmptyState title={t('No tasks match.', 'لا مهام مطابقة.')} text={t('Change the scope or clear a filter.', 'غيّر النطاق أو امسح أحد الفلاتر.')} />}
      />
    </div>
  );
}

function Approvals({ now, canApprove }: { now: number; canApprove: boolean }) {
  const { t, date } = useI18n();
  const { state } = useWorkspace();
  const decided = [...state.approvals].filter((approval) => approval.decidedAt).sort((a, b) => parseTimestamp(b.decidedAt!) - parseTimestamp(a.decidedAt!)).slice(0, 15);
  return (
    <div className="u-stack">
      {!canApprove && <p className="u-sm u-muted">{t('Marketing reviews and approves. You can follow where your items stand.', 'التسويق يراجع ويعتمد. يمكنك متابعة حالة عناصرك.')}</p>}
      <ReviewQueueCard now={now} limit={50} title={t('Waiting for Marketing', 'بانتظار التسويق')} />
      <Card>
        <CardHeader title={t('Recent decisions', 'آخر القرارات')} description={t('Every round is kept; a resubmission opens a new one.', 'كل جولة محفوظة؛ إعادة الإرسال تفتح جولة جديدة.')} />
        {decided.length === 0 ? (
          <EmptyState compact title={t('No decisions yet.', 'لا قرارات بعد.')} />
        ) : (
          <ul className="lines">
            {decided.map((approval) => {
              const item = state.content.find((entry) => entry.id === approval.contentId);
              return (
                <li key={approval.id} className="line">
                  <div className="line__main">
                    <Link to={`/content/${approval.contentId}`} className="line__title" dir="auto">
                      {item?.title ?? '—'}
                    </Link>
                    <span className="line__meta">
                      {t(`Round ${approval.round}`, `الجولة ${approval.round}`)} · {userById(state, approval.decidedById)?.name} · {date(approval.decidedAt, 'dateTime')}
                      {approval.note && (
                        <span className="u-truncate" dir="auto">
                          — {approval.note}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="line__side">
                    <ApprovalBadge status={approval.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
