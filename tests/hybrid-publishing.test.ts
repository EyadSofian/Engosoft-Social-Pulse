import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
const directory=mkdtempSync(join(tmpdir(),'hybrid-publishing-'));
process.env.DATA_FILE=join(directory,'test.sqlite');process.env.MEDIA_DIR=directory;
process.env.TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('base64');process.env.APP_URL='https://social.example.test';
const auth=await import('../server/auth');
const ws=await import('../server/workspace');
const store=await import('../server/social/store');
const {registerAccount}=await import('../server/social/accounts');
const hybrid=await import('../server/social/hybrid');
const publishing=await import('../server/social/publishing');
const {registerSocialRoutes}=await import('../server/social/routes');
const {db,initDb}=await import('../server/db');
import type {PublishInput,PublishJob,PublishResult,SocialAccount} from '../server/social/types';
await initDb();
const admin=await auth.createUser({name:'Admin',email:'hybrid-admin@example.test',password:'test-password-123',role:'admin',departmentId:'marketing'});
const employee=await auth.createUser({name:'Staff',email:'hybrid-staff@example.test',password:'test-password-123',role:'creator',departmentId:'hr'});
const originalFetch=globalThis.fetch;
const app=express();app.use(express.json());let acting=admin;app.use((req,_res,next)=>{req.user=acting;next();});registerSocialRoutes(app);
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
const local=(path:string,init?:RequestInit)=>originalFetch(base+path,init);
after(async()=>{globalThis.fetch=originalFetch;await new Promise<void>(r=>server.close(()=>r()));await db.close();rmSync(directory,{recursive:true,force:true});});
const input:PublishInput={contentId:'content',accountId:'account',kind:'video',media:[],mode:'direct',privacy:'PUBLIC_TO_EVERYONE',consent:true,bufferDefaultsConsent:true,disableComment:true,disableDuet:true,disableStitch:true};
const media=[{id:randomUUID(),file:'/unused.mp4',url:'/unused.mp4',type:'video' as const,mimeType:'video/mp4',bytes:100,width:1080,height:1920,duration:10}];
const job=():PublishJob=>({id:randomUUID(),accountId:'account',contentId:'content',provider:'tiktok',actorId:admin.id,state:'processing',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
const bufferChannel={id:'buffer-target',name:'engosoft_official',service:'tiktok',isDisconnected:false,isLocked:false,allowedActions:['scheduleUpdates']};
const health={accountId:'zernio-target',platform:'tiktok',username:'engosoft_official',tokenStatus:{valid:true},permissions:{canPost:true}};
const zernioPost=(state='published')=>({post:{_id:'zernio-post',status:state,platforms:[{platform:'tiktok',accountId:'zernio-target',status:state,platformPostUrl:state==='published'?'https://www.tiktok.com/@engosoft_official/video/1234567890':undefined}]}});
const bufferPost=(state='sent')=>({id:'buffer-post',channelId:'buffer-target',status:state,schedulingType:'automatic',externalLink:state==='sent'?'https://www.tiktok.com/@engosoft_official/video/1234567890':null});
async function fixture(services:('buffer'|'zernio')[]=['buffer','zernio']) {
 const id=randomUUID(),a=await registerAccount('tiktok',id,'Engosoft',admin.id,'fixture:'+id,['video.publish','video.list']);
 await store.saveSecret(a.credentialSource,{accessToken:'direct-secret',expiresAt:Date.now()+3600_000,scopes:a.scopes});
 for(const service of services) {
  const credential='key:'+a.id+service;await store.saveSecret(credential,{apiKey:service+'-api-secret'});
  await db.run("INSERT INTO social_publishing_routes(account_id,service,target_id,username,credential_id,enabled,verified_at,status,cooldown_until) VALUES(?,?,?,?,?,1,?,'connected',0)",[a.id,service,service+'-target','engosoft_official',credential,new Date().toISOString()]);
 }
 return a;
}
function mock(overrides:(service:'buffer'|'zernio'|'direct',write:boolean,body:any,path:string)=>Response|Promise<Response>|void) {
 globalThis.fetch=async(url,init)=>{
  const path=String(url),body=init?.body?JSON.parse(String(init.body)):undefined;
  const service=path.includes('api.buffer.com')?'buffer':path.includes('zernio.com')?'zernio':'direct';
  const write=service==='buffer'?Boolean(body?.query?.startsWith('mutation')):service==='zernio'&&init?.method==='POST';
  const override=await overrides(service,write,body,path);if(override)return override;
  if(service==='direct')return Response.json({data:{creator_username:'engosoft_official'}});
  if(service==='buffer') {
   if(body.query.includes('organizations'))return Response.json({data:{account:{organizations:[{id:'org'}]}}});
   if(body.query.includes('channels('))return Response.json({data:{channels:[bufferChannel]}});
   if(body.query.includes('channel('))return Response.json({data:{channel:bufferChannel}});
   if(write)return Response.json({data:{createPost:{__typename:'PostActionSuccess',post:bufferPost()}}});
   return Response.json({data:{post:bufferPost()}});
  }
  if(path.endsWith('/health'))return Response.json(health);
  if(path.includes('/accounts?'))return Response.json({accounts:[{_id:'zernio-target',platform:'tiktok',username:'engosoft_official',isActive:true}]});
  return Response.json(zernioPost());
 };
}
const run=(a:SocialAccount,i=input,j=job(),persist=async(_r:PublishResult)=>{})=>hybrid.submitHybrid(a,i,'Approved caption',media,j,persist);

test('Buffer is primary and successful public publication needs account-matching evidence',async()=>{
 const a=await fixture();let buffer=0,zernio=0;mock((s,w)=>{if(w){if(s==='buffer')buffer++;else zernio++;}});
 const result=await run(a);assert.equal(result.state,'published');assert.equal(result.externalId,'1234567890');assert.equal(buffer,1);assert.equal(zernio,0);
});
test('confirmed Buffer quota rejection switches once to Zernio with no payload changes',async()=>{
 const a=await fixture(),j=job();let buffer=0,zernio=0;mock((s,w,body)=>{
  if(w&&s==='buffer'){buffer++;return Response.json({error:'Rate limit'},{status:429,headers:{'Retry-After':'3600'}});}
  if(w&&s==='zernio'){zernio++;assert.equal(body.content,'Approved caption');assert.equal(body.tiktokSettings.privacyLevel,'PUBLIC_TO_EVERYONE');}
 });
 const result=await run(a,input,j);assert.equal(result.state,'published');assert.equal(buffer,1);assert.equal(zernio,1);
 assert.equal((await db.get<any>('SELECT state FROM social_publishing_attempts WHERE job_id=? AND service=?',[j.id,'buffer']))?.state,'rejected');
 assert.equal((await hybrid.pollHybrid({...j,phase:'hybrid:zernio'})).state,'published');
 assert.ok((await hybrid.hybridSummary(a.id))[0].cooldownUntil>Date.now());
});
test('a Buffer transport timeout after submission never triggers backup or a repeated write',async()=>{
 const a=await fixture(),j=job();let writes=0;mock((s,w)=>{if(w){writes++;if(s==='buffer')throw new Error('timeout secret');}});
 assert.equal((await run(a,input,j)).state,'unknown');assert.equal((await run(a,input,j)).state,'unknown');
 assert.equal((await hybrid.pollHybrid(j)).state,'unknown');assert.equal(writes,1);
});
test('a 5xx or invalid JSON after submission keeps the outcome unknown',async()=>{
 for(const response of [Response.json({},{status:503}),new Response('unreadable',{status:200})]) {
  const a=await fixture();let writes=0;mock((_s,w)=>{if(w){writes++;return response;}});
  assert.equal((await run(a)).state,'unknown');assert.equal(writes,1);
 }
});
test('preflight connection failure can safely select the backup before any write',async()=>{
 const a=await fixture();let buffer=0,zernio=0;mock((s,w)=>{
  if(s==='buffer'){if(w)buffer++;throw new Error('offline');}if(w)zernio++;
 });
 assert.equal((await run(a)).state,'published');assert.equal(buffer,0);assert.equal(zernio,1);
});
test('promotional content bypasses Buffer and preserves commercial and AI disclosures',async()=>{
 const a=await fixture();let buffer=0;mock((s,w,body)=>{
  if(s==='buffer')buffer++;
  if(w&&s==='zernio'){assert.equal(body.tiktokSettings.commercialContentType,'brand_organic');assert.equal(body.tiktokSettings.brandPartnerPromote,true);assert.equal(body.tiktokSettings.videoMadeWithAi,true);}
 });
 const result=await run(a,{...input,brandOrganic:true,brandContent:true,isAiGenerated:true});assert.equal(result.state,'published');assert.equal(buffer,0);
});
test('Buffer requires explicit consent to its interaction defaults',async()=>{
 assert.equal(hybrid.bufferEligible({...input,bufferDefaultsConsent:false}),false);
 const a=await fixture(['buffer']);let writes=0;mock((_s,w)=>{if(w)writes++;});
 assert.equal((await run(a,{...input,bufferDefaultsConsent:false})).state,'failed');assert.equal(writes,0);
});
test('a service account identity change stops routing before publication',async()=>{
 const a=await fixture();let writes=0;mock((s,w)=>{if(w)writes++;if(s==='buffer')return Response.json({data:{channel:{...bufferChannel,name:'someone_else'}}});});
 assert.equal((await run(a)).state,'failed');assert.equal(writes,0);
});
test('accepted processing and delayed failure stay on the original service',async()=>{
 const a=await fixture(),j=job();let writes=0;mock((s,w)=>{if(w)writes++;if(s==='buffer')return w?Response.json({data:{createPost:{__typename:'PostActionSuccess',post:bufferPost('sending')}}}):undefined;});
 assert.equal((await run(a,input,j)).state,'processing');
 mock((s,w)=>{if(w)writes++;if(s==='buffer')return Response.json({data:{post:bufferPost('error')}});});
 assert.equal((await hybrid.pollHybrid(j)).state,'unknown');assert.equal(writes,1);
});
test('an upstream quota rejection is retained and never reported as a successful post',async()=>{
 const a=await fixture(['zernio']);let writes=0;mock((_s,w)=>{if(w){writes++;return Response.json({type:'platform_error',platformError:{code:'daily_limit'}},{status:429});}});
 assert.equal((await run(a)).state,'unknown');assert.equal(writes,1);
});
test('connecting services validates the actual creator handle and encrypts keys',async()=>{
 const a=await fixture([]);mock(()=>undefined);await hybrid.connectPublishingService(a,'buffer','new-buffer-api-secret');
 const summary=JSON.stringify(await hybrid.hybridSummary(a.id));assert.ok(!summary.includes('api-secret'));assert.match(summary,/engosoft_official/);
 const row=await db.get<any>('SELECT * FROM social_publishing_routes WHERE account_id=?',[a.id]);
 const secret=await db.get<any>('SELECT encrypted_json FROM social_credentials WHERE id=?',[row.credential_id]);assert.ok(!secret.encrypted_json.includes('new-buffer-api-secret'));
});
test('central job arbitration blocks simultaneous duplicate publication and preserves direct TikTok audit restrictions',async()=>{
 const a=await fixture(),asset=randomUUID();
 const item=await ws.createContent(admin,{title:'Hybrid video',channels:['tiktok'],captions:{tiktok:'Approved caption'},creative:{requestId:'x',directionId:'x',imageUrl:'/api/creatives/x/x.png'}});
 await db.run('INSERT INTO social_media(id,content_id,path,metadata_json,created_at) VALUES(?,?,?,?,?)',[asset,item.id,'/unused.mp4',JSON.stringify({...media[0],url:`/api/social/assets/${asset}`}),new Date().toISOString()]);
 await ws.transition(admin,item.id,'ready_for_review',{});await ws.transition(admin,item.id,'approved',{});
 let writes=0;mock((_s,w)=>{if(w)writes++;});
 const value={...input,contentId:item.id,accountId:a.id,media:[{...media[0],url:`/api/social/assets/${asset}`}]};
 const results=await Promise.all([publishing.publish(admin,value),publishing.publish(admin,value)]);
 assert.equal(results[0].id,results[1].id);assert.equal(writes,1);assert.equal((await publishing.getJob(results[0].id))?.state,'published');
 assert.notEqual(process.env.TIKTOK_DIRECT_POST_APPROVED,'true');
});
test('different service labels require an explicit administrator identity mapping and remain pinned afterwards',async()=>{
 const a=await fixture([]);
 mock((s,_w,_b,path)=>{
  if(s==='zernio'&&path.includes('/accounts?'))return Response.json({accounts:[{_id:'zernio-target',platform:'tiktok',username:'Engosoft',isActive:true}]});
  if(s==='zernio'&&path.endsWith('/health'))return Response.json({...health,username:'Engosoft'});
 });
 await assert.rejects(()=>hybrid.connectPublishingService(a,'zernio','new-zernio-api-secret'),hybrid.IdentityConfirmationRequired);
 assert.equal(await hybrid.hybridConfigured(a.id),false);
 await hybrid.connectPublishingService(a,'zernio','new-zernio-api-secret',{targetId:'zernio-target',confirmed:true});
 assert.equal((await hybrid.checkPublishingService(a.id,'zernio'))[1].status,'connected');
 const route=await db.get<any>('SELECT * FROM social_publishing_routes WHERE account_id=?',[a.id]);assert.equal(route.username,'engosoft_official');assert.equal(route.service_username,'engosoft');
 const secret=await store.loadSecret<any>(route.credential_id);assert.equal(secret.verifiedBy,admin.id);assert.equal(secret.identityConfirmation.targetId,'zernio-target');
});
test('hybrid input validation rejects non-public or too-short videos before a service write',()=>{
 assert.throws(()=>hybrid.validateHybrid({...input,privacy:'SELF_ONLY'},'caption',media),/public/);
 assert.throws(()=>hybrid.validateHybrid(input,'caption',[{...media[0],duration:1}]),/3 seconds/);
});
test('publishing-service settings enforce permissions, explicit consent, CSRF and secret redaction',async()=>{
 const a=await fixture(),path=`/api/social/publishing-services/${encodeURIComponent(a.id)}`;
 acting=employee;assert.equal((await local(path)).status,403);acting=admin;
 const read=await local(path);assert.equal(read.status,200);assert.ok(!(await read.text()).includes('api-secret'));
 assert.equal((await local(path+'/buffer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:'new-buffer-api-secret'})})).status,400);
 assert.equal((await local(path+'/buffer/check',{method:'POST',headers:{Origin:'https://other.test'}})).status,403);
});

const photoMedia=(count=2)=>Array.from({length:count},()=>({id:randomUUID(),file:'/unused.jpg',url:'/api/social/assets/'+randomUUID(),type:'image' as const,mimeType:'image/jpeg',bytes:100,width:1080,height:1920}));
const photoInput:PublishInput={...input,kind:'carousel',photoCoverIndex:1,autoAddMusic:false};
const photoCreator={creator:{nickname:'Engosoft',canPostMore:true},privacyLevels:[{value:'PUBLIC_TO_EVERYONE'}],postingLimits:{interactionSettings:{allow_comment:{enabled:true},allow_duet:null,allow_stitch:null}}};
const photoPost=(draft=false)=>({post:{_id:'photo-post',status:'published',platforms:[{platform:'tiktok',accountId:'zernio-target',status:'published',platformPostUrl:draft?undefined:'https://www.tiktok.com/@engosoft_official/photo/1234567890',platformSpecificData:{isDraft:draft}}]}});
const photoMock=(override:(s:string,w:boolean,b:any,p:string)=>Response|void=()=>undefined)=>mock((s,w,b,p)=>override(s,w,b,p)||(p.includes('/creator-info')?Response.json(photoCreator):undefined));

test('photo carousel uses only Zernio and preserves photo order, cover, full caption and disclosures',async()=>{
 const a=await fixture(),images=photoMedia(35),caption='نص معتمد '.repeat(350);let bufferCalls=0,writes=0;
 photoMock((s,w,b)=>{if(s==='buffer')bufferCalls++;if(w){writes++;assert.equal(b.content,'عنوان معتمد');assert.equal(b.mediaItems.length,35);assert.deepEqual(b.mediaItems.map((m:any)=>new URL(m.url).pathname),images.map(m=>'/api/social/media/'+m.id));assert.ok(b.mediaItems.every((m:any)=>m.type==='image'));assert.equal(b.tiktokSettings.description,caption);assert.equal(b.tiktokSettings.photoCoverIndex,34);assert.equal(b.tiktokSettings.mediaType,'photo');assert.equal(b.tiktokSettings.allowComment,true);assert.equal(b.tiktokSettings.autoAddMusic,false);assert.equal(b.tiktokSettings.isBrandOrganicPost,true);assert.equal(b.tiktokSettings.brandPartnerPromote,true);assert.equal(b.tiktokSettings.contentPreviewConfirmed,true);assert.equal(b.tiktokSettings.expressConsentGiven,true);assert.ok(!('allowDuet' in b.tiktokSettings));assert.ok(!('allowStitch' in b.tiktokSettings));return Response.json(photoPost());}});
 const result=await hybrid.submitHybrid(a,{...photoInput,photoCoverIndex:34,brandOrganic:true,brandContent:true,disableComment:false},caption,images,job(),async()=>{},'عنوان معتمد #وسم');
 assert.equal(result.state,'published');assert.equal(result.url,'https://www.tiktok.com/@engosoft_official/photo/1234567890');assert.equal(result.externalId,'1234567890');assert.equal(bufferCalls,0);assert.equal(writes,1);
});
test('single image is a photo post and auto-music is explicitly opt-in',async()=>{
 const a=await fixture();photoMock((_s,w,b)=>{if(w){assert.equal(b.mediaItems.length,1);assert.equal(b.tiktokSettings.autoAddMusic,true);assert.equal(b.tiktokSettings.photoCoverIndex,0);return Response.json(photoPost());}});
 assert.equal((await hybrid.submitHybrid(a,{...photoInput,kind:'image',photoCoverIndex:0,autoAddMusic:true},'Caption',photoMedia(1),job(),async()=>{})).state,'published');
});
test('AI photo direct posts are rejected before any request; inbox delivery never claims public publication',async()=>{
 const a=await fixture(),images=photoMedia(),j=job();let writes=0;
 photoMock((_s,w,b,p)=>{if(p.endsWith('/posts/photo-post'))return Response.json(photoPost(true));if(w){writes++;assert.equal(b.tiktokSettings.draft,true);assert.ok(!('videoMadeWithAi' in b.tiktokSettings));return Response.json(photoPost(true));}});
 await assert.rejects(()=>hybrid.submitHybrid(a,{...photoInput,isAiGenerated:true},'Caption',images,j,async()=>{}),/AI-generated photos/);assert.equal(writes,0);
 const result=await hybrid.submitHybrid(a,{...photoInput,mode:'draft',isAiGenerated:true},'Caption',images,j,async()=>{});
 assert.equal(result.state,'awaiting_user');assert.equal(result.url,undefined);assert.equal(result.externalId,undefined);
 assert.equal((await hybrid.pollHybrid({...j,phase:'hybrid:zernio'})).state,'awaiting_user');assert.equal(writes,1);
});
test('photo creator settings are checked with mediaType=photo and a changed restriction blocks writes',async()=>{
 const a=await fixture();let writes=0,photoReads=0;
 photoMock((_s,w,_b,path)=>{if(w)writes++;if(path.includes('/creator-info')){assert.equal(new URL(path).searchParams.get('mediaType'),'photo');photoReads++;return Response.json({...photoCreator,privacyLevels:[{value:'SELF_ONLY'}]});}});
 const result=await hybrid.submitHybrid(a,photoInput,'Caption',photoMedia(),job(),async()=>{});
 assert.equal(result.state,'failed');assert.equal(writes,0);assert.equal(photoReads,1);
});
test('photo timeout cannot switch to Buffer, resubmit, or lose its pending service attempt',async()=>{
 const a=await fixture(),j=job();let writes=0,bufferCalls=0;
 photoMock((s,w)=>{if(s==='buffer')bufferCalls++;if(w){writes++;throw new Error('ambiguous photo write');}});
 assert.equal((await hybrid.submitHybrid(a,photoInput,'Caption',photoMedia(),j,async()=>{})).state,'unknown');
 assert.equal((await hybrid.submitHybrid(a,photoInput,'Caption',photoMedia(),j,async()=>{})).state,'unknown');
 assert.equal((await hybrid.pollHybrid(j)).state,'unknown');assert.equal(writes,1);assert.equal(bufferCalls,0);
});
test('photo validation rejects mixed media, invalid count, cover, description and promotional auto-music',()=>{
 const images=photoMedia();
 assert.throws(()=>hybrid.validateHybrid(photoInput,'Caption',images,'#only_hashtag https://example.com'),/photo title/);
 for(const [i,m,c] of [
  [photoInput,[images[0],media[0]],'caption'],[photoInput,photoMedia(36),'caption'],[photoInput,photoMedia(1),'caption'],
  [{...photoInput,kind:'image'},images,'caption'],[{...photoInput,photoCoverIndex:2},images,'caption'],
  [{...photoInput,photoCoverIndex:-1},images,'caption'],[photoInput,images,'x'.repeat(4001)],
  [{...photoInput,brandOrganic:true,autoAddMusic:true},images,'caption'],
 ] as [PublishInput,ReturnType<typeof photoMedia>|typeof media,string][])assert.throws(()=>hybrid.validateHybrid(i,c,m));
});
test('Buffer alone does not unlock photo publishing or expose video creator settings as photo settings',async()=>{
 const a=await fixture(['buffer']);photoMock();
 assert.equal(await hybrid.hybridConfigured(a.id,'image'),false);assert.equal(await hybrid.hybridConfigured(a.id,'carousel'),false);
 await assert.rejects(()=>hybrid.hybridCreator(a,'photo'),/media type/);
 const r=await local('/api/social/connections'),p=(await r.json()).providers.find((p:any)=>p.provider==='tiktok'),account=p.accounts.find((x:any)=>x.id===a.id);
 assert.equal(account.capabilities.publish_video,'available');assert.notEqual(account.capabilities.publish_image,'available');assert.notEqual(account.capabilities.publish_carousel,'available');
});
test('upload, review and publish two photos end-to-end preserves approval and content ownership',async()=>{
 const sharp=(await import('sharp')).default;
 const image=await sharp({create:{width:1080,height:1920,channels:4,background:'#9a271a'}}).png().toBuffer();
 const a=await fixture(),item=await ws.createContent(admin,{title:'Approved photo title',channels:['tiktok'],captions:{tiktok:'الوصف الكامل #انجوسوفت'},creative:null});
 const upload=()=>local(`/api/social/content/${item.id}/image`,{method:'POST',headers:{'Content-Type':'image/png'},body:new Uint8Array(image)});
 acting=employee;assert.equal((await upload()).status,403);acting=admin;
 const first=await upload(),second=await upload();assert.equal(first.status,200);assert.equal(second.status,200);const images=[await first.json(),await second.json()];assert.ok(images.every(m=>m.mimeType==='image/jpeg'&&m.width===1080&&m.height===1920));
 const socialMedia=await import('../server/social/media');
 const other=await ws.createContent(admin,{title:'Other content',channels:['tiktok'],captions:{},creative:null});await assert.rejects(()=>socialMedia.resolveMedia(other,[images[0].url]),/attached to this content/);
 await ws.transition(admin,item.id,'ready_for_review',{});await ws.transition(admin,item.id,'approved',{});
 assert.equal((await upload()).status,409);await assert.rejects(()=>socialMedia.attachImage(item.id,image),/review/);
 let writes=0;photoMock((_s,w,b)=>{if(w){writes++;assert.equal(b.content,'Approved photo title');assert.equal(b.tiktokSettings.description,'الوصف الكامل #انجوسوفت');return Response.json(photoPost());}});
 const body={...photoInput,contentId:item.id,accountId:a.id,media:images.map(m=>({url:m.url})),photoCoverIndex:1};
 const publish=()=>local('/api/social/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const results=await Promise.all([publish(),publish()]);assert.ok(results.every(r=>r.status===200));const jobs=await Promise.all(results.map(r=>r.json()));assert.equal(jobs[0].id,jobs[1].id);assert.equal(jobs[0].state,'published');assert.equal(writes,1);
 const connections=await (await local('/api/social/connections')).json(),connected=connections.providers.find((p:any)=>p.provider==='tiktok').accounts.find((x:any)=>x.id===a.id);assert.equal(connected.capabilities.publish_image,'available');assert.equal(connected.capabilities.publish_carousel,'available');
});
test('image upload rejects disguised SVG and malformed bytes before storing media',async()=>{
 const item=await ws.createContent(admin,{title:'Invalid image',channels:['tiktok'],captions:{},creative:null});
 for(const data of ['<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"></svg>','not an image']){
  const r=await local(`/api/social/content/${item.id}/image`,{method:'POST',headers:{'Content-Type':'image/png'},body:data});assert.equal(r.status,400);
 }
 assert.equal((await db.get<any>('SELECT count(*) AS total FROM social_media WHERE content_id=?',[item.id]))?.total,0);
});
