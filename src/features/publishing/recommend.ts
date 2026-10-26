import { DateTime } from 'luxon';
import type { Channel } from '../../domain/shared';
import { bestSlots, summarize } from '../../lib/analytics';
import { businessZone, dayNumber } from '../../lib/format';
import type { Platform, Post } from '../../types';

export interface Recommendation {
  /** Next occurrence of the slot, UTC ISO. */
  at: string;
  /** Luxon weekday, or 0 when the history only supports an hour of any day. */
  weekday: number;
  hour: number;
  /** Posts behind the slot and behind the whole comparison. */
  samples: number;
  basis: number;
  platforms: Platform[];
  /** Slot average vs. the average of all measured posts, in percent; null without a baseline. */
  lift: number | null;
  confidence: 'low' | 'medium' | 'high';
}

/**
 * The best-performing weekday/hour from measured posts on the same platforms.
 * Returns null when the history is too thin to say anything; never guesses.
 */
export function recommendSlot(posts: Post[], channels: Channel[], nowMs: number): Recommendation | null {
  const platforms = channels.filter((channel): channel is Platform => channel !== 'linkedin');
  const pool = posts.filter((post) => platforms.includes(post.platform));
  const slots = bestSlots(pool, dayNumber(nowMs));
  const slot = slots.find((entry) => entry.average > 0);
  if (!slot) return null;
  const measured = pool.filter((post) => post.measured);
  const overall = summarize(measured).average;
  const now = DateTime.fromMillis(nowMs, { zone: businessZone() });
  let at = now.set({ hour: slot.hour, minute: 0, second: 0, millisecond: 0 });
  if (slot.weekday) at = at.plus({ days: (slot.weekday - now.weekday + 7) % 7 });
  if (at <= now.plus({ hours: 1 })) at = at.plus({ days: slot.weekday ? 7 : 1 });
  return {
    at: at.toUTC().toISO() ?? '',
    weekday: slot.weekday,
    hour: slot.hour,
    samples: slot.posts,
    basis: measured.length,
    platforms: [...new Set(pool.map((post) => post.platform))],
    lift: overall ? ((slot.average - overall) / overall) * 100 : null,
    confidence: slot.posts >= 8 ? 'high' : slot.posts >= 4 ? 'medium' : 'low',
  };
}
