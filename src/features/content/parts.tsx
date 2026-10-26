import { useState, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { CalendarClock, CircleCheck, FilePenLine, Send } from 'lucide-react';
import { Link } from '../../app/router/router';
import { Channels } from '../../components/data-display/ChannelIcon';
import { Field, Input, Select, Textarea } from '../../components/forms/Field';
import { Dialog } from '../../components/overlay/Overlay';
import { Person } from '../../components/ui/Avatar';
import { Badge, ContentStatusBadge, DemoBadge, PriorityBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Menu, type MenuItem } from '../../components/ui/Menu';
import { departmentById } from '../../domain/catalog';
import type { ContentItem, ContentStatus } from '../../domain/content';
import { TRANSITIONS } from '../../domain/content';
import type { DepartmentId } from '../../domain/users';
import { useI18n } from '../../i18n/I18nProvider';
import { contentTypeLabel } from '../../i18n/labels';
import { businessZone, parseTimestamp } from '../../lib/format';
import { BestTime } from '../publishing/BestTime';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useAct } from '../workspace/hooks';
import { allowedTransitions } from '../workspace/permissions';
import { dueBucket } from '../workspace/selectors';

export function DepartmentName({ id }: { id: DepartmentId | null }) {
  const { tx } = useI18n();
  const department = departmentById(id);
  return <span className="dept-name">{department ? tx(department.name) : '—'}</span>;
}

/** Due date with urgency: overdue in red, today in amber, otherwise quiet. */
export function DueLabel({ iso, now, done, prefix }: { iso: string | null; now: number; done?: boolean; prefix?: string }) {
  const { t, date, relative } = useI18n();
  if (!iso) return <span className="u-subtle">—</span>;
  const bucket = done ? 'later' : dueBucket(iso, now);
  const text = bucket === 'today' ? `${t('Today', 'اليوم')} ${date(iso, 'time')}` : bucket === 'overdue' ? `${t('Overdue', 'متأخر')} · ${relative(iso, now)}` : date(iso, 'dayShort');
  return (
    <span className={`due due--${bucket}`} title={date(iso, 'dateTime')}>
      {prefix && <span className="u-muted">{prefix} </span>}
      {text}
    </span>
  );
}

export function LiveBadge() {
  const { t } = useI18n();
  return (
    <span className="ui-live-badge" title={t('From the live calendar (SQLite). Edit it in the Calendar.', 'من التقويم الحي (SQLite). يُعدّل من التقويم.')}>
      {t('Calendar', 'التقويم')}
    </span>
  );
}

export const ProvenanceBadge = ({ item }: { item: Pick<ContentItem, 'provenance'> }) => (item.provenance === 'live' ? <LiveBadge /> : <DemoBadge />);

/** A dense one-line content row used on Home, My Work and department pages. */
export function ContentLine({ item, now, meta, actions }: { item: ContentItem; now: number; meta?: ReactNode; actions?: ReactNode }) {
  const { state } = useWorkspace();
  const { tx } = useI18n();
  const done = item.status === 'published' || item.status === 'scheduled';
  return (
    <li className="line">
      <div className="line__main">
        <Link to={`/content/${item.id}`} className="line__title" dir="auto">
          {item.title}
        </Link>
        <span className="line__meta">
          <DepartmentName id={item.departmentId} />
          <span aria-hidden>·</span>
          <span>{tx(contentTypeLabel[item.type])}</span>
          <Channels channels={item.channels} size={12} />
          {meta}
        </span>
      </div>
      <div className="line__side">
        <PriorityBadge priority={item.priority} />
        <ContentStatusBadge status={item.status} />
        {item.status === 'scheduled' ? <DueLabel iso={item.publishAt} now={now} done /> : <DueLabel iso={item.dueAt} now={now} done={done} />}
        <span className="line__person">
          <Person users={state.users} id={item.assigneeId ?? item.ownerId} size={20} />
        </span>
        {actions}
      </div>
    </li>
  );
}

/* ── Status moves ──────────────────────────────────────────────────── */

export function transitionLabel(from: ContentStatus, to: ContentStatus, t: (en: string, ar: string) => string): string {
  switch (to) {
    case 'draft':
      return from === 'cancelled' ? t('Reopen', 'إعادة فتح') : from === 'idea' ? t('Start draft', 'ابدأ المسودة') : t('Back to draft', 'رجوع للمسودة');
    case 'in_production':
      return from === 'changes_requested' ? t('Start revision', 'ابدأ التعديل') : t('Start production', 'ابدأ الإنتاج');
    case 'ready_for_review':
      return from === 'changes_requested' ? t('Resubmit for review', 'أعد الإرسال للمراجعة') : t('Submit for review', 'أرسل للمراجعة');
    case 'approved':
      return from === 'scheduled' ? t('Unschedule', 'إلغاء الجدولة') : t('Approve', 'اعتماد');
    case 'changes_requested':
      return t('Request changes', 'طلب تعديلات');
    case 'cancelled':
      return from === 'ready_for_review' ? t('Reject', 'رفض') : t('Cancel item', 'إلغاء العنصر');
    case 'scheduled':
      return t('Schedule', 'جدولة');
    case 'published':
      return t('Record as published', 'تسجيل النشر');
    case 'archived':
      return t('Archive', 'أرشفة');
    default:
      return to;
  }
}

