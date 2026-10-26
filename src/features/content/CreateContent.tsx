import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { useRouter } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Field, Input, Select, Textarea } from '../../components/forms/Field';
import { Dialog } from '../../components/overlay/Overlay';
import { Button } from '../../components/ui/Button';
import { DEPARTMENTS, departmentById } from '../../domain/catalog';
import type { ContentType } from '../../domain/content';
import { CONTENT_TYPES } from '../../domain/content';
import type { Channel, Priority } from '../../domain/shared';
import { CHANNELS } from '../../domain/shared';
import type { DepartmentId } from '../../domain/users';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName, contentTypeLabel, priorityLabel } from '../../i18n/labels';
import { businessZone } from '../../lib/format';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useAct } from '../workspace/hooks';
import { monthKey } from '../workspace/selectors';

export interface CreatePrefill {
  templateId?: string;
  courseId?: string;
  departmentId?: DepartmentId;
  title?: string;
  type?: ContentType;
  caption?: string;
  /** yyyy-MM-dd */
  dueDate?: string;
}

interface CreateApi {
  open: (prefill?: CreatePrefill) => void;
}

const CreateContext = createContext<CreateApi | null>(null);

/** One "Create content" flow for the whole app: Home, Content, Templates, events and the command palette open it. */
export function CreateContentProvider({ children }: { children: ReactNode }) {
  const [prefill, setPrefill] = useState<CreatePrefill | null>(null);
  const [serial, setSerial] = useState(0);
  const { t } = useI18n();
  const open = useCallback((next: CreatePrefill = {}) => {
    setSerial((value) => value + 1);
    setPrefill(next);
  }, []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <CreateContext.Provider value={api}>
      {children}
      <Dialog open={prefill !== null} onClose={() => setPrefill(null)} title={t('Create content', 'إنشاء محتوى')} description={t('It starts as an idea or a draft. Marketing reviews it before anything is scheduled.', 'يبدأ كفكرة أو مسودة. التسويق يراجعه قبل أي جدولة.')} size="lg">
        {prefill && <CreateForm key={serial} prefill={prefill} onDone={() => setPrefill(null)} />}
      </Dialog>
    </CreateContext.Provider>
  );
}

export function useCreateContent(): CreateApi {
  const value = useContext(CreateContext);
  if (!value) throw new Error('useCreateContent must be used inside CreateContentProvider.');
  return value;
}

const toDue = (day: string) => (day ? DateTime.fromISO(day, { zone: businessZone() }).set({ hour: 18 }).toUTC().toISO() : null);

