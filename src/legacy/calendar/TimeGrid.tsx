import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type DragEvent } from 'react';
import { Flame, Plus } from 'lucide-react';
import { StatePill } from '../ui/Bits';
import { PlatformIcon } from '../ui/Platform';
import { WEEKDAY_NAMES, type Slot } from '../../lib/analytics';
import { layoutLanes, type DayCell } from '../../lib/calendar';
import { compact, fmtDay, fmtTime, hourLabel, inZone, zoneNow } from '../../lib/format';
import type { Occasion } from '../../lib/occasions';
import { platformColor, platformName } from '../../lib/platforms';
import type { Plan, Post } from '../../types';
import { canDrag, isPlanDrag, OccasionTag, OwnerAvatar, TypeIcon, type CalendarActions } from './parts';

const HOUR_PX = 56;
const BLOCK_MS = 50 * 60_000;
const SNAP = 15;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const pad = (value: number) => String(value).padStart(2, '0');
const clockOf = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const minutesLabel = (minutes: number) => fmtTime(zoneNow().set({ hour: Math.floor(minutes / 60), minute: minutes % 60 }).toMillis());

function minutesAt(event: MouseEvent | DragEvent, column: HTMLElement, step: number) {
  const y = event.clientY - column.getBoundingClientRect().top;
  const raw = (y / HOUR_PX) * 60;
  return Math.min(24 * 60 - step, Math.max(0, Math.floor(raw / step) * step));
}

interface Props {
  cells: DayCell[];
  todayKey: string;
  now: number;
  selected: string;
  plansByDay: Map<string, Plan[]>;
  postsByDay: Map<string, Post[]>;
  occasions: Map<string, Occasion[]>;
  bestHours: Map<number, Slot>;
  actions: CalendarActions;
  onOpenPost: (post: Post) => void;
}