const PRIMARY = new Set<ContentStatus>(['approved', 'ready_for_review', 'scheduled', 'published', 'in_production']);
const ICONS: Partial<Record<ContentStatus, ReactNode>> = {
  approved: <CircleCheck size={15} />,
  ready_for_review: <Send size={15} className="u-flip" />,
  scheduled: <CalendarClock size={15} />,
  changes_requested: <FilePenLine size={15} />,
};

export interface PendingMove {
  item: ContentItem;
  to: ContentStatus;
}

/** Runs moves that need no input; returns the move when a form is needed. */
export function useMove() {
  const { transition } = useWorkspace();
  const act = useAct();
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingMove | null>(null);
  const request = (item: ContentItem, to: ContentStatus) => {
    const move = TRANSITIONS[item.status].find((entry) => entry.to === to);
    if (move?.needs) {
      setPending({ item, to });
      return;
    }
    act(transition(item.id, { to }), transitionDone(item.status, to, t), item.title);
  };
  const dialog = <TransitionDialog pending={pending} onClose={() => setPending(null)} />;
  return { request, dialog };
}

function transitionDone(from: ContentStatus, to: ContentStatus, t: (en: string, ar: string) => string) {
  if (to === 'approved' && from === 'ready_for_review') return t('Approved', 'تم الاعتماد');
  if (to === 'ready_for_review') return t('Sent to Marketing review', 'أُرسل لمراجعة التسويق');
  if (to === 'scheduled') return t('Scheduled', 'تمت الجدولة');
  if (to === 'changes_requested') return t('Changes requested', 'تم طلب التعديلات');
  return t('Status updated', 'تم تحديث الحالة');
}

/** Buttons for the moves this person may make: the main ones inline, the rest in a menu. */
export function TransitionActions({ item, onRequest, size = 'md', limit = 2 }: { item: ContentItem; onRequest: (item: ContentItem, to: ContentStatus) => void; size?: 'sm' | 'md'; limit?: number }) {
  const { t } = useI18n();
  const { me } = useWorkspace();
  const moves = allowedTransitions(me, item);
  if (!moves.length) return null;
  const inline = moves.filter((move) => PRIMARY.has(move.to) || move.to === 'changes_requested').slice(0, limit);
  const rest = moves.filter((move) => !inline.includes(move));
  const menu: MenuItem[] = rest.map((move) => ({ key: move.to, label: transitionLabel(item.status, move.to, t), danger: move.to === 'cancelled', onSelect: () => onRequest(item, move.to) }));
  return (
    <div className="u-row u-row--wrap transition-actions">
      {inline.map((move, index) => (
        <Button
          key={move.to}
          size={size}
          variant={index === 0 && move.to !== 'changes_requested' ? 'primary' : 'secondary'}
          icon={ICONS[move.to]}
          onClick={(event) => {
            event.stopPropagation();
            onRequest(item, move.to);
          }}
        >
          {transitionLabel(item.status, move.to, t)}
        </Button>
      ))}
      {menu.length > 0 && (
        <Menu
          label={t('More status actions', 'إجراءات أخرى')}
          items={menu}
          trigger={(props) => (
            <Button size={size} variant="ghost" {...props} onClick={(event) => {
              event.stopPropagation();
              props.onClick();
            }}>
              {t('More', 'المزيد')}
            </Button>
          )}
        />
      )}
    </div>
  );
}

const toLocalInput = (iso: string) => DateTime.fromMillis(parseTimestamp(iso), { zone: businessZone() }).toFormat("yyyy-LL-dd'T'HH:mm");
const fromLocalInput = (value: string) => DateTime.fromISO(value, { zone: businessZone() }).toUTC().toISO() ?? '';

/** The form for moves that need input: a review note, a publishing time, or proof of publishing. */
export function TransitionDialog({ pending, onClose }: { pending: PendingMove | null; onClose: () => void }) {
  const { t } = useI18n();
  const title = pending ? transitionLabel(pending.item.status, pending.to, t) : '';
  return (
    <Dialog open={Boolean(pending)} onClose={onClose} title={title} description={pending?.item.title} size="md">
      {pending && <TransitionForm key={`${pending.item.id}-${pending.to}`} pending={pending} onDone={onClose} />}
    </Dialog>
  );
}

