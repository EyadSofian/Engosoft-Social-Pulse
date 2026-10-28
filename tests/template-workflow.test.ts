import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import express from 'express';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'engosoft-templates-')), 'test.sqlite');
process.env.DATABASE_URL = '';
const auth = await import('../server/auth');
const { registerWorkspaceRoutes } = await import('../server/workspace-routes');
const { registerSvgTemplateRoutes } = await import('../server/svg-templates');
const { registerStudioRoutes } = await import('../server/studio-routes');
const { registerCourseProfileRoutes } = await import('../server/course-profiles');
const { builtinTemplates, seedBuiltinTemplates } = await import('../server/builtin-templates');
const { referencePrompt, renderReferenceDesign, registerReferenceDesignRoutes, recoverReferenceJobs, getReferenceJob } = await import('../server/reference-designs');
const { courseValues } = await import('../src/features/svg-templates/render');
const { db, initDb } = await import('../server/db');
await initDb();
await seedBuiltinTemplates();
// Operations: a Content Creator limited to approved templates.
const created = await auth.createUser({ email: 'ops@test.local', name: 'Operations', role: 'creator', departmentId: 'operations', password: 'local-test-password' });
await db.run('UPDATE users SET permission_overrides=? WHERE id=?', [JSON.stringify({ 'design.free': false }), created.id]);
const ops = (await auth.getUser(created.id))!;
const manager = await auth.createUser({ email: 'manager@test.local', name: 'Marketing', role: 'marketing_manager', departmentId: 'marketing', password: 'local-test-password' });
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = req.header('x-test-role') === 'manager' ? manager : ops; next(); });
registerWorkspaceRoutes(app);
registerSvgTemplateRoutes(app);
registerReferenceDesignRoutes(app);
registerStudioRoutes(app);
registerCourseProfileRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address() as { port: number };
const request = (path: string, method = 'GET', body?: unknown, role = 'ops') => fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { 'content-type': 'application/json', 'x-test-role': role }, ...(body ? { body: JSON.stringify(body) } : {}) });
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await db.close(); });

