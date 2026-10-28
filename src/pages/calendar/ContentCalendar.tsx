import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Image as ImageIcon, Plus, Search, Send, Sparkles, Zap } from 'lucide-react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { Dialog } from '../../components/overlay/Overlay';
import { CHANNELS } from '../../domain/shared';
import { platformOf, PublishDialog, usePublishingBoard } from '../../features/publishing/PublishDialog';
import { GoalBadge } from '../../features/content-pipeline/PostPlan';
import { GOAL_INFO } from '../../domain/goals';
import { planSlots, type Slot } from '../../features/content-pipeline/slots';
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
/** Posts that will publish themselves (Facebook / Instagram queue), marked on every card. */
const AutoPublish = createContext<Set<string>>(new Set());
/** Opens the schedule-a-post picker for a day; null when the person cannot schedule. */
const AddToDay = createContext<((day: string) => void) | null>(null);
const OpenSlot = createContext<(slot: Slot) => void>(() => {});
/** Where a post sits on the grid: its publish time, or the day it is planned for until then. */
const dayTime = (item: PipelineItem) => item.scheduledAt ?? item.plannedFor;

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
  const { items, error, reload } = usePipeline();
  const { board, reload: reloadBoard } = usePublishingBoard();
  const { store } = useLiveData();
  const [picking, setPicking] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<{ item: PipelineItem; day?: string } | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const auto = useMemo(() => new Set((board?.queue ?? []).filter((row) => row.state === 'queued' || row.state === 'sending').map((row) => row.contentId)), [board]);
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
      const when = dayTime(item);
      if (!when) continue;
      const key = dayOf(when);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    for (const list of map.values()) list.sort((a, b) => dayTime(a)!.localeCompare(dayTime(b)!));
    return map;
  }, [visible]);
  const unscheduled = useMemo(() => visible.filter((item) => !dayTime(item) && item.status !== 'published' && item.status !== 'idea')
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)), [visible]);

  const occasions = useMemo(() => (layers.has('info') ? occasionsFor(cells.map((cell) => cell.key)) : new Map<string, Occasion[]>()), [cells.map((c) => c.key).join(','), query]);
  const sessions = useMemo(() => {
    const map = new Map<string, OdooScheduleEntry[]>();
    if (layers.has('info')) for (const entry of odoo) { const key = dayOf(entry.startsAt); map.set(key, [...(map.get(key) ?? []), entry]); }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odoo, query]);
  // Imported calendar plans that no post is linked to yet: planned, but nobody has made them.
  const planned = useMemo(() => {
    const map = new Map<string, Slot[]>();
    if (store.phase !== 'ready') return map;
    for (const slot of planSlots(store.data.plans)) {
      if (platforms.size && !slot.platforms.some((platform) => platforms.has(platform))) continue;
      const key = dayOf(slot.scheduledAt);
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, query]);
  const ready = (items ?? []).filter((item) => item.status === 'approved');
  const canAdd = can('content.schedule');
  const published = () => { void reload(); void reloadBoard(); };

  const rangeStart = cells[0].key;
  const rangeEnd = cells[cells.length - 1].key;
  const rangeDays = [...byDay.keys()].filter((key) => key >= rangeStart && key <= rangeEnd).sort();
  const scheduledCount = rangeDays.reduce((sum, key) => sum + byDay.get(key)!.length, 0);
  const days = mode === 'list' ? rangeDays : [];

  return (
    <OpenSlot.Provider value={setSlot}>
    <AutoPublish.Provider value={auto}>
    <AddToDay.Provider value={canAdd ? setPicking : null}>
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
          {CHANNELS.map((channel) => <button key={channel} type="button" aria-label={platformOf(channel).name} aria-pressed={platforms.has(channel)} onClick={() => togglePlatform(channel)} title={platformOf(channel).name}><ChannelIcon channel={channel} size={15} /></button>)}
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
                {cells.map((cell) => <DayColumn key={cell.key} cell={cell} mode={mode} today={cell.key === today} past={cell.key < today} posts={byDay.get(cell.key) ?? []} occasions={occasions.get(cell.key) ?? []} sessions={sessions.get(cell.key) ?? []} planned={planned.get(cell.key) ?? []} />)}
              </div>
            </div>
          )}
        </div>

        {showRail && <aside className="mc-rail glass" aria-label={t('Waiting for a date', 'بانتظار موعد')}>
          <h3><CalendarClock size={15} /> {t('Not scheduled yet', 'غير مجدولة بعد')} <i className="u-tnum">{unscheduled.length}</i></h3>
          <p className="u-xs u-muted">{t('Approved posts come first and can be scheduled from here.', 'المعتمدة أولًا ويمكن جدولتها من هنا.')}</p>
          <ul>
            {unscheduled.slice(0, 14).map((item) => <li key={item.id}><PostRow item={item} compact />{canAdd && item.status === 'approved' && <button type="button" className="mc-schedule" onClick={() => setPublishing({ item })}><Send size={13} /> {t('Schedule', 'جدولة')}</button>}</li>)}
            {unscheduled.length === 0 && <li className="mc-rail__empty">{t('Everything has a date.', 'كل المنشورات لها موعد.')}</li>}
          </ul>
        </aside>}
      </div>
      <div className="mc-legend"><span data-tone="neutral">{t('Draft', 'مسودة')}</span><span data-tone="brand">{t('In review / scheduled', 'للمراجعة / مجدول')}</span><span data-tone="success">{t('Approved / published', 'معتمد / منشور')}</span><span data-tone="warning">{t('Changes requested', 'مطلوب تعديل')}</span><span className="mc-legend__auto"><Zap size={11} /> {t('Publishes automatically', 'يُنشر تلقائيًا')}</span><span className="mc-legend__plan">{t('Planned, not made yet: press to make it', 'مخطط ولم يُصمَّم: اضغط لعمله')}</span><small>{zone()}</small></div>

      <Dialog open={picking !== null} onClose={() => setPicking(null)} title={t('Schedule a post', 'جدولة منشور')} description={picking ? date(picking, 'weekdayDate') : undefined}>
        {ready.length ? <ul className="mc-pick">{ready.map((item) => <li key={item.id}><button type="button" onClick={() => { setPublishing({ item, day: picking ?? undefined }); setPicking(null); }}>
          <Thumb item={item} size="md" /><span className="u-grow"><b dir="auto">{item.title}</b><span className="mc-channels">{item.channels.map((channel) => <ChannelIcon key={channel} channel={channel} size={12} />)}</span></span><Send size={15} />
        </button></li>)}</ul> : <div className="u-stack">
          <p className="u-sm u-muted">{t('No approved post is waiting for a date. Posts appear here after approval.', 'لا يوجد منشور معتمد ينتظر موعدًا. تظهر المنشورات هنا بعد اعتمادها.')}</p>
          {can('content.create') && <div><Button variant="primary" icon={<Plus size={15} />} onClick={() => { setPicking(null); create.open(); }}>{t('Create a post', 'أنشئ منشورًا')}</Button></div>}
        </div>}
      </Dialog>
      {publishing && <PublishDialog item={publishing.item} day={publishing.day} open onClose={() => setPublishing(null)} onDone={published} />}
      <Dialog open={slot !== null} onClose={() => setSlot(null)} title={t('Planned, not made yet', 'مخطط ولم يُصمَّم بعد')} description={slot ? <span dir="auto">{slot.title}</span> : undefined}
        footer={slot && <>
          {can('content.schedule') && <Button variant="ghost" onClick={async () => { const ids = slot.ids; setSlot(null); for (const id of ids) await store.deletePlan(id).catch(() => {}); void store.reload(); }}>{t('Remove from the plan', 'احذف من الخطة')}</Button>}
          {can('content.create') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => { const s = slot; setSlot(null); create.open({ title: s.title, caption: s.caption, slotId: s.id, goal: s.goal, plannedFor: s.scheduledAt, channels: s.platforms }); }}>{t('Make this post', 'اعمل المنشور')}</Button>}
        </>}>
        {slot && <dl className="post-plan__facts">
          <div><dt>{t('Day', 'اليوم')}</dt><dd>{date(slot.scheduledAt, 'weekdayDate')} · {date(slot.scheduledAt, 'time')}</dd></div>
          <div><dt>{t('Platforms', 'المنصات')}</dt><dd>{slot.platforms.map((platform) => <span key={platform} className="post-plan__when"><ChannelIcon channel={platform} size={15} /> {platformOf(platform).name}</span>)}</dd></div>
          <div><dt>{t('Goal', 'الهدف')}</dt><dd>{slot.goal ? <GoalBadge goal={slot.goal} /> : <span className="u-muted">{t('Not set in the plan', 'غير محدد في الخطة')}</span>}</dd></div>
          {slot.caption && <div><dt>{t('Notes', 'النص')}</dt><dd dir="auto">{slot.caption}</dd></div>}
        </dl>}
      </Dialog>
    </div>
    </AddToDay.Provider>
    </AutoPublish.Provider>
    </OpenSlot.Provider>
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

