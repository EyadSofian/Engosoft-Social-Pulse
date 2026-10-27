import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { requirePermission, requireUser } from './auth.js';
import { requireAiBudget } from './usage.js';
import { loadFullCreativeRun } from './creative-intelligence/generation/full-creative.js';
import { aiEdit, decompose, extractObject, originalWithoutLogo, outlineLayer, renderStudio, saveUpload, studioPath, studioUrl, type StudioDoc } from './creative-intelligence/studio/studio.js';
import { HEX_COLOR, migrateStudioDoc, STUDIO_FILE, STUDIO_VERSION } from '../src/domain/studio.js';
import { addVersion, canEdit, contentIsMutable, getContent, listVersions } from './workspace.js';
import { markOfVariant, type LogoMark } from './creative-intelligence/brand/design-language.js';
import type { Corner } from './creative-intelligence/logo-resolution/resolver.js';

interface StudioJob { id: string; ownerId: string; status: 'running' | 'done' | 'failed'; doc?: StudioDoc; error?: string }
const jobs = new Map<string, StudioJob>();
function startStudioJob(ownerId: string, work: () => Promise<StudioDoc>): StudioJob {
  const job: StudioJob = { id: randomUUID(), ownerId, status: 'running' };
  jobs.set(job.id, job);
  if (jobs.size > 50) jobs.delete(jobs.keys().next().value!);
  void work().then((doc) => { job.status = 'done'; job.doc = doc; }).catch((error) => { job.status = 'failed'; job.error = error instanceof Error ? error.message : 'Studio step failed'; });
  return job;
}

const box = z.object({ x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive() });
const color = z.string().regex(HEX_COLOR);
const common = { id: z.string().max(24), name: z.string().max(60).optional(), x: z.number(), y: z.number(), opacity: z.number().min(0).max(1), hidden: z.boolean().optional(), group: z.string().max(24).optional(), rotation: z.number().min(-360).max(360).optional(), locked: z.boolean().optional() };
const textFields = { text: z.string().max(600), width: z.number().positive().max(10_000), size: z.number().min(8).max(400), color, weight: z.number().int().min(100).max(900), align: z.enum(['start', 'center', 'end']), lineHeight: z.number().min(0.6).max(3), shadow: z.boolean().optional() };
const layer = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('text'), ...textFields }),
  z.object({ ...common, kind: z.literal('shape'), width: z.number().positive(), height: z.number().positive(), fill: color, fill2: color.nullable().optional(), radius: z.number().min(0), shadow: z.boolean().optional(), stroke: color.nullable().optional(), strokeWidth: z.number().min(0).max(200).optional() }),
  z.object({ ...common, kind: z.literal('image'), file: z.string().regex(STUDIO_FILE), width: z.number().positive(), height: z.number().positive(), flipX: z.boolean().optional(), flipY: z.boolean().optional() }),
]);
/** Accepts the current document and upgrades earlier saved versions before validating. */
const doc = z.preprocess((value) => migrateStudioDoc(value) ?? value, z.object({
  version: z.literal(STUDIO_VERSION), width: z.number().int().positive(), height: z.number().int().positive(), baseFile: z.string().regex(STUDIO_FILE),
  layers: z.array(layer).max(150),
  objects: z.array(z.object({ id: z.string().max(24), label: z.string().max(60), box })).max(20),
  zones: z.array(z.object({ kind: z.enum(['text', 'face', 'subject', 'cta', 'platform-ui', 'salient']), box, label: z.string().optional() })).max(80),
  logo: z.object({ variantId: z.enum(['lockup-reversed', 'lockup-positive', 'symbol-reversed', 'symbol-positive']), x: z.number(), y: z.number(), width: z.number() }).nullable(),
}));

