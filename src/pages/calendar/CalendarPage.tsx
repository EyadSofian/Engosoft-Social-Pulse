import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { CalendarRange, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { Channels } from '../../components/data-display/ChannelIcon';
import { EmptyState } from '../../components/feedback/States';
import { Checkbox } from '../../components/forms/Field';
import { ContentStatusBadge, DemoBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Segmented, Tabs } from '../../components/ui/Tabs';
import type { ContentStatus } from '../../domain/content';
import type { Channel } from '../../domain/shared';
import { useCreateContent } from '../../features/content/CreateContent';
import { upcomingOpportunities } from '../../features/planning/opportunities';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useClock } from '../../features/workspace/hooks';
import { visibleContent } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { eventKindLabel } from '../../i18n/labels';
import { monthCells, weekCells, type DayCell } from '../../lib/calendar';
import { businessZone, parseTimestamp } from '../../lib/format';
import { LegacyCalendar } from '../../legacy/LegacyCalendar';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type View = 'plan' | 'live';
type Mode = 'month' | 'week' | 'agenda';
type Category = 'content' | 'scheduled' | 'published' | 'course' | 'event';

interface Entry {
  key: string;
  day: string;
  time: number | null;
  title: string;
  category: Category;
  href?: string;
  status?: ContentStatus;
  channels?: Channel[];
  hint?: string;
}
interface OdooScheduleEntry { id: string; title: string; startsAt: string; endsAt: string; source: string }

const zone = () => businessZone();
const dayOf = (iso: string) => DateTime.fromMillis(parseTimestamp(iso), { zone: zone() }).toISODate() ?? '';

export function CalendarPage() {
  const { t } = useI18n();
  const [query, setQuery] = useQueryState();
  const { store } = useLiveData();
  usePageMeta(t('Calendar', 'التقويم'), [{ label: t('Calendar', 'التقويم') }]);
  const view: View = query.get('view') === 'live' ? 'live' : 'plan';

  return (
    <div className="u-stack">
      <PageHeader title={t('Calendar', 'التقويم')} description={t('The content plan across departments, course dates and occasions — and the live publishing calendar.', 'خطة المحتوى لكل الأقسام ومواعيد الدورات والمناسبات — وتقويم النشر الحي.')} />
      <Tabs
        label={t('Calendars', 'التقاويم')}
        value={view}
        onChange={(value) => setQuery({ view: value === 'plan' ? null : value })}
        items={[
          { value: 'plan', label: t('Content plan', 'خطة المحتوى') },
          { value: 'live', label: t('Publishing calendar (live)', 'تقويم النشر (مباشر)'), count: store.phase === 'ready' ? store.data.plans.length : undefined },
        ]}
      />
      {view === 'live' ? (
        <>
          <p className="u-sm u-muted">{t('Plans saved to the server: drag to reschedule, import the XLSX template, export to CSV or ICS. Alerts fire before and after each post time. This calendar is Arabic-only until it is rebuilt.', 'خطط محفوظة على الخادم: اسحب لتغيير الموعد، ارفع قالب XLSX، صدّر CSV أو ICS. التنبيهات قبل وبعد موعد كل منشور. هذا التقويم بالعربية فقط حتى إعادة بنائه.')}</p>
          {store.phase === 'ready' ? <LegacyCalendar /> : <EmptyState title={store.phase === 'loading' ? t('Loading the calendar…', 'جارٍ تحميل التقويم…') : t('The calendar API is not reachable.', 'واجهة التقويم غير متاحة.')} text={store.staleError || undefined} action={store.phase === 'offline' ? <Button onClick={() => void store.reload()}>{t('Retry', 'أعد المحاولة')}</Button> : undefined} />}
        </>
      ) : (
        <PlanCalendar />
      )}
    </div>
  );
}

