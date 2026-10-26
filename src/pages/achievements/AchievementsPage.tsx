import { useState } from 'react';
import { ExternalLink, Plus, Trophy } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { EmptyState, ProgressBar, progressTone } from '../../components/feedback/States';
import { Checkbox, Field, Input, Select } from '../../components/forms/Field';
import { Dialog } from '../../components/overlay/Overlay';
import { Avatar, Person } from '../../components/ui/Avatar';
import { Badge, DemoBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import type { StudentAchievement } from '../../domain/planning';
import { useCreateContent } from '../../features/content/CreateContent';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useAct } from '../../features/workspace/hooks';
import { useI18n } from '../../i18n/I18nProvider';
import { rewardLabel } from '../../i18n/labels';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type Tab = 'hall' | 'workflow' | 'exams' | 'team';
type Step = keyof StudentAchievement['steps'];

const STEPS: { key: Step; en: string; ar: string }[] = [
  { key: 'certificateUploaded', en: 'Certificate uploaded', ar: 'رفع الشهادة' },
  { key: 'congratulated', en: 'Student congratulated', ar: 'تهنئة الطالب' },
  { key: 'linkedinPosted', en: 'Student posted on LinkedIn', ar: 'نشر الطالب على LinkedIn' },
  { key: 'engosoftMentioned', en: 'Engosoft mentioned', ar: 'الإشارة إلى Engosoft' },
  { key: 'reviewCollected', en: 'Review collected', ar: 'جمع تقييم العميل' },
  { key: 'employeeCommented', en: 'Employee commented', ar: 'تعليق الموظف' },
  { key: 'reposted', en: 'Reposted by Engosoft', ar: 'إعادة نشر من Engosoft' },
  { key: 'rewardIssued', en: 'Reward issued', ar: 'تسليم المكافأة' },
];

