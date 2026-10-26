import { useState } from 'react';
import { DateTime } from 'luxon';
import { Link2, Paperclip } from 'lucide-react';
import { Link } from '../../app/router/router';
import { Field, Input, Select, Textarea } from '../../components/forms/Field';
import { Dialog, Drawer } from '../../components/overlay/Overlay';
import { Person } from '../../components/ui/Avatar';
import { DemoBadge, PriorityBadge, TaskStatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DefinitionList } from '../../components/ui/Card';
import { departmentById } from '../../domain/catalog';
import type { Priority } from '../../domain/shared';
import type { Task, TaskKind, TaskStatus } from '../../domain/workflow';
import { TASK_STATUSES } from '../../domain/workflow';
import { useI18n } from '../../i18n/I18nProvider';
import { priorityLabel, taskKindLabel, taskStatusLabel } from '../../i18n/labels';
import { businessZone } from '../../lib/format';
import { Comments } from '../content/Comments';
import { DueLabel } from '../content/parts';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useAct } from '../workspace/hooks';
import { hasPermission } from '../workspace/permissions';

const KINDS: TaskKind[] = ['design', 'video_edit', 'copy', 'capture', 'revision', 'review', 'coordination'];

export function NewTaskDialog({ open, onClose, link, defaultTitle }: { open: boolean; onClose: () => void; link?: Task['link']; defaultTitle?: string }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={t('New task', 'مهمة جديدة')} description={t('Tasks are separate from content: one item can have several.', 'المهام منفصلة عن المحتوى: العنصر الواحد قد يكون له عدة مهام.')} size="md">
      {open && <NewTaskForm link={link ?? null} defaultTitle={defaultTitle} onDone={onClose} />}
    </Dialog>
  );
}

