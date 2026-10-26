import { useEffect, useState, type CSSProperties } from 'react';
import { Ban, CircleCheck, CircleDashed, Clock3, Megaphone, ThumbsUp } from 'lucide-react';
import { StatePill } from '../ui/Bits';
import { PlatformBadge } from '../ui/Platform';
import { fmtDayShort, fmtTime } from '../../lib/format';
import { contentTypeLabel, platformColor } from '../../lib/platforms';
import type { Plan, PlanStatus } from '../../types';
import { canDrag, isPlanDrag, OwnerAvatar, TypeIcon, type CalendarActions } from './parts';

const COLUMNS: { status: PlanStatus; label: string; hint: string; icon: typeof Clock3 }[] = [
  { status: 'draft', label: 'مسودات', hint: 'أفكار تحت الكتابة والتصميم', icon: CircleDashed },
  { status: 'approved', label: 'موافق عليه', hint: 'جاهز للجدولة', icon: ThumbsUp },
  { status: 'scheduled', label: 'مجدول', hint: 'في انتظار موعده', icon: Clock3 },
  { status: 'published', label: 'تم النشر', hint: 'نشر مؤكد برابط أو معرّف', icon: CircleCheck },
  { status: 'cancelled', label: 'ملغي', hint: 'خارج الخطة', icon: Ban },
];

/** A post matched to a live post counts as published whatever its workflow status says. */
export const boardColumn = (plan: Plan): PlanStatus => (plan.computedState === 'published' ? 'published' : plan.status);

interface Props {
  plans: Plan[];
  actions: CalendarActions;
  onStatus: (plan: Plan, status: PlanStatus) => void;
}

export function BoardView({ plans, actions, onStatus }: Props) {
  const [over, setOver] = useState<PlanStatus | null>(null);
  useEffect(() => {
    if (!actions.dragging) setOver(null);
  }, [actions.dragging]);

  return (
    <div className="board">
      {COLUMNS.map(({ status, label, hint, icon: Icon }) => {
        const items = plans.filter((plan) => boardColumn(plan) === status).sort((a, b) => a.ts - b.ts);
        return (
          <section
            key={status}
            className="board__col"
            data-status={status}
            data-drop={over === status || undefined}
            aria-label={`${label}: ${items.length}`}
            onDragOver={(event) => {
              if (!isPlanDrag(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (over !== status) setOver(status);
            }}
            onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && setOver(null)}
            onDrop={(event) => {
              if (!isPlanDrag(event)) return;
              event.preventDefault();
              setOver(null);
              const plan = plans.find((item) => item.id === actions.dragging);
              if (plan && boardColumn(plan) !== status) onStatus(plan, status);
            }}
          >
            <header className="board__head">
              <span className="board__icon">
                <Icon size={15} />
              </span>
              <span className="board__titles">
                <b>{label}</b>
                <small>{hint}</small>
              </span>
              <span className="board__count">{items.length}</span>
            </header>
            <div className="board__items">
              {items.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className="bcard"
                  data-state={plan.computedState}
                  data-dragging={actions.dragging === plan.id || undefined}
                  draggable={canDrag(plan)}
                  style={{ '--p': platformColor(plan.platform) } as CSSProperties}
                  onClick={() => actions.open(plan)}
                  onDragStart={(event) => actions.dragStart(plan, event)}
                  onDragEnd={actions.dragEnd}
                >
                  <span className="bcard__top">
                    <PlatformBadge platform={plan.platform} size="xs" />
                    <span className="bcard__when">
                      {fmtDayShort(plan.ts)} · {fmtTime(plan.ts)}
                    </span>
                    <TypeIcon type={plan.contentType} />
                  </span>
                  <b dir="auto">{plan.title}</b>
                  <span className="bcard__foot">
                    {(plan.computedState === 'missed' || plan.computedState === 'due') && <StatePill state={plan.computedState} />}
                    {plan.campaign && (
                      <span className="meta-tag meta-tag--brand">
                        <Megaphone size={11} /> {plan.campaign}
                      </span>
                    )}
                    {!plan.campaign && plan.computedState !== 'missed' && plan.computedState !== 'due' && (
                      <span className="meta-tag">{contentTypeLabel(plan.contentType)}</span>
                    )}
                    <OwnerAvatar name={plan.owner} size={22} />
                  </span>
                </button>
              ))}
              {!items.length && <p className="board__empty">اسحب بوست إلى هنا</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
