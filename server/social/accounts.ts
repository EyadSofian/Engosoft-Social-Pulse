import { accountId, getAccount, putAccount, saveSecret } from './store.js';
import { headers, request } from './http.js';
import type { Credential, SocialAccount, SocialProvider } from './types.js';
export const graphBase=()=>`https://graph.facebook.com/${process.env.META_API_VERSION||'v24.0'}`;
export const graphRead=(path:string,token:string,params:Record<string,string>={})=>request(`${graphBase()}/${path}?${new URLSearchParams(params)}`,{headers:headers(token)},true);
export async function registerAccount(provider:SocialProvider,id:string,name:string,ownerId:string,credentialSource:string,scopes:string[],metadata:Record<string,unknown>={},reconnect=false) {
 if(!id)throw new Error('Provider did not return an account identity.');
 const existing=await getAccount(accountId(provider,id));
 // A legacy discovery must not downgrade a deliberately reauthorized account.
 if(existing?.credentialSource.startsWith('oauth:')&&!sourceIsOAuth(credentialSource)&&!reconnect)return existing;
 const value:SocialAccount={id:accountId(provider,id),provider,externalId:id,name,ownerId:existing?.ownerId||ownerId,scopes,metadata,credentialSource,status:'connected',verifiedAt:new Date().toISOString(),lastSyncAt:existing?.lastSyncAt||null,error:null};
 await putAccount(value,reconnect);return (await getAccount(value.id))!;
}
export async function discover(provider:SocialProvider,token:Credential,ownerId:string,source:string,reconnect=false):Promise<SocialAccount[]> {
 const result:SocialAccount[]=[];
 if(provider==='facebook'||provider==='instagram') {
  const perms=await graphRead('me/permissions',token.accessToken);
  const scopes=(perms.data||[]).filter((x:any)=>x.status==='granted').map((x:any)=>x.permission);
  const pageFields='id,name,access_token,tasks'+(scopes.includes('instagram_basic')?',instagram_business_account{id,username,name}':'');
  let next=''; let pages:Record<string,any>[]=[];
  for(let i=0;i<10;i++) {
   const r=next?await request(next,{headers:headers(token.accessToken)},true):await graphRead('me/accounts',token.accessToken,{fields:pageFields,limit:'100'});
   pages.push(...r.data||[]);next=r.paging?.next||'';
   if(!next)break;
   if(new URL(next).origin!=='https://graph.facebook.com')throw new Error('Unexpected pagination host.');
  }
  const allowed=(process.env.META_PAGE_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(allowed.length&&!reconnect) {
   for(const id of allowed) if(!pages.some(p=>p.id===id)) { try{ pages.push(await graphRead(id,token.accessToken,{fields:'id,name,instagram_business_account{id,username,name}'})); }catch{/* A configured ID does not prove access. */} }
   pages=pages.filter(p=>allowed.includes(p.id));
  }
  for(const p of pages) {
   let pageSource=source;
   if(p.access_token && source!=='env:meta') {pageSource=`${source}:page:${p.id}`;await saveSecret(pageSource,{...token,accessToken:p.access_token,refreshToken:undefined,expiresAt:token.expiresAt,scopes});}
   result.push(await registerAccount('facebook',p.id,p.name,ownerId,pageSource,scopes,{tasks:p.tasks||[]},reconnect));
   const ig=p.instagram_business_account;
   if(ig?.id)result.push(await registerAccount('instagram',ig.id,ig.username||ig.name||p.name,ownerId,source,scopes,{pageId:p.id,professional:true},reconnect));
  }
 } else if(provider==='tiktok') {
  const r=await request('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',{headers:headers(token.accessToken)},true),u=r.data?.user;
  result.push(await registerAccount(provider,u?.open_id,u?.display_name,ownerId,source,token.scopes,{},reconnect));
 } else if(provider==='youtube') {
  const r=await request('https://www.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails&mine=true',{headers:headers(token.accessToken)},true);
  for(const ch of r.items||[])result.push(await registerAccount(provider,ch.id,ch.snippet.title,ownerId,source,token.scopes,{uploads:ch.contentDetails?.relatedPlaylists?.uploads},reconnect));
 } else {
  const id=process.env.SNAP_PROFILE_ID?.trim();
  const r=await request(`https://businessapi.snapchat.com/v1/public_profiles/${id?encodeURIComponent(id):'my_profile'}`,{headers:headers(token.accessToken)},true);
  const profile=r.public_profile||r.public_profiles?.find((x:any)=>x.public_profile?.id===id)?.public_profile;
  if(!profile)throw new Error('The selected Public Profile could not be verified.');
  result.push(await registerAccount(provider,profile.id,profile.display_name,ownerId,source,token.scopes,{organizationId:profile.organization_id},reconnect));
 }
 if(!result.length)throw new Error('No authorized account was returned.');
 return result;
}
export async function recordSyncAccount(provider:SocialProvider,id:string,name:string,source:string,scopes:string[]) {
 const existing=await getAccount(accountId(provider,id));
 const a=existing||await registerAccount(provider,id,name,'workspace',source,scopes);
 if(a.status==='disconnected')return;
 await putAccount({...a,name,status:'connected',verifiedAt:new Date().toISOString(),lastSyncAt:new Date().toISOString(),error:null});
}

const sourceIsOAuth=(source:string)=>source.startsWith('oauth:');
