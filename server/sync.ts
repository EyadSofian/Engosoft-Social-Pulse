import { syncSocialProviders } from './social/sync.js';
import { pollPendingJobs } from './social/publishing.js';
import { syncGA4 } from './connectors/ga4.js';
import { saveConnectorResult } from './store.js';
import { checkAlerts } from './alerts.js';

let inFlight:Promise<unknown>|null=null;
export function runSync(provider?:import('./social/types.js').SocialProvider){
 if(inFlight)return inFlight;
 inFlight=(async()=>{
   const groups=[await syncSocialProviders(provider),...(provider?[]:[[await syncGA4()]])];
   const results=groups.flat();
   for (const result of results) if(result.platform==='website')await saveConnectorResult(result);
   await pollPendingJobs();
   await checkAlerts();
   return results.map(({posts,website,websitePages,checkpoints,...status})=>({...status,postCount:posts.length,days:website?.length||0,pageDays:websitePages?.length||0}));
 })().finally(()=>{inFlight=null;});
 return inFlight;
}
