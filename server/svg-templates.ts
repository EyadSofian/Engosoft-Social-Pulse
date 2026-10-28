/**
 * SVG templates: an AI model designs a reusable, editable post layout once (from a prompt or a reference image);
 * after that every post from it is filled and exported in the browser with no image-model spend. Text, dates and
 * links are `data-field` slots that Odoo events can fill automatically; the logo slot always takes the official file.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import type express from 'express';
import { z } from 'zod';
import { requirePermission, requireUser, userCan } from './auth.js';
import { openAIJson } from './creative-intelligence/generation/provider.js';
import { db, defineColumn, defineSchema } from './db.js';
import { mediaDir } from './paths.js';
import { requireAiBudget } from './usage.js';

defineSchema(`CREATE TABLE IF NOT EXISTS svg_templates (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', format TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
 svg TEXT NOT NULL, fields_json TEXT NOT NULL DEFAULT '[]', source_prompt TEXT NOT NULL DEFAULT '', department_id TEXT, created_by TEXT NOT NULL,
 usage_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`);

defineColumn('svg_templates', 'kind', "TEXT NOT NULL DEFAULT 'general'");
defineColumn('svg_templates', 'source_image', 'TEXT');
defineColumn('svg_templates', 'retired', 'INTEGER NOT NULL DEFAULT 0');

/** What a template is for. The Operations team picks the kind of post first, then only sees templates of that kind. */
export const TEMPLATE_KINDS = ['course', 'event', 'graduation', 'announcement', 'general'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_FORMATS = {
  feed: { width: 1080, height: 1350, label: 'Feed post 4:5 (Instagram, Facebook, LinkedIn)' },
  square: { width: 1080, height: 1080, label: 'Square 1:1' },
  story: { width: 1080, height: 1920, label: 'Story / status 9:16 (WhatsApp, TikTok, Snapchat). Keep the top 230px and bottom 330px free of text.' },
  landscape: { width: 1200, height: 630, label: 'Website / link banner 1.91:1' },
} as const;
export type TemplateFormat = keyof typeof TEMPLATE_FORMATS;

const FIELD_TYPES = ['text', 'multiline', 'date', 'time', 'url', 'image'] as const;
const FIELD_SOURCES = ['manual', 'odoo.title', 'odoo.date', 'odoo.time', 'odoo.location', 'odoo.link', 'course.objectives', 'course.audience', 'course.outcomes'] as const;
const field = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  label: z.string().min(1).max(60),
  type: z.enum(FIELD_TYPES),
  source: z.enum(FIELD_SOURCES),
  sample: z.string().max(400),
  maxChars: z.number().int().min(1).max(600),
});
export type TemplateField = z.infer<typeof field>;
export interface SvgTemplate { id: string; name: string; description: string; kind: TemplateKind; format: TemplateFormat; width: number; height: number; svg: string; fields: TemplateField[]; sourceImage?: string; sourcePrompt: string; departmentId: string | null; createdBy: string; usageCount: number; createdAt: string; updatedAt: string }

const toTemplate = (r: Record<string, unknown>): SvgTemplate => ({
  id: String(r.id), name: String(r.name), description: String(r.description), kind: (TEMPLATE_KINDS as readonly string[]).includes(String(r.kind)) ? r.kind as TemplateKind : 'general', format: r.format as TemplateFormat, width: Number(r.width), height: Number(r.height),
  svg: String(r.svg), fields: JSON.parse(String(r.fields_json || '[]')) as TemplateField[], sourcePrompt: String(r.source_prompt), departmentId: (r.department_id as string | null) ?? null,
  ...(r.source_image ? { sourceImage: String(r.source_image) } : {}),
  createdBy: String(r.created_by), usageCount: Number(r.usage_count), createdAt: String(r.created_at), updatedAt: String(r.updated_at),
});
export const getTemplate = async (id: string) => { const r = await db.get('SELECT * FROM svg_templates WHERE id=?', [id]); return r ? toTemplate(r) : undefined; };

/**
 * Keeps an SVG inert: no scripts, event handlers, foreign HTML or outside URLs. Images may only point at
 * embedded data, the brand folder or uploads. Throws when the result is not a usable template.
 */
