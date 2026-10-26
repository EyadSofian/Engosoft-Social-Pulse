import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Snapchat maps Story and Spotlight insights including mixed API field casing',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'social-pulse-snap-'));
 const keys=['DATA_FILE','SNAP_PROFILE_ACCESS_TOKEN','SNAP_PROFILE_ID','SNAP_PROFILE_REFRESH_TOKEN','TOKEN_ENCRYPTION_KEY'] as const;
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const originalFetch=globalThis.fetch;
 Object.assign(process.env,{DATA_FILE:join(directory,'data.sqlite'),SNAP_PROFILE_ACCESS_TOKEN:'fixture-token',SNAP_PROFILE_ID:'profile-1',SNAP_PROFILE_REFRESH_TOKEN:'',TOKEN_ENCRYPTION_KEY:''});
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.includes('/spotlights/spot-1/stats'))return Response.json({assets:[{timeseries:[{fields:[
   {field:{fieldName:'SPOTLIGHT_VIEWS'},stats:[{value:'100'}]},
   {field:{field_name:'SPOTLIGHT_UNIQUES'},stats:[{value:'70'}]},
   {field:{fieldName:'SPOTLIGHT_FAVORITES'},stats:[{value:'12'}]},
   {field:{field_name:'SPOTLIGHT_SHARES'},stats:[{value:'4'}]}
  ]}]}]});
  if(url.includes('/stories/story-1/stats')){
   assert.ok(url.includes('created_at='));assert.ok(url.includes('ended_at='));
   return Response.json({assets:[{timeseries:[{fields:[
    {field:{field_name:'STORY_VIEWS'},stats:[{value:'55'}]},
    {field:{fieldName:'STORY_FAVORITES'},stats:[{value:'3'}]},
    {field:{field_name:'SWIPE_UPS'},stats:[{value:'2'}]}
   ]}]}]});
  }
  if(url.includes('/spotlights?'))return Response.json({spotlights:[{spotlight:{id:'spot-1',created_at:'2026-10-04T08:00:00Z',title:'Spotlight'}}]});
  if(url.includes('/stories?'))return Response.json({stories:[{story:{id:'story-1',created_at:'2026-10-04T09:00:00Z',ended_at:'2026-10-05T09:00:00Z',title:'Story'}}]});
  throw new Error('Unexpected Snap endpoint');
 };
 try{
  const { syncSnapchat }=await import('../server/connectors/snapchat.js');
  const { db }=await import('../server/store.js');
  await (await import('../server/db.js')).initDb();
  const result=await syncSnapchat();
  assert.equal(result.status,'connected');
  assert.equal(result.posts.length,2);
  const spotlight=result.posts.find(p=>p.externalId==='spot-1');
  assert.deepEqual({views:spotlight?.metrics.views,reach:spotlight?.metrics.reach,likes:spotlight?.metrics.likes,shares:spotlight?.metrics.shares},{views:100,reach:70,likes:12,shares:4});
  const story=result.posts.find(p=>p.externalId==='story-1');
  assert.equal(story?.metrics.views,55);
  assert.equal(story?.metrics.likes,3);
  assert.equal(story?.metrics.clicks,2);
  await db.close();
 }finally{
  globalThis.fetch=originalFetch;
  for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  rmSync(directory,{recursive:true,force:true});
 }
});
