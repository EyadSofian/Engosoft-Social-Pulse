import { createHash, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import type express from 'express';
import { db } from '../db.js';
import { getUser, readCookie, requirePermission, userCan } from '../auth.js';
import { oauthConfig } from './credentials.js';
import { discover } from './accounts.js';
import { request } from './http.js';
import { saveSecret } from './store.js';
import type { Credential, SocialProvider } from './types.js';
export const socialProviders:SocialProvider[]=['facebook','instagram','tiktok','snapchat','youtube'];
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const equalState=(a:string,b:string)=>Boolean(a&&b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b)));
export function metaTokenExpiry(info:{expires_at?:number;data_access_expires_at?:number}):number {
 const limits=[info.expires_at,info.data_access_expires_at].filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0);
 return limits.length?Math.min(...limits)*1000:0;
}
export function oauthScopes(p:SocialProvider,mode:string):string[] {
 const publishing=mode==='publishing'||mode==='publishing-and-draft';
 if(p==='facebook')return ['pages_show_list','pages_read_engagement','read_insights',...(publishing?['pages_manage_posts','publish_video']:[])];
 if(p==='instagram')return ['pages_show_list','pages_read_engagement','instagram_basic','instagram_manage_insights',...(publishing?['instagram_content_publish']:[])];
 if(p==='tiktok')return ['user.info.basic','video.list',...(publishing?['video.publish']:[]),...(['draft','publishing-and-draft'].includes(mode)?['video.upload']:[])];
 if(p==='snapchat')return ['snapchat-profile-api'];
 return ['https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly',...(publishing?['https://www.googleapis.com/auth/youtube.upload']:[])];
}
export function configuredCallback(provider:SocialProvider) {
 const c=oauthConfig(provider);
 if(!c.client||!c.secret||!c.redirect)throw new Error('OAuth client, secret and exact redirect URI must be configured on the server.');
 const url=new URL(c.redirect), app=new URL(process.env.APP_URL||'http://127.0.0.1:4100');
 if(url.origin!==app.origin||url.pathname!==`/api/oauth/${provider}/callback`||url.search||url.hash||url.username||url.password)throw new Error('OAuth redirect URI must match APP_URL and the provider callback path exactly.');
 if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('HTTPS OAuth callback required.');
 if(Buffer.from(process.env.TOKEN_ENCRYPTION_KEY||'','base64').length!==32)throw new Error('A valid TOKEN_ENCRYPTION_KEY is required.');
 return c;
}
export async function consumeState(state:string,provider:SocialProvider) {
 const r=await db.get<{owner_id:string;mode:string}>('DELETE FROM social_oauth_states WHERE hash=? AND provider=? AND expires_at>=? RETURNING owner_id,mode',[hash(state),provider,Date.now()]);
 return r;
}
export function registerSocialOAuth(app:express.Express) {
 for(const provider of socialProviders) {
  app.get(`/api/oauth/${provider}/start`,requirePermission('connections.manage'),async(req,res)=>{
   try {
    const c=configuredCallback(provider),state=randomBytes(32).toString('base64url');
    const mode=['publishing','draft','publishing-and-draft'].includes(String(req.query.mode))?String(req.query.mode):'read';
    if(['draft','publishing-and-draft'].includes(mode)&&provider!=='tiktok')return res.status(400).json({error:'Draft upload is only available for TikTok.'});
    await db.run('DELETE FROM social_oauth_states WHERE expires_at<?',[Date.now()]);
    await db.run('INSERT INTO social_oauth_states(hash,provider,owner_id,mode,expires_at) VALUES(?,?,?,?,?)',[hash(state),provider,req.user!.id,mode,Date.now()+600_000]);
    res.cookie(`social_${provider}_state`,state,{httpOnly:true,secure:c.redirect!.startsWith('https:'),sameSite:'lax',maxAge:600_000,path:`/api/oauth/${provider}`});
    const u=new URL(c.authorize);u.search=new URLSearchParams({[c.clientField]:c.client!,redirect_uri:c.redirect!,response_type:'code',scope:oauthScopes(provider,mode).join(provider==='youtube'?' ':','),state}).toString();
    if(provider==='facebook'||provider==='instagram') {
     // Business Login configurations define their own permission set. Never use a
     // publishing configuration for a read-only connection.
     const config=mode==='publishing'?process.env.META_PUBLISH_LOGIN_CONFIG_ID:process.env.META_READ_LOGIN_CONFIG_ID;
     if(config) {
      if(!/^\d+$/.test(config))throw new Error('Invalid Meta Login configuration ID.');
      u.searchParams.delete('scope');u.searchParams.set('config_id',config);
     }
    }
    if(provider==='youtube') {u.searchParams.set('access_type','offline');u.searchParams.set('prompt','consent');u.searchParams.set('include_granted_scopes','true');}
    res.setHeader('Cache-Control','no-store');res.redirect(u.toString());
   }catch {res.status(503).json({error:'Configure OAuth client, secret, exact callback URL and encryption key for this provider.'});}
  });
  app.get(`/api/oauth/${provider}/callback`,async(req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
   const state=typeof req.query.state==='string'?req.query.state:'';
   const cookie=readCookie(req,`social_${provider}_state`);
   res.clearCookie(`social_${provider}_state`,{httpOnly:true,secure:process.env.APP_URL?.startsWith('https:'),sameSite:'lax',path:`/api/oauth/${provider}`});
   if(!equalState(state,cookie))return res.status(400).send('Invalid OAuth state.');
   const saved=await consumeState(state,provider);
   if(!saved)return res.status(400).send('Expired or already used OAuth state.');
   const owner=await getUser(saved.owner_id);
   if(!owner||owner.status!=='active'||!userCan(owner,'connections.manage'))return res.status(403).send('Authorization is no longer available.');
   if(req.query.error||typeof req.query.code!=='string'||!req.query.code)return res.redirect(`/connections?provider=${provider}&oauth=denied`);
   try {
    const c=configuredCallback(provider),body=new URLSearchParams({grant_type:'authorization_code',code:req.query.code,redirect_uri:c.redirect!,[c.clientField]:c.client!,client_secret:c.secret!});
    const r=await request<Record<string,any>>(c.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    if(!r.access_token)throw new Error('Invalid token response.');
    // Meta's permission edge is authoritative. Other providers return granted scopes in the exchange.
    const scopes=r.scope?String(r.scope).split(/[ ,]+/):provider==='snapchat'?['snapchat-profile-api']:[];
    const token:Credential={accessToken:r.access_token,refreshToken:r.refresh_token,expiresAt:Date.now()+Number(r.expires_in||3600)*1000,scopes};
    if(['tiktok','youtube','snapchat'].includes(provider)&&!token.refreshToken)throw new Error('Offline consent did not return a refresh token. Reconnect with consent.');
    if(provider==='facebook'||provider==='instagram') {
     const exchange=new URLSearchParams({grant_type:'fb_exchange_token',client_id:c.client!,client_secret:c.secret!,fb_exchange_token:token.accessToken});
     const renewed=await request<Record<string,any>>(c.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:exchange});
     if(!renewed.access_token)throw new Error('Meta long-lived token exchange failed.');
     token.accessToken=renewed.access_token;
     // Meta can return a non-expiring token without expires_in. Its debugger is
     // authoritative; retaining the short exchange's default would expire it in an hour.
     const debugUrl=new URL(`${c.token.slice(0,c.token.lastIndexOf('/oauth/'))}/debug_token`);
     debugUrl.searchParams.set('input_token',token.accessToken);
     const debug=await request<Record<string,any>>(debugUrl.toString(),{headers:{Authorization:`Bearer ${c.client}|${c.secret}`}},true);
     if(!debug.data?.is_valid||String(debug.data.app_id)!==c.client)throw new Error('Meta token verification failed.');
     token.expiresAt=metaTokenExpiry(debug.data);
    }
    const source=`oauth:${provider}:${randomUUID()}`;
    // Verify account identity before saving; discovery never returns credentials to the caller/browser.
    await saveSecret(source,token);
    await discover(provider,token,owner.id,source,true);
    res.redirect(`/connections?provider=${provider}&oauth=connected`);
   }catch {res.redirect(`/connections?provider=${provider}&oauth=failed`);}
  });
 }
}
