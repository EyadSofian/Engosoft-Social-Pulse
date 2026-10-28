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
const employee=await auth.createUser({name:'Staff',email:'hybrid-staff@example.test',password:'test-password-123',role:'employee',departmentId:'hr'});
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
