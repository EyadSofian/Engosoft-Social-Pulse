import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
const directory=mkdtempSync(join(tmpdir(),'social-integrations-'));
process.env.DATA_FILE=join(directory,'test.sqlite');
process.env.MEDIA_DIR=directory;
process.env.TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('base64');
process.env.APP_URL='http://127.0.0.1:4100';
Object.assign(process.env,{TIKTOK_CLIENT_KEY:'client',TIKTOK_CLIENT_SECRET:'secret',TIKTOK_REDIRECT_URI:'http://127.0.0.1:4100/api/oauth/tiktok/callback',YOUTUBE_CLIENT_ID:'yt-client',YOUTUBE_CLIENT_SECRET:'yt-secret',YOUTUBE_REDIRECT_URI:'http://127.0.0.1:4100/api/oauth/youtube/callback'});
const auth=await import('../server/auth');
const ws=await import('../server/workspace');
const store=await import('../server/social/store');
const accounts=await import('../server/social/accounts');
const { capabilities }=await import('../server/social/capabilities');
const { accessToken }=await import('../server/social/credentials');
const oauth=await import('../server/social/oauth');
const http=await import('../server/social/http');
const publishing=await import('../server/social/publishing');
const providers=await import('../server/social/publish-providers');
const media=await import('../server/social/media');
const youtube=await import('../server/connectors/youtube');
const legacy=await import('../server/store');
const { registerSocialRoutes }=await import('../server/social/routes');
const { db,initDb,toPgDdl }=await import('../server/db');
await initDb();
const admin=await auth.createUser({name:'Admin',email:'admin@example.test',password:'test-password-123',role:'admin',departmentId:'marketing'});
const employee=await auth.createUser({name:'Staff',email:'staff@example.test',password:'test-password-123',role:'employee',departmentId:'hr'});
const originalFetch=globalThis.fetch;
const google='https://www.googleapis.com/auth/';
const credential={accessToken:'access-secret',refreshToken:'refresh-secret',expiresAt:Date.now()+3600_000,scopes:[google+'youtube.readonly',google+'yt-analytics.readonly',google+'youtube.upload']};
const account=await accounts.registerAccount('youtube','channel-1','Channel',admin.id,'fixture-yt',credential.scopes);
await store.saveSecret('fixture-yt',credential);
const app=express();app.use(express.json());let acting=admin;app.use((req,_res,next)=>{req.user=acting;next();});registerSocialRoutes(app);
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}`;
const local=(path:string,init?:RequestInit)=>originalFetch(base+path,{redirect:'manual',...init});
after(async()=>{globalThis.fetch=originalFetch;await new Promise<void>(r=>server.close(()=>r()));await db.close();rmSync(directory,{recursive:true,force:true});});
const mock=(fn:(url:string,init?:RequestInit)=>Promise<Response>|Response)=>{globalThis.fetch=async(url,init)=>fn(String(url),init);};
const fixtureJob=(patch:Partial<import('../server/social/types').PublishJob>={}):import('../server/social/types').PublishJob=>({id:'job',contentId:'content',accountId:account.id,provider:'youtube',actorId:admin.id,state:'processing',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...patch});

test('additive schema retains old tokens, plans and posts on repeated initialization',async()=>{
 await legacy.saveEncryptedToken('tiktok','existing-encrypted-token');
 const p=await legacy.savePlan((await import('../server/domain')).newPlan({title:'Existing plan'}));
 await initDb();assert.equal(await legacy.getEncryptedToken('tiktok'),'existing-encrypted-token');assert.equal((await legacy.getPlan(p.id))?.title,'Existing plan');
 assert.match(toPgDdl('CREATE TABLE t (expires_at INTEGER);'),/BIGINT/);
});
test('credentials use authenticated encryption bound to account identity',async()=>{
 const r=await db.get<{encrypted_json:string}>('SELECT encrypted_json FROM social_credentials WHERE id=?',['fixture-yt']);
 assert.ok(!r!.encrypted_json.includes('secret'));assert.equal((await store.loadSecret('fixture-yt'))?.refreshToken,'refresh-secret');
 assert.throws(()=>store.unseal('wrong-account',r!.encrypted_json));
 const corrupt=Buffer.from(r!.encrypted_json,'base64');corrupt[30]^=1;assert.throws(()=>store.unseal('fixture-yt',corrupt.toString('base64')));
});
test('account registration preserves other accounts and ownership',async()=>{
 await accounts.registerAccount('youtube','channel-2','Second',employee.id,'other',credential.scopes);
 await accounts.registerAccount('youtube','channel-1','Renamed',employee.id,'fixture-yt',credential.scopes);
 assert.equal((await store.getAccount(account.id))?.ownerId,admin.id);assert.equal((await store.listAccounts('youtube')).length,2);
});
test('disconnect survives rediscovery and cannot enable publishing',async()=>{
 await store.disconnect(account.id);await accounts.registerAccount('youtube','channel-1','Channel',admin.id,'fixture-yt',credential.scopes);
 assert.equal((await store.getAccount(account.id))?.status,'disconnected');assert.equal(capabilities('youtube',(await store.getAccount(account.id))!).publish_video,'authorization_required');
 await store.putAccount({...account,status:'connected'},true);
});
test('Display API scopes never imply TikTok publishing consent',()=>{
 const a={...account,provider:'tiktok' as const,scopes:['user.info.basic','video.list']};
 assert.equal(capabilities('tiktok',a).read_posts,'available');assert.equal(capabilities('tiktok',a).publish_video,'authorization_required');
 assert.equal(capabilities('youtube').publish_video,'unconfigured');assert.equal(capabilities('youtube',account).publish_image,'unsupported');
});
test('TikTok audit is separate from scope authorization',()=>{
 const a={...account,provider:'tiktok' as const,scopes:['video.publish']};delete process.env.TIKTOK_DIRECT_POST_APPROVED;delete process.env.TIKTOK_SANDBOX_POSTING;
 assert.equal(capabilities('tiktok',a).publish_video,'approval_required');
});
test('refresh is single-flight and persists rotated YouTube refresh tokens',async()=>{
 const a=await accounts.registerAccount('youtube','rotation','Rotation',admin.id,'rotate',credential.scopes);
 await store.saveSecret('rotate',{...credential,expiresAt:0.1});let calls=0;
 mock((_u,init)=>{calls++;assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'),'refresh-secret');return Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600});});
 assert.deepEqual(await Promise.all([accessToken(a),accessToken(a)]),['new-access','new-access']);assert.equal(calls,1);assert.equal((await store.loadSecret('rotate'))?.refreshToken,'new-refresh');
});
test('invalid refresh grants fail once without disclosing provider descriptions',async()=>{
 const a={...account,credentialSource:'bad-refresh'};await store.saveSecret(a.credentialSource,{...credential,expiresAt:1});let calls=0;
 mock(()=>{calls++;return Response.json({error:'invalid_grant',error_description:'sensitive-code'},{status:400});});
 await assert.rejects(()=>accessToken(a),e=>e instanceof Error&&!e.message.includes('sensitive'));assert.equal(calls,1);
});
test('OAuth start requests only read scopes and binds opaque state to provider and user',async()=>{
 const r=await local('/api/oauth/tiktok/start');assert.equal(r.status,302);const u=new URL(r.headers.get('location')!);assert.equal(u.searchParams.get('scope'),'user.info.basic,video.list');assert.equal(u.searchParams.get('redirect_uri'),process.env.TIKTOK_REDIRECT_URI);
 const state=u.searchParams.get('state')!;assert.ok(state.length>=40);const row=await db.get('SELECT * FROM social_oauth_states WHERE hash=?',[createHash('sha256').update(state).digest('hex')]);assert.equal(row?.owner_id,admin.id);
 assert.equal(await oauth.consumeState(state,'youtube'),undefined);assert.ok(await oauth.consumeState(state,'tiktok'));assert.equal(await oauth.consumeState(state,'tiktok'),undefined);
});
test('OAuth publishing and draft consent are separate from reading',async()=>{
 const direct=new URL((await local('/api/oauth/tiktok/start?mode=publishing')).headers.get('location')!);assert.match(direct.searchParams.get('scope')!,/video.publish/);assert.ok(!direct.searchParams.get('scope')!.includes('video.upload'));
 const draft=new URL((await local('/api/oauth/tiktok/start?mode=draft')).headers.get('location')!);assert.match(draft.searchParams.get('scope')!,/video.upload/);
});
test('OAuth callback rejects missing, mismatched, expired and replayed state',async()=>{
 assert.equal((await local('/api/oauth/tiktok/callback?code=secret')).status,400);
 const start=await local('/api/oauth/tiktok/start'),u=new URL(start.headers.get('location')!),state=u.searchParams.get('state')!,cookie=start.headers.get('set-cookie')!.split(';')[0];
 assert.equal((await local(`/api/oauth/tiktok/callback?state=other&code=secret`,{headers:{cookie}})).status,400);
 await db.run('UPDATE social_oauth_states SET expires_at=0 WHERE hash=?',[createHash('sha256').update(state).digest('hex')]);
 assert.equal((await local(`/api/oauth/tiktok/callback?state=${state}&code=secret`,{headers:{cookie}})).status,400);
});
test('Meta business publishing configuration is isolated from read consent and other providers',async()=>{
 const names=['META_APP_ID','META_APP_SECRET','META_REDIRECT_URI','META_INSTAGRAM_REDIRECT_URI','META_PUBLISH_LOGIN_CONFIG_ID','META_READ_LOGIN_CONFIG_ID'];
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 Object.assign(process.env,{META_APP_ID:'meta-client',META_APP_SECRET:'meta-secret',META_REDIRECT_URI:'http://127.0.0.1:4100/api/oauth/facebook/callback',META_INSTAGRAM_REDIRECT_URI:'http://127.0.0.1:4100/api/oauth/instagram/callback',META_PUBLISH_LOGIN_CONFIG_ID:'123456'});
 delete process.env.META_READ_LOGIN_CONFIG_ID;
 try {
  for(const provider of ['facebook','instagram']) {
   const publish=new URL((await local(`/api/oauth/${provider}/start?mode=publishing`)).headers.get('location')!);
   assert.equal(publish.searchParams.get('config_id'),'123456');assert.equal(publish.searchParams.has('scope'),false);assert.equal(publish.searchParams.get('response_type'),'code');assert.ok(publish.searchParams.get('state'));
   const read=new URL((await local(`/api/oauth/${provider}/start`)).headers.get('location')!);
   assert.equal(read.searchParams.has('config_id'),false);assert.ok(!/pages_manage_posts|instagram_content_publish|publish_video/.test(read.searchParams.get('scope')!));
  }
  process.env.META_READ_LOGIN_CONFIG_ID='654321';
  const read=new URL((await local('/api/oauth/facebook/start')).headers.get('location')!);assert.equal(read.searchParams.get('config_id'),'654321');assert.equal(read.searchParams.has('scope'),false);
  const tiktok=new URL((await local('/api/oauth/tiktok/start?mode=publishing')).headers.get('location')!);assert.equal(tiktok.searchParams.has('config_id'),false);assert.match(tiktok.searchParams.get('scope')!,/video.publish/);
  process.env.META_PUBLISH_LOGIN_CONFIG_ID='invalid';assert.equal((await local('/api/oauth/facebook/start?mode=publishing')).status,503);
 } finally {for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});
test('OAuth code exchange saves separate encrypted account credentials',async()=>{
 const start=await local('/api/oauth/tiktok/start'),state=new URL(start.headers.get('location')!).searchParams.get('state')!,cookie=start.headers.get('set-cookie')!.split(';')[0];
 mock((url,init)=>url.includes('/oauth/token/')?Response.json({access_token:'new-token',refresh_token:'new-refresh',scope:'user.info.basic,video.list',expires_in:86400}):Response.json({data:{user:{open_id:'new-user',display_name:'Authorized'}},error:{code:'ok'}}));
 const r=await local(`/api/oauth/tiktok/callback?state=${state}&code=secret`,{headers:{cookie}});assert.equal(r.status,302);assert.match(r.headers.get('location')!,/connected/);
 const a=await store.getAccount('tiktok:new-user');assert.equal(a?.name,'Authorized');assert.equal((await store.loadSecret(a!.credentialSource))?.accessToken,'new-token');assert.equal(await legacy.getEncryptedToken('tiktok'),'existing-encrypted-token');
 assert.equal((await local(`/api/oauth/tiktok/callback?state=${state}&code=secret`,{headers:{cookie}})).status,400);
});
test('OAuth callback rechecks manager permissions after initiation',async()=>{
 const start=await local('/api/oauth/tiktok/start'),state=new URL(start.headers.get('location')!).searchParams.get('state')!,cookie=start.headers.get('set-cookie')!.split(';')[0];
 await auth.updateUser(admin.id,{status:'suspended'});const r=await local(`/api/oauth/tiktok/callback?state=${state}&code=x`,{headers:{cookie}});assert.equal(r.status,403);await auth.updateUser(admin.id,{status:'active'});
});
test('callback configuration rejects alternate origins and paths',()=>{
 const saved=process.env.TIKTOK_REDIRECT_URI;process.env.TIKTOK_REDIRECT_URI='https://evil.test/api/oauth/tiktok/callback';assert.throws(()=>oauth.configuredCallback('tiktok'));process.env.TIKTOK_REDIRECT_URI=saved;
});
test('connections response never contains credentials or encrypted token envelopes',async()=>{
 const r=await local('/api/social/connections'),text=await r.text();assert.equal(r.status,200);for(const value of ['access-secret','refresh-secret','encrypted_json','credentialSource','client_secret'])assert.ok(!text.includes(value),value);
});
test('read retry handles rate limits and never retries permission failures or writes',async()=>{
 let calls=0;mock(()=>++calls===1?Response.json({error:{code:'rate_limit_exceeded'}},{status:429}):Response.json({ok:true}));await http.request('https://provider.test',{},true);assert.equal(calls,2);
 calls=0;mock(()=>{calls++;return Response.json({error:{code:'permission_denied'}},{status:403});});await assert.rejects(()=>http.request('https://provider.test',{},true));assert.equal(calls,1);
 calls=0;mock(()=>{calls++;return Response.json({},{status:503});});await assert.rejects(()=>http.request('https://provider.test',{method:'POST'}));assert.equal(calls,1);
});
test('YouTube reads upload playlist pages, normalizes missing metrics and persists history checkpoint',async()=>{
 let pages=0;
 mock(url=>{
  if(url.includes('/channels?'))return Response.json({items:[{id:'channel-1',snippet:{title:'Channel'},contentDetails:{relatedPlaylists:{uploads:'uploads'}}}]});
  if(url.includes('/playlistItems?')){pages++;return Response.json({items:[{contentDetails:{videoId:'v1'}}],...(pages===1?{nextPageToken:'next'}:{})});}
  return Response.json({items:[{id:'v1',snippet:{title:'Video',publishedAt:'2026-10-01T00:00:00Z'},statistics:{viewCount:'0'},status:{uploadStatus:'processed'}}]});
 });
 const r=await youtube.syncYouTube(account);assert.equal(r.status,'connected');assert.equal(pages,2);assert.equal(r.posts[0].metrics.views,0);assert.equal(r.posts[0].metrics.likes,null);await legacy.saveConnectorResult(r);await legacy.saveConnectorResult(r);assert.equal((await legacy.getObserved()).filter(p=>p.externalId==='v1').length,1);assert.equal(await store.checkpoint(account.id,'youtube_history'),'complete');
});
test('YouTube Analytics uses the selected authorized channel and read-only endpoint',async()=>{
 mock(url=>{assert.match(url,/youtubeanalytics.googleapis.com\/v2\/reports/);assert.equal(new URL(url).searchParams.get('ids'),'channel==channel-1');return Response.json({rows:[['2026-10-01',10]]});});assert.deepEqual((await youtube.youtubeAnalytics(account,'2026-10-01','2026-10-02')).rows,[['2026-10-01',10]]);
});
test('media rejects unapproved arbitrary URLs and platform-specific invalid formats',async()=>{
 const item=await ws.createContent(admin,{title:'Draft',channels:['youtube'],captions:{},creative:null});await assert.rejects(()=>media.resolveMedia(item,['https://127.0.0.1/private']),/approved/);
 assert.throws(()=>media.inspectMP4(Buffer.from('not-video')));
 const input={contentId:item.id,accountId:account.id,kind:'image',media:[],mode:'direct',consent:true} as const;
 assert.throws(()=>media.validateMedia('instagram',input as any,[{url:'x',type:'image',mimeType:'image/png',bytes:10,width:1080,height:1080}],''),/JPEG/);
 assert.throws(()=>media.validateMedia('instagram',input as any,[{url:'x',type:'image',mimeType:'image/jpeg',bytes:10,width:100,height:100}],''),/width/);
});
test('signed provider media access expires and cannot authorize a different media item',()=>{
 process.env.APP_URL='https://app.test';const u=new URL(media.publicMediaUrl('asset'));assert.equal(media.validMediaSignature('asset',u.searchParams.get('expires')!,u.searchParams.get('signature')!),true);assert.equal(media.validMediaSignature('other',u.searchParams.get('expires')!,u.searchParams.get('signature')!),false);assert.equal(media.validMediaSignature('asset','1','bad'),false);process.env.APP_URL='http://127.0.0.1:4100';
});
test('publishing refuses drafts and unauthorized users before any provider write',async()=>{
 const item=await ws.createContent(admin,{title:'Draft',channels:['youtube'],captions:{},creative:null});let calls=0;mock(()=>{calls++;return Response.json({});});
 const input={contentId:item.id,accountId:account.id,kind:'video',media:[],mode:'direct',consent:true} as any;
 await assert.rejects(()=>publishing.publish(admin,input),/approve/);await assert.rejects(()=>publishing.publish(employee,input),/permission/);assert.equal(calls,0);
});
test('Facebook duplicate submissions make a single write and require read-after-write evidence',async()=>{
 const a=await accounts.registerAccount('facebook','page','Page',admin.id,'fb-token',['pages_manage_posts']);await store.saveSecret('fb-token',{...credential,scopes:['pages_manage_posts']});
 const item=await ws.createContent(admin,{title:'Approved',channels:['facebook'],captions:{facebook:'approved copy'},creative:{requestId:'x',directionId:'x',imageUrl:'/api/creatives/x/x.png'}});
 await ws.transition(admin,item.id,'ready_for_review',{});await ws.transition(admin,item.id,'approved',{});
 let writes=0;mock((_url,init)=>{if(init?.method==='POST'){writes++;return Response.json({id:'page_post'});}return Response.json({id:'page_post',is_published:true,permalink_url:'https://facebook.com/page_post'});});
 const input={contentId:item.id,accountId:a.id,kind:'text',media:[],mode:'direct',consent:true} as any;
 const result=await publishing.publish(admin,input);assert.equal(result.state,'published');assert.equal(result.externalId,'page_post');const again=await publishing.publish(admin,input);assert.equal(again.id,result.id);assert.equal(writes,1);assert.equal((await ws.getContent(item.id))?.status,'published');
});
test('ambiguous Facebook write is retained and never uploaded again',async()=>{
 const a=(await store.getAccount('facebook:page'))!;
 const item=await ws.createContent(admin,{title:'Approved ambiguous',channels:['facebook'],captions:{facebook:'copy'},creative:{requestId:'x',directionId:'x',imageUrl:'x'}});await ws.transition(admin,item.id,'ready_for_review',{});await ws.transition(admin,item.id,'approved',{});
 let writes=0;mock(()=>{writes++;throw new TypeError('socket closed with secret-token');});const input={contentId:item.id,accountId:a.id,kind:'text',media:[],mode:'direct',consent:true} as any;
 const r=await publishing.publish(admin,input);assert.equal(r.state,'unknown');assert.ok(!r.error?.includes('secret-token'));await publishing.publish(admin,input);assert.equal(writes,1);assert.equal((await ws.getContent(item.id))?.status,'approved');
});
test('TikTok inbox delivery and accepted uploads are not publication evidence',async()=>{
 const a={...account,provider:'tiktok' as const};mock(()=>Response.json({data:{status:'SEND_TO_USER_INBOX'},error:{code:'ok'}}));assert.equal((await providers.poll(a,fixtureJob({provider:'tiktok',remoteId:'publish-id'}))).state,'awaiting_user');
 mock(()=>Response.json({data:{status:'PUBLISH_COMPLETE'},error:{code:'ok'}}));assert.equal((await providers.poll(a,fixtureJob({provider:'tiktok',remoteId:'publish-id'}))).state,'processing');
 mock(()=>Response.json({data:{status:'PUBLISH_COMPLETE',publicaly_available_post_id:['post-id']},error:{code:'ok'}}));assert.equal((await providers.poll(a,fixtureJob({provider:'tiktok',remoteId:'publish-id'}))).externalId,'post-id');
});
test('Instagram container readiness is distinct from published media',async()=>{
 const a={...account,provider:'instagram' as const};mock(()=>Response.json({status_code:'FINISHED'}));assert.equal((await providers.poll(a,fixtureJob({remoteId:'container'}))).phase,'instagram_ready');
 mock(()=>Response.json({status_code:'PUBLISHED'}));assert.equal((await providers.poll(a,fixtureJob({remoteId:'container',phase:'instagram_publishing'}))).state,'unknown');
 mock(()=>Response.json({id:'media',permalink:'https://instagram.com/p/media'}));assert.equal((await providers.poll(a,fixtureJob({remoteId:'container',externalId:'media'}))).state,'published');
});
test('YouTube waits for successful processing instead of accepting an upload ID',async()=>{
 mock(()=>Response.json({items:[{id:'v',status:{uploadStatus:'uploaded'},processingDetails:{processingStatus:'processing'}}]}));assert.equal((await providers.poll(account,fixtureJob({remoteId:'v'}))).state,'processing');
 mock(()=>Response.json({items:[{id:'v',status:{uploadStatus:'processed'},processingDetails:{processingStatus:'succeeded'}}]}));assert.equal((await providers.poll(account,fixtureJob({remoteId:'v'}))).state,'published');
 mock(()=>Response.json({items:[{id:'v',status:{uploadStatus:'rejected'}}]}));assert.equal((await providers.poll(account,fixtureJob({remoteId:'v'}))).state,'failed');
});
test('Snapchat Spotlight must be LIVE before recording evidence',async()=>{
 const a={...account,provider:'snapchat' as const};mock(()=>Response.json({request_status:'SUCCESS',spotlights:[{spotlight:{id:'spot',status:'PROCESSING'}}]}));assert.equal((await providers.poll(a,fixtureJob({remoteId:'spot',phase:'snapchat_spotlight'}))).state,'processing');
 mock(()=>Response.json({request_status:'SUCCESS',spotlights:[{spotlight:{id:'spot',status:'LIVE'}}]}));assert.equal((await providers.poll(a,fixtureJob({remoteId:'spot',phase:'snapchat_spotlight'}))).state,'published');
});

test('publishing permission is independent from calendar scheduling',async()=>{
 const scheduler={...admin,role:'publisher' as const,permissionOverrides:{'content.publish':false,'content.schedule':true}};
 await assert.rejects(()=>publishing.publish(scheduler,{contentId:'x'} as any),/permission/);
});
test('an unresolved publication blocks withdrawing approval',async()=>{
 const item=(await ws.listContent(admin)).find(i=>i.title==='Approved ambiguous')!;
 await assert.rejects(()=>ws.transition(admin,item.id,'draft',{}),/قيد المعالجة/);
});
test('a cross-origin publishing request is rejected',async()=>{
 const r=await local('/api/social/publish',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://other.test'},body:'{}'});assert.equal(r.status,403);
});
test('YouTube upload stores its resumable session before transferring bytes',async()=>{
 const file=join(directory,'upload.mp4');await (await import('node:fs/promises')).writeFile(file,Buffer.from('fixture-video'));
 const transitions:any[]=[];let transferred=false;
 mock(async(url,init)=>{
  if(url.includes('uploadType=resumable')) {const body=JSON.parse(String(init?.body));assert.equal(body.status.privacyStatus,'private');assert.equal(body.status.selfDeclaredMadeForKids,false);return new Response('',{status:200,headers:{location:'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture'}});}
  const session=await store.loadSecret<{url:string}>('upload:upload-test');assert.ok(session?.url.includes('upload_id=fixture'));transferred=true;return Response.json({id:'uploaded-video'});
 });
 const result=await providers.submit(account,{kind:'video',mode:'direct',privacy:'private',categoryId:'27',madeForKids:false,consent:true} as any,'Approved description','Approved title',[{id:'asset',file,url:'x',type:'video',bytes:13,width:1080,height:1920,mimeType:'video/mp4',duration:10}],fixtureJob({id:'upload-test'}),async r=>{transitions.push(r);});
 assert.equal(transferred,true);assert.equal(result.state,'processing');assert.equal(result.externalId,'uploaded-video');assert.equal(transitions[0].phase,'youtube_transfer');
});
test('TikTok video transfer uses returned upload URL and preserves publishing handle',async()=>{
 const file=join(directory,'tt.mp4');await (await import('node:fs/promises')).writeFile(file,Buffer.alloc(12));const a={...account,provider:'tiktok' as const},transitions:any[]=[];
 mock((url,init)=>{
  if(url.includes('inbox/video/init')) {const b=JSON.parse(String(init?.body));assert.equal(b.source_info.source,'FILE_UPLOAD');return Response.json({data:{publish_id:'tt-publish',upload_url:'https://open-upload.tiktokapis.com/upload/?token=opaque'},error:{code:'ok'}});}
  assert.equal(url,'https://open-upload.tiktokapis.com/upload/?token=opaque');assert.equal((init!.headers as Record<string,string>)['Content-Range'],'bytes 0-11/12');assert.equal((init!.headers as any).Authorization,undefined);return new Response('',{status:201});
 });
 const r=await providers.submit(a,{kind:'video',mode:'draft',consent:true} as any,'Caption','Title',[{id:'a',file,url:'x',type:'video',bytes:12,width:1080,height:1920,mimeType:'video/mp4',duration:10}],fixtureJob(),async x=>{transitions.push(x);});assert.equal(r.state,'awaiting_user');assert.equal(transitions[0].remoteId,'tt-publish');
});
test('TikTok validates creator privacy and duration before initializing a post',async()=>{
 const a={...account,provider:'tiktok' as const};let writes=0;
 mock(url=>{if(url.includes('creator_info'))return Response.json({data:{privacy_level_options:['SELF_ONLY'],max_video_post_duration_sec:10},error:{code:'ok'}});writes++;return Response.json({});});
 await assert.rejects(()=>providers.submit(a,{kind:'video',mode:'direct',privacy:'PUBLIC_TO_EVERYONE',consent:true} as any,'Caption','Title',[{id:'a',file:'x',url:'x',type:'video',bytes:12,width:1080,height:1920,mimeType:'video/mp4',duration:10}],fixtureJob(),async()=>{}),/privacy/);assert.equal(writes,0);
});
test('Snapchat media is encrypted before multipart upload; Story acceptance remains unconfirmed',async()=>{
 const file=join(directory,'snap.jpg');const original=Buffer.from('private-media-content');await (await import('node:fs/promises')).writeFile(file,original);const a={...account,provider:'snapchat' as const};let encryptionKey='',iv='',uploaded:Buffer|undefined;
 mock(async(url,init)=>{
  if(url.endsWith('/media')) {const b=JSON.parse(String(init?.body));encryptionKey=b.key;iv=b.iv;return Response.json({request_status:'SUCCESS',media_id:'media',add_path:'/us/media/add',finalize_path:'/us/media/finalize'});}
  if(url.endsWith('/add')) {const blob=(init!.body as FormData).get('file') as Blob;uploaded=Buffer.from(await blob.arrayBuffer());return Response.json({request_status:'SUCCESS'});}
  if(url.endsWith('/finalize'))return Response.json({request_status:'SUCCESS'});
  assert.ok(url.endsWith('/stories'));return Response.json({request_status:'SUCCESS'});
 });
 const r=await providers.submit(a,{kind:'image',mode:'direct',snapTarget:'story',consent:true} as any,'Caption','Title',[{id:'a',file,url:'x',type:'image',bytes:original.length,width:1080,height:1920,mimeType:'image/jpeg'}],fixtureJob(),async()=>{});
 const decipher=(await import('node:crypto')).createDecipheriv('aes-256-cbc',Buffer.from(encryptionKey,'base64'),Buffer.from(iv,'base64'));assert.deepEqual(Buffer.concat([decipher.update(uploaded!),decipher.final()]),original);assert.equal(r.state,'unknown');assert.equal(r.externalId,undefined);
});
test('Instagram carousel creates child containers and never publishes during initialization',async()=>{
 const a={...account,provider:'instagram' as const};let count=0;mock((url,init)=>{
  if(url.includes('content_publishing_limit'))return Response.json({data:[{quota_usage:0,config:{quota_total:100}}]});
  assert.ok(!url.includes('media_publish'));count++;return Response.json({id:'container-'+count});
 });
 const m={id:'a',file:'x',url:'x',type:'image' as const,bytes:100,width:1080,height:1080,mimeType:'image/jpeg'};
 const r=await providers.submit(a,{kind:'carousel',mode:'direct',consent:true} as any,'Caption','Title',[m,{...m,id:'b'}],fixtureJob(),async()=>{});assert.equal(count,3);assert.equal(r.state,'processing');assert.equal(r.remoteId,'container-3');
});

test('legacy discovery cannot downgrade newly authorized publishing scopes',async()=>{
 const a=await accounts.registerAccount('facebook','oauth-page','Authorized Page',admin.id,'oauth:new:page:oauth-page',['pages_read_engagement','pages_manage_posts'],{},true);
 await accounts.registerAccount('facebook','oauth-page','Legacy Page',admin.id,'env:meta',['pages_read_engagement']);
 const saved=(await store.getAccount(a.id))!;assert.equal(saved.credentialSource,'oauth:new:page:oauth-page');assert.ok(saved.scopes.includes('pages_manage_posts'));
 await accounts.recordSyncAccount('facebook','oauth-page','Authorized Page','env:meta',['pages_read_engagement']);assert.equal((await store.getAccount(a.id))?.credentialSource,'oauth:new:page:oauth-page');
});
test('explicit retries preserve failed attempts and uncertain requests cannot retry',async()=>{
 const a=(await store.getAccount('facebook:page'))!;
 const item=await ws.createContent(admin,{title:'Retry rejected',channels:['facebook'],captions:{facebook:'copy'},creative:{requestId:'x',directionId:'x',imageUrl:'x'}});await ws.transition(admin,item.id,'ready_for_review',{});await ws.transition(admin,item.id,'approved',{});
 let writes=0;mock((_url,init)=>{if(init?.method==='POST'){writes++;return writes===1?Response.json({error:{code:10}},{status:403}):Response.json({id:'retry-post'});}return Response.json({id:'retry-post',is_published:true,permalink_url:'https://facebook.com/retry-post'});});
 const input={contentId:item.id,accountId:a.id,kind:'text',media:[],mode:'direct',consent:true} as any;
 const failed=await publishing.publish(admin,input);assert.equal(failed.state,'failed');await publishing.publish(admin,input);assert.equal(writes,1);const retried=await publishing.publish(admin,{...input,retry:true});assert.equal(retried.state,'published');assert.equal(retried.attempt,2);assert.equal((await publishing.contentJobs(item.id)).length,2);
 const uncertain=(await ws.listContent(admin)).find(i=>i.title==='Approved ambiguous')!;const same=await publishing.publish(admin,{...input,contentId:uncertain.id,retry:true});assert.equal(same.state,'unknown');assert.equal(writes,2);
});

test('manual reconciliation verifies the exact account and ID before accepting evidence',async()=>{
 const item=(await ws.listContent(admin)).find(i=>i.title==='Approved ambiguous')!,job=(await publishing.contentJobs(item.id))[0];
 mock(()=>Response.json({id:'foreign-post',from:{id:'other-page'},is_published:true,permalink_url:'https://facebook.com/foreign-post'}));
 await assert.rejects(()=>publishing.reconcileJob(admin,job.id,'foreign-post'),/verified/);assert.equal((await publishing.getJob(job.id))?.state,'unknown');
 mock(()=>Response.json({id:'real-post',from:{id:'page'},is_published:true,permalink_url:'https://facebook.com/real-post'}));
 const result=await publishing.reconcileJob(admin,job.id,'real-post');assert.equal(result.state,'published');assert.equal(result.externalId,'real-post');
});
test('server MP4 inspection extracts duration and dimensions and rejects malformed boxes',()=>{
 const box=(name:string,payload:Buffer)=>{const b=Buffer.alloc(8+payload.length);b.writeUInt32BE(b.length);b.write(name,4);payload.copy(b,8);return b;};
 const mvhd=Buffer.alloc(40);mvhd.writeUInt32BE(1000,12);mvhd.writeUInt32BE(10_000,16);
 const tkhd=Buffer.alloc(84);tkhd.writeUInt32BE(1080*65536,76);tkhd.writeUInt32BE(1920*65536,80);
 const video=Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',Buffer.concat([box('mvhd',mvhd),box('trak',box('tkhd',tkhd))]))]);
 assert.deepEqual(media.inspectMP4(video),{duration:10,width:1080,height:1920});
 const broken=Buffer.from(video);broken.writeUInt32BE(999999,16);assert.throws(()=>media.inspectMP4(broken));
});

test('TikTok regional upload hosts from the official transfer guide are supported',async()=>{
 const file=join(directory,'regional.mp4');await (await import('node:fs/promises')).writeFile(file,Buffer.alloc(12));const a={...account,provider:'tiktok' as const};let transferred=false;
 mock((url)=>url.includes('inbox/video/init')?Response.json({data:{publish_id:'regional',upload_url:'https://upload.us.tiktokapis.com/video/?upload_id=opaque'},error:{code:'ok'}}):(transferred=true,new Response('',{status:201})));
 await providers.submit(a,{kind:'video',mode:'draft',consent:true} as any,'Caption','Title',[{id:'a',file,url:'x',type:'video',bytes:12,width:1080,height:1920,mimeType:'video/mp4',duration:10}],fixtureJob(),async()=>{});assert.equal(transferred,true);
});
