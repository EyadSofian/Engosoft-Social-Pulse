import { useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileWarning,
  LayoutList,
  ListChecks,
  Plus,
  Radio,
  Upload,
} from 'lucide-react';
import { PlanRow, PostRow } from '../../components/Shared';
import { EmptyState, Panel, Reveal, StatePill, ViewHeader } from '../../components/ui/Bits';
import { Button, IconButton, LinkButton } from '../../components/ui/Button';
import { PlatformFilter, Segmented } from '../../components/ui/Controls';
import { Modal } from '../../components/ui/Overlay';
import { PlatformBadge, PlatformIcon } from '../../components/ui/Platform';
import { useToast } from '../../components/ui/Toast';
import { useApp } from '../../context';
import { planStats, WEEKDAY_NAMES, WEEK_ORDER } from '../../lib/analytics';
import { ApiError, errorMessage } from '../../lib/api';
import { monthCells, weekCells, type DayCell } from '../../lib/calendar';
import { dateFromKey, dayKeyOf, fmt, fmtDay, fmtMonth, fmtTime, num } from '../../lib/format';
import { PLATFORMS, platformColor, platformName, stateLabel } from '../../lib/platforms';
import type { Plan, PlanState, Platform, Post } from '../../types';

type Mode = 'month' | 'week' | 'agenda';
type StateFilter = 'all' | 'attention' | 'upcoming' | 'published' | 'draft';

interface ImportReport {
  imported: number;
  duplicates: number;
  errors: string[];
  failed?: string;
}

const MAX_CHIPS = 3;
const STATE_FILTERS: { value: StateFilter; label: string; match: (state: PlanState) => boolean }[] = [
  { value: 'all', label: 'الكل', match: () => true },
  { value: 'attention', label: 'تحتاج متابعة', match: (state) => state === 'missed' || state === 'due' },
  { value: 'upcoming', label: 'قادمة', match: (state) => state === 'upcoming' },
  { value: 'published', label: 'منشورة', match: (state) => state === 'published' },
  { value: 'draft', label: 'مسودات', match: (state) => state === 'draft' },
];

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

