import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { checkAlerts } from './alerts.js';
import { parseCalendar } from './calendar.js';
import { applyPlanPatch, newPlan, isPlatform, missingPublishProof, planState, engagementRate } from './domain.js';
import { deletePlan, dismissAlert, getAlerts, getConnectorStatuses, getObserved, getPlan, getPlans, getWebsiteDaily, getWebsitePages, saveImportedPlan, savePlan } from './store.js';
import { runSync } from './sync.js';
import { registerSocialRoutes } from './social/routes.js';
import { runDuePublications } from './social/queue.js';
import { randomUUID } from 'node:crypto';
import type { Platform } from './types.js';
import { readOdooSchedule } from './odoo.js';
import { generatePostImage, imageRequest } from './post-image.js';
import { briefRequest, generateCreativeBrief } from './creative-brief.js';
import { applyCreativeCommand, creativeEditRequest } from './creative-edit.js';
import { adaptFullCreative, generateFullCreative, loadFullCreativeRun } from './creative-intelligence/generation/full-creative.js';
import { THEME_IDS } from '../src/domain/design-engine.js';
import { getJob, startJob, toPublicRun } from './creative-intelligence/generation/jobs.js';
import { bootstrapAdmin, requirePermission, requireUser, userCan } from './auth.js';
import { registerAuthRoutes, registerWorkspaceRoutes } from './workspace-routes.js';
import { countTemplateUse, getTemplate, registerAiTemplateRoutes } from './ai-templates.js';
import { registerStudioRoutes } from './studio-routes.js';
import { registerCaptionRoutes } from './captions.js';
import { registerContentKitRoutes } from './content-intelligence/kit.js';
import { db, initDb } from './db.js';
import { mediaDir } from './paths.js';
import { registerUsageRoutes, requireAiBudget } from './usage.js';
import { registerNotifyRoutes } from './notify.js';
import { registerSvgTemplateRoutes } from './svg-templates.js';
import { registerCourseProfileRoutes, seedCourseCatalog } from './course-profiles.js';
import { seedBuiltinTemplates } from './builtin-templates.js';
import { recoverReferenceJobs, registerReferenceDesignRoutes } from './reference-designs.js';

