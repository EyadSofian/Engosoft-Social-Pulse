import { reelCoverFor } from '../../src/domain/reel-covers.js';
import { submitLinkedIn, pollLinkedIn, verifyLinkedInEvidence } from './linkedin.js';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { userCan, type AuthUser } from '../auth.js';
import { approveForPublishing, canSee, getContent, markPublishedWhenComplete } from '../workspace.js';
import { getPlan, savePlan } from '../store.js';
import { newPlan } from '../domain.js';
import { getAccount } from './store.js';
import { capabilities, requiredCapability } from './capabilities.js';
import { resolveMedia, validateMedia } from './media.js';
import { poll, publishInstagramContainer, submit, PublicationValidationError } from './publish-providers.js';
import { ProviderError } from './http.js';
import { hybridConfigured, hybridRoutes, pollHybrid, submitHybrid, validateHybrid } from './hybrid.js';
import type { PublishInput, PublishJob, PublishResult } from './types.js';
const toJob=(r:Record<string,any>):PublishJob=>({id:r.id,attempt:Number(r.attempt||1),contentId:r.content_id,accountId:r.account_id,provider:r.provider,actorId:r.actor_id,state:r.state,remoteId:r.remote_id||undefined,externalId:r.external_id||undefined,url:r.url||undefined,error:r.error||undefined,errorCode:r.error_code||undefined,retryable:Boolean(r.retryable),retryAfter:r.retry_after||undefined,phase:r.phase||undefined,createdAt:r.created_at,updatedAt:r.updated_at});
export const getJob=async(id:string)=>{const r=await db.get('SELECT * FROM social_publish_jobs WHERE id=?',[id]);return r?toJob(r):undefined;};
export const contentJobs=async(contentId:string)=>(await db.all('SELECT * FROM social_publish_jobs WHERE content_id=? ORDER BY created_at DESC,attempt DESC',[contentId])).map(toJob);
export const recentJobs=async(limit=60)=>(await db.all('SELECT * FROM social_publish_jobs ORDER BY updated_at DESC LIMIT ?',[limit])).map(toJob);
export async function updateJob(id:string,result:PublishResult) {
 await db.run('UPDATE social_publish_jobs SET state=?,remote_id=COALESCE(?,remote_id),external_id=COALESCE(?,external_id),url=COALESCE(?,url),error=?,error_code=?,retryable=?,retry_after=?,phase=COALESCE(?,phase),updated_at=? WHERE id=?',[result.state,result.remoteId||null,result.externalId||null,result.url||null,result.error||null,result.errorCode||null,result.retryable?1:0,result.retryAfter||null,result.phase||null,new Date().toISOString(),id]);
}
export async function publish(user:AuthUser,input:PublishInput):Promise<PublishJob> {
 if(!userCan(user,'content.publish'))throw new Error('Publishing permission required.');
 let item=await getContent(input.contentId);const account=await getAccount(input.accountId);
 if(!item||!canSee(user,item))throw new Error('Content unavailable.');
 if(!account||account.status!=='connected'||!item.channels.includes(account.provider))throw new Error('Select a connected account for an approved channel.');
 const existing=await db.get('SELECT * FROM social_publish_jobs WHERE content_id=? AND account_id=? ORDER BY attempt DESC LIMIT 1',[item.id,account.id]);if(existing&&(!input.retry||existing.state!=='failed'))return toJob(existing);
 // The publisher's own publish is the approval; already-live posts may still reach their other accounts.
 item=await approveForPublishing(user,item);
 if(!['approved','scheduled','published'].includes(item.status))throw new Error('This post is cancelled or archived. Restore it before publishing.');
 if(!input.consent)throw new Error('Explicit publication consent required.');
 const hybrid=account.provider==='tiktok'&&(input.kind==='video'&&input.mode==='direct'||['image','carousel'].includes(input.kind))&&await hybridConfigured(account.id,input.kind);
 if(!hybrid&&capabilities(account.provider,account)[requiredCapability(input.kind,input.mode)]!=='available')throw new Error('Publishing authorization or application approval is required.');
 const caption=item.captions[account.provider]||'';
 if(account.provider==='tiktok'&&new Set(input.media.map(m=>m.url)).size!==input.media.length)throw new Error('Select each TikTok media item only once.');
 const media=await resolveMedia(item,input.media.map(m=>m.url));validateMedia(account.provider,input,media,caption);
 const cover = input.kind === 'video' ? reelCoverFor(account.provider, item.creative) : undefined;
 if (cover?.timestampMs !== undefined && (!Number.isInteger(cover.timestampMs) || cover.timestampMs < 0 || cover.timestampMs >= (media[0]?.duration ?? 0) * 1000)) throw new Error('اختار لقطة غلاف من داخل مدة الفيديو.');
 input = { ...input, videoCoverTimestampMs: cover?.timestampMs };
 if (account.provider === 'tiktok' && input.kind === 'video' && input.mode === 'direct' && !hybrid && cover && cover.timestampMs === undefined && (item.creative?.reelCover || item.creative?.reelCovers?.tiktok)) throw new Error('ربط تيك توك الحالي يقبل لقطة من الفيديو كغلاف. اختار لقطة بدل الصورة المرفوعة.');
 if (hybrid && cover && cover.timestampMs === undefined && !(await hybridRoutes(account.id)).some(route => route.enabled && route.service === 'zernio')) throw new Error('ربط تيك توك الحالي يقبل لقطة من الفيديو كغلاف. اختار لقطة من الفيديو أو اربط خدمة تدعم صورة الغلاف المخصصة.');
 const preparedCover = cover && !['snapchat'].includes(account.provider) ? (await resolveMedia(item, [cover.url]))[0] : undefined;
 if (preparedCover && preparedCover.type !== 'image') throw new Error('غلاف الريل لازم يكون صورة.');
 if(hybrid)validateHybrid(input,caption,media,item.title);
 const latest=await getContent(item.id);if(!latest||latest.updatedAt!==item.updatedAt||!['approved','scheduled','published'].includes(latest.status))throw new Error('Approval changed. Review this content again before publishing.');
 const now=new Date().toISOString(),id=randomUUID(),attempt=Number(existing?.attempt||0)+1;
 // Database uniqueness arbitrates across requests/replicas before any remote write.
 const inserted=await db.run('INSERT INTO social_publish_jobs(id,content_id,account_id,provider,actor_id,state,phase,created_at,updated_at,attempt) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(content_id,account_id,attempt) DO NOTHING',[id,item.id,account.id,account.provider,user.id,'processing',hybrid?'hybrid:starting':'submitting',now,now,attempt]);
 if(!inserted.changes)return toJob((await db.get('SELECT * FROM social_publish_jobs WHERE content_id=? AND account_id=? ORDER BY attempt DESC LIMIT 1',[item.id,account.id]))!);
 const job=(await getJob(id))!;
 try {await updateJob(id,account.provider==='linkedin'?await submitLinkedIn(account,input,caption,media,job,r=>updateJob(id,r),preparedCover):hybrid?await submitHybrid(account,input,caption,media,job,r=>updateJob(id,r),item.title,preparedCover):await submit(account,input,caption,item.title,media,job,r=>updateJob(id,r),preparedCover));}
 catch(e) {
  const latest=(await getJob(id))!;
  // Transport/server errors can hide a successful write; keep the job and remote handle for reconciliation.
  const knownRejection=e instanceof PublicationValidationError||e instanceof ProviderError&&e.status>=400&&e.status<500;
  await updateJob(id,{state:knownRejection&&!latest.remoteId?'failed':'unknown',errorCode:e instanceof ProviderError?e.code:e instanceof PublicationValidationError?'invalid_publication':'unknown_outcome',retryable:e instanceof ProviderError&&e.retryable,retryAfter:e instanceof ProviderError?e.retryAfter:undefined,error:e instanceof ProviderError||e instanceof PublicationValidationError?e.message:'Publication was not confirmed. Check media, permissions and remote status before retrying.'});
 }
 await recordEvidence(id);return (await getJob(id))!;
}
const checking=new Map<string,Promise<PublishJob>>();
export function checkJob(id:string):Promise<PublishJob> {
 const existing=checking.get(id);if(existing)return existing;
 const result=check(id).finally(()=>checking.delete(id));checking.set(id,result);return result;
}
async function check(id:string) {
 const job=await getJob(id);if(!job)throw new Error('Publication not found.');
 if(['published','failed'].includes(job.state)) {await recordEvidence(id);return job;}
 const account=await getAccount(job.accountId);if(!account||account.status==='disconnected')return job;
 if(Date.now()-Date.parse(job.updatedAt)<60_000)return job;
 // Persistent compare-and-set prevents simultaneous polling and media_publish on separate replicas.
 const lock=await db.run('UPDATE social_publish_jobs SET updated_at=? WHERE id=? AND updated_at=?',[new Date().toISOString(),id,job.updatedAt]);if(!lock.changes)return (await getJob(id))!;
 try {
  let result=account.provider==='linkedin'?await pollLinkedIn(account,job):job.phase?.startsWith('hybrid:')?await pollHybrid(job):await poll(account,job);
  if(account.provider==='instagram'&&result.phase==='instagram_ready') {
   await updateJob(id,{state:'processing',phase:'instagram_publishing'});
   const externalId=await publishInstagramContainer(account,job);
   await updateJob(id,{state:'processing',externalId,phase:'instagram_verifying'});
   result=await poll(account,(await getJob(id))!);
  }
  await updateJob(id,result);await recordEvidence(id);
 }catch(e) {await updateJob(id,{state:'unknown',error:e instanceof ProviderError||e instanceof PublicationValidationError?e.message:'Remote status could not be confirmed. The existing job is retained.'});}
 return (await getJob(id))!;
}
async function recordEvidence(id:string) {
 const job=await getJob(id);if(job?.state!=='published'||!job.externalId)return;
 const item=await getContent(job.contentId),a=await getAccount(job.accountId);if(!item||!a)return;
 const plans=await Promise.all(item.planIds.map(getPlan));let plan=plans.find(p=>p?.platform===a.provider&&(!p.accountId||p.accountId===a.externalId));
 plan=await savePlan({...plan||newPlan({platform:a.provider,title:item.title,caption:item.captions[a.provider]||'',scheduledAt:job.createdAt,campaign:item.id}),accountId:a.externalId,status:'published',externalId:job.externalId,permalink:job.url||'',updatedAt:job.updatedAt});
 const planIds=[...new Set([...item.planIds,plan.id])];
 await db.run('UPDATE content_items SET plan_ids_json=? WHERE id=?',[JSON.stringify(planIds),item.id]);
 // The completed provider response is the evidence; analytics arrive separately through sync.
 // Published once every platform is, by API or recorded by hand (WhatsApp, X, website).
 await markPublishedWhenComplete(item.id,job.actorId);
 await db.run('INSERT INTO content_events(id,content_id,actor_id,kind,body,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',[`publication:${job.id}`,item.id,job.actorId,'comment',`Verified ${job.provider} publication: ${job.externalId}${job.url?' '+job.url:''}`,job.updatedAt]);
}
/** Every pending job, or only those still moving (`active`): an Instagram Reel is published by this check once its container is ready. */
export async function pollPendingJobs(active=false) {
 const states=active?"('processing')":"('processing','awaiting_user','unknown')";
 const rows=await db.all<{id:string}>(`SELECT id FROM social_publish_jobs WHERE state IN ${states} AND updated_at<? ORDER BY updated_at LIMIT 10`,[new Date(Date.now()-60_000).toISOString()]);
 for(const row of rows)await checkJob(row.id).catch(()=>{});
}

export async function reconcileJob(user:AuthUser,id:string,externalId:string) {
 if(!userCan(user,'content.publish'))throw new Error('Publishing permission required.');
 const job=await getJob(id),item=job?await getContent(job.contentId):undefined,a=job?await getAccount(job.accountId):undefined;
 if(!job||!item||!canSee(user,item)||!a||a.status!=='connected')throw new Error('Publication unavailable.');
 if(!['unknown','processing','awaiting_user'].includes(job.state))return job;
 const {verifyEvidence}=await import('./publish-providers.js');
 const result=a.provider==='linkedin'?await verifyLinkedInEvidence(a,externalId,job):await verifyEvidence(a,externalId,job);await updateJob(id,result);await recordEvidence(id);return (await getJob(id))!;
}
