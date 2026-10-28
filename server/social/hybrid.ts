import { randomUUID } from 'node:crypto';
import { db, defineSchema, defineColumn } from '../db.js';
import { accessToken } from './credentials.js';
import { loadSecret, seal } from './store.js';
import { postJSON } from './http.js';
import { publicMediaUrl, type PreparedMedia } from './media.js';
import type { PublishInput, PublishJob, PublishResult, SocialAccount } from './types.js';
import { tiktokPhotoTitle } from '../../src/domain/tiktok-publishing.js';

export const publishingServices = ['buffer', 'zernio'] as const;
export type PublishingService = typeof publishingServices[number];
interface Route { account_id:string; service:PublishingService; target_id:string; username:string; service_username:string|null; credential_id:string; enabled:number; verified_at:string; status:string; cooldown_until:number; error:string|null }
interface Attempt { job_id:string; service:PublishingService; target_id:string; username:string; credential_id:string; mode:'direct'|'draft'; state:string; remote_id:string|null; error_code:string|null; created_at:string; updated_at:string }
interface Target { id:string; username:string; connected:boolean }
defineSchema(`
CREATE TABLE IF NOT EXISTS social_publishing_routes (
 account_id TEXT NOT NULL, service TEXT NOT NULL, target_id TEXT NOT NULL, username TEXT NOT NULL,
 credential_id TEXT NOT NULL, service_username TEXT, enabled INTEGER NOT NULL DEFAULT 1, verified_at TEXT NOT NULL,
 status TEXT NOT NULL, cooldown_until INTEGER NOT NULL DEFAULT 0, error TEXT,
 PRIMARY KEY(account_id,service)
);
CREATE TABLE IF NOT EXISTS social_publishing_attempts (
 job_id TEXT NOT NULL, service TEXT NOT NULL, target_id TEXT NOT NULL, username TEXT NOT NULL,
 credential_id TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'direct', state TEXT NOT NULL, remote_id TEXT, error_code TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(job_id,service)
);
`);
defineColumn('social_publishing_routes','service_username','TEXT');
defineColumn('social_publishing_attempts','mode',"TEXT NOT NULL DEFAULT 'direct'");
const normalize = (name:unknown) => String(name||'').trim().replace(/^@/,'').toLowerCase();
const bufferEndpoint = 'https://api.buffer.com';
const zernioEndpoint = 'https://zernio.com/api/v1';
const postFields = 'id status externalLink schedulingType channelId error { message }';
class ServiceError extends Error {
 constructor(public code:string, public disposition:'fallback'|'failed'|'unknown', public retryAfter=60) { super(`Publishing service: ${code}`); }
}
export class IdentityConfirmationRequired extends Error {
 constructor(public candidates:Target[],public expectedUsername:string) {super('The service uses a different account label. Verify the exact connected account before confirming this mapping.');}
}
async function api(service:PublishingService,key:string,path:string,body?:unknown,write=false,jobId?:string):Promise<any> {
 let response:Response;
 try {
  response=await fetch(service==='buffer'?bufferEndpoint:zernioEndpoint+path,{
   method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(write?90_000:20_000),
   headers:{Authorization:`Bearer ${key}`,...(body?{'Content-Type':'application/json'}:{}),...(write&&service==='zernio'?{'Idempotency-Key':jobId!}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
  });
 } catch { throw new ServiceError('transport_unconfirmed',write?'unknown':'fallback'); }
 let data:any;try{data=await response.json();}catch{throw new ServiceError('invalid_service_response',write?'unknown':'fallback');}
 if(!response.ok||data.errors?.length) {
  const retry=Number(response.headers.get('retry-after'));
  const retryAfter=Number.isFinite(retry)&&retry>0?Math.min(retry,31*86400):60;
  const upstream=data.type==='platform_error'||data.platformError||data.details?.quotaExhausted;
  const safeRejection=!upstream&&[401,402,403,429].includes(response.status);
  // A 5xx, GraphQL error, or upstream error can hide a successful write. Never switch services on it.
  throw new ServiceError(upstream?'platform_rejected':response.status===429?'service_quota':response.status===401||response.status===403?'service_authorization':response.status===402?'service_plan':'service_unconfirmed',!write||safeRejection?'fallback':response.status>=400&&response.status<500&&!upstream?'failed':'unknown',retryAfter);
 }
 return data;
}
const graphql=(key:string,query:string,variables:Record<string,unknown>={},write=false,jobId?:string)=>api('buffer',key,'',{query,variables},write,jobId);
async function keyFor(route:{credential_id:string}) {
 const value=await loadSecret<{apiKey:string}>(route.credential_id);
 if(!value?.apiKey)throw new ServiceError('service_not_configured','fallback');return value.apiKey;
}
async function targets(service:PublishingService,key:string):Promise<Target[]> {
 if(service==='buffer') {
  const data=await graphql(key,'query { account { organizations { id } } }');
  const result:Target[]=[];
  for(const org of data.data?.account?.organizations||[]) {
   const r=await graphql(key,'query($input: ChannelsInput!) { channels(input:$input) { id name service isDisconnected isLocked allowedActions } }',{input:{organizationId:org.id}});
   for(const c of r.data?.channels||[])if(c.service==='tiktok')result.push({id:c.id,username:normalize(c.name),connected:!c.isDisconnected&&!c.isLocked&&c.allowedActions?.includes('scheduleUpdates')});
  }
  return result;
 }
 const data=await api(service,key,'/accounts?platform=tiktok');
 return (data.accounts||[]).filter((a:any)=>a.platform==='tiktok').map((a:any)=>({id:a._id,username:normalize(a.username),connected:a.isActive===true&&!a.needsReconnection}));
}
async function checkTarget(service:PublishingService,key:string,id:string,username:string) {
 if(service==='buffer') {
  const r=await graphql(key,'query($input: ChannelInput!) { channel(input:$input) { id name service isDisconnected isLocked allowedActions } }',{input:{id}}),c=r.data?.channel;
  if(c?.service!=='tiktok'||c.id!==id||normalize(c.name)!==username)throw new ServiceError('account_identity_changed','failed');
  if(c.isDisconnected||c.isLocked||!c.allowedActions?.includes('scheduleUpdates'))throw new ServiceError('service_authorization','fallback');
 } else {
  const r=await api(service,key,`/accounts/${encodeURIComponent(id)}/health`);
  if(r.accountId!==id||r.platform!=='tiktok'||normalize(r.username)!==username)throw new ServiceError('account_identity_changed','failed');
  if(r.tokenStatus?.valid!==true||r.permissions?.canPost!==true)throw new ServiceError('service_authorization','fallback');
 }
}
export const hybridRoutes=(id:string)=>db.all<Route>('SELECT * FROM social_publishing_routes WHERE account_id=?',[id]);
export async function hybridConfigured(id:string,kind='video') {return (await hybridRoutes(id)).some(r=>Boolean(r.enabled)&&(kind==='video'||r.service==='zernio'));}
export async function hybridSummary(id:string) {
 const rows=await hybridRoutes(id);
 return publishingServices.map(service=>{const r=rows.find(r=>r.service===service);return {service,configured:Boolean(r),enabled:Boolean(r?.enabled),username:r?.username||null,status:r?.status||'unconfigured',verifiedAt:r?.verified_at||null,cooldownUntil:r?.cooldown_until||0,error:r?.error||null};});
}
export async function connectPublishingService(account:SocialAccount,service:PublishingService,key:string,identity?:{targetId:string;confirmed:true},actorId=account.ownerId) {
 if(account.provider!=='tiktok'||account.status==='disconnected')throw new Error('Choose a connected TikTok account.');
 if(await db.get("SELECT id FROM social_publish_jobs WHERE account_id=? AND state IN ('processing','unknown','awaiting_user') LIMIT 1",[account.id]))throw new Error('Resolve the pending publication before changing publishing services.');
 // TikTok open_id differs between apps. Verify the actual creator handle rather than comparing app-scoped IDs.
 const direct=await postJSON('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',await accessToken(account),{});
 const username=normalize(direct.data?.creator_username);
 if(!username)throw new Error('Reconnect the original TikTok account to verify its creator identity first.');
 const candidates=(await targets(service,key)).filter(t=>t.connected),matches=candidates.filter(t=>t.username===username);
 let target=matches.length===1?matches[0]:undefined;
 if(!target&&identity?.confirmed)target=candidates.find(t=>t.id===identity.targetId);
 if(!target){if(candidates.length)throw new IdentityConfirmationRequired(candidates,username);throw new Error('Connect this exact TikTok account to the service first.');}
 await checkTarget(service,key,target.id,target.username);
 const credentialId=`publishing:${service}:${randomUUID()}`,now=new Date().toISOString();
 await db.tx(async tx=>{
  await tx.run('INSERT INTO social_credentials(id,encrypted_json,updated_at) VALUES(?,?,?)',[credentialId,seal(credentialId,{apiKey:key,identityConfirmation:identity||null,verifiedBy:actorId,expectedUsername:username}),now]);
  await tx.run(`INSERT INTO social_publishing_routes(account_id,service,target_id,username,service_username,credential_id,enabled,verified_at,status,cooldown_until,error) VALUES(?,?,?,?,?,?,1,?,'connected',0,NULL)
   ON CONFLICT(account_id,service) DO UPDATE SET target_id=excluded.target_id,username=excluded.username,service_username=excluded.service_username,credential_id=excluded.credential_id,enabled=1,verified_at=excluded.verified_at,status='connected',cooldown_until=0,error=NULL`,[account.id,service,target.id,username,target.username,credentialId,now]);
 });
 return hybridSummary(account.id);
}
export async function checkPublishingService(accountId:string,service:PublishingService) {
 const route=(await hybridRoutes(accountId)).find(r=>r.service===service);if(!route)throw new Error('Service is not configured.');
 try {await checkTarget(service,await keyFor(route),route.target_id,route.service_username||route.username);await db.run("UPDATE social_publishing_routes SET status='connected',verified_at=?,error=NULL WHERE account_id=? AND service=?",[new Date().toISOString(),accountId,service]);}
 catch(e){await routeError(route,e);}
 return hybridSummary(accountId);
}
async function routeError(route:Route,e:unknown) {
 const error=e instanceof ServiceError?e:new ServiceError('service_check_failed','fallback');
 await db.run("UPDATE social_publishing_routes SET status='unavailable',error=?,cooldown_until=? WHERE account_id=? AND service=?",[error.code,Date.now()+error.retryAfter*1000,route.account_id,route.service]);
}
export function bufferEligible(input:PublishInput) {
 // Buffer's public API currently exposes no TikTok commercial, privacy or interaction settings.
 // Never silently discard those settings. Promotional posts always use Zernio.
 return input.mode==='direct'&&input.kind==='video'&&input.privacy==='PUBLIC_TO_EVERYONE'&&!input.brandContent&&!input.brandOrganic&&input.bufferDefaultsConsent===true;
}
export async function hybridCreator(account:SocialAccount,mediaType:'video'|'photo'='video') {
 const routes=await hybridRoutes(account.id),route=routes.find(r=>r.service==='zernio'&&r.enabled);
 if(route) {
  try {
   const key=await keyFor(route);await checkTarget(route.service,key,route.target_id,route.service_username||route.username);
   const info=await api('zernio',key,`/accounts/${encodeURIComponent(route.target_id)}/tiktok/creator-info?mediaType=${mediaType}`);
   return {creator_username:route.username,creator_nickname:info.creator?.nickname||account.name,privacy_level_options:(info.privacyLevels||[]).map((p:any)=>p.value).filter((p:string)=>p==='PUBLIC_TO_EVERYONE'),max_video_post_duration_sec:info.postingLimits?.maxVideoDurationSec,comment_disabled:info.postingLimits?.interactionSettings?.allow_comment?.enabled===false,duet_disabled:info.postingLimits?.interactionSettings?.allow_duet?.enabled===false,stitch_disabled:info.postingLimits?.interactionSettings?.allow_stitch?.enabled===false,hybrid:true,bufferDefaultsRequired:mediaType==='video',photoPublishing:mediaType==='photo',aiPhotoRequiresInbox:mediaType==='photo'};
  } catch { /* A connected Buffer channel can still offer publishing with its own settings. */ }
 }
 const buffer=routes.find(r=>r.service==='buffer'&&r.enabled);
 if(!buffer||mediaType==='photo')throw new Error('No publishing service is available for this media type.');
 await checkTarget('buffer',await keyFor(buffer),buffer.target_id,buffer.service_username||buffer.username);
 return {creator_username:buffer.username,creator_nickname:account.name,privacy_level_options:['PUBLIC_TO_EVERYONE'],hybrid:true,bufferDefaultsRequired:true,bufferOnly:true};
}
const phase=(service:PublishingService)=>`hybrid:${service}`;
const postUrl=(value:unknown,username:string)=>{
 try {const u=new URL(String(value));return u.protocol==='https:'&&['www.tiktok.com','tiktok.com'].includes(u.hostname)&&normalize(u.pathname.split('/')[1])===username&&/^\/@[^/]+\/(video|photo)\/\d+\/?$/.test(u.pathname)?u.href:undefined;}catch{return undefined;}
};
function resultFrom(service:PublishingService,data:any,attempt:{target_id:string;username:string;mode?:'direct'|'draft'}):PublishResult {
 const post=service==='buffer'?data:data.post;
 if(service==='buffer') {
  if(post?.channelId!==attempt.target_id)throw new ServiceError('post_account_mismatch','unknown');
  const url=postUrl(post.externalLink,attempt.username),id=url?.match(/\/video\/(\d+)/)?.[1];
  if(post.status==='sent'&&post.schedulingType==='automatic'&&id)return {state:'published',remoteId:post.id,externalId:id,url,phase:phase(service)};
  if(['error','draft','needs_approval'].includes(post.status)||post.schedulingType!=='automatic')return {state:'unknown',remoteId:post.id,errorCode:'service_publication_unconfirmed',error:'Review the existing Buffer post. No backup upload was started.',phase:phase(service)};
  return {state:'processing',remoteId:post.id,phase:phase(service)};
 }
 const entries=post?.platforms||[],entry=entries.find((p:any)=>p.platform==='tiktok'&&String(p.accountId?._id||p.accountId)===attempt.target_id);
 if(!entry||entries.length!==1)throw new ServiceError('post_account_mismatch','unknown');
 if(attempt.mode==='draft'||entry.platformSpecificData?.isDraft===true) {
  if(entry.status==='published'&&attempt.mode==='draft'&&entry.platformSpecificData?.isDraft===true)return {state:'awaiting_user',remoteId:post._id,phase:phase(service)};
  if(entry.status==='published')return {state:'unknown',remoteId:post._id,errorCode:'delivery_mode_unconfirmed',phase:phase(service)};
 }
 const proof=postUrl(entry.platformPostUrl,attempt.username),rawId=String(entry.platformPostId||''),id=/^\d+$/.test(rawId)?rawId:proof?.match(/\/(?:video|photo)\/(\d+)/)?.[1],url=proof;
 if(entry.status==='published'&&id)return {state:'published',remoteId:post._id,externalId:id,url,phase:phase(service)};
 if(['failed','cancelled'].includes(entry.status)||['draft','pending_approval','cancelled','failed'].includes(post.status))return {state:'unknown',remoteId:post._id,errorCode:'service_publication_unconfirmed',error:'Review the existing Zernio post. No backup upload was started.',phase:phase(service)};
 return {state:'processing',remoteId:post._id,phase:phase(service)};
}
async function saveAttempt(jobId:string,service:PublishingService,result:PublishResult) {
 await db.run('UPDATE social_publishing_attempts SET state=?,remote_id=COALESCE(?,remote_id),error_code=?,updated_at=? WHERE job_id=? AND service=?',[result.state,result.remoteId||null,result.errorCode||null,new Date().toISOString(),jobId,service]);
}
export function validateHybrid(input:PublishInput,caption:string,media:PreparedMedia[],title?:string) {
 if(input.privacy!=='PUBLIC_TO_EVERYONE')throw new Error('Choose public TikTok privacy explicitly.');
 if(input.kind==='video') {
  if(input.mode!=='direct'||media.length!==1||media[0].type!=='video')throw new Error('Choose one TikTok video for direct publishing.');
  if(caption.length>2200||(media[0].duration||0)<3)throw new Error('TikTok videos need at least 3 seconds and captions up to 2,200 characters.');
 } else {
  if(!['image','carousel'].includes(input.kind)||media.some(m=>m.type!=='image')||!media.length||media.length>35||input.kind==='image'&&media.length!==1||input.kind==='carousel'&&media.length<2)throw new Error('Choose one image or a carousel of 2–35 images, without videos.');
  if(caption.length>4000)throw new Error('TikTok photo descriptions are limited to 4,000 characters.');
  if(title!==undefined&&!tiktokPhotoTitle(title))throw new Error('The approved content needs a photo title without hashtags or URLs.');
  const cover=input.photoCoverIndex??0;if(!Number.isInteger(cover)||cover<0||cover>=media.length)throw new Error('Choose a cover from the selected photos.');
  if(input.autoAddMusic&&(input.brandContent||input.brandOrganic))throw new Error('Automatic recommended music is only supported for non-promotional photos.');
  if(input.mode==='direct'&&input.isAiGenerated)throw new Error('Send AI-generated photos to the TikTok inbox and enable the AI disclosure in TikTok before publishing.');
 }
}
export async function submitHybrid(account:SocialAccount,input:PublishInput,caption:string,media:PreparedMedia[],job:PublishJob,persist:(r:PublishResult)=>Promise<void>,title=caption):Promise<PublishResult> {
 validateHybrid(input,caption,media,title);
 const photo=input.kind==='image'||input.kind==='carousel',photoTitle=tiktokPhotoTitle(title);
 const routes=await hybridRoutes(account.id);let last='no_eligible_service';
 for(const service of publishingServices) {
  const route=routes.find(r=>r.service===service&&r.enabled);
  if(!route||route.cooldown_until>Date.now()||service==='buffer'&&!bufferEligible(input))continue;
  let key:string;
  try{
   key=await keyFor(route);await checkTarget(service,key,route.target_id,route.service_username||route.username);
   if(photo) {
    const info=await api('zernio',key,`/accounts/${encodeURIComponent(route.target_id)}/tiktok/creator-info?mediaType=photo`);
    if(!info.privacyLevels?.some((p:any)=>p.value===input.privacy)||info.creator?.canPostMore===false||input.disableComment===false&&info.postingLimits?.interactionSettings?.allow_comment?.enabled===false)throw new ServiceError('photo_settings_unavailable','failed');
   }
  }catch(e){await routeError(route,e);if(e instanceof ServiceError&&e.disposition==='failed')return {state:'failed',errorCode:e.code,error:e.message};last=e instanceof ServiceError?e.code:'preflight_failed';continue;}
  const now=new Date().toISOString();
  const inserted=await db.run("INSERT INTO social_publishing_attempts(job_id,service,target_id,username,credential_id,mode,state,created_at,updated_at) VALUES(?,?,?,?,?,?,'submitting',?,?) ON CONFLICT(job_id,service) DO NOTHING",[job.id,service,route.target_id,route.username,route.credential_id,input.mode,now,now]);
  if(!inserted.changes)return {state:'unknown',errorCode:'existing_service_attempt',phase:phase(service)};
  await persist({state:'processing',phase:phase(service)});
  try {
   let result:PublishResult;
   if(service==='buffer') {
    const r=await graphql(key,`mutation($input: CreatePostInput!) { createPost(input:$input) { __typename ... on PostActionSuccess { post { ${postFields} } } ... on MutationError { message } } }`,{input:{channelId:route.target_id,text:caption,schedulingType:'automatic',mode:'shareNow',assets:[{video:{url:publicMediaUrl(media[0].id)}}],metadata:{tiktok:{isAiGenerated:input.isAiGenerated===true}}}},true,job.id);
    const value=r.data?.createPost;
    if(value?.__typename!=='PostActionSuccess')throw new ServiceError(['LimitReachedError','PostLimitReachedError','UnauthorizedError'].includes(value?.__typename)?'service_rejected':'service_unconfirmed',['LimitReachedError','PostLimitReachedError','UnauthorizedError'].includes(value?.__typename)?'fallback':'unknown');
    if(!value.post?.id)throw new ServiceError('missing_remote_id','unknown');
    await saveAttempt(job.id,service,{state:'processing',remoteId:value.post.id});
    await persist({state:'processing',remoteId:value.post.id,phase:phase(service)});
    result=resultFrom(service,value.post,route);
   } else {
    const r=await api(service,key,'/posts',{content:photo?photoTitle:caption,mediaItems:media.map(m=>({type:m.type,url:publicMediaUrl(m.id)})),platforms:[{platform:'tiktok',accountId:route.target_id}],publishNow:true,tiktokSettings:{privacyLevel:input.privacy,allowComment:input.disableComment===false,...(photo?{mediaType:'photo',description:caption,photoCoverIndex:input.photoCoverIndex??0,autoAddMusic:input.autoAddMusic===true,draft:input.mode==='draft'}:{allowDuet:input.disableDuet===false,allowStitch:input.disableStitch===false,videoMadeWithAi:input.isAiGenerated===true}),commercialContentType:input.brandOrganic?'brand_organic':input.brandContent?'brand_content':'none',brandPartnerPromote:input.brandContent===true,isBrandOrganicPost:input.brandOrganic===true,contentPreviewConfirmed:true,expressConsentGiven:true}},true,job.id);
    if(!r.post?._id)throw new ServiceError('missing_remote_id','unknown');
    await saveAttempt(job.id,service,{state:'processing',remoteId:r.post._id});
    await persist({state:'processing',remoteId:r.post._id,phase:phase(service)});
    result=resultFrom(service,r,{...route,mode:input.mode});
   }
   await saveAttempt(job.id,service,result);return result;
  } catch(e) {
   const error=e instanceof ServiceError?e:new ServiceError('service_unconfirmed','unknown');
   const result:PublishResult={state:error.disposition==='fallback'?'failed':error.disposition,errorCode:error.code,error:error.message,phase:phase(service)};
   // Once a remote handle exists, its outcome must be reconciled on that service.
   const current=await db.get<Attempt>('SELECT * FROM social_publishing_attempts WHERE job_id=? AND service=?',[job.id,service]);
   if(current?.remote_id){result.state='unknown';result.remoteId=current.remote_id;await saveAttempt(job.id,service,result);return result;}
   await saveAttempt(job.id,service,result);
   if(error.disposition!=='fallback')return result;
   await db.run("UPDATE social_publishing_attempts SET state='rejected' WHERE job_id=? AND service=?",[job.id,service]);
   await routeError(route,error);last=error.code;
  }
 }
 return {state:'failed',errorCode:last,error:'No eligible publishing service is available. Check connections, quota and supported TikTok settings.',retryable:true};
}
export async function pollHybrid(job:PublishJob):Promise<PublishResult> {
 const attempts=await db.all<Attempt>('SELECT * FROM social_publishing_attempts WHERE job_id=?',[job.id]);
 const active=attempts.filter(a=>a.state!=='rejected');
 if(active.length!==1)return {state:'unknown',errorCode:'service_attempt_unconfirmed',error:'Review service history before retrying.'};
 const a=active[0];if(!a.remote_id)return {state:'unknown',errorCode:'service_write_unconfirmed',error:'The service may have accepted this post. No backup upload was started.',phase:phase(a.service)};
 const key=await keyFor(a),data=a.service==='buffer'?(await graphql(key,`query($input: PostInput!) { post(input:$input) { ${postFields} } }`,{input:{id:a.remote_id}})).data?.post:await api('zernio',key,`/posts/${encodeURIComponent(a.remote_id)}`);
 const result=resultFrom(a.service,data,a);await saveAttempt(job.id,a.service,result);return result;
}
