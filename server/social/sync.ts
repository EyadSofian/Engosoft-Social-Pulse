import { syncMeta } from '../connectors/meta.js';
import { syncTikTok } from '../connectors/tiktok.js';
import { syncSnapchat } from '../connectors/snapchat.js';
import { syncYouTube } from '../connectors/youtube.js';
import { hasSavedOAuthToken, providerAccessToken } from '../connectors/tokens.js';
import { saveConnectorResult } from '../store.js';
import { accessToken } from './credentials.js';
import { discover, recordSyncAccount } from './accounts.js';
import { listAccounts, putAccount } from './store.js';
import type { ConnectorResult } from '../types.js';
import type { SocialProvider } from './types.js';
export async function syncSocialProviders(only?:SocialProvider) {
 const results:ConnectorResult[]=[];
 if(!only||only==='facebook'||only==='instagram') {
  if(process.env.META_ACCESS_TOKEN)try{await discover('facebook',{accessToken:process.env.META_ACCESS_TOKEN,expiresAt:0,scopes:[]},'workspace','env:meta');}catch{/* Existing connector still reports granular failures. */}
  if(process.env.META_ACCESS_TOKEN||!(await listAccounts('facebook')).length)results.push(...await syncMeta());
  const oauthPages=(await listAccounts('facebook')).filter(a=>a.credentialSource!=='env:meta'&&a.status!=='disconnected');
  for(const a of oauthPages)try{results.push(...await syncMeta({token:await accessToken({...a,credentialSource:a.credentialSource.split(':page:')[0]}),pageIds:[a.externalId]}));}catch{results.push({platform:'facebook',status:'error',message:'Meta authorization required.',posts:[]});}
 }
 for(const p of ['tiktok','snapchat','youtube'] as const) {
  if(only&&only!==p)continue;
  let accounts=(await listAccounts(p)).filter(a=>a.status!=='disconnected');
  if(p==='tiktok'&&(await hasSavedOAuthToken(p)||process.env.TIKTOK_DISPLAY_ACCESS_TOKEN||process.env.TIKTOK_DISPLAY_REFRESH_TOKEN)&&!(await listAccounts(p)).some(a=>a.credentialSource==='legacy:tiktok')) {
   try {await discover(p,{accessToken:await providerAccessToken(p),expiresAt:0,scopes:['user.info.basic','video.list']},'workspace','legacy:tiktok');}catch{/* The existing reader reports a safe connection error. */}
   accounts=(await listAccounts(p)).filter(a=>a.status!=='disconnected');
  }
  if(p==='snapchat'&&process.env.SNAP_PROFILE_ID&&(process.env.SNAP_PROFILE_ACCESS_TOKEN||process.env.SNAP_PROFILE_REFRESH_TOKEN||await hasSavedOAuthToken(p))&&!(await listAccounts(p)).some(a=>a.credentialSource==='legacy:snapchat')) {
   try{await discover(p,{accessToken:await providerAccessToken(p),expiresAt:0,scopes:['snapchat-profile-api']},'workspace','legacy:snapchat');}catch{/* Reader reports failures. */}
   accounts=(await listAccounts(p)).filter(a=>a.status!=='disconnected');
  }
  if(!accounts.length) {
   const all=await listAccounts(p);
   results.push(all.length?{platform:p,status:'needs_setup',message:'Account disconnected. Reconnect to resume synchronization.',posts:[]}:p==='tiktok'?await syncTikTok():p==='snapchat'?await syncSnapchat():{platform:'youtube',status:'needs_setup',message:'Configure YouTube OAuth client and consent from the channel owner.',posts:[]});continue;
  }
  for(const a of accounts) {
   const result=p==='tiktok'?await syncTikTok(a):p==='snapchat'?await syncSnapchat(a):await syncYouTube(a);
   await putAccount({...a,status:result.status==='connected'?'connected':'sync_failed',lastSyncAt:result.status==='connected'?new Date().toISOString():a.lastSyncAt,error:result.status==='connected'?null:result.message});
   results.push(result);
  }
 }
 // Persist pages independently, then aggregate provider status; a failed account cannot erase successful imports.
 for(const r of results)await saveConnectorResult(r);
 const grouped:ConnectorResult[]=[];
 for(const p of ['facebook','instagram','tiktok','snapchat','youtube'] as const) {
  const list=results.filter(r=>r.platform===p);if(!list.length)continue;
  const allAccounts=await listAccounts(p);
  const allDisconnected=allAccounts.length>0&&allAccounts.every(a=>a.status==='disconnected');
  const good=!allDisconnected&&list.some(r=>r.status==='connected');
  const combined:ConnectorResult={platform:p,partial:list.some(r=>r.partial)||good&&list.some(r=>r.status==='error'),status:allDisconnected?'needs_setup':good?'connected':list[0].status,message:allDisconnected?'Account disconnected. Reconnect to resume synchronization.':list.map(r=>r.message).join(' '),posts:list.flatMap(r=>r.posts)};
  await saveConnectorResult({...combined,posts:[]});grouped.push(combined);
  if(p==='facebook'||p==='instagram') for(const a of await listAccounts(p)) {
   if(a.status==='disconnected')continue;
   const succeeded=combined.posts.some(post=>post.accountId===a.externalId);
   if(succeeded)await recordSyncAccount(p,a.externalId,a.name,a.credentialSource,a.scopes);
   else if(combined.status==='error'||combined.message.includes(`${a.name}:`))await putAccount({...a,status:'sync_failed',error:combined.message});
   else if(combined.status==='connected')await putAccount({...a,status:'connected',lastSyncAt:new Date().toISOString(),error:null});
  }
 }
 return grouped;
}
