/** AI templates: saved creative recipes (request, style direction, format, platforms) reused by any department. */
import { randomUUID } from 'node:crypto';
import type express from 'express';
import { z } from 'zod';
import { requirePermission, requireUser, userCan } from './auth.js';
import { db, defineSchema } from './db.js';

defineSchema(`CREATE TABLE IF NOT EXISTS ai_templates (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL, style TEXT NOT NULL DEFAULT '',
 format TEXT NOT NULL DEFAULT 'feed', channels_json TEXT NOT NULL DEFAULT '[]', department_id TEXT, created_by TEXT NOT NULL,
 usage_count INTEGER NOT NULL DEFAULT 0, sample_url TEXT, created_at TEXT NOT NULL
)`);

export interface AiTemplate { id: string; name: string; description: string; prompt: string; style: string; format: 'feed' | 'story'; channels: string[]; departmentId: string | null; createdBy: string; usageCount: number; sampleUrl: string | null; createdAt: string }
const toTemplate = (r: Record<string, unknown>): AiTemplate => ({
  id: String(r.id), name: String(r.name), description: String(r.description), prompt: String(r.prompt), style: String(r.style),
  format: r.format === 'story' ? 'story' : 'feed', channels: JSON.parse(String(r.channels_json || '[]')), departmentId: (r.department_id as string | null) ?? null,
  createdBy: String(r.created_by), usageCount: Number(r.usage_count), sampleUrl: (r.sample_url as string | null) ?? null, createdAt: String(r.created_at),
});
export const listTemplates = async () => (await db.all('SELECT * FROM ai_templates ORDER BY usage_count DESC, created_at DESC')).map(toTemplate);
export const getTemplate = async (id: string) => { const r = await db.get('SELECT * FROM ai_templates WHERE id=?', [id]); return r ? toTemplate(r) : undefined; };
export const countTemplateUse = (id: string) => db.run('UPDATE ai_templates SET usage_count = usage_count + 1 WHERE id=?', [id]);

const input = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().max(500).default(''),
  prompt: z.string().trim().min(5).max(2000), style: z.string().max(1500).default(''),
  format: z.enum(['feed', 'story']).default('feed'), channels: z.array(z.enum(['facebook', 'instagram', 'whatsapp', 'linkedin', 'tiktok', 'snapchat'])).max(6).default([]),
  sampleUrl: z.string().regex(/^\/api\/creatives\/[0-9a-f-]{36}\/[a-z0-9.-]+\.png$/).nullable().default(null),
});

export function registerAiTemplateRoutes(app: express.Express) {
  app.get('/api/ai-templates', requireUser, async (_req, res) => res.json(await listTemplates()));
  app.post('/api/ai-templates', requireUser, requirePermission('content.create'), async (req, res) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اكتب اسم القالب والطلب.' });
    const t = parsed.data, id = randomUUID();
    await db.run('INSERT INTO ai_templates (id,name,description,prompt,style,format,channels_json,department_id,created_by,sample_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [id, t.name, t.description, t.prompt, t.style, t.format, JSON.stringify(t.channels), req.user!.departmentId, req.user!.id, t.sampleUrl, new Date().toISOString()]);
    res.status(201).json(await getTemplate(id));
  });
  app.delete('/api/ai-templates/:id', requireUser, async (req, res) => {
    const template = await getTemplate(String(req.params.id));
    if (!template) return res.status(404).json({ error: 'القالب غير موجود.' });
    if (template.createdBy !== req.user!.id && !userCan(req.user!, 'templates.manage')) return res.status(403).json({ error: 'لا تملك صلاحية حذف هذا القالب.' });
    await db.run('DELETE FROM ai_templates WHERE id=?', [template.id]);
    res.json({ deleted: true });
  });
}
