import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, GraduationCap, ListChecks, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { courseCopy } from '../../domain/course-copy';
import { normalizeSearch, rankRecords } from '../creative-studio/course-search';
import { useAuth } from '../auth/AuthProvider';
import { useCourseProfiles } from '../svg-templates/SvgTemplates';
import type { CourseProfile } from '../svg-templates/render';

/**
 * The course content library: marketing reviews the imported courses one by one (goals, audience, outcomes),
 * everyone who creates posts can read them. Approved profiles fill the course fields on the Create page.
 */
export interface CourseProfileDraft {
  courseId: string;
  courseName: string;
  /** One goal per line; empty lines are rows being typed and are dropped on save. */
  objectives: string;
  outcomes: string;
  audience: string;
  notes: string;
  category: string;
  description: string;
  sourceUrl: string;
  reviewStatus: 'suggested' | 'approved';
}

/** Server limits (server/course-profiles.ts), checked here so each problem shows beside its field. */
export const LIMITS = { name: 300, category: 150, description: 2000, audience: 600, notes: 2000, items: 12, itemChars: 300 } as const;

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const draftOf = (p: CourseProfile): CourseProfileDraft => ({
  courseId: p.courseId,
  courseName: p.courseName,
  objectives: p.objectives.join('\n'),
  outcomes: p.outcomes.join('\n'),
  audience: p.audience,
  notes: p.notes,
  category: p.category ?? '',
  description: p.description ?? '',
  sourceUrl: p.sourceUrl ?? '',
  reviewStatus: p.reviewStatus ?? 'approved',
});
const emptyDraft = (): CourseProfileDraft => ({ courseId: `manual:${crypto.randomUUID()}`, courseName: '', objectives: '', outcomes: '', audience: '', notes: '', category: '', description: '', sourceUrl: '', reviewStatus: 'suggested' });
/** Comparable form of a draft: blank goal rows and surrounding spaces do not count as changes. */
const comparable = (d: CourseProfileDraft) => JSON.stringify({ ...d, objectives: lines(d.objectives), outcomes: lines(d.outcomes), courseName: d.courseName.trim(), audience: d.audience.trim(), description: d.description.trim(), notes: d.notes.trim(), category: d.category.trim(), sourceUrl: d.sourceUrl.trim() });

export type MissingKey = 'description' | 'audience' | 'objectives' | 'outcomes';
/** What a profile still lacks before it can feed a complete post. */
export function missingFields(p: { description?: string; audience: string; objectives: string[]; outcomes: string[] }): MissingKey[] {
  const missing: MissingKey[] = [];
  if (!p.description?.trim()) missing.push('description');
  if (!p.audience.trim()) missing.push('audience');
  if (!p.objectives.length) missing.push('objectives');
  if (!p.outcomes.length) missing.push('outcomes');
  return missing;
}

type T = (en: string, ar: string) => string;
const MISSING_LABEL: Record<MissingKey, [string, string]> = { description: ['overview', 'النبذة'], audience: ['audience', 'الجمهور'], objectives: ['goals', 'الأهداف'], outcomes: ['outcomes', 'المخرجات'] };

/** Field problems by the same rules the server enforces. */
export function draftProblems(d: CourseProfileDraft, t: T): Partial<Record<keyof CourseProfileDraft, string>> {
  const out: Partial<Record<keyof CourseProfileDraft, string>> = {};
  const name = d.courseName.trim();
  if (name.length < 2) out.courseName = t('Write the course name (2+ characters).', 'اكتب اسم الدورة (حرفان على الأقل).');
  else if (name.length > LIMITS.name) out.courseName = t(`At most ${LIMITS.name} characters.`, `بحد أقصى ${LIMITS.name} حرف.`);
  if (d.category.trim().length > LIMITS.category) out.category = t(`At most ${LIMITS.category} characters.`, `بحد أقصى ${LIMITS.category} حرف.`);
  if (d.description.trim().length > LIMITS.description) out.description = t(`At most ${LIMITS.description} characters.`, `بحد أقصى ${LIMITS.description} حرف.`);
  if (d.audience.trim().length > LIMITS.audience) out.audience = t(`At most ${LIMITS.audience} characters.`, `بحد أقصى ${LIMITS.audience} حرف.`);
  if (d.notes.trim().length > LIMITS.notes) out.notes = t(`At most ${LIMITS.notes} characters.`, `بحد أقصى ${LIMITS.notes} حرف.`);
  for (const key of ['objectives', 'outcomes'] as const) {
    const rows = lines(d[key]);
    if (rows.length > LIMITS.items) out[key] = t(`Up to ${LIMITS.items} items.`, `حتى ${LIMITS.items} بندًا.`);
    else if (rows.some((row) => row.length > LIMITS.itemChars)) out[key] = t(`Each item up to ${LIMITS.itemChars} characters.`, `كل بند حتى ${LIMITS.itemChars} حرف.`);
  }
  const url = d.sourceUrl.trim();
  if (url) {
    let ok = false;
    try { ok = new URL(url).protocol === 'https:'; } catch { /* not a URL */ }
    if (!ok) out.sourceUrl = t('Use a full link that starts with https://', 'استخدم رابطًا كاملًا يبدأ بـ https://');
  }
  return out;
}
/** Why the profile cannot be approved yet, or null. */
export const approveBlocker = (d: CourseProfileDraft, t: T) =>
  Object.keys(draftProblems(d, t)).length ? t('Fix the highlighted fields first.', 'صحّح الحقول المحددة أولًا.') : !lines(d.objectives).length ? t('Add at least one learning goal to approve.', 'أضف هدفًا واحدًا على الأقل لاعتماد الدورة.') : null;

