import type express from 'express';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { requirePermission, requireUser } from './auth.js';
import { db, defineSchema, defineColumn } from './db.js';
import { rankRecords } from '../src/features/creative-studio/course-search.js';
import { readOdooCatalog } from './odoo.js';
import { getSetting, setSetting } from './settings.js';
import { fetchWebsiteCatalog, type WebsiteCatalog, type WebsiteCourse } from './website-courses.js';
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
/** 0 when the course is no longer shown on engosoft.com: kept (with any edits) but out of the library. */
defineColumn('course_profiles', 'on_website', 'INTEGER NOT NULL DEFAULT 1');
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
/** The library: courses on the website, plus courses a person added by hand. */
export const allCourseProfiles = async () =>
  (await db.all("SELECT * FROM course_profiles WHERE on_website=1 OR course_id LIKE 'manual:%' ORDER BY course_name")).map(
    toProfile,
  );

/** Rows the website sync wrote and nobody has edited since; only these are overwritten by the next sync. */
const AUTOMATIC = ['website-import', 'website-sync'];
/** A sync that finds fewer courses than this is treated as a website problem, not as courses removed. */
const MIN_COURSES = 30;

export interface CatalogApplied { added: number; updated: number; kept: number; hidden: number; total: number; retrievedAt: string }

/**
 * Makes the library match the website: new courses are added with the website's goals, outcomes and audience;
 * courses nobody edited take the website's latest content; courses a person edited keep their edits and only
 * gain the fields they left empty; courses no longer on the website are hidden (not deleted).
 */
export async function applyWebsiteCatalog(catalog: Pick<WebsiteCatalog, 'courses' | 'retrievedAt'>): Promise<CatalogApplied> {
  if (catalog.courses.length < MIN_COURSES) throw new Error(`The website returned only ${catalog.courses.length} courses; the library was left as it is.`);
  const now = new Date().toISOString();
  const result: CatalogApplied = { added: 0, updated: 0, kept: 0, hidden: 0, total: 0, retrievedAt: catalog.retrievedAt };
  const existing = new Map((await db.all('SELECT * FROM course_profiles')).map((row) => [String(row.course_id), row]));
  const values = (c: WebsiteCourse) => [c.courseName, JSON.stringify(c.objectives), JSON.stringify(c.outcomes), c.audience, c.notes, c.category, c.description, c.sourceUrl];
  for (const course of catalog.courses) {
    const row = existing.get(course.courseId);
    if (!row) {
      await db.run(
        "INSERT INTO course_profiles (course_id,course_name,objectives_json,outcomes_json,audience,notes,category,description,source_url,review_status,updated_by,updated_at,on_website) VALUES (?,?,?,?,?,?,?,?,?,'approved','website-sync',?,1) ON CONFLICT (course_id) DO NOTHING",
        [course.courseId, ...values(course), now],
      );
      result.added++;
    } else if (AUTOMATIC.includes(String(row.updated_by))) {
      await db.run(
        "UPDATE course_profiles SET course_name=?, objectives_json=?, outcomes_json=?, audience=?, notes=?, category=?, description=?, source_url=?, review_status='approved', updated_by='website-sync', updated_at=?, on_website=1 WHERE course_id=?",
        [...values(course), now, course.courseId],
      );
      result.updated++;
    } else {
      const saved = toProfile(row);
      await db.run(
        'UPDATE course_profiles SET objectives_json=?, outcomes_json=?, audience=?, notes=?, category=?, description=?, source_url=?, on_website=1 WHERE course_id=?',
        [
          JSON.stringify(saved.objectives.length ? saved.objectives : course.objectives),
          JSON.stringify(saved.outcomes.length ? saved.outcomes : course.outcomes),
          saved.audience || course.audience, saved.notes || course.notes, saved.category || course.category,
          saved.description || course.description, course.sourceUrl, course.courseId,
        ],
      );
      result.kept++;
    }
  }
  const onSite = new Set(catalog.courses.map((c) => c.courseId));
  for (const id of existing.keys()) {
    if (onSite.has(id) || id.startsWith('manual:') || Number(existing.get(id)!.on_website) === 0) continue;
    await db.run('UPDATE course_profiles SET on_website=0 WHERE course_id=?', [id]);
    result.hidden++;
  }
  result.total = (await allCourseProfiles()).length;
  await setSetting('courses.website', result);
  return result;
}

/** The website snapshot bundled with the app (scripts/refresh-website-courses.ts). */
export function courseImportSource(): WebsiteCatalog {
  return JSON.parse(readFileSync(new URL('./data/engosoft-website-courses.json', import.meta.url), 'utf8')) as WebsiteCatalog;
}
const lastSync = () => getSetting<{ retrievedAt: string } & Partial<CatalogApplied>>('courses.website', { retrievedAt: '' });

/** At start-up: apply the bundled snapshot when it is newer than what the library last took from the website. */
export async function seedCourseCatalog() {
  const source = courseImportSource();
  if ((await lastSync()).retrievedAt >= source.retrievedAt) return 0;
  return (await applyWebsiteCatalog(source)).added;
}

let websiteSync: Promise<CatalogApplied> | undefined;
/** Reads engosoft.com now and applies it. Concurrent calls share one run. */
export function syncFromWebsite(): Promise<CatalogApplied> {
  websiteSync ??= fetchWebsiteCatalog().then(applyWebsiteCatalog).finally(() => { websiteSync = undefined; });
  return websiteSync;
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
    // Only website courses: Odoo still supplies the dates of upcoming runs, never the list of courses.
    courses,
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
      const last = await lastSync();
      res.json({ source: 'https://engosoft.com/shop', retrievedAt: last.retrievedAt || courseImportSource().retrievedAt, total: (await allCourseProfiles()).length, hidden: last.hidden ?? 0 });
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
      try {
        res.json(await syncFromWebsite());
      } catch (error) {
        res.status(502).json({ error: `تعذّرت قراءة الدورات من الموقع: ${error instanceof Error ? error.message : error}` });
      }
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
