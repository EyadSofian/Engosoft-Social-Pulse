import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { CalendarClock, ChevronLeft, ChevronRight, Columns3, Copy, ExternalLink, Image as ImageIcon, LayoutGrid, List, Pause, Pencil, Plus, Rows3, Search, Sparkles, X, Zap } from 'lucide-react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { Link, useQueryState, useRouter } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { useToast } from '../../components/feedback/Toast';
import { Button } from '../../components/ui/Button';
import type { ContentStatus } from '../../domain/content';
import { CHANNELS } from '../../domain/shared';
import type { CalendarPostRecord } from '../../domain/calendar-post';
import { useAuth } from '../../features/auth/AuthProvider';
import { planSlots, type Slot } from '../../features/content-pipeline/slots';
import type { Channel, PipelineItem } from '../../features/content-pipeline/types';
import { usePipeline } from '../../features/content-pipeline/usePipeline';
import { useCreateContent } from '../../features/content/CreateContent';
import { calendarStatusLabel, duplicateCalendarPost, pauseCalendarPost, type CalendarBoard } from '../../features/publishing/CalendarPosts';
import { platformOf, usePublishingBoard } from '../../features/publishing/PublishDialog';
import { useClock } from '../../features/workspace/hooks';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { monthCells, weekCells, type DayCell } from '../../lib/calendar';
import { businessZone, parseTimestamp } from '../../lib/format';
import { occasionsFor } from '../../lib/occasions';

type View = 'month' | 'week' | 'list';
/** How posts of one day sit: under each other, or side by side. */
type Layout = 'stack' | 'row';
/** What a post's card says about it, from its pipeline status and, for calendar posts, its publishing outcome. */
type Tone = 'draft' | 'review' | 'changes' | 'ready' | 'scheduled' | 'publishing' | 'published' | 'attention';
type Filter = 'all' | 'draft' | 'scheduled' | 'published' | 'attention';
interface OdooEntry { id: string; title: string; startsAt: string }
interface Entry { item: PipelineItem; record?: CalendarPostRecord; at: string; tone: Tone }

const TONE_LABEL: Record<Tone, [string, string]> = {
  draft: ['Draft', 'مسودة'], review: ['With the publisher', 'عند المسؤول عن النشر'], changes: ['Changes requested', 'مطلوب تعديل'],
  ready: ['Ready to publish', 'جاهز للنشر'], scheduled: ['Scheduled', 'مجدول'], publishing: ['Publishing', 'جارٍ النشر'],
  published: ['Published', 'منشور'], attention: ['Needs attention', 'يحتاج مراجعة'],
};
const FILTERS: { id: Filter; en: string; ar: string; tones: Tone[] }[] = [
  { id: 'all', en: 'All', ar: 'الكل', tones: [] },
  { id: 'draft', en: 'Drafts', ar: 'مسودات', tones: ['draft', 'review', 'changes', 'ready'] },
  { id: 'scheduled', en: 'Scheduled', ar: 'مجدول', tones: ['scheduled', 'publishing'] },
  { id: 'published', en: 'Published', ar: 'منشور', tones: ['published'] },
  { id: 'attention', en: 'Needs attention', ar: 'يحتاج مراجعة', tones: ['attention', 'changes'] },
];
const PIPELINE_TONE: Record<ContentStatus, Tone> = {
  idea: 'draft', draft: 'draft', in_production: 'draft', ready_for_review: 'review', changes_requested: 'changes',
  approved: 'ready', scheduled: 'scheduled', published: 'published', archived: 'published', cancelled: 'draft',
};
const toneOf = (item: PipelineItem, record?: CalendarPostRecord): Tone => {
  if (record?.status === 'failed' || record?.status === 'blocked') return 'attention';
  if (record?.status === 'publishing' || record?.status === 'partial') return record.status === 'partial' ? 'attention' : 'publishing';
  return PIPELINE_TONE[item.status];
};
/** The day a post sits on: its publish time, its planned day, or when it went out. */
const whenOf = (item: PipelineItem) => item.scheduledAt ?? item.plannedFor ?? (item.status === 'published' ? item.published?.[0]?.publishedAt ?? null : null);
const zone = () => businessZone();
const dayOf = (iso: string) => DateTime.fromMillis(parseTimestamp(iso), { zone: zone() }).toISODate() ?? '';
const LAYOUT_KEY = 'calendar-layout';

