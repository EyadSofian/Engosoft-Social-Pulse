import { blankMetrics, type ConnectorResult, type ObservedPost } from '../types.js';
import { json, numberOrNull, text } from './http.js';
import { providerAccessToken } from './tokens.js';

type SnapResponse={request_status?:string;spotlights?:{spotlight?:Record<string,unknown>}[];stories?:{story?:Record<string,unknown>}[];paging?:{next_page_id?:string};assets?:{timeseries?:{fields?:{field?:{field_name?:string;fieldName?:string};stats?:{value?:string}[]}[]}[]}[]};
function statsValue(body:SnapResponse,name:string):number|null {
  for(const asset of body.assets||[])for(const series of asset.timeseries||[])for(const item of series.fields||[])
    if((item.field?.field_name||item.field?.fieldName)===name)return numberOrNull(item.stats?.[0]?.value);
  return null;
}
export async function syncSnapchat():Promise<ConnectorResult>{
 const id=process.env.SNAP_PROFILE_ID?.trim();
 if((!process.env.SNAP_PROFILE_ACCESS_TOKEN&&!process.env.SNAP_PROFILE_REFRESH_TOKEN)||!id)return {platform:'snapchat',status:'needs_setup',message:'مطلوب SNAP_PROFILE_ID وتوكن Public Profile API بصلاحية snapchat-profile-api.',posts:[]};
 try{
   const token=await providerAccessToken('snapchat');
   const posts:ObservedPost[]=[];
   const auth={Authorization:`Bearer ${token}`};
   for(const type of ['spotlights','stories'] as const){
     let cursor='';
     for(let page=0;page<3;page++){
       const u=new URL(`https://businessapi.snapchat.com/v1/public_profiles/${encodeURIComponent(id)}/${type}`);
       u.searchParams.set('limit','30');if(cursor)u.searchParams.set('cursor',cursor);
       const body=await json<SnapResponse>(u.toString(),{headers:auth});
       if(body.request_status==='ERROR')throw new Error(`Snapchat ${type} request failed.`);
       const items=type==='spotlights'?(body.spotlights||[]).map(x=>x.spotlight):(body.stories||[]).map(x=>x.story);
       for(const item of items){
         if(!item||!text(item.id))continue;
         const externalId=text(item.id);const path=new URL(`https://businessapi.snapchat.com/v1/public_profiles/${encodeURIComponent(id)}/${type}/${encodeURIComponent(externalId)}/stats`);
         if(type==='stories'){
           if(text(item.created_at))path.searchParams.set('created_at',text(item.created_at));
           if(text(item.ended_at))path.searchParams.set('ended_at',text(item.ended_at));
         }
         let stat:SnapResponse={};try{stat=await json<SnapResponse>(path.toString(),{headers:auth});}catch{/* Metadata remains useful if insights are unavailable. */}
         const metrics=blankMetrics();
         metrics.views=statsValue(stat,type==='spotlights'?'SPOTLIGHT_VIEWS':'STORY_VIEWS');
         metrics.reach=statsValue(stat,type==='spotlights'?'SPOTLIGHT_UNIQUES':'STORY_UNIQUES');
         metrics.likes=statsValue(stat,type==='spotlights'?'SPOTLIGHT_FAVORITES':'STORY_FAVORITES');
         metrics.shares=statsValue(stat,type==='spotlights'?'SPOTLIGHT_SHARES':'SHARES');
         metrics.clicks=statsValue(stat,'SWIPE_UPS');
         posts.push({platform:'snapchat',accountId:id,accountName:'Snapchat Public Profile',externalId,permalink:'',title:text(item.title)||text(item.caption)||(type==='stories'?'Snapchat story':'Snapchat spotlight'),publishedAt:text(item.created_at),contentType:type==='stories'?'story':'spotlight',thumbnail:text(item.thumbnail_url),metrics});
       }
       cursor=body.paging?.next_page_id||'';if(!cursor)break;
     }
   }
   return {platform:'snapchat',status:'connected',message:`تم جلب ${posts.length} قصة وSpotlight.${process.env.SNAP_PROFILE_REFRESH_TOKEN?' تجديد OAuth مفعّل.':' اضبط refresh token لاستمرار المزامنة بعد انتهاء access token.'}`,posts};
 }catch(e){return {platform:'snapchat',status:'error',message:e instanceof Error?e.message:'تعذّر الاتصال بـSnapchat',posts:[]};}
}