async function editableItem(req: express.Request, res: express.Response) {
  const item = await getContent(String(req.params.contentId));
  if (!item || !canEdit(req.user!, item)) { res.status(404).json({ error: 'المحتوى غير موجود أو غير متاح للتعديل.' }); return null; }
  if (!contentIsMutable(item)) { res.status(409).json({ error: 'أعد المنشور للتعديل قبل تغيير التصميم المعتمد.' }); return null; }
  if (!item.creative) { res.status(400).json({ error: 'لا يحتوي هذا المنشور على تصميم.' }); return null; }
  if (item.creative.svgTemplate || !/^[0-9a-f-]{36}$/.test(item.creative.requestId)) { res.status(400).json({ error: 'أُنشئ هذا المنشور من قالب SVG؛ عدّله من القالب.', code: 'svg_template' }); return null; }
  return item;
}
type StudioFormat = 'feed' | 'story' | 'landscape';
const formatOf = (directionId: string): StudioFormat => directionId.endsWith('-story') ? 'story' : directionId.endsWith('-landscape') ? 'landscape' : 'feed';
const sizeOf = (format: StudioFormat) => format === 'story' ? { width: 1080, height: 1920 } : format === 'landscape' ? { width: 1200, height: 630 } : { width: 1080, height: 1350 };
const safeAreaOf = (format: StudioFormat) => format === 'story' ? { top: 230, right: 0, bottom: 330, left: 0 } : undefined;

/**
 * Keep the logo treatment the design already has: the one from the last Studio save, else the one the
 * generator chose for this direction. Without either, the resolver picks by fit.
 */
function logoPlanFor(doc: StudioDoc, requestId: string, directionId: string): { mark: LogoMark; corner: Corner } | undefined {
  const cornerAt = (x: number, y: number, w: number): Corner => `${y < doc.height / 2 ? 'top' : 'bottom'}-${x + w / 2 < doc.width / 2 ? 'left' : 'right'}` as Corner;
  if (doc.logo) return { mark: markOfVariant(doc.logo.variantId), corner: cornerAt(doc.logo.x, doc.logo.y, doc.logo.width) };
  try {
    const logo = loadFullCreativeRun(requestId).results.find((r) => r.directionId === directionId)?.logo;
    if (logo && !logo.requiresCreativeRepair) return { mark: markOfVariant(logo.variantId), corner: logo.placement.anchor };
  } catch { /* run trace missing */ }
  return undefined;
}