/** A post shown on its planned day, before anyone has given it a publish time. */
function PlannedTag() {
  const { t } = useI18n();
  return <span className="mc-planned">{t('Planned', 'مستهدف')}</span>;
}

function AutoMark({ item }: { item: PipelineItem }) {
  const { t } = useI18n();
  return useContext(AutoPublish).has(item.id) ? <Zap size={11} className="mc-auto" aria-label={t('Publishes automatically', 'يُنشر تلقائيًا')} /> : null;
}

function PostRow({ item, compact }: { item: PipelineItem; compact?: boolean }) {
  const { date } = useI18n();
  return (
    <Link to={`/content/${item.id}`} className="mc-row" data-tone={tone(item.status)} data-compact={compact || undefined}>
      <Thumb item={item} size="md" />
      <span className="mc-row__body">
        <b dir="auto">{item.title}</b>
        <span className="mc-row__meta">
          {item.scheduledAt ? <span className="u-tnum">{date(item.scheduledAt, 'time')}</span> : item.plannedFor ? <PlannedTag /> : null}
          {item.goal && <GoalBadge goal={item.goal} />}
          <AutoMark item={item} />
          <span className="mc-channels">{item.channels.map((channel) => <ChannelIcon key={channel} channel={channel} size={12} />)}</span>
        </span>
      </span>
      <StatusPill status={item.status} />
    </Link>
  );
}