test('curated templates cover post purposes and safe platform sizes; seeding preserves edits', async () => {
  const templates = builtinTemplates();
  assert.equal(templates.length, 13);
  assert.equal(new Set(templates.map((t) => t.id)).size, 13);
  for (const template of templates) {
    assert.match(template.id, /^[a-f0-9-]{36}$/);
    assert.ok(template.sourceImage?.startsWith('/design-references/'));
    assert.ok(template.svg.includes(template.sourceImage!));

    assert.ok(!/<script|foreignObject/.test(template.svg));

  }
  await db.run('UPDATE svg_templates SET name=? WHERE id=?', ['Marketing edit', templates[0].id]);
  await seedBuiltinTemplates();
  assert.equal((await db.get<{ name: string }>('SELECT name FROM svg_templates WHERE id=?', [templates[0].id]))?.name, 'Marketing edit');
  assert.equal((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM svg_templates'))?.n, 13);
});

test('the reference library keeps all thirteen supplied images intact', () => {
  const manifest = JSON.parse(readFileSync('brand/design-references.json', 'utf8')) as { file: string; sha256: string }[];
  assert.equal(manifest.length, 13);
  for (const entry of manifest) assert.equal(createHash('sha256').update(readFileSync(`public/${entry.file}`)).digest('hex'), entry.sha256);
});

test('Operations cannot author templates, use Studio or approve and schedule', async () => {
  for (const permission of ['design.free', 'templates.manage', 'content.approve', 'content.schedule', 'users.manage', 'analytics.view'] as const) assert.equal(auth.userCan(ops, permission), false);
  for (const path of ['/api/svg-templates/generate', `/api/svg-templates/${builtinTemplates()[0].id}/revise`, '/api/studio/outline']) {
    assert.equal((await request(path, 'POST', {})).status, 403, path);
  }
  assert.equal((await request('/api/svg-templates')).status, 200);
});

test('Operations can submit a real template for review; forged and free designs are rejected', async () => {
  const template = builtinTemplates()[0];
  const creative = { requestId: 'svg-template', directionId: 'svg', imageUrl: '/api/uploads/00000000-0000-4000-a000-000000000000.png' };
  const payload = { title: 'دورة السيارات', channels: ['instagram'], creative };
  assert.equal((await request('/api/content', 'POST', payload)).status, 403);
  const make = (id: string, values: Record<string, string>) => request('/api/content', 'POST', { ...payload, creative: { ...creative, svgTemplate: { id, values } } });
  assert.equal((await make('00000000-0000-4000-a000-000000000000', {})).status, 400);
  assert.equal((await make(template.id, { arbitrary_layout: 'tampered' })).status, 400);
  const response = await make(template.id, { title: 'دورة السيارات' });
  assert.equal(response.status, 201);
  const item = await response.json() as { id: string };
  assert.equal((await request(`/api/content/${item.id}/transition`, 'POST', { to: 'ready_for_review' })).status, 200);
  assert.equal((await request(`/api/content/${item.id}/transition`, 'POST', { to: 'approved' })).status, 403);
  assert.equal((await request(`/api/content/${item.id}/transition`, 'POST', { to: 'approved' }, 'manager')).status, 200);
  assert.equal((await request(`/api/content/${item.id}/versions`, 'POST', { imageUrl: creative.imageUrl, studio: { layers: [] } })).status, 403);
});

test('course goals are managed by marketing and switching to a missing profile clears previous facts', async () => {
  const input = { courseName: 'Revit MEP', objectives: ['قراءة نماذج المباني'], outcomes: ['مشروع تطبيقي'], audience: 'المهندسون', notes: '' };
  assert.equal((await request('/api/course-profiles/revit', 'PUT', input)).status, 403);
  assert.equal((await request('/api/course-profiles/revit', 'PUT', input, 'manager')).status, 200);
  const response = await request('/api/course-profiles');
  const profiles = await response.json() as { courseId: string; objectives: string[] }[];
  assert.equal(profiles[0].courseId, 'revit');
  assert.deepEqual(profiles[0].objectives, input.objectives);
  const fields = builtinTemplates().find((t) => t.fields.some((f) => f.source === 'course.objectives'))!.fields;
  assert.deepEqual(courseValues(undefined, fields), { objectives: '' });
});


test('reference generation uses the actual image, original typography language and new imagery', async () => {
  const template = builtinTemplates()[0];
  const prompt = referencePrompt(template, { title: 'صيانة السيارات الكهربائية' }, 'feed', 'تدريب على السيارات الكهربائية');
  assert.match(prompt, /VISUAL|visual|art-direction/);
  assert.match(prompt, /NEW Engosoft/);
  assert.match(prompt, /glyph weight/);
  assert.match(prompt, /CREATE FRESH ARTWORK/);
  assert.match(prompt, /صيانة السيارات الكهربائية/);
  assert.equal(prompt.includes('نفخر بخريجينا'), false);
  const sharp = (await import('sharp')).default;
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('public' + template.sourceImage);
  let edits = 0;
  const provider = { name: 'test', model: 'test-reference-provider', generate: async () => { throw new Error('Must pass the actual reference image'); }, edit: async (request: import('../server/creative-intelligence/generation/provider').ImageEditRequest) => {
    edits++; assert.deepEqual(request.images[0].data, source); assert.equal(request.quality, 'high');
    return [{ png: await sharp({ create: { width: 1088, height: 1360, channels: 3, background: '#0046ff' } }).png().toBuffer(), model: 'test-reference-provider', size: request.size, quality: request.quality, latencyMs: 1 }];
  } };
  const result = await renderReferenceDesign(template, { title: 'صيانة السيارات الكهربائية' }, 'feed', '', provider);
  assert.equal(edits, 1); assert.equal(result.width, 1080); assert.equal(result.height, 1350);
  assert.match(result.imageUrl, /^\/api\/uploads\/[a-f0-9-]+\.png$/);
  assert.equal((await request(`/api/svg-templates/${template.id}/render`, 'POST', { values: { title: 'دورة جديدة', unapproved: 'tamper' }, format: 'feed' })).status, 400);
});

test('reference versions keep format and context; approved artwork and captions are locked', async () => {
  const creative = { requestId: 'reference-design', directionId: 'feed', imageUrl: '/api/uploads/00000000-0000-4000-a000-000000000000.png', svgTemplate: { id: builtinTemplates()[0].id, values: { title: 'دورة جديدة' }, format: 'feed', context: 'ورشة تدريب' } };
  const response = await request('/api/content', 'POST', { title: 'دورة جديدة', channels: ['instagram'], creative });
  assert.equal(response.status, 201);
  const { id } = await response.json() as { id: string };
  const nextRef = { ...creative.svgTemplate, format: 'story', context: 'ورشة تدريب بمشهد جديد' };
  assert.equal((await request(`/api/content/${id}/versions`, 'POST', { imageUrl: creative.imageUrl, studio: { svgTemplate: nextRef } })).status, 201);
  const detail = await (await request(`/api/content/${id}`)).json() as { creative: typeof creative; editable: boolean };
  assert.equal(detail.creative.directionId, 'story');
  assert.equal(detail.creative.svgTemplate.context, nextRef.context);
  await request(`/api/content/${id}/transition`, 'POST', { to: 'ready_for_review' });
  await request(`/api/content/${id}/transition`, 'POST', { to: 'approved' }, 'manager');
  assert.equal((await request(`/api/content/${id}`, 'PATCH', { captions: { instagram: 'Changed after approval' } })).status, 409);
  assert.equal((await request(`/api/content/${id}/versions`, 'POST', { imageUrl: creative.imageUrl, studio: { svgTemplate: nextRef } })).status, 409);
  assert.equal((await (await request(`/api/content/${id}`)).json() as { editable: boolean }).editable, false);
  assert.equal((await request(`/api/content/${id}/transition`, 'POST', { to: 'changes_requested', note: 'راجع التصميم' }, 'manager')).status, 200);
  assert.equal((await request(`/api/content/${id}`, 'PATCH', { captions: { instagram: 'تصحيح بعد الإعادة' } })).status, 200);
});

test('completed reference jobs survive restart recovery and remain private to their owner', async () => {
  const result = { imageUrl: '/api/uploads/00000000-0000-4000-a000-000000000000.png', width: 1080, height: 1350, model: 'test' };
  for (const [id, status] of [['saved-result', 'done'], ['interrupted', 'running']]) await db.run('INSERT INTO reference_design_jobs (id,owner_id,template_id,status,result_json,created_at) VALUES (?,?,?,?,?,?)', [id, ops.id, builtinTemplates()[0].id, status, status === 'done' ? JSON.stringify(result) : null, new Date().toISOString()]);
  await recoverReferenceJobs();
  assert.deepEqual((await getReferenceJob('saved-result', ops.id))?.result, result);
  assert.equal((await getReferenceJob('interrupted', ops.id))?.status, 'failed');
  assert.ok((await getReferenceJob('interrupted', ops.id))?.error);
  assert.equal(await getReferenceJob('saved-result', manager.id), undefined);
  assert.equal((await request('/api/reference-design/jobs/saved-result', 'GET', undefined, 'manager')).status, 404);
  assert.equal((await request('/api/reference-design/jobs/saved-result')).status, 200);
});

test('Studio keeps original text appearances through validation, saving and reopening; unsafe source paths are rejected', async () => {
  const {saveStudioImage}=await import('../server/creative-intelligence/studio/studio');
  const {textAppearanceKey,STUDIO_VERSION}=await import('../src/domain/studio');
  const sharp=(await import('sharp')).default;
  const baseFile=saveStudioImage(await sharp({create:{width:1080,height:1350,channels:3,background:'#FFFFFF'}}).png().toBuffer());
  const file=saveStudioImage(await sharp({create:{width:120,height:40,channels:4,background:'#0046FF'}}).png().toBuffer());
  const layer:import('../src/domain/studio').TextLayer={id:'t-original',kind:'text',text:'CFM',x:400,y:500,width:150,size:60,color:'#0046FF',weight:800,align:'center',lineHeight:1.3,opacity:1};
  layer.source={file,x:2,y:8,width:120,height:40,signature:textAppearanceKey(layer)};
  const response=await request('/api/content','POST',{title:'Studio preservation',channels:['facebook'],creative:{requestId:'00000000-0000-4000-a000-000000000001',directionId:'d1',imageUrl:'/api/uploads/00000000-0000-4000-a000-000000000001.png'}},'manager');
  assert.equal(response.status,201);const {id}=await response.json() as {id:string};
  const doc={version:STUDIO_VERSION,width:1080,height:1350,baseFile,layers:[layer],objects:[],zones:[],logo:null,notices:['Preserved original glyphs']};
  assert.equal((await request(`/api/studio/${id}/render`,'POST',{doc},'manager')).status,200);
  const reopened=await (await request(`/api/studio/${id}/doc`,'GET',undefined,'manager')).json() as {doc:import('../src/domain/studio').StudioDoc};
  assert.deepEqual((reopened.doc.layers[0] as import('../src/domain/studio').TextLayer).source,layer.source);
  assert.deepEqual(reopened.doc.notices,doc.notices);
  const unsafe={...doc,layers:[{...layer,source:{...layer.source,file:'../private.png'}}]};
  assert.equal((await request(`/api/studio/${id}/render`,'POST',{doc:unsafe},'manager')).status,400);
});

test('approval flow: approve with a time, move the time, unschedule, and a bad time changes nothing', async () => {
  const creative = { requestId: 'reference-design', directionId: 'feed', imageUrl: '/api/uploads/00000000-0000-4000-a000-000000000001.png', svgTemplate: { id: builtinTemplates()[0].id, values: { title: 'دورة الجدولة' }, format: 'feed', context: '' } };
  const { id } = await (await request('/api/content', 'POST', { title: 'دورة الجدولة', channels: ['instagram', 'facebook'], creative })).json() as { id: string };
  const move = (body: object, role = 'manager') => request(`/api/content/${id}/transition`, 'POST', body, role);
  type Detail = { status: string; scheduledAt: string | null; planIds: string[]; moves: { to: string }[]; canSchedule: boolean };
  const detail = async (role = 'manager') => await (await request(`/api/content/${id}`, 'GET', undefined, role)).json() as Detail;
  const soon = new Date(Date.now() + 86_400_000).toISOString();
  const later = new Date(Date.now() + 3 * 86_400_000).toISOString();

  assert.equal((await move({ to: 'ready_for_review' }, 'ops')).status, 200);
  // A past time is refused before anything changes: the post is still waiting for approval.
  assert.equal((await move({ to: 'approved', scheduledAt: new Date(Date.now() - 86_400_000).toISOString() })).status, 400);
  assert.equal((await detail()).status, 'ready_for_review');
  // Someone who cannot schedule may not approve with a time.
  assert.equal((await detail('ops')).canSchedule, false);

  // Approve and schedule in one step.
  assert.equal((await move({ to: 'approved', scheduledAt: soon })).status, 200);
  let now = await detail();
  assert.equal(now.status, 'scheduled');
  assert.equal(now.scheduledAt, soon);
  assert.equal(now.planIds.length, 2);
  const firstPlans = now.planIds;
  // A scheduled post offers "change the time" and "unschedule", never a second approval.
  assert.deepEqual(now.moves.map((m) => m.to).sort(), ['approved', 'scheduled']);

  // Moving the time replaces the calendar plans.
  assert.equal((await move({ to: 'scheduled', scheduledAt: later })).status, 200);
  now = await detail();
  assert.equal(now.status, 'scheduled');
  assert.equal(now.scheduledAt, later);
  assert.notDeepEqual(now.planIds, firstPlans);
  for (const planId of firstPlans) assert.equal((await db.get<{ status: string }>('SELECT status FROM plans WHERE id=?', [planId]))?.status ?? 'cancelled', 'cancelled');

  // Unscheduling takes it off the calendar and leaves it approved, ready for a new time.
  assert.equal((await move({ to: 'approved' })).status, 200);
  now = await detail();
  assert.equal(now.status, 'approved');
  assert.equal(now.scheduledAt, null);
  assert.deepEqual(now.planIds, []);
  assert.ok(now.moves.some((m) => m.to === 'scheduled'));
});