export function sanitizeSvg(input: string, width: number, height: number): string {
  let svg = input.trim().replace(/^```(?:svg|xml)?\s*|```$/g, '').trim();
  svg = svg.replace(/<\?xml[^>]*>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  svg = svg.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script[^>]*\/>/gi, '');
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  svg = svg.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  svg = svg.replace(/javascript:/gi, '');
  svg = svg.replace(/@import[^;]+;/gi, '');
  svg = svg.replace(/\s(xlink:href|href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, attr: string, _q, a?: string, b?: string) => {
    const url = (a ?? b ?? '').trim();
    return url.startsWith('#') || url.startsWith('data:image/') || url.startsWith('/brand/') || /^\/post-assets\/[a-z0-9-]+\.(jpg|png|webp)$/.test(url) || url.startsWith('/api/uploads/') ? ` ${attr === 'xlink:href' ? 'href' : attr}="${url}"` : '';
  });
  svg = svg.replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, 'none');
  const start = svg.search(/<svg[\s>]/i);
  const end = svg.toLowerCase().lastIndexOf('</svg>');
  if (start < 0 || end < 0) throw new Error('The model did not return an SVG');
  svg = svg.slice(start, end + 6);
  // The canvas is fixed by the format so exports always have the platform's exact size.
  svg = svg.replace(/<svg([^>]*)>/i, (_m, attrs: string) => {
    const kept = attrs.replace(/\s(width|height|viewBox|xmlns(:xlink)?)\s*=\s*("[^"]*"|'[^']*')/gi, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${kept}>`;
  });
  if (svg.length > 200_000) throw new Error('The SVG is too large');
  return fixRtlAnchors(svg);
}

/** rtl + end anchors the left edge in SVG; templates mean right-aligned, so store them as rtl + start. */
const fixRtlAnchors = (svg: string) => svg.replace(/<text\b[^>]*>/g, (tag) => /direction=["']rtl["']/.test(tag) ? tag.replace(/text-anchor=["']end["']/, 'text-anchor="start"') : tag);

const keepDeclaredFields = (svg: string, fields: TemplateField[]) => fields.filter((f) => new RegExp(`data-field=["']${f.key}["']`).test(svg));

const DESIGN_RULES = `You are the senior art director of Engosoft, an Egyptian/Saudi professional-training company (Odoo, PMP, CFM, HR, finance, IT courses). You design ONE reusable social-media post template as a complete standalone SVG that will be filled with different text many times, so the layout must hold up with longer or shorter copy.

Output rules:
- Root: <svg xmlns="http://www.w3.org/2000/svg" width=W height=H viewBox="0 0 W H"> with the exact size given.
- Brand palette: primary blue #0046FF, deep blue #001BB7, navy #031040, accent orange #FF6600 (sparingly: one highlight), white #FFFFFF, ink #17191C, light blue tint #EBF0FF. Gradients, soft glows (feGaussianBlur), geometric shapes, abstract lines, grids, circles and badges are welcome. Make it look premium and modern, like a top agency made it: strong hierarchy, generous whitespace, one clear focal point, depth (layered shapes, subtle shadows), never clip art.
- No raster images except: the logo slot, and an optional photo slot only if the request needs a person or product photo.
- Typography: font-family="Almarai" for Arabic (font-weight 400, 700 or 800), font-family="Plus Jakarta Sans" for Latin words and numbers. Right-aligned Arabic text uses direction="rtl" with text-anchor="start" at the right margin (x = W - margin, or the right edge of its box): in SVG, "start" is the right edge for rtl text and "end" would push it off the canvas. Centered text uses text-anchor="middle". Leave room: a single-line field's data-max-width must fit inside its box and the canvas. Headlines 64-110px, supporting text 30-44px, small details 24-30px. Text margin at least 64px from every edge.
- Every piece of text that changes between posts is a <text data-field="KEY" ...> containing realistic sample copy (Arabic unless the request says English). Single-line fields get data-max-width="PX" (the renderer shrinks the font to fit). Paragraph fields get data-max-width="PX" data-line-height="PX" data-max-lines="N" and are written as one line of sample text (the renderer wraps it). Fixed decorative words may be plain <text> without data-field.
- Dates, times, location and registration link are separate fields so an Odoo event can fill them: use keys like title, subtitle, date, time, location, cta, link, instructor, price, body.
- Logo: exactly one <image data-role="logo" data-variant="lockup-reversed" x y width height preserveAspectRatio="xMidYMid meet"/> (use lockup-reversed on dark or blue backgrounds, lockup-positive on light backgrounds; lockup aspect ratio is 1.57:1, width 160-240px), placed in a calm corner with clear space around it. Never draw or imitate the Engosoft logo yourself, and never show any other brand's logo.
- A photo slot, if used: <image data-field="photo" data-type="image" x y width height preserveAspectRatio="xMidYMid slice" clip-path="url(#...)"/> with no href.
- Forbidden: <script>, <foreignObject>, event attributes, external URLs or fonts, embedded raster data, text converted to paths.
- Course goals: when the post is about a course, add fields with source course.objectives (the course's learning goals), course.outcomes (what the trainee leaves with) or course.audience (who it is for). Use multiline fields with data-max-lines for them; they are filled from the course profile that marketing maintains, so never invent them.
- fields[] must list every data-field key in the SVG, in reading order, with an Arabic label, the type (text, multiline, date, time, url, image), the source (odoo.title, odoo.date, odoo.time, odoo.location, odoo.link when an Odoo event can fill it, else manual), the sample text and a sensible maxChars.`;

const designSchema = {
  type: 'object', additionalProperties: false, required: ['name', 'description', 'svg', 'fields'],
  properties: {
    name: { type: 'string' }, description: { type: 'string' }, svg: { type: 'string' },
    fields: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'label', 'type', 'source', 'sample', 'maxChars'], properties: {
      key: { type: 'string' }, label: { type: 'string' }, type: { type: 'string', enum: [...FIELD_TYPES] }, source: { type: 'string', enum: [...FIELD_SOURCES] }, sample: { type: 'string' }, maxChars: { type: 'integer' },
    } } },
  },
};
interface Design { name: string; description: string; svg: string; fields: TemplateField[] }

