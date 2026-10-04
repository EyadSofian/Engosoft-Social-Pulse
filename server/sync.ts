import { syncMeta } from './connectors/meta.js';
import { syncTikTok } from './connectors/tiktok.js';
import { syncSnapchat } from './connectors/snapchat.js';
import { syncGA4 } from './connectors/ga4.js';
import { saveConnectorResult } from './store.js';
import { checkAlerts } from './alerts.js';

let inFlight:Promise<unknown>|null=null;
export function runSync(){
 if(inFlight)return inFlight;
 inFlight=(async()=>{
   const groups=await Promise.all([syncMeta(),syncTikTok().then(x=>[x]),syncSnapchat().then(x=>[x]),syncGA4().then(x=>[x])]);
   const results=groups.flat();
   results.forEach(saveConnectorResult);
   await checkAlerts();
   return results.map(({posts,website,websitePages,...status})=>({...status,postCount:posts.length,days:website?.length||0,pageDays:websitePages?.length||0}));
 })().finally(()=>{inFlight=null;});
 return inFlight;
}
