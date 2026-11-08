import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import type { PublishInput, PublishJob, SocialProvider } from '../server/social/types';
const directory = mkdtempSync(join(tmpdir(), 'reel-covers-'));
Object.assign(process.env, { DATA_FILE: join(directory, 'test.sqlite'), MEDIA_DIR: directory, TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), APP_URL: 'https://app.example.test' });
const ws = await import('../server/workspace');
const auth = await import('../server/auth');
const media = await import('../server/social/media');
const providers = await import('../server/social/publish-providers');
const publishing = await import('../server/social/publishing');
const store = await import('../server/social/store');
const { registerAccount } = await import('../server/social/accounts');
const { registerWorkspaceRoutes } = await import('../server/workspace-routes');
const { imageForChannel, creativeImageUrls } = await import('../src/domain/output-presets');
const { db, initDb } = await import('../server/db');
await initDb();
const admin = await auth.createUser({ name: 'Admin', email: 'cover-admin@example.test', password: 'test-password-123', role: 'admin', departmentId: 'marketing' });
const other = await auth.createUser({ name: 'Other', email: 'cover-other@example.test', password: 'test-password-123', role: 'creator', departmentId: 'hr' });
let acting = admin;
const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = acting; next(); }); registerWorkspaceRoutes(app);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await new Promise<void>((r) => server.close(() => r())); await db.close(); rmSync(directory, { recursive: true, force: true }); });
mkdirSync(join(directory, 'uploads'), { recursive: true });
const image = await sharp({ create: { width: 540, height: 960, channels: 3, background: '#2463eb' } }).png().toBuffer();
const coverUrl = `/api/uploads/${randomUUID()}.png`, customUrl = `/api/uploads/${randomUUID()}.png`;
for (const url of [coverUrl, customUrl]) writeFileSync(join(directory, 'uploads', url.split('/').pop()!), image);
const artwork = () => ({ requestId: 'reel', directionId: 'reel', imageUrl: coverUrl, reelCover: { url: coverUrl, timestampMs: 1200 }, reelCovers: { instagram: { url: customUrl } } });
const post = async () => ws.createContent(admin, { title: 'A Reel with platform covers', channels: ['instagram', 'youtube', 'facebook', 'tiktok'], captions: { instagram: 'caption', youtube: 'caption' }, creative: artwork() });
const call = (path:string, body:unknown, method='PUT') => originalFetch(base + path, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
const fixtureJob = (provider:SocialProvider):PublishJob => ({ id: randomUUID(), contentId: 'test', accountId: 'test', provider, actorId: admin.id, state: 'processing', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const input = { contentId:'test', accountId:'test', kind:'video', media:[], mode:'direct', privacy:'private', categoryId:'27', madeForKids:false, consent:true } satisfies PublishInput;
const videoFile = join(directory, 'video.mp4'); writeFileSync(videoFile, 'video fixture');
const video = { id:randomUUID(), file:videoFile, url:'/video', type:'video' as const, mimeType:'video/mp4', bytes:13, width:1080, height:1920, duration:10 };
const cover = { id:randomUUID(), file:join(directory,'cover.jpg'), url:'/cover', type:'image' as const, mimeType:'image/jpeg', bytes:100, width:540, height:960 };
writeFileSync(cover.file, await sharp(image).jpeg().toBuffer());
async function account(provider:SocialProvider) {
  const a = await registerAccount(provider, `${provider}-cover-test`, provider, admin.id, `${provider}-cover-credential`, ['pages_manage_posts','instagram_content_publish','video.publish','https://www.googleapis.com/auth/youtube.upload']);
  await store.saveSecret(a.credentialSource, { accessToken:'test-token', expiresAt:Date.now()+3600_000, scopes:a.scopes });
  return a;
}

test('creation, reload and editing retain platform covers, reject foreign URLs and respect approval and editing permissions', async () => {
  const created = await call('/api/content', { title:'Reel cover round trip', channels:['instagram','tiktok'], creative:artwork() }, 'POST');
  assert.equal(created.status,201); const item = await created.json();
  assert.deepEqual((await ws.getContent(item.id))?.creative, artwork());
  const body = { cover:{url:customUrl}, covers:{tiktok:{url:coverUrl,timestampMs:2000}} };
  const saved = await call(`/api/content/${item.id}/reel-covers`, body); assert.equal(saved.status,200);
  const current = await ws.getContent(item.id); assert.equal(current?.creative?.imageUrl,customUrl); assert.deepEqual(current?.creative?.reelCovers,body.covers);
  assert.equal((await call(`/api/content/${item.id}/reel-covers`,{...body,cover:{url:'https://example.com/cover.jpg'}})).status,400);
  assert.equal((await call(`/api/content/${item.id}/reel-covers`,{...body,cover:{url:coverUrl,timestampMs:-1}})).status,400);
  acting = other; try { assert.equal((await call(`/api/content/${item.id}/reel-covers`,body)).status,403); } finally { acting=admin; }
  await ws.transition(admin,item.id,'approved',{});
  assert.equal((await call(`/api/content/${item.id}/reel-covers`,body)).status,409);
});

test('dashboard preview and approved media select the platform override before the common cover', async () => {
  const item = await post();
  assert.equal(imageForChannel('instagram',item.creative),customUrl); assert.equal(imageForChannel('youtube',item.creative),coverUrl);
  assert.deepEqual(new Set(creativeImageUrls(item.creative)),new Set([coverUrl,customUrl]));
  const [resolved] = await media.resolveMedia(item,[customUrl]); assert.equal(resolved.type,'image'); assert.equal(resolved.mimeType,'image/jpeg');
  await assert.rejects(media.resolveMedia(item,[`/api/uploads/${randomUUID()}.png`]),/approved/);
});

test('Instagram receives the signed custom cover URL while publishing a Reel container', async () => {
  const a = await account('instagram'); let payload:any;
  globalThis.fetch = async (url,init) => {
    if (String(url).includes('content_publishing_limit')) return Response.json({data:[]});
    payload=JSON.parse(String(init?.body)); return Response.json({id:'container'});
  };
  const result = await providers.submit(a,input,'caption','title',[video],fixtureJob('instagram'),async()=>{},cover);
  assert.equal(result.state,'processing'); assert.equal(payload.media_type,'REELS');
  assert.match(payload.cover_url,new RegExp(`/api/social/media/${cover.id}\\?expires=`));
  assert.match(payload.video_url,new RegExp(`/api/social/media/${video.id}\\?expires=`));
});

test('Facebook saves and applies the thumbnail only when the video is ready', async () => {
  const a = await account('facebook'), job = fixtureJob('facebook'); let ready=false, thumbnails=0;
  globalThis.fetch = async (url,init) => {
    if (String(url).endsWith('/thumbnails')) { thumbnails++; assert.ok(init?.body instanceof FormData); assert.equal((init.body as FormData).get('is_preferred'),'true'); return Response.json({success:true}); }
    if (init?.method==='POST') return Response.json({id:'facebook-video'});
    return Response.json({id:'facebook-video',status:{video_status:ready?'ready':'processing'},permalink_url:'https://facebook.com/reel/1'});
  };
  assert.equal((await providers.submit(a,input,'caption','title',[video],job,async()=>{},cover)).state,'processing'); assert.equal(thumbnails,0);
  ready=true; const pollJob={...job,remoteId:'facebook-video',phase:'facebook_video'};
  assert.equal((await providers.poll(a,pollJob)).state,'published'); assert.equal(thumbnails,1);
  await providers.poll(a,pollJob); assert.equal(thumbnails,1,'reconciliation does not upload the cover again');
});

test('YouTube thumbnails wait for completed processing; refusal keeps the live video and reports the cover failure', async () => {
  const a=await account('youtube'), job=fixtureJob('youtube'); let processed=false, thumbnailCalls=0, fail=false;
  globalThis.fetch = async (url,init) => {
    const u=String(url);
    if(u.includes('/thumbnails/set')) { thumbnailCalls++; assert.equal(init?.headers && (init.headers as Record<string,string>)['Content-Type'],'image/jpeg'); return fail?Response.json({error:{code:403}},{status:403}):Response.json({items:[{}]}); }
    if(u.includes('uploadType=resumable')) return new Response('',{headers:{location:'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=cover-test'}});
    if(init?.method==='PUT') { for await (const _chunk of init.body as any) { /* consume streamed upload */ } return Response.json({id:'youtube-video'}); }
    return Response.json({items:[{status:{uploadStatus:processed?'processed':'uploaded'},processingDetails:{processingStatus:processed?'succeeded':'processing'}}]});
  };
  const submitted=await providers.submit(a,input,'caption','title',[video],job,async()=>{},cover);
  const pollJob={...job,externalId:submitted.externalId,remoteId:submitted.remoteId};
  assert.equal((await providers.poll(a,pollJob)).state,'processing'); assert.equal(thumbnailCalls,0);
  processed=true; assert.equal((await providers.poll(a,pollJob)).state,'published'); assert.equal(thumbnailCalls,1);
  await providers.poll(a,pollJob); assert.equal(thumbnailCalls,1);
  const second=fixtureJob('youtube'); await providers.submit(a,input,'caption','title',[video],second,async()=>{},cover); fail=true;
  const result=await providers.poll(a,{...second,externalId:'youtube-video'}); assert.equal(result.state,'published'); assert.match(result.error??'',/الغلاف/);
});

test('TikTok native direct posting sends the selected frame timestamp in post_info', async () => {
  const a=await account('tiktok'); let sent:any;
  globalThis.fetch=async(url,init)=>{
    if(String(url).includes('creator_info'))return Response.json({data:{privacy_level_options:['SELF_ONLY'],max_video_post_duration_sec:600}});
    if(init?.method==='PUT')return Response.json({});
    sent=JSON.parse(String(init?.body));return Response.json({data:{publish_id:'publish-id',upload_url:'https://open-upload.tiktokapis.com/upload'}});
  };
  await providers.submit(a,{...input,privacy:'SELF_ONLY',videoCoverTimestampMs:2300},'caption','title',[video],fixtureJob('tiktok'),async()=>{},cover);
  assert.equal(sent.post_info.video_cover_timestamp_ms,2300); assert.equal(sent.source_info.video_cover_timestamp_ms,undefined);
});

test('publishing validates a stored cover frame against the server video duration before any remote write', async () => {
  const a=await account('instagram'), item=await post(), asset=randomUUID();
  await db.run('INSERT INTO social_media(id,content_id,path,metadata_json,created_at) VALUES(?,?,?,?,?)',[asset,item.id,video.file,JSON.stringify({...video,url:`/api/social/assets/${asset}`}),new Date().toISOString()]);
  await ws.setReelCovers(admin,item.id,{url:coverUrl,timestampMs:20_000},{});
  let calls=0; globalThis.fetch=async()=>{calls++;return Response.json({});};
  await assert.rejects(publishing.publish(admin,{...input,contentId:item.id,accountId:a.id,media:[{...video,url:`/api/social/assets/${asset}`}]}),/مدة الفيديو/);
  assert.equal(calls,0);
});
