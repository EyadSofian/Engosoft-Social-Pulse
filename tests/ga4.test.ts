import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncGA4 } from '../server/connectors/ga4.js';

test('GA4 returns daily site totals and page-level views without inventing publication dates',async()=>{
 const keys=['GA4_PROPERTY_ID','GOOGLE_ANALYTICS_CLIENT_ID','GOOGLE_ANALYTICS_CLIENT_SECRET','GOOGLE_ANALYTICS_REFRESH_TOKEN'] as const;
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const originalFetch=globalThis.fetch;
 Object.assign(process.env,{GA4_PROPERTY_ID:'123',GOOGLE_ANALYTICS_CLIENT_ID:'client',GOOGLE_ANALYTICS_CLIENT_SECRET:'secret',GOOGLE_ANALYTICS_REFRESH_TOKEN:'refresh'});
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url.includes('/token'))return Response.json({access_token:'fake-access-token'});
  const body=JSON.parse(String(init?.body));
  if(body.dimensions.some((d:{name:string})=>d.name==='pagePath'))return Response.json({rowCount:1,rows:[{dimensionValues:[{value:'20261004'},{value:'/blog/new-course'}],metricValues:[{value:'42'},{value:'19'},{value:'610'}]}]});
  return Response.json({rowCount:1,rows:[{dimensionValues:[{value:'20261004'}],metricValues:[{value:'100'},{value:'40'},{value:'27'}]}]});
 };
 try{
  const result=await syncGA4();
  assert.equal(result.status,'connected');
  assert.deepEqual(result.website,[{date:'2026-10-04',views:100,sessions:40,engagedSessions:27}]);
  assert.deepEqual(result.websitePages,[{date:'2026-10-04',path:'/blog/new-course',title:'new-course',views:42,activeUsers:19,engagementSeconds:610}]);
  assert.deepEqual(result.posts,[]);
 }finally{
  globalThis.fetch=originalFetch;
  for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}
 }
});
