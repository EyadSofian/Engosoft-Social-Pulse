import { accessToken } from '../social/credentials.js';
import { accountId, checkpoint, getAccount } from '../social/store.js';
import { ProviderError } from '../social/http.js';
import type { SocialAccount } from '../social/types.js';
import { blankMetrics, type ConnectorResult, type ObservedPost } from '../types.js';
import { json, numberOrNull, text } from './http.js';
import { hasSavedOAuthToken, providerAccessToken } from './tokens.js';
import { getOldestObservedPublishedAt } from '../store.js';

export async function syncTikTok(account?:SocialAccount):Promise<ConnectorResult>{
 if(!account&&!process.env.TIKTOK_DISPLAY_ACCESS_TOKEN&&!process.env.TIKTOK_DISPLAY_REFRESH_TOKEN&&!(await hasSavedOAuthToken('tiktok')))return {platform:'tiktok',status:'needs_setup',message:'اربط حساب TikTok من صفحة المنصات بصلاحيتَي user.info.basic وvideo.list.',posts:[]};
 try{
   const token=account?await accessToken(account):await providerAccessToken('tiktok');
   const profile=await json<{data?:{user?:{open_id?:string;display_name?:string}};error?:{code?:string}}>('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{headers:{Authorization:`Bearer ${token}`}});
   if(profile.error?.code&&profile.error.code!=='ok')throw new Error(`TikTok profile API code ${profile.error.code}`);
   const user=profile.data?.user;
   if(!user?.open_id||account&&user.open_id!==account.externalId)throw new Error('TikTok account identity could not be verified.');
   const connection=await getAccount(accountId('tiktok',user.open_id));
   if(connection?.status==='disconnected')return {platform:'tiktok',status:'needs_setup',message:'TikTok disconnected.',posts:[]};
   const history=await checkpoint(accountId('tiktok',user.open_id),'tiktok_history');let historyCursor=history||'';
   const posts:ObservedPost[]=[];let cursor:number|undefined;let hasMore=false;let pageError=false;
   const oldestSaved=await getOldestObservedPublishedAt('tiktok',text(user?.open_id));
   for(let page=0;page<25;page++){
     if(page===5&&history==='complete')break;
     if(page===5&&history&&history!=='complete')cursor=Number(history);
     if(page===5&&!history&&oldestSaved){
       const oldestCursor=Date.parse(oldestSaved)-1;
       if(Number.isFinite(oldestCursor)&&(!cursor||oldestCursor<cursor))cursor=oldestCursor;
     }
     let body:{data?:{videos?:Record<string,unknown>[];cursor?:number;has_more?:boolean};error?:{code:string}}|undefined;
     try{
       for(let attempt=0;attempt<3;attempt++){
         try{
           body=await json('https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,title,video_description,share_url,cover_image_url,like_count,comment_count,share_count,view_count',{
             method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({max_count:20,...(cursor?{cursor}:{})})
           });
           break;
         }catch(error){
           if(attempt===2||error instanceof ProviderError&&!error.retryable)throw error;
           await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
         }
       }
     }catch(error){
       if(!posts.length)throw error;
       console.warn(`TikTok pagination stopped after ${posts.length} videos:`,error instanceof Error?error.message:'unknown error');
       pageError=true;
       break;
     }
     if(!body)break;
     if(body.error?.code && body.error.code!=='ok')throw new Error(`TikTok API code ${body.error.code}`);
     for(const video of body.data?.videos||[]){
       const id=text(video.id);if(!id)continue;
       const metrics=blankMetrics();metrics.views=numberOrNull(video.view_count);metrics.likes=numberOrNull(video.like_count);metrics.comments=numberOrNull(video.comment_count);metrics.shares=numberOrNull(video.share_count);
       metrics.engagement=[metrics.likes,metrics.comments,metrics.shares].some(value=>value!=null)
         ? [metrics.likes,metrics.comments,metrics.shares].reduce<number>((sum,value)=>sum+(value??0),0)
         : null;
       posts.push({platform:'tiktok',accountId:text(user?.open_id),accountName:text(user?.display_name)||'TikTok',externalId:id,permalink:text(video.share_url),title:text(video.title)||text(video.video_description)||'TikTok video',publishedAt:new Date(Number(video.create_time)*1000).toISOString(),contentType:'video',thumbnail:text(video.cover_image_url),metrics});
     }
     hasMore=Boolean(body.data?.has_more);
     if(!hasMore || !body.data?.cursor){historyCursor='complete';break;}
     if(page>=5)historyCursor=String(body.data.cursor);
     cursor=body.data.cursor;
   }
   const refreshEnabled=Boolean(process.env.TIKTOK_DISPLAY_REFRESH_TOKEN||(await hasSavedOAuthToken('tiktok')));
   const accountName=text(user?.display_name).trim()||'TikTok';
   return {platform:'tiktok',partial:pageError,status:'connected',message:`الحساب المرتبط: ${accountName}. تم تحديث ${posts.length} فيديو.${pageError?' تعذّر جلب بعض الفيديوهات الأقدم مؤقتًا؛ سنحاول في المزامنة التالية.':hasMore&&historyCursor!=='complete'?' سيُستكمل جلب الفيديوهات الأقدم في المزامنة التالية.':''}${refreshEnabled?' تجديد OAuth مفعّل.':' اضبط refresh token لاستمرار المزامنة بعد انتهاء access token.'}`,posts,checkpoints:historyCursor?[{accountId:accountId('tiktok',user.open_id),kind:'tiktok_history',value:historyCursor}]:[]};
 }catch(e){return {platform:'tiktok',status:'error',message:e instanceof Error?e.message:'تعذّر الاتصال بـTikTok',posts:[]};}
}
