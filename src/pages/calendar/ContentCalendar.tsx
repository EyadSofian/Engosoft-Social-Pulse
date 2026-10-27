import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Image as ImageIcon, Plus, Search, Sparkles } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import type { ContentStatus } from '../../domain/content';
import { useCreateContent } from '../../features/content/CreateContent';
import { STATUS_LABEL, type Channel, type PipelineItem } from '../../features/content-pipeline/types';
import { usePipeline } from '../../features/content-pipeline/usePipeline';
import { useAuth } from '../../features/auth/AuthProvider';
import { useClock } from '../../features/workspace/hooks';
import { useI18n } from '../../i18n/I18nProvider';
import { monthCells, weekCells, type DayCell } from '../../lib/calendar';
import { businessZone, parseTimestamp } from '../../lib/format';
import { occasionsFor, type Occasion } from '../../lib/occasions';

type Mode = 'month' | 'week' | 'list';
interface OdooScheduleEntry { id: string; title: string; startsAt: string; endsAt: string; source: string }

const CHANNELS: Channel[] = ['facebook', 'instagram', 'linkedin', 'tiktok', 'snapchat', 'whatsapp', 'website'];
const STATUS_FILTERS: { value: string; statuses: ContentStatus[]; en: string; ar: string }[] = [
  { value: 'all', statuses: [], en: 'All statuses', ar: 'كل الحالات' },
  { value: 'review', statuses: ['ready_for_review'], en: 'Needs approval', ar: 'بانتظار الاعتماد' },
  { value: 'approved', statuses: ['approved'], en: 'Approved', ar: 'معتمد' },
  { value: 'scheduled', statuses: ['scheduled'], en: 'Scheduled', ar: 'مجدول' },
  { value: 'published', statuses: ['published'], en: 'Published', ar: 'منشور' },
  { value: 'draft', statuses: ['idea', 'draft', 'in_production'], en: 'Drafts', ar: 'مسودات' },
  { value: 'changes', statuses: ['changes_requested'], en: 'Changes requested', ar: 'مطلوب تعديل' },
];
/** Which tone a status takes on the grid: neutral work in progress, blue waiting on a decision, green decided. */
const tone = (status: ContentStatus) => status === 'published' || status === 'approved' ? 'success' : status === 'scheduled' || status === 'ready_for_review' ? 'brand' : status === 'changes_requested' ? 'warning' : 'neutral';

const zone = () => businessZone();
const dayOf = (iso: string) => DateTime.fromMillis(parseTimestamp(iso), { zone: zone() }).toISODate() ?? '';