function DayColumn({ cell, mode, today, past, posts, occasions, sessions, planned }: { cell: DayCell; mode: Mode; today: boolean; past: boolean; posts: PipelineItem[]; occasions: Occasion[]; sessions: OdooScheduleEntry[]; planned: Slot[] }) {
  const { t, date, num, tx } = useI18n();
  const [, setQuery] = useQueryState();
  const add = useContext(AddToDay);
  const openSlot = useContext(OpenSlot);
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
      {planned.slice(0, mode === 'week' ? 8 : 2).map((slot) => <button key={slot.id} type="button" className="mc-slot" data-goal={slot.goal ?? undefined} onClick={() => openSlot(slot)} title={`${slot.title}${slot.goal ? ` · ${tx(GOAL_INFO[slot.goal].label)}` : ''}`}>
        {slot.platforms.map((platform) => <ChannelIcon key={platform} channel={platform} size={11} />)}<span className="u-truncate" dir="auto">{slot.title}</span>
      </button>)}
      {mode === 'week' && posts.length === 0 && planned.length === 0 && <span className="mc-day__empty">{t('No posts', 'لا توجد منشورات')}</span>}
      {mode === 'week'
        ? posts.slice(0, max).map((item) => <WeekCard key={item.id} item={item} />)
        : <ul className="mc-day__chips">{posts.slice(0, max).map((item) => <li key={item.id}><MonthChip item={item} /></li>)}</ul>}
      {hidden > 0 && <button type="button" className="mc-more" onClick={() => setQuery({ mode: 'week', date: cell.key })}>{t(`+${num(hidden)} more`, `+${num(hidden)} أخرى`)}</button>}
      {add && !past && <button type="button" className="mc-add" onClick={() => add(cell.key)} aria-label={t(`Schedule a post on ${date(cell.key, 'weekdayDate')}`, `جدولة منشور يوم ${date(cell.key, 'weekdayDate')}`)} title={t('Schedule a post on this day', 'جدولة منشور في هذا اليوم')}><Plus size={13} />{mode === 'week' && <span>{t('Schedule', 'جدولة')}</span>}</button>}
    </div>
  );
}

function WeekCard({ item }: { item: PipelineItem }) {
  const { date } = useI18n();
  return (
    <Link to={`/content/${item.id}`} className="mc-card" data-tone={tone(item.status)}>
      <Thumb item={item} size="md" />
      <span className="mc-card__body">
        <span className="mc-card__time u-tnum">{item.scheduledAt ? date(item.scheduledAt, 'time') : <PlannedTag />} <AutoMark item={item} /></span>
        <b dir="auto">{item.title}</b>
        {item.goal && <GoalBadge goal={item.goal} />}
        <span className="mc-card__foot"><span className="mc-channels">{item.channels.map((channel) => <ChannelIcon key={channel} channel={channel} size={12} />)}</span><StatusPill status={item.status} /></span>
      </span>
    </Link>
  );
}

function MonthChip({ item }: { item: PipelineItem }) {
  const { date } = useI18n();
  return (
    <Link to={`/content/${item.id}`} className="mc-chip" data-tone={tone(item.status)} data-planned={!item.scheduledAt || undefined} title={item.title}>
      <Thumb item={item} size="sm" />
      <span className="mc-chip__time u-tnum">{item.scheduledAt ? date(item.scheduledAt, 'time') : ''}</span>
      <AutoMark item={item} />
      <span className="u-truncate" dir="auto">{item.title}</span>
    </Link>
  );
}