function NewTaskForm({ link, defaultTitle, onDone }: { link: Task['link']; defaultTitle?: string; onDone: () => void }) {
  const { t, tx } = useI18n();
  const { state, me, createTask } = useWorkspace();
  const act = useAct();
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [kind, setKind] = useState<TaskKind>('design');
  const [assigneeId, setAssigneeId] = useState(me.id);
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [description, setDescription] = useState('');
  const canAssignOthers = hasPermission(me, 'task.assign') || hasPermission(me, 'content.approve');
  const people = canAssignOthers ? state.users.filter((user) => user.status === 'active') : [me];

  const submit = () => {
    const result = createTask({
      title,
      description,
      kind,
      assigneeId,
      dueAt: due ? DateTime.fromISO(due, { zone: businessZone() }).toUTC().toISO() : null,
      priority,
      link,
    });
    if (act(result, t('Task created', 'تم إنشاء المهمة'), title)) onDone();
  };

  return (
    <form
      className="u-stack"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field label={t('Task', 'المهمة')} required>
        {(id) => <Input id={id} data-autofocus value={title} onChange={(event) => setTitle(event.target.value)} dir="auto" required />}
      </Field>
      <div className="u-grid u-grid--2">
        <Field label={t('Kind', 'النوع')}>
          {(id) => (
            <Select id={id} value={kind} onChange={(event) => setKind(event.target.value as TaskKind)}>
              {KINDS.map((value) => (
                <option key={value} value={value}>
                  {tx(taskKindLabel[value])}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('Assign to', 'إسناد إلى')} hint={canAssignOthers ? undefined : t('Your role can create tasks for yourself only.', 'دورك يسمح بإنشاء مهام لنفسك فقط.')}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              {people.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                  {user.departmentId ? ` — ${tx(departmentById(user.departmentId)!.name)}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('Due', 'الموعد')}>{(id) => <Input id={id} type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} />}</Field>
        <Field label={t('Priority', 'الأولوية')}>
          {(id) => (
            <Select id={id} value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              {(['low', 'normal', 'high', 'urgent'] as Priority[]).map((value) => (
                <option key={value} value={value}>
                  {tx(priorityLabel[value])}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label={t('Details', 'التفاصيل')}>{(id) => <Textarea id={id} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} dir="auto" />}</Field>
      <div className="u-row u-row--between">
        <span className="u-xs u-muted">{link ? t('Linked to the current record.', 'مرتبطة بالسجل الحالي.') : t('Not linked to content.', 'غير مرتبطة بمحتوى.')}</span>
        <div className="u-row">
          <Button variant="ghost" onClick={onDone}>
            {t('Cancel', 'إلغاء')}
          </Button>
          <Button type="submit" variant="primary">
            {t('Create task', 'إنشاء المهمة')}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** A task's own workspace: status, link, dependencies, attachments, discussion and history. */
export function TaskDrawer({ task, onClose, now }: { task: Task | null; onClose: () => void; now: number }) {
  const { t } = useI18n();
  return (
    <Drawer open={Boolean(task)} onClose={onClose} title={task?.title ?? ''} label={t('Task', 'مهمة')} width="lg" subtitle={task ? <TaskSubtitle task={task} /> : null}>
      {task && <TaskBody task={task} now={now} />}
    </Drawer>
  );
}

function TaskSubtitle({ task }: { task: Task }) {
  const { tx } = useI18n();
  return (
    <span className="u-row u-row--wrap">
      <TaskStatusBadge status={task.status} />
      <PriorityBadge priority={task.priority} />
      <span className="u-muted u-sm">{tx(taskKindLabel[task.kind])}</span>
      <DemoBadge />
    </span>
  );
}

function TaskBody({ task, now }: { task: Task; now: number }) {
  const { t, tx, date, relative } = useI18n();
  const { state, me, setTaskStatus } = useWorkspace();
  const act = useAct();
  const canChange = task.assigneeId === me.id || task.ownerId === me.id || hasPermission(me, 'task.assign');
  const linked =
    task.link?.kind === 'content'
      ? { label: state.content.find((item) => item.id === task.link!.id)?.title, to: `/content/${task.link.id}` }
      : task.link?.kind === 'course'
        ? { label: (() => { const course = state.courses.find((item) => item.id === task.link!.id); return course ? `${course.code} — ${course.cohort}` : undefined; })(), to: `/calendar?course=${task.link.id}` }
        : task.link?.kind === 'plan'
          ? { label: t('Monthly plan', 'الخطة الشهرية'), to: `/departments/${task.departmentId}` }
          : task.link?.kind === 'campaign'
            ? { label: state.campaigns.find((item) => item.id === task.link!.id)?.name, to: `/content?campaign=${task.link.id}` }
            : null;
  const dependencies = task.dependsOn.map((id) => state.tasks.find((entry) => entry.id === id)).filter((entry): entry is Task => Boolean(entry));
  const blocking = state.tasks.filter((entry) => entry.dependsOn.includes(task.id));
  const attachments = task.attachmentIds.map((id) => state.assets.find((asset) => asset.id === id)).filter(Boolean);
  const history = state.activity.filter((entry) => entry.entity.kind === 'task' && entry.entity.id === task.id).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="u-stack u-stack--lg">
      <div className="u-row u-row--wrap">
        <label className="ui-filter ui-filter--on">
          <span className="ui-filter__label">{t('Status', 'الحالة')}</span>
          <select value={task.status} disabled={!canChange} onChange={(event) => act(setTaskStatus(task.id, event.target.value as TaskStatus), t('Task updated', 'تم تحديث المهمة'))}>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tx(taskStatusLabel[status])}
              </option>
            ))}
          </select>
        </label>
        {task.status !== 'done' && canChange && (
          <Button size="sm" variant="primary" onClick={() => act(setTaskStatus(task.id, 'done'), t('Marked done', 'تمت'))}>
            {t('Mark done', 'تعليم كمنجزة')}
          </Button>
        )}
        {!canChange && <span className="u-xs u-muted">{t('Only the assignee, the owner or a manager can change this task.', 'يغيّر المهمة المسند إليه أو المالك أو المدير فقط.')}</span>}
      </div>

      {task.description && (
        <p className="prose" dir="auto">
          {task.description}
        </p>
      )}

      <DefinitionList
        items={[
          { label: t('Assigned to', 'مسندة إلى'), value: <Person users={state.users} id={task.assigneeId} /> },
          { label: t('Department', 'القسم'), value: departmentById(task.departmentId) ? tx(departmentById(task.departmentId)!.name) : '—' },
          { label: t('Owner', 'المالك'), value: <Person users={state.users} id={task.ownerId} /> },
          { label: t('Due', 'الموعد'), value: <DueLabel iso={task.dueAt} now={now} done={task.status === 'done'} /> },
          { label: t('Linked to', 'مرتبطة بـ'), value: linked?.label ? <Link to={linked.to} className="ui-link" dir="auto"><Link2 size={13} /> {linked.label}</Link> : '—' },
          { label: t('Created', 'أُنشئت'), value: date(task.createdAt, 'dateTime') },
          ...(task.completedAt ? [{ label: t('Completed', 'أُنجزت'), value: date(task.completedAt, 'dateTime') }] : []),
        ]}
      />

      {(dependencies.length > 0 || blocking.length > 0) && (
        <section className="u-stack u-stack--sm">
          <h3 className="sub-title">{t('Dependencies', 'الاعتماديات')}</h3>
          {dependencies.map((entry) => (
            <p key={entry.id} className="u-row u-sm">
              <span className="u-muted">{t('Waits for', 'تنتظر')}</span>
              <span dir="auto">{entry.title}</span>
              <TaskStatusBadge status={entry.status} />
            </p>
          ))}
          {blocking.map((entry) => (
            <p key={entry.id} className="u-row u-sm">
              <span className="u-muted">{t('Blocks', 'توقف')}</span>
              <span dir="auto">{entry.title}</span>
              <TaskStatusBadge status={entry.status} />
            </p>
          ))}
        </section>
      )}

      <section className="u-stack u-stack--sm">
        <h3 className="sub-title">{t('Attachments', 'المرفقات')}</h3>
        {attachments.length === 0 ? (
          <p className="u-sm u-muted">{t('No attachments.', 'لا مرفقات.')}</p>
        ) : (
          <ul className="u-stack u-stack--xs">
            {attachments.map((asset) => (
              <li key={asset!.id} className="u-row u-sm">
                <Paperclip size={14} aria-hidden />
                <Link to={`/media?asset=${asset!.id}`} className="ui-link">
                  {asset!.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="u-stack u-stack--sm">
        <h3 className="sub-title">{t('Discussion', 'النقاش')}</h3>
        <Comments entity={{ kind: 'task', id: task.id }} now={now} />
      </section>

      <section className="u-stack u-stack--sm">
        <h3 className="sub-title">{t('Activity', 'السجل')}</h3>
        <ul className="history">
          {history.map((entry) => (
            <li key={entry.id}>
              <Person users={state.users} id={entry.actorId} size={18} /> <span className="u-muted u-sm">{entry.action === 'task_created' ? t('created the task', 'أنشأ المهمة') : entry.action === 'task_completed' ? t('completed it', 'أنجزها') : t(`changed status ${entry.detail}`, `غيّر الحالة ${entry.detail}`)}</span>
              <span className="u-xs u-subtle">{relative(entry.at, now)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