interface ImportStatus { retrievedAt: string; total: number; pageCount: number; catalogCount: number; unverified: { courseId: string; name: string; url: string }[] }
type StatusFilter = 'all' | 'suggested' | 'approved' | 'incomplete';
type Sort = 'name' | 'updated' | 'missing';
/** The draft being edited survives a reload, a closed tab or an expired session. */
interface StoredDraft { draft: CourseProfileDraft; base: string; at: number }
const storeKey = (userId: string) => `course-profile-draft:${userId}`;
function readStored(userId: string): StoredDraft | null {
  try { const value = JSON.parse(localStorage.getItem(storeKey(userId)) || 'null') as StoredDraft | null; return value?.draft?.courseId ? value : null; } catch { return null; }
}
const writeStored = (userId: string, value: StoredDraft | null) => { try { if (value) localStorage.setItem(storeKey(userId), JSON.stringify(value)); else localStorage.removeItem(storeKey(userId)); } catch { /* storage blocked: the draft is a convenience */ } };

export function CourseProfilesPanel() {
  const { t } = useI18n();
  const { can, user } = useAuth();
  const editor = can('templates.manage');
  const { profiles, reload, error: loadError } = useCourseProfiles();
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<CourseProfileDraft | null>(null);
  /** The saved state of the open course; "unsaved" means the draft differs from it. */
  const [base, setBase] = useState<CourseProfileDraft | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  // Reviewers start on their queue; readers see everything (suggested profiles are labelled as such).
  const [status, setStatus] = useState<StatusFilter>(editor ? 'suggested' : 'all');
  const [sort, setSort] = useState<Sort>('name');
  const [limit, setLimit] = useState(60);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [restored, setRestored] = useState(false);
  const [source, setSource] = useState<ImportStatus | null>(null);
  const editorRef = useRef<HTMLElement>(null);

  useEffect(() => { if (profiles.length || loadError) setLoaded(true); }, [profiles, loadError]);
  useEffect(() => { if (editor) void api<ImportStatus>('/api/course-profiles/import-status').then(setSource).catch(() => {}); }, [editor]);

  const dirty = Boolean(draft && base && comparable(draft) !== comparable(base));
  // Bring back a draft left unsaved last time, once the profiles are in.
  useEffect(() => {
    if (!editor || !loaded || draft) return;
    const stored = readStored(user.id);
    if (!stored) return;
    const saved = profiles.find((p) => p.courseId === stored.draft.courseId);
    if (saved && saved.updatedAt !== stored.base) { writeStored(user.id, null); return; }
    setBase(saved ? draftOf(saved) : { ...stored.draft, courseName: '', objectives: '', outcomes: '', audience: '', notes: '', category: '', description: '', sourceUrl: '' });
    setDraft(stored.draft);
    setRestored(true);
  }, [editor, loaded, profiles, user.id]);
  useEffect(() => {
    if (!editor || !draft) return;
    const timer = setTimeout(() => writeStored(user.id, dirty ? { draft, base: profiles.find((p) => p.courseId === draft.courseId)?.updatedAt ?? 'new', at: Date.now() } : null), 500);
    return () => clearTimeout(timer);
  }, [draft, dirty, editor, profiles, user.id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const other = t('Other', 'أخرى');
  const categoryOf = useCallback((p: CourseProfile) => p.category?.trim() || other, [other]);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of profiles) counts.set(categoryOf(p), (counts.get(categoryOf(p)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));
  }, [profiles, categoryOf]);
  const stats = useMemo(() => ({
    total: profiles.length,
    approved: profiles.filter((p) => p.reviewStatus !== 'suggested').length,
    suggested: profiles.filter((p) => p.reviewStatus === 'suggested').length,
    incomplete: profiles.filter((p) => missingFields(p).length > 0).length,
  }), [profiles]);

  const filtered = useMemo(() => {
    const inScope = profiles.filter((p) =>
      (category === 'all' || categoryOf(p) === category)
      && (status === 'all' || (status === 'incomplete' ? missingFields(p).length > 0 : (p.reviewStatus ?? 'approved') === status)));
    const q = query.trim();
    if (q) {
      // Arabic and English names of a course meet, spelling variants and small typos are forgiven.
      const needle = normalizeSearch(q);
      const records = inScope.map((p) => ({ profile: p, name: p.courseName, category: p.category, description: `${p.description ?? ''} ${p.audience}` }));
      const ranked = rankRecords(q, records, records.length);
      const seen = new Set(ranked.map((r) => r.profile.courseId));
      const plain = records.filter((r) => !seen.has(r.profile.courseId) && normalizeSearch(`${r.name} ${r.category ?? ''} ${r.description}`).includes(needle));
      return [...ranked, ...plain].map((r) => r.profile);
    }
    const sorted = [...inScope];
    if (sort === 'updated') sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    else if (sort === 'missing') sorted.sort((a, b) => missingFields(b).length - missingFields(a).length || a.courseName.localeCompare(b.courseName, 'ar'));
    else sorted.sort((a, b) => a.courseName.localeCompare(b.courseName, 'ar'));
    return sorted;
  }, [profiles, category, status, query, sort, categoryOf]);

  // On wide screens the first course opens by itself, so the page never sits on an empty panel.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !loaded || draft || !filtered.length || readStored(user.id)) return;
    autoOpened.current = true;
    if (window.matchMedia('(min-width: 1181px)').matches) { const first = filtered[0]; setDraft(draftOf(first)); setBase(draftOf(first)); }
  }, [loaded, draft, filtered, user.id]);

  const position = draft ? filtered.findIndex((p) => p.courseId === draft.courseId) : -1;
  const confirmLeave = () => !dirty || window.confirm(t('You have unsaved changes on this course. Discard them?', 'لديك تعديلات غير محفوظة على هذه الدورة. هل تتجاهلها؟'));
  const open = (p: CourseProfile | null, force = false) => {
    if (!force && !confirmLeave()) return false;
    const next = p ? draftOf(p) : emptyDraft();
    setDraft(next); setBase(p ? next : { ...next }); setNotice(''); setError(''); setRestored(false);
    writeStored(user.id, null);
    // On phones the editor replaces the list: start at its top.
    if (window.matchMedia('(max-width: 1180px)').matches) setTimeout(() => editorRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
    return true;
  };
  const step = (dir: 1 | -1) => { const next = filtered[position + dir]; if (next) open(next); };
  const close = () => { if (confirmLeave()) { setDraft(null); setBase(null); writeStored(user.id, null); } };
  const update = (key: keyof CourseProfileDraft, value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async (reviewStatus: 'suggested' | 'approved', then?: 'next') => {
    if (!draft) return;
    const problems = draftProblems(draft, t);
    if (Object.keys(problems).length) { setError(t('Fix the highlighted fields first.', 'صحّح الحقول المحددة أولًا.')); return; }
    // The next course to review, chosen before saving: an approved course may leave the "needs review" filter.
    const following = then === 'next' ? filtered.slice(position + 1).find((p) => p.reviewStatus === 'suggested') ?? filtered.find((p) => p.reviewStatus === 'suggested' && p.courseId !== draft.courseId) : undefined;
    setBusy(reviewStatus === 'approved' ? (then ? 'next' : 'approve') : 'save');
    setError('');
    try {
      const saved = await api<CourseProfile>(`/api/course-profiles/${encodeURIComponent(draft.courseId)}`, {
        method: 'PUT',
        body: { ...draft, courseName: draft.courseName.trim(), objectives: lines(draft.objectives), outcomes: lines(draft.outcomes), sourceUrl: draft.sourceUrl.trim(), reviewStatus },
      });
      writeStored(user.id, null);
      await reload().catch(() => {});
      const message = reviewStatus === 'approved' ? t(`“${saved.courseName}” approved. New posts use these details.`, `تم اعتماد «${saved.courseName}». المنشورات الجديدة ستستخدم هذه البيانات.`) : t('Saved as a draft for review.', 'تم الحفظ كمسودة للمراجعة.');
      if (following) { open(following, true); setNotice(message); }
      else { const next = draftOf(saved); setDraft(next); setBase(next); setNotice(then === 'next' ? `${message} ${t('No more courses waiting for review here.', 'لا توجد دورات أخرى بانتظار المراجعة هنا.')}` : message); }
    } catch (e) { setError(errorMessage(e, t('Could not save the course.', 'تعذّر حفظ الدورة.'))); }
    setBusy('');
  };
  const remove = async () => {
    if (!draft || !window.confirm(t(`Delete “${draft.courseName || 'this course'}”? Posts already made keep their copy.`, `حذف «${draft.courseName || 'هذه الدورة'}»؟ المنشورات السابقة تحتفظ بنصوصها.`))) return;
    setBusy('delete'); setError('');
    try {
      await api(`/api/course-profiles/${encodeURIComponent(draft.courseId)}`, { method: 'DELETE' });
      writeStored(user.id, null); setDraft(null); setBase(null);
      await reload().catch(() => {});
      setNotice(t('Course deleted.', 'تم حذف الدورة.'));
    } catch (e) { setError(errorMessage(e, '')); }
    setBusy('');
  };
  const sync = async () => {
    setBusy('sync'); setError('');
    try {
      const result = await api<{ added: number; total: number; odooStatus: string }>('/api/course-profiles/sync', { body: {} });
      await reload().catch(() => {});
      setNotice(t(`${result.added} new courses added; ${result.total} in total. Existing edits were kept.`, `أُضيفت ${result.added} دورة جديدة؛ الإجمالي ${result.total}. التعديلات الحالية لم تتغير.`));
    } catch (e) { setError(errorMessage(e, '')); }
    setBusy('');
  };
  // ⌘S / Ctrl+S saves the open course without changing its review status.
  useEffect(() => {
    if (!editor || !draft) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!busy) void save(draft.reviewStatus); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pct = stats.total ? Math.round((stats.approved / stats.total) * 100) : 0;
  return (
    <div className="course-lib" data-editing={draft ? 'true' : undefined}>
      <section className="course-lib__overview glass" aria-label={t('Review progress', 'تقدّم المراجعة')}>
        <div className="course-lib__progress">
          <div className="course-lib__progress-text">
            <b className="u-tnum">{stats.approved}</b>
            <span>{t(`of ${stats.total} course profiles approved`, `من ${stats.total} ملف دورة معتمد`)}</span>
            <em className="u-tnum">{pct}%</em>
          </div>
          <div className="course-lib__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('Approved', 'معتمد')}><span style={{ width: `${Math.max(pct, stats.approved ? 2 : 0)}%` }} /></div>
          <small>{editor
            ? t('Profiles were drafted from course names. Check each against its course page, then approve.', 'الملفات اتكتبت تلقائيًا من أسماء الدورات. راجع كل ملف مع صفحة الدورة واعتمده.')
            : t('Approved course details fill the course fields when you create a post.', 'بيانات الدورات المعتمدة تملأ حقول الدورة تلقائيًا عند إنشاء منشور.')}</small>
        </div>
        {editor && <div className="course-lib__overview-actions">
          {stats.suggested > 0 && <Button variant="primary" icon={<ListChecks size={15} />} onClick={() => { setStatus('suggested'); setCategory('all'); setQuery(''); const first = profiles.filter((p) => p.reviewStatus === 'suggested').sort((a, b) => a.courseName.localeCompare(b.courseName, 'ar'))[0]; if (first) open(first); }}>{t(`Review next · ${stats.suggested} left`, `راجع التالية · متبقٍ ${stats.suggested}`)}</Button>}
          <Button variant="secondary" icon={<Plus size={15} />} onClick={() => open(null)}>{t('Add a course', 'أضف دورة')}</Button>
          <Button variant="ghost" icon={<RefreshCw size={14} />} busy={busy === 'sync'} disabled={Boolean(busy)} onClick={() => void sync()} title={t('Add courses newly found on the website or in Odoo. Existing edits are kept.', 'أضف الدورات الجديدة من الموقع أو Odoo. التعديلات الحالية لا تتغير.')}>{t('Sync', 'مزامنة')}</Button>
        </div>}
      </section>

      {(error || loadError) && <p role="alert" className="creative-home__error">{error || loadError}</p>}
      {notice && <p role="status" className="settings-notice course-lib__notice"><CheckCircle2 size={15} /> {notice}<button type="button" aria-label={t('Dismiss', 'إغلاق')} onClick={() => setNotice('')}><X size={14} /></button></p>}

      <div className="course-lib__layout">
        <section className="course-lib__browse" aria-label={t('Courses', 'الدورات')}>
          <div className="course-lib__filters">
            <label className="board-search course-lib__search">
              <Search size={15} />
              <input type="search" dir="auto" aria-label={t('Search courses', 'ابحث في الدورات')} value={query} onChange={(e) => { setQuery(e.target.value); setLimit(60); }} placeholder={t('Search: AutoCAD, أوتوكاد, safety…', 'ابحث: أوتوكاد، AutoCAD، السلامة…')} />
              {query && <button type="button" className="course-lib__clear" aria-label={t('Clear search', 'امسح البحث')} onClick={() => setQuery('')}><X size={14} /></button>}
            </label>
            <div className="course-lib__status" role="group" aria-label={t('Review status', 'حالة المراجعة')}>
              {([['suggested', t('To review', 'للمراجعة'), stats.suggested], ['approved', t('Approved', 'معتمدة'), stats.approved], ['incomplete', t('Incomplete', 'ناقصة'), stats.incomplete], ['all', t('All', 'الكل'), stats.total]] as const)
                .filter(([value]) => editor || value !== 'suggested' || stats.suggested > 0)
                .map(([value, label, count]) => <button key={value} type="button" aria-pressed={status === value} data-tone={value} onClick={() => { setStatus(value); setLimit(60); }}><span>{label}</span><i className="u-tnum">{count}</i></button>)}
            </div>
            <div className="course-lib__selects">
              <select aria-label={t('Field', 'التخصص')} value={category} onChange={(e) => { setCategory(e.target.value); setLimit(60); }}>
                <option value="all">{t(`All fields (${profiles.length})`, `كل التخصصات (${profiles.length})`)}</option>
                {categories.map(([name, count]) => <option key={name} value={name}>{name} ({count})</option>)}
              </select>
              <select aria-label={t('Sort', 'الترتيب')} value={sort} disabled={Boolean(query.trim())} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="name">{t('Sort: name', 'الترتيب: الاسم')}</option>
                <option value="updated">{t('Sort: recently edited', 'الترتيب: الأحدث تعديلًا')}</option>
                <option value="missing">{t('Sort: most missing', 'الترتيب: الأكثر نقصًا')}</option>
              </select>
            </div>
          </div>
          <p className="u-xs u-muted course-lib__count" aria-live="polite">{query.trim() ? t(`${filtered.length} matches`, `${filtered.length} نتيجة`) : t(`${filtered.length} courses`, `${filtered.length} دورة`)}</p>
          <div className="course-lib__list">
            {!loaded && <div className="board-loading"><span className="ui-btn__spinner" /></div>}
            {filtered.slice(0, limit).map((p) => {
              const missing = missingFields(p);
              return (
                <button key={p.courseId} type="button" className="course-lib__item" aria-current={draft?.courseId === p.courseId ? 'true' : undefined} onClick={() => open(p)}>
                  <span className="course-lib__item-main">
                    <b dir="auto">{p.courseName}</b>
                    <small dir="auto">{categoryOf(p)}</small>
                    {missing.length > 0 && <span className="course-lib__missing">{t('Missing', 'ينقصها')}: {missing.map((m) => t(MISSING_LABEL[m][0], MISSING_LABEL[m][1])).join('، ')}</span>}
                  </span>
                  <span className="course-lib__pill" data-status={p.reviewStatus === 'suggested' ? 'suggested' : 'approved'}>{p.reviewStatus === 'suggested' ? <><i />{t('To review', 'للمراجعة')}</> : <><CheckCircle2 size={12} />{t('Approved', 'معتمد')}</>}</span>
                </button>
              );
            })}
            {loaded && filtered.length === 0 && (
              <div className="course-lib__none">
                <p>{status === 'suggested' && !query && category === 'all' ? t('Every course has been reviewed.', 'تمت مراجعة كل الدورات.') : t('No courses match these filters.', 'لا توجد دورات تطابق هذه الفلاتر.')}</p>
                {(query || category !== 'all' || status !== 'all') && <Button size="sm" variant="secondary" onClick={() => { setQuery(''); setCategory('all'); setStatus('all'); }}>{t('Show all courses', 'اعرض كل الدورات')}</Button>}
              </div>
            )}
            {filtered.length > limit && <Button variant="secondary" onClick={() => setLimit(limit + 60)}>{t(`Show more (${filtered.length - limit})`, `اعرض المزيد (${filtered.length - limit})`)}</Button>}
          </div>
          {editor && source && <details className="course-lib__source">
            <summary>{t('Import coverage', 'تغطية الاستيراد')} · {source.total} · {source.retrievedAt}</summary>
            <p>{t(`${source.pageCount} course pages read; ${source.catalogCount} names verified from website cards; ${source.unverified.length} links still need their names checked.`, `قُرئت ${source.pageCount} صفحة دورة، ووُثّق ${source.catalogCount} اسمًا من بطاقات الموقع، و${source.unverified.length} روابط تحتاج مراجعة أسمائها.`)}</p>
            {source.unverified.map((c) => <div key={c.courseId}><button className="ui-link" type="button" onClick={() => { const p = profiles.find((x) => x.courseId === c.courseId); if (p) open(p); }}>{c.name}</button> · <a href={c.url} target="_blank" rel="noreferrer">{t('Source', 'المصدر')}</a></div>)}
          </details>}
        </section>

        <section ref={editorRef} className="course-lib__detail" aria-label={t('Course profile', 'ملف الدورة')}>
          {draft ? (
            <CourseProfileEditor
              draft={draft}
              update={update}
              save={(s, then) => void save(s, then)}
              busy={busy}
              readOnly={!editor}
              dirty={dirty}
              restored={restored}
              categories={categories.map(([name]) => name).filter((name) => name !== other)}
              position={position >= 0 ? { index: position, total: filtered.length } : undefined}
              onStep={step}
              onClose={close}
              onDiscard={() => { if (base) { setDraft(base); setRestored(false); writeStored(user.id, null); } }}
              onDelete={draft.courseId.startsWith('manual:') && profiles.some((p) => p.courseId === draft.courseId) ? () => void remove() : undefined}
            />
          ) : (
            <div className="course-lib__empty glass">
              <GraduationCap size={34} />
              <h3>{editor ? t('Pick a course to review', 'اختر دورة لمراجعتها') : t('Pick a course to see its details', 'اختر دورة لعرض تفاصيلها')}</h3>
              <p>{editor ? t('Check the overview, audience, goals and outcomes against the course page, then approve. The post preview shows how the copy will read.', 'راجع النبذة والجمهور والأهداف والمخرجات مع صفحة الدورة ثم اعتمدها. معاينة المنشور توضح كيف سيظهر النص.') : t('These details fill the course fields on the Create page.', 'هذه البيانات تملأ حقول الدورة في صفحة الإنشاء.')}</p>
              {editor && stats.suggested > 0 && <ol className="course-lib__steps"><li>{t('Open the source page', 'افتح صفحة المصدر')}</li><li>{t('Correct the goals and audience', 'صحّح الأهداف والجمهور')}</li><li>{t('Approve and go to the next one', 'اعتمد وانتقل للتالية')}</li></ol>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** A list of short items edited one row at a time: Enter adds a row, Backspace on an empty row removes it, pasted lines split. */
function ItemsEditor({ label, hint, value, onChange, placeholder, addLabel, problem, readOnly }: { label: string; hint: string; value: string; onChange: (next: string) => void; placeholder: string; addLabel: string; problem?: string; readOnly?: boolean }) {
  const { t } = useI18n();
  // Always at least one row to type in; an empty value is one empty row.
  const rows = value.split('\n');
  const list = useRef<HTMLOListElement>(null);
  // After React has rendered the new rows.
  const focusRow = (index: number) => setTimeout(() => list.current?.querySelectorAll<HTMLInputElement>('input')[index]?.focus(), 0);
  const set = (next: string[]) => onChange(next.join('\n'));
  const filled = rows.filter((r) => r.trim()).length;
  if (readOnly) return <div className="course-field"><span className="course-field__label">{label}</span>{filled ? <ol className="course-items__read">{rows.filter((r) => r.trim()).map((r, i) => <li key={i} dir="auto">{r}</li>)}</ol> : <p className="u-muted u-sm">—</p>}</div>;
  const onKey = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Enter') { event.preventDefault(); if (rows.length >= LIMITS.items) return; const next = [...rows]; next.splice(index + 1, 0, ''); set(next); focusRow(index + 1); }
    else if (event.key === 'Backspace' && !rows[index] && rows.length > 1) { event.preventDefault(); set(rows.filter((_, i) => i !== index)); focusRow(Math.max(0, index - 1)); }
  };
  const onPaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\n')) return;
    event.preventDefault();
    // Bullets and numbering from a web page or document are dropped.
    const pasted = text.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-•*·▪●◦–]|\d+[.)-]|[٠-٩]+[.)-])\s*/, '').trim()).filter(Boolean);
    const next = [...rows];
    next.splice(index, rows[index]?.trim() ? 0 : 1, ...pasted);
    set(next.slice(0, LIMITS.items));
    focusRow(Math.min(index + pasted.length - 1, LIMITS.items - 1));
  };
  const move = (index: number, dir: -1 | 1) => { const next = [...rows]; [next[index], next[index + dir]] = [next[index + dir], next[index]]; set(next); focusRow(index + dir); };
  return (
    <div className="course-field" data-invalid={problem ? 'true' : undefined}>
      <span className="course-field__label">{label}<small className="u-tnum">{filled}/{LIMITS.items}</small></span>
      <small className="course-field__hint">{hint}</small>
      <ol ref={list} className="course-items">
        {rows.map((row, index) => (
          <li key={index}>
            <span className="course-items__num u-tnum" aria-hidden>{index + 1}</span>
            <input dir="auto" value={row} maxLength={LIMITS.itemChars} placeholder={placeholder} aria-label={`${label} ${index + 1}`} onChange={(e) => { const next = [...rows]; next[index] = e.target.value; set(next); }} onKeyDown={(e) => onKey(e, index)} onPaste={(e) => onPaste(e, index)} />
            <span className="course-items__tools">
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('Move up', 'لأعلى')}><ArrowUp size={13} /></button>
              <button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={t('Move down', 'لأسفل')}><ArrowDown size={13} /></button>
              <button type="button" disabled={rows.length === 1 && !row} onClick={() => { set(rows.length === 1 ? [''] : rows.filter((_, i) => i !== index)); focusRow(Math.max(0, index - 1)); }} aria-label={t('Remove', 'احذف')}><Trash2 size={13} /></button>
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className="course-items__add" disabled={rows.length >= LIMITS.items} onClick={() => { set([...rows, '']); focusRow(rows.length); }}><Plus size={14} /> {addLabel}</button>
      {problem && <small role="alert" className="course-field__problem"><AlertCircle size={13} /> {problem}</small>}
    </div>
  );
}

function Field({ label, hint, problem, children, count, max }: { label: string; hint?: string; problem?: string; children: React.ReactNode; count?: number; max?: number }) {
  return (
    <label className="course-field" data-invalid={problem ? 'true' : undefined}>
      <span className="course-field__label">{label}{max != null && count != null && count > max * 0.8 && <small className="u-tnum" data-over={count > max || undefined}>{count}/{max}</small>}</span>
      {hint && <small className="course-field__hint">{hint}</small>}
      {children}
      {problem && <small role="alert" className="course-field__problem"><AlertCircle size={13} /> {problem}</small>}
    </label>
  );
}

/** How the profile will read inside a course post (the same copy the Create page fills in). */
function PostPreview({ draft }: { draft: CourseProfileDraft }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = courseCopy({ courseName: draft.courseName.trim(), objectives: lines(draft.objectives), outcomes: lines(draft.outcomes), audience: draft.audience.trim(), sourceUrl: draft.sourceUrl.trim() });
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(timer); }, [copied]);
  return (
    <details className="course-preview" open>
      <summary><Eye size={14} /> {t('How it reads in a post', 'كيف سيظهر في المنشور')}</summary>
      <div className="course-preview__card">
        <b dir="auto">{copy.title || t('Course name', 'اسم الدورة')}</b>
        <span dir="auto">{copy.subtitle}</span>
        {lines(draft.objectives).length ? <ul>{lines(draft.objectives).slice(0, 3).map((goal, i) => <li key={i} dir="auto">{goal}</li>)}</ul> : <p className="u-muted u-xs">{t('The first three goals appear here.', 'أول ثلاثة أهداف تظهر هنا.')}</p>}
        <i>{copy.cta}</i>
      </div>
      <div className="course-preview__caption">
        <span>{t('Suggested caption', 'النص المرافق المقترح')}</span>
        <p dir="auto">{copy.caption || '—'}</p>
        <button type="button" className="ui-link" disabled={!copy.caption} onClick={() => void navigator.clipboard.writeText(copy.caption).then(() => setCopied(true), () => {})}><Copy size={13} /> {copied ? t('Copied', 'تم النسخ') : t('Copy caption', 'انسخ النص')}</button>
      </div>
    </details>
  );
}

