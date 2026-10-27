import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import express from 'express';
import { PUBLISHING_PRESETS } from '../src/domain/output-presets';
import { courseTemplateCopy } from '../src/domain/course-copy';
import { ALL_PERMISSIONS } from '../src/domain/users';

process.env.DATA_FILE = join(
  mkdtempSync(join(tmpdir(), 'engosoft-catalog-')),
  'test.sqlite',
);
process.env.DATABASE_URL = '';
process.env.ODOO_URL = '';
process.env.ODOO_API_KEY = '';
const auth = await import('../server/auth');
const { db, initDb } = await import('../server/db');
const { registerAuthRoutes, registerWorkspaceRoutes } = await import(
  '../server/workspace-routes'
);
const catalog = await import('../server/course-profiles');
const { seedBuiltinTemplates, builtinTemplates } = await import(
  '../server/builtin-templates'
);
const { registerReferenceDesignRoutes, renderReferenceDesign } = await import(
  '../server/reference-designs'
);
const { registerAiTemplateRoutes } = await import('../server/ai-templates');
const { registerUsageRoutes } = await import('../server/usage');
await initDb();
await seedBuiltinTemplates();
const makeUser = (role: import('../server/auth').AuthUser['role']) =>
  auth.createUser({
    email: `${role}@test.local`,
    name: role,
    role,
    departmentId: 'operations',
    password: 'test-password-2026',
  });
