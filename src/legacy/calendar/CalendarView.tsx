import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  CalendarSearch,
  CalendarX2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileWarning,
  FilterX,
  Keyboard,
  LayoutList,
  PanelLeftClose,
  PanelLeftOpen,
  PartyPopper,
  Plus,
  Radio,
  Rows3,
  SquareKanban,
  Upload,
} from 'lucide-react';
import { StatePill, ViewHeader, Reveal } from '../ui/Bits';
import { Button, IconButton, LinkButton } from '../ui/Button';
import { SearchField, Segmented, Select } from '../ui/Controls';
import { Modal } from '../ui/Overlay';
import { PlatformIcon } from '../ui/Platform';
import { useToast } from '../ui/Toast';
import { useApp } from '../context';
import { bestHourByWeekday, bestSlots, planStats, type Slot } from '../../lib/analytics';
import { ApiError, errorMessage } from '../../lib/api';
import { dayCell, monthCells, weekCells } from '../../lib/calendar';
import { downloadText, plansToCsv, plansToIcs } from '../../lib/calendarExport';
import { dateFromKey, dayKeyOf, fmtDay, fmtMonth, fmtTime, fmtWeekdayDate, inZone, num, zoneNow } from '../../lib/format';
import { occasionsFor, upcomingOccasions, type Occasion } from '../../lib/occasions';
import { contentTypeLabel, contentTypes, PLATFORMS, platformColor, platformName, statusLabel } from '../../lib/platforms';
import type { Plan, PlanState, PlanStatus, Platform, Post } from '../../types';
import { AgendaList } from './AgendaList';
import { BoardView } from './BoardView';
import { CalendarSide } from './CalendarSide';
import { MonthGrid } from './MonthGrid';
import { canDrag, HoverCard, PLAN_MIME, type CalendarActions } from './parts';
import { TimeGrid } from './TimeGrid';

type Mode = 'month' | 'week' | 'day' | 'agenda' | 'board';
type StateFilter = 'all' | 'attention' | 'upcoming' | 'published' | 'draft' | 'cancelled';

interface ImportReport {
  imported: number;
  duplicates: number;
  errors: string[];
  failed?: string;
}

interface Prefs {
  mode: Mode;
  observed: boolean;
  occasions: boolean;
  side: boolean;
}

const MODES: Mode[] = ['month', 'week', 'day', 'agenda', 'board'];
const PREFS_KEY = 'social-pulse-calendar';
const GAP_DAYS = 14;

const STATE_FILTERS: { value: StateFilter; label: string; match: (state: PlanState) => boolean }[] = [
  { value: 'all', label: 'كل الحالات', match: () => true },
  { value: 'attention', label: 'تحتاج متابعة', match: (state) => state === 'missed' || state === 'due' },
  { value: 'upcoming', label: 'قادمة', match: (state) => state === 'upcoming' },
  { value: 'published', label: 'منشورة', match: (state) => state === 'published' },
  { value: 'draft', label: 'مسودات', match: (state) => state === 'draft' },
  { value: 'cancelled', label: 'ملغاة', match: (state) => state === 'cancelled' },
];

const SHORTCUTS: [string[], string][] = [
  [['→', '←'], 'الفترة السابقة / التالية'],
  [['T'], 'العودة إلى اليوم'],
  [['N'], 'بوست جديد'],
  [['M', 'W', 'D', 'L', 'B'], 'شهر · أسبوع · يوم · قائمة · لوحة'],
  [['/'], 'البحث في الخطة'],
  [['?'], 'هذه القائمة'],
];

function readPrefs(): Prefs {
  const fallback: Prefs = { mode: 'month', observed: true, occasions: true, side: true };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return {
      mode: MODES.includes(saved.mode as Mode) ? (saved.mode as Mode) : fallback.mode,
      observed: typeof saved.observed === 'boolean' ? saved.observed : fallback.observed,
      occasions: typeof saved.occasions === 'boolean' ? saved.occasions : fallback.occasions,
      side: typeof saved.side === 'boolean' ? saved.side : fallback.side,
    };
  } catch {
    return fallback;
  }
}

function groupByDay<T extends { day: string; ts: number }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.day);
    if (list) list.push(item);
    else map.set(item.day, [item]);
  }
  for (const list of map.values()) list.sort((a, b) => a.ts - b.ts);
  return map;
}

