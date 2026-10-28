import { getAccount, accountId } from '../social/store.js';
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
    if(new URL(next).origin!=='https://graph.facebook.com')throw new Error('Unexpected Meta pagination host.');
  }
  return output;
}
function insightValue(data:{data?:{name:string;period?:string;values?:{value:unknown}[]}[]},name:string):number|null {
  const rows=data?.data?.filter(row=>row.name===name)||[];
  const item=rows.find(row=>row.period==='lifetime')||rows[0];return numberOrNull(item?.values?.[0]?.value);
}
async function optionalInsight(id:string,token:string,metrics:string[]):Promise<Record<string,number|null>> {
 const entries=await Promise.all(metrics.map(async metric=>{
   try { const data=await graph<{data:{name:string;values:{value:unknown}[]}[]}>(`${id}/insights`,token,{metric});return [metric,insightValue(data,metric)] as const; }
   catch { return [metric,null] as const; }
 }));
 const output:Record<string,number|null>={};for(const [metric,value] of entries)output[metric]=value;
 return output;
}
async function optionalInsights(id:string,token:string,metrics:string[]):Promise<Record<string,number|null>> {
 try {
  const data=await graph<{data:{name:string;period?:string;values:{value:unknown}[]}[]}>(`${id}/insights`,token,{metric:metrics.join(',')});
  return Object.fromEntries(metrics.map(metric=>[metric,insightValue(data,metric)]));
 } catch {
  const entries=await Promise.all(metrics.map(async metric=>[metric,(await optionalInsight(id,token,[metric]))[metric]??null] as const));
  return Object.fromEntries(entries);
 }
}
async function mapConcurrent<T,R>(items:T[],limit:number,work:(item:T)=>Promise<R>):Promise<R[]> {
 const results=new Array<R>(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
   while(true){const index=next++;if(index>=items.length)return;results[index]=await work(items[index]!);}
 }));
 return results;
}
export async function syncMeta(options?:{token:string;pageIds?:string[]}):Promise<ConnectorResult[]> {
 const token=options?.token||process.env.META_ACCESS_TOKEN?.trim();
 if(!token) return [
  {platform:'facebook',status:'needs_setup',message:'META_ACCESS_TOKEN غير مضبوط.',posts:[]},
  {platform:'instagram',status:'needs_setup',message:'اربط حساب Instagram Professional وصفحات Meta أولًا.',posts:[]}
 ];
 try {
   const ids=options?.pageIds||(process.env.META_PAGE_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
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
   let facebookMediaViews=0;let facebookUniqueViewers=0;
   const igErrors:string[]=[];const fbErrors:string[]=[];let fbDetail='';
   for(const page of pages){
     const pageToken=page.access_token||token;
     const fbDisabled=(await getAccount(accountId('facebook',page.id)))?.status==='disconnected';
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
       const pagePosts=await mapConcurrent(raw,6,async p=>{
         const id=text(p.id);if(!id)return undefined;
         const likes=p.likes as {summary?:{total_count?:number}}|undefined;
         const comments=p.comments as {summary?:{total_count?:number}}|undefined;
         const shares=p.shares as {count?:number}|undefined;
         const metrics=blankMetrics();metrics.likes=numberOrNull(likes?.summary?.total_count);metrics.comments=numberOrNull(comments?.summary?.total_count);metrics.shares=numberOrNull(shares?.count);
         // Meta retired Facebook's legacy reach and impression metrics in 2026.
         // Use the replacement Page post Media Views and unique-viewer metrics.
         const insights=await optionalInsights(id,pageToken,['post_media_view','post_total_media_view_unique']);
         metrics.views=insights.post_media_view;
         metrics.reach=insights.post_total_media_view_unique;
         if(metrics.views!=null)facebookMediaViews++;
         if(metrics.reach!=null)facebookUniqueViewers++;
         metrics.engagement=[metrics.likes,metrics.comments,metrics.shares].some(value=>value!=null)
           ? [metrics.likes,metrics.comments,metrics.shares].reduce<number>((sum,value)=>sum+(value??0),0)
           : null;
         return {platform:'facebook' as const,accountId:page.id,accountName:page.name,externalId:id,permalink:text(p.permalink_url),title:text(p.message).slice(0,220)||'Facebook post',publishedAt:text(p.created_time),contentType:'post',thumbnail:text(p.full_picture),metrics};
       });
       facebook.push(...pagePosts.filter((post)=>post!==undefined));
     }catch(e){fbErrors.push(`${page.name}: ${e instanceof Error?e.message:'تعذّر القراءة'}`);}
     try {
       const info=await graph<{instagram_business_account?:{id:string}}>(page.id,pageToken,{fields:'instagram_business_account'});
       const igId=info.instagram_business_account?.id;
       if(igId&&(await getAccount(accountId('instagram',igId)))?.status==='disconnected')continue;
       if(!igId) {igErrors.push(`${page.name}: لا يوجد Instagram Professional مرتبط.`);continue;}
       const raw=await list<Record<string,unknown>>(`${igId}/media`,pageToken,{fields:'id,caption,media_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url',limit:'50'},3);
       const pagePosts=await mapConcurrent(raw,4,async p=>{
         const id=text(p.id);if(!id)return undefined;
         const m=blankMetrics();m.likes=numberOrNull(p.like_count);m.comments=numberOrNull(p.comments_count);
         // Instagram insights are authorized on the user token. A Page token can
         // read media and engagement counts, but may return empty insight data.
         // Meta removed the Instagram media `impressions` metric in Graph API v22+.
         // Keep the field visible as unavailable while collecting supported insights.
         const extra=canReadIgInsights?await optionalInsights(id,token,['reach','saved','shares','views','total_interactions']):{};
         m.reach=extra.reach??null;m.saves=extra.saved??null;m.shares=extra.shares??null;m.views=extra.views??null;
         m.engagement=extra.total_interactions??null;
         return {platform:'instagram' as const,accountId:igId,accountName:page.name,externalId:id,permalink:text(p.permalink),title:text(p.caption).slice(0,220)||'Instagram post',publishedAt:text(p.timestamp),contentType:text(p.media_type).toLowerCase()||'post',thumbnail:text(p.thumbnail_url)||text(p.media_url),metrics:m};
       });
       instagram.push(...pagePosts.filter((post)=>post!==undefined));
     }catch(e){const message=e instanceof Error?e.message:'تعذّر القراءة';igErrors.push(`${page.name}: ${message.includes('code 10')?'صلاحية instagram_basic/instagram_manage_insights غير متاحة لهذا التوكن.':message}`);}
   }
   return [
     {platform:'facebook',partial:fbErrors.length>0&&facebook.length>0,status:fbErrors.length&&!facebook.length?'error':'connected',message:fbErrors.join(' ')||`تم جلب ${facebook.length} منشور. مشاهدات المحتوى متاحة لـ ${facebookMediaViews} منشور، والمشاهدون الفريدون لـ ${facebookUniqueViewers} منشور. ${fbDetail}`,posts:facebook},
     {platform:'instagram',partial:igErrors.length>0&&instagram.length>0,status:igErrors.length&&!instagram.length?'error':'connected',message:igErrors.join(' ')||`تم جلب ${instagram.length} منشور.${canReadIgInsights?'':' reach/views/saves تحتاج صلاحية instagram_manage_insights.'}`,posts:instagram}
   ];
 }catch(e){const message=e instanceof Error?e.message:'تعذّر الاتصال بـMeta';return [{platform:'facebook',status:'error',message,posts:[]},{platform:'instagram',status:'error',message,posts:[]}];}
}