function CreateForm({ prefill, onDone }: { prefill: CreatePrefill; onDone: () => void }) {
  const { t, tx, date } = useI18n();
  const { state, me, createContent } = useWorkspace();
  const { navigate } = useRouter();
  const act = useAct();

  const [templateId, setTemplateId] = useState(prefill.templateId ?? '');
  const template = state.templates.find((entry) => entry.id === templateId) ?? null;
  const [courseId, setCourseId] = useState(prefill.courseId ?? '');
  const course = state.courses.find((entry) => entry.id === courseId) ?? null;
  const [departmentId, setDepartmentId] = useState<DepartmentId>(prefill.departmentId ?? template?.departmentId ?? me.departmentId ?? 'marketing');
  const [type, setType] = useState<ContentType>(prefill.type ?? template?.contentType ?? 'post');
  const [channels, setChannels] = useState<Channel[]>(template?.channels ?? ['facebook', 'instagram', 'linkedin']);
  const [title, setTitle] = useState(prefill.title ?? '');
  const [titleTouched, setTitleTouched] = useState(Boolean(prefill.title));
  const [caption, setCaption] = useState(prefill.caption ?? '');
  const [captionTouched, setCaptionTouched] = useState(Boolean(prefill.caption));
  const [dueDate, setDueDate] = useState(prefill.dueDate ?? '');
  const [assigneeId, setAssigneeId] = useState(template?.defaultAssigneeIds[0] ?? '');
  const [priority, setPriority] = useState<Priority>('normal');
  const [status, setStatus] = useState<'idea' | 'draft'>(template ? 'draft' : 'idea');
  const [error, setError] = useState('');

  const needsCourse = Boolean(template?.fields.some((field) => field.kind === 'course'));
  const month = monthKey(Date.now());
  const plan = state.plans.find((entry) => entry.departmentId === departmentId && entry.month === month);
  const [targetId, setTargetId] = useState(() => plan?.targets.find((target) => target.templateId && target.templateId === template?.id)?.id ?? '');
  const departments = me.role === 'admin' || me.role === 'marketing_manager' || me.role === 'publisher' || !me.departmentId ? DEPARTMENTS : DEPARTMENTS.filter((entry) => entry.id === me.departmentId || entry.id === 'marketing');

  /** Loads what the template and the course already know, unless the person typed their own. */
  const autofill = (nextTemplate = template, nextCourse = course) => {
    if (!titleTouched && nextTemplate) setTitle(nextCourse ? `${nextTemplate.name.en} — ${nextCourse.code} ${nextCourse.cohort}` : nextTemplate.name.en);
    if (!captionTouched && nextTemplate && nextCourse) {
      const lines = [
        `${nextCourse.title} (${nextCourse.code}) — ${nextCourse.cohort}`,
        `${t('Starts', 'يبدأ')}: ${date(nextCourse.startDate, 'weekdayDate')}`,
        nextCourse.studentCount != null ? `${t('Students', 'عدد الطلاب')}: ${nextCourse.studentCount}` : '',
        nextCourse.lecturerId ? `${t('Lecturer', 'المحاضر')}: ${state.users.find((user) => user.id === nextCourse.lecturerId)?.name ?? ''}` : '',
        tx(nextTemplate.cta),
        nextCourse.registrationUrl,
      ].filter(Boolean);
      setCaption(lines.join('\n'));
    }
  };

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const next = state.templates.find((entry) => entry.id === id) ?? null;
    if (next) {
      setDepartmentId(next.departmentId);
      setType(next.contentType);
      setChannels(next.channels);
      setAssigneeId(next.defaultAssigneeIds[0] ?? '');
      setStatus('draft');
      const nextPlan = state.plans.find((entry) => entry.departmentId === next.departmentId && entry.month === month);
      setTargetId(nextPlan?.targets.find((target) => target.templateId === next.id)?.id ?? '');
    }
    autofill(next, course);
  };

  const chooseCourse = (id: string) => {
    setCourseId(id);
    const next = state.courses.find((entry) => entry.id === id) ?? null;
    if (next && template?.id === 't-starts-next-week' && !dueDate) setDueDate(DateTime.fromISO(next.startDate).minus({ days: 7 }).toISODate() ?? '');
    autofill(template, next);
  };

  const toggleChannel = (channel: Channel) => setChannels((list) => (list.includes(channel) ? list.filter((entry) => entry !== channel) : [...list, channel]));

  const submit = () => {
    if (!title.trim()) return setError(t('Give it a title.', 'أضف عنوانًا.'));
    if (!channels.length) return setError(t('Choose at least one platform.', 'اختر منصة واحدة على الأقل.'));
    if (needsCourse && !courseId) return setError(t('This template needs a course.', 'هذا القالب يحتاج كورس.'));
    const result = createContent({
      title,
      type,
      departmentId,
      channels,
      templateId: templateId || null,
      courseId: courseId || null,
      dueAt: toDue(dueDate),
      caption,
      status,
      assigneeId: assigneeId || null,
      priority,
      planTargetId: targetId || null,
    });
    if (act(result, t('Content created', 'تم إنشاء المحتوى'), title) && result.ok) {
      onDone();
      navigate(`/content/${result.id}`);
    }
  };

  const people = state.users.filter((user) => user.status === 'active' && user.role !== 'admin');

  return (
    <form
      className="u-stack create-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="u-grid u-grid--2">
        <Field label={t('Template', 'القالب')} hint={template ? tx(template.description) : t('Optional. A template brings its fields, workflow and reviewers.', 'اختياري. القالب يضيف حقوله ومراحله ومراجعيه.')}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} value={templateId} onChange={(event) => chooseTemplate(event.target.value)}>
              <option value="">{t('No template', 'بدون قالب')}</option>
              {DEPARTMENTS.filter((department) => state.templates.some((entry) => entry.departmentId === department.id)).map((department) => (
                <optgroup key={department.id} label={tx(department.name)}>
                  {state.templates
                    .filter((entry) => entry.departmentId === department.id)
                    .map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {tx(entry.name)}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>
        {(needsCourse || courseId) && (
          <Field label={t('Course', 'الكورس')} required={needsCourse} hint={course ? `${date(course.startDate, 'date')} → ${date(course.endDate, 'date')}` : t('Course details fill the title and caption.', 'بيانات الكورس تملأ العنوان والنص.')}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} value={courseId} onChange={(event) => chooseCourse(event.target.value)}>
                <option value="">{t('Choose a course', 'اختر كورس')}</option>
                {state.courses.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.code} — {entry.cohort} ({date(entry.startDate, 'dayShort')})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>

      <Field label={t('Title', 'العنوان')} required error={error && !title.trim() ? error : undefined}>
        {(id, describedBy) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            data-autofocus
            value={title}
            dir="auto"
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleTouched(true);
            }}
          />
        )}
      </Field>

      <div className="u-grid u-grid--3">
        <Field label={t('Department', 'القسم')}>
          {(id) => (
            <Select id={id} value={departmentId} onChange={(event) => setDepartmentId(event.target.value as DepartmentId)}>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {tx(department.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('Type', 'النوع')}>
          {(id) => (
            <Select id={id} value={type} onChange={(event) => setType(event.target.value as ContentType)}>
              {CONTENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {tx(contentTypeLabel[value])}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('Due', 'موعد التسليم')}>{(id) => <Input id={id} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />}</Field>
      </div>

      <fieldset className="ui-field">
        <legend className="ui-field__label">{t('Platforms', 'المنصات')}</legend>
        <div className="chip-set">
          {CHANNELS.map((channel) => (
            <label key={channel} className="chip-toggle">
              <input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} />
              <ChannelIcon channel={channel} size={13} />
              <span>{channelName[channel]}</span>
            </label>
          ))}
        </div>
        {error && !channels.length && <p className="ui-field__error">{error}</p>}
      </fieldset>

      <div className="u-grid u-grid--3">
        <Field label={t('Assignee', 'المسند إليه')}>
          {(id) => (
            <Select id={id} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="">{t('Unassigned', 'بدون إسناد')}</option>
              {people.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
        <Field label={t('Counts toward plan', 'يُحسب ضمن خطة')} hint={plan ? undefined : t(`No ${departmentById(departmentId) ? tx(departmentById(departmentId)!.name) : ''} plan this month.`, 'لا توجد خطة لهذا القسم هذا الشهر.')}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={!plan}>
              <option value="">{t('Not in the plan', 'خارج الخطة')}</option>
              {plan?.targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {tx(target.label)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field label={t('Caption', 'النص')} hint={template ? `${t('Structure', 'البنية')}: ${tx(template.captionStructure)}` : t('You can refine it later or with AI Studio.', 'يمكن تحسينه لاحقًا أو من استوديو الذكاء الاصطناعي.')}>
        {(id, describedBy) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            rows={5}
            dir="auto"
            value={caption}
            onChange={(event) => {
              setCaption(event.target.value);
              setCaptionTouched(true);
            }}
          />
        )}
      </Field>

      <div className="u-row u-row--between u-row--wrap">
        <label className="ui-check">
          <input type="checkbox" checked={status === 'idea'} onChange={(event) => setStatus(event.target.checked ? 'idea' : 'draft')} />
          <span>{t('Save as an idea (not started yet)', 'احفظه كفكرة (لم يبدأ بعد)')}</span>
        </label>
        <div className="u-row">
          <Button variant="ghost" onClick={onDone}>
            {t('Cancel', 'إلغاء')}
          </Button>
          <Button type="submit" variant="primary">
            {t('Create', 'إنشاء')}
          </Button>
        </div>
      </div>
      <p className="u-xs u-muted">{t('Demo workspace: new items live in this browser session until the content API is added.', 'مساحة تجريبية: العناصر الجديدة تبقى في جلسة المتصفح هذه حتى تُضاف واجهة المحتوى على السيرفر.')}</p>
    </form>
  );
}