const uniqueSorted = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function CalendarView() {
  const { data, now, todayNum, filters, openPlan, openPost, store } = useApp();
  const toast = useToast();
  const todayKey = dayKeyOf(todayNum);

  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const mode = prefs.mode;
  const [cursorKey, setCursorKey] = useState(todayKey);
  const [selected, setSelected] = useState(todayKey);
  const [direction, setDirection] = useState(0);

  const [query, setQuery] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(() => (filters.platform === 'all' ? [] : [filters.platform]));
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [campaign, setCampaign] = useState('all');
  const [owner, setOwner] = useState('all');

  const [dragging, setDragging] = useState<string | null>(null);
  const [hover, setHover] = useState<{ plan: Plan; anchor: HTMLElement } | null>(null);
  const hoverTimer = useRef(0);

  const [fileDrag, setFileDrag] = useState(0);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const dateInput = useRef<HTMLInputElement | null>(null);
  const searchBox = useRef<HTMLDivElement | null>(null);
  const sidePanel = useRef<HTMLElement | null>(null);
  const exportMenu = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* Preferences simply won't persist. */
    }
  }, [prefs]);

  /* ── Filtering ───────────────────────────────────────────────────── */

  const campaigns = useMemo(() => uniqueSorted(data.plans.map((plan) => plan.campaign)), [data.plans]);
  const owners = useMemo(() => uniqueSorted(data.plans.map((plan) => plan.owner)), [data.plans]);
  const types = useMemo(() => {
    const known = contentTypes.map((type) => type.value);
    return [...known, ...uniqueSorted(data.plans.map((plan) => plan.contentType.toLowerCase())).filter((type) => !known.includes(type))];
  }, [data.plans]);

  const needle = query.trim().toLowerCase();
  const activeFilters =
    (needle ? 1 : 0) + (platforms.length ? 1 : 0) + (stateFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0) + (campaign !== 'all' ? 1 : 0) + (owner !== 'all' ? 1 : 0);
  const clearFilters = () => {
    setQuery('');
    setPlatforms([]);
    setStateFilter('all');
    setTypeFilter('all');
    setCampaign('all');
    setOwner('all');
  };

  const plans = useMemo(() => {
    const matchState = STATE_FILTERS.find((item) => item.value === stateFilter)?.match ?? (() => true);
    return data.plans.filter(
      (plan) =>
        (!platforms.length || platforms.includes(plan.platform)) &&
        matchState(plan.computedState) &&
        (typeFilter === 'all' || plan.contentType.toLowerCase() === typeFilter) &&
        (campaign === 'all' || plan.campaign.trim() === campaign) &&
        (owner === 'all' || plan.owner.trim() === owner) &&
        (!needle || [plan.title, plan.caption, plan.campaign, plan.owner, plan.notes].some((text) => text.toLowerCase().includes(needle))),
    );
  }, [data.plans, platforms, stateFilter, typeFilter, campaign, owner, needle]);

  const platformPosts = useMemo(
    () => data.posts.filter((post) => post.ts && (!platforms.length || platforms.includes(post.platform))),
    [data.posts, platforms],
  );
  const plansByDay = useMemo(() => groupByDay(plans), [plans]);
  const postsByDay = useMemo(() => groupByDay(platformPosts), [platformPosts]);
  const shownPosts = prefs.observed ? postsByDay : new Map<string, Post[]>();

  /* ── Range ───────────────────────────────────────────────────────── */

  const cursor = useMemo(() => dateFromKey(cursorKey), [cursorKey]);
  const cells = useMemo(() => (mode === 'week' ? weekCells(cursor) : mode === 'day' ? dayCell(cursor) : monthCells(cursor)), [mode, cursor]);
  const monthly = mode === 'month' || mode === 'agenda' || mode === 'board';
  const rangeKeys = useMemo(() => cells.filter((cell) => !monthly || cell.inMonth).map((cell) => cell.key), [cells, monthly]);
  const inRange = useMemo(() => {
    const keys = new Set(rangeKeys);
    return plans.filter((plan) => keys.has(plan.day));
  }, [plans, rangeKeys]);
  const stats = useMemo(() => planStats(inRange), [inRange]);

  const rangeLabel =
    mode === 'week'
      ? `${fmtDay(cells[0].date.toMillis())} – ${fmtDay(cells[6].date.toMillis())}`
      : mode === 'day'
        ? fmtWeekdayDate(cursor.toMillis())
        : fmtMonth(cursor.toMillis());
  const rangeNoun = mode === 'week' ? 'هذا الأسبوع' : mode === 'day' ? 'هذا اليوم' : 'هذا الشهر';

  const occasions = useMemo(() => (prefs.occasions ? occasionsFor(cells.map((cell) => cell.key)) : new Map<string, Occasion[]>()), [prefs.occasions, cells]);
  const upcoming = useMemo(() => upcomingOccasions(todayKey, 60, 5), [todayKey]);

  const gaps = useMemo(() => {
    const set = new Set<string>();
    for (let ahead = 0; ahead < GAP_DAYS; ahead++) {
      const key = dayKeyOf(todayNum + ahead);
      if (!(plansByDay.get(key) ?? []).some((plan) => plan.computedState !== 'cancelled')) set.add(key);
    }
    return set;
  }, [plansByDay, todayNum]);

  const slots = useMemo(() => bestSlots(platformPosts, todayNum), [platformPosts, todayNum]);
  const bestHours = useMemo(() => bestHourByWeekday(slots), [slots]);

  const agendaDays = useMemo(
    () =>
      rangeKeys
        .map((day) => ({ day, plans: plansByDay.get(day) ?? [], occasions: activeFilters ? [] : (occasions.get(day) ?? []) }))
        .filter((entry) => entry.plans.length || entry.occasions.length),
    [rangeKeys, plansByDay, occasions, activeFilters],
  );

  /* ── Navigation ──────────────────────────────────────────────────── */

  const shift = useCallback(
    (step: number) => {
      setDirection(step);
      const next =
        mode === 'week' ? cursor.plus({ weeks: step }) : mode === 'day' ? cursor.plus({ days: step }) : cursor.startOf('month').plus({ months: step });
      const key = next.toISODate() ?? cursorKey;
      setCursorKey(key);
      if (mode === 'day') setSelected(key);
    },
    [mode, cursor, cursorKey],
  );

  const goToday = useCallback(() => {
    setDirection(cursorKey > todayKey ? -1 : 1);
    setCursorKey(todayKey);
    setSelected(todayKey);
  }, [cursorKey, todayKey]);

  const setMode = useCallback(
    (next: Mode) => {
      setDirection(0);
      setPrefs((current) => ({ ...current, mode: next }));
      setCursorKey(selected);
    },
    [selected],
  );

  const select = useCallback(
    (key: string) => {
      setSelected(key);
      if (!cells.some((cell) => cell.key === key)) {
        setDirection(key > cursorKey ? 1 : -1);
        setCursorKey(key);
      } else if (mode === 'day') setCursorKey(key);
      if (mode === 'month' && window.matchMedia('(max-width: 1180px)').matches)
        requestAnimationFrame(() => sidePanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    },
    [cells, cursorKey, mode],
  );

  const jumpTo = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setDirection(value > cursorKey ? 1 : -1);
    setSelected(value);
    setCursorKey(value);
  };

  const openJump = () => {
    const input = dateInput.current;
    if (!input) return;
    input.value = selected;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  };

  /* ── Moves and status changes ────────────────────────────────────── */

  const plansById = useMemo(() => new Map(data.plans.map((plan) => [plan.id, plan])), [data.plans]);

  const move = useCallback(
    async (planId: string, day: string, minutes?: number) => {
      setDragging(null);
      const plan = plansById.get(planId);
      if (!plan) return;
      const local = inZone(plan.ts);
      const hour = minutes == null ? local.hour : Math.floor(minutes / 60);
      const minute = minutes == null ? local.minute : minutes % 60;
      const target = dateFromKey(day).set({ hour, minute, second: 0, millisecond: 0 });
      const ms = target.toMillis();
      if (ms === plan.ts) return;
      if ((plan.status === 'scheduled' || plan.status === 'approved') && ms < Date.now()) {
        toast.error('الموعد الجديد في الماضي', 'اختر موعدًا قادمًا، أو حوّل البوست إلى مسودة أولًا.');
        return;
      }
      const previous = plan.scheduledAt;
      setSelected(day);
      try {
        await store.patchPlan(plan.id, { scheduledAt: target.toUTC().toISO() ?? previous });
        toast.success('تم نقل البوست', `«${plan.title}» · ${fmtWeekdayDate(ms)} · ${fmtTime(ms)}`, {
          label: 'تراجع',
          run: () => void store.patchPlan(plan.id, { scheduledAt: previous }).catch((error) => toast.error('تعذّر التراجع', errorMessage(error, ''))),
        });
      } catch (error) {
        toast.error('تعذّر نقل البوست', errorMessage(error, 'حاول مرة أخرى.'));
      }
    },
    [plansById, store, toast],
  );

  const changeStatus = useCallback(
    async (plan: Plan, status: PlanStatus) => {
      setDragging(null);
      if (status === 'published' && !plan.permalink.trim() && !plan.externalId.trim()) {
        openPlan({ mode: 'edit', plan, status: 'published' });
        toast.info('أضف دليل النشر', 'تأكيد النشر يحتاج رابط المنشور أو معرّفه، أو اختيار المنشور المرصود المطابق.');
        return;
      }
      const previous = plan.status;
      try {
        await store.patchPlan(plan.id, { status });
        toast.success(`«${plan.title}» صار ${statusLabel[status]}`, undefined, {
          label: 'تراجع',
          run: () => void store.patchPlan(plan.id, { status: previous }).catch((error) => toast.error('تعذّر التراجع', errorMessage(error, ''))),
        });
      } catch (error) {
        toast.error('تعذّر تغيير الحالة', errorMessage(error, 'حاول مرة أخرى.'));
      }
    },
    [openPlan, store, toast],
  );

  const onHover = useCallback(
    (plan: Plan | null, anchor?: HTMLElement) => {
      window.clearTimeout(hoverTimer.current);
      if (!plan || !anchor || dragging || !window.matchMedia('(hover: hover)').matches) {
        setHover(null);
        return;
      }
      hoverTimer.current = window.setTimeout(() => setHover({ plan, anchor }), 380);
    },
    [dragging],
  );

  useEffect(() => {
    if (!hover) return;
    const hide = () => setHover(null);
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', hide, { capture: true });
  }, [hover]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const actions = useMemo<CalendarActions>(
    () => ({
      open: (plan) => {
        setHover(null);
        openPlan({ mode: 'edit', plan });
      },
      add: (day, time) => openPlan({ mode: 'new', day, time }),
      select,
      hover: onHover,
      dragging,
      dragStart: (plan, event: DragEvent) => {
        if (!canDrag(plan)) {
          event.preventDefault();
          return;
        }
        window.clearTimeout(hoverTimer.current);
        setHover(null);
        event.dataTransfer.setData(PLAN_MIME, plan.id);
        event.dataTransfer.setData('text/plain', plan.title);
        event.dataTransfer.effectAllowed = 'move';
        setDragging(plan.id);
      },
      dragEnd: () => setDragging(null),
      move: (planId, day, minutes) => void move(planId, day, minutes),
    }),
    [openPlan, select, onHover, dragging, move],
  );

  const planOccasion = (occasion: Occasion) => openPlan({ mode: 'new', day: occasion.day, template: { title: occasion.name, campaign: occasion.name } });
  const planSlot = (slot: Slot) => {
    const start = zoneNow(now);
    let day = start;
    for (let ahead = 0; ahead <= 7; ahead++) {
      const candidate = start.plus({ days: ahead }).set({ hour: slot.hour, minute: 0 });
      if ((!slot.weekday || candidate.weekday === slot.weekday) && candidate.toMillis() > now) {
        day = candidate;
        break;
      }
    }
    openPlan({ mode: 'new', day: day.toISODate() ?? todayKey, time: `${String(slot.hour).padStart(2, '0')}:00` });
  };

  /* ── Import / export ─────────────────────────────────────────────── */

  const upload = async (file: File | undefined) => {
    if (!file || importing) return;
    setImporting(true);
    try {
      const result = await store.importCalendar(file);
      toast.success(
        result.imported ? `تمت إضافة ${num(result.imported)} بوست إلى الخطة` : 'لا توجد صفوف جديدة',
        result.duplicates ? `${num(result.duplicates)} صف موجود مسبقًا وتم تجاهله.` : undefined,
      );
      if (result.errors.length) setReport(result);
    } catch (error) {
      const rows = error instanceof ApiError ? (error.details as { errors?: string[] } | undefined)?.errors : undefined;
      if (rows?.length) setReport({ imported: 0, duplicates: 0, errors: rows, failed: errorMessage(error, '') });
      else toast.error('تعذّر رفع الكاليندر', errorMessage(error, 'تأكد أن الملف بصيغة XLSX أو CSV وعلى قالب الكاليندر.'));
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const exportAs = (format: 'csv' | 'ics') => {
    setExportOpen(false);
    if (!inRange.length) {
      toast.info('لا توجد بوستات للتصدير', `خطة ${rangeLabel} فارغة بالفلاتر الحالية.`);
      return;
    }
    const stamp = monthly ? cursor.toFormat('yyyy-LL') : cells[0].key;
    if (format === 'csv') downloadText(`social-pulse-${stamp}.csv`, plansToCsv(inRange), 'text/csv;charset=utf-8');
    else downloadText(`social-pulse-${stamp}.ics`, plansToIcs(inRange), 'text/calendar;charset=utf-8');
    toast.success(`تم تصدير ${num(inRange.length)} بوست`, format === 'csv' ? 'ملف CSV بنفس أعمدة قالب الرفع.' : 'افتحه في Google Calendar أو Outlook.');
  };

  useEffect(() => {
    if (!exportOpen) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !exportMenu.current?.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [exportOpen]);

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  const dropHandlers = {
    onDragEnter: (event: DragEvent) => hasFiles(event) && setFileDrag((depth) => depth + 1),
    onDragLeave: (event: DragEvent) => hasFiles(event) && setFileDrag((depth) => Math.max(0, depth - 1)),
    onDragOver: (event: DragEvent) => hasFiles(event) && event.preventDefault(),
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setFileDrag(0);
      void upload(event.dataTransfer.files[0]);
    },
  };

  /* ── Keyboard ────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector('[data-overlay]')) return;
      // `code` keeps the shortcuts working with an Arabic keyboard layout.
      const views: Record<string, Mode> = { KeyM: 'month', KeyW: 'week', KeyD: 'day', KeyL: 'agenda', KeyB: 'board' };
      if (event.key === 'ArrowRight') shift(-1);
      else if (event.key === 'ArrowLeft') shift(1);
      else if (event.code === 'KeyT') goToday();
      else if (event.code === 'KeyN') openPlan({ mode: 'new', day: selected });
      else if (views[event.code]) setMode(views[event.code]);
      else if (event.code === 'Slash' && event.shiftKey) setHelpOpen(true);
      else if (event.code === 'Slash') searchBox.current?.querySelector('input')?.focus();
      else return;
      event.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shift, goToday, setMode, openPlan, selected]);

  /* ── Render ──────────────────────────────────────────────────────── */

  const togglePlatform = (platform: Platform) =>
    setPlatforms((current) => (current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]));

  // The board needs every column; its cards already carry the day details.
  const showSide = prefs.side && mode !== 'board';
  const viewKey = `${mode}-${mode === 'week' ? cells[0].key : mode === 'day' ? cursorKey : cursor.toFormat('yyyy-LL')}`;

  return (
    <div className="cal" {...dropHandlers}>
      <Reveal>
        <ViewHeader title="كاليندر المحتوى" subtitle="خطّط، اسحب لتغيير المواعيد، وتابع تأكيد كل بوست على منصته.">
          <LinkButton href="/calendar-template.xlsx" download icon={<FileSpreadsheet size={16} />}>
            القالب
          </LinkButton>
          <Button icon={<Upload size={16} />} busy={importing} onClick={() => fileInput.current?.click()}>
            {importing ? 'جارٍ الرفع…' : 'ارفع كاليندر'}
          </Button>
          <div className="menu" ref={exportMenu}>
            <Button icon={<Download size={16} />} aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)}>
              تصدير <ChevronDown size={14} />
            </Button>
            <AnimatePresence>
              {exportOpen && (
                <motion.div
                  className="menu__list glass glass--float"
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.16 }}
                >
                  <span className="menu__caption">
                    {num(inRange.length)} بوست · {rangeLabel}
                  </span>
                  <button type="button" role="menuitem" onClick={() => exportAs('csv')}>
                    <FileSpreadsheet size={16} />
                    <span>
                      <b>Excel / CSV</b>
                      <small>بنفس أعمدة قالب الرفع</small>
                    </span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => exportAs('ics')}>
                    <CalendarDays size={16} />
                    <span>
                      <b>تقويم ‎.ics</b>
                      <small>Google Calendar أو Outlook</small>
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button variant="primary" icon={<Plus size={17} />} onClick={() => openPlan({ mode: 'new', day: selected })}>
            بوست جديد
          </Button>
          <input ref={fileInput} type="file" accept=".csv,.xlsx" hidden onChange={(event) => void upload(event.target.files?.[0])} />
        </ViewHeader>
      </Reveal>

      <Reveal i={1} className="cal__stats">
        <div className="stat glass" style={{ '--tone': 'var(--accent)' } as CSSProperties}>
          <span className="stat__icon">
            <CalendarDays size={18} />
          </span>
          <span className="stat__text">
            <b>{num(stats.total)}</b>
            <span>في الخطة {rangeNoun}</span>
          </span>
        </div>
        <div className="stat glass" style={{ '--tone': 'var(--ok)' } as CSSProperties}>
          <span className="stat__icon">
            <CalendarCheck2 size={18} />
          </span>
          <span className="stat__text">
            <b>{num(stats.published)}</b>
            <span>نشر مؤكد{stats.execution != null && ` · ${Math.round(stats.execution)}%`}</span>
          </span>
        </div>
        <button
          type="button"
          className="stat glass"
          data-alert={stats.attention > 0 || undefined}
          style={{ '--tone': 'var(--crit)' } as CSSProperties}
          onClick={() => setStateFilter((current) => (current === 'attention' ? 'all' : 'attention'))}
          aria-pressed={stateFilter === 'attention'}
        >
          <span className="stat__icon">
            <CircleAlert size={18} />
          </span>
          <span className="stat__text">
            <b>{num(stats.attention)}</b>
            <span>تحتاج متابعة</span>
          </span>
        </button>
        <div className="stat glass" style={{ '--tone': 'var(--info)' } as CSSProperties}>
          <span className="stat__icon">
            <Clock3 size={18} />
          </span>
          <span className="stat__text">
            <b>{num(stats.upcoming)}</b>
            <span>قادمة · {num(stats.draft)} مسودة</span>
          </span>
        </div>
        <div className="stat glass" style={{ '--tone': 'var(--pink)' } as CSSProperties} data-alert={gaps.size > 4 || undefined}>
          <span className="stat__icon">
            <CalendarX2 size={18} />
          </span>
          <span className="stat__text">
            <b>{num(gaps.size)}</b>
            <span>أيام فاضية خلال {GAP_DAYS} يوم</span>
          </span>
        </div>
      </Reveal>

      <Reveal i={2}>
        <div className="cal__bar glass">
          <div className="cal__nav">
            <IconButton label={mode === 'week' ? 'الأسبوع السابق' : mode === 'day' ? 'اليوم السابق' : 'الشهر السابق'} onClick={() => shift(-1)}>
              <ChevronRight size={19} />
            </IconButton>
            <IconButton label={mode === 'week' ? 'الأسبوع التالي' : mode === 'day' ? 'اليوم التالي' : 'الشهر التالي'} onClick={() => shift(1)}>
              <ChevronLeft size={19} />
            </IconButton>
            <h2 aria-live="polite">{rangeLabel}</h2>
            <Button size="sm" onClick={goToday} disabled={cells.some((cell) => cell.key === todayKey) && selected === todayKey}>
              اليوم
            </Button>
            <IconButton label="انتقل إلى تاريخ" onClick={openJump}>
              <CalendarSearch size={18} />
            </IconButton>
            <input
              ref={dateInput}
              type="date"
              className="cal__jump"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => jumpTo(event.target.value)}
            />
          </div>
          <div className="cal__views">
            <Segmented
              label="طريقة عرض الكاليندر"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'month', label: 'شهر', icon: <CalendarDays size={14} /> },
                { value: 'week', label: 'أسبوع', icon: <CalendarRange size={14} /> },
                { value: 'day', label: 'يوم', icon: <Rows3 size={14} /> },
                { value: 'agenda', label: 'قائمة', icon: <LayoutList size={14} /> },
                { value: 'board', label: 'لوحة', icon: <SquareKanban size={14} /> },
              ]}
            />
            <IconButton label="اختصارات لوحة المفاتيح" onClick={() => setHelpOpen(true)}>
              <Keyboard size={18} />
            </IconButton>
            <IconButton
              disabled={mode === 'board'}
              label={prefs.side ? 'إخفاء اللوحة الجانبية' : 'إظهار اللوحة الجانبية'}
              tip="end"
              className="cal__side-toggle"
              aria-pressed={prefs.side}
              onClick={() => setPrefs((current) => ({ ...current, side: !current.side }))}
            >
              {prefs.side ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </IconButton>
          </div>

          <div className="cal__filters">
            <div className="cal__search" ref={searchBox}>
              <SearchField value={query} onChange={setQuery} placeholder="ابحث في العناوين والنصوص والحملات…" label="البحث في الخطة" />
            </div>
            <div className="pfilter" role="group" aria-label="تصفية حسب المنصة">
              <button type="button" className="pchip" data-active={!platforms.length} aria-pressed={!platforms.length} onClick={() => setPlatforms([])}>
                <span>كل المنصات</span>
              </button>
              {PLATFORMS.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  className="pchip"
                  data-active={platforms.includes(platform)}
                  aria-pressed={platforms.includes(platform)}
                  style={{ '--p': platformColor(platform) } as CSSProperties}
                  onClick={() => togglePlatform(platform)}
                >
                  <span className="pchip__icon">
                    <PlatformIcon platform={platform} size={14} />
                  </span>
                  <span>{platformName[platform]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cal__refine">
            <Select aria-label="الحالة" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as StateFilter)} data-active={stateFilter !== 'all' || undefined}>
              {STATE_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Select aria-label="نوع المحتوى" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} data-active={typeFilter !== 'all' || undefined}>
              <option value="all">كل الأنواع</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {contentTypeLabel(type)}
                </option>
              ))}
            </Select>
            {campaigns.length > 0 && (
              <Select aria-label="الحملة" value={campaign} onChange={(event) => setCampaign(event.target.value)} data-active={campaign !== 'all' || undefined}>
                <option value="all">كل الحملات</option>
                {campaigns.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            )}
            {owners.length > 0 && (
              <Select aria-label="المسؤول" value={owner} onChange={(event) => setOwner(event.target.value)} data-active={owner !== 'all' || undefined}>
                <option value="all">كل الفريق</option>
                {owners.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            )}
            {activeFilters > 0 && (
              <Button size="sm" variant="ghost" icon={<FilterX size={15} />} onClick={clearFilters}>
                مسح الفلاتر ({activeFilters})
              </Button>
            )}
            <span className="cal__toggles">
              <button type="button" className="toggle" role="switch" aria-checked={prefs.observed} onClick={() => setPrefs((current) => ({ ...current, observed: !current.observed }))}>
                <span className="toggle__track">
                  <i />
                </span>
                <Radio size={14} /> المنشور فعليًا
              </button>
              <button type="button" className="toggle" role="switch" aria-checked={prefs.occasions} onClick={() => setPrefs((current) => ({ ...current, occasions: !current.occasions }))}>
                <span className="toggle__track">
                  <i />
                </span>
                <PartyPopper size={14} /> المناسبات
              </button>
            </span>
          </div>
        </div>
      </Reveal>

      <Reveal i={3} className={`cal__body cal__body--${mode}${showSide ? '' : ' cal__body--wide'}`}>
        <section className="glass cal__main" aria-label={`كاليندر ${rangeLabel}`} data-dragging={dragging ? true : undefined}>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={viewKey}
              custom={direction}
              variants={{
                enter: (step: number) => ({ opacity: 0, x: step === 0 ? 0 : step > 0 ? -28 : 28 }),
                center: { opacity: 1, x: 0 },
                exit: (step: number) => ({ opacity: 0, x: step === 0 ? 0 : step > 0 ? 28 : -28 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {mode === 'month' && (
                <MonthGrid
                  cells={cells}
                  label={rangeLabel}
                  todayKey={todayKey}
                  selected={selected}
                  plansByDay={plansByDay}
                  postsByDay={shownPosts}
                  occasions={occasions}
                  gaps={gaps}
                  actions={actions}
                />
              )}
              {(mode === 'week' || mode === 'day') && (
                <TimeGrid
                  cells={cells}
                  todayKey={todayKey}
                  now={now}
                  selected={selected}
                  plansByDay={plansByDay}
                  postsByDay={shownPosts}
                  occasions={occasions}
                  bestHours={bestHours}
                  actions={actions}
                  onOpenPost={openPost}
                />
              )}
              {mode === 'agenda' && (
                <AgendaList
                  days={agendaDays}
                  todayKey={todayKey}
                  now={now}
                  emptyTitle={activeFilters ? 'لا توجد بوستات تطابق الفلاتر' : `لا توجد بوستات في خطة ${fmtMonth(cursor.toMillis())}`}
                  emptyText={activeFilters ? 'غيّر الفلاتر أو امسحها لعرض بقية الخطة.' : 'أضف بوست أو ارفع كاليندر الفريق.'}
                  actions={actions}
                  onPlanOccasion={planOccasion}
                />
              )}
              {mode === 'board' && <BoardView plans={inRange} actions={actions} onStatus={(plan, status) => void changeStatus(plan, status)} />}
            </motion.div>
          </AnimatePresence>

          <footer className="cal__legend">
            {(['upcoming', 'due', 'missed', 'published', 'draft'] as PlanState[]).map((state) => (
              <StatePill key={state} state={state} />
            ))}
            <span className="cal__legend-note">
              {mode === 'board' ? 'اسحب البطاقة بين الأعمدة لتغيير حالتها' : 'اسحب أي بوست لتغيير موعده · دبل كليك على يوم لإضافة بوست'}
            </span>
          </footer>
        </section>

        <aside className="cal__side" ref={sidePanel} hidden={!showSide}>
          <CalendarSide
            mode={mode}
            anchor={cursorKey}
            selected={selected}
            todayKey={todayKey}
            plansByDay={plansByDay}
            dayPlans={plansByDay.get(selected) ?? []}
            dayPosts={postsByDay.get(selected) ?? []}
            dayOccasions={prefs.occasions ? (occasionsFor([selected]).get(selected) ?? []) : []}
            rangePlans={inRange}
            rangeLabel={rangeNoun}
            slots={slots}
            upcoming={upcoming}
            showOccasions={prefs.occasions}
            firstRun={data.plans.length === 0}
            actions={actions}
            onOpenPost={openPost}
            onPlanOccasion={planOccasion}
            onPlanSlot={planSlot}
            onUpload={() => fileInput.current?.click()}
          />
        </aside>
      </Reveal>

      {hover && !dragging && <HoverCard plan={hover.plan} anchor={hover.anchor} />}

      <AnimatePresence>
        {fileDrag > 0 && (
          <motion.div className="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="dropzone__card glass glass--float">
              <FileSpreadsheet size={34} />
              <b>أفلت ملف الكاليندر هنا</b>
              <span>XLSX أو CSV على قالب Social Pulse</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="اختصارات الكاليندر"
        icon={
          <span className="drawer__icon">
            <Keyboard size={19} />
          </span>
        }
      >
        <dl className="shortcuts">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label}>
              <dt>
                {keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
        <p className="report__hint">تعمل الاختصارات بأي لغة لوحة مفاتيح، وتتوقف أثناء الكتابة في الحقول.</p>
      </Modal>

      <Modal
        open={report != null}
        onClose={() => setReport(null)}
        title={report?.failed ? 'لم يُرفع الكاليندر' : 'صفوف تحتاج مراجعة'}
        icon={
          <span className="drawer__icon drawer__icon--warn">
            <FileWarning size={19} />
          </span>
        }
        footer={
          <>
            <LinkButton href="/calendar-template.xlsx" download icon={<Download size={15} />}>
              القالب
            </LinkButton>
            <Button variant="primary" onClick={() => setReport(null)}>
              تم
            </Button>
          </>
        }
      >
        {report && (
          <>
            <p className="report__summary">
              {report.failed
                ? report.failed
                : `أُضيف ${num(report.imported)} بوست${report.duplicates ? `، وتم تجاهل ${num(report.duplicates)} صف مكرر` : ''}. الصفوف التالية لم تُضف:`}
            </p>
            <ul className="report__list">
              {report.errors.map((row, index) => (
                <li key={index}>{row}</li>
              ))}
            </ul>
            <p className="report__hint">
              <ExternalLink size={13} /> صحّح هذه الصفوف في الملف وارفعه مرة أخرى؛ الصفوف التي أُضيفت لن تتكرر.
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}