function templateModel(env: NodeJS.ProcessEnv) {
  const model = env.OPENAI_TEMPLATE_MODEL?.trim() || 'gpt-5';
  return { model, reasoning: /^(gpt-5|o\d)/.test(model) ? ('low' as const) : undefined };
}

async function design(input: { instructions: string; text: string; image?: string; format: TemplateFormat }) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('أضف OPENAI_API_KEY على الخادم.');
  const size = TEMPLATE_FORMATS[input.format];
  const { model, reasoning } = templateModel(process.env);
  const result = await openAIJson<Design>({
    apiKey: key, model, reasoning, instructions: input.instructions, schemaName: 'engosoft_svg_template', schema: designSchema,
    content: [
      { type: 'input_text', text: `${input.text}\n\nCanvas: ${size.width}x${size.height} — ${size.label}.` },
      ...(input.image ? [{ type: 'input_image' as const, image_url: input.image, detail: 'high' as const }] : []),
    ],
  });
  const svg = sanitizeSvg(result.svg, size.width, size.height);
  const fields = keepDeclaredFields(svg, z.array(field).parse(result.fields.map((f) => ({ ...f, key: f.key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 31), maxChars: Math.min(600, Math.max(1, f.maxChars)) }))));
  return { name: result.name.slice(0, 120), description: result.description.slice(0, 500), svg, fields };
}

const imageDataUrl = z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(14_000_000);

