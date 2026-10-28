import { createCipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { accessToken } from './credentials.js';
import { graphRead, graphBase } from './accounts.js';
import { headers, postJSON, request, ProviderError } from './http.js';
import { loadSecret, saveSecret } from './store.js';
import { publicMediaUrl, type PreparedMedia } from './media.js';
import type { PublishInput, PublishJob, PublishResult, SocialAccount } from './types.js';
export class PublicationValidationError extends Error {}
export type Persist=(result:PublishResult)=>Promise<void>;
const tik='https://open.tiktokapis.com/v2/post/publish/';
const graphPost=(path:string,token:string,value:unknown)=>postJSON(`${graphBase()}/${path}`,token,value);
const remoteId=(id:unknown)=>{if(typeof id!=='string'||!id)throw new ProviderError(502,'missing_remote_id');return id;};
export async function creatorInfo(account:SocialAccount) {return (await postJSON(tik+'creator_info/query/',await accessToken(account),{})).data;}
async function transfer(url:string,token:string,data:Buffer,extra:Record<string,string>={},method='PUT') {
 const u=new URL(url);
 if(u.protocol!=='https:'||u.username||u.password||!(u.hostname==='www.googleapis.com'||/^(?:open-upload|upload(?:\.[a-z0-9-]+)?)\.tiktokapis\.com$/.test(u.hostname)))throw new Error('Unexpected upload destination.');
 let r:Response;try{r=await fetch(url,{method,headers:{...extra,...(token?headers(token):{})},body:data as unknown as BodyInit,redirect:'error',signal:AbortSignal.timeout(120_000)});}catch{throw new ProviderError(0,'transfer_unknown');}
 if(!r.ok)throw new ProviderError(r.status,'transfer_failed',r.status>=500);
 return r;
}
export async function submit(account:SocialAccount,input:PublishInput,caption:string,title:string,media:PreparedMedia[],job:PublishJob,persist:Persist):Promise<PublishResult> {
 const token=await accessToken(account),id=encodeURIComponent(account.externalId);
 if(account.provider==='facebook') {
  // Resolve the selected Page token, rather than posting with a user token.
  let pageToken=token;
  if(account.credentialSource==='env:meta') {
   const pages=await graphRead('me/accounts',token,{fields:'id,access_token,tasks',limit:'100'});
   const page=pages.data?.find((p:any)=>p.id===account.externalId);
   if(!page?.access_token||!page.tasks?.some((t:string)=>['CREATE_CONTENT','MANAGE'].includes(t)))throw new ProviderError(403,'page_create_content_required');
   pageToken=page.access_token;
  }
  const r=input.kind==='text'?await graphPost(`${id}/feed`,pageToken,{message:caption}):input.kind==='image'?await graphPost(`${id}/photos`,pageToken,{url:publicMediaUrl(media[0].id),caption}):await postJSON(`https://graph-video.facebook.com/${process.env.META_API_VERSION||'v24.0'}/${id}/videos`,pageToken,{file_url:publicMediaUrl(media[0].id),description:caption,title});
  const externalId=remoteId(r.post_id||r.id);await persist({state:'processing',remoteId:externalId,externalId,phase:input.kind==='video'?'facebook_video':'facebook_post'});
  return poll(account,{...job,state:'processing',remoteId:externalId,externalId,phase:input.kind==='video'?'facebook_video':'facebook_post'});
 }
 if(account.provider==='instagram') {
  const quota=await graphRead(`${id}/content_publishing_limit`,token,{fields:'quota_usage,config'});
  if(quota.data?.some((x:any)=>x.config?.quota_total&&x.quota_usage>=x.config.quota_total))throw new ProviderError(429,'publishing_limit');
  const children:string[]=[];
  if(input.kind==='carousel') for(const m of media) {
   const c=await graphPost(`${id}/media`,token,{...(m.type==='video'?{video_url:publicMediaUrl(m.id),media_type:'VIDEO'}:{image_url:publicMediaUrl(m.id)}),is_carousel_item:true});children.push(remoteId(c.id));
  }
  const m=media[0];const r=await graphPost(`${id}/media`,token,{caption,...(children.length?{media_type:'CAROUSEL',children:children.join(',')}:m.type==='video'?{media_type:'REELS',video_url:publicMediaUrl(m.id)}:{image_url:publicMediaUrl(m.id)})});
  const container=remoteId(r.id);await persist({state:'processing',remoteId:container,phase:'instagram_container'});return {state:'processing',remoteId:container,phase:'instagram_container'};
 }
 if(account.provider==='tiktok') {
  let info:Record<string,any>={};
  if(input.mode==='direct') {
   info=await creatorInfo(account);
   if(!info.privacy_level_options?.includes(input.privacy))throw new PublicationValidationError('Choose one of the latest privacy options for this creator.');
   if(process.env.TIKTOK_DIRECT_POST_APPROVED!=='true'&&input.privacy!=='SELF_ONLY')throw new PublicationValidationError('Unaudited TikTok apps are restricted to SELF_ONLY.');
   if(media.some(m=>m.type==='video'&&(m.duration||0)>info.max_video_post_duration_sec))throw new PublicationValidationError('Video exceeds the creator’s maximum duration.');
  }
  if(input.brandContent&&input.privacy==='SELF_ONLY')throw new PublicationValidationError('Paid partnerships cannot use SELF_ONLY privacy.');
  const post_info={title:caption,privacy_level:input.privacy,disable_comment:info.comment_disabled||input.disableComment!==false,disable_duet:info.duet_disabled||input.disableDuet!==false,disable_stitch:info.stitch_disabled||input.disableStitch!==false,brand_content_toggle:input.brandContent===true,brand_organic_toggle:input.brandOrganic===true};
  let r:Record<string,any>;
  if(media[0].type==='image') {
   const origin=new URL(process.env.APP_URL!);const verified=(process.env.TIKTOK_VERIFIED_MEDIA_ORIGINS||'').split(',').map(x=>x.trim());
   if(!verified.includes(origin.origin))throw new PublicationValidationError('Verify APP_URL as a TikTok media domain, then configure TIKTOK_VERIFIED_MEDIA_ORIGINS.');
   r=await postJSON(tik+'content/init/',token,{post_info:{...post_info,title:title.slice(0,90),description:caption},source_info:{source:'PULL_FROM_URL',photo_cover_index:0,photo_images:media.map(m=>publicMediaUrl(m.id))},post_mode:input.mode==='draft'?'MEDIA_UPLOAD':'DIRECT_POST',media_type:'PHOTO'});
  } else {
   const data=await readFile(media[0].file),chunkSize=Math.min(data.length,16*1024*1024),chunks=Math.max(1,Math.floor(data.length/chunkSize));
   r=await postJSON(tik+(input.mode==='draft'?'inbox/video/init/':'video/init/'),token,{...(input.mode==='direct'?{post_info}:{}),source_info:{source:'FILE_UPLOAD',video_size:data.length,chunk_size:chunkSize,total_chunk_count:chunks}});
   const publishId=remoteId(r.data?.publish_id);await persist({state:'processing',remoteId:publishId,phase:'tiktok_transfer'});
   for(let i=0;i<chunks;i++) {const start=i*chunkSize,end=i===chunks-1?data.length:Math.min(data.length,start+chunkSize);await transfer(r.data.upload_url,'',data.subarray(start,end),{'Content-Type':'video/mp4','Content-Length':String(end-start),'Content-Range':`bytes ${start}-${end-1}/${data.length}`});}
  }
  return {state:input.mode==='draft'?'awaiting_user':'processing',remoteId:remoteId(r.data?.publish_id),phase:'tiktok_status'};
 }
 if(account.provider==='snapchat') {
  const m=media[0],target=input.snapTarget||'story';
  if(target==='spotlight'&&(m.type!=='video'||(m.duration||0)<6||caption.length>160||!input.locale))throw new PublicationValidationError('Spotlight needs a 6–60 second video, locale, and at most 160 description characters.');
  const key=randomBytes(32),iv=randomBytes(16),cipher=createCipheriv('aes-256-cbc',key,iv),bytes=await readFile(m.file);
  const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
  const base=`https://businessapi.snapchat.com/v1/public_profiles/${id}`;
  const created=await postJSON(`${base}/media`,token,{type:m.type==='image'?'IMAGE':'VIDEO',name:title,key:key.toString('base64'),iv:iv.toString('base64')});
  const mediaId=remoteId(created.media_id);await persist({state:'processing',remoteId:mediaId,phase:'snapchat_transfer'});
  for(const path of [created.add_path,created.finalize_path])if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))throw new Error('Invalid Snapchat media transfer path.');
  for(let start=0,part=1;start<encrypted.length;start+=32*1024*1024,part++) {
   const form=new FormData();form.set('action','ADD');form.set('part_number',String(part));form.set('file',new Blob([new Uint8Array(encrypted.subarray(start,start+32*1024*1024))]),'media.enc');
   await request(`https://businessapi.snapchat.com${created.add_path}`,{method:'POST',headers:headers(token),body:form});
  }
  const finalize=new FormData();finalize.set('action','FINALIZE');await request(`https://businessapi.snapchat.com${created.finalize_path}`,{method:'POST',headers:headers(token),body:finalize});
  await persist({state:'processing',phase:`snapchat_${target}_submitting`});
  const r=await postJSON(`${base}/${target==='story'?'stories':'spotlights'}`,token,{media_id:mediaId,...(target==='spotlight'?{description:caption,locale:input.locale}:{})});
  if(target==='spotlight')return {state:'processing',remoteId:remoteId(r.spotlight_id),externalId:r.spotlight_id,phase:'snapchat_spotlight'};
  // Story POST returns SUCCESS without a post ID. Acceptance is not proof of a live Story.
  return {state:'unknown',phase:'snapchat_story',error:'Snapchat accepted the Story request without a post ID. Verify the live Story before recording publication evidence.'};
 }
 if(account.provider==='youtube') {
  if(!title.trim()||title.length>100||/[<>]/.test(title)||caption.length>5000)throw new PublicationValidationError('YouTube title/description is invalid.');
  const m=media[0];const r=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false',{method:'POST',headers:{...headers(token),'Content-Type':'application/json','X-Upload-Content-Length':String(m.bytes),'X-Upload-Content-Type':m.mimeType},body:JSON.stringify({snippet:{title,description:caption,categoryId:input.categoryId,tags:input.tags||[]},status:{privacyStatus:input.privacy,selfDeclaredMadeForKids:input.madeForKids}}),redirect:'error',signal:AbortSignal.timeout(30_000)});
  if(!r.ok)throw new ProviderError(r.status,'youtube_upload_init_failed');const location=r.headers.get('location');
  if(!location||new URL(location).origin!=='https://www.googleapis.com')throw new Error('Invalid YouTube upload session.');
  await saveSecret(`upload:${job.id}`,{url:location,bytes:m.bytes,file:m.file,mime:m.mimeType});await persist({state:'processing',phase:'youtube_transfer'});
  const response=await transfer(location,token,await readFile(m.file),{'Content-Type':m.mimeType,'Content-Length':String(m.bytes)}),body=await response.json();
  return {state:'processing',remoteId:remoteId(body.id),externalId:body.id,phase:'youtube_processing'};
 }
 throw new Error('This publishing operation is unavailable.');
}
export async function poll(account:SocialAccount,job:PublishJob):Promise<PublishResult> {
 const token=await accessToken(account),id=job.remoteId;
 if(account.provider==='tiktok'&&id) {
  const r=await postJSON(tik+'status/fetch/',token,{publish_id:id}),d=r.data;
  const external=String(d?.publicaly_available_post_id?.[0]||d?.publicly_available_post_id?.[0]||'');
  if(d?.status==='FAILED')return {state:'failed',error:'TikTok rejected this publication. Check consent, media and creator settings.'};
  if(d?.status==='PUBLISH_COMPLETE'&&external)return {state:'published',externalId:external};
  return {state:d?.status==='SEND_TO_USER_INBOX'?'awaiting_user':'processing',error:d?.status==='PUBLISH_COMPLETE'&&!external?'TikTok completed processing; a post ID is not available yet.':undefined};
 }
 if(account.provider==='instagram'&&id) {
  if(job.externalId) {const m=await graphRead(job.externalId,token,{fields:'id,permalink,timestamp'});if(m.id===job.externalId&&m.permalink)return {state:'published',externalId:m.id,url:m.permalink};return {state:'processing'};}
  const c=await graphRead(id,token,{fields:'status_code'});
  if(['ERROR','EXPIRED'].includes(c.status_code))return {state:'failed',error:'Instagram media processing failed or expired.'};
  // A lost media_publish response must never cause a second submission.
  if(job.phase==='instagram_publishing'||c.status_code==='PUBLISHED')return {state:'unknown',error:'Verify the published media ID on Instagram before any new submission.'};
  return {state:'processing',phase:c.status_code==='FINISHED'?'instagram_ready':'instagram_container'};
 }
 if(account.provider==='facebook'&&id) {
  if(job.phase==='facebook_video') {
   const v=await graphRead(id,token,{fields:'id,status,permalink_url'});
   if(v.status?.video_status==='ready')return {state:'published',externalId:id,url:v.permalink_url||''};
   if(v.status?.video_status==='error')return {state:'failed',error:'Facebook video processing failed.'};return {state:'processing'};
  }
  const p=await graphRead(id,token,{fields:'id,is_published,permalink_url'});return p.is_published===true?{state:'published',externalId:p.id,url:p.permalink_url||''}:{state:'processing'};
 }
 if(account.provider==='snapchat'&&id&&job.phase==='snapchat_spotlight') {
  const r=await request(`https://businessapi.snapchat.com/v1/public_profiles/${encodeURIComponent(account.externalId)}/spotlights/${encodeURIComponent(id)}`,{headers:headers(token)},true);
  const spotlight=r.spotlights?.find((x:any)=>x.spotlight?.id===id)?.spotlight;
  if(spotlight?.status==='LIVE')return {state:'published',externalId:id};
  if(['REJECTED','FAILED'].includes(spotlight?.status))return {state:'failed',error:'Snapchat did not approve the Spotlight.'};return {state:'processing'};
 }
 if(account.provider==='youtube') {
  let external=job.externalId||id;
  if(!external) {
   const session=await loadSecret<{url:string;bytes:number;file:string;mime:string}>(`upload:${job.id}`);if(!session)return {state:'unknown',error:'Upload session unavailable. Verify channel uploads before retrying.'};
   const r=await fetch(session.url,{method:'PUT',headers:{...headers(token),'Content-Length':'0','Content-Range':`bytes */${session.bytes}`},redirect:'error',signal:AbortSignal.timeout(30_000)});
   if(r.status===308) {
    const offset=Number(/bytes=0-(\d+)/.exec(r.headers.get('range')||'')?.[1]||'-1')+1;
    if(offset<0||offset>=session.bytes)return {state:'unknown',error:'Invalid resumable upload offset.'};
    const bytes=await readFile(session.file);const transferred=await transfer(session.url,token,bytes.subarray(offset),{'Content-Type':session.mime,'Content-Length':String(bytes.length-offset),'Content-Range':`bytes ${offset}-${bytes.length-1}/${bytes.length}`});const b=await transferred.json();
    return {state:'processing',externalId:remoteId(b.id),remoteId:b.id,phase:'youtube_processing'};
   }
   if(!r.ok)return {state:'unknown',error:'Upload session expired or unavailable. Verify channel uploads before retrying.'};
   const body=await r.json();external=body.id;
  }
  if(!external)return {state:'unknown'};
  const r=await request(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({part:'id,status,processingDetails',id:external})}`,{headers:headers(token)},true),v=r.items?.[0];
  if(v?.status?.uploadStatus==='processed'&&v?.processingDetails?.processingStatus==='succeeded')return {state:'published',externalId:external,url:`https://www.youtube.com/watch?v=${external}`};
  if(['failed','rejected','deleted'].includes(v?.status?.uploadStatus))return {state:'failed',error:'YouTube rejected or failed to process the upload.'};return {state:'processing',externalId:external,remoteId:external};
 }
 return {state:'unknown',error:'The outcome needs manual verification before any retry.'};
}
export async function publishInstagramContainer(account:SocialAccount,job:PublishJob) {
 const r=await graphPost(`${account.externalId}/media_publish`,await accessToken(account),{creation_id:job.remoteId});return remoteId(r.id);
}

