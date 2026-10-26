import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { requireAiBudget } from './usage.js';
import { loadFullCreativeRun } from './creative-intelligence/generation/full-creative.js';
import { aiEdit, decompose, originalWithoutLogo, renderStudio, studioPath, studioUrl, type StudioDoc } from './creative-intelligence/studio/studio.js';
import { addVersion, canEdit, getContent, listVersions } from './workspace.js';

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
const layer = z.object({ id: z.string().max(20), text: z.string().max(400), x: z.number(), y: z.number(), width: z.number().positive(), size: z.number().min(8).max(400), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), weight: z.number().int().min(100).max(900), align: z.enum(['start', 'center', 'end']), lineHeight: z.number().min(0.8).max(3) });
const doc = z.object({
  version: z.literal('studio:v1'), width: z.number().int().positive(), height: z.number().int().positive(), baseFile: z.string().regex(/^[0-9a-f-]{36}\.png$/),
  layers: z.array(layer).max(40), zones: z.array(z.object({ kind: z.enum(['text', 'face', 'subject', 'cta', 'platform-ui', 'salient']), box, label: z.string().optional() })).max(80),
  logo: z.object({ variantId: z.enum(['lockup-reversed', 'lockup-positive', 'symbol-reversed', 'symbol-positive']), x: z.number(), y: z.number(), width: z.number() }).nullable(),
});

function editableItem(req: express.Request, res: express.Response) {
  const item = getContent(String(req.params.contentId));
  if (!item || !canEdit(req.user!, item)) { res.status(404).json({ error: 'المحتوى غير موجود أو غير متاح للتعديل.' }); return null; }
  if (!item.creative) { res.status(400).json({ error: 'لا يحتوي هذا المنشور على تصميم.' }); return null; }
  if (item.creative.svgTemplate || !/^[0-9a-f-]{36}$/.test(item.creative.requestId)) { res.status(400).json({ error: 'أُنشئ هذا المنشور من قالب SVG؛ عدّله من القالب.', code: 'svg_template' }); return null; }
  return item;
}
type StudioFormat = 'feed' | 'story' | 'landscape';
const formatOf = (directionId: string): StudioFormat => directionId.endsWith('-story') ? 'story' : directionId.endsWith('-landscape') ? 'landscape' : 'feed';
const sizeOf = (format: StudioFormat) => format === 'story' ? { width: 1080, height: 1920 } : format === 'landscape' ? { width: 1200, height: 630 } : { width: 1080, height: 1350 };
const safeAreaOf = (format: StudioFormat) => format === 'story' ? { top: 230, right: 0, bottom: 330, left: 0 } : undefined;

export function registerStudioRoutes(app: express.Express) {
  /** Latest saved layer document for the post, or null when it has not been made editable yet. */
  app.get('/api/studio/:contentId/doc', requireUser, (req, res) => {
    const item = editableItem(req, res);
    if (!item) return;
    const saved = listVersions(item.id).find((v) => v.studio);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ doc: saved?.studio ?? null, format: formatOf(item.creative!.directionId), imageUrl: item.creative!.imageUrl });
  });
  app.post('/api/studio/:contentId/decompose', requireUser, requireAiBudget, (req, res) => {
    const item = editableItem(req, res);
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
  app.post('/api/studio/:contentId/ai-edit', requireUser, requireAiBudget, (req, res) => {
    const item = editableItem(req, res);
    if (!item) return;
    const parsed = z.object({ doc, box, instruction: z.string().trim().min(3).max(600) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'حدّد منطقة واكتب التعديل.' });
    const job = startStudioJob(req.user!.id, () => aiEdit(parsed.data.doc as StudioDoc, parsed.data.box, parsed.data.instruction, formatOf(item.creative!.directionId)));
    res.status(202).json({ jobId: job.id });
  });
  app.get('/api/studio/jobs/:id', requireUser, (req, res) => {
    const job = jobs.get(String(req.params.id));
    res.setHeader('Cache-Control', 'no-store');
    if (!job || job.ownerId !== req.user!.id) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    res.json(job);
  });
  app.post('/api/studio/:contentId/render', requireUser, async (req, res) => {
    const item = editableItem(req, res);
    if (!item) return;
    const parsed = z.object({ doc, note: z.string().max(200).default('Studio edit') }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'بيانات الطبقات غير صالحة.' });
    try {
      const result = await renderStudio(parsed.data.doc as StudioDoc, safeAreaOf(formatOf(item.creative!.directionId)));
      if (result.problems.some((p) => p.startsWith('Logo'))) return res.status(422).json({ error: result.problems.join(' '), problems: result.problems, previewUrl: studioUrl(result.file) });
      const version = addVersion(req.user!, item.id, { imageUrl: studioUrl(result.file), storyUrl: item.creative!.storyUrl ?? null, studio: result.doc, note: parsed.data.note });
      res.json({ version, problems: result.problems });
    } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Render failed' }); }
  });
  app.get('/api/studio/:file', requireUser, (req, res) => {
    let path: string;
    try { path = studioPath(String(req.params.file)); } catch { return res.status(404).end(); }
    res.sendFile(path, { headers: { 'Cache-Control': 'private, max-age=86400' } }, (error) => { if (error && !res.headersSent) res.status(404).end(); });
  });
}
