/** Vision pass over a generated creative: where text, faces and subjects are, what text it shows, and visible defects. */
import sharp from 'sharp';
import { openAIJson } from '../generation/provider.js';
import type { ContentZone } from '../logo-resolution/validator.js';

export const INSPECTOR_VERSION = 'creative-inspector:v1';

interface NormBox { x: number; y: number; width: number; height: number }
export interface CreativeInspection {
  texts: { text: string; box: NormBox }[];
  faces: NormBox[];
  subjects: { label: string; box: NormBox }[];
  logosOrWatermarks: { description: string; box: NormBox }[];
  /** Letter-by-letter audit of each approved string against the pixels. */
  copyAudit: { expected: string; rendered: string; exact: boolean }[];
  defects: string[];
  scores: { design: number; marketing: number; imageQuality: number; brandFit: number };
  verdict: 'accept' | 'repair' | 'regenerate';
  summary: string;
}

const box = { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } } };
const schema = {
  type: 'object', additionalProperties: false,
  required: ['texts', 'faces', 'subjects', 'logosOrWatermarks', 'copyAudit', 'defects', 'scores', 'verdict', 'summary'],
  properties: {
    texts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'box'], properties: { text: { type: 'string' }, box } } },
    faces: { type: 'array', items: box },
    subjects: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'box'], properties: { label: { type: 'string' }, box } } },
    logosOrWatermarks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['description', 'box'], properties: { description: { type: 'string' }, box } } },
    copyAudit: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['expected', 'rendered', 'exact'], properties: { expected: { type: 'string' }, rendered: { type: 'string' }, exact: { type: 'boolean' } } } },
    defects: { type: 'array', items: { type: 'string' } },
    scores: { type: 'object', additionalProperties: false, required: ['design', 'marketing', 'imageQuality', 'brandFit'], properties: { design: { type: 'number' }, marketing: { type: 'number' }, imageQuality: { type: 'number' }, brandFit: { type: 'number' } } },
    verdict: { type: 'string', enum: ['accept', 'repair', 'regenerate'] },
    summary: { type: 'string' },
  },
};

export async function inspectCreative(png: Buffer, context: string, env = process.env, approvedCopy: string[] = []): Promise<CreativeInspection> {
  const jpeg = await sharp(png).resize({ width: 1024 }).jpeg({ quality: 88 }).toBuffer();
  return openAIJson<CreativeInspection>({
    apiKey: env.OPENAI_API_KEY ?? '', model: env.OPENAI_VISION_MODEL?.trim() || 'gpt-5.5', reasoning: 'low',
    schemaName: 'engosoft_creative_inspection', schema,
    instructions: [
      'You inspect a generated social media poster for production. Coordinates are fractions of the image (0..1) from the top-left; boxes must fully contain their element.',
      'texts: every separate piece of visible text, transcribed exactly as rendered — including misspellings, broken Arabic letter joins and wrong digits. Never correct it.',
      'faces: every human face. subjects: important people, objects, devices or graphics a logo must not cover — never the background, environment or whole scene.',
      'logosOrWatermarks: any logo, brand mark, emblem, wordmark or watermark drawn in the image (the real logo is added later, so any here is a defect).',
      'copyAudit: for each approved string given, find where it is rendered and compare letter by letter (ignore line breaks, diacritics, and where numbers sit within right-to-left text). rendered = exactly what the pixels show, including doubled, missing or swapped letters; exact = false on any letter difference. Image models often misspell Arabic (e.g. باحترارف for باحتراف): look closely.',
      'defects: concrete visible problems (deformed hands/faces, garbled text, fake UI, cut-off subject, clutter). Scores 0-10, strict: 8+ only for work a senior designer would publish.',
    ].join(' '),
    content: [{ type: 'input_text', text: `Intended creative: ${context.slice(0, 2000)}\nApproved strings to audit: ${JSON.stringify(approvedCopy)}` }, { type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'high' }],
  });
}

/** Inspection boxes as pixel content zones for the logo validator, inflated a little for box error. */
export function zonesFromInspection(inspection: CreativeInspection, width: number, height: number): ContentZone[] {
  const px = (b: NormBox, kind: ContentZone['kind'], label?: string): ContentZone => {
    const padX = 0.015 * width, padY = 0.015 * height;
    return { kind, label, box: { x: b.x * width - padX, y: b.y * height - padY, width: b.width * width + 2 * padX, height: b.height * height + 2 * padY } };
  };
  // A "subject" covering most of the canvas is the background or scene, not something the logo must avoid.
  const isScene = (b: NormBox) => b.width * b.height > 0.45;
  return [
    ...inspection.texts.map((t) => px(t.box, 'text', t.text.slice(0, 40))),
    ...inspection.faces.map((f) => px(f, 'face')),
    ...inspection.subjects.filter((s) => !isScene(s.box)).map((s) => px(s.box, 'subject', s.label)),
    ...inspection.logosOrWatermarks.map((l) => px(l.box, 'salient', l.description)),
  ];
}
