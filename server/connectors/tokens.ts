import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getEncryptedToken, saveEncryptedToken } from '../store.js';
import type { Platform } from '../types.js';

type Provider='tiktok'|'snapchat';
type TokenRecord={accessToken:string;refreshToken:string;expiresAt:number};
type Config={platform:Provider;accessEnv:string;refreshEnv:string;clientIdEnv:string;clientSecretEnv:string;url:string;clientIdField:string};
const configs:Record<Provider,Config>={
 tiktok:{platform:'tiktok',accessEnv:'TIKTOK_DISPLAY_ACCESS_TOKEN',refreshEnv:'TIKTOK_DISPLAY_REFRESH_TOKEN',clientIdEnv:'TIKTOK_CLIENT_KEY',clientSecretEnv:'TIKTOK_CLIENT_SECRET',url:'https://open.tiktokapis.com/v2/oauth/token/',clientIdField:'client_key'},
 snapchat:{platform:'snapchat',accessEnv:'SNAP_PROFILE_ACCESS_TOKEN',refreshEnv:'SNAP_PROFILE_REFRESH_TOKEN',clientIdEnv:'SNAP_CLIENT_ID',clientSecretEnv:'SNAP_CLIENT_SECRET',url:'https://accounts.snapchat.com/login/oauth2/access_token',clientIdField:'client_id'}
};

function key():Buffer|undefined {
 const value=process.env.TOKEN_ENCRYPTION_KEY?.trim();
 if(!value)return undefined;
 const decoded=Buffer.from(value,'base64');
 if(decoded.length!==32)throw new Error('TOKEN_ENCRYPTION_KEY يجب أن يكون 32 بايت بصيغة base64.');
 return decoded;
}
function encrypt(platform:Platform,value:TokenRecord,secret:Buffer):string {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);
 cipher.setAAD(Buffer.from(platform));
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');
}
function decrypt(platform:Platform,value:string,secret:Buffer):TokenRecord {
 const payload=Buffer.from(value,'base64');
 const decipher=createDecipheriv('aes-256-gcm',secret,payload.subarray(0,12));
 decipher.setAAD(Buffer.from(platform));decipher.setAuthTag(payload.subarray(12,28));
 return JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)),decipher.final()]).toString('utf8')) as TokenRecord;
}
const inFlight=new Map<Provider,Promise<string>>();
export function providerAccessToken(platform:Provider):Promise<string> {
 const running=inFlight.get(platform);if(running)return running;
 const promise=resolveAccessToken(configs[platform]).finally(()=>inFlight.delete(platform));
 inFlight.set(platform,promise);return promise;
}
export function hasSavedOAuthToken(platform:Provider):boolean {
 return Boolean(getEncryptedToken(platform));
}
export function saveOAuthAccessToken(platform:Provider,value:TokenRecord):void {
 const secret=key();
 if(!secret)throw new Error('TOKEN_ENCRYPTION_KEY غير مضبوط؛ تعذّر حفظ التوكن بأمان.');
 if(!value.accessToken||!value.refreshToken)throw new Error('TikTok لم يُرجع access token وrefresh token معًا.');
 saveEncryptedToken(platform,encrypt(platform,value,secret));
}
async function resolveAccessToken(config:Config):Promise<string>{
 const fallback=process.env[config.accessEnv]?.trim()||'';
 const secret=key();
 const clientId=process.env[config.clientIdEnv]?.trim()||'';
 const clientSecret=process.env[config.clientSecretEnv]?.trim()||'';
 const envRefresh=process.env[config.refreshEnv]?.trim()||'';
 const stored=secret?getEncryptedToken(config.platform):undefined;
 if(!secret||!clientId||!clientSecret||(!envRefresh&&!stored)){
  if(fallback)return fallback;
  throw new Error(`مطلوب ${config.accessEnv} أو ${config.refreshEnv} مع بيانات OAuth وTOKEN_ENCRYPTION_KEY.`);
 }
 let current:TokenRecord|undefined;
 if(stored){try{current=decrypt(config.platform,stored,secret);}catch{throw new Error('تعذّر قراءة OAuth token المخزن؛ راجع TOKEN_ENCRYPTION_KEY.');}}
 if(current && current.expiresAt>Date.now()+300_000)return current.accessToken;
 const refreshToken=current?.refreshToken||envRefresh;
 const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,[config.clientIdField]:clientId,client_secret:clientSecret});
 const response=await fetch(config.url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15_000)});
 const result=await response.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;error?:string};
 if(!response.ok||!result.access_token){
  const reason=result.error?'رفض موفر الخدمة تجديد التوكن.':'تعذّر تجديد التوكن.';
  throw new Error(`${reason} (${config.platform}, HTTP ${response.status})`);
 }
 const next:TokenRecord={accessToken:result.access_token,refreshToken:result.refresh_token||refreshToken,expiresAt:Date.now()+Math.max(60,Number(result.expires_in)||3600)*1000};
 saveEncryptedToken(config.platform,encrypt(config.platform,next,secret));
 return next.accessToken;
}