export function registerSvgTemplateRoutes(app: express.Express) {
  app.get('/api/svg-templates', requireUser, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json((await db.all('SELECT * FROM svg_templates WHERE retired=0 ORDER BY usage_count DESC, updated_at DESC')).map(toTemplate));
  });
  app.get('/api/svg-templates/:id', requireUser, async (req, res) => {
    const template = await getTemplate(String(req.params.id));
    if (!template) return res.status(404).json({ error: 'القالب غير موجود.' });
    res.json(template);
  });

  app.post('/api/svg-templates/generate', requireUser, requirePermission('design.free'), requireAiBudget, async (req, res) => {
    const parsed = z.object({ prompt: z.string().trim().min(5).max(2000), format: z.enum(['feed', 'square', 'story', 'landscape']).default('feed'), kind: z.enum(TEMPLATE_KINDS).default('general'), reference: imageDataUrl.optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اكتب وصف القالب (5 أحرف على الأقل) واختر المقاس.' });
    try {
      const { prompt, format, kind, reference } = parsed.data;
      const text = reference
        ? `Design request: ${prompt}\n\nThe attached image is a reference. Recreate its layout idea, hierarchy and mood as an original editable Engosoft template (do not copy other brands, logos or photos; turn its text into data-field slots).`
        : `Design request: ${prompt}`;
      const result = await design({ instructions: DESIGN_RULES, text, image: reference, format });
      const id = randomUUID(), now = new Date().toISOString(), size = TEMPLATE_FORMATS[format];
      await db.run('INSERT INTO svg_templates (id,name,description,kind,format,width,height,svg,fields_json,source_prompt,department_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, result.name || 'قالب جديد', result.description, kind, format, size.width, size.height, result.svg, JSON.stringify(result.fields), prompt, req.user!.departmentId, req.user!.id, now, now]);
      res.status(201).json(await getTemplate(id));
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'تعذّر تصميم القالب.' });
    }
  });

  app.post('/api/svg-templates/:id/revise', requireUser, requirePermission('design.free'), requireAiBudget, async (req, res) => {
    const template = await getTemplate(String(req.params.id));
    if (!template) return res.status(404).json({ error: 'القالب غير موجود.' });
    const parsed = z.object({ instruction: z.string().trim().min(3).max(1000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اكتب التعديل المطلوب.' });
    try {
      const result = await design({
        instructions: `${DESIGN_RULES}\n\nYou are revising an existing template. Apply the requested change, keep everything else (layout, data-field keys, logo slot) unless the change requires otherwise, and return the full updated SVG and fields.`,
        text: `Requested change: ${parsed.data.instruction}\n\nCurrent fields: ${JSON.stringify(template.fields)}\n\nCurrent SVG:\n${template.svg}`,
        format: template.format,
      });
      await db.run('UPDATE svg_templates SET svg=?, fields_json=?, updated_at=? WHERE id=?', [result.svg, JSON.stringify(result.fields), new Date().toISOString(), template.id]);
      res.json(await getTemplate(template.id));
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'تعذّر تعديل القالب.' });
    }
  });

  app.put('/api/svg-templates/:id', requireUser, requirePermission('design.free'), async (req, res) => {
    const template = await getTemplate(String(req.params.id));
    if (!template) return res.status(404).json({ error: 'القالب غير موجود.' });
    if (template.createdBy !== req.user!.id && !userCan(req.user!, 'templates.manage')) return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا القالب.' });
    const parsed = z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(500).default(''), kind: z.enum(TEMPLATE_KINDS).optional(), svg: z.string().min(20).max(200_000), fields: z.array(field).max(30) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'بيانات القالب غير صالحة.' });
    let svg: string;
    try { svg = sanitizeSvg(parsed.data.svg, template.width, template.height); } catch { return res.status(400).json({ error: 'شيفرة SVG غير صالحة.' }); }
    await db.run('UPDATE svg_templates SET name=?, description=?, kind=?, svg=?, fields_json=?, updated_at=? WHERE id=?',
      [parsed.data.name, parsed.data.description, parsed.data.kind ?? template.kind, svg, JSON.stringify(keepDeclaredFields(svg, parsed.data.fields)), new Date().toISOString(), template.id]);
    res.json(await getTemplate(template.id));
  });
  app.delete('/api/svg-templates/:id', requireUser, requirePermission('design.free'), async (req, res) => {
    const template = await getTemplate(String(req.params.id));
    if (!template) return res.status(404).json({ error: 'القالب غير موجود.' });
    if (template.createdBy !== req.user!.id && !userCan(req.user!, 'templates.manage')) return res.status(403).json({ error: 'لا تملك صلاحية حذف هذا القالب.' });
    await db.run('DELETE FROM svg_templates WHERE id=?', [template.id]);
    res.json({ deleted: true });
  });
  app.post('/api/svg-templates/:id/used', requireUser, async (req, res) => {
    await db.run('UPDATE svg_templates SET usage_count = usage_count + 1 WHERE id=?', [String(req.params.id)]);
    res.json({ ok: true });
  });

  /** Finished post images exported in the browser (template posts) are stored here and referenced by content items. */
  app.post('/api/uploads', requireUser, requirePermission('content.create'), async (req, res) => {
    const parsed = z.object({ dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(16_000_000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اختر صورة PNG أو JPEG أو WebP أقل من 12 ميجابايت.' });
    let png: Buffer;
    try { png = await sharp(Buffer.from(parsed.data.dataUrl.split(',')[1], 'base64'), { limitInputPixels: 40_000_000 }).rotate().png().toBuffer(); }
    catch { return res.status(400).json({ error: 'تعذّر قراءة الصورة.' }); }
    const dir = mediaDir('uploads');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const id = randomUUID();
    writeFileSync(resolve(dir, `${id}.png`), png);
    res.status(201).json({ url: `/api/uploads/${id}.png` });
  });
  app.get('/api/uploads/:file', requireUser, async (req, res) => {
    const file = String(req.params.file);
    if (!/^[0-9a-f-]{36}\.png$/.test(file)) return res.status(404).end();
    res.sendFile(mediaDir('uploads', file), { headers: { 'Cache-Control': 'private, max-age=86400' } }, (error) => { if (error && !res.headersSent) res.status(404).end(); });
  });
}
