import { providerAccessToken, oauthTokenHealth } from '../connectors/tokens.js';
import { loadSecret, saveSecret } from './store.js';
import { ProviderError, request } from './http.js';
import type { Credential, SocialAccount } from './types.js';

export const oauthConfig = (provider:string) => {
 if(provider==='facebook'||provider==='instagram')return {client:process.env.META_APP_ID,secret:process.env.META_APP_SECRET,redirect:provider==='instagram'?process.env.META_INSTAGRAM_REDIRECT_URI:process.env.META_REDIRECT_URI,token:`https://graph.facebook.com/${process.env.META_API_VERSION||'v24.0'}/oauth/access_token`,authorize:`https://www.facebook.com/${process.env.META_API_VERSION||'v24.0'}/dialog/oauth`,clientField:'client_id'};
 if(provider==='tiktok')return {client:process.env.TIKTOK_CLIENT_KEY,secret:process.env.TIKTOK_CLIENT_SECRET,redirect:process.env.TIKTOK_REDIRECT_URI,token:'https://open.tiktokapis.com/v2/oauth/token/',authorize:'https://www.tiktok.com/v2/auth/authorize/',clientField:'client_key'};
 if(provider==='snapchat')return {client:process.env.SNAP_CLIENT_ID,secret:process.env.SNAP_CLIENT_SECRET,redirect:process.env.SNAP_REDIRECT_URI,token:'https://accounts.snapchat.com/login/oauth2/access_token',authorize:'https://accounts.snapchat.com/login/oauth2/authorize',clientField:'client_id'};
 return {client:process.env.YOUTUBE_CLIENT_ID,secret:process.env.YOUTUBE_CLIENT_SECRET,redirect:process.env.YOUTUBE_REDIRECT_URI,token:'https://oauth2.googleapis.com/token',authorize:'https://accounts.google.com/o/oauth2/v2/auth',clientField:'client_id'};
};
const running=new Map<string,Promise<string>>();
export function accessToken(a:SocialAccount):Promise<string> {
 if(a.credentialSource==='legacy:tiktok')return providerAccessToken('tiktok');
 if(a.credentialSource==='legacy:snapchat')return providerAccessToken('snapchat');
 if(a.credentialSource==='env:meta')return Promise.resolve(process.env.META_ACCESS_TOKEN||'');
 const existing=running.get(a.credentialSource);if(existing)return existing;
 const next=resolve(a).finally(()=>running.delete(a.credentialSource));running.set(a.credentialSource,next);return next;
}
async function resolve(a:SocialAccount) {
 const current=await loadSecret(a.credentialSource);
 if(!current)throw new ProviderError(401,'reconnect_required');
 if(!current.expiresAt||current.expiresAt>Date.now()+300_000)return current.accessToken;
 const c=oauthConfig(a.provider);
 // Meta long-lived tokens are renewed through login; never repeatedly try a nonexistent refresh grant.
 if(!current.refreshToken||!c.client||!c.secret)throw new ProviderError(401,'reconnect_required');
 const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:current.refreshToken,[c.clientField]:c.client,client_secret:c.secret});
 const r=await request<Record<string,any>>(c.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 if(!r.access_token)throw new ProviderError(401,'invalid_token_response');
 const value:Credential={accessToken:r.access_token,refreshToken:r.refresh_token||current.refreshToken,expiresAt:Date.now()+Number(r.expires_in||3600)*1000,scopes:r.scope?String(r.scope).split(/[ ,]+/):current.scopes};
 await saveSecret(a.credentialSource,value);return value.accessToken;
}

export async function tokenHealth(a:SocialAccount) {
 if(a.credentialSource==='legacy:tiktok'||a.credentialSource==='legacy:snapchat')return oauthTokenHealth(a.provider as 'tiktok'|'snapchat');
 if(a.credentialSource==='env:meta')return {expiresAt:null,refreshEnabled:false,state:'environment'};
 try{const t=await loadSecret(a.credentialSource);if(!t)return {expiresAt:null,refreshEnabled:false,state:'reconnect_required'};return {expiresAt:t.expiresAt?new Date(t.expiresAt).toISOString():null,refreshEnabled:Boolean(t.refreshToken),state:!t.expiresAt||t.expiresAt>Date.now()?'valid':t.refreshToken?'refresh_due':'reconnect_required'};}catch{return {expiresAt:null,refreshEnabled:false,state:'reconnect_required'};}
}