export function AchievementsPage() {
  const { t } = useI18n();
  const { state } = useWorkspace();
  const [query, setQuery] = useQueryState();
  const [adding, setAdding] = useState(false);
  usePageMeta(t('Hall of Fame', 'لوحة الشرف'), [{ label: t('Hall of Fame', 'لوحة الشرف') }]);
  const focus = query.get('student');
  const requested = query.get('tab') as Tab | null;
  const tab: Tab = requested && ['hall', 'workflow', 'exams', 'team'].includes(requested) ? requested : focus ? 'workflow' : 'hall';
  const open = state.achievements.filter((entry) => !entry.historical && Object.values(entry.steps).some((done) => !done));

  return (
    <div className="u-stack">
      <PageHeader
        title={t('Hall of Fame', 'لوحة الشرف')}
        description={t('Certified students and international exam achievers, and the follow-up that turns each one into a story.', 'الطلاب الحاصلون على الشهادات والامتحانات الدولية، والمتابعة التي تحول كل إنجاز إلى قصة نجاح.')}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
            {t('Add student', 'إضافة طالب')}
          </Button>
        }
      />
      <Tabs
        label={t('Sections', 'الأقسام')}
        value={tab}
        onChange={(value) => setQuery({ tab: value === 'hall' ? null : value, student: null })}
        items={[
          { value: 'hall', label: t('Hall of Fame', 'لوحة الشرف'), count: state.achievements.filter((entry) => entry.hallOfFame).length },
          { value: 'workflow', label: t('Certificate follow-up', 'متابعة الشهادات'), count: open.length },
          { value: 'exams', label: t('International exams', 'الامتحانات الدولية') },
          { value: 'team', label: t('By employee', 'حسب الموظف') },
        ]}
      />
      {tab === 'hall' && <Hall />}
      {tab === 'workflow' && <Workflow focus={focus} />}
      {tab === 'exams' && <Exams />}
      {tab === 'team' && <Team />}
      <AddStudentDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function Hall() {
  const { t, date } = useI18n();
  const { state, setHallOfFame } = useWorkspace();
  const act = useAct();
  const list = state.achievements.filter((entry) => entry.hallOfFame).sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
  if (!list.length) return <EmptyState icon={<Trophy size={20} />} title={t('The Hall of Fame is empty.', 'لوحة الشرف فارغة.')} text={t('Add achievers from the follow-up tab.', 'أضف المتميزين من تبويب المتابعة.')} />;
  return (
    <ul className="hof-grid">
      {list.map((entry) => (
        <li key={entry.id} className="hof-card">
          <span className="hof-card__photo" data-photo={entry.photo || undefined}>
            <Avatar name={entry.studentName} size={56} />
          </span>
          <b className="hof-card__name">{entry.studentName}</b>
          <span className="hof-card__cert">{entry.certification}</span>
          <span className="u-xs u-muted">{entry.courseTitle}</span>
          <span className="u-xs u-muted u-tnum">{date(entry.achievedAt, 'date')}</span>
          <span className="u-row u-row--wrap hof-card__tags">
            {entry.historical && <Badge>{t('Historical', 'سجل سابق')}</Badge>}
            {!entry.photo && <Badge tone="neutral">{t('No photo', 'بدون صورة')}</Badge>}
            {entry.linkedinUrl && (
              <a className="ui-link u-xs" href={entry.linkedinUrl} target="_blank" rel="noreferrer">
                LinkedIn <ExternalLink size={11} />
              </a>
            )}
          </span>
          <button type="button" className="ui-link u-xs" onClick={() => act(setHallOfFame(entry.id, false), t('Removed from the Hall of Fame', 'أزيل من لوحة الشرف'))}>
            {t('Remove', 'إزالة')}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Workflow({ focus }: { focus: string | null }) {
  const { t, tx, num, date } = useI18n();
  const { state, setAchievementStep, setHallOfFame } = useWorkspace();
  const create = useCreateContent();
  const act = useAct();
  const list = state.achievements.filter((entry) => !entry.historical).sort((a, b) => Number(b.id === focus) - Number(a.id === focus) || b.achievedAt.localeCompare(a.achievedAt));
  return (
    <div className="u-stack">
      <p className="u-sm u-muted">{t('Certificate → customer LinkedIn post mentioning Engosoft → review → employee comment → repost → reward (50% coupon or free international exam booking support).', 'الشهادة ← منشور العميل على LinkedIn مع الإشارة إلى Engosoft ← التقييم ← تعليق الموظف ← إعادة النشر ← المكافأة (كوبون 50% أو دعم مجاني لحجز الامتحان الدولي).')}</p>
      {list.map((entry) => {
        const done = STEPS.filter((step) => entry.steps[step.key]).length;
        const post = state.content.find((item) => item.achievementId === entry.id);
        return (
          <Card key={entry.id} className={entry.id === focus ? 'is-focused' : undefined}>
            <CardHeader
              title={
                <span className="u-row">
                  <Avatar name={entry.studentName} size={26} /> {entry.studentName}
                </span>
              }
              description={`${entry.certification} · ${entry.courseTitle} · ${date(entry.achievedAt, 'date')}`}
              actions={
                <span className="u-row u-row--wrap">
                  <span className="u-xs u-muted u-tnum">{t(`${num(done)}/${num(STEPS.length)} steps`, `${num(done)}/${num(STEPS.length)} خطوات`)}</span>
                  {post ? (
                    <Link className="ui-link u-sm" to={`/content/${post.id}`}>
                      {t('Content item', 'عنصر المحتوى')}
                    </Link>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => create.open({ templateId: entry.kind === 'international_exam' ? 't-intl-exam' : 't-certificate', title: `${entry.kind === 'international_exam' ? 'International exam success' : 'Certificate'} — ${entry.studentName} (${entry.certification})`, departmentId: 'operations' })}>
                      {t('Create post', 'أنشئ منشور')}
                    </Button>
                  )}
                  <Button size="sm" variant={entry.hallOfFame ? 'ghost' : 'secondary'} onClick={() => act(setHallOfFame(entry.id, !entry.hallOfFame), entry.hallOfFame ? t('Removed from the Hall of Fame', 'أزيل من لوحة الشرف') : t('Added to the Hall of Fame', 'أُضيف إلى لوحة الشرف'))}>
                    {entry.hallOfFame ? t('In Hall of Fame', 'في لوحة الشرف') : t('Add to Hall of Fame', 'أضف للوحة الشرف')}
                  </Button>
                </span>
              }
            />
            <CardBody>
              <ProgressBar value={(done / STEPS.length) * 100} tone={progressTone((done / STEPS.length) * 100)} label={entry.studentName} />
              <div className="steps-grid">
                {STEPS.map((step) => (
                  <Checkbox key={step.key} checked={entry.steps[step.key]} onChange={(value) => act(setAchievementStep(entry.id, step.key, value))} label={t(step.en, step.ar)} />
                ))}
              </div>
              <p className="u-xs u-muted">
                {t('Reward', 'المكافأة')}: {entry.reward ? tx(rewardLabel[entry.reward]) : t('Not chosen yet', 'لم تُحدد بعد')} · {t('Responsible', 'المسؤول')}: <Person users={state.users} id={entry.responsibleId} size={18} />
                {!entry.photo && ` · ${t('Photo missing', 'الصورة ناقصة')}`}
              </p>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

function Exams() {
  const { t, date } = useI18n();
  const { state } = useWorkspace();
  const exams = state.achievements.filter((entry) => entry.kind === 'international_exam');
  const support: [keyof NonNullable<StudentAchievement['preExam']>, string, string][] = [
    ['technicalSupport', 'Technical support', 'دعم فني'],
    ['lecturerSupport', 'Lecturer support', 'دعم المحاضر'],
    ['bookingSupport', 'Booking support', 'دعم الحجز'],
    ['mockExams', 'Mock exams', 'امتحانات تجريبية'],
  ];
  return (
    <Card>
      <CardHeader title={t('International exams', 'الامتحانات الدولية')} description={t('Support before the exam; follow-up after a pass.', 'الدعم قبل الامتحان؛ والمتابعة بعد النجاح.')} />
      <div className="ui-table-scroll">
        <table className="ui-table">
          <caption className="sr-only">{t('International exams', 'الامتحانات الدولية')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('Student', 'الطالب')}</th>
              <th scope="col">{t('Exam', 'الامتحان')}</th>
              <th scope="col">{t('Date', 'التاريخ')}</th>
              <th scope="col">{t('Support before the exam', 'الدعم قبل الامتحان')}</th>
              <th scope="col">{t('After', 'بعد الامتحان')}</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((entry) => {
              const upcoming = entry.achievedAt > (new Date().toISOString().slice(0, 10));
              return (
                <tr key={entry.id}>
                  <td>{entry.studentName}</td>
                  <td>{entry.certification}</td>
                  <td className="u-tnum">{date(entry.achievedAt, 'date')}</td>
                  <td>
                    <span className="u-row u-row--wrap">
                      {support.map(([key, en, ar]) => (
                        <Badge key={key} tone={entry.preExam?.[key] ? 'success' : 'neutral'}>
                          {entry.preExam?.[key] ? '✓' : '—'} {t(en, ar)}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td>{upcoming ? <Badge tone="info">{t('Exam upcoming', 'امتحان قادم')}</Badge> : entry.steps.congratulated ? <Badge tone="success">{t('Congratulated', 'تمت التهنئة')}</Badge> : <Badge tone="warning">{t('Congratulate', 'مطلوب تهنئة')}</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Team() {
  const { t, num } = useI18n();
  const { state } = useWorkspace();
  const people = [...new Set(state.achievements.map((entry) => entry.responsibleId))];
  return (
    <Card>
      <CardHeader title={t('Completed student posts per employee', 'منشورات الطلاب المكتملة لكل موظف')} description={t('A student post counts when the student posted on LinkedIn and Engosoft reposted it.', 'يُحسب المنشور عندما ينشر الطالب على LinkedIn ويعيد Engosoft نشره.')} icon={<DemoBadge />} />
      <ul className="workload">
        {people.map((id) => {
          const mine = state.achievements.filter((entry) => entry.responsibleId === id);
          const completed = mine.filter((entry) => entry.steps.linkedinPosted && entry.steps.reposted).length;
          return (
            <li key={id} className="workload__row">
              <Person users={state.users} id={id} size={26} />
              <span className="u-grow" />
              <span className="workload__nums u-tnum">
                <span>{t(`${num(completed)} completed`, `${num(completed)} مكتمل`)}</span>
                <span>{t(`${num(mine.length)} students`, `${num(mine.length)} طالب`)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AddStudentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={t('Add student', 'إضافة طالب')} description={t('Old students without photos or full details can be added as historical records.', 'يمكن إضافة الطلاب القدامى دون صور أو تفاصيل كاملة كسجلات سابقة.')}>
      {open && <AddStudentForm onDone={onClose} />}
    </Dialog>
  );
}

function AddStudentForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const { addAchievement } = useWorkspace();
  const act = useAct();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<StudentAchievement['kind']>('certificate');
  const [certification, setCertification] = useState('CFM');
  const [course, setCourse] = useState('');
  const [day, setDay] = useState('');
  const [historical, setHistorical] = useState(false);
  return (
    <form
      className="u-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (act(addAchievement({ studentName: name, kind, certification, courseTitle: course, achievedAt: day, historical }), t('Student added', 'تمت إضافة الطالب'))) onDone();
      }}
    >
      <Field label={t('Student name', 'اسم الطالب')} required>
        {(id) => <Input id={id} data-autofocus value={name} onChange={(event) => setName(event.target.value)} dir="auto" required />}
      </Field>
      <div className="u-grid u-grid--2">
        <Field label={t('Achievement', 'الإنجاز')}>
          {(id) => (
            <Select id={id} value={kind} onChange={(event) => setKind(event.target.value as StudentAchievement['kind'])}>
              <option value="certificate">{t('Certificate', 'شهادة')}</option>
              <option value="international_exam">{t('International exam', 'امتحان دولي')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('Certification', 'الشهادة')} required>
          {(id) => <Input id={id} value={certification} onChange={(event) => setCertification(event.target.value)} required />}
        </Field>
        <Field label={t('Course', 'الدورة')}>{(id) => <Input id={id} value={course} onChange={(event) => setCourse(event.target.value)} />}</Field>
        <Field label={t('Date', 'التاريخ')} required>
          {(id) => <Input id={id} type="date" value={day} onChange={(event) => setDay(event.target.value)} required />}
        </Field>
      </div>
      <Checkbox checked={historical} onChange={setHistorical} label={t('Historical record (before the platform; goes straight to the Hall of Fame)', 'سجل سابق (قبل المنصة؛ يُضاف مباشرة للوحة الشرف)')} />
      <div className="u-row u-row--between">
        <span />
        <div className="u-row">
          <Button variant="ghost" onClick={onDone}>
            {t('Cancel', 'إلغاء')}
          </Button>
          <Button type="submit" variant="primary">
            {t('Add', 'إضافة')}
          </Button>
        </div>
      </div>
    </form>
  );
}
