import type express from 'express';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { requirePermission, requireUser } from './auth.js';
import { db, defineSchema, defineColumn } from './db.js';
import { rankRecords } from '../src/features/creative-studio/course-search.js';
import { readOdooCatalog } from './odoo.js';
import { suggestedCourseProfile } from './course-profile-suggestions.js';
import { courseCopy } from '../src/domain/course-copy.js';
export { courseCopy } from '../src/domain/course-copy.js';

defineSchema(`CREATE TABLE IF NOT EXISTS course_profiles (
 course_id TEXT PRIMARY KEY, course_name TEXT NOT NULL, objectives_json TEXT NOT NULL DEFAULT '[]', outcomes_json TEXT NOT NULL DEFAULT '[]',
 audience TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`);
for (const column of ['category', 'description', 'source_url'])
  defineColumn('course_profiles', column, "TEXT NOT NULL DEFAULT ''");
defineColumn(
  'course_profiles',
  'review_status',
  "TEXT NOT NULL DEFAULT 'approved'",
);
export interface CourseProfile {
  courseId: string;
  courseName: string;
  objectives: string[];
  outcomes: string[];
  audience: string;
  notes: string;
  category: string;
  description: string;
  sourceUrl: string;
  reviewStatus: 'suggested' | 'approved';
  updatedBy: string;
  updatedAt: string;
}
const list = (v: unknown): string[] => {
  try {
    const p = JSON.parse(String(v || '[]'));
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
};
const toProfile = (r: Record<string, unknown>): CourseProfile => ({
  courseId: String(r.course_id),
  courseName: String(r.course_name),
  objectives: list(r.objectives_json),
  outcomes: list(r.outcomes_json),
  audience: String(r.audience ?? ''),
  notes: String(r.notes ?? ''),
  category: String(r.category ?? ''),
  description: String(r.description ?? ''),
  sourceUrl: String(r.source_url ?? ''),
  reviewStatus: r.review_status === 'suggested' ? 'suggested' : 'approved',
  updatedBy: String(r.updated_by),
  updatedAt: String(r.updated_at),
});
const lines = z.array(z.string().trim().min(1).max(300)).max(12);
const input = z.object({
  courseName: z.string().trim().min(2).max(300),
  objectives: lines,
  outcomes: lines,
  audience: z.string().trim().max(600).default(''),
  notes: z.string().trim().max(2000).default(''),
  category: z.string().trim().max(150).default(''),
  description: z.string().trim().max(2000).default(''),
  sourceUrl: z
    .union([
      z.literal(''),
      z
        .string()
        .url()
        .refine((u) => u.startsWith('https://')),
    ])
    .default(''),
  reviewStatus: z.enum(['suggested', 'approved']).default('approved'),
});
export const allCourseProfiles = async () =>
  (await db.all('SELECT * FROM course_profiles ORDER BY course_name')).map(
    toProfile,
  );
async function insertSuggested(course: {
  courseId: string;
  courseName: string;
  description?: string;
  sourceUrl?: string;
  category?: string;
  sourceNote?: string;
}) {
  const proposed = suggestedCourseProfile(course.courseName);
  return db.run(
    'INSERT INTO course_profiles (course_id,course_name,objectives_json,outcomes_json,audience,notes,category,description,source_url,review_status,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (course_id) DO NOTHING',
    [
      course.courseId,
      course.courseName,
      JSON.stringify(proposed.objectives),
      JSON.stringify(proposed.outcomes),
      proposed.audience,
      [proposed.notes, course.sourceNote].filter(Boolean).join(' '),
      course.category || proposed.category,
      course.description || '',
      course.sourceUrl || '',
      'suggested',
      'website-import',
      new Date().toISOString(),
    ],
  );
}
export function courseImportSource() {
  return JSON.parse(
    readFileSync(
      new URL('./data/engosoft-website-courses.json', import.meta.url),
      'utf8',
    ),
  ) as {
    retrievedAt: string;
    discovered: number;
    courses: {
      courseId: string;
      courseName: string;
      description: string;
      sourceUrl: string;
      sourceNote?: string;
      sourceQuality: 'page' | 'catalog' | 'sitemap';
    }[];
  };
}
export async function seedCourseCatalog() {
  const source = courseImportSource();
  let added = 0;
  for (const course of source.courses)
    added += (await insertSuggested(course)).changes;
  return added;
}

let remoteCatalog: Awaited<ReturnType<typeof readOdooCatalog>> = {
  status: 'needs_setup',
  courses: [],
  events: [],
};
let catalogRefresh: Promise<void> | undefined;
let catalogReadAt = 0;
export async function combinedCourseCatalog() {
  const profiles = await allCourseProfiles();
  if (!catalogRefresh && Date.now() - catalogReadAt > 60_000) {
    catalogRefresh = readOdooCatalog()
      .then((data) => {
        remoteCatalog = data;
        catalogReadAt = Date.now();
      })
      .finally(() => {
        catalogRefresh = undefined;
      });
  }
  if (!profiles.length) await catalogRefresh;
  const ids = new Set(profiles.map((p) => p.courseId));
  const courses = profiles.map((p) => ({
    id: p.courseId,
    kind: 'course' as const,
    name: p.courseName,
    category: p.category,
    description: p.description,
    url: p.sourceUrl || undefined,
    nextRuns:
      remoteCatalog.courses.find((c) => c.id === p.courseId)?.nextRuns ?? [],
  }));
  return {
    ...remoteCatalog,
    status: profiles.length ? ('connected' as const) : remoteCatalog.status,
    courses: [
      ...courses,
      ...remoteCatalog.courses.filter((c) => !ids.has(c.id)),
    ],
  };
}

export function registerCourseProfileRoutes(app: express.Express) {
  app.get('/api/odoo/courses', requireUser, async (req, res) => {
    const catalog = await combinedCourseCatalog();
    res.setHeader('Cache-Control', 'no-store');
    if (catalog.status !== 'connected')
      return res.status(catalog.status === 'error' ? 502 : 200).json(catalog);
    const q =
      typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (!q)
      return res.json({ ...catalog, events: catalog.events.slice(0, 200) });
    const courses = rankRecords(q, catalog.courses, 40).sort(
      (a, b) =>
        Math.round((b.score - a.score) * 10) ||
        b.nextRuns.length - a.nextRuns.length,
    );
    const events = rankRecords(
      q,
      catalog.events.map((event) => ({ ...event, name: event.title })),
      20,
    );
    res.json({
      status: 'connected',
      courses,
      events,
      message: catalog.message,
    });
  });
  app.get(
    '/api/course-profiles/import-status',
    requireUser,
    requirePermission('templates.manage'),
    async (_req, res) => {
      const source = courseImportSource();
      res.json({
        retrievedAt: source.retrievedAt,
        total: source.discovered,
        pageCount: source.courses.filter((c) => c.sourceQuality === 'page')
          .length,
        catalogCount: source.courses.filter(
          (c) => c.sourceQuality === 'catalog',
        ).length,
        unverified: source.courses
          .filter((c) => c.sourceQuality === 'sitemap')
          .map((c) => ({
            courseId: c.courseId,
            name: c.courseName,
            url: c.sourceUrl,
          })),
      });
    },
  );
  app.get('/api/course-profiles', requireUser, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await allCourseProfiles());
  });
  app.post(
    '/api/course-profiles/sync',
    requireUser,
    requirePermission('templates.manage'),
    async (_req, res) => {
      let added = await seedCourseCatalog();
      const catalog = await readOdooCatalog();
      if (catalog.status === 'connected')
        for (const c of catalog.courses)
          added += (
            await insertSuggested({
              courseId: c.id,
              courseName: c.name,
              category: c.category,
              description: c.description,
              sourceUrl: c.url,
            })
          ).changes;
      res.json({
        added,
        total: (await allCourseProfiles()).length,
        odooStatus: catalog.status,
        message: catalog.message,
      });
    },
  );
  app.get(
    '/api/course-profiles/:courseId/copy',
    requireUser,
    requirePermission('content.create'),
    async (req, res) => {
      const row = await db.get(
        'SELECT * FROM course_profiles WHERE course_id=?',
        [String(req.params.courseId)],
      );
      if (!row) return res.status(404).json({ error: 'الدورة غير موجودة.' });
      const p = toProfile(row);
      res.json({ copy: courseCopy(p), reviewStatus: p.reviewStatus });
    },
  );
  app.put(
    '/api/course-profiles/:courseId',
    requireUser,
    requirePermission('templates.manage'),
    async (req, res) => {
      const courseId = String(req.params.courseId);
      if (!courseId || courseId.length > 100)
        return res.status(400).json({ error: 'معرّف الدورة غير صالح.' });
      const parsed = input.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          error: 'راجع اسم الدورة وطول النصوص والأهداف (حتى 12 هدفًا).',
        });
      const p = parsed.data;
      const now = new Date().toISOString();
      await db.run(
        'INSERT INTO course_profiles (course_id,course_name,objectives_json,outcomes_json,audience,notes,category,description,source_url,review_status,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (course_id) DO UPDATE SET course_name=excluded.course_name, objectives_json=excluded.objectives_json, outcomes_json=excluded.outcomes_json, audience=excluded.audience, notes=excluded.notes, category=excluded.category, description=excluded.description, source_url=excluded.source_url, review_status=excluded.review_status, updated_by=excluded.updated_by, updated_at=excluded.updated_at',
        [
          courseId,
          p.courseName,
          JSON.stringify(p.objectives),
          JSON.stringify(p.outcomes),
          p.audience,
          p.notes,
          p.category,
          p.description,
          p.sourceUrl,
          p.reviewStatus,
          req.user!.id,
          now,
        ],
      );
      res.json(
        toProfile(
          (await db.get('SELECT * FROM course_profiles WHERE course_id=?', [
            courseId,
          ]))!,
        ),
      );
    },
  );
  app.delete(
    '/api/course-profiles/:courseId',
    requireUser,
    requirePermission('templates.manage'),
    async (req, res) =>
      res.json({
        deleted:
          (
            await db.run('DELETE FROM course_profiles WHERE course_id=?', [
              String(req.params.courseId),
            ])
          ).changes > 0,
      }),
  );
}
