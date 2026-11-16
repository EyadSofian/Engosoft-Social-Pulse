/**
 * One typographic hierarchy for every prompt where the image model sets the words itself (reference designs, the AI
 * Create page). Left to itself the model sets every line in the headline's heavy weight, which crowds the post: here
 * only the headline is heavy, each other line has its own lighter weight and a size relative to the headline, and the
 * post keeps its white space. Designs copied exactly (a followed design) keep that design's own weights instead.
 */

export type TypeRole = 'headline' | 'support' | 'body' | 'cta' | 'detail';

const STYLE: Record<TypeRole, string> = {
  headline: 'headline: the ONLY heavy line, ExtraBold/Black display weight, the largest type on the post; it may take two lines',
  support: 'supporting line: Medium weight (500), NOT bold, about half the headline size',
  body: 'body text: Regular weight (400), about a third of the headline size, line spacing about 1.5, at most two lines',
  cta: 'call to action: SemiBold (600) inside its button or bar, about 40% of the headline size',
  detail: 'detail (date, time, place, link): Medium weight, about a third of the headline size, in a quiet info line or panel',
};

/** The weight and size of one line, in words the image model follows. */
export const typeStyle = (role: TypeRole) => STYLE[role];

/** The role a template field plays, from its key. */
export function roleOfField(key: string): TypeRole {
  if (key === 'title' || key === 'headline') return 'headline';
  if (key === 'cta') return 'cta';
  if (['body', 'objectives', 'audience', 'outcomes'].includes(key)) return 'body';
  if (['date', 'time', 'place', 'link', 'price'].includes(key)) return 'detail';
  return 'support';
}

/** The rule every such prompt carries, after its list of lines. */
export const TYPE_HIERARCHY = [
  'TYPE HIERARCHY: a clear contrast of weight and size, never every line bold.',
  'Heavy weight belongs to the headline alone (and a highlighted word inside it); supporting lines are Medium, body text Regular, the button SemiBold, each smaller than the headline as listed for it.',
  'At most three weights on the post. Generous white space: margins of at least 7% of the canvas width on each side, clear gaps between groups of text, and at least 40% of the canvas free of text.',
  'When lines do not fit comfortably, make the supporting and body lines smaller and lighter, never heavier, tighter or squeezed.',
].join(' ');