/** The same fields serve imported, suggested and manually added profiles; read-only for people who create posts. */
export function CourseProfileEditor({ draft, update, save, busy, readOnly, dirty, restored, categories = [], position, onStep, onClose, onDiscard, onDelete }: {
  draft: CourseProfileDraft;
  update: (key: keyof CourseProfileDraft, value: string) => void;
  save: (status: 'suggested' | 'approved', then?: 'next') => void;
  busy: string;
  readOnly?: boolean;
  dirty?: boolean;
  restored?: boolean;
  categories?: string[];
  position?: { index: number; total: number };
  onStep?: (dir: 1 | -1) => void;
  onClose?: () => void;
  onDiscard?: () => void;
  onDelete?: () => void;
}) {
  const { t, dir } = useI18n();
  const problems = draftProblems(draft, t);
  const blocker = approveBlocker(draft, t);
  const approved = draft.reviewStatus === 'approved';
  const Prev = dir === 'rtl' ? ChevronRight : ChevronLeft, Next = dir === 'rtl' ? ChevronLeft : ChevronRight;
  return (
    <article className="course-editor glass">
      <header className="course-editor__head">
        {onClose && <button type="button" className="course-editor__back" onClick={onClose}><ArrowRight size={15} className="course-editor__back-icon" /> {t('All courses', 'كل الدورات')}</button>}
        <div className="course-editor__title">
          <span className="u-xs u-muted">{draft.category || t('Course profile', 'ملف دورة')}</span>
          <h3 dir="auto">{draft.courseName || t('New course', 'دورة جديدة')}</h3>
        </div>
        <span className="content-status" data-status={approved ? 'approved' : 'draft'}>{approved ? t('Approved', 'معتمد') : t('Suggested draft', 'مسودة مقترحة')}</span>
        {position && onStep && <nav className="course-editor__nav" aria-label={t('Course navigation', 'التنقل بين الدورات')}>
          <button type="button" disabled={position.index <= 0} onClick={() => onStep(-1)} aria-label={t('Previous course', 'الدورة السابقة')}><Prev size={16} /></button>
          <span className="u-tnum">{position.index + 1} / {position.total}</span>
          <button type="button" disabled={position.index >= position.total - 1} onClick={() => onStep(1)} aria-label={t('Next course', 'الدورة التالية')}><Next size={16} /></button>
        </nav>}
      </header>
      {restored && <p className="course-editor__restored" role="status"><RotateCcw size={14} /> {t('Your unsaved changes from last time were restored.', 'استرجعنا تعديلاتك غير المحفوظة من المرة السابقة.')}{onDiscard && <button type="button" className="ui-link" onClick={onDiscard}>{t('Discard them', 'تجاهلها')}</button>}</p>}
      {draft.sourceUrl && <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="ui-link course-editor__source"><ExternalLink size={13} /> {t('Open source page', 'افتح صفحة المصدر')}</a>}

      <div className="course-editor__body">
        {readOnly ? (
          <>
            <div className="course-field"><span className="course-field__label">{t('Overview', 'نبذة الدورة')}</span><p dir="auto">{draft.description || '—'}</p></div>
            <div className="course-field"><span className="course-field__label">{t('Target audience', 'الجمهور المستهدف')}</span><p dir="auto">{draft.audience || '—'}</p></div>
          </>
        ) : (
          <fieldset className="course-editor__group">
            <legend>{t('Basics', 'البيانات الأساسية')}</legend>
            <Field label={t('Course name', 'اسم الدورة')} problem={problems.courseName}><input value={draft.courseName} dir="auto" onChange={(e) => update('courseName', e.target.value)} maxLength={LIMITS.name} required /></Field>
            <Field label={t('Field', 'التخصص')} hint={t('Pick an existing field so courses stay grouped.', 'اختر تخصصًا موجودًا لتبقى الدورات مجمّعة.')} problem={problems.category}>
              <input value={draft.category} dir="auto" list="course-categories" onChange={(e) => update('category', e.target.value)} maxLength={LIMITS.category} />
              <datalist id="course-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label={t('Overview', 'نبذة الدورة')} hint={t('Two or three sentences on what the course covers.', 'جملتان أو ثلاث عن محتوى الدورة.')} problem={problems.description} count={draft.description.length} max={LIMITS.description}><textarea value={draft.description} onChange={(e) => update('description', e.target.value)} rows={3} maxLength={LIMITS.description} dir="auto" /></Field>
            <Field label={t('Target audience', 'الجمهور المستهدف')} hint={t('Who the course is for, e.g. site engineers and recent graduates.', 'لمن الدورة؟ مثلًا: مهندسو المواقع وحديثو التخرج.')} problem={problems.audience} count={draft.audience.length} max={LIMITS.audience}><textarea value={draft.audience} onChange={(e) => update('audience', e.target.value)} rows={2} maxLength={LIMITS.audience} dir="auto" /></Field>
          </fieldset>
        )}
        <ItemsEditor readOnly={readOnly} label={t('Learning goals', 'أهداف الدورة')} hint={t('One goal per row, starting with a verb. The first three appear in posts.', 'هدف في كل سطر يبدأ بفعل. أول ثلاثة تظهر في المنشورات.')} value={draft.objectives} onChange={(v) => update('objectives', v)} placeholder={t('e.g. Read and coordinate MEP drawings', 'مثلًا: قراءة مخططات الأعمال الكهروميكانيكية وتنسيقها')} addLabel={t('Add a goal', 'أضف هدفًا')} problem={problems.objectives} />
        <ItemsEditor readOnly={readOnly} label={t('Outcomes', 'مخرجات الدورة')} hint={t('What the trainee can do or produce by the end.', 'ما يستطيع المتدرب عمله أو تسليمه في النهاية.')} value={draft.outcomes} onChange={(v) => update('outcomes', v)} placeholder={t('e.g. A complete clash report', 'مثلًا: تقرير تعارضات كامل')} addLabel={t('Add an outcome', 'أضف مخرجًا')} problem={problems.outcomes} />
        {!readOnly && <fieldset className="course-editor__group">
          <legend>{t('Reference', 'المرجع')}</legend>
          <Field label={t('Source URL', 'رابط المصدر')} problem={problems.sourceUrl}><input value={draft.sourceUrl} onChange={(e) => update('sourceUrl', e.target.value)} type="url" inputMode="url" dir="ltr" placeholder="https://engosoft.com/…" /></Field>
          <Field label={t('Internal notes', 'ملاحظات داخلية')} hint={t('Only the team sees these; they never enter posts.', 'للفريق فقط، ولا تظهر في المنشورات.')} problem={problems.notes}><textarea value={draft.notes} onChange={(e) => update('notes', e.target.value)} rows={2} maxLength={LIMITS.notes} dir="auto" /></Field>
        </fieldset>}
        <PostPreview draft={draft} />
      </div>

      {!readOnly && <footer className="course-editor__footer">
        <span className="course-editor__state" data-dirty={dirty || undefined}>{dirty ? t('Unsaved changes', 'تعديلات غير محفوظة') : t('All changes saved', 'كل التعديلات محفوظة')}<kbd>⌘S</kbd></span>
        {blocker && !approved && <small className="course-editor__blocker"><AlertCircle size={13} /> {blocker}</small>}
        <div className="course-editor__actions">
          {approved ? <>
            <Button variant="primary" icon={<CheckCircle2 size={14} />} disabled={Boolean(busy) || Boolean(blocker) || !dirty} busy={busy === 'approve'} onClick={() => save('approved')}>{t('Save changes', 'احفظ التعديلات')}</Button>
            <Button variant="ghost" disabled={Boolean(busy) || Boolean(problems.courseName)} busy={busy === 'save'} onClick={() => save('suggested')}>{t('Send back to review', 'أعدها للمراجعة')}</Button>
          </> : <>
            {position && <Button variant="primary" icon={<CheckCircle2 size={14} />} disabled={Boolean(busy) || Boolean(blocker)} busy={busy === 'next'} onClick={() => save('approved', 'next')}>{t('Approve & next', 'اعتمد وافتح التالية')}</Button>}
            <Button variant={position ? 'secondary' : 'primary'} icon={position ? undefined : <CheckCircle2 size={14} />} disabled={Boolean(busy) || Boolean(blocker)} busy={busy === 'approve'} onClick={() => save('approved')}>{t('Approve & save', 'اعتمد واحفظ')}</Button>
            <Button variant="ghost" disabled={Boolean(busy) || Boolean(problems.courseName)} busy={busy === 'save'} onClick={() => save('suggested')}>{t('Save draft', 'احفظ مسودة')}</Button>
          </>}
          {dirty && onDiscard && <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={onDiscard}>{t('Undo changes', 'تراجع عن التعديلات')}</Button>}
          {onDelete && <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} disabled={Boolean(busy)} busy={busy === 'delete'} onClick={onDelete}>{t('Delete', 'احذف')}</Button>}
        </div>
      </footer>}
    </article>
  );
}