/** The publisher explicitly chooses evidence; verify that exact external ID on the selected account. */
export async function verifyEvidence(account:SocialAccount,externalId:string,job:PublishJob):Promise<PublishResult> {
 const token=await accessToken(account),id=encodeURIComponent(externalId);
 if(account.provider==='instagram') {
  const r=await graphRead(`${account.externalId}/media`,token,{fields:'id,permalink',limit:'100'}),m=r.data?.find((x:any)=>x.id===externalId);
  if(m?.permalink)return {state:'published',externalId,url:m.permalink};
 } else if(account.provider==='facebook') {
  const p=await graphRead(id,token,{fields:'id,from,is_published,permalink_url'});
  if(p.id===externalId&&p.from?.id===account.externalId&&p.is_published===true)return {state:'published',externalId,url:p.permalink_url||''};
 } else if(account.provider==='youtube') {
  const r=await request(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({part:'snippet,status,processingDetails',id:externalId})}`,{headers:headers(token)},true),v=r.items?.find((x:any)=>x.id===externalId&&x.snippet?.channelId===account.externalId);
  if(v?.status?.uploadStatus==='processed'&&v.processingDetails?.processingStatus==='succeeded')return {state:'published',externalId,url:`https://www.youtube.com/watch?v=${externalId}`};
 } else if(account.provider==='tiktok') {
  const r=await postJSON('https://open.tiktokapis.com/v2/video/query/?fields=id,share_url',token,{filters:{video_ids:[externalId]}}),v=r.data?.videos?.find((x:any)=>x.id===externalId);
  if(v)return {state:'published',externalId,url:v.share_url||''};
 } else if(job.phase==='snapchat_story') {
  const r=await request(`https://businessapi.snapchat.com/v1/public_profiles/${encodeURIComponent(account.externalId)}/stories?limit=100`,{headers:headers(token)},true);
  if(r.stories?.some((x:any)=>x.story?.id===externalId))return {state:'published',externalId};
 } else if(account.provider==='snapchat') {
  const r=await poll(account,{...job,remoteId:externalId,phase:'snapchat_spotlight'});if(r.state==='published')return r;
 }
 throw new PublicationValidationError('This exact published ID could not be verified on the selected account.');
}