export function TimeGrid({ cells, todayKey, now, selected, plansByDay, postsByDay, occasions, bestHours, actions, onOpenPost }: Props) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [ghost, setGhost] = useState<{ day: string; minutes: number; drop: boolean } | null>(null);
  const rangeKey = cells.map((cell) => cell.key).join('|');

  // Open on the working day, or a little before the earliest post in view.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let first = 9;
    for (const cell of cells)
      for (const plan of plansByDay.get(cell.key) ?? []) first = Math.min(first, inZone(plan.ts).hour);
    element.scrollTop = Math.max(0, first - 1) * HOUR_PX;
    // Only when the visible range changes, not on every data refresh.
  }, [rangeKey]);

  useEffect(() => {
    if (!actions.dragging) setGhost((current) => (current?.drop ? null : current));
  }, [actions.dragging]);

  const nowMinutes = (() => {
    const local = zoneNow(now);
    return local.hour * 60 + local.minute;
  })();

  return (
    <div className="tgrid" style={{ '--cols': cells.length, '--hour': `${HOUR_PX}px` } as CSSProperties} data-single={cells.length === 1 || undefined}>
      <div className="tgrid__head">
        <span className="tgrid__corner" aria-hidden />
        {cells.map((cell) => {
          const count = (plansByDay.get(cell.key) ?? []).length;
          const dayOccasions = occasions.get(cell.key) ?? [];
          return (
            <button
              key={cell.key}
              type="button"
              className="tgrid__day"
              data-today={cell.key === todayKey || undefined}
              data-selected={cell.key === selected || undefined}
              data-weekend={cell.weekend || undefined}
              onClick={() => actions.select(cell.key)}
            >
              <span className="tgrid__weekday">{WEEKDAY_NAMES[cell.date.weekday]}</span>
              <b className="tgrid__date">{cell.date.day}</b>
              <span className="tgrid__meta">
                {count > 0 ? `${count} منشور` : 'لا شيء'}
                {dayOccasions.length > 0 && <OccasionTag occasion={dayOccasions[0]} compact={cells.length > 1} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="tgrid__scroll" ref={scroller}>
        <div className="tgrid__body">
          <div className="tgrid__hours" aria-hidden>
            {HOURS.map((hour) => (
              <span key={hour} style={{ top: hour * HOUR_PX }}>
                {hour === 0 ? '' : hourLabel(hour)}
              </span>
            ))}
          </div>

          {cells.map((cell) => {
            const plans = plansByDay.get(cell.key) ?? [];
            const posts = postsByDay.get(cell.key) ?? [];
            const best = bestHours.get(cell.date.weekday);
            const past = cell.key < todayKey;
            return (
              <div
                key={cell.key}
                className="tgrid__col"
                data-today={cell.key === todayKey || undefined}
                data-past={past || undefined}
                data-weekend={cell.weekend || undefined}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  actions.add(cell.key, clockOf(minutesAt(event, event.currentTarget, 30)));
                }}
                onMouseMove={(event) => {
                  if (event.target !== event.currentTarget) return setGhost((current) => (current && !current.drop ? null : current));
                  const minutes = minutesAt(event, event.currentTarget, 30);
                  if (ghost?.day !== cell.key || ghost.minutes !== minutes || ghost.drop) setGhost({ day: cell.key, minutes, drop: false });
                }}
                onMouseLeave={() => setGhost((current) => (current && !current.drop ? null : current))}
                onDragOver={(event) => {
                  if (!isPlanDrag(event)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const minutes = minutesAt(event, event.currentTarget, SNAP);
                  if (ghost?.day !== cell.key || ghost.minutes !== minutes || !ghost.drop) setGhost({ day: cell.key, minutes, drop: true });
                }}
                onDrop={(event) => {
                  if (!isPlanDrag(event)) return;
                  event.preventDefault();
                  const minutes = minutesAt(event, event.currentTarget, SNAP);
                  setGhost(null);
                  if (actions.dragging) actions.move(actions.dragging, cell.key, minutes);
                }}
              >
                {best && (
                  <div className="tgrid__best" style={{ top: best.hour * HOUR_PX }} title={`أفضل وقت${best.weekday ? ` يوم ${WEEKDAY_NAMES[best.weekday]}` : ''}: متوسط ${compact(Math.round(best.average))} تفاعل من ${best.posts} منشور`}>
                    <Flame size={11} /> أفضل وقت
                  </div>
                )}

                {ghost?.day === cell.key && (
                  <div className="tgrid__ghost" data-drop={ghost.drop || undefined} style={{ top: (ghost.minutes / 60) * HOUR_PX }} aria-hidden>
                    {ghost.drop ? (
                      <span>{minutesLabel(ghost.minutes)}</span>
                    ) : (
                      <>
                        <Plus size={12} /> {minutesLabel(ghost.minutes)}
                      </>
                    )}
                  </div>
                )}

                {layoutLanes(plans, BLOCK_MS).map(({ item: plan, lane, lanes }) => {
                  const local = inZone(plan.ts);
                  const minutes = local.hour * 60 + local.minute;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      className="tevent"
                      data-state={plan.computedState}
                      data-dragging={actions.dragging === plan.id || undefined}
                      data-narrow={lanes > 1 || undefined}
                      draggable={canDrag(plan)}
                      style={
                        {
                          '--p': platformColor(plan.platform),
                          top: (minutes / 60) * HOUR_PX + 1,
                          insetInlineStart: `calc(${lane} * 100% / ${lanes} + 3px)`,
                          width: `calc(100% / ${lanes} - 6px)`,
                        } as CSSProperties
                      }
                      aria-label={`${plan.title} · ${platformName[plan.platform]} · ${fmtTime(plan.ts)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.open(plan);
                      }}
                      onDragStart={(event) => actions.dragStart(plan, event)}
                      onDragEnd={actions.dragEnd}
                      onPointerEnter={(event) => actions.hover(plan, event.currentTarget)}
                      onPointerLeave={() => actions.hover(null)}
                    >
                      <span className="tevent__top">
                        <span className="tevent__icon">
                          <PlatformIcon platform={plan.platform} size={11} />
                        </span>
                        <time>{fmtTime(plan.ts)}</time>
                        <TypeIcon type={plan.contentType} size={11} />
                        <OwnerAvatar name={plan.owner} size={16} />
                      </span>
                      <b dir="auto">{plan.title}</b>
                      {cells.length === 1 && <StatePill state={plan.computedState} />}
                    </button>
                  );
                })}

                {posts.map((post) => {
                  const local = inZone(post.ts);
                  return (
                    <button
                      key={post.key}
                      type="button"
                      className="tpost"
                      style={{ '--p': platformColor(post.platform), top: ((local.hour * 60 + local.minute) / 60) * HOUR_PX } as CSSProperties}
                      title={`منشور مرصود: ${post.title} · ${fmtTime(post.ts)}`}
                      aria-label={`منشور مرصود على ${platformName[post.platform]} ${fmtTime(post.ts)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenPost(post);
                      }}
                    >
                      <PlatformIcon platform={post.platform} size={10} />
                    </button>
                  );
                })}

                {cell.key === todayKey && (
                  <div className="tgrid__now" style={{ top: (nowMinutes / 60) * HOUR_PX }} aria-label={`الآن ${fmtTime(now)}`}>
                    <i />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="tgrid__hint">
        اضغط على أي خانة لإضافة منشور في هذا الوقت · اسحب المنشور لتغيير يومه أو ساعته · {fmtDay(cells[0].date.toMillis())}
        {cells.length > 1 && ` – ${fmtDay(cells[cells.length - 1].date.toMillis())}`}
      </p>
    </div>
  );
}
