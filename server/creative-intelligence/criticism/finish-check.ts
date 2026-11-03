/**
 * The last look at a finished post, after the official logo and the campaign stamp were composited on top: does
 * anything we added cover, touch or crowd the text, the button, a face or the subject, and is anything cut off?
 * The first inspection runs before the overlays exist, so without this pass nobody sees the final layout.
 */
import sharp from 'sharp';
import { openAIJson } from '../generation/provider.js';

interface NormBox { x: number; y: number; width: number; height: number }
export interface Overlay { name: 'logo' | 'stamp'; box: NormBox }
export interface FinishProblem {
  /** What causes it: one of the overlays we added, or the design itself. */
  source: 'logo' | 'stamp' | 'design';
  issue: string;
  /** The element that is covered or crowded, as fractions of the image. */
  box: NormBox;
}

const box = { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } } };
const schema = {
  type: 'object', additionalProperties: false, required: ['problems'],
  properties: { problems: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['source', 'issue', 'box'], properties: { source: { type: 'string', enum: ['logo', 'stamp', 'design'] }, issue: { type: 'string' }, box } } } },
};

/** CREATIVE_FINAL_CHECK=off skips the pass (one small vision call per finished image). */
export const finishCheckOn = (env: NodeJS.ProcessEnv = process.env) => env.CREATIVE_FINAL_CHECK?.trim() !== 'off';

export async function checkFinish(png: Buffer, overlays: Overlay[], env: NodeJS.ProcessEnv = process.env): Promise<FinishProblem[]> {
  const jpeg = await sharp(png).resize({ width: 1024 }).jpeg({ quality: 88 }).toBuffer();
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const placed = overlays.map((o) => `${o.name === 'logo' ? 'the official Engosoft logo' : 'the campaign stamp (slogan / hashtag sticker)'} at x ${pct(o.box.x)}–${pct(o.box.x + o.box.width)}, y ${pct(o.box.y)}–${pct(o.box.y + o.box.height)}`).join('; ');
  const result = await openAIJson<{ problems: FinishProblem[] }>({
    apiKey: env.OPENAI_API_KEY ?? '', model: env.OPENAI_VISION_MODEL?.trim() || 'gpt-5.5', reasoning: 'low',
    schemaName: 'engosoft_finish_check', schema,
    instructions: [
      'You check the final layout of a finished social media post before it is published. Coordinates are fractions of the image (0..1) from the top-left.',
      `These were composited on top of the design afterwards: ${placed || 'nothing'}.`,
      'Report only real layout collisions a viewer would notice: an overlay that covers, overlaps, touches or crowds (almost no gap) any text, the call-to-action button, a face or the main subject; an overlay cut off by the canvas edge; text or the button cut off by the canvas edge or covered by another element.',
      'source: logo or stamp when that overlay causes it, design when it is in the design itself. box: the element that is covered or crowded. issue: one short sentence naming both elements.',
      'Do not judge style, colours or spelling. Return an empty list when the layout is clean.',
    ].join(' '),
    content: [{ type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'high' }],
  });
  return result.problems ?? [];
}
