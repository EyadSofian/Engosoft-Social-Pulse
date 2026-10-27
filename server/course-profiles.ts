/**
 * What each course is for: its learning goals, who it targets and what the trainee leaves with. Marketing writes
 * these once per course; templates then fill their `course.*` fields from them, so the Operations team never types
 * or invents claims. Keyed by the Odoo course id.
 */
import type express from 'express';
import { z } from 'zod';
import { requirePermission, requireUser } from './auth.js';
import { db, defineSchema } from './db.js';

defineSchema(`CREATE TABLE IF NOT EXISTS course_profiles (
 course_id TEXT PRIMARY KEY, course_name TEXT NOT NULL, objectives_json TEXT NOT NULL DEFAULT '[]', outcomes_json TEXT NOT NULL DEFAULT '[]',
 audience TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`);

export interface CourseProfile { courseId: string; courseName: string; objectives: string[]; outcomes: string[]; audience: string; notes: string; updatedBy: string; updatedAt: string }

const list = (value: unknown): string[] => { try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } };
const toProfile = (r: Record<string, unknown>): CourseProfile => ({
  courseId: String(r.course_id), courseName: String(r.course_name), objectives: list(r.objectives_json), outcomes: list(r.outcomes_json),
  audience: String(r.audience ?? ''), notes: String(r.notes ?? ''), updatedBy: String(r.updated_by), updatedAt: String(r.updated_at),
});

const lines = z.array(z.string().trim().min(1).max(200)).max(12);
const input = z.object({ courseName: z.string().trim().min(2).max(200), objectives: lines, outcomes: lines, audience: z.string().trim().max(300).default(''), notes: z.string().trim().max(1000).default('') });

export function registerCourseProfileRoutes(app: express.Express) {
  app.get('/api/course-profiles', requireUser, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json((await db.all('SELECT * FROM course_profiles ORDER BY course_name')).map(toProfile));
  });
  app.put('/api/course-profiles/:courseId', requireUser, requirePermission('templates.manage'), async (req, res) => {
    const courseId = String(req.params.courseId).slice(0, 80);
    const parsed = input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'اسم الدورة مطلوب، وكل هدف سطر قصير (حتى 12 سطرًا).' });
    const { courseName, objectives, outcomes, audience, notes } = parsed.data;
    const now = new Date().toISOString();
    const exists = await db.get('SELECT course_id FROM course_profiles WHERE course_id=?', [courseId]);
    if (exists) await db.run('UPDATE course_profiles SET course_name=?, objectives_json=?, outcomes_json=?, audience=?, notes=?, updated_by=?, updated_at=? WHERE course_id=?',
      [courseName, JSON.stringify(objectives), JSON.stringify(outcomes), audience, notes, req.user!.id, now, courseId]);
    else await db.run('INSERT INTO course_profiles (course_id,course_name,objectives_json,outcomes_json,audience,notes,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [courseId, courseName, JSON.stringify(objectives), JSON.stringify(outcomes), audience, notes, req.user!.id, now]);
    res.json(toProfile((await db.get('SELECT * FROM course_profiles WHERE course_id=?', [courseId]))!));
  });
  app.delete('/api/course-profiles/:courseId', requireUser, requirePermission('templates.manage'), async (req, res) => {
    res.json({ deleted: (await db.run('DELETE FROM course_profiles WHERE course_id=?', [String(req.params.courseId)])).changes > 0 });
  });
}