export function registerStudioRoutes(app: express.Express) {
  /** Latest saved layer document for the post, or null when it has not been made editable yet. */
  app.get('/api/studio/:contentId/doc', requireUser, requirePermission('design.free'), async (req, res) => {
    const item = await editableItem(req, res);
    if (!item) return;
    const saved = (await listVersions(item.id)).find((v) => v.studio);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ doc: migrateStudioDoc(saved?.studio), format: formatOf(item.creative!.directionId), imageUrl: item.creative!.imageUrl });
  });
  app.post('/api/studio/:contentId/decompose', requireUser, requirePermission('design.free'), requireAiBudget, async (req, res) => {
    const item = await editableItem(req, res);
    if (!item || !process.env.OPENAI_API_KEY?.trim()) { if (item) res.status(503).json({ error: 'أضف OPENAI_API_KEY على الخادم.' }); return; }
    const { requestId, directionId } = item.creative!;
    const format = formatOf(directionId);
    const job = startStudioJob(req.user!.id, async () => {
      const original = await originalWithoutLogo(requestId, directionId, sizeOf(format));
      let approvedCopy: string[] = [];
      try { const c = loadFullCreativeRun(requestId).brief.canonicalCopy; approvedCopy = [c.headline, c.subheadline, ...(c.facts ?? []), c.cta].filter((s): s is string => Boolean(s)); } catch { /* run trace missing: transcription only */ }
      return decompose({ original, format, approvedCopy });
    });
    res.status(202).json({ jobId: job.id });
  });
  app.post('/api/studio/:contentId/ai-edit', requireUser, requirePermission('design.free'), requireAiBudget, async (req, res) => {
    const item = await editableItem(req, res);
    if (!item) return;
    const parsed = z.object({ doc, box, instruction: z.string().trim().min(3).max(600) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'حدّد منطقة واكتب التعديل.' });
    const job = startStudioJob(req.user!.id, () => aiEdit(parsed.data.doc as StudioDoc, parsed.data.box, parsed.data.instruction, formatOf(item.creative!.directionId)));
    res.status(202).json({ jobId: job.id });
  });
  app.post('/api/studio/:contentId/extract', requireUser, requirePermission('design.free'), requireAiBudget, async (req, res) => {
    const item = await editableItem(req, res);
    if (!item) return;
    const parsed = z.object({ doc, box, label: z.string().trim().min(1).max(60), objectId: z.string().max(24).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'حدّد العنصر المراد فصله.' });
    const { box: target, label, objectId } = parsed.data;
    const job = startStudioJob(req.user!.id, () => extractObject(parsed.data.doc as StudioDoc, { box: target, label, objectId }, formatOf(item.creative!.directionId)));
    res.status(202).json({ jobId: job.id });
  });
  /** A picture the user adds as a layer: a data URL of a PNG, JPEG or WebP image. */
  app.post('/api/studio/:contentId/upload', requireUser, requirePermission('design.free'), async (req, res) => {
    const item = await editableItem(req, res);
    if (!item) return;
    const parsed = z.object({ data: z.string().max(16_000_000).regex(/^data:image\/(png|jpeg|webp);base64,/) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'ارفع صورة PNG أو JPEG أو WebP.' });
    try { res.json(await saveUpload(Buffer.from(parsed.data.data.slice(parsed.data.data.indexOf(',') + 1), 'base64'))); }
    catch { res.status(400).json({ error: 'تعذّر قراءة الصورة.' }); }
  });
  /** Brand-font outlines of text layers at the origin, so the editor shows exactly what the render will. */
  app.post('/api/studio/outline', requireUser, requirePermission('design.free'), (req, res) => {
    const parsed = z.object({ layers: z.array(z.object({ id: z.string().max(24), ...textFields })).max(150) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid text layers' });
    res.json(Object.fromEntries(parsed.data.layers.map((l) => [l.id, outlineLayer(l)])));
  });
  app.get('/api/studio/jobs/:id', requireUser, requirePermission('design.free'), async (req, res) => {
    const job = jobs.get(String(req.params.id));
    res.setHeader('Cache-Control', 'no-store');
    if (!job || job.ownerId !== req.user!.id) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    res.json(job);
  });
  app.post('/api/studio/:contentId/render', requireUser, requirePermission('design.free'), async (req, res) => {
    const item = await editableItem(req, res);
    if (!item) return;
    const parsed = z.object({ doc, note: z.string().max(200).default('Studio edit') }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'بيانات الطبقات غير صالحة.' });
    try {
      const result = await renderStudio(parsed.data.doc as StudioDoc, safeAreaOf(formatOf(item.creative!.directionId)), logoPlanFor(parsed.data.doc as StudioDoc, item.creative!.requestId, item.creative!.directionId));
      if (result.problems.some((p) => p.startsWith('Logo'))) return res.status(422).json({ error: result.problems.join(' '), problems: result.problems, previewUrl: studioUrl(result.file) });
      const version = await addVersion(req.user!, item.id, { imageUrl: studioUrl(result.file), storyUrl: item.creative!.storyUrl ?? null, studio: result.doc, note: parsed.data.note });
      res.json({ version, problems: result.problems });
    } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Render failed' }); }
  });
  app.get('/api/studio/:file', requireUser, async (req, res) => {
    let path: string;
    try { path = studioPath(String(req.params.file)); } catch { return res.status(404).end(); }
    res.sendFile(path, { headers: { 'Cache-Control': 'private, max-age=86400' } }, (error) => { if (error && !res.headersSent) res.status(404).end(); });
  });
}