/**
 * The publishing calendar: every post on its day, as month, week or list, with the posts of a day under each other
 * or side by side. A post can be dragged to another day; a day's + adds a post there. Filters stay in the address.
 */
export function PostCalendar({ board, nativeAllowed, onChanged }: { board: CalendarBoard | null; nativeAllowed: boolean; onChanged: () => void }) {
  const { t, date } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const create = useCreateContent();
  const now = useClock();
  const [query, setQuery] = useQueryState();
  const { items, error, reload } = usePipeline();
  const { board: publishing } = usePublishingBoard();
  const { store } = useLiveData();
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const [dragged, setDragged] = useState<Entry | null>(null);
  const [odoo, setOdoo] = useState<OdooEntry[]>([]);
  const [storedLayout, setStoredLayout] = useState<Layout>(() => { try { return localStorage.getItem(LAYOUT_KEY) === 'row' ? 'row' : 'stack'; } catch { return 'stack'; } });
  useEffect(() => {
    let alive = true;
    void fetch('/api/odoo/schedule').then((r) => r.json()).then((result) => { if (alive) setOdoo(Array.isArray(result.events) ? result.events : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const view: View = query.get('mode') === 'month' ? 'month' : query.get('mode') === 'list' ? 'list' : 'week';
  const layout: Layout = query.get('layout') === 'row' ? 'row' : query.get('layout') === 'stack' ? 'stack' : storedLayout;
  const setLayout = (next: Layout) => { setStoredLayout(next); try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* a convenience only */ } setQuery({ layout: next }); };
  const filter = FILTERS.find((f) => f.id === query.get('s')) ?? FILTERS[0];
  const platforms = new Set((query.get('p') ?? '').split(',').filter(Boolean) as Channel[]);
  const showInfo = query.get('info') !== 'off';
  const today = DateTime.fromMillis(now, { zone: zone() }).toISODate() ?? '';
  const requested = DateTime.fromISO(query.get('date') ?? today, { zone: zone() });
  const cursor = requested.isValid ? requested : DateTime.fromISO(today, { zone: zone() });
  const cells: DayCell[] = view === 'week' ? weekCells(cursor) : monthCells(cursor);
  const range = view === 'week' ? `${date(cells[0].key, 'dayShort')} – ${date(cells[6].key, 'dayShort')}` : date(cursor.toISODate() ?? '', 'month');
  const step = (delta: number) => setQuery({ date: (view === 'week' ? cursor.plus({ weeks: delta }) : cursor.plus({ months: delta })).toISODate() });

  const records = useMemo(() => new Map((board?.posts ?? []).map((post) => [post.contentId, post])), [board]);
  const auto = useMemo(() => new Set((publishing?.queue ?? []).filter((row) => row.state === 'queued' || row.state === 'sending').map((row) => row.contentId)), [publishing]);
  const entries = useMemo(() => (items ?? []).filter((item) => !['archived', 'cancelled'].includes(item.status)).map((item): Entry => {
    const record = records.get(item.id);
    return { item, record, at: whenOf(item) ?? '', tone: toneOf(item, record) };
  }).filter((entry) => (!filter.tones.length || filter.tones.includes(entry.tone))
    && (!platforms.size || entry.item.channels.some((channel) => platforms.has(channel)))
    && (!search.trim() || `${entry.item.title} ${Object.values(entry.item.captions).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [items, records, query, search]);
  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) if (entry.at) map.set(dayOf(entry.at), [...(map.get(dayOf(entry.at)) ?? []), entry]);
    for (const list of map.values()) list.sort((a, b) => a.at.localeCompare(b.at));
    return map;
  }, [entries]);
  const unscheduled = entries.filter((entry) => !entry.at && entry.item.status !== 'published');
  const slots = useMemo(() => {
    const map = new Map<string, Slot[]>();
    if (store.phase !== 'ready') return map;
    for (const slot of planSlots(store.data.plans)) map.set(dayOf(slot.scheduledAt), [...(map.get(dayOf(slot.scheduledAt)) ?? []), slot]);
    return map;
  }, [store]);
  const occasions = useMemo(() => (showInfo ? occasionsFor(cells.map((cell) => cell.key)) : new Map()), [cells.map((c) => c.key).join(','), showInfo]);
  const sessions = useMemo(() => {
    const map = new Map<string, OdooEntry[]>();
    if (showInfo) for (const entry of odoo) map.set(dayOf(entry.startsAt), [...(map.get(dayOf(entry.startsAt)) ?? []), entry]);
    return map;
  }, [odoo, showInfo]);
  const tags = (key: string) => [...(occasions.get(key) ?? []).map((o: { key: string; name: string }) => ({ id: o.key, label: o.name, kind: 'occasion' })), ...(sessions.get(key) ?? []).map((s) => ({ id: `odoo-${s.id}`, label: s.title, kind: 'course' }))];

  const canAdd = can('content.create');
  const addOn = (day: string) => {
    if (nativeAllowed) setQuery({ calendarPost: 'new', postDay: day });
    else create.open({ plannedFor: DateTime.fromISO(`${day}T10:00`, { zone: zone() }).toUTC().toISO() ?? undefined });
  };
  const { navigate } = useRouter();
  const openEntry = (entry: Entry) => {
    if (entry.record?.editable && entry.record.origin === 'dashboard') setQuery({ calendarPost: entry.record.id });
    else navigate(`/content/${entry.item.id}`);
  };
  const changed = () => { void reload(); onChanged(); };

  /** Moves a post to another day at the same time of day, through the path its kind already uses. */
  const moveTo = async (entry: Entry, day: string) => {
    if (dayOf(entry.at) === day) return;
    if (day < today) { toast.error(t('That day has passed', 'اليوم ده عدّى'), t('Move it to today or later.', 'انقله لنهارده أو بعد كده.')); return; }
    const time = entry.at ? DateTime.fromMillis(parseTimestamp(entry.at), { zone: zone() }).toFormat('HH:mm') : '10:00';
    const at = DateTime.fromISO(`${day}T${time}`, { zone: zone() });
    try {
      if (entry.record?.origin === 'dashboard') {
        const record = entry.record;
        await api(`/api/calendar-posts/${record.id}`, { method: 'PUT', body: { input: { ...record.input, date: day, time, timezone: zone() }, schedule: record.status === 'scheduled', version: record.version, consent: true } });
      } else if (entry.item.status === 'scheduled') {
        await api(`/api/content/${entry.item.id}/transition`, { body: { to: 'scheduled', scheduledAt: at.toUTC().toISO() } });
      } else {
        await api(`/api/content/${entry.item.id}`, { method: 'PATCH', body: { plannedFor: at.toUTC().toISO() } });
      }
      toast.success(t('Moved', 'اتنقل'), `${entry.item.title} → ${date(day, 'weekdayDate')}`);
      changed();
    } catch (reason) { toast.error(t('Could not move it', 'تعذّر النقل'), errorMessage(reason, '')); }
  };
  const movable = (entry: Entry) => entry.item.status !== 'published' && entry.tone !== 'publishing' && (entry.record ? entry.record.editable : entry.item.status === 'scheduled' ? can('content.schedule') : entry.item.editable || can('content.schedule'));

  const dayProps = (key: string) => ({
    onDragOver: (event: DragEvent) => { if (dragged && key >= today) { event.preventDefault(); event.currentTarget.setAttribute('data-drop', ''); } },
    onDragLeave: (event: DragEvent) => event.currentTarget.removeAttribute('data-drop'),
    onDrop: (event: DragEvent) => { event.preventDefault(); event.currentTarget.removeAttribute('data-drop'); if (dragged) void moveTo(dragged, key); setDragged(null); },
  });
  const card = (entry: Entry, size: 'chip' | 'card' | 'tile') => <PostCard key={entry.item.id} entry={entry} size={size} auto={auto.has(entry.item.id)}
    draggable={movable(entry)} onDragStart={() => setDragged(entry)} onDragEnd={() => setDragged(null)} onOpen={() => openEntry(entry)} />;
  const slotChip = (slot: Slot) => <button key={slot.id} type="button" className="pc-slot" title={slot.title}
    onClick={() => create.open({ title: slot.title, caption: slot.caption, slotId: slot.id, goal: slot.goal, plannedFor: slot.scheduledAt, channels: slot.platforms })}>
    <span className="pc-slot__icons">{slot.platforms.slice(0, 3).map((p) => <ChannelIcon key={p} channel={p} size={11} />)}</span><span className="u-truncate" dir="auto">{slot.title}</span>
  </button>;
  const addButton = (key: string, label?: boolean) => canAdd && key >= today
    ? <button type="button" className="pc-add" data-label={label || undefined} onClick={() => addOn(key)} aria-label={t(`Add a post on ${date(key, 'weekdayDate')}`, `أضف منشور يوم ${date(key, 'weekdayDate')}`)}><Plus size={14} />{label && <span>{t('Add', 'أضف')}</span>}</button>
    : null;

  const visibleCount = cells.reduce((sum, cell) => sum + (byDay.get(cell.key)?.length ?? 0), 0);
  const listDays = view === 'list' ? [...byDay.keys()].filter((key) => key >= cells[0].key && key <= cells[cells.length - 1].key).sort() : [];

  return <div className="pc">
    <div className="pc-toolbar">
      <div className="pc-toolbar__group">
        <Button size="sm" variant="secondary" onClick={() => setQuery({ date: null })}>{t('Today', 'النهارده')}</Button>
        <div className="pc-step">
          <button type="button" onClick={() => step(-1)} aria-label={t('Previous', 'السابق')}><ChevronLeft size={17} className="u-flip" /></button>
          <b className="u-tnum">{range}</b>
          <button type="button" onClick={() => step(1)} aria-label={t('Next', 'التالي')}><ChevronRight size={17} className="u-flip" /></button>
        </div>
      </div>
      <div className="pc-toolbar__group">
        <Segmented label={t('View', 'العرض')} value={view} onChange={(v) => setQuery({ mode: v === 'week' ? null : v })} options={[
          { value: 'month', label: t('Month', 'شهر'), icon: <LayoutGrid size={14} /> },
          { value: 'week', label: t('Week', 'أسبوع'), icon: <Columns3 size={14} /> },
          { value: 'list', label: t('List', 'قائمة'), icon: <List size={14} /> },
        ]} />
        <Segmented label={t('Posts of a day', 'منشورات اليوم')} value={layout} onChange={setLayout} options={[
          { value: 'stack', label: t('Under each other', 'تحت بعض'), icon: <Rows3 size={14} /> },
          { value: 'row', label: t('Side by side', 'جنب بعض'), icon: <Columns3 size={14} className="pc-rot" /> },
        ]} />
      </div>
    </div>

    <div className="pc-filters">
      <div className="pc-chips" role="group" aria-label={t('Status', 'الحالة')}>
        {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter.id === f.id} onClick={() => setQuery({ s: f.id === 'all' ? null : f.id })}>{t(f.en, f.ar)}</button>)}
      </div>
      <div className="pc-platforms" role="group" aria-label={t('Platforms', 'المنصات')}>
        {CHANNELS.map((channel) => <button key={channel} type="button" aria-pressed={platforms.has(channel)} title={platformOf(channel).name} aria-label={platformOf(channel).name}
          onClick={() => { const next = new Set(platforms); if (next.has(channel)) next.delete(channel); else next.add(channel); setQuery({ p: [...next].join(',') || null }); }}><ChannelIcon channel={channel} size={14} /></button>)}
      </div>
      <span className="u-grow" />
      <button type="button" className="pc-toggle" aria-pressed={showInfo} onClick={() => setQuery({ info: showInfo ? 'off' : null })}><Sparkles size={13} /> {t('Courses & occasions', 'الدورات والمناسبات')}</button>
      <button type="button" className="pc-toggle" aria-pressed={unscheduledOpen} onClick={() => setUnscheduledOpen(!unscheduledOpen)}><CalendarClock size={13} /> {t('No date', 'من غير ميعاد')} <i className="u-tnum">{unscheduled.length}</i></button>
      {searching || search
        ? <label className="pc-search"><Search size={14} /><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search posts', 'دوّر في المنشورات')} aria-label={t('Search posts', 'دوّر في المنشورات')} /><button type="button" onClick={() => { setSearch(''); setSearching(false); }} aria-label={t('Clear', 'امسح')}><X size={13} /></button></label>
        : <button type="button" className="pc-toggle" onClick={() => setSearching(true)} aria-label={t('Search posts', 'دوّر في المنشورات')}><Search size={14} /></button>}
    </div>

    {error && <p role="alert" className="creative-home__error">{error}</p>}

    {unscheduledOpen && <section className="pc-unscheduled" aria-label={t('Posts with no date', 'منشورات من غير ميعاد')}>
      {unscheduled.length ? <div className="pc-strip">{unscheduled.map((entry) => card(entry, 'tile'))}</div> : <p className="u-sm u-muted">{t('Every post has a day.', 'كل المنشورات ليها يوم.')}</p>}
      <p className="u-xs u-muted">{t('Drag a post onto a day to give it that day.', 'اسحب المنشور على يوم علشان يتحط فيه.')}</p>
    </section>}

    {!items && !error ? <div className="pc-loading" aria-busy="true">{t('Loading the calendar…', 'بنحمّل الكالندر…')}</div>
      : view === 'list' ? <div className="pc-list" data-layout={layout}>
        {listDays.map((key) => <section key={key} className="pc-list__day" {...dayProps(key)}>
          <header><h3>{date(key, 'weekdayDate')}</h3>{key === today && <span className="pc-today">{t('Today', 'النهارده')}</span>}<span className="u-grow" />{addButton(key, true)}</header>
          <div className="pc-list__posts">{(byDay.get(key) ?? []).map((entry) => layout === 'row' ? card(entry, 'tile') : <ListRow key={entry.item.id} entry={entry} auto={auto.has(entry.item.id)} onOpen={() => openEntry(entry)} onChanged={changed} />)}</div>
        </section>)}
        {!listDays.length && <Empty onAdd={canAdd ? () => addOn(today) : undefined} />}
      </div>
      : view === 'week' && layout === 'row' ? <div className="pc-rows">
        {cells.map((cell) => <section key={cell.key} className="pc-rows__day" data-today={cell.key === today || undefined} data-past={cell.key < today || undefined} data-empty={!(byDay.get(cell.key)?.length) || undefined} {...dayProps(cell.key)}>
          <header><span>{date(cell.key, 'weekday')}</span><b className="u-tnum">{cell.date.day}</b>{tags(cell.key).slice(0, 2).map((tag) => <Tag key={tag.id} {...tag} />)}</header>
          <div className="pc-rows__posts">
            {(byDay.get(cell.key) ?? []).map((entry) => card(entry, 'tile'))}
            {(slots.get(cell.key) ?? []).map(slotChip)}
            {addButton(cell.key, !(byDay.get(cell.key)?.length))}
          </div>
        </section>)}
      </div>
      : <div className={`pc-grid pc-grid--${view}`} data-layout={layout} role="grid" aria-label={range}>
        <div className="pc-grid__head" role="row">{cells.slice(0, 7).map((cell) => <span key={cell.key} role="columnheader">{date(cell.key, 'weekday')}{view === 'week' && <b className="u-tnum" data-today={cell.key === today || undefined}>{cell.date.day}</b>}</span>)}</div>
        <div className="pc-grid__body">
          {cells.map((cell) => {
            const posts = byDay.get(cell.key) ?? [];
            const limit = view === 'month' ? (layout === 'row' ? 6 : 3) : posts.length;
            return <div key={cell.key} role="gridcell" className="pc-day" data-today={cell.key === today || undefined} data-past={cell.key < today || undefined} data-out={(view === 'month' && !cell.inMonth) || undefined} {...dayProps(cell.key)}>
              {view === 'month' && <span className="pc-day__num u-tnum" data-today={cell.key === today || undefined}>{cell.date.day}</span>}
              {tags(cell.key).slice(0, view === 'week' ? 3 : 1).map((tag) => <Tag key={tag.id} {...tag} />)}
              <div className="pc-day__posts" data-layout={view === 'month' ? layout : 'stack'}>
                {posts.slice(0, limit).map((entry) => card(entry, view === 'month' ? (layout === 'row' ? 'tile' : 'chip') : 'card'))}
              </div>
              {(slots.get(cell.key) ?? []).slice(0, view === 'week' ? 6 : 1).map(slotChip)}
              {posts.length > limit && <button type="button" className="pc-more" onClick={() => setQuery({ mode: null, date: cell.key })}>{t(`+${posts.length - limit} more`, `+${posts.length - limit} كمان`)}</button>}
              {addButton(cell.key)}
            </div>;
          })}
        </div>
      </div>}

    <footer className="pc-foot">
      <span className="u-tnum">{t(`${visibleCount} posts in view`, `${visibleCount} منشور في العرض ده`)}</span>
      <span className="pc-legend">{(['draft', 'review', 'scheduled', 'published', 'attention'] as Tone[]).map((tone) => <span key={tone} data-tone={tone}>{t(...TONE_LABEL[tone])}</span>)}</span>
    </footer>
  </div>;
}

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: { value: T; label: string; icon: ReactNode }[] }) {
  return <div className="pc-seg" role="radiogroup" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>{option.icon}<span>{option.label}</span></button>)}
  </div>;
}

function Tag({ label, kind }: { id: string; label: string; kind: string }) {
  return <span className="pc-tag" data-kind={kind} title={label} dir="auto"><span className="u-truncate">{label}</span></span>;
}

/** The post's design; a calendar post not scheduled yet shows the first uploaded or Drive image instead. */
function Thumb({ item, preview }: { item: PipelineItem; preview?: string | null }) {
  const url = item.creative?.imageUrl || preview;
  return url ? <img className="pc-thumb" src={url} alt="" loading="lazy" draggable={false} /> : <span className="pc-thumb pc-thumb--empty"><ImageIcon size={16} /></span>;
}

/** One post: a chip in a month cell, a card in a week column, a tile when posts sit side by side. */
function PostCard({ entry, size, auto, draggable, onDragStart, onDragEnd, onOpen }: { entry: Entry; size: 'chip' | 'card' | 'tile'; auto: boolean; draggable: boolean; onDragStart: () => void; onDragEnd: () => void; onOpen: () => void }) {
  const { t, date } = useI18n();
  const { item } = entry;
  const time = item.scheduledAt ? date(item.scheduledAt, 'time') : item.plannedFor ? t('Planned', 'مستهدف') : '';
  return <button type="button" className={`pc-post pc-post--${size}`} data-tone={entry.tone} data-id={item.id} draggable={draggable}
    onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; onDragStart(); }} onDragEnd={onDragEnd} onClick={onOpen}
    title={`${item.title} · ${t(...TONE_LABEL[entry.tone])}`}>
    <Thumb item={item} preview={entry.record?.preview} />
    <span className="pc-post__body">
      <span className="pc-post__meta"><i className="pc-dot" aria-hidden />{time && <span className="u-tnum">{time}</span>}{auto && <Zap size={11} className="pc-auto" aria-label={t('Publishes automatically', 'بيتنشر لوحده')} />}</span>
      <b dir="auto">{item.title}</b>
      {size !== 'chip' && <span className="pc-post__foot"><span className="pc-icons">{item.channels.slice(0, 5).map((channel) => <ChannelIcon key={channel} channel={channel} size={12} />)}</span><span className="pc-status">{t(...TONE_LABEL[entry.tone])}</span></span>}
    </span>
  </button>;
}

/** A list row: the post, its platforms and results, and what can be done with it from here. */
function ListRow({ entry, auto, onOpen, onChanged }: { entry: Entry; auto: boolean; onOpen: () => void; onChanged: () => void }) {
  const { t, date } = useI18n();
  const toast = useToast();
  const [, setQuery] = useQueryState();
  const [busy, setBusy] = useState('');
  const { item, record } = entry;
  const caption = Object.values(item.captions).find((value) => value?.trim()) ?? record?.input.caption ?? '';
  const run = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try { await work(); toast.success(done); onChanged(); } catch (reason) { toast.error(t('That did not work', 'ما نفعش'), errorMessage(reason, '')); }
    setBusy('');
  };
  return <article className="pc-row" data-tone={entry.tone}>
    <button type="button" className="pc-row__open" onClick={onOpen}><Thumb item={item} preview={record?.preview} /></button>
    <div className="pc-row__body">
      <div className="pc-row__top">
        <span className="pc-row__time u-tnum">{item.scheduledAt ? date(item.scheduledAt, 'time') : t('Planned', 'مستهدف')}</span>
        <span className="pc-status" data-tone={entry.tone}><i className="pc-dot" aria-hidden />{record && ['published', 'partial', 'failed', 'blocked', 'publishing'].includes(record.status) ? calendarStatusLabel(record.status, t) : t(...TONE_LABEL[entry.tone])}</span>
        {auto && <span className="pc-row__auto"><Zap size={12} /> {t('Automatic', 'تلقائي')}</span>}
      </div>
      <button type="button" className="pc-row__title" onClick={onOpen} dir="auto">{item.title}</button>
      {caption && <p className="pc-row__caption" dir="auto">{caption}</p>}
      {record?.errors && <p className="pc-row__error" dir="auto">{record.errors}</p>}
      <div className="pc-row__platforms">{item.channels.map((channel) => {
        const job = record?.jobs.find((j) => j.provider === channel);
        return job?.url ? <a key={channel} href={job.url.startsWith('/') && channel === 'facebook' ? `https://www.facebook.com${job.url}` : job.url} target="_blank" rel="noreferrer" data-state={job.state}><ChannelIcon channel={channel} size={14} /><ExternalLink size={10} /></a>
          : <span key={channel} data-state={job?.state}><ChannelIcon channel={channel} size={14} /></span>;
      })}</div>
    </div>
    <div className="pc-row__actions">
      <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={onOpen}>{record?.editable && record.origin === 'dashboard' ? t('Edit', 'تعديل') : t('Open', 'افتح')}</Button>
      {record && <Button size="sm" variant="ghost" icon={<Copy size={13} />} busy={busy === 'copy'} onClick={() => void run('copy', () => duplicateCalendarPost(record, setQuery), t('Copied as a new draft', 'اتنسخ كمسودة جديدة'))}>{t('Duplicate', 'نسخ')}</Button>}
      {record?.origin === 'dashboard' && record.status === 'scheduled' && <Button size="sm" variant="ghost" icon={<Pause size={13} />} busy={busy === 'pause'} onClick={() => void run('pause', () => pauseCalendarPost(record), t('Schedule paused', 'اتوقفت الجدولة'))}>{t('Pause', 'إيقاف')}</Button>}
      <Link className="pc-row__log" to={`/content/${item.id}`}>{t('Log', 'السجل')}</Link>
    </div>
  </article>;
}

function Empty({ onAdd }: { onAdd?: () => void }) {
  const { t } = useI18n();
  return <div className="pc-empty"><CalendarClock size={28} /><b>{t('Nothing in this period yet', 'مفيش منشورات في الفترة دي لسه')}</b>
    <p>{t('Add a post and it lands on its day.', 'أضف منشور وهيظهر في يومه.')}</p>
    {onAdd && <Button variant="primary" icon={<Plus size={15} />} onClick={onAdd}>{t('Add a post', 'أضف منشور')}</Button>}
  </div>;
}
