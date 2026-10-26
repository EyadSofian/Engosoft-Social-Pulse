import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, FileSpreadsheet, Flame, PartyPopper, ChartPie, Plus, Radio, Upload } from 'lucide-react';
import { PlanRow, PostRow } from '../ui/Shared';
import { Button, IconButton, LinkButton } from '../ui/Button';
import { slotDay, WEEKDAY_NAMES, WEEK_ORDER, type Slot } from '../../lib/analytics';
import { monthCells } from '../../lib/calendar';
import { compact, dateFromKey, fmt, fmtDayShort, fmtMonth, fmtTime, hourLabel, num } from '../../lib/format';
import { hijriLabel, occasionKindLabel, type Occasion } from '../../lib/occasions';
import { PLATFORMS, platformColor, platformName } from '../../lib/platforms';
import type { Plan, Platform, Post } from '../../types';
import { OccasionTag, SideSection, type CalendarActions } from './parts';

/* ── Mini month ────────────────────────────────────────────────────── */

/** The usual one-letter Arabic weekday initials. */
const INITIAL: Record<number, string> = { 6: 'س', 7: 'ح', 1: 'ن', 2: 'ث', 3: 'ر', 4: 'خ', 5: 'ج' };

function MiniCalendar({ anchor, selected, todayKey, plansByDay, onPick }: { anchor: string; selected: string; todayKey: string; plansByDay: Map<string, Plan[]>; onPick: (day: string) => void }) {
  const [month, setMonth] = useState(() => dateFromKey(anchor).startOf('month'));
  useEffect(() => setMonth(dateFromKey(anchor).startOf('month')), [anchor]);
  const cells = monthCells(month);
  return (
    <div className="mini">
      <header className="mini__head">
        <IconButton label="الشهر السابق" tip="none" className="icon-btn--sm" onClick={() => setMonth((value) => value.minus({ months: 1 }))}>
          <ChevronRight size={16} />
        </IconButton>
        <b>{fmtMonth(month.toMillis())}</b>
        <IconButton label="الشهر التالي" tip="none" className="icon-btn--sm" onClick={() => setMonth((value) => value.plus({ months: 1 }))}>
          <ChevronLeft size={16} />
        </IconButton>
      </header>
      <div className="mini__grid" role="grid" aria-label={fmtMonth(month.toMillis())}>
        {WEEK_ORDER.map((weekday) => (
          <span key={weekday} className="mini__wd" role="columnheader" aria-label={WEEKDAY_NAMES[weekday]}>
            {INITIAL[weekday]}
          </span>
        ))}
        {cells.map((cell) => {
          const count = plansByDay.get(cell.key)?.length ?? 0;
          return (
            <button
              key={cell.key}
              type="button"
              className="mini__day"
              data-outside={!cell.inMonth || undefined}
              data-today={cell.key === todayKey || undefined}
              data-selected={cell.key === selected || undefined}
              data-load={count === 0 ? undefined : count > 2 ? 'high' : 'low'}
              aria-label={`${fmtDayShort(cell.date.toMillis())}: ${count} بوست`}
              onClick={() => onPick(cell.key)}
            >
              {cell.date.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Platform mix ──────────────────────────────────────────────────── */

function PlatformMix({ plans }: { plans: Plan[] }) {
  const counts = new Map<Platform, number>();
  for (const plan of plans) if (plan.computedState !== 'cancelled') counts.set(plan.platform, (counts.get(plan.platform) ?? 0) + 1);
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (!total) return <p className="side__empty">لا توجد بوستات في هذه الفترة بعد.</p>;
  const shown = PLATFORMS.filter((platform) => counts.has(platform));
  return (
    <div className="mix">
      <div className="mix__bar" role="img" aria-label={shown.map((platform) => `${platformName[platform]} ${counts.get(platform)}`).join('، ')}>
        {shown.map((platform) => (
          <i key={platform} style={{ '--p': platformColor(platform), flexGrow: counts.get(platform) } as CSSProperties} />
        ))}
      </div>
      <ul className="mix__legend">
        {shown.map((platform) => (
          <li key={platform} style={{ '--p': platformColor(platform) } as CSSProperties}>
            <i aria-hidden />
            <span>{platformName[platform]}</span>
            <b>{num(counts.get(platform))}</b>
            <small>{Math.round(((counts.get(platform) ?? 0) / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Side column ───────────────────────────────────────────────────── */

interface Props {
  mode: string;
  anchor: string;
  selected: string;
  todayKey: string;
  plansByDay: Map<string, Plan[]>;
  dayPlans: Plan[];
  dayPosts: Post[];
  dayOccasions: Occasion[];
  rangePlans: Plan[];
  rangeLabel: string;
  slots: Slot[];
  upcoming: Occasion[];
  showOccasions: boolean;
  firstRun: boolean;
  actions: CalendarActions;
  onOpenPost: (post: Post) => void;
  onPlanOccasion: (occasion: Occasion) => void;
  onPlanSlot: (slot: Slot) => void;
  onUpload: () => void;
  extra?: ReactNode;
}

export function CalendarSide(props: Props) {
  const { mode, anchor, selected, todayKey, plansByDay, dayPlans, dayPosts, dayOccasions, rangePlans, rangeLabel, slots, upcoming, showOccasions, firstRun, actions } = props;
  const date = dateFromKey(selected);
  const hijri = hijriLabel(selected);

  return (
    <>
      {mode !== 'month' && (
        <section className="glass side-card">
          <MiniCalendar anchor={anchor} selected={selected} todayKey={todayKey} plansByDay={plansByDay} onPick={actions.select} />
        </section>
      )}

      <section className="glass side-card day-card" aria-live="polite">
        <header className="day-card__head">
          <span className="day-card__date" data-today={selected === todayKey || undefined}>
            <b>{date.day}</b>
            <small>{fmt(date.toMillis(), { month: 'short' })}</small>
          </span>
          <span className="day-card__titles">
            <b>
              {WEEKDAY_NAMES[date.weekday]}
              {selected === todayKey && <em className="today-tag">اليوم</em>}
            </b>
            <small>
              {fmt(date.toMillis(), { day: 'numeric', month: 'long', year: 'numeric' })}
              {hijri && ` · ${hijri}`}
            </small>
          </span>
          <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => actions.add(selected)}>
            أضف
          </Button>
        </header>

        {showOccasions && dayOccasions.length > 0 && (
          <div className="day-card__occasions">
            {dayOccasions.map((occasion) => (
              <div key={occasion.key} className="occasion-row" data-kind={occasion.kind}>
                <PartyPopper size={15} />
                <span>
                  <b>{occasion.name}</b>
                  <small>
                    {occasionKindLabel[occasion.kind]}
                    {occasion.region && ` · ${occasion.region}`}
                    {occasion.approximate && ' · تاريخ تقريبي'}
                  </small>
                </span>
                <Button size="sm" variant="ghost" onClick={() => props.onPlanOccasion(occasion)}>
                  خطّط
                </Button>
              </div>
            ))}
          </div>
        )}

        <h3 className="side__label">في الخطة · {num(dayPlans.length)}</h3>
        {dayPlans.length ? (
          <div className="rows">
            {dayPlans.map((plan) => (
              <PlanRow key={plan.id} plan={plan} onOpen={actions.open} />
            ))}
          </div>
        ) : (
          <p className="side__empty">لا بوستات مخططة لهذا اليوم.</p>
        )}

        <h3 className="side__label">
          <Radio size={13} /> منشور فعليًا · {num(dayPosts.length)}
        </h3>
        {dayPosts.length ? (
          <div className="rows">
            {dayPosts.map((post) => (
              <PostRow
                key={post.key}
                post={post}
                onOpen={props.onOpenPost}
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
      </section>

      {firstRun && (
        <section className="glass side-card steps-panel">
          <SideSection title="ابدأ خطة النشر" icon={<FileSpreadsheet size={15} />}>
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
              <Button size="sm" icon={<Upload size={15} />} onClick={props.onUpload}>
                ارفع الملف
              </Button>
            </div>
          </SideSection>
        </section>
      )}

      <section className="glass side-card">
        <SideSection title="أفضل أوقات النشر" icon={<Flame size={15} />}>
          {slots.length ? (
            <>
              <ol className="slots">
                {slots.slice(0, 3).map((slot, index) => (
                  <li key={`${slot.weekday}-${slot.hour}`}>
                    <span className="slots__rank">{index + 1}</span>
                    <span className="slots__text">
                      <b>
                        {slotDay(slot)} · {hourLabel(slot.hour)}
                      </b>
                      <small>
                        متوسط {compact(Math.round(slot.average))} تفاعل · {num(slot.posts)} بوست
                      </small>
                    </span>
                    <IconButton label="أضف بوست في هذا الوقت" tip="none" className="icon-btn--sm" onClick={() => props.onPlanSlot(slot)}>
                      <CalendarPlus size={15} />
                    </IconButton>
                  </li>
                ))}
              </ol>
              <p className="side__note">متوسط التفاعل لبوستاتكم المرصودة خلال آخر 12 شهرًا (بوستان على الأقل لكل وقت)، بتوقيت القاهرة.</p>
            </>
          ) : (
            <p className="side__empty">تظهر هنا أفضل الأوقات عندما تتوفر بيانات تفاعل كافية للبوستات المرصودة.</p>
          )}
        </SideSection>
      </section>

      {showOccasions && (
        <section className="glass side-card">
          <SideSection title="مناسبات قادمة" icon={<PartyPopper size={15} />}>
            {upcoming.length ? (
              <ul className="upcoming">
                {upcoming.map((occasion) => (
                  <li key={occasion.key}>
                    <button type="button" className="upcoming__date" onClick={() => actions.select(occasion.day)}>
                      <b>{dateFromKey(occasion.day).day}</b>
                      <small>{fmt(dateFromKey(occasion.day).toMillis(), { month: 'short' })}</small>
                    </button>
                    <span className="upcoming__text">
                      <OccasionTag occasion={occasion} />
                      <small>
                        {occasionKindLabel[occasion.kind]}
                        {occasion.region && ` · ${occasion.region}`}
                        {occasion.approximate && ' · تقريبي'}
                      </small>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => props.onPlanOccasion(occasion)}>
                      خطّط
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="side__empty">لا مناسبات خلال الشهرين القادمين.</p>
            )}
          </SideSection>
        </section>
      )}

      <section className="glass side-card">
        <SideSection title={`توزيع المنصات · ${rangeLabel}`} icon={<ChartPie size={15} />}>
          <PlatformMix plans={rangePlans} />
        </SideSection>
      </section>
      {props.extra}
    </>
  );
}