const app=express();const port=Number(process.env.PORT)||4100;const host=process.env.HOST||'127.0.0.1';
app.disable('x-powered-by');app.set('trust proxy',1);app.use('/api/ai',express.json({limit:'18mb'}));app.use('/api/studio',express.json({limit:'18mb'}));app.use('/api/svg-templates',express.json({limit:'16mb'}));app.use('/api/uploads',express.json({limit:'16mb'}));app.use(express.json({limit:'1mb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true}));
registerAuthRoutes(app);
// Provider callbacks validate state and the initiating user; signed media is narrowly scoped to one expiring asset.
const PUBLIC_API=new Set(['/api/health','/api/auth/login','/api/auth/logout',...['facebook','instagram','tiktok','snapchat','youtube'].map(p=>`/api/oauth/${p}/callback`)]);
app.use('/api',(req,res,next)=>(PUBLIC_API.has(req.originalUrl.split('?')[0])||/^\/api\/social\/media\/[0-9a-f-]{36}$/.test(req.originalUrl.split('?')[0]))?next():requireUser(req,res,next));
registerWorkspaceRoutes(app);
registerSocialRoutes(app);
registerAiTemplateRoutes(app);
registerStudioRoutes(app);
registerCaptionRoutes(app);
registerContentKitRoutes(app);
registerUsageRoutes(app);
registerNotifyRoutes(app);
registerSvgTemplateRoutes(app);
registerReferenceDesignRoutes(app);
registerCourseProfileRoutes(app);
app.get('/api/odoo/schedule',async(_req,res)=>{
 const result=await readOdooSchedule();
 res.setHeader('Cache-Control','no-store');
 res.status(result.status==='error'?502:200).json(result);
});
const imageCalls=new Map<string,number[]>();
const briefCalls=new Map<string,number[]>();
app.post('/api/ai/creative-brief',requirePermission('design.free'),requireAiBudget,async(req,res)=>{
 const parsed=briefRequest.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'طلب المحتوى أو المراجع غير صالحة.'});
 const who=req.ip||'local';const now=Date.now();const recent=(briefCalls.get(who)||[]).filter(at=>now-at<10*60_000);
 if(recent.length>=10)return res.status(429).json({error:'بلغت الحد المؤقت: 10 مسودات خلال 10 دقائق.'});
 briefCalls.set(who,[...recent,now]);
 try{res.json(await generateCreativeBrief(parsed.data));}
 catch(error){res.status(502).json({error:error instanceof Error?error.message:'تعذّر إعداد المحتوى.'});}
});
app.post('/api/ai/creative-edit',requirePermission('design.free'),requireAiBudget,async(req,res)=>{
 const parsed=creativeEditRequest.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'طلب التعديل غير صالح.'});
 const who=req.ip||'local';const now=Date.now();const recent=(briefCalls.get(who)||[]).filter(at=>now-at<10*60_000);
 if(recent.length>=10)return res.status(429).json({error:'بلغت الحد المؤقت: 10 طلبات ذكاء اصطناعي خلال 10 دقائق.'});
 briefCalls.set(who,[...recent,now]);
 try{res.json(await applyCreativeCommand(parsed.data));}
 catch(error){res.status(502).json({error:error instanceof Error?error.message:'تعذّر تعديل التصميم.'});}
});
app.post('/api/ai/post-image',requirePermission('design.free'),requireAiBudget,async(req,res)=>{
 if(!process.env.OPENAI_API_KEY?.trim())return res.status(503).json({error:'أضف OPENAI_API_KEY على الخادم لتوليد الصور.'});
 const parsed=imageRequest.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'وصف الصورة أو المقاس غير صالح.'});
 const who=req.ip||'local';const now=Date.now();const recent=(imageCalls.get(who)||[]).filter(at=>now-at<10*60_000);
 if(recent.length>=3)return res.status(429).json({error:'بلغت الحد المؤقت: 3 صور خلال 10 دقائق.'});
 imageCalls.set(who,[...recent,now]);
 try{res.json(await generatePostImage(parsed.data.subject,parsed.data.size,process.env,parsed.data.referenceImageDataUrl,parsed.data.count,parsed.data.objective,parsed.data.direction));}
 catch(error){res.status(502).json({error:error instanceof Error?error.message:'تعذّر توليد الصورة.'});}
});
const fullCreativeCalls=new Map<string,number[]>();
const fullCreativeRequest=z.object({prompt:z.string().trim().min(5).max(2000),format:z.enum(['feed','story','landscape','video']).default('feed'),directions:z.literal(2).default(2),templateId:z.string().uuid().optional(),
 settings:z.object({theme:z.enum(['auto',...THEME_IDS]).optional(),creativity:z.enum(['safe','balanced','experimental']).optional(),imageStyle:z.enum(['auto','photo','graphic']).optional(),detail:z.enum(['auto','minimal','detailed']).optional(),referenceStrength:z.enum(['loose','balanced','strong']).optional()}).optional(),
 engine:z.enum(['skills','legacy']).optional(),
 objective:z.enum(['course_launch','course_schedule','certificate','education','event','general']).optional(),
 // Images, PDFs and text attached on the Create page (up to 6, 2 MB each before base64).
 attachments:z.array(z.object({name:z.string().max(200),mime:z.string().max(100),dataUrl:z.string().max(2_800_000).regex(/^data:[\w.+/-]+;base64,/)})).max(6).optional()});