function PlanChip({ plan, onOpen }: { plan: Plan; onOpen: (plan: Plan) => void }) {
  return (
    <button
      type="button"
      className="chip"
      data-state={plan.computedState}
      style={{ '--p': platformColor(plan.platform) } as CSSProperties}
      title={`${plan.title} · ${platformName[plan.platform]} · ${stateLabel[plan.computedState]}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(plan);
      }}
    >
      <span className="chip__icon">
        <PlatformIcon platform={plan.platform} size={11} />
      </span>
      <time>{fmtTime(plan.ts)}</time>
      <span className="chip__title" dir="auto">
        {plan.title}
      </span>
      <span className="chip__state" aria-hidden />
    </button>
  );
}

/** Platforms that actually published on a day, as glyphs with counts. */
function ObservedMarks({ posts }: { posts: Post[] }) {
  const counts = new Map<Platform, number>();
  for (const post of posts) counts.set(post.platform, (counts.get(post.platform) ?? 0) + 1);
  return (
    <span className="observed" title={`${posts.length} منشور مرصود فعليًا`}>
      {PLATFORMS.filter((platform) => counts.has(platform)).map((platform) => (
        <span key={platform} className="observed__mark" style={{ '--p': platformColor(platform) } as CSSProperties}>
          <PlatformIcon platform={platform} size={10} />
          {counts.get(platform)}
        </span>
      ))}
    </span>
  );
}

export function CalendarView() {
  const { data, todayNum, filters, setFilters, openPlan, openPost, store } = useApp();
  const toast = useToast();
  const todayKey = dayKeyOf(todayNum);

  const [mode, setMode] = useState<Mode>('month');
  const [cursorKey, setCursorKey] = useState(todayKey);
  const [selected, setSelected] = useState(todayKey);
  const [direction, setDirection] = useState(0);
  const [showObserved, setShowObserved] = useState(true);
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [dragDepth, setDragDepth] = useState(0);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const sidePanel = useRef<HTMLDivElement | null>(null);

  const cursor = useMemo(() => dateFromKey(cursorKey), [cursorKey]);
  const plans = useMemo(
    () => data.plans.filter((plan) => filters.platform === 'all' || plan.platform === filters.platform),
    [data.plans, filters.platform],
  );
  const plansByDay = useMemo(() => groupByDay(plans), [plans]);
  const postsByDay = useMemo(
    () => groupByDay(data.posts.filter((post) => post.ts && (filters.platform === 'all' || post.platform === filters.platform))),
    [data.posts, filters.platform],
  );

  const cells = useMemo(() => (mode === 'week' ? weekCells(cursor) : monthCells(cursor)), [mode, cursor]);
  const inRange = useMemo(() => {
    const keys = new Set(cells.filter((cell) => mode === 'week' || cell.inMonth).map((cell) => cell.key));
    return plans.filter((plan) => keys.has(plan.day));
  }, [cells, plans, mode]);
  const stats = useMemo(() => planStats(inRange), [inRange]);
  const rangeLabel =
    mode === 'week' ? `${fmtDay(cells[0].date.toMillis())} – ${fmtDay(cells[6].date.toMillis())}` : fmtMonth(cursor.toMillis());
  const rangeNoun = mode === 'week' ? 'هذا الأسبوع' : 'هذا الشهر';

  const shift = (step: number) => {
    setDirection(step);
    const next = mode === 'week' ? cursor.plus({ weeks: step }) : cursor.startOf('month').plus({ months: step });
    setCursorKey(next.toISODate() ?? cursorKey);
  };
  const goToday = () => {
    setDirection(cursorKey > todayKey ? -1 : 1);
    setCursorKey(todayKey);
    setSelected(todayKey);
  };
  const select = (key: string) => {
    setSelected(key);
    if (window.matchMedia('(max-width: 1080px)').matches)
      requestAnimationFrame(() => sidePanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

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

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  const dropHandlers = {
    onDragEnter: (event: DragEvent) => hasFiles(event) && setDragDepth((depth) => depth + 1),
    onDragLeave: (event: DragEvent) => hasFiles(event) && setDragDepth((depth) => Math.max(0, depth - 1)),
    onDragOver: (event: DragEvent) => hasFiles(event) && event.preventDefault(),
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragDepth(0);
      void upload(event.dataTransfer.files[0]);
    },
  };

  const selectedDate = dateFromKey(selected);
  const selectedPlans = plansByDay.get(selected) ?? [];
  const selectedPosts = postsByDay.get(selected) ?? [];
  const openEdit = (plan: Plan) => openPlan({ mode: 'edit', plan });

  const agenda = useMemo(() => {
    const match = STATE_FILTERS.find((item) => item.value === stateFilter)?.match ?? (() => true);
    const days = new Map<string, Plan[]>();
    for (const plan of inRange) {
      if (!match(plan.computedState)) continue;
      const list = days.get(plan.day);
      if (list) list.push(plan);
      else days.set(plan.day, [plan]);
    }
    return [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [inRange, stateFilter]);

  return (
    <div className="cal" {...dropHandlers}>
      <Reveal>
        <ViewHeader title="كاليندر المحتوى" subtitle="خطّط النشر، ارفع جدول الفريق، وتابع تأكيد كل بوست على منصته.">
          <LinkButton href="/calendar-template.xlsx" download icon={<Download size={16} />}>
            القالب
          </LinkButton>
          <Button icon={<Upload size={16} />} busy={importing} onClick={() => fileInput.current?.click()}>
            {importing ? 'جارٍ الرفع…' : 'ارفع كاليندر'}
          </Button>
          <Button variant="primary" icon={<Plus size={17} />} onClick={() => openPlan({ mode: 'new', day: selected })}>
            بوست جديد
          </Button>
          <input ref={fileInput} type="file" accept=".csv,.xlsx" hidden onChange={(event) => void upload(event.target.files?.[0])} />
        </ViewHeader>
      </Reveal>

      <Reveal i={1} className="cal__stats">
        <div className="stat glass">
          <CalendarDays size={18} />
          <b>{num(stats.total)}</b>
          <span>في الخطة {rangeNoun}</span>
        </div>
        <div className="stat stat--ok glass">
          <CalendarCheck2 size={18} />
          <b>{num(stats.published)}</b>
          <span>نشر مؤكد</span>
        </div>
        <div className="stat stat--crit glass" data-on={stats.attention > 0 || undefined}>
          <CircleAlert size={18} />
          <b>{num(stats.attention)}</b>
          <span>تحتاج متابعة</span>
        </div>
        <div className="stat stat--info glass">
          <Clock3 size={18} />
          <b>{num(stats.upcoming)}</b>
          <span>قادمة</span>
        </div>
      </Reveal>

      <Reveal i={2}>
        <div className="cal__bar glass">
          <div className="cal__nav">
            <IconButton label={mode === 'week' ? 'الأسبوع السابق' : 'الشهر السابق'} onClick={() => shift(-1)}>
              <ChevronRight size={19} />
            </IconButton>
            <h2 aria-live="polite">{rangeLabel}</h2>
            <IconButton label={mode === 'week' ? 'الأسبوع التالي' : 'الشهر التالي'} onClick={() => shift(1)}>
              <ChevronLeft size={19} />
            </IconButton>
            <Button size="sm" onClick={goToday}>
              اليوم
            </Button>
          </div>
          <div className="cal__tools">
            <button
              type="button"
              className="toggle"
              role="switch"
              aria-checked={showObserved}
              onClick={() => setShowObserved((value) => !value)}
            >
              <span className="toggle__track">
                <i />
              </span>
              <Radio size={14} /> المنشور فعليًا
            </button>
            <Segmented
              label="طريقة عرض الكاليندر"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'month', label: 'شهر', icon: <CalendarDays size={14} /> },
                { value: 'week', label: 'أسبوع', icon: <CalendarRange size={14} /> },
                { value: 'agenda', label: 'قائمة', icon: <LayoutList size={14} /> },
              ]}
            />
          </div>
          <div className="cal__platforms">
            <PlatformFilter value={filters.platform} onChange={(platform) => setFilters({ platform, account: 'all' })} />
          </div>
        </div>
      </Reveal>

      <Reveal i={3} className="cal__body">
        <section className="glass cal__main" aria-label={`كاليندر ${rangeLabel}`}>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={`${mode}-${mode === 'week' ? cells[0].key : cursor.toFormat('yyyy-LL')}`}
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
                <div className="month" role="grid" aria-label={rangeLabel}>
                  <div className="month__head" role="row">
                    {WEEK_ORDER.map((weekday) => (
                      <span key={weekday} role="columnheader">
                        {WEEKDAY_NAMES[weekday]}
                      </span>
                    ))}
                  </div>
                  <div className="month__grid">
                    {cells.map((cell) => (
                      <MonthDay
                        key={cell.key}
                        cell={cell}
                        plans={plansByDay.get(cell.key) ?? []}
                        posts={showObserved ? (postsByDay.get(cell.key) ?? []) : []}
                        today={cell.key === todayKey}
                        selected={cell.key === selected}
                        onSelect={select}
                        onOpen={openEdit}
                        onAdd={(day) => openPlan({ mode: 'new', day })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {mode === 'week' && (
                <div className="week">
                  {cells.map((cell) => {
                    const dayPlans = plansByDay.get(cell.key) ?? [];
                    const dayPosts = showObserved ? (postsByDay.get(cell.key) ?? []) : [];
                    return (
                      <div key={cell.key} className="week__day" data-today={cell.key === todayKey || undefined} data-selected={cell.key === selected || undefined}>
                        <button type="button" className="week__head" onClick={() => select(cell.key)}>
                          <span>{WEEKDAY_NAMES[cell.date.weekday]}</span>
                          <b>{cell.date.day}</b>
                        </button>
                        <div className="week__items">
                          {dayPlans.map((plan) => (
                            <button
                              key={plan.id}
                              type="button"
                              className="wcard"
                              data-state={plan.computedState}
                              style={{ '--p': platformColor(plan.platform) } as CSSProperties}
                              onClick={() => openEdit(plan)}
                            >
                              <span className="wcard__top">
                                <PlatformBadge platform={plan.platform} size="xs" />
                                <time>{fmtTime(plan.ts)}</time>
                              </span>
                              <b dir="auto">{plan.title}</b>
                              <StatePill state={plan.computedState} />
                            </button>
                          ))}
                          {dayPosts.length > 0 && <ObservedMarks posts={dayPosts} />}
                          <button type="button" className="week__add" onClick={() => openPlan({ mode: 'new', day: cell.key })} aria-label={`أضف بوست يوم ${fmtDay(cell.date.toMillis())}`}>
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {mode === 'agenda' && (
                <div className="agenda">
                  <div className="agenda__filters" role="group" aria-label="تصفية حسب الحالة">
                    {STATE_FILTERS.map((item) => (
                      <button key={item.value} type="button" className="tag" data-active={stateFilter === item.value} aria-pressed={stateFilter === item.value} onClick={() => setStateFilter(item.value)}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {agenda.length ? (
                    agenda.map(([day, items]) => (
                      <section key={day} className="agenda__day">
                        <header>
                          <b>{dateFromKey(day).day}</b>
                          <span>
                            {WEEKDAY_NAMES[dateFromKey(day).weekday]}
                            <small>{fmt(dateFromKey(day).toMillis(), { month: 'long' })}</small>
                          </span>
                          {day === todayKey && <em>اليوم</em>}
                        </header>
                        <div className="rows">
                          {items.map((plan) => (
                            <PlanRow key={plan.id} plan={plan} onOpen={openEdit} />
                          ))}
                        </div>
                      </section>
                    ))
                  ) : (
                    <EmptyState
                      icon={<ListChecks size={26} />}
                      title={inRange.length ? 'لا توجد بوستات بهذه الحالة' : `لا توجد بوستات في خطة ${fmtMonth(cursor.toMillis())}`}
                      text={inRange.length ? 'غيّر فلتر الحالة لعرض بقية الخطة.' : 'أضف بوست أو ارفع كاليندر الفريق.'}
                    />
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <footer className="cal__legend">
            {(['upcoming', 'due', 'missed', 'published', 'draft'] as PlanState[]).map((state) => (
              <StatePill key={state} state={state} />
            ))}
            {showObserved && (
              <span className="cal__legend-note">
                <Radio size={13} /> الأرقام الصغيرة: منشورات رُصدت فعليًا على المنصة
              </span>
            )}
          </footer>
        </section>

        <aside className="cal__side" ref={sidePanel}>
          <Panel
            title={WEEKDAY_NAMES[selectedDate.weekday]}
            subtitle={
              <>
                {fmt(selectedDate.toMillis(), { day: 'numeric', month: 'long', year: 'numeric' })}
                {selected === todayKey && <em className="today-tag">اليوم</em>}
              </>
            }
            actions={
              <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => openPlan({ mode: 'new', day: selected })}>
                أضف
              </Button>
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <h3 className="side__label">في الخطة · {num(selectedPlans.length)}</h3>
                {selectedPlans.length ? (
                  <div className="rows">
                    {selectedPlans.map((plan) => (
                      <PlanRow key={plan.id} plan={plan} onOpen={openEdit} />
                    ))}
                  </div>
                ) : (
                  <p className="side__empty">لا بوستات مخططة لهذا اليوم.</p>
                )}

                <h3 className="side__label">منشور فعليًا · {num(selectedPosts.length)}</h3>
                {selectedPosts.length ? (
                  <div className="rows">
                    {selectedPosts.map((post) => (
                      <PostRow
                        key={post.key}
                        post={post}
                        onOpen={openPost}
                        meta={
                          <span className="row__value">
                            <b>{fmtTime(post.ts)}</b>
                          </span>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="side__empty">لم تُرصد منشورات على المنصات المتصلة في هذا اليوم.</p>
                )}
              </motion.div>
            </AnimatePresence>
          </Panel>

          {data.plans.length === 0 && (
            <Panel title="ابدأ خطة النشر" subtitle="ثلاث خطوات وتبدأ المتابعة والتنبيهات" className="steps-panel">
              <ol className="steps">
                <li>
                  <b>حمّل القالب</b>
                  <span>ملف XLSX بورقة Calendar وورقة شرح للأعمدة.</span>
                </li>
                <li>
                  <b>املأ صفًا لكل بوست</b>
                  <span>التاريخ والوقت بتوقيت القاهرة، والمنصة والعنوان.</span>
                </li>
                <li>
                  <b>ارفعه هنا</b>
                  <span>بالزر أو بسحب الملف إلى الصفحة. الصفوف المكررة لا تُضاف مرتين.</span>
                </li>
              </ol>
              <div className="steps__actions">
                <LinkButton size="sm" href="/calendar-template.xlsx" download icon={<FileSpreadsheet size={15} />}>
                  حمّل القالب
                </LinkButton>
                <Button size="sm" icon={<Upload size={15} />} onClick={() => fileInput.current?.click()}>
                  ارفع الملف
                </Button>
              </div>
            </Panel>
          )}
        </aside>
      </Reveal>

      <AnimatePresence>
        {dragDepth > 0 && (
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

function MonthDay({
  cell,
  plans,
  posts,
  today,
  selected,
  onSelect,
  onOpen,
  onAdd,
}: {
  cell: DayCell;
  plans: Plan[];
  posts: Post[];
  today: boolean;
  selected: boolean;
  onSelect: (key: string) => void;
  onOpen: (plan: Plan) => void;
  onAdd: (key: string) => void;
}) {
  const extra = plans.length - MAX_CHIPS;
  const label = `${WEEKDAY_NAMES[cell.date.weekday]} ${fmtDay(cell.date.toMillis())}، ${plans.length} بوست مخطط${posts.length ? `، ${posts.length} منشور فعليًا` : ''}`;
  return (
    <div
      className="day"
      role="gridcell"
      aria-selected={selected}
      data-outside={!cell.inMonth || undefined}
      data-today={today || undefined}
      data-selected={selected || undefined}
      data-weekend={cell.weekend || undefined}
      onClick={() => onSelect(cell.key)}
      onDoubleClick={() => onAdd(cell.key)}
    >
      <div className="day__head">
        <button
          type="button"
          className="day__num"
          aria-label={label}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(cell.key);
          }}
        >
          {cell.date.day}
        </button>
        {posts.length > 0 && <ObservedMarks posts={posts} />}
        <button
          type="button"
          className="day__add"
          aria-label={`أضف بوست يوم ${fmtDay(cell.date.toMillis())}`}
          onClick={(event) => {
            event.stopPropagation();
            onAdd(cell.key);
          }}
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="day__items">
        {plans.slice(0, MAX_CHIPS).map((plan) => (
          <PlanChip key={plan.id} plan={plan} onOpen={onOpen} />
        ))}
        {extra > 0 && <span className="day__more">+{extra} أخرى</span>}
      </div>
      {plans.length > 0 && (
        <div className="day__dots" aria-hidden>
          {plans.slice(0, 5).map((plan) => (
            <i key={plan.id} data-state={plan.computedState} style={{ '--p': platformColor(plan.platform) } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}
