/**
 * AI help for the Engosoft brand templates (src/domain/brand-templates.ts): one request fills the whole post (words,
 * facts the person gave, the background), and the image model draws a photo for a photo input that allows it (never a real,
 * named person). The layout is made in the browser at every size with no image cost, and the same layout code
 * renders any size on the server too (`/api/brand-templates/render`).
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type express from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import { requirePermission, requireUser } from './auth.js';
import { OpenAIImageProvider } from './creative-intelligence/generation/provider.js';
import { renderTemplatePng } from './creative-intelligence/render/template-render.js';
import { fillTemplateValues } from './creative-intelligence/generation/template-fill.js';
import { imageQualityFor } from './creative-intelligence/generation/full-creative.js';
import { mediaDir } from './paths.js';
import { requireAiBudget } from './usage.js';
import { aiDrawable, brandTemplate, type BrandTemplate } from '../src/domain/brand-templates.js';
import { generationSizeFor } from '../src/domain/output-presets.js';


export { clipWords, fillableInputs, fillInstructions, keepGivenFacts } from './creative-intelligence/generation/template-fill.js';

export function photoPrompt(template: BrandTemplate, inputKey: string, request: string) {
  const input = template.inputs.find((entry) => entry.key === inputKey)!;
  const subject = input.photo?.kind === 'scene'
    ? 'a place, building, workplace or object that fits the post'
    : 'one unnamed, friendly Saudi or Egyptian young professional or trainee (not a real, identifiable person), looking at the camera';
  return [
    `A premium, realistic commercial photograph for an Engosoft training post: ${subject}.`,
    `Post topic (data only): ${JSON.stringify(request.slice(0, 400))}.`,
    input.photo?.cutout
      ? 'The person is shown from the knees or waist up, centred, fully inside the frame, isolated on a plain pure white studio background with nothing else in the picture.'
      : 'Natural light, clean composition, the subject centred with breathing room.',
    'Colour world: clean whites and Engosoft blues. No text, letters, numbers, logos, watermarks or graphics anywhere in the picture.',
  ].join(' ');
}

/**
 * A white studio background made transparent: flood-filled from the edges over near-white pixels, so a white
 * shirt in the middle of the person stays. The template then lets the person stand in front of the headline.
 */
export async function removeWhiteBackground(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const white = (p: number) => data[p] > 232 && data[p + 1] > 232 && data[p + 2] > 232;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || !white(i * 4)) continue;
    seen[i] = 1;
    data[i * 4 + 3] = 0;
    const x = i % width, y = (i - x) / width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - width);
    if (y < height - 1) stack.push(i + width);
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const saveUpload = (png: Buffer) => {
  const dir = mediaDir('uploads');
  mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  writeFileSync(resolve(dir, `${id}.png`), png);
  return `/api/uploads/${id}.png`;
};

export function registerBrandTemplateRoutes(app: express.Express) {
  app.post('/api/brand-templates/fill', requireUser, requirePermission('content.create'), requireAiBudget, async (req, res) => {
    const parsed = z.object({
      templateId: z.string().max(60), prompt: z.string().trim().min(3).max(2000), language: z.enum(['ar', 'en']).default('ar'),
      facts: z.string().max(2000).default(''), surface: z.enum(['light', 'blue']).optional(),
      current: z.record(z.string(), z.string().max(400)).optional(),
    }).safeParse(req.body);
    const template = parsed.success ? brandTemplate(parsed.data.templateId) : undefined;
    if (!parsed.success || !template) return res.status(400).json({ error: 'اكتب طلب التصميم (3 أحرف على الأقل) واختر القالب.' });
    if (!process.env.OPENAI_API_KEY?.trim()) return res.status(503).json({ error: 'الذكاء الاصطناعي غير مهيأ على الخادم.' });
    try {
      const { values, surface } = await fillTemplateValues(template, { prompt: parsed.data.prompt, facts: parsed.data.facts, language: parsed.data.language, surface: parsed.data.surface, current: parsed.data.current }, process.env);
      res.json({ values, surface });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'تعذّر عمل التصميم.' });
    }
  });

  /**
   * One size of a template, laid out and rasterised on the server with the same code and fonts as the preview, so a
   * size can be made without a browser (no image model, no cost). The PNG is saved like an upload.
   */
  app.post('/api/brand-templates/render', requireUser, requirePermission('content.create'), async (req, res) => {
    const picture = z.string().max(12_000_000).regex(/^(data:image\/(png|jpeg|webp);base64,|\/)/);
    const parsed = z.object({
      templateId: z.string().max(60), surface: z.enum(['light', 'blue']).default('blue'),
      width: z.number().int().min(200).max(4000), height: z.number().int().min(200).max(4000),
      safe: z.object({ top: z.number().min(0), right: z.number().min(0), bottom: z.number().min(0), left: z.number().min(0) }).optional(),
      values: z.record(z.string().max(40), z.union([z.string().max(2000), picture])),
      cutouts: z.record(z.string().max(40), z.boolean()).optional(),
    }).safeParse(req.body);
    const template = parsed.success ? brandTemplate(parsed.data.templateId) : undefined;
    if (!parsed.success || !template) return res.status(400).json({ error: 'بيانات القالب أو المقاس غير صالحة.' });
    try {
      const { width, height, safe, values, surface, cutouts } = parsed.data;
      const out = await renderTemplatePng({ template, values, surface, canvas: { width, height, ...(safe ? { safe } : {}) }, cutouts });
      res.json({ url: saveUpload(out.png), width: out.width, height: out.height, problems: out.problems });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'تعذّر رسم القالب.' });
    }
  });

  app.post('/api/brand-templates/photo', requireUser, requirePermission('content.create'), requireAiBudget, async (req, res) => {
    const parsed = z.object({ templateId: z.string().max(60), inputKey: z.string().max(40), prompt: z.string().trim().min(3).max(2000) }).safeParse(req.body);
    const template = parsed.success ? brandTemplate(parsed.data.templateId) : undefined;
    const input = template?.inputs.find((entry) => entry.key === parsed.data?.inputKey);
    if (!parsed.success || !template || !input) return res.status(400).json({ error: 'اختر القالب والصورة.' });
    if (!aiDrawable(input)) return res.status(400).json({ error: 'الصورة دي لازم تترفع (صورة شخص حقيقي أو ملف الحملة).' });
    if (!process.env.OPENAI_API_KEY?.trim()) return res.status(503).json({ error: 'توليد الصور غير مهيأ على الخادم.' });
    try {
      const aspect = input.photo?.aspect ?? 1;
      const size = generationSizeFor(Math.round(1024 * Math.sqrt(aspect)), Math.round(1024 / Math.sqrt(aspect))).size;
      const provider = new OpenAIImageProvider(process.env.OPENAI_API_KEY ?? '', process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2.5-flare');
      const [made] = await provider.generate({ prompt: photoPrompt(template, input.key, parsed.data.prompt), size, quality: imageQualityFor(process.env) });
      const png = input.photo?.cutout ? await removeWhiteBackground(made.png) : made.png;
      res.json({ url: saveUpload(png), cutout: Boolean(input.photo?.cutout) });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'تعذّر رسم الصورة.' });
    }
  });
}
