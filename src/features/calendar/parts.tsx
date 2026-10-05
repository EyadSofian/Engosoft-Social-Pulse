import { useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleDot, Clapperboard, GripVertical, Image, Megaphone, PartyPopper, Sparkles, UserRound, Video } from 'lucide-react';
import { StatePill } from '../../components/ui/Bits';
import { PlatformBadge, PlatformIcon } from '../../components/ui/Platform';
import { fmtTime, fmtWeekdayDate } from '../../lib/format';
import { occasionKindLabel, type Occasion } from '../../lib/occasions';
import { contentTypeLabel, PLATFORMS, platformColor, platformName } from '../../lib/platforms';
import type { Plan, Platform, Post } from '../../types';

/* ── Shared calendar contract ──────────────────────────────────────── */

export const PLAN_MIME = 'application/x-social-pulse-plan';

export interface CalendarActions {
  open: (plan: Plan) => void;
  add: (day: string, time?: string) => void;
  select: (day: string) => void;
  hover: (plan: Plan | null, anchor?: HTMLElement) => void;
  /** Id of the post being dragged, if any. */
  dragging: string | null;
  dragStart: (plan: Plan, event: DragEvent) => void;
  dragEnd: () => void;
  /** Drop on a day; `minutes` after midnight, or the post keeps its own time. */
  move: (planId: string, day: string, minutes?: number) => void;
}

/** Published posts are a record of what happened; they don't move. */
export const canDrag = (plan: Plan) => plan.computedState !== 'published';

export const isPlanDrag = (event: DragEvent) => event.dataTransfer.types.includes(PLAN_MIME);

/* ── Small pieces ──────────────────────────────────────────────────── */

const TYPE_ICON: Record<string, typeof Image> = {
  post: Image,
  image: Image,
  carousel_album: Image,
  reel: Clapperboard,
  video: Video,
  story: CircleDot,
  spotlight: Sparkles,
};

export function TypeIcon({ type, size = 12 }: { type: string; size?: number }) {
  const Icon = TYPE_ICON[type.toLowerCase()] ?? Image;
  return <Icon size={size} aria-label={contentTypeLabel(type)} />;
}

const AVATAR_TONES = 6;
function toneOf(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0;
  return Math.abs(hash) % AVATAR_TONES;
}

/** Owner initial on a coloured disc; the full name stays in the tooltip. */
export function OwnerAvatar({ name, size = 22 }: { name: string; size?: number }) {
  if (!name) return null;
  return (
    <span className="avatar" data-tone={toneOf(name)} style={{ width: size, height: size, fontSize: size * 0.48 }} title={name} aria-label={`المسؤول: ${name}`}>
      {[...name.trim()][0]}
    </span>
  );
}

export function OccasionTag({ occasion, compact }: { occasion: Occasion; compact?: boolean }) {
  return (
    <span
      className="occasion"
      data-kind={occasion.kind}
      title={`${occasion.name} · ${occasionKindLabel[occasion.kind]}${occasion.region ? ` · ${occasion.region}` : ''}${occasion.approximate ? ' · قد يختلف يومًا حسب رؤية الهلال' : ''}`}
    >
      <PartyPopper size={11} aria-hidden />
      {!compact && <span>{occasion.name}</span>}
    </span>
  );
}

/** Platforms that actually published on a day, as glyphs with counts. */
export function ObservedMarks({ posts }: { posts: Post[] }) {
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

/* ── Plan chip (month cells) ───────────────────────────────────────── */

export function PlanChip({ plan, actions }: { plan: Plan; actions: CalendarActions }) {
  const draggable = canDrag(plan);
  return (
    <button
      type="button"
      className="chip"
      data-state={plan.computedState}
      data-dragging={actions.dragging === plan.id || undefined}
      draggable={draggable}
      style={{ '--p': platformColor(plan.platform) } as CSSProperties}
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
      <span className="chip__icon">
        <PlatformIcon platform={plan.platform} size={11} />
      </span>
      <time>{fmtTime(plan.ts)}</time>
      <span className="chip__title" dir="auto">
        {plan.title}
      </span>
      <span className="chip__type" aria-hidden>
        <TypeIcon type={plan.contentType} size={11} />
      </span>
      <span className="chip__state" aria-hidden />
    </button>
  );
}

/* ── Hover preview ─────────────────────────────────────────────────── */

export function HoverCard({ plan, anchor }: { plan: Plan; anchor: HTMLElement }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const box = anchor.getBoundingClientRect();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const gap = 10;
    let top = box.bottom + gap;
    if (top + height > window.innerHeight - 12) top = Math.max(12, box.top - height - gap);
    // Open toward the inline end (left in RTL) and stay inside the viewport.
    let left = box.right - width;
    left = Math.min(Math.max(12, left), window.innerWidth - width - 12);
    setPosition({ top, left });
  }, [anchor, plan]);

  return createPortal(
    <div
      ref={ref}
      className="hovercard glass glass--float"
      role="tooltip"
      style={{ '--p': platformColor(plan.platform), top: position?.top ?? -9999, left: position?.left ?? -9999 } as CSSProperties}
    >
      <header>
        <PlatformBadge platform={plan.platform} size="sm" />
        <span>
          <b dir="auto">{plan.title}</b>
          <small>
            {fmtWeekdayDate(plan.ts)} · {fmtTime(plan.ts)}
          </small>
        </span>
      </header>
      {plan.caption && (
        <p className="hovercard__caption" dir="auto">
          {plan.caption}
        </p>
      )}
      <div className="hovercard__meta">
        <StatePill state={plan.computedState} />
        <span className="meta-tag">
          <TypeIcon type={plan.contentType} /> {contentTypeLabel(plan.contentType)}
        </span>
        {plan.campaign && (
          <span className="meta-tag">
            <Megaphone size={12} /> {plan.campaign}
          </span>
        )}
        {plan.owner && (
          <span className="meta-tag">
            <UserRound size={12} /> {plan.owner}
          </span>
        )}
      </div>
      <footer>
        {canDrag(plan) && (
          <>
            <GripVertical size={12} /> اسحب لتغيير الموعد ·{' '}
          </>
        )}
        اضغط للتعديل
      </footer>
    </div>,
    document.body,
  );
}

export function SideSection({ title, icon, children, action }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="side-section">
      <header>
        <h3>
          {icon}
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}
