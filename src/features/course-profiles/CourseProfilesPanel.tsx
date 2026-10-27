import { useState } from 'react';
import { GraduationCap, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { CoursePicker } from '../creative-studio/CoursePicker';
import { useCourseProfiles } from '../svg-templates/SvgTemplates';
import type { CourseProfile } from '../svg-templates/render';

interface Draft { courseId: string; courseName: string; objectives: string; outcomes: string; audience: string; notes: string }
const toLines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);
const toDraft = (profile: CourseProfile): Draft => ({ courseId: profile.courseId, courseName: profile.courseName, objectives: profile.objectives.join('\n'), outcomes: profile.outcomes.join('\n'), audience: profile.audience, notes: profile.notes });

/**
 * Each course's goals, audience and outcomes. Templates fill their `course.*` fields from here, so the Operations
 * team posts accurate claims without typing them.
 */
export function CourseProfilesPanel() {
  const { t } = useI18n();
  const { profiles, reload } = useCourseProfiles();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/course-profiles/${encodeURIComponent(draft.courseId)}`, { method: 'PUT', body: { courseName: draft.courseName, objectives: toLines(draft.objectives), outcomes: toLines(draft.outcomes), audience: draft.audience, notes: draft.notes } });
      await reload();
      setDraft(null);
    } catch (e) {
      setError(errorMessage(e, t('Could not save.', 'تعذّر الحفظ.')));
    }
    setBusy(false);
  };
  const remove = async (profile: CourseProfile) => {
    if (!window.confirm(t(`Remove the goals of ${profile.courseName}?`, `حذف أهداف ${profile.courseName}؟`))) return;
    setError('');
    try { await api(`/api/course-profiles/${encodeURIComponent(profile.courseId)}`, { method: 'DELETE' }); await reload(); }
    catch (e) { setError(errorMessage(e, t('Could not remove the course goals.', 'تعذّر حذف أهداف الدورة.'))); }
  };

  return (
    <div className="u-stack u-stack--lg">
      {error && !draft && <p role="alert" className="creative-home__error">{error}</p>}
      <section className="settings-add glass course-profiles__intro">
        <h2><GraduationCap size={17} /> {t('Course goals', 'أهداف الدورات')}</h2>
        <p className="u-sm u-muted">{t('Write each course’s goals, audience and outcomes once. Templates fill these automatically when the Operations team picks the course, so posts never carry made-up claims.', 'اكتب أهداف كل دورة والفئة المستهدفة وما يخرج به المتدرب مرة واحدة. تملأ القوالب هذه البيانات تلقائيًا عندما يختار فريق العمليات الدورة، فلا تحمل المنشورات أي ادعاءات من خيال أحد.')}</p>
        {!draft && !picking && <div><Button variant="primary" onClick={() => setPicking(true)}><Plus size={15} /> {t('Add a course', 'أضف دورة')}</Button></div>}
        {picking && (
          <div className="course-profiles__picker">
            <div className="course-profiles__bar"><b>{t('Choose the course from Odoo', 'اختر الدورة من Odoo')}</b><button type="button" className="content-drawer__close" aria-label={t('Close', 'إغلاق')} onClick={() => setPicking(false)}><X size={15} /></button></div>
            <CoursePicker autoFocus onPick={(pick) => {
              if (pick.type !== 'course') return;
              const existing = profiles.find((p) => p.courseId === pick.course.id);
              setDraft(existing ? toDraft(existing) : { courseId: pick.course.id, courseName: pick.course.name, objectives: '', outcomes: '', audience: '', notes: '' });
              setPicking(false);
            }} />
            <p className="u-xs u-muted">{t('Pick a course (not a session date).', 'اختر دورة (وليس موعد جلسة).')}</p>
          </div>
        )}
      </section>

      {draft && (
        <section className="settings-add glass course-profiles__form">
          <div className="course-profiles__bar"><h2 dir="auto">{draft.courseName}</h2><button type="button" className="content-drawer__close" aria-label={t('Close', 'إغلاق')} onClick={() => setDraft(null)}><X size={15} /></button></div>
          <label>{t('Goals — one per line', 'الأهداف — هدف في كل سطر')}<textarea dir="auto" rows={5} value={draft.objectives} onChange={(e) => setDraft({ ...draft, objectives: e.target.value })} placeholder={t('Master the basics of project scheduling', 'إتقان أساسيات جدولة المشاريع')} /></label>
          <label>{t('What the trainee leaves with — one per line', 'ما يخرج به المتدرب — في كل سطر')}<textarea dir="auto" rows={4} value={draft.outcomes} onChange={(e) => setDraft({ ...draft, outcomes: e.target.value })} placeholder={t('An accredited certificate', 'شهادة معتمدة')} /></label>
          <label>{t('Who it is for', 'الفئة المستهدفة')}<input dir="auto" value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value })} placeholder={t('Site engineers and project coordinators', 'مهندسو الموقع ومنسقو المشاريع')} /></label>
          <label>{t('Notes for the team (not shown on posts)', 'ملاحظات للفريق (لا تظهر على المنشورات)')}<input dir="auto" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
          {error && <p role="alert" className="creative-home__error">{error}</p>}
          <div className="u-row"><Button variant="primary" busy={busy} disabled={!toLines(draft.objectives).length} onClick={() => void save()}>{t('Save', 'احفظ')}</Button><Button variant="ghost" onClick={() => setDraft(null)}>{t('Cancel', 'إلغاء')}</Button></div>
        </section>
      )}

      <div className="course-profiles__list">
        {profiles.map((profile) => (
          <article key={profile.courseId} className="course-profile glass">
            <header><b dir="auto">{profile.courseName}</b>
              <span><button type="button" className="ui-link" onClick={() => setDraft(toDraft(profile))}><Pencil size={13} /> {t('Edit', 'تعديل')}</button><button type="button" className="ui-link" onClick={() => void remove(profile)}><Trash2 size={13} /></button></span>
            </header>
            {profile.audience && <p className="u-sm u-muted" dir="auto">{profile.audience}</p>}
            <ul>{profile.objectives.map((goal) => <li key={goal} dir="auto">{goal}</li>)}</ul>
          </article>
        ))}
        {profiles.length === 0 && !draft && <p className="u-sm u-muted">{t('No course goals recorded yet.', 'لا توجد أهداف مسجلة للدورات بعد.')}</p>}
      </div>
    </div>
  );
}
