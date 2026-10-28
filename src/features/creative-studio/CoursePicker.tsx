import { useEffect, useState } from 'react';
import { CalendarClock, GraduationCap, Loader2, MonitorPlay, Search } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import type { OdooEvent } from '../svg-templates/render';

export interface OdooCourse { id: string; kind: 'course' | 'elearning'; name: string; category: string; description: string; url?: string; price?: number; nextRuns: OdooEvent[] }
export type CoursePick = { type: 'course'; course: OdooCourse } | { type: 'event'; event: OdooEvent };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' });

/**
 * Searches every Odoo course (sales catalog and eLearning) and every upcoming run in one box. Arabic or English,
 * typos tolerated; with an empty box it lists courses and the soonest runs.
 */
export function CoursePicker({ onPick, autoFocus }: { onPick: (pick: CoursePick) => void; autoFocus?: boolean }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(8);
  const [data, setData] = useState<{ courses: OdooCourse[]; events: OdooEvent[]; status: string; message?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      // Through api(): an expired session shows the sign-in screen instead of an empty list.
      api<{ courses: OdooCourse[]; events: OdooEvent[]; status: string; message?: string }>(`/api/odoo/courses?q=${encodeURIComponent(query.trim())}`)
        .then((value) => alive && setData(value))
        .catch((e) => alive && setData({ courses: [], events: [], status: 'error', message: errorMessage(e, '') }))
        .finally(() => alive && setLoading(false));
    }, query ? 250 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const courses = data?.courses ?? [];
  const events = (data?.events ?? []).slice(0, query ? 8 : 10);
  return (
    <div className="course-picker">
      <label className="course-picker__search">
        {loading ? <Loader2 size={16} className="creative-job__spin" /> : <Search size={16} />}
        <input dir="auto" autoFocus={autoFocus} value={query} onChange={(e) => { setQuery(e.target.value); setLimit(8); }} placeholder={t('Search courses: AutoCAD, CFM, Revit, safety…', 'ابحث في الدورات: أوتوكاد، CFM، ريفيت، السلامة…')} aria-label={t('Search courses', 'ابحث في الدورات')} />
      </label>
      {data?.status && data.status !== 'connected' && <p className="u-xs u-muted">{data.message || t('Odoo is not available.', 'Odoo غير متاح.')}</p>}
      {courses.length > 0 && (
        <div className="course-picker__group">
          <small>{t('Courses', 'الدورات')}</small>
          {courses.slice(0, limit).map((course) => (
            <button key={course.id} type="button" className="course-picker__item" onClick={() => onPick({ type: 'course', course })}>
              <span className="course-picker__icon">{course.kind === 'elearning' ? <MonitorPlay size={15} /> : <GraduationCap size={15} />}</span>
              <span className="course-picker__text">
                <b dir="auto">{course.name}</b>
                <small dir="auto">{course.category}{course.nextRuns[0] ? ` · ${t('next', 'القادمة')}: ${fmtDate(course.nextRuns[0].startsAt)}` : course.kind === 'elearning' ? ` · ${t('self-paced', 'ذاتي التعلم')}` : ` · ${t('no upcoming date', 'لا يوجد موعد قادم')}`}</small>
              </span>
            </button>
          ))}
          {courses.length > limit && <button type="button" className="ui-link" onClick={() => setLimit(n => n + 8)}>{t('More courses', 'دورات أكثر')}</button>}
        </div>
      )}
      {events.length > 0 && (
        <div className="course-picker__group">
          <small>{query ? t('Upcoming runs', 'المواعيد القادمة') : t('Soonest runs', 'أقرب المواعيد')}</small>
          {events.map((event) => (
            <button key={event.id} type="button" className="course-picker__item" onClick={() => onPick({ type: 'event', event })}>
              <span className="course-picker__icon course-picker__icon--event"><CalendarClock size={15} /></span>
              <span className="course-picker__text">
                <b dir="auto">{event.title}</b>
                <small>{fmtDate(event.startsAt)}{event.location ? ` · ${event.location}` : ''}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {query && !loading && data?.status === 'connected' && !courses.length && !events.length && <p className="u-sm u-muted">{t('No course matches. Try the English name or fewer words.', 'لا توجد دورة مطابقة. جرّب الاسم الإنجليزي أو كلمات أقل.')}</p>}
    </div>
  );
}

/** The run to use for dates when a course is picked: its next run, if any. */
export const runOf = (pick: CoursePick): OdooEvent | undefined => (pick.type === 'event' ? pick.event : pick.course.nextRuns[0]);
