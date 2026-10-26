import { useEffect, useState, type CSSProperties } from 'react';
import { Plus } from 'lucide-react';
import { WEEKDAY_NAMES, WEEK_ORDER } from '../../lib/analytics';
import type { DayCell } from '../../lib/calendar';
import { fmtDay } from '../../lib/format';
import type { Occasion } from '../../lib/occasions';
import { platformColor } from '../../lib/platforms';
import type { Plan, Post } from '../../types';
import { isPlanDrag, ObservedMarks, OccasionTag, PlanChip, type CalendarActions } from './parts';

const MAX_CHIPS = 3;

interface Props {
  cells: DayCell[];
  label: string;
  todayKey: string;
  selected: string;
  plansByDay: Map<string, Plan[]>;
  postsByDay: Map<string, Post[]>;
  occasions: Map<string, Occasion[]>;
  /** Upcoming days with nothing planned. */
  gaps: Set<string>;
  actions: CalendarActions;
}

export function MonthGrid({ cells, label, todayKey, selected, plansByDay, postsByDay, occasions, gaps, actions }: Props) {
  const [over, setOver] = useState('');
  useEffect(() => {
    if (!actions.dragging) setOver('');
  }, [actions.dragging]);
  return (
    <div className="month" role="grid" aria-label={label}>
      <div className="month__head" role="row">
        {WEEK_ORDER.map((weekday) => (
          <span key={weekday} role="columnheader">
            {WEEKDAY_NAMES[weekday]}
          </span>
        ))}
      </div>
      <div className="month__grid" onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && setOver('')}>
        {cells.map((cell) => {
          const plans = plansByDay.get(cell.key) ?? [];
          const posts = postsByDay.get(cell.key) ?? [];
          const dayOccasions = occasions.get(cell.key) ?? [];
          const extra = plans.length - MAX_CHIPS;
          const isSelected = cell.key === selected;
          return (
            <div
              key={cell.key}
              className="day"
              role="gridcell"
              aria-selected={isSelected}
              data-outside={!cell.inMonth || undefined}
              data-today={cell.key === todayKey || undefined}
              data-past={cell.key < todayKey || undefined}
              data-selected={isSelected || undefined}
              data-weekend={cell.weekend || undefined}
              data-gap={gaps.has(cell.key) || undefined}
              data-drop={over === cell.key || undefined}
              onClick={() => actions.select(cell.key)}
              onDoubleClick={() => actions.add(cell.key)}
              onDragOver={(event) => {
                if (!isPlanDrag(event)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (over !== cell.key) setOver(cell.key);
              }}
              onDrop={(event) => {
                if (!isPlanDrag(event)) return;
                event.preventDefault();
                setOver('');
                if (actions.dragging) actions.move(actions.dragging, cell.key);
              }}
            >
              <div className="day__head">
                <button
                  type="button"
                  className="day__num"
                  aria-label={`${WEEKDAY_NAMES[cell.date.weekday]} ${fmtDay(cell.date.toMillis())}، ${plans.length} بوست مخطط${posts.length ? `، ${posts.length} منشور فعليًا` : ''}`}
                  aria-pressed={isSelected}
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.select(cell.key);
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
                    actions.add(cell.key);
                  }}
                >
                  <Plus size={13} />
                </button>
              </div>
              {dayOccasions.length > 0 && (
                <div className="day__occasions">
                  <OccasionTag occasion={dayOccasions[0]} />
                  {dayOccasions.length > 1 && <span className="day__more-occ">+{dayOccasions.length - 1}</span>}
                </div>
              )}
              <div className="day__items">
                {plans.slice(0, MAX_CHIPS).map((plan) => (
                  <PlanChip key={plan.id} plan={plan} actions={actions} />
                ))}
                {extra > 0 && (
                  <button
                    type="button"
                    className="day__more"
                    onClick={(event) => {
                      event.stopPropagation();
                      actions.select(cell.key);
                    }}
                  >
                    +{extra} أخرى
                  </button>
                )}
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
        })}
      </div>
    </div>
  );
}
