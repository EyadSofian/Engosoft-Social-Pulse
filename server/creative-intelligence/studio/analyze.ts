/** Vision pass for Studio: every text, flat UI shape and liftable object in a generated post, with boxes. */
import sharp from 'sharp';
import { openAIJson } from '../generation/provider.js';

export const STUDIO_ANALYSIS_VERSION = 'studio-analysis:v1';

export interface NormBox { x: number; y: number; width: number; height: number }
export interface StudioAnalysis {
  texts: { text: string; approved: string; box: NormBox; align: 'left' | 'center' | 'right'; weight: 'light' | 'regular' | 'bold' | 'extrabold'; shape: number }[];
  shapes: { kind: 'button' | 'pill' | 'badge' | 'panel' | 'tag' | 'bar'; box: NormBox; corners: 'square' | 'small' | 'large' | 'round'; shadow: boolean }[];
  objects: { label: string; box: NormBox }[];
  faces: NormBox[];
}

const box = { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } } };
const schema = {
  type: 'object', additionalProperties: false, required: ['texts', 'shapes', 'objects', 'faces'],
  properties: {
    texts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'approved', 'box', 'align', 'weight', 'shape'], properties: {
      text: { type: 'string' }, approved: { type: 'string' }, box,
      align: { type: 'string', enum: ['left', 'center', 'right'] }, weight: { type: 'string', enum: ['light', 'regular', 'bold', 'extrabold'] }, shape: { type: 'integer' },
    } } },
    shapes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'box', 'corners', 'shadow'], properties: {
      kind: { type: 'string', enum: ['button', 'pill', 'badge', 'panel', 'tag', 'bar'] }, box,
      corners: { type: 'string', enum: ['square', 'small', 'large', 'round'] }, shadow: { type: 'boolean' },
    } } },
    objects: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'box'], properties: { label: { type: 'string' }, box } } },
    faces: { type: 'array', items: box },
  },
};

export async function analyzeForStudio(png: Buffer, approvedCopy: string[], env = process.env): Promise<StudioAnalysis> {
  const jpeg = await sharp(png).resize({ width: 1280 }).jpeg({ quality: 90 }).toBuffer();
  return openAIJson<StudioAnalysis>({
    apiKey: env.OPENAI_API_KEY ?? '', model: env.OPENAI_VISION_MODEL?.trim() || 'gpt-5.5', reasoning: 'medium',
    schemaName: 'engosoft_studio_analysis', schema,
    instructions: [
      'You split a social media poster into editable layers. Coordinates are fractions of the image (0..1) from the top-left. Boxes must be TIGHT around the visible pixels of the element, never padded.',
      'texts: one entry per text block that shares a style (same color, size, weight). Write text exactly as rendered, with "\\n" between visual lines, keeping kashida (ـ) only if the letters are visibly stretched. Do not include arrows, bullets or icons, and skip lettering that is part of a 3D object, sign, product or screen (embossed, in perspective, lit): only flat typography laid over the picture. approved: the approved string this block shows (from the list given), or "" if none. align: how the block\'s lines line up visually. weight: stroke thickness. shape: index into shapes of the flat shape the text sits on, or -1.',
      'shapes: FLAT 2D interface shapes drawn behind text or icons: buttons, pills, badges, tags, info panels/cards, solid bars. Solid or simple two-color gradient fill only. Never 3D objects, photos, glows, the background, or the whole canvas. corners: square, small (slightly rounded), large (clearly rounded), round (fully rounded ends). shadow: a soft drop shadow is visible under it.',
      'objects: up to 8 distinct things in the picture a designer might move, resize or replace: people, devices, products, 3D icons, illustrations, landmarks. Not text, not flat shapes, not the background.',
      'faces: every human face.',
    ].join(' '),
    content: [
      { type: 'input_text', text: `Approved strings: ${JSON.stringify(approvedCopy)}` },
      { type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'high' },
    ],
  });
}
