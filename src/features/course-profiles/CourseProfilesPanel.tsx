import { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  Plus,
  Search,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { useCourseProfiles } from '../svg-templates/SvgTemplates';
import type { CourseProfile } from '../svg-templates/render';
export interface CourseProfileDraft {
  courseId: string;
  courseName: string;
  objectives: string;
  outcomes: string;
  audience: string;
  notes: string;
  category: string;
  description: string;
  sourceUrl: string;
  reviewStatus: 'suggested' | 'approved';
}
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
const draftOf = (p: CourseProfile): CourseProfileDraft => ({
  ...p,
  objectives: p.objectives.join('\n'),
  outcomes: p.outcomes.join('\n'),
  category: p.category ?? '',
  description: p.description ?? '',
  sourceUrl: p.sourceUrl ?? '',
  reviewStatus: p.reviewStatus ?? 'approved',
});
interface ImportStatus {
  retrievedAt: string;
  total: number;
  pageCount: number;
  catalogCount: number;
  unverified: { courseId: string; name: string; url: string }[];
}
export function CourseProfilesPanel() {
  const { t } = useI18n();
  const { profiles, reload, error: loadError } = useCourseProfiles();
  const [draft, setDraft] = useState<CourseProfileDraft | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [limit, setLimit] = useState(40);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [source, setSource] = useState<ImportStatus | null>(null);
  useEffect(() => {
    void api<ImportStatus>('/api/course-profiles/import-status')
      .then(setSource)
      .catch(() => {});
  }, []);
  const categories = useMemo(
    () =>
      [
        ...new Set(profiles.map((p) => p.category || t('Other', 'أخرى'))),
      ].sort(),
    [profiles, t],
  );
  const filtered = profiles.filter(
    (p) =>
      (category === 'all' || (p.category || t('Other', 'أخرى')) === category) &&
      (status === 'all' || (p.reviewStatus ?? 'approved') === status) &&
      `${p.courseName} ${p.category} ${p.audience}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const update = (key: keyof CourseProfileDraft, value: string) =>
    setDraft((p) => (p ? { ...p, [key]: value } : p));
  const save = async (reviewStatus: 'suggested' | 'approved') => {
    if (!draft) return;
    setBusy('save');
    setError('');
    try {
      const p = await api<CourseProfile>(
        `/api/course-profiles/${encodeURIComponent(draft.courseId)}`,
        {
          method: 'PUT',
          body: {
            ...draft,
            objectives: lines(draft.objectives),
            outcomes: lines(draft.outcomes),
            reviewStatus,
          },
        },
      );
      await reload();
      setDraft(draftOf(p));
      setNotice(
        t(
          'Course profile saved. New posts use these details.',
          'تم حفظ ملف الدورة. تستخدم المنشورات الجديدة هذه البيانات.',
        ),
      );
    } catch (e) {
      setError(errorMessage(e, ''));
    }
    setBusy('');
  };
  const sync = async () => {
    setBusy('sync');
    setError('');
    try {
      const result = await api<{
        added: number;
        total: number;
        odooStatus: string;
      }>('/api/course-profiles/sync', { body: {} });
      await reload();
      setNotice(
        t(
          `${result.added} new courses added; ${result.total} total. Existing edits were preserved.`,
          `أضيفت ${result.added} دورة؛ الإجمالي ${result.total}. تم الاحتفاظ بالتعديلات الموجودة.`,
        ),
      );
    } catch (e) {
      setError(errorMessage(e, ''));
    }
    setBusy('');
  };
  const choose = (p: CourseProfile) => {
    if (
      draft &&
      JSON.stringify(draft) !==
        JSON.stringify(
          draftOf(profiles.find((x) => x.courseId === draft.courseId) ?? p),
        ) &&
      !window.confirm(
        t('Discard unsaved changes?', 'تجاهل التعديلات غير المحفوظة؟'),
      )
    )
      return;
    setDraft(draftOf(p));
    setNotice('');
    setError('');
  };
  return (
    <div className="course-catalog">
      <header className="course-catalog__intro">
        <GraduationCap size={26} />
        <div>
          <h2>{t('Course content library', 'مكتبة محتوى الدورات')}</h2>
          <p>
            {t(
              'Explore every imported course, review its source, and edit its goals, audience and suggested copy.',
              'تصفّح الدورات المستوردة، وراجع مصادرها، وعدّل أهدافها وجمهورها والوصف المستخدم في المحتوى.',
            )}
          </p>
        </div>
        <span className="course-catalog__total">
          {profiles.length} {t('courses', 'دورة')}
        </span>
      </header>
      <p className="u-sm u-muted">
        {t(
          'Suggested profiles are editorial proposals based on course names and categories. Approve them after checking the course material.',
          'الملفات المقترحة مسودات تحريرية مبنية على أسماء الدورات وتصنيفاتها. اعتمدها بعد مراجعة محتوى الدورة.',
        )}
      </p>
      {source && (
        <details className="course-catalog__source">
          <summary>
            {t('Import coverage', 'تغطية الاستيراد')} · {source.total}{' '}
            {t('entries', 'سجل')} · {source.retrievedAt}
          </summary>
          <p>
            {t(
              `${source.pageCount} course pages read; ${source.catalogCount} titles verified from website cards; ${source.unverified.length} links need their names checked.`,
              `قُرئت ${source.pageCount} صفحة دورة، ووُثّق ${source.catalogCount} اسمًا من بطاقات الموقع. ${source.unverified.length} روابط تحتاج مراجعة أسمائها.`,
            )}
          </p>
          {source.unverified.map((c) => (
            <div key={c.courseId}>
              <button
                className="ui-link"
                type="button"
                onClick={() => {
                  const profile = profiles.find(
                    (p) => p.courseId === c.courseId,
                  );
                  if (profile) choose(profile);
                }}
              >
                {c.name}
              </button>{' '}
              ·{' '}
              <a href={c.url} target="_blank" rel="noreferrer">
                {t('Source', 'المصدر')}
              </a>
            </div>
          ))}
        </details>
      )}
      <div className="course-catalog__toolbar">
        <label className="board-search">
          <Search size={15} />
          <input
            aria-label={t('Search course library', 'ابحث في مكتبة الدورات')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(40);
            }}
            placeholder={t('Course, audience, category…', 'دورة، جمهور، تخصص…')}
          />
        </label>
        <select
          aria-label={t('Review status', 'حالة المراجعة')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">{t('All statuses', 'كل الحالات')}</option>
          <option value="suggested">{t('Needs review', 'تحتاج مراجعة')}</option>
          <option value="approved">
            {t('Approved profiles', 'ملفات معتمدة')}
          </option>
        </select>
        <Button
          variant="secondary"
          busy={busy === 'sync'}
          disabled={!!busy}
          onClick={() => void sync()}
        >
          <RefreshCw size={14} />
          {t('Sync catalog', 'مزامنة الكتالوج')}
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            setDraft({
              courseId: `manual:${crypto.randomUUID()}`,
              courseName: '',
              objectives: '',
              outcomes: '',
              audience: '',
              notes: '',
              category: '',
              description: '',
              sourceUrl: '',
              reviewStatus: 'suggested',
            })
          }
        >
          <Plus size={14} />
          {t('Add course', 'أضف دورة')}
        </Button>
      </div>
      <div
        className="course-catalog__categories"
        role="group"
        aria-label={t('Course categories', 'تخصصات الدورات')}
      >
        <button
          type="button"
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
        >
          {t('All', 'الكل')} · {profiles.length}
        </button>
        {categories.map((c) => (
          <button
            type="button"
            key={c}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c} ·{' '}
            {
              profiles.filter((p) => (p.category || t('Other', 'أخرى')) === c)
                .length
            }
          </button>
        ))}
      </div>
      {(error || loadError) && (
        <p role="alert" className="creative-home__error">
          {error || loadError}
        </p>
      )}
      {notice && (
        <p role="status" className="settings-notice">
          {notice}
        </p>
      )}
      <div className="course-catalog__layout">
        <section
          className="course-catalog__list"
          aria-label={t('Courses', 'الدورات')}
        >
          <p className="u-xs u-muted">
            {filtered.length} {t('results', 'نتيجة')}
          </p>
          {filtered.slice(0, limit).map((p) => (
            <button
              key={p.courseId}
              type="button"
              className="course-catalog__item"
              aria-pressed={draft?.courseId === p.courseId}
              onClick={() => choose(p)}
            >
              <span>
                <b dir="auto">{p.courseName}</b>
                <small>{p.category}</small>
              </span>
              <i data-approved={p.reviewStatus !== 'suggested'}>
                {p.reviewStatus === 'suggested'
                  ? t('Review', 'للمراجعة')
                  : t('Approved', 'معتمد')}
              </i>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="u-muted">
              {t(
                'No courses match these filters.',
                'لا توجد دورات تطابق الفلاتر.',
              )}
            </p>
          )}
          {filtered.length > limit && (
            <Button variant="secondary" onClick={() => setLimit(limit + 40)}>
              {t('Show more', 'اعرض المزيد')}
            </Button>
          )}
        </section>
        {draft ? (
          <CourseProfileEditor
            draft={draft}
            update={update}
            save={(status) => void save(status)}
            busy={busy}
          />
        ) : (
          <div className="course-catalog__empty glass">
            <GraduationCap size={32} />
            <h3>
              {t(
                'Select a course to edit its profile',
                'اختر دورة لتعديل ملفها',
              )}
            </h3>
            <p>
              {t(
                'Goals and audience feed the reference-based creation flow.',
                'تُستخدم الأهداف والجمهور في إنشاء المحتوى من المرجع المعتمد.',
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The same editable fields serve imported, suggested and manually authored profiles. */
export function CourseProfileEditor({
  draft,
  update,
  save,
  busy,
}: {
  draft: CourseProfileDraft;
  update: (key: keyof CourseProfileDraft, value: string) => void;
  save: (status: 'suggested' | 'approved') => void;
  busy: string;
}) {
  const { t } = useI18n();
  return (
    <section className="course-catalog__editor glass">
      <header>
        <div>
          <span className="u-xs u-muted">
            {draft.category || t('Course profile', 'ملف دورة')}
          </span>
          <h3 dir="auto">
            {draft.courseName || t('New course', 'دورة جديدة')}
          </h3>
        </div>
        <span
          className="content-status"
          data-status={draft.reviewStatus === 'approved' ? 'approved' : 'draft'}
        >
          {draft.reviewStatus === 'approved'
            ? t('Approved', 'معتمد')
            : t('Suggested draft', 'مسودة مقترحة')}
        </span>
      </header>
      {draft.sourceUrl && (
        <a
          href={draft.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="ui-link"
        >
          <ExternalLink size={13} />
          {t('Open source page', 'افتح صفحة المصدر')}
        </a>
      )}
      <label>
        {t('Course name', 'اسم الدورة')}
        <input
          value={draft.courseName}
          dir="auto"
          onChange={(e) => update('courseName', e.target.value)}
          maxLength={300}
        />
      </label>
      <label>
        {t('Category', 'التخصص')}
        <input
          value={draft.category}
          onChange={(e) => update('category', e.target.value)}
          maxLength={150}
        />
      </label>
      <label>
        {t('Overview', 'نبذة الدورة')}
        <textarea
          value={draft.description}
          onChange={(e) => update('description', e.target.value)}
          rows={3}
          maxLength={2000}
          dir="auto"
        />
      </label>
      <label>
        {t('Target audience', 'الجمهور المستهدف')}
        <textarea
          value={draft.audience}
          onChange={(e) => update('audience', e.target.value)}
          rows={2}
          maxLength={600}
          dir="auto"
        />
      </label>
      <label>
        {t('Learning goals — one per line', 'الأهداف — هدف في كل سطر')}
        <textarea
          value={draft.objectives}
          onChange={(e) => update('objectives', e.target.value)}
          rows={5}
          dir="auto"
        />
      </label>
      <label>
        {t('Outcomes — one per line', 'المخرجات — مخرج في كل سطر')}
        <textarea
          value={draft.outcomes}
          onChange={(e) => update('outcomes', e.target.value)}
          rows={3}
          dir="auto"
        />
      </label>
      <label>
        {t('Internal notes', 'ملاحظات داخلية')}
        <textarea
          value={draft.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={2}
          maxLength={2000}
          dir="auto"
        />
      </label>
      <label>
        {t('Source URL', 'رابط المصدر')}
        <input
          value={draft.sourceUrl}
          onChange={(e) => update('sourceUrl', e.target.value)}
          type="url"
          dir="ltr"
        />
      </label>
      <div className="course-catalog__actions">
        <Button
          variant="primary"
          disabled={
            !!busy ||
            draft.courseName.trim().length < 2 ||
            !lines(draft.objectives).length
          }
          busy={busy === 'save'}
          onClick={() => void save('approved')}
        >
          <CheckCircle2 size={14} />
          {t('Approve & save', 'اعتمد واحفظ')}
        </Button>
        <Button
          variant="secondary"
          disabled={!!busy || draft.courseName.trim().length < 2}
          onClick={() => void save('suggested')}
        >
          {t('Save draft', 'احفظ مسودة')}
        </Button>
      </div>
    </section>
  );
}
