import type { CoursePick } from './CoursePicker';
import { runOf } from './CoursePicker';

/** What a picked course gives an AI design: the name (verbatim on the post) and the run's facts, one per line. */
export interface CourseFacts { course: string; facts: string; date: string; time: string; place: string }

/** The same words from a picked course on every screen, so the same pick makes the same request. */
export function courseFacts(pick: CoursePick): CourseFacts {
  const run = runOf(pick);
  const course = pick.type === 'course' ? pick.course.name : pick.event.title;
  const start = run ? new Date(run.startsAt) : null;
  const date = start ? start.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }) : '';
  const time = start ? start.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' }) : '';
  const place = run?.location ?? '';
  const facts = [date && `التاريخ: ${date}`, time && `الوقت: ${time}`, place && `المكان: ${place}`, run?.registrationUrl && `رابط التسجيل: ${run.registrationUrl}`].filter(Boolean).join('\n');
  return { course, facts, date, time, place };
}

export type FollowDesignInput = { templateId: string; surface?: string; photos?: { label: string; dataUrl: string }[] } | { name: string; dataUrl: string };

export interface FullCreativeInput {
  prompt: string;
  format: string;
  directions: 1 | 2;
  /** The course name: it goes on the post exactly as written and steers the Odoo lookup. */
  course?: string;
  /** Facts from a picked course (date, time, place, link), one per line. */
  facts?: string;
  followDesign?: FollowDesignInput;
  campaignId?: string;
  settings?: unknown;
  objective?: string;
  attachments?: { name: string; mime: string; dataUrl: string }[];
  templateId?: string;
}

/**
 * The body of `/api/ai/full-creative`, built in one place for the Create page and the template screen (audit #17):
 * the same request, the same course and facts, the same result whichever screen it came from.
 */
export function fullCreativeBody(input: FullCreativeInput): Record<string, unknown> {
  const course = input.course?.trim();
  const facts = input.facts?.trim();
  return {
    prompt: input.prompt.trim(),
    format: input.format,
    directions: input.directions,
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    ...(input.settings ? { settings: input.settings } : {}),
    ...(input.objective && input.objective !== 'auto' ? { objective: input.objective } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.followDesign ? { followDesign: input.followDesign } : {}),
    ...(course ? { course: course.slice(0, 160) } : {}),
    ...(facts ? { facts: facts.slice(0, 2000) } : {}),
  };
}
