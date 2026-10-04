import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { checkAlerts } from './alerts.js';
import { parseCalendar } from './calendar.js';
import { newPlan, isPlatform, planState, engagementRate } from './domain.js';
import { deletePlan, dismissAlert, getAlerts, getConnectorStatuses, getObserved, getPlans, getWebsiteDaily, getWebsitePages, saveImportedPlan, savePlan } from './store.js';
import { runSync } from './sync.js';
import type { Platform } from './types.js';

const app=express();const port=Number(process.env.PORT)||4100;const host=process.env.HOST||'127.0.0.1';
const secret=process.env.DASHBOARD_ADMIN_SECRET?.trim();
if(host!=='127.0.0.1'&&host!=='localhost'&&!secret)throw new Error('DASHBOARD_ADMIN_SECRET must be set for a public host.');
app.disable('x-powered-by');app.use(express.json({limit:'1mb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.use('/api',(req,res,next)=>{
 if(!secret)return next();
 const supplied=req.header('X-Admin-Secret')||req.header('Authorization')?.replace(/^Bearer\s+/i,'');
 if(supplied===secret)return next();
 return res.status(401).json({error:'مطلوب رمز الدخول.'});
});
app.get('/api/dashboard',(_req,res)=>{
 const now=new Date();const posts=getObserved();const plans=getPlans();const grace=Number(process.env.ALERT_GRACE_MINUTES)||15;
 const enriched=plans.map(plan=>({...plan,computedState:planState(plan,posts,now,grace)}));
 const enrichedPosts=posts.map(post=>({...post,engagementRate:engagementRate(post)}));
 res.setHeader('Cache-Control','no-store');
 res.json({generatedAt:now.toISOString(),timeZone:process.env.BUSINESS_TIME_ZONE||'Africa/Cairo',posts:enrichedPosts,plans:enriched,alerts:getAlerts(),connectors:getConnectorStatuses(),website:getWebsiteDaily(),websitePages:getWebsitePages()});
});
const planSchema=z.object({
 id:z.string().uuid().optional(),platform:z.string().refine(isPlatform),accountId:z.string().max(120).default(''),title:z.string().trim().min(1).max(300),caption:z.string().max(5000).default(''),scheduledAt:z.iso.datetime(),status:z.enum(['draft','approved','scheduled','published','cancelled']).default('scheduled'),permalink:z.string().max(1000).default(''),externalId:z.string().max(200).default(''),owner:z.string().max(120).default(''),contentType:z.string().max(60).default('post'),campaign:z.string().max(120).default(''),notes:z.string().max(1000).default('')
});
app.post('/api/plans',async(req,res)=>{
 const parsed=planSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'بيانات البوست غير صالحة.',issues:parsed.error.issues});
 if(parsed.data.status==='published'&&!parsed.data.permalink&&!parsed.data.externalId)return res.status(400).json({error:'أضف رابط المنشور أو معرّفه لتأكيد النشر.'});
 const old=getPlans().find(x=>x.id===parsed.data.id);
 const plan=newPlan({...old,...parsed.data,platform:parsed.data.platform as Platform,createdAt:old?.createdAt,sourceKey:old?.sourceKey});
 const saved=savePlan(plan);
 await checkAlerts();
 res.json(saved);
});
app.delete('/api/plans/:id',(req,res)=>res.json({deleted:deletePlan(String(req.params.id))}));
app.post('/api/calendar/import',express.raw({type:'application/octet-stream',limit:'8mb'}),async(req,res)=>{
 try{
  const filename=String(req.header('X-Filename')||'calendar.csv').slice(0,120);
  const data=await parseCalendar(req.body as Buffer,filename);
  if(!data.plans.length)return res.status(400).json({error:'لم يتم العثور على صفوف صالحة.',errors:data.errors});
  let imported=0;for(const plan of data.plans)if(saveImportedPlan(plan))imported++;
  await checkAlerts();
  res.json({imported,duplicates:data.plans.length-imported,errors:data.errors});
 }catch{res.status(400).json({error:'تعذّر قراءة ملف الكاليندر.'});}
});
app.post('/api/sync',async(_req,res)=>{try{res.json({results:await runSync()});}catch{res.status(502).json({error:'تعذّر مزامنة المصادر.'});}});
app.post('/api/alerts/check',async(_req,res)=>res.json({created:await checkAlerts()}));
app.post('/api/alerts/:id/dismiss',(req,res)=>res.json({dismissed:dismissAlert(String(req.params.id))}));
const dist=resolve('dist');if(existsSync(dist)){
 app.use(express.static(dist));
 app.get('/{*path}',(_req,res)=>res.sendFile(resolve(dist,'index.html')));
}
app.listen(port,host,()=>console.log(`Social Pulse listening on http://${host}:${port}`));
setTimeout(()=>{void runSync().catch(()=>{});},1500);
setInterval(()=>{void checkAlerts().catch(()=>{});},60_000).unref();
setInterval(()=>{void runSync().catch(()=>{});},30*60_000).unref();