const users = {
  admin: await makeUser('admin'),
  ops: await makeUser('operations'),
  manager: await makeUser('marketing_manager'),
};
const tokens = Object.fromEntries(
  await Promise.all(
    Object.entries(users).map(async ([key, user]) => [
      key,
      (await auth.createSession(user.id)).token,
    ]),
  ),
);
const app = express();
app.use(express.json());
registerAuthRoutes(app);
registerWorkspaceRoutes(app);
catalog.registerCourseProfileRoutes(app);
registerReferenceDesignRoutes(app);
registerUsageRoutes(app);
registerAiTemplateRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const { port } = server.address() as { port: number };
const request = (
  path: string,
  method = 'GET',
  body?: unknown,
  role = 'admin',
) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(tokens[role]
        ? { cookie: `${auth.SESSION_COOKIE}=${tokens[role]}` }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const patchPermissions = (
  role: keyof typeof users,
  overrides: Record<string, boolean>,
) =>
  request(`/api/users/${users[role].id}/permissions`, 'PATCH', { overrides });
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

test('catalog and access endpoints reject anonymous users and restrict administration', async () => {
  for (const path of [
    '/api/course-profiles',
    '/api/odoo/courses',
    '/api/permissions',
  ])
    assert.equal(
      (await request(path, 'GET', undefined, 'anonymous')).status,
      401,
    );
  assert.equal(
    (await request('/api/permissions', 'GET', undefined, 'ops')).status,
    403,
  );
  assert.equal(
    (await request('/api/course-profiles/sync', 'POST', {}, 'ops')).status,
    403,
  );
});

test('website catalog seeds every discovered entry once and preserves editorial edits on sync', async () => {
  const source = JSON.parse(
    readFileSync('server/data/engosoft-website-courses.json', 'utf8'),
  );
  assert.ok(source.courses.length >= 100);
  assert.equal(
    new Set(source.courses.map((c: { courseId: string }) => c.courseId)).size,
    source.courses.length,
  );
  assert.equal(await catalog.seedCourseCatalog(), source.courses.length);
  const [profile] = await catalog.allCourseProfiles();
  assert.equal(profile.reviewStatus, 'suggested');
  assert.ok(
    profile.objectives.length &&
      profile.audience &&
      profile.sourceUrl.startsWith('https://engosoft.com/shop/'),
  );
  assert.equal(
    (
      await request(
        `/api/course-profiles/${encodeURIComponent(profile.courseId)}`,
        'PUT',
        { ...profile, audience: 'جمهور محرر خصيصًا', reviewStatus: 'approved' },
      )
    ).status,
    200,
  );
  assert.equal(await catalog.seedCourseCatalog(), 0);
  const synced = await (
    await request('/api/course-profiles/sync', 'POST', {})
  ).json();
  assert.equal(synced.added, 0);
  assert.equal(
    (await catalog.allCourseProfiles()).find(
      (p) => p.courseId === profile.courseId,
    )?.audience,
    'جمهور محرر خصيصًا',
  );
});

test('course validation and automatic copy preserve saved facts and template limits', async () => {
  const profile = {
    courseName: 'دورة Revit MEP',
    objectives: ['تنسيق نماذج المشروع', 'قراءة الجداول'],
    outcomes: ['لوحة عمل'],
    audience: 'مهندسو الميكانيكا',
    sourceUrl: 'https://engosoft.com/shop/revit-mep-1993',
    reviewStatus: 'approved',
  };
  assert.equal(
    (
      await request('/api/course-profiles/test-copy', 'PUT', {
        ...profile,
        sourceUrl: 'javascript:alert(1)',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/api/course-profiles/test-copy', 'PUT', {
        ...profile,
        objectives: Array(13).fill('هدف'),
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/api/course-profiles/test-copy', 'PUT', profile)).status,
    200,
  );
  const result = await (
    await request(
      '/api/course-profiles/test-copy/copy',
      'GET',
      undefined,
      'ops',
    )
  ).json();
  assert.equal(result.reviewStatus, 'approved');
  assert.equal(result.copy.body, profile.objectives.join('\n'));
  assert.match(result.copy.caption, /https:\/\/engosoft.com/);
  assert.deepEqual(
    courseTemplateCopy(profile, [
      { key: 'title', maxChars: 7 },
      { key: 'body' },
      { key: 'arbitrary' },
    ]),
    {
      title: profile.courseName.slice(0, 7),
      body: profile.objectives.join('\n'),
    },
  );
  assert.equal(
    (
      await request(
        '/api/course-profiles/missing/copy',
        'GET',
        undefined,
        'ops',
      )
    ).status,
    404,
  );
});

test('course search remains available without Odoo, searches all imported courses in English and Arabic', async () => {
  const all = await (
    await request('/api/odoo/courses', 'GET', undefined, 'ops')
  ).json();
  assert.equal(all.status, 'connected');
  assert.ok(all.courses.length >= 100);
  for (const query of ['Revit', 'التصميم']) {
    const found = await (
      await request(
        `/api/odoo/courses?q=${encodeURIComponent(query)}`,
        'GET',
        undefined,
        'ops',
      )
    ).json();
    assert.ok(found.courses.length > 0);
    assert.ok(found.courses.length <= 40);
    assert.ok(
      found.courses.every((c: { nextRuns: unknown[] }) =>
        Array.isArray(c.nextRuns),
      ),
    );
  }
});

test('permissions directory includes ten roles and eighteen capabilities without exposing credentials', async () => {
  const result = await (await request('/api/permissions')).json();
  assert.equal(result.roles.length, 10);
  assert.deepEqual(result.permissions, ALL_PERMISSIONS);
  assert.equal(JSON.stringify(result).includes('password_hash'), false);
});

test('permission overrides grant and deny actions on the next request in an existing session; reset restores role', async () => {
  try {
    assert.equal(
      (
        await patchPermissions('ops', {
          'content.create': false,
          'templates.manage': true,
        })
      ).status,
      200,
    );
    const me = await (
      await request('/api/auth/me', 'GET', undefined, 'ops')
    ).json();
    assert.ok(!me.permissions.includes('content.create'));
    assert.ok(me.permissions.includes('templates.manage'));
    assert.equal(
      (await request('/api/content', 'POST', {}, 'ops')).status,
      403,
    );
    assert.equal(
      (
        await request(
          '/api/course-profiles/granted',
          'PUT',
          {
            courseName: 'إدارة المشاريع',
            objectives: ['التخطيط'],
            outcomes: [],
          },
          'ops',
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await db.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM permission_changes WHERE user_id=?',
          [users.ops.id],
        )
      )?.n,
      1,
    );
  } finally {
    await patchPermissions('ops', {});
  }
  assert.equal(
    (await request('/api/course-profiles/granted', 'DELETE', undefined, 'ops'))
      .status,
    403,
  );
  assert.ok(
    (
      await (await request('/api/auth/me', 'GET', undefined, 'ops')).json()
    ).permissions.includes('content.create'),
  );
});

test('invalid permissions, self changes, and changes to administrators are rejected', async () => {
  assert.equal(
    (await patchPermissions('ops', { 'unknown.permission': true })).status,
    400,
  );
  assert.equal(
    (await patchPermissions('admin', { 'content.create': false })).status,
    400,
  );
  assert.equal(
    (
      await request('/api/users/missing/permissions', 'PATCH', {
        overrides: {},
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/users/${users.manager.id}/permissions`,
        'PATCH',
        { overrides: {} },
        'ops',
      )
    ).status,
    403,
  );
});

const creative = () => ({
  requestId: 'reference-design',
  directionId: 'story',
  imageUrl: '/api/uploads/00000000-0000-4000-a000-000000000000.png',
  svgTemplate: {
    id: builtinTemplates()[0].id,
    values: { title: 'دورة جديدة' },
    format: 'story',
    outputPreset: 'youtube-short',
  },
});
test('YouTube metadata survives creation and versions; invalid or mismatched presets are rejected', async () => {
  const payload = {
    title: 'دورة جديدة',
    channels: ['youtube', 'facebook'],
    captions: { youtube: 'نص يوتيوب' },
    creative: creative(),
  };
  const response = await request('/api/content', 'POST', payload, 'ops');
  assert.equal(response.status, 201);
  const { id } = await response.json();
  const next = {
    ...creative().svgTemplate,
    format: 'landscape',
    outputPreset: 'youtube-banner',
  };
  assert.equal(
    (
      await request(
        `/api/content/${id}/versions`,
        'POST',
        { imageUrl: creative().imageUrl, studio: { svgTemplate: next } },
        'ops',
      )
    ).status,
    201,
  );
  const detail = await (
    await request(`/api/content/${id}`, 'GET', undefined, 'ops')
  ).json();
  assert.equal(detail.creative.svgTemplate.outputPreset, 'youtube-banner');
  assert.deepEqual(detail.channels, ['youtube', 'facebook']);
  assert.equal(
    (
      await request(
        '/api/content',
        'POST',
        {
          ...payload,
          creative: {
            ...creative(),
            svgTemplate: { ...next, outputPreset: 'invented-size' },
          },
        },
        'ops',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        '/api/content',
        'POST',
        {
          ...payload,
          creative: {
            ...creative(),
            svgTemplate: { ...next, outputPreset: 'instagram-story' },
          },
        },
        'ops',
      )
    ).status,
    400,
  );
  for (const outputPreset of ['invalid', 'youtube-banner'])
    assert.equal(
      (
        await request(
          `/api/svg-templates/${builtinTemplates()[0].id}/render`,
          'POST',
          { values: { title: 'عنوان' }, format: 'story', outputPreset },
          'ops',
        )
      ).status,
      400,
    );
});

test('explicit deny overrides an approver role and approval succeeds again after reset', async () => {
  const created = await request(
    '/api/content',
    'POST',
    { title: 'صلاحيات الاعتماد', channels: ['youtube'], creative: creative() },
    'ops',
  );
  const { id } = await created.json();
  await request(
    `/api/content/${id}/transition`,
    'POST',
    { to: 'ready_for_review' },
    'ops',
  );
  try {
    await patchPermissions('manager', { 'content.approve': false });
    assert.equal(
      (
        await request(
          `/api/content/${id}/transition`,
          'POST',
          { to: 'approved' },
          'manager',
        )
      ).status,
      403,
    );
  } finally {
    await patchPermissions('manager', {});
  }
  assert.equal(
    (
      await request(
        `/api/content/${id}/transition`,
        'POST',
        { to: 'approved' },
        'manager',
      )
    ).status,
    200,
  );
});

test('usage visibility follows explicit own/team permissions instead of unrelated account management', async () => {
  assert.equal(
    (await request('/api/usage', 'GET', undefined, 'ops')).status,
    403,
  );
  try {
    await patchPermissions('ops', { 'credits.view': true });
    assert.equal(
      (await (await request('/api/usage', 'GET', undefined, 'ops')).json())
        .scope,
      'mine',
    );
    await patchPermissions('ops', { 'credits.view_all': true });
    assert.equal(
      (await (await request('/api/usage', 'GET', undefined, 'ops')).json())
        .scope,
      'all',
    );
  } finally {
    await patchPermissions('ops', {});
  }
});

test('placement rendering returns exact dimensions and uses the reference edit provider with safe zones', async () => {
  const sharp = (await import('sharp')).default;
  for (const id of [
    'facebook-story',
    'youtube-banner',
    'youtube-thumbnail',
    'facebook-link',
  ]) {
    const preset = PUBLISHING_PRESETS.find((p) => p.id === id)!;
    let calls = 0;
    const provider: import('../server/creative-intelligence/generation/provider').CreativeImageProvider =
      {
        name: 'test',
        model: 'test',
        generate: async () => {
          throw Error('Expected an image edit');
        },
        edit: async (req) => {
          calls++;
          assert.equal(req.size, preset.generation);
          assert.ok(req.images[0].data.length > 1000);
          assert.match(req.prompt, /safe rectangle/);
          return [
            {
              png: await sharp({
                create: {
                  width: 32,
                  height: 32,
                  channels: 3,
                  background: '#0046ff',
                },
              })
                .png()
                .toBuffer(),
              model: 'test',
              size: req.size,
              quality: req.quality,
              latencyMs: 1,
            },
          ];
        },
      };
    const result = await renderReferenceDesign(
      builtinTemplates()[0],
      { title: 'دورة اختبار' },
      preset.format,
      'مشهد جديد',
      provider,
      id,
    );
    assert.equal(calls, 1);
    assert.equal(result.width, preset.width);
    assert.equal(result.height, preset.height);
    const { mediaDir } = await import('../server/paths');
    const actual = await sharp(
      join(mediaDir('uploads'), result.imageUrl.split('/').pop()!),
    ).metadata();
    assert.equal(actual.width, preset.width);
    assert.equal(actual.height, preset.height);
  }
});

test('placement geometry is valid and YouTube has a separate 16:9 master for mixed-platform generation', async () => {
  const { masterFormat, extraFormats } = await import(
    '../src/features/creative-studio/platforms'
  );
  const { CREATIVE_FORMATS } = await import(
    '../server/creative-intelligence/generation/full-creative'
  );
  assert.equal(masterFormat(['youtube']), 'video');
  assert.deepEqual(extraFormats(['youtube']), []);
  assert.equal(masterFormat(['youtube', 'website']), 'video');
  assert.deepEqual(extraFormats(['youtube', 'website']), ['landscape']);
  assert.deepEqual(extraFormats(['facebook', 'website', 'youtube']), [
    'landscape',
    'video',
  ]);
  assert.equal(
    CREATIVE_FORMATS.video.output.width / CREATIVE_FORMATS.video.output.height,
    16 / 9,
  );
  assert.equal(
    new Set(PUBLISHING_PRESETS.map((p) => p.id)).size,
    PUBLISHING_PRESETS.length,
  );
  for (const p of PUBLISHING_PRESETS) {
    assert.ok(p.width - p.safe.left - p.safe.right > 0);
    assert.ok(p.height - p.safe.top - p.safe.bottom > 0);
    const [w, h] = p.generation.split('x').map(Number);
    assert.equal(w % 16, 0);
    assert.equal(h % 16, 0);
    assert.ok(Math.abs(w / h - p.width / p.height) < 0.015);
  }
});

test('import provenance accounts for every discovered link and marks unverified names for review', async () => {
  const source = catalog.courseImportSource();
  assert.equal(source.courses.length, source.discovered);
  const coverage = await (
    await request('/api/course-profiles/import-status')
  ).json();
  assert.equal(
    coverage.pageCount + coverage.catalogCount + coverage.unverified.length,
    source.discovered,
  );
  assert.equal(
    (
      await request(
        '/api/course-profiles/import-status',
        'GET',
        undefined,
        'ops',
      )
    ).status,
    403,
  );
  for (const course of source.courses) {
    assert.ok(
      course.courseName.trim().length >= 2 && course.courseName.length <= 300,
    );
    assert.match(course.sourceUrl, /^https:\/\/engosoft\.com\/shop\//);
    if (course.sourceQuality === 'sitemap')
      assert.ok(course.sourceNote?.includes('اسم مؤقت'));
  }
});

test('AI recipes preserve YouTube channel and 16:9 format when saved and reopened', async () => {
  const response = await request(
    '/api/ai-templates',
    'POST',
    {
      name: 'YouTube reference recipe',
      prompt: 'تصميم صورة مصغرة لدورة ريفيت',
      format: 'video',
      channels: ['youtube', 'website'],
    },
    'manager',
  );
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.format, 'video');
  assert.deepEqual(saved.channels, ['youtube', 'website']);
  const library = await (
    await request('/api/ai-templates', 'GET', undefined, 'manager')
  ).json();
  assert.equal(
    library.find((t: { id: string }) => t.id === saved.id).format,
    'video',
  );
});
