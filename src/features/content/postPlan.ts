import type { Goal } from '../../domain/goals';
import type { Channel } from '../content-pipeline/types';

/**
 * The plan of the post being created: its goal, planned day, and the calendar plan row it fulfils. Create keeps
 * it here while the person designs, so every way of creating (AI, template, upload) saves the same plan.
 */
export interface PostPlan { goal: Goal | null; plannedFor: string | null; slotId: string | null; slotTitle?: string; channels?: Channel[] }

const KEY = 'engosoft-post-plan';
const EMPTY: PostPlan = { goal: null, plannedFor: null, slotId: null };

export function readPostPlan(): PostPlan {
  try { return { ...EMPTY, ...(JSON.parse(sessionStorage.getItem(KEY) || 'null') ?? {}) }; } catch { return EMPTY; }
}
export function writePostPlan(plan: PostPlan) {
  try { sessionStorage.setItem(KEY, JSON.stringify(plan)); } catch { /* kept for this page only */ }
}
export function clearPostPlan() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing stored */ }
}
/** The plan fields a "create post" request sends; the plan is used once. */
export function takePostPlan(): { goal?: Goal; plannedFor?: string; slotId?: string } {
  const plan = readPostPlan();
  clearPostPlan();
  return { ...(plan.goal ? { goal: plan.goal } : {}), ...(plan.plannedFor ? { plannedFor: plan.plannedFor } : {}), ...(plan.slotId ? { slotId: plan.slotId } : {}) };
}
