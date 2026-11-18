/**
 * An idea handed to Create's ready templates from another page (a competitor idea, an Odoo lecture or event).
 * Create opens on the templates with the idea written; the template the person picks makes the design and copy from it.
 */
import type { Channel } from '../../domain/shared';

export const TEMPLATE_IDEA_KEY = 'engosoft-template-idea';
export interface TemplateIdea { idea: string; channels?: Channel[] }

export function writeTemplateIdea(value: TemplateIdea) {
  try { sessionStorage.setItem(TEMPLATE_IDEA_KEY, JSON.stringify(value)); } catch { /* storage blocked: Create opens without the idea */ }
}

/** Reads and clears the handed idea, once. */
export function takeTemplateIdea(): TemplateIdea | null {
  try {
    const raw = sessionStorage.getItem(TEMPLATE_IDEA_KEY);
    sessionStorage.removeItem(TEMPLATE_IDEA_KEY);
    const parsed = raw ? (JSON.parse(raw) as TemplateIdea) : null;
    return parsed && typeof parsed.idea === 'string' && parsed.idea.trim() ? parsed : null;
  } catch {
    return null;
  }
}
