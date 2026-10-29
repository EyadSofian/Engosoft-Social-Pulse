import { isGoal, type Goal } from '../../domain/goals';
import type { Plan, PlanPlatform } from '../../types';

/**
 * A planned post nobody has made yet. One spreadsheet line for several platforms arrives as one plan row per
 * platform; rows with the same title and time are one planned post, so they show and count once.
 */
export interface Slot { id: string; ids: string[]; title: string; caption: string; platforms: PlanPlatform[]; goal: Goal | null; scheduledAt: string; ms: number }

export function planSlots(plans: Plan[]): Slot[] {
  const slots = new Map<string, Slot>();
  for (const plan of plans) {
    if (plan.status === 'cancelled' || plan.status === 'published' || plan.notes.startsWith('content:')) continue;
    const key = `${plan.title.trim()}|${plan.scheduledAt}`;
    const slot = slots.get(key);
    if (slot) { slot.ids.push(plan.id); if (!slot.platforms.includes(plan.platform)) slot.platforms.push(plan.platform); slot.goal ??= isGoal(plan.goal) ? plan.goal : null; continue; }
    slots.set(key, { id: plan.id, ids: [plan.id], title: plan.title, caption: plan.caption, platforms: [plan.platform], goal: isGoal(plan.goal) ? plan.goal : null, scheduledAt: plan.scheduledAt, ms: plan.ts });
  }
  return [...slots.values()];
}
