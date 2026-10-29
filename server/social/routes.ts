import { tokenHealth } from './credentials.js';
import express from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requirePermission, userCan } from '../auth.js';
import { canEdit, canSee, contentIsMutable, getContent } from '../workspace.js';
import { registerSocialOAuth, socialProviders } from './oauth.js';
import { disconnect, getAccount, listAccounts } from './store.js';
import { capabilities, requiredCapability } from './capabilities.js';
import { configuredCallback } from './oauth.js';
import { attachImage, attachVideo, contentMedia, validMediaSignature } from './media.js';
import { contentJobs, getJob, publish, checkJob, reconcileJob } from './publishing.js';
import { creatorInfo } from './publish-providers.js';
import { IdentityConfirmationRequired, publishingServices, hybridConfigured, hybridSummary, connectPublishingService, checkPublishingService, hybridCreator } from './hybrid.js';
import { runSync } from '../sync.js';
import { cancelPublication, publishingBoard, publishNow, publishTargets, schedulePublication } from './queue.js';
import { contentQueue } from './store.js';
import { WorkspaceError } from '../workspace.js';
import { youtubeAnalytics } from '../connectors/youtube.js';
import type { PublishInput, SocialProvider } from './types.js';
const inputSchema=z.object({contentId:z.string().min(1),accountId:z.string().min(1),kind:z.enum(['text','image','video','carousel']),media:z.array(z.object({url:z.string().max(2048)})).max(35).default([]),mode:z.enum(['direct','draft']).default('direct'),privacy:z.string().optional(),categoryId:z.string().regex(/^\d+$/).optional(),tags:z.array(z.string().max(100)).max(50).optional(),madeForKids:z.boolean().optional(),disableComment:z.boolean().optional(),disableDuet:z.boolean().optional(),disableStitch:z.boolean().optional(),brandContent:z.boolean().optional(),brandOrganic:z.boolean().optional(),retry:z.boolean().optional(),snapTarget:z.enum(['story','spotlight']).optional(),locale:z.string().regex(/^[a-z]{2}_[A-Z]{2}$/).optional(),bufferDefaultsConsent:z.boolean().optional(),isAiGenerated:z.boolean().optional(),photoCoverIndex:z.number().int().min(0).max(34).optional(),autoAddMusic:z.boolean().optional(),consent:z.literal(true)});
let syncRunning:Promise<unknown>|null=null;
/** Writes come only from this app's own pages: the APP_URL origin, or the host the request was sent to (the Vite proxy in development). */
const sameOriginWrites:express.RequestHandler=(req,res,next)=>{
 const origin=req.header('origin');if(['GET','HEAD'].includes(req.method)||!origin)return next();
 let ok=false;try{const o=new URL(origin);ok=o.origin===new URL(process.env.APP_URL||'http://127.0.0.1:4100').origin||o.host===req.header('host');}catch{}
 if(!ok)return res.status(403).json({error:'Cross-origin request refused.'});next();
};
export function registerSocialRoutes(app:express.Express) {
 registerSocialOAuth(app);
 app.use('/api/social',sameOriginWrites);
 app.use('/api/publishing',sameOriginWrites);
 const failed=(res:express.Response,e:unknown)=>res.status(e instanceof WorkspaceError?e.status:409).json({error:e instanceof Error?e.message:'Publishing unavailable.'});
 app.get('/api/publishing',async(req,res)=>{
  if(!userCan(req.user!,'content.publish')&&!userCan(req.user!,'content.schedule'))return res.status(403).json({error:'Permission required.'});
  res.setHeader('Cache-Control','no-store');res.json(await publishingBoard(req.user!));
 });
 app.get('/api/publishing/:contentId',async(req,res)=>{
  const item=await getContent(String(req.params.contentId));if(!item||!canSee(req.user!,item))return res.status(404).json({error:'المحتوى غير موجود.'});
  res.setHeader('Cache-Control','no-store');res.json({targets:await publishTargets(item),queue:await contentQueue(item.id),jobs:await contentJobs(item.id)});
 });
 // `at` queues the publication for that time; without it the post goes out now.
 app.post('/api/publishing/:contentId',async(req,res)=>{
  const body=z.object({accountIds:z.array(z.string().min(1).max(200)).min(1).max(20),at:z.iso.datetime().optional(),consent:z.literal(true)}).safeParse(req.body);
  if(!body.success)return res.status(400).json({error:'اختر الحسابات وأكّد النشر.'});
  try{const id=String(req.params.contentId);res.json(body.data.at?{queue:await schedulePublication(req.user!,id,body.data.accountIds,body.data.at)}:{results:await publishNow(req.user!,id,body.data.accountIds)});}catch(e){failed(res,e);}
 });
 app.post('/api/publishing/:contentId/cancel',async(req,res)=>{
  try{res.json({queue:await cancelPublication(req.user!,String(req.params.contentId))});}catch(e){failed(res,e);}
 });
 app.get('/api/social/connections',async(req,res)=>{
  if(!userCan(req.user!,'connections.manage')&&!userCan(req.user!,'analytics.view')&&!userCan(req.user!,'content.publish'))return res.status(403).json({error:'Permission required.'});
  const accounts=await listAccounts();
  for(const a of accounts)if(a.provider==='tiktok')a.metadata={...a.metadata,hybridPublishing:await hybridConfigured(a.id),hybridPhotoPublishing:await hybridConfigured(a.id,'image')};
  const health=Object.fromEntries(await Promise.all(accounts.map(async a=>[a.id,await tokenHealth(a)])));
  res.setHeader('Cache-Control','no-store');
  res.json({providers:socialProviders.map(p=>{
   const linked=accounts.filter(a=>a.provider===p);let oauthConfigured=false;try{configuredCallback(p);oauthConfigured=true;}catch{}
   return {provider:p,oauthConfigured,accounts:linked.map(({credentialSource,ownerId,...a})=>({...a,authorization:health[a.id],capabilities:capabilities(p,linked.find(x=>x.id===a.id)!)})),capabilities:capabilities(p,linked.find(a=>a.status==='connected')),requirements:requirements(p)};
  })});
 });
 app.post('/api/social/accounts/:id/disconnect',requirePermission('connections.manage'),async(req,res)=>{
  const a=await getAccount(String(req.params.id));if(!a)return res.status(404).json({error:'Account not found.'});await disconnect(a.id);res.json({disconnected:true});
 });
 app.get('/api/social/publishing-services/:accountId',requirePermission('connections.manage'),async(req,res)=>{
  const a=await getAccount(String(req.params.accountId));if(!a||a.provider!=='tiktok')return res.status(404).end();
  res.setHeader('Cache-Control','no-store');res.json({services:await hybridSummary(a.id)});
 });
 app.post('/api/social/publishing-services/:accountId/:service',requirePermission('connections.manage'),async(req,res)=>{
  const service=z.enum(publishingServices).safeParse(req.params.service),a=await getAccount(String(req.params.accountId));
  const body=z.object({apiKey:z.string().trim().min(16).max(4096),identity:z.object({targetId:z.string().min(1).max(200),confirmed:z.literal(true)}).optional(),consent:z.literal(true)}).safeParse(req.body);
  if(!service.success||!a||a.provider!=='tiktok'||!body.success)return res.status(400).json({error:'Choose a TikTok account and confirm connecting its publishing service.'});
  try{res.setHeader('Cache-Control','no-store');res.json({services:await connectPublishingService(a,service.data,body.data.apiKey,body.data.identity,req.user!.id)});}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Publishing service could not be verified.',...(e instanceof IdentityConfirmationRequired?{candidates:e.candidates,expectedUsername:e.expectedUsername}:{})});}
 });
 app.post('/api/social/publishing-services/:accountId/:service/check',requirePermission('connections.manage'),async(req,res)=>{
  const service=z.enum(publishingServices).safeParse(req.params.service),a=await getAccount(String(req.params.accountId));
  if(!service.success||!a||a.provider!=='tiktok')return res.status(404).end();
  try{res.json({services:await checkPublishingService(a.id,service.data)});}catch{res.status(409).json({error:'Publishing service check failed.'});}
 });
 app.post('/api/social/publishing-services/:accountId/:service/disable',requirePermission('connections.manage'),async(req,res)=>{
  const service=z.enum(publishingServices).safeParse(req.params.service);if(!service.success)return res.status(404).end();
  await db.run('UPDATE social_publishing_routes SET enabled=0 WHERE account_id=? AND service=?',[String(req.params.accountId),service.data]);res.json({services:await hybridSummary(String(req.params.accountId))});
 });
 app.post('/api/social/:provider/sync',requirePermission('connections.manage'),async(req,res)=>{
  const provider=String(req.params.provider) as SocialProvider;if(!socialProviders.includes(provider))return res.status(404).end();
  if(syncRunning)return res.status(409).json({error:'A synchronization is already running.'});
  syncRunning=runSync(provider);
  try{const r=await syncRunning;res.json({results:r});}catch{res.status(502).json({error:'Synchronization failed.'});}finally{syncRunning=null;}
 });
 app.get('/api/social/accounts/:id/creator',requirePermission('content.publish'),async(req,res)=>{
  const mediaType=z.enum(['video','photo']).safeParse(req.query.mediaType||'video');if(!mediaType.success)return res.status(400).json({error:'Choose video or photo creator settings.'});
  const a=await getAccount(String(req.params.id)),kind=mediaType.data==='photo'?'image':'video';
  if(!a||a.provider!=='tiktok'||a.status!=='connected'||!await hybridConfigured(a.id,kind)&&capabilities('tiktok',a)[requiredCapability(kind,'direct')]!=='available')return res.status(409).json({error:'TikTok publishing consent and approval required.'});
  try{res.json(await hybridConfigured(a.id,kind)?await hybridCreator(a,mediaType.data):await creatorInfo(a));}catch{res.status(502).json({error:'Creator settings unavailable.'});}
 });
 app.get('/api/social/accounts/:id/analytics',requirePermission('analytics.view'),async(req,res)=>{
  const a=await getAccount(String(req.params.id));const start=String(req.query.startDate||''),end=String(req.query.endDate||'');
  if(!a||a.provider!=='youtube'||capabilities('youtube',a).read_analytics!=='available')return res.status(409).json({error:'YouTube Analytics consent required.'});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)return res.status(400).json({error:'Choose a valid date range.'});
  try{res.json(await youtubeAnalytics(a,start,end));}catch{res.status(502).json({error:'Analytics report unavailable. Check consent and API quota.'});}
 });
 app.get('/api/social/content/:id',async(req,res)=>{
  const item=await getContent(String(req.params.id));if(!item||!canSee(req.user!,item))return res.status(404).end();
  res.json({media:await contentMedia(item.id),jobs:await contentJobs(item.id)});
 });
 app.post('/api/social/content/:id/video',express.raw({type:'video/mp4',limit:'200mb'}),async(req,res)=>{
  const item=await getContent(String(req.params.id));if(!item||!canEdit(req.user!,item))return res.status(403).end();
  if(!userCan(req.user!,'design.video'))return res.status(403).json({error:'رفع الريلز والفيديو ليس ضمن صلاحياتك.',code:'forbidden'});
  if(!contentIsMutable(item))return res.status(409).json({error:'Return content for review before changing approved media.'});
  if(!Buffer.isBuffer(req.body))return res.status(400).json({error:'Upload an MP4 file.'});
  try {res.json(await attachVideo(item.id,req.body));}catch{res.status(400).json({error:'Use a standard MP4 export with duration and resolution metadata, up to 200 MB.'});}
 });
 app.post('/api/social/content/:id/image',express.raw({type:['image/jpeg','image/png','image/webp'],limit:'8mb'}),async(req,res)=>{
  const item=await getContent(String(req.params.id));if(!item||!canEdit(req.user!,item))return res.status(403).end();
  if(!contentIsMutable(item))return res.status(409).json({error:'Return content for review before changing approved media.'});
  if(!Buffer.isBuffer(req.body))return res.status(400).json({error:'Upload a JPEG, PNG or WebP image.'});
  try {res.json(await attachImage(item.id,req.body));}catch{res.status(400).json({error:'Use a still JPEG, PNG or WebP image up to 8 MB (40 megapixels maximum).'});}
 });
 app.get('/api/social/assets/:id',async(req,res)=>{
  const r=await db.get<{path:string;content_id:string}>('SELECT path,content_id FROM social_media WHERE id=?',[String(req.params.id)]);const item=r?await getContent(r.content_id):undefined;
  if(!r||!item||!canSee(req.user!,item))return res.status(404).end();res.sendFile(r.path,{headers:{'Cache-Control':'private, no-store'}});
 });
 app.get('/api/social/media/:id',async(req,res)=>{
  const id=String(req.params.id);if(!validMediaSignature(id,String(req.query.expires||''),String(req.query.signature||'')))return res.status(404).end();
  const r=await db.get<{path:string}>('SELECT path FROM social_media WHERE id=?',[id]);if(!r)return res.status(404).end();res.sendFile(r.path,{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 });
 app.post('/api/social/publish',requirePermission('content.publish'),async(req,res)=>{
  const parsed=inputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Choose approved content, an account, media options and explicit consent.'});
  try{res.json(await publish(req.user!,parsed.data as PublishInput));}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Publishing unavailable.'});}
 });
 app.post('/api/social/jobs/:id/reconcile',requirePermission('content.publish'),async(req,res)=>{
  const parsed=z.object({externalId:z.string().min(1).max(200),consent:z.literal(true)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Select a published ID and confirm that it is this content.'});
  try{res.json(await reconcileJob(req.user!,String(req.params.id),parsed.data.externalId));}catch{res.status(409).json({error:'That published ID could not be verified on the selected account.'});}
 });
 app.post('/api/social/jobs/:id/check',requirePermission('content.publish'),async(req,res)=>{
  const job=await getJob(String(req.params.id)),item=job?await getContent(job.contentId):undefined;if(!job||!item||!canSee(req.user!,item))return res.status(404).end();
  try{res.json(await checkJob(job.id));}catch{res.status(502).json({error:'Remote status unavailable. No new upload was started.'});}
 });
}
function requirements(p:SocialProvider) {
 if(p==='facebook')return ['Meta Page authorization: pages_read_engagement; publishing additionally requires pages_manage_posts and CREATE_CONTENT Page task.'];
 if(p==='instagram')return ['Linked Instagram Professional account; instagram_basic, instagram_manage_insights; publishing additionally requires instagram_content_publish and Page publishing authorization when required.'];
 if(p==='tiktok')return ['Display API consent does not permit publishing. Enable Content Posting API; authorize video.publish or video.upload separately. Unaudited Direct Post is SELF_ONLY. General access requires app review and demonstration video.'];
 if(p==='snapchat')return ['Business Manager OAuth app with snapchat-profile-api scope; Snap must allowlist the client ID; authorize the Public Profile. Story/Spotlight publishing exists in the official API and requires the separate encrypted media upload flow.'];
 return ['Enable YouTube Data API v3 and YouTube Analytics API; configure a Web OAuth client, exact callback URI and consent audience/test users; channel owner consent grants read access and optional youtube.upload.'];
}