function TransitionForm({ pending, onDone }: { pending: PendingMove; onDone: () => void }) {
  const { t } = useI18n();
  const { transition, state } = useWorkspace();
  const act = useAct();
  const { item, to } = pending;
  const move = TRANSITIONS[item.status].find((entry) => entry.to === to);
  const now = Date.now();
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState(item.assigneeId ?? '');
  const [revisionDue, setRevisionDue] = useState(() => toLocalInput(new Date(now + 86_400_000).toISOString()));
  const [publishAt, setPublishAt] = useState(() => toLocalInput(item.publishAt ?? item.dueAt ?? new Date(now + 3_600_000).toISOString()));
  const [proof, setProof] = useState('');
  const producers = state.users.filter((user) => user.status === 'active' && user.role !== 'admin');

  const submit = () => {
    const ok = act(
      transition(item.id, {
        to,
        note,
        publishAt: move?.needs === 'publish_time' ? fromLocalInput(publishAt) : undefined,
        proofUrl: proof,
        revisionAssigneeId: to === 'changes_requested' && assignee ? assignee : undefined,
        revisionDueAt: to === 'changes_requested' && assignee ? fromLocalInput(revisionDue) : undefined,
      }),
      transitionDone(item.status, to, t),
      item.title,
    );
    if (ok) onDone();
  };

  return (
    <form
      className="u-stack"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {move?.needs === 'note' && (
        <>
          <Field label={to === 'changes_requested' ? t('What needs to change?', 'ما المطلوب تعديله؟') : t('Reason', 'السبب')} required hint={t('The owner sees this note in the approval history.', 'يرى المالك هذه الملاحظة في سجل الاعتماد.')}>
            {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} data-autofocus rows={4} value={note} onChange={(event) => setNote(event.target.value)} required dir="auto" />}
          </Field>
          {to === 'changes_requested' && (
            <div className="u-grid u-grid--2">
              <Field label={t('Assign a revision task to', 'أسند مهمة تعديل إلى')} hint={t('Optional. Creates a task linked to this item.', 'اختياري. ينشئ مهمة مرتبطة بهذا العنصر.')}>
                {(id, describedBy) => (
                  <Select id={id} aria-describedby={describedBy} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                    <option value="">{t('No task', 'بدون مهمة')}</option>
                    {producers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {assignee && (
                <Field label={t('Revision due', 'موعد التعديل')}>
                  {(id) => <Input id={id} type="datetime-local" value={revisionDue} onChange={(event) => setRevisionDue(event.target.value)} />}
                </Field>
              )}
            </div>
          )}
        </>
      )}
      {move?.needs === 'publish_time' && (
        <>
          <Field label={t('Publish on', 'موعد النشر')} required hint={t('Business time zone', 'بتوقيت الشركة')}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="datetime-local" data-autofocus value={publishAt} onChange={(event) => setPublishAt(event.target.value)} required />}
          </Field>
          <BestTime channels={item.channels} now={now} onUse={(iso) => setPublishAt(toLocalInput(iso))} compact />
          <p className="u-xs u-muted">{t('Scheduling records the slot. Social Pulse does not post automatically; the publisher posts and then records the link.', 'الجدولة تسجل الموعد فقط. Social Pulse لا ينشر تلقائيًا؛ مسؤول النشر ينشر ثم يسجل الرابط.')}</p>
        </>
      )}
      {move?.needs === 'publish_proof' && (
        <Field label={t('Published post link', 'رابط البوست المنشور')} required hint={t('The item counts as published only with proof.', 'يُحسب العنصر منشورًا فقط بدليل.')}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="url" inputMode="url" dir="ltr" placeholder="https://" data-autofocus value={proof} onChange={(event) => setProof(event.target.value)} required />}
        </Field>
      )}
      <div className="u-row u-row--between">
        <span className="u-xs u-muted">
          <ContentStatusBadge status={item.status} /> → <ContentStatusBadge status={to} />
        </span>
        <div className="u-row">
          <Button variant="ghost" onClick={onDone}>
            {t('Cancel', 'إلغاء')}
          </Button>
          <Button type="submit" variant={to === 'cancelled' ? 'danger' : 'primary'}>
            {transitionLabel(item.status, to, t)}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** "Assign" control for owners and people with task.assign. */
export function AssignMenu({ item, size = 'sm' }: { item: ContentItem; size?: 'sm' | 'md' }) {
  const { t, tx } = useI18n();
  const { state, me, can, assignContent } = useWorkspace();
  const act = useAct();
  if (item.provenance === 'live' || (!can('task.assign') && item.ownerId !== me.id)) return null;
  const items: MenuItem[] = [
    { key: 'none', label: t('Unassigned', 'بدون إسناد'), onSelect: () => act(assignContent(item.id, null), t('Assignment cleared', 'تم إلغاء الإسناد')) },
    ...state.users
      .filter((user) => user.status === 'active' && user.role !== 'admin')
      .map((user) => ({
        key: user.id,
        label: user.name,
        hint: departmentById(user.departmentId) ? tx(departmentById(user.departmentId)!.name) : undefined,
        onSelect: () => act(assignContent(item.id, user.id), t(`Assigned to ${user.name}`, `أُسند إلى ${user.name}`)),
      })),
  ];
  return <Menu label={t('Assign', 'إسناد')} items={items} trigger={(props) => <Button size={size} variant="secondary" {...props}>{t('Assign', 'إسناد')}</Button>} />;
}

export function OriginBadge({ item }: { item: ContentItem }) {
  const { t } = useI18n();
  if (item.ai.used) return <Badge tone="violet">{t('AI-assisted', 'بمساعدة AI')}</Badge>;
  if (item.origin === 'template') return <Badge>{t('From template', 'من قالب')}</Badge>;
  return null;
}
