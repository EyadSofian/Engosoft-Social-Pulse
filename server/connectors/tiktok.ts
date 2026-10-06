import { blankMetrics, type ConnectorResult, type ObservedPost } from '../types.js';
import { json, numberOrNull, text } from './http.js';
import { hasSavedOAuthToken, providerAccessToken } from './tokens.js';

export async function syncTikTok():Promise<ConnectorResult>{
 if(!process.env.TIKTOK_DISPLAY_ACCESS_TOKEN&&!process.env.TIKTOK_DISPLAY_REFRESH_TOKEN&&!hasSavedOAuthToken('tiktok'))return {platform:'tiktok',status:'needs_setup',message:'اربط حساب TikTok من صفحة المنصات بصلاحيتَي user.info.basic وvideo.list.',posts:[]};
 try{
   const token=await providerAccessToken('tiktok');
   const profile=await json<{data?:{user?:{open_id?:string;display_name?:string}};error?:{code?:string}}>('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{headers:{Authorization:`Bearer ${token}`}});
   if(profile.error?.code&&profile.error.code!=='ok')throw new Error(`TikTok profile API code ${profile.error.code}`);
   const user=profile.data?.user;
   const posts:ObservedPost[]=[];let cursor:number|undefined;let hasMore=false;
   for(let page=0;page<100;page++){
     const body=await json<{data?:{videos?:Record<string,unknown>[];cursor?:number;has_more?:boolean};error?:{code:string}}>('https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,title,video_description,share_url,cover_image_url,like_count,comment_count,share_count,view_count',{
       method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({max_count:20,...(cursor?{cursor}:{})})
     });
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
     if(!hasMore || !body.data?.cursor)break;
     cursor=body.data.cursor;
   }
   const refreshEnabled=Boolean(process.env.TIKTOK_DISPLAY_REFRESH_TOKEN||hasSavedOAuthToken('tiktok'));
   const accountName=text(user?.display_name).trim()||'TikTok';
   return {platform:'tiktok',status:'connected',message:`الحساب المرتبط: ${accountName}. تم جلب ${posts.length} فيديو.${hasMore?' وصلنا حد المزامنة؛ توجد فيديوهات أقدم لم تُجلب بعد.':''}${refreshEnabled?' تجديد OAuth مفعّل.':' اضبط refresh token لاستمرار المزامنة بعد انتهاء access token.'}`,posts};
 }catch(e){return {platform:'tiktok',status:'error',message:e instanceof Error?e.message:'تعذّر الاتصال بـTikTok',posts:[]};}
}
