import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

test('TikTok OAuth renewal persists rotated refresh token encrypted',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'social-pulse-oauth-'));
 const originalFetch=globalThis.fetch,originalNow=Date.now;
 const keys=['DATA_FILE','TOKEN_ENCRYPTION_KEY','TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET','TIKTOK_DISPLAY_REFRESH_TOKEN','TIKTOK_DISPLAY_ACCESS_TOKEN','SNAP_CLIENT_ID','SNAP_CLIENT_SECRET','SNAP_PROFILE_REFRESH_TOKEN','SNAP_PROFILE_ACCESS_TOKEN'] as const;
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{DATA_FILE:join(directory,'data.sqlite'),TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('base64'),TIKTOK_CLIENT_KEY:'test-client',TIKTOK_CLIENT_SECRET:'test-secret',TIKTOK_DISPLAY_REFRESH_TOKEN:'seed-refresh',TIKTOK_DISPLAY_ACCESS_TOKEN:'',SNAP_CLIENT_ID:'snap-client',SNAP_CLIENT_SECRET:'snap-secret',SNAP_PROFILE_REFRESH_TOKEN:'snap-refresh',SNAP_PROFILE_ACCESS_TOKEN:''});
 const usedRefresh:string[]=[];
 globalThis.fetch=async(url,init)=>{
  const body=new URLSearchParams(String(init?.body));usedRefresh.push(body.get('refresh_token')||'');
  if(String(url).includes('snapchat'))assert.equal(body.get('client_id'),'snap-client');
  return Response.json({access_token:`access-${usedRefresh.length}`,refresh_token:`rotated-${usedRefresh.length}`,expires_in:3600});
 };
 try{
  const { providerAccessToken }=await import('../server/connectors/tokens.js');
  const { getEncryptedToken, db }=await import('../server/store.js');
  assert.equal(await providerAccessToken('tiktok'),'access-1');
  assert.equal(await providerAccessToken('tiktok'),'access-1');
  assert.deepEqual(usedRefresh,['seed-refresh']);
  const ciphertext=getEncryptedToken('tiktok')||'';
  assert.ok(ciphertext.length>40);
  assert.ok(!ciphertext.includes('rotated-1'));
  const now=originalNow();Date.now=()=>now+3_601_000;
  assert.equal(await providerAccessToken('tiktok'),'access-2');
  assert.deepEqual(usedRefresh,['seed-refresh','rotated-1']);
  assert.equal(await providerAccessToken('snapchat'),'access-3');
  assert.deepEqual(usedRefresh,['seed-refresh','rotated-1','snap-refresh']);
  db.close();
 }finally{
  globalThis.fetch=originalFetch;Date.now=originalNow;
  for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  rmSync(directory,{recursive:true,force:true});
 }
});