const OBJECTIVE_TEXT={course_launch:'Course announcement',course_schedule:'Course schedule',certificate:'Certificate or achievement',education:'Educational content',event:'Event or occasion',general:'General post'} as const;
const localOnly=(res:express.Response)=>{if(!process.env.OPENAI_API_KEY?.trim()){res.status(503).json({error:'أضف OPENAI_API_KEY على الخادم.'});return true;}return false;};
const limited=(req:express.Request,res:express.Response)=>{const who=req.ip||'local';const now=Date.now();const recent=(fullCreativeCalls.get(who)||[]).filter(at=>now-at<10*60_000);if(recent.length>=6){res.status(429).json({error:'بلغت الحد المؤقت: 6 طلبات تصميم خلال 10 دقائق.'});return true;}fullCreativeCalls.set(who,[...recent,now]);return false;};
app.post('/api/ai/full-creative',requirePermission('design.free'),requireAiBudget,async(req,res)=>{
 if(localOnly(res))return;
 const parsed=fullCreativeRequest.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'اكتب وصف المنشور (5 أحرف على الأقل).'});
 if(limited(req,res))return;
 const template=parsed.data.templateId?await getTemplate(parsed.data.templateId):undefined;if(template)await countTemplateUse(template.id);
 const requestId=randomUUID();
 const job=startJob('generate',req.user!.id,(setStage)=>generateFullCreative({...parsed.data,objective:parsed.data.objective&&OBJECTIVE_TEXT[parsed.data.objective],style:template?.style,requestId,ownerId:req.user!.id},process.env,setStage),requestId);
 res.status(202).json({jobId:job.id,requestId});
});
app.post('/api/ai/full-creative/:requestId/adapt',requirePermission('design.free'),requireAiBudget,(req,res)=>{
 if(localOnly(res))return;
 const parsed=z.object({directionId:z.string().regex(/^d\d$/),format:z.enum(['feed','story','landscape','video'])}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'طلب التحويل غير صالح.'});
 let run;try{run=loadFullCreativeRun(String(req.params.requestId));}catch{return res.status(404).json({error:'التصميم غير موجود.'});}
 if(run.request.ownerId!==req.user!.id)return res.status(404).json({error:'التصميم غير موجود.'});
 if(limited(req,res))return;
 const job=startJob('adapt',req.user!.id,async(setStage)=>{await adaptFullCreative(run,parsed.data.directionId,parsed.data.format,process.env,setStage);return run;},run.requestId);
 res.status(202).json({jobId:job.id});
});
app.get('/api/ai/jobs/:id',(req,res)=>{const job=getJob(String(req.params.id));res.setHeader('Cache-Control','no-store');if(!job||job.ownerId!==req.user!.id)return res.status(404).json({error:'المهمة غير موجودة؛ ربما أعيد تشغيل الخادم.'});res.json(job);});
/** Developer view of a run: every design decision, the compiled prompts, the critic and the repairs. Admins and approvers only. */
app.get('/api/ai/runs/:requestId/design',(req,res)=>{
 if(!userCan(req.user!,'content.approve'))return res.status(404).json({error:'التصميم غير موجود.'});
 let run;try{run=loadFullCreativeRun(String(req.params.requestId));}catch{return res.status(404).json({error:'التصميم غير موجود.'});}
 res.setHeader('Cache-Control','no-store');
 res.json({versions:run.versions,engine:run.brief.engine??null,directions:run.brief.directions.map(d=>({id:d.id,name:d.name,theme:d.theme??null,logo:{mark:d.logoMark??null,corner:d.logoCorner??null},plan:d.engine??null})),
  results:run.results.map(r=>({directionId:r.directionId,prompt:r.prompt,critique:r.inspection.critique??null,repairs:r.inspection.repairs??[],refinements:r.refinements??[],scores:r.inspection.scores,verdict:r.inspection.verdict,logo:r.logo,problems:r.problems}))});
});
/** A finished run, reopened from disk: after leaving the Create page, from a notification, or after a restart. */
app.get('/api/ai/runs/:requestId',(req,res)=>{
 let run;try{run=loadFullCreativeRun(String(req.params.requestId));}catch{return res.status(404).json({error:'التصميم غير موجود.'});}
 const owner=run.request.ownerId;
 if(owner!==req.user!.id&&!userCan(req.user!,'content.approve'))return res.status(404).json({error:'التصميم غير موجود.'});
 res.setHeader('Cache-Control','no-store');
 res.json(toPublicRun(run));
});
app.get('/api/creatives/:requestId/:file',(req,res)=>{
 const id=String(req.params.requestId),file=String(req.params.file);
 if(!/^[0-9a-f-]{36}$/.test(id)||!/^d\d(-story|-feed|-landscape)?\.png$/.test(file))return res.status(404).end();
 res.sendFile(mediaDir('creatives',id,file),{headers:{'Cache-Control':'private, max-age=3600'}},(error)=>{if(error&&!res.headersSent)res.status(404).end();});
});
app.get('/api/dashboard',async(req,res)=>{
 const now=new Date();const [posts,plans,alerts,connectors,website,websitePages]=await Promise.all([getObserved(),getPlans(),getAlerts(),getConnectorStatuses(),getWebsiteDaily(),getWebsitePages()]);const grace=Number(process.env.ALERT_GRACE_MINUTES)||15;
 const enriched=plans.map(plan=>({...plan,computedState:planState(plan,posts,now,grace)}));
 const enrichedPosts=posts.map(post=>({...post,engagementRate:engagementRate(post)}));
 res.setHeader('Cache-Control','no-store');
 res.json({generatedAt:now.toISOString(),timeZone:process.env.BUSINESS_TIME_ZONE||'Africa/Cairo',posts:userCan(req.user!,'analytics.view')?enrichedPosts:[],plans:userCan(req.user!,'plans.view_all')||userCan(req.user!,'content.schedule')?enriched:[],alerts:userCan(req.user!,'analytics.view')?alerts:[],connectors:userCan(req.user!,'analytics.view')||userCan(req.user!,'connections.manage')?connectors:[],website:userCan(req.user!,'analytics.view')?website:[],websitePages:userCan(req.user!,'analytics.view')?websitePages:[]});
});
const planStatus=z.enum(['draft','approved','scheduled','published','cancelled']);
const planSchema=z.object({
 id:z.string().uuid().optional(),platform:z.string().refine(isPlatform),accountId:z.string().max(120).default(''),title:z.string().trim().min(1).max(300),caption:z.string().max(5000).default(''),scheduledAt:z.iso.datetime(),status:planStatus.default('scheduled'),permalink:z.string().max(1000).default(''),externalId:z.string().max(200).default(''),owner:z.string().max(120).default(''),contentType:z.string().max(60).default('post'),campaign:z.string().max(120).default(''),notes:z.string().max(1000).default('')
});
const planPatchSchema=z.object({scheduledAt:z.iso.datetime().optional(),status:planStatus.optional(),permalink:z.string().max(1000).optional(),externalId:z.string().max(200).optional()}).strict();
const PROOF_REQUIRED='أضف رابط المنشور أو معرّفه لتأكيد النشر.';
app.post('/api/plans',requirePermission('content.schedule'),async(req,res)=>{
 const parsed=planSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'بيانات المنشور غير صالحة.',issues:parsed.error.issues});
 if(missingPublishProof(parsed.data))return res.status(400).json({error:PROOF_REQUIRED});
 const old=parsed.data.id?await getPlan(parsed.data.id):undefined;
 const plan=newPlan({...old,...parsed.data,platform:parsed.data.platform as Platform,createdAt:old?.createdAt,sourceKey:old?.sourceKey});
 const saved=await savePlan(plan);
 await checkAlerts();
 res.json(saved);
});
app.patch('/api/plans/:id',requirePermission('content.schedule'),async(req,res)=>{
 const parsed=planPatchSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'تعديل غير صالح.',issues:parsed.error.issues});
 const old=await getPlan(String(req.params.id));if(!old)return res.status(404).json({error:'المنشور غير موجود؛ ربما حُذف.'});
 const plan=applyPlanPatch(old,parsed.data);
 if(missingPublishProof(plan))return res.status(400).json({error:PROOF_REQUIRED,code:'proof_required'});
 const saved=await savePlan(plan);
 await checkAlerts();
 res.json(saved);
});
app.delete('/api/plans/:id',requirePermission('content.schedule'),async(req,res)=>res.json({deleted:await deletePlan(String(req.params.id))}));
app.post('/api/calendar/import',requirePermission('content.schedule'),express.raw({type:'application/octet-stream',limit:'8mb'}),async(req,res)=>{
 try{
  const filename=String(req.header('X-Filename')||'calendar.csv').slice(0,120);
  const data=await parseCalendar(req.body as Buffer,filename);
  if(!data.plans.length)return res.status(400).json({error:'لم يتم العثور على صفوف صالحة.',errors:data.errors});
  let imported=0;for(const plan of data.plans)if(await saveImportedPlan(plan))imported++;
  await checkAlerts();
  res.json({imported,duplicates:data.plans.length-imported,errors:data.errors});
 }catch{res.status(400).json({error:'تعذّر قراءة ملف التقويم.'});}
});
app.post('/api/sync',requirePermission('connections.manage'),async(_req,res)=>{try{res.json({results:await runSync()});}catch{res.status(502).json({error:'تعذّر مزامنة المصادر.'});}});
app.post('/api/alerts/check',async(_req,res)=>res.json({created:await checkAlerts()}));
app.post('/api/alerts/:id/dismiss',async(req,res)=>res.json({dismissed:await dismissAlert(String(req.params.id))}));
app.use('/api',(_req,res)=>res.status(404).json({error:'المسار غير موجود.'}));
const dist=resolve('dist');if(existsSync(dist)){
 app.use(express.static(dist));
 app.get('/{*path}',(_req,res)=>res.sendFile(resolve(dist,'index.html')));
}
// Tables first, then the first admin, then traffic: nothing reads the database before it is ready.
await initDb();
await seedBuiltinTemplates();
await seedCourseCatalog();
await recoverReferenceJobs();
const admin=await bootstrapAdmin();if(admin)console.log(`Created first admin ${admin.email}`);
app.listen(port,host,()=>console.log(`Mobde3 listening on http://${host}:${port} (${db.kind === 'pg' ? 'Postgres' : 'SQLite'})`));
setTimeout(()=>{void runSync().catch(()=>{});},1500);
setInterval(()=>{void checkAlerts().catch(()=>{});},60_000).unref();
// Scheduled Facebook and Instagram publications go out within a minute of their time.
setInterval(()=>{void runDuePublications().catch(()=>{});},60_000).unref();
setInterval(()=>{void runSync().catch(()=>{});},30*60_000).unref();
