/**
 * One typographic hierarchy for every prompt where the image model sets the words itself (reference designs, the AI
 * Create page). Left to itself the model sets every line in the headline's heavy weight, which crowds the post: here
 * only the headline is heavy, each other line has its own lighter weight and a size relative to the headline, and the
 * post keeps its white space. Designs copied exactly (a followed design) keep that design's own weights instead.
 */

export type TypeRole = 'headline' | 'support' | 'body' | 'cta' | 'detail';

/**
 * Sizes are given as a share of the canvas width (and in pixels for a 1080 px wide canvas), because "the largest" or
 * "half the headline" alone let the model blow the headline up to fill the space and everything else with it.
 */
const STYLE: Record<TypeRole, string> = {
  headline: 'headline: the ONLY heavy line, ExtraBold display weight, letters about 5% of the canvas width tall (about 50–60 px on a 1080 px canvas), each line no wider than about 75% of the canvas, at most two lines',
  support: 'supporting line: Medium weight (500), NOT bold, letters about 2.5% of the canvas width tall (about 26–30 px on 1080 px)',
  body: 'body text: Regular weight (400), letters about 2% of the canvas width tall (about 20–24 px on 1080 px), line spacing about 1.5, at most two lines',
  cta: 'call to action: SemiBold (600) inside a compact button or bar, letters about 2.2% of the canvas width tall (about 22–26 px on 1080 px)',
  detail: 'detail (date, time, place, link): Medium weight, letters about 2% of the canvas width tall (about 20–24 px on 1080 px), in a quiet info line or panel',
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
  'TYPE HIERARCHY: a clear contrast of weight and size, never every line bold, never oversized.',
  'Heavy weight belongs to the headline alone (and a highlighted word inside it); supporting lines are Medium, body text Regular, the button SemiBold, at the sizes listed for each.',
  'Never enlarge text to fill empty space: empty space is part of the design. All the text together covers at most about a third of the canvas; the picture and white space carry the rest.',
  'At most three weights on the post. Margins of at least 7% of the canvas width on each side and clear gaps between groups of text.',
  'When lines do not fit comfortably, make the supporting and body lines smaller and lighter, never heavier, tighter or squeezed.',
].join(' ');