/** Posts dated by their publish time, plus course dates and occasions, in the style of a social planner. */
export function ContentCalendar() {
  const { t, date } = useI18n();
  const { can } = useAuth();
  const create = useCreateContent();
  const now = useClock();
  const [query, setQuery] = useQueryState();
  const { items, error } = usePipeline();
  const [search, setSearch] = useState('');
  const [showRail, setShowRail] = useState(false);
  const [odoo, setOdoo] = useState<OdooScheduleEntry[]>([]);
  useEffect(() => {
    let alive = true;
    void fetch('/api/odoo/schedule').then((r) => r.json()).then((result) => { if (alive) setOdoo(Array.isArray(result.events) ? result.events : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const mode: Mode = query.get('mode') === 'month' ? 'month' : query.get('mode') === 'list' ? 'list' : 'week';
  const today = DateTime.fromMillis(now, { zone: zone() }).toISODate() ?? '';
  const requestedDate = DateTime.fromISO(query.get('date') ?? today, { zone: zone() });
  const cursor = requestedDate.isValid ? requestedDate : DateTime.fromISO(today, { zone: zone() });
  const platforms = new Set((query.get('p') ?? '').split(',').filter(Boolean));
  const statusFilter = STATUS_FILTERS.find((entry) => entry.value === query.get('s')) ?? STATUS_FILTERS[0];
  const layers = new Set((query.get('layers') ?? 'info').split(',').filter(Boolean));
  const togglePlatform = (channel: Channel) => {
    const next = new Set(platforms);
    if (next.has(channel)) next.delete(channel); else next.add(channel);
    setQuery({ p: [...next].join(',') || null });
  };
  const toggleLayer = (layer: string) => {
    const next = new Set(layers);
    if (next.has(layer)) next.delete(layer); else next.add(layer);
    setQuery({ layers: next.size ? [...next].join(',') : 'none' });
  };
  const step = (delta: number) => setQuery({ date: (mode === 'week' ? cursor.plus({ weeks: delta }) : cursor.plus({ months: delta })).toISODate() });

  const cells = mode === 'week' ? weekCells(cursor) : monthCells(cursor);
  const rangeLabel = mode === 'week' ? `${date(cells[0].key, 'dayShort')} – ${date(cells[6].key, 'dayShort')}` : date(cursor.toISODate() ?? '', 'month');

  const visible = useMemo(() => (items ?? []).filter((item) =>
    !['archived', 'cancelled'].includes(item.status)
    && (!platforms.size || item.channels.some((channel) => platforms.has(channel)))
    && (!statusFilter.statuses.length || statusFilter.statuses.includes(item.status))
    && (!search.trim() || item.title.toLowerCase().includes(search.trim().toLowerCase()))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [items, query, search]);

  const byDay = useMemo(() => {
    const map = new Map<string, PipelineItem[]>();
    for (const item of visible) {
      if (!item.scheduledAt) continue;
      const key = dayOf(item.scheduledAt);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    for (const list of map.values()) list.sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
    return map;
  }, [visible]);
  const unscheduled = useMemo(() => visible.filter((item) => !item.scheduledAt && item.status !== 'published' && item.status !== 'idea')
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)), [visible]);

  const occasions = useMemo(() => (layers.has('info') ? occasionsFor(cells.map((cell) => cell.key)) : new Map<string, Occasion[]>()), [cells.map((c) => c.key).join(','), query]);
  const sessions = useMemo(() => {
    const map = new Map<string, OdooScheduleEntry[]>();
    if (layers.has('info')) for (const entry of odoo) { const key = dayOf(entry.startsAt); map.set(key, [...(map.get(key) ?? []), entry]); }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odoo, query]);

  const rangeStart = cells[0].key;
  const rangeEnd = cells[cells.length - 1].key;
  const rangeDays = [...byDay.keys()].filter((key) => key >= rangeStart && key <= rangeEnd).sort();
  const scheduledCount = rangeDays.reduce((sum, key) => sum + byDay.get(key)!.length, 0);
  const days = mode === 'list' ? rangeDays : [];

  return (
    <div className="mc">
      <div className="mc-toolbar glass">
        <div className="mc-toolbar__nav">
          <Button size="sm" variant="secondary" onClick={() => setQuery({ date: null })}>{mode === 'week' ? t('This week', 'هذا الأسبوع') : t('Today', 'اليوم')}</Button>
          <div className="mc-stepper">
            <button type="button" onClick={() => step(-1)} aria-label={t('Previous', 'السابق')}><ChevronLeft size={16} className="u-flip" /></button>
            <b className="mc-stepper__label">{rangeLabel}</b>
            <button type="button" onClick={() => step(1)} aria-label={t('Next', 'التالي')}><ChevronRight size={16} className="u-flip" /></button>
          </div>
        </div>
        <label className="mc-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search posts', 'ابحث في المنشورات')} aria-label={t('Search posts', 'ابحث في المنشورات')} /></label>
        <select className="mc-select" value={statusFilter.value} onChange={(e) => setQuery({ s: e.target.value === 'all' ? null : e.target.value })} aria-label={t('Status', 'الحالة')}>
          {STATUS_FILTERS.map((entry) => <option key={entry.value} value={entry.value}>{t(entry.en, entry.ar)}</option>)}
        </select>
        <div className="mc-tabs" role="tablist" aria-label={t('Calendar view', 'عرض التقويم')}>
          {(['month', 'week', 'list'] as Mode[]).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setQuery({ mode: value === 'week' ? null : value })}>{value === 'month' ? t('Month', 'شهر') : value === 'week' ? t('Week', 'أسبوع') : t('List', 'قائمة')}</button>)}
        </div>
        {can('content.create') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => create.open()}>{t('Create post', 'منشور جديد')}</Button>}
      </div>

      <div className="mc-filters">
        <div className="mc-platforms" role="group" aria-label={t('Platforms', 'المنصات')}>
          {CHANNELS.map((channel) => <button key={channel} type="button" aria-label={channel} aria-pressed={platforms.has(channel)} onClick={() => togglePlatform(channel)} title={channel}><ChannelIcon channel={channel} size={15} /></button>)}
          {platforms.size > 0 && <button type="button" className="mc-clear" onClick={() => setQuery({ p: null })}>{t('Clear', 'مسح')}</button>}
        </div>
        <button type="button" className="mc-layer" aria-pressed={layers.has('info')} onClick={() => toggleLayer('info')}><Sparkles size={13} /> {t('Courses & occasions', 'الدورات والمناسبات')}</button>
        <button type="button" className="mc-layer" aria-pressed={showRail} onClick={() => setShowRail(!showRail)}><CalendarClock size={13} /> {t('Unscheduled', 'غير مجدول')} <b>{unscheduled.length}</b></button>
        <span className="mc-count u-tnum">{t(`${scheduledCount} scheduled in view`, `${scheduledCount} منشور في هذا العرض`)}</span>
      </div>

      {error && <p role="alert" className="creative-home__error">{error}</p>}
      {!items && !error && <p role="status" className="u-sm u-muted">{t('Loading your calendar…', 'جارٍ تحميل التقويم…')}</p>}
      <div className="mc-layout" data-rail={showRail || undefined} aria-busy={!items && !error}>
        <div className="mc-main">
          {mode === 'list' ? (
            <div className="mc-list">
              {days.map((key) => (
                <section key={key} className="mc-list__day">
                  <h3>{date(key, 'weekdayDate')}{key === today && <span className="mc-today-pill">{t('Today', 'اليوم')}</span>}</h3>
                  <ul>{(byDay.get(key) ?? []).map((item) => <li key={item.id}><PostRow item={item} /></li>)}</ul>
                </section>
              ))}
              {days.length === 0 && <EmptyCalendar />}
            </div>
          ) : (
            <div className={`mc-grid mc-grid--${mode}`} role="grid" aria-label={rangeLabel}>
              <div className="mc-grid__head" role="row">
                {cells.slice(0, 7).map((cell) => <span key={cell.key} role="columnheader" data-today={mode === 'week' && cell.key === today ? '' : undefined}>
                  <span>{date(cell.key, 'weekday')}</span>
                  {mode === 'week' && <b className="u-tnum">{cell.date.day}</b>}
                </span>)}
              </div>
              <div className="mc-grid__body">
                {cells.map((cell) => <DayColumn key={cell.key} cell={cell} mode={mode} today={cell.key === today} posts={byDay.get(cell.key) ?? []} occasions={occasions.get(cell.key) ?? []} sessions={sessions.get(cell.key) ?? []} />)}
              </div>
            </div>
          )}
        </div>

        {showRail && <aside className="mc-rail glass" aria-label={t('Waiting for a date', 'بانتظار موعد')}>
          <h3><CalendarClock size={15} /> {t('Not scheduled yet', 'غير مجدولة بعد')} <i className="u-tnum">{unscheduled.length}</i></h3>
          <p className="u-xs u-muted">{t('Approved posts come first. Open one to pick its publishing time.', 'المعتمدة أولًا. افتح المنشور لاختيار ميعاد نشره.')}</p>
          <ul>
            {unscheduled.slice(0, 14).map((item) => <li key={item.id}><PostRow item={item} compact /></li>)}
            {unscheduled.length === 0 && <li className="mc-rail__empty">{t('Everything has a date.', 'كل المنشورات لها موعد.')}</li>}
          </ul>
        </aside>}
      </div>
      <div className="mc-legend"><span data-tone="neutral">{t('Draft', 'مسودة')}</span><span data-tone="brand">{t('In review / scheduled', 'للمراجعة / مجدول')}</span><span data-tone="success">{t('Approved / published', 'معتمد / منشور')}</span><span data-tone="warning">{t('Changes requested', 'مطلوب تعديل')}</span><small>{zone()}</small></div>
    </div>
  );
}

const ORDER: ContentStatus[] = ['approved', 'ready_for_review', 'changes_requested', 'in_production', 'draft', 'idea'];

function EmptyCalendar() {
  const { t } = useI18n();
  return <div className="mc-empty"><CalendarPlus size={26} /><b>{t('Nothing scheduled ahead', 'لا شيء مجدول قادمًا')}</b><p>{t('Approved posts appear here once someone gives them a publishing time.', 'تظهر المنشورات المعتمدة هنا بعد تحديد ميعاد نشرها.')}</p></div>;
}

function Thumb({ item, size }: { item: PipelineItem; size: 'sm' | 'md' }) {
  return item.creative?.imageUrl ? <img className={`mc-thumb mc-thumb--${size}`} src={item.creative.imageUrl} alt="" loading="lazy" /> : <span className={`mc-thumb mc-thumb--${size} mc-thumb--empty`}><ImageIcon size={size === 'sm' ? 12 : 18} /></span>;
}

function StatusPill({ status }: { status: ContentStatus }) {
  const { tx } = useI18n();
  return <span className="mc-status" data-tone={tone(status)}>{tx(STATUS_LABEL[status])}</span>;
}

function PostRow({ item, compact }: { item: PipelineItem; compact?: boolean }) {
  const { date } = useI18n();
  return (
    <Link to={`/content/${item.id}`} className="mc-row" data-tone={tone(item.status)} data-compact={compact || undefined}>
      <Thumb item={item} size="md" />
      <span className="mc-row__body">
        <b dir="auto">{item.title}</b>
        <span className="mc-row__meta">
          {item.scheduledAt && <span className="u-tnum">{date(item.scheduledAt, 'time')}</span>}
          <span className="mc-channels">{item.channels.map((channel) => <ChannelIcon key={channel} channel={channel} size={12} />)}</span>
        </span>
      </span>
      <StatusPill status={item.status} />
    </Link>
  );
}

function DayColumn({ cell, mode, today, posts, occasions, sessions }: { cell: DayCell; mode: Mode; today: boolean; posts: PipelineItem[]; occasions: Occasion[]; sessions: OdooScheduleEntry[] }) {
  const { t, date, num } = useI18n();
  const [, setQuery] = useQueryState();
  const max = mode === 'week' ? posts.length : 3;
  const info = [...occasions.map((o) => ({ key: o.key, label: o.name, kind: 'occasion' as const })), ...sessions.map((s) => ({ key: `odoo-${s.id}`, label: s.title, kind: 'course' as const }))];
  const hidden = posts.length - max;
  return (
    <div className="mc-day" role="gridcell" data-today={today || undefined} data-out={(mode === 'month' && !cell.inMonth) || undefined} data-weekend={cell.weekend || undefined}>
      <span className="mc-day__label">
        {mode === 'week' ? <span className="mc-day__weekday">{date(cell.key, 'weekday')}</span> : null}
        <b className="u-tnum" data-today={today || undefined}>{cell.date.day}</b>
      </span>
      {info.slice(0, mode === 'week' ? 6 : 1).map((entry) => <span key={entry.key} className="mc-info" data-kind={entry.kind} title={entry.label} dir="auto"><span className="u-truncate">{entry.label}</span></span>)}
      {mode === 'week' && posts.length === 0 && <span className="mc-day__empty">{t('No posts', 'لا توجد منشورات')}</span>}
      {mode === 'week'
        ? posts.slice(0, max).map((item) => <WeekCard key={item.id} item={item} />)
        : <ul className="mc-day__chips">{posts.slice(0, max).map((item) => <li key={item.id}><MonthChip item={item} /></li>)}</ul>}
      {hidden > 0 && <button type="button" className="mc-more" onClick={() => setQuery({ mode: 'week', date: cell.key })}>{t(`+${num(hidden)} more`, `+${num(hidden)} أخرى`)}</button>}
    </div>
  );
}

function WeekCard({ item }: { item: PipelineItem }) {
  const { date } = useI18n();
  return (
    <Link to={`/content/${item.id}`} className="mc-card" data-tone={tone(item.status)}>
      <Thumb item={item} size="md" />
      <span className="mc-card__body">
        <span className="mc-card__time u-tnum">{item.scheduledAt ? date(item.scheduledAt, 'time') : ''}</span>
        <b dir="auto">{item.title}</b>
        <span className="mc-card__foot"><span className="mc-channels">{item.channels.map((channel) => <ChannelIcon key={channel} channel={channel} size={12} />)}</span><StatusPill status={item.status} /></span>
      </span>
    </Link>
  );
}

function MonthChip({ item }: { item: PipelineItem }) {
  const { date } = useI18n();
  return (
    <Link to={`/content/${item.id}`} className="mc-chip" data-tone={tone(item.status)} title={item.title}>
      <Thumb item={item} size="sm" />
      <span className="mc-chip__time u-tnum">{item.scheduledAt ? date(item.scheduledAt, 'time') : ''}</span>
      <span className="u-truncate" dir="auto">{item.title}</span>
    </Link>
  );
}
