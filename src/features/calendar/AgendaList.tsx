import type { CSSProperties } from 'react';
import { CalendarPlus, ListChecks, Megaphone } from 'lucide-react';
import { EmptyState, StatePill } from '../../components/ui/Bits';
import { Button } from '../../components/ui/Button';
import { PlatformBadge } from '../../components/ui/Platform';
import { WEEKDAY_NAMES } from '../../lib/analytics';
import { dateFromKey, fmt, fmtTime, relative } from '../../lib/format';
import type { Occasion } from '../../lib/occasions';
import { contentTypeLabel, platformColor, platformName } from '../../lib/platforms';
import type { Plan } from '../../types';
import { OccasionTag, OwnerAvatar, TypeIcon, type CalendarActions } from './parts';

interface Props {
  days: { day: string; plans: Plan[]; occasions: Occasion[] }[];
  todayKey: string;
  now: number;
  emptyTitle: string;
  emptyText: string;
  actions: CalendarActions;
  onPlanOccasion: (occasion: Occasion) => void;
}

export function AgendaList({ days, todayKey, now, emptyTitle, emptyText, actions, onPlanOccasion }: Props) {
  if (!days.length) return <EmptyState icon={<ListChecks size={26} />} title={emptyTitle} text={emptyText} />;
  return (
    <div className="agenda">
      {days.map(({ day, plans, occasions }) => {
        const date = dateFromKey(day);
        return (
          <section key={day} className="agenda__day" data-today={day === todayKey || undefined} data-past={day < todayKey || undefined}>
            <header className="agenda__head">
              <button type="button" className="agenda__date" onClick={() => actions.select(day)}>
                <b>{date.day}</b>
                <span>
                  {WEEKDAY_NAMES[date.weekday]}
                  <small>{fmt(date.toMillis(), { month: 'long' })}</small>
                </span>
              </button>
              {day === todayKey && <em className="today-tag">اليوم</em>}
              <span className="agenda__occasions">
                {occasions.map((occasion) => (
                  <OccasionTag key={occasion.key} occasion={occasion} />
                ))}
              </span>
              <Button size="sm" variant="ghost" icon={<CalendarPlus size={14} />} onClick={() => actions.add(day)}>
                أضف
              </Button>
            </header>

            <div className="agenda__items">
              {plans.map((plan) => {
                const live = plan.computedState === 'upcoming' || plan.computedState === 'due' || plan.computedState === 'missed';
                return (
                  <button
                    key={plan.id}
                    type="button"
                    className="acard"
                    data-state={plan.computedState}
                    style={{ '--p': platformColor(plan.platform) } as CSSProperties}
                    onClick={() => actions.open(plan)}
                  >
                    <span className="acard__time">
                      <b>{fmtTime(plan.ts)}</b>
                      {live && <small>{relative(plan.ts, now)}</small>}
                    </span>
                    <PlatformBadge platform={plan.platform} size="sm" />
                    <span className="acard__body">
                      <b dir="auto">{plan.title}</b>
                      {plan.caption && (
                        <span className="acard__caption" dir="auto">
                          {plan.caption}
                        </span>
                      )}
                      <span className="acard__tags">
                        <span className="meta-tag">{platformName[plan.platform]}</span>
                        <span className="meta-tag">
                          <TypeIcon type={plan.contentType} /> {contentTypeLabel(plan.contentType)}
                        </span>
                        {plan.campaign && (
                          <span className="meta-tag meta-tag--brand">
                            <Megaphone size={12} /> {plan.campaign}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="acard__end">
                      <StatePill state={plan.computedState} />
                      <OwnerAvatar name={plan.owner} size={24} />
                    </span>
                  </button>
                );
              })}
              {!plans.length &&
                occasions.map((occasion) => (
                  <div key={occasion.key} className="agenda__idea">
                    <span>لا يوجد محتوى لهذه المناسبة بعد.</span>
                    <Button size="sm" icon={<CalendarPlus size={14} />} onClick={() => onPlanOccasion(occasion)}>
                      خطّط لـ{occasion.name}
                    </Button>
                  </div>
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
