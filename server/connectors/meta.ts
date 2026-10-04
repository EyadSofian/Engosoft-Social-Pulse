import { blankMetrics, type ConnectorResult, type ObservedPost } from '../types.js';
import { json, numberOrNull, text } from './http.js';

type Page={id:string;name:string;access_token?:string};
type GraphList<T>={data:T[];paging?:{next?:string}};
const version=()=>process.env.META_API_VERSION||'v24.0';
const base=()=>`https://graph.facebook.com/${version()}`;
async function graph<T>(path:string,token:string,params:Record<string,string>={}):Promise<T>{
  const u=new URL(`${base()}/${path.replace(/^\//,'')}`);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
  return json<T>(u.toString(),{headers:{Authorization:`Bearer ${token}`}});
}
async function list<T>(path:string,token:string,params:Record<string,string>,maxPages=3):Promise<T[]> {
  const output:T[]=[];let next='';
  for(let page=0;page<maxPages;page++){
    const body=next?await json<GraphList<T>>(next,{headers:{Authorization:`Bearer ${token}`}}):await graph<GraphList<T>>(path,token,params);
    output.push(...(body.data||[]));next=body.paging?.next||'';if(!next) break;
  }
  return output;
}
function insightValue(data:{data?:{name:string;values?:{value:unknown}[]}[]},name:string):number|null {
  const item=data?.data?.find(row=>row.name===name);return numberOrNull(item?.values?.[0]?.value);
}
async function optionalInsight(id:string,token:string,metrics:string[]):Promise<Record<string,number|null>> {
 const entries=await Promise.all(metrics.map(async metric=>{
   try { const data=await graph<{data:{name:string;values:{value:unknown}[]}[]}>(`${id}/insights`,token,{metric});return [metric,insightValue(data,metric)] as const; }
   catch { return [metric,null] as const; }
 }));
 const output:Record<string,number|null>={};for(const [metric,value] of entries)output[metric]=value;
 return output;
}
export async function syncMeta():Promise<ConnectorResult[]> {
 const token=process.env.META_ACCESS_TOKEN?.trim();
 if(!token) return [
  {platform:'facebook',status:'needs_setup',message:'META_ACCESS_TOKEN غير مضبوط.',posts:[]},
  {platform:'instagram',status:'needs_setup',message:'اربط حساب Instagram Professional وصفحات Meta أولًا.',posts:[]}
 ];
 try {
   const ids=(process.env.META_PAGE_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
   let pages:Page[]=[];
   try {pages=await list<Page>('me/accounts',token,{fields:'id,name,access_token',limit:'100'},2);} catch { /* A Page token may not list accounts. */ }
   if(ids.length) pages=ids.map(id=>pages.find(p=>p.id===id)||{id,name:`Page ${id}`});
   if(!pages.length) throw new Error('لم تظهر صفحات Meta. اضبط META_PAGE_IDS وتأكد من صلاحيات الصفحات.');
   let canReadIgInsights=false;
   try {
     const permissions=await graph<{data:{permission:string;status:string}[]}>('me/permissions',token);
     canReadIgInsights=permissions.data?.some(item=>item.permission==='instagram_manage_insights'&&item.status==='granted')||false;
   } catch { /* Media and engagement counts can still sync without insights access. */ }
   const facebook:ObservedPost[]=[];const instagram:ObservedPost[]=[];
   const igErrors:string[]=[];const fbErrors:string[]=[];let fbDetail='';
   for(const page of pages){
     const pageToken=page.access_token||token;
     try {
       const fields=[
         'id,message,permalink_url,created_time,full_picture,shares,likes.summary(true),comments.summary(true)',
         'id,message,permalink_url,created_time,full_picture,shares,likes.summary(true)',
         'id,message,permalink_url,created_time,full_picture,shares'
       ];
       let raw:Record<string,unknown>[]=[];let level=2;
       for(let i=0;i<fields.length;i++){
         try {raw=await list<Record<string,unknown>>(`${page.id}/posts`,pageToken,{fields:fields[i],limit:'50',since:String(Math.floor(Date.now()/1000)-190*86400)},3);level=i;break;}
         catch(e){if(i===fields.length-1)throw e;}
       }
       if(level>0)fbDetail='بعض حقول الإعجابات/التعليقات تحتاج صلاحيات إضافية.';
       for(const p of raw){
         const id=text(p.id);if(!id)continue;
         const likes=p.likes as {summary?:{total_count?:number}}|undefined;
         const comments=p.comments as {summary?:{total_count?:number}}|undefined;
         const shares=p.shares as {count?:number}|undefined;
         const metrics=blankMetrics();metrics.likes=numberOrNull(likes?.summary?.total_count);metrics.comments=numberOrNull(comments?.summary?.total_count);metrics.shares=numberOrNull(shares?.count);
         facebook.push({platform:'facebook',accountId:page.id,accountName:page.name,externalId:id,permalink:text(p.permalink_url),title:text(p.message).slice(0,220)||'Facebook post',publishedAt:text(p.created_time),contentType:'post',thumbnail:text(p.full_picture),metrics});
       }
     }catch(e){fbErrors.push(`${page.name}: ${e instanceof Error?e.message:'تعذّر القراءة'}`);}
     try {
       const info=await graph<{instagram_business_account?:{id:string}}>(page.id,pageToken,{fields:'instagram_business_account'});
       const igId=info.instagram_business_account?.id;
       if(!igId) {igErrors.push(`${page.name}: لا يوجد Instagram Professional مرتبط.`);continue;}
       const raw=await list<Record<string,unknown>>(`${igId}/media`,pageToken,{fields:'id,caption,media_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url',limit:'50'},3);
       for(const p of raw){
         const id=text(p.id);if(!id)continue;
         const m=blankMetrics();m.likes=numberOrNull(p.like_count);m.comments=numberOrNull(p.comments_count);
         // Instagram insights are authorized on the user token. A Page token can
         // read media and engagement counts, but may return empty insight data.
         const extra=canReadIgInsights?await optionalInsight(id,token,['reach','saved','shares','views']):{};
         m.reach=extra.reach;m.saves=extra.saved;m.shares=extra.shares;m.views=extra.views;
         instagram.push({platform:'instagram',accountId:igId,accountName:page.name,externalId:id,permalink:text(p.permalink),title:text(p.caption).slice(0,220)||'Instagram post',publishedAt:text(p.timestamp),contentType:text(p.media_type).toLowerCase()||'post',thumbnail:text(p.thumbnail_url)||text(p.media_url),metrics:m});
       }
     }catch(e){const message=e instanceof Error?e.message:'تعذّر القراءة';igErrors.push(`${page.name}: ${message.includes('code 10')?'صلاحية instagram_basic/instagram_manage_insights غير متاحة لهذا التوكن.':message}`);}
   }
   return [
     {platform:'facebook',status:fbErrors.length&&!facebook.length?'error':'connected',message:fbErrors.join(' ')||`تم جلب ${facebook.length} بوست. ${fbDetail} الـinsights قد تتطلب read_insights.`,posts:facebook},
     {platform:'instagram',status:igErrors.length&&!instagram.length?'error':'connected',message:igErrors.join(' ')||`تم جلب ${instagram.length} بوست.${canReadIgInsights?'':' reach/views/saves تحتاج صلاحية instagram_manage_insights.'}`,posts:instagram}
   ];
 }catch(e){const message=e instanceof Error?e.message:'تعذّر الاتصال بـMeta';return [{platform:'facebook',status:'error',message,posts:[]},{platform:'instagram',status:'error',message,posts:[]}];}
}