function PlanCalendar() {
  const { t, tx, date, num } = useI18n();
  const { state, me, can } = useWorkspace();
  const create = useCreateContent();
  const now = useClock();
  const [query, setQuery] = useQueryState();
  const [odoo, setOdoo] = useState<OdooScheduleEntry[]>([]);
  const [odooConnected, setOdooConnected] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch('/api/odoo/schedule').then((response) => response.json()).then((result) => {
      if (!active) return;
      setOdoo(Array.isArray(result.events) ? result.events : []);
      setOdooConnected(result.status === 'connected');
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const mode: Mode = query.get('mode') === 'week' ? 'week' : query.get('mode') === 'agenda' ? 'agenda' : 'month';
  const today = DateTime.fromMillis(now, { zone: zone() }).toISODate() ?? '';
  const cursor = DateTime.fromISO(query.get('date') ?? today, { zone: zone() });
  const layers = new Set((query.get('layers') ?? 'content,course,event').split(','));
  const courseFocus = query.get('course');
  const toggle = (layer: string) => {
    const next = new Set(layers);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    setQuery({ layers: [...next].join(',') || 'none' });
  };

  const entries = useMemo(() => {
    const list: Entry[] = [];
    if (layers.has('content'))
      for (const item of visibleContent(state, me)) {
        if (item.status === 'cancelled' || item.status === 'archived') continue;
        const iso = item.status === 'scheduled' || item.status === 'published' ? item.publishAt : item.dueAt;
        if (!iso) continue;
        list.push({
          key: item.id,
          day: dayOf(iso),
          time: parseTimestamp(iso),
          title: item.title,
          category: item.status === 'published' ? 'published' : item.status === 'scheduled' ? 'scheduled' : 'content',
          href: `/content/${item.id}`,
          status: item.status,
          channels: item.channels,
        });
      }
    if (layers.has('course'))
      for (const course of state.courses) {
        if (courseFocus && course.id !== courseFocus) continue;
        list.push({ key: `${course.id}-start`, day: course.startDate, time: null, title: t(`${course.code} starts — ${course.cohort}`, `بداية ${course.code} — ${course.cohort}`), category: 'course' });
        list.push({ key: `${course.id}-end`, day: course.endDate, time: null, title: t(`${course.code} ends — ${course.cohort}`, `نهاية ${course.code} — ${course.cohort}`), category: 'course', hint: t('Evaluation video due', 'مطلوب فيديو التقييم') });
      }
    if (layers.has('event'))
      for (const entry of upcomingOpportunities(state, now, 120)) list.push({ key: entry.id, day: entry.date, time: null, title: tx(entry.name), category: 'event', hint: tx(eventKindLabel[entry.kind]) });
    for (const entry of odoo) {
      const category: Category = entry.source.toLowerCase().includes('course') ? 'course' : 'event';
      if (!layers.has(category)) continue;
      list.push({ key: `odoo-${entry.id}`, day: dayOf(entry.startsAt), time: parseTimestamp(entry.startsAt), title: entry.title, category, hint: `Odoo · ${entry.source}` });
    }
    return list.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? 0) - (b.time ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, me, query, now, odoo]);

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) map.set(entry.day, [...(map.get(entry.day) ?? []), entry]);
    return map;
  }, [entries]);

  const step = (delta: number) => {
    const next = mode === 'week' ? cursor.plus({ weeks: delta }) : cursor.plus({ months: delta });
    setQuery({ date: next.toISODate() });
  };
  const cells = mode === 'week' ? weekCells(cursor) : monthCells(cursor);
  const title = mode === 'week' ? `${date(cells[0].key, 'dayShort')} – ${date(cells[6].key, 'dayShort')}` : date(cursor.toISODate() ?? '', 'month');
  const agenda = entries.filter((entry) => entry.day >= today).slice(0, 60);

  const LEGEND: { key: Category; label: string }[] = [
    { key: 'content', label: t('In progress (due date)', 'قيد العمل (موعد التسليم)') },
    { key: 'scheduled', label: t('Scheduled', 'مجدول') },
    { key: 'published', label: t('Published', 'منشور') },
    { key: 'course', label: t('Course dates', 'مواعيد الدورات') },
    { key: 'event', label: t('Occasions & events', 'مناسبات وفعاليات') },
  ];

  return (
    <div className="u-stack">
      <div className="toolbar">
        <div className="u-row">
          {mode !== 'agenda' && (
            <>
              <IconButton label={t('Previous', 'السابق')} variant="secondary" onClick={() => step(-1)}>
                <ChevronLeft size={16} className="u-flip" />
              </IconButton>
              <IconButton label={t('Next', 'التالي')} variant="secondary" onClick={() => step(1)}>
                <ChevronRight size={16} className="u-flip" />
              </IconButton>
              <Button size="sm" onClick={() => setQuery({ date: null })}>
                {t('Today', 'اليوم')}
              </Button>
              <h2 className="cal-title">{title}</h2>
            </>
          )}
        </div>
        <div className="u-row u-row--wrap">
          <Segmented
            label={t('Calendar view', 'عرض التقويم')}
            value={mode}
            onChange={(value) => setQuery({ mode: value === 'month' ? null : value })}
            items={[
              { value: 'month', label: t('Month', 'شهر') },
              { value: 'week', label: t('Week', 'أسبوع') },
              { value: 'agenda', label: t('Agenda', 'قائمة') },
            ]}
          />
          {can('content.create') && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => create.open()}>
              {t('Create content', 'إنشاء محتوى')}
            </Button>
          )}
        </div>
      </div>
      <div className="filters">
        <Checkbox checked={layers.has('content')} onChange={() => toggle('content')} label={t('Content', 'المحتوى')} />
        <Checkbox checked={layers.has('course')} onChange={() => toggle('course')} label={t('Courses', 'الدورات')} />
        <Checkbox checked={layers.has('event')} onChange={() => toggle('event')} label={t('Occasions & events', 'المناسبات والفعاليات')} />
        {courseFocus && (
          <button type="button" className="ui-link" onClick={() => setQuery({ course: null })}>
            {t('Show all courses', 'اعرض كل الدورات')}
          </button>
        )}
        <span className="cal-legend" aria-label={t('Legend', 'دليل الألوان')}>
          {LEGEND.map((entry) => (
            <span key={entry.key} className="cal-legend__item" data-cat={entry.key}>
              {entry.label}
            </span>
          ))}
        </span>
      </div>

      {mode === 'agenda' ? (
        <Card>
          {agenda.length === 0 ? (
            <EmptyState icon={<CalendarRange size={20} />} title={t('Nothing ahead on the plan.', 'لا شيء قادم في الخطة.')} text={t('Turn on more layers or create content.', 'فعّل طبقات أكثر أو أنشئ محتوى.')} />
          ) : (
            <ol className="agenda">
              {[...new Set(agenda.map((entry) => entry.day))].map((day) => (
                <li key={day} className="agenda__day">
                  <p className="agenda__label">
                    {date(day, 'weekdayDate')}
                    {day === today && <span className="ui-badge ui-badge--brand">{t('Today', 'اليوم')}</span>}
                  </p>
                  <ul>
                    {agenda
                      .filter((entry) => entry.day === day)
                      .map((entry) => (
                        <EntryRow key={entry.key} entry={entry} />
                      ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </Card>
      ) : (
        <div className={`plan-cal plan-cal--${mode}`} role="grid" aria-label={title}>
          <div className="plan-cal__head" role="row">
            {cells.slice(0, 7).map((cell) => (
              <span key={cell.key} role="columnheader" className="plan-cal__wd" aria-label={date(cell.key, 'weekday')}>
                <span className="plan-cal__wd-long" aria-hidden>
                  {date(cell.key, 'weekday')}
                </span>
                <span className="plan-cal__wd-short" aria-hidden>
                  {date(cell.key, 'weekdayNarrow')}
                </span>
              </span>
            ))}
          </div>
          <div className="plan-cal__body">
            {cells.map((cell) => (
              <DayBox key={cell.key} cell={cell} entries={byDay.get(cell.key) ?? []} today={cell.key === today} max={mode === 'week' ? 12 : 3} monthMode={mode === 'month'} />
            ))}
          </div>
        </div>
      )}
      <p className="ui-source ui-source--demo">
        <DemoBadge /> {t(`Demo content and course dates; ${num(entries.length)} entries shown. ${odooConnected ? `${num(odoo.length)} Odoo dates added read-only.` : 'Connect Odoo to add its live dates.'}`, `مواعيد المحتوى والكورسات التجريبية؛ يظهر ${num(entries.length)} عنصر. ${odooConnected ? `أُضيف ${num(odoo.length)} موعد من Odoo للعرض فقط.` : 'اربط Odoo لإظهار مواعيده المباشرة.'}`)}
      </p>
    </div>
  );
}

function DayBox({ cell, entries, today, max, monthMode }: { cell: DayCell; entries: Entry[]; today: boolean; max: number; monthMode: boolean }) {
  const { t, num } = useI18n();
  const [, setQuery] = useQueryState();
  const hidden = entries.length - max;
  return (
    <div className="plan-cal__day" role="gridcell" data-out={(monthMode && !cell.inMonth) || undefined} data-today={today || undefined} data-weekend={cell.weekend || undefined}>
      <span className="plan-cal__num u-tnum">{cell.date.day}</span>
      <ul className="plan-cal__entries">
        {entries.slice(0, max).map((entry) => (
          <li key={entry.key}>
            {entry.href ? (
              <Link to={entry.href} className="cal-chip" data-cat={entry.category} title={entry.title} dir="auto">
                <span className="u-truncate">{entry.title}</span>
              </Link>
            ) : (
              <span className="cal-chip" data-cat={entry.category} title={entry.hint ? `${entry.title} — ${entry.hint}` : entry.title} dir="auto">
                <span className="u-truncate">{entry.title}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className="plan-cal__more" onClick={() => setQuery({ mode: 'week', date: cell.key })}>
          {t(`+${num(hidden)} more`, `+${num(hidden)} أخرى`)}
        </button>
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const { t, date } = useI18n();
  return (
    <li className="agenda__item" data-cat={entry.category}>
      <span className="agenda__time u-tnum">{entry.time ? date(entry.time, 'time') : t('All day', 'طوال اليوم')}</span>
      <span className="u-grow u-truncate" dir="auto">
        {entry.href ? (
          <Link to={entry.href} className="ui-link">
            {entry.title}
          </Link>
        ) : (
          entry.title
        )}
        {entry.hint && <span className="u-xs u-muted"> · {entry.hint}</span>}
      </span>
      {entry.channels && <Channels channels={entry.channels} size={12} />}
      {entry.status && <ContentStatusBadge status={entry.status} />}
      {!entry.status && <span className="u-xs u-muted">{entry.category === 'course' ? t('Course', 'دورة') : t('Occasion', 'مناسبة')}</span>}
    </li>
  );
}
