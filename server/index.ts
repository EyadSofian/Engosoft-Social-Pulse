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
import { consumeOAuthState, saveOAuthState, saveConnectorResult } from './store.js';
import { saveOAuthAccessToken } from './connectors/tokens.js';
import { syncTikTok } from './connectors/tiktok.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Platform } from './types.js';
import { readOdooSchedule } from './odoo.js';
import { generatePostImage, imageRequest } from './post-image.js';

const app=express();const port=Number(process.env.PORT)||4100;const host=process.env.HOST||'127.0.0.1';
app.disable('x-powered-by');app.use(express.json({limit:'1mb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.get('/api/odoo/schedule',async(_req,res)=>{
 const result=await readOdooSchedule();
 res.setHeader('Cache-Control','no-store');
 res.status(result.status==='error'?502:200).json(result);
});
const imageCalls=new Map<string,number[]>();
app.post('/api/ai/post-image',async(req,res)=>{
 if(!['127.0.0.1','localhost','::1'].includes(host)&&process.env.POST_DESIGNER_PUBLIC_AI!=='true')return res.status(503).json({error:'فعّل مصادقة المستخدمين قبل إتاحة توليد الصور علنًا.'});
 if(!process.env.OPENAI_API_KEY?.trim())return res.status(503).json({error:'أضف OPENAI_API_KEY على السيرفر لتوليد الصور.'});
 const parsed=imageRequest.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'وصف الصورة أو المقاس غير صالح.'});
 const who=req.ip||'local';const now=Date.now();const recent=(imageCalls.get(who)||[]).filter(at=>now-at<10*60_000);
 if(recent.length>=3)return res.status(429).json({error:'وصلت للحد المؤقت: 3 صور خلال 10 دقائق.'});
 imageCalls.set(who,[...recent,now]);
 try{res.json(await generatePostImage(parsed.data.subject,parsed.data.size));}
 catch(error){res.status(502).json({error:error instanceof Error?error.message:'تعذّر توليد الصورة.'});}
});
app.get('/api/oauth/tiktok/start',(req,res)=>{
 const clientKey=process.env.TIKTOK_CLIENT_KEY?.trim();
 const redirectUri=process.env.TIKTOK_REDIRECT_URI?.trim();
 if(!clientKey||!redirectUri||!process.env.TIKTOK_CLIENT_SECRET?.trim())return res.status(503).send('إعداد TikTok OAuth غير مكتمل على السيرفر.');
 const state=randomBytes(32).toString('hex');
 saveOAuthState(state,Date.now()+10*60_000);
 res.cookie('tiktok_oauth_state',state,{httpOnly:true,secure:true,sameSite:'lax',maxAge:10*60_000,path:'/api/oauth/tiktok'});
 const authorize=new URL('https://www.tiktok.com/v2/auth/authorize/');
 authorize.searchParams.set('client_key',clientKey);
 authorize.searchParams.set('response_type','code');
 authorize.searchParams.set('scope','user.info.basic,video.list');
 authorize.searchParams.set('redirect_uri',redirectUri);
 authorize.searchParams.set('state',state);
 res.redirect(authorize.toString());
});
app.get('/api/oauth/tiktok/callback',async(req,res)=>{
 const state=typeof req.query.state==='string'?req.query.state:'';
 const cookie=(req.header('cookie')||'').split(';').map(part=>part.trim()).find(part=>part.startsWith('tiktok_oauth_state='))?.slice('tiktok_oauth_state='.length)||'';
 res.clearCookie('tiktok_oauth_state',{httpOnly:true,secure:true,sameSite:'lax',path:'/api/oauth/tiktok'});
 const cookieMatches=state.length===cookie.length&&state.length>0&&timingSafeEqual(Buffer.from(state),Buffer.from(cookie));
 if(!cookieMatches||!consumeOAuthState(state))return res.status(400).send('انتهت محاولة ربط TikTok أو لم يمكن التحقق منها. ابدأ الربط من جديد.');
 const code=typeof req.query.code==='string'?req.query.code:'';
 if(!code||req.query.error)return res.redirect('/connections?tiktok=denied');
 const clientKey=process.env.TIKTOK_CLIENT_KEY?.trim()||'';
 const clientSecret=process.env.TIKTOK_CLIENT_SECRET?.trim()||'';
 const redirectUri=process.env.TIKTOK_REDIRECT_URI?.trim()||'';
 if(!clientKey||!clientSecret||!redirectUri)return res.status(503).send('إعداد TikTok OAuth غير مكتمل على السيرفر.');
 try{
  const body=new URLSearchParams({client_key:clientKey,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri});
  const response=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Cache-Control':'no-cache'},body,signal:AbortSignal.timeout(15_000)});
  const token=await response.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;error?:string};
  if(!response.ok||!token.access_token||!token.refresh_token)throw new Error('لم يكتمل تبادل رمز TikTok.');
  const grantedScopes=new Set((token.scope||'').split(/[\s,]+/).filter(Boolean));
  if(!grantedScopes.has('video.list')||!grantedScopes.has('user.info.basic'))throw new Error('حساب TikTok لم يمنح صلاحيتي user.info.basic وvideo.list.');
  saveOAuthAccessToken('tiktok',{accessToken:token.access_token,refreshToken:token.refresh_token,expiresAt:Date.now()+Math.max(60,Number(token.expires_in)||86400)*1000});
  const result=await syncTikTok();saveConnectorResult(result);
  res.redirect(`/connections?tiktok=${result.status==='connected'?'connected':'sync_failed'}`);
 }catch(e){
  console.error('TikTok OAuth callback failed:',e instanceof Error?e.message:'unknown error');
  res.redirect('/connections?tiktok=failed');
 }
});
app.get('/api/dashboard',(_req,res)=>{
 const now=new Date();const posts=getObserved();const plans=getPlans();const grace=Number(process.env.ALERT_GRACE_MINUTES)||15;
 const enriched=plans.map(plan=>({...plan,computedState:planState(plan,posts,now,grace)}));
 const enrichedPosts=posts.map(post=>({...post,engagementRate:engagementRate(post)}));
 res.setHeader('Cache-Control','no-store');
 res.json({generatedAt:now.toISOString(),timeZone:process.env.BUSINESS_TIME_ZONE||'Africa/Cairo',posts:enrichedPosts,plans:enriched,alerts:getAlerts(),connectors:getConnectorStatuses(),website:getWebsiteDaily(),websitePages:getWebsitePages()});
});
const planStatus=z.enum(['draft','approved','scheduled','published','cancelled']);
const planSchema=z.object({
 id:z.string().uuid().optional(),platform:z.string().refine(isPlatform),accountId:z.string().max(120).default(''),title:z.string().trim().min(1).max(300),caption:z.string().max(5000).default(''),scheduledAt:z.iso.datetime(),status:planStatus.default('scheduled'),permalink:z.string().max(1000).default(''),externalId:z.string().max(200).default(''),owner:z.string().max(120).default(''),contentType:z.string().max(60).default('post'),campaign:z.string().max(120).default(''),notes:z.string().max(1000).default('')
});
const planPatchSchema=z.object({scheduledAt:z.iso.datetime().optional(),status:planStatus.optional(),permalink:z.string().max(1000).optional(),externalId:z.string().max(200).optional()}).strict();
const PROOF_REQUIRED='أضف رابط المنشور أو معرّفه لتأكيد النشر.';
app.post('/api/plans',async(req,res)=>{
 const parsed=planSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'بيانات البوست غير صالحة.',issues:parsed.error.issues});
 if(missingPublishProof(parsed.data))return res.status(400).json({error:PROOF_REQUIRED});
 const old=parsed.data.id?getPlan(parsed.data.id):undefined;
 const plan=newPlan({...old,...parsed.data,platform:parsed.data.platform as Platform,createdAt:old?.createdAt,sourceKey:old?.sourceKey});
 const saved=savePlan(plan);
 await checkAlerts();
 res.json(saved);
});
app.patch('/api/plans/:id',async(req,res)=>{
 const parsed=planPatchSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'تعديل غير صالح.',issues:parsed.error.issues});
 const old=getPlan(String(req.params.id));if(!old)return res.status(404).json({error:'البوست غير موجود؛ ربما حُذف.'});
 const plan=applyPlanPatch(old,parsed.data);
 if(missingPublishProof(plan))return res.status(400).json({error:PROOF_REQUIRED,code:'proof_required'});
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
app.use('/api',(_req,res)=>res.status(404).json({error:'المسار غير موجود.'}));
const dist=resolve('dist');if(existsSync(dist)){
 app.use(express.static(dist));
 app.get('/{*path}',(_req,res)=>res.sendFile(resolve(dist,'index.html')));
}
app.listen(port,host,()=>console.log(`Social Pulse listening on http://${host}:${port}`));
setTimeout(()=>{void runSync().catch(()=>{});},1500);
setInterval(()=>{void checkAlerts().catch(()=>{});},60_000).unref();
setInterval(()=>{void runSync().catch(()=>{});},30*60_000).unref();
