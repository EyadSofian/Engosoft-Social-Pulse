import type { ConnectorResult, WebsitePageDay } from '../types.js';
import { json, numberOrNull } from './http.js';

type Report={rows?:{dimensionValues?:{value:string}[];metricValues?:{value:string}[]}[];rowCount?:number};
function dateValue(value:string){return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`;}
function pageTitle(path:string){if(path==='/')return 'الصفحة الرئيسية';const slug=path.split('/').filter(Boolean).pop()||path;try{return decodeURIComponent(slug);}catch{return slug;}}

export async function syncGA4():Promise<ConnectorResult>{
 const property=process.env.GA4_PROPERTY_ID?.trim(),clientId=process.env.GOOGLE_ANALYTICS_CLIENT_ID?.trim(),clientSecret=process.env.GOOGLE_ANALYTICS_CLIENT_SECRET?.trim(),refresh=process.env.GOOGLE_ANALYTICS_REFRESH_TOKEN?.trim();
 if(!property||!clientId||!clientSecret||!refresh)return {platform:'website',status:'needs_setup',message:'مطلوب GA4 property وOAuth refresh token بصلاحية analytics.readonly.',posts:[]};
 try{
   const oauth=await json<{access_token:string}>('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refresh,grant_type:'refresh_token'})});
   const endpoint=`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(property)}:runReport`;
   const request=(dimensions:string[],metrics:string[],limit:number)=>json<Report>(endpoint,{
     method:'POST',headers:{Authorization:`Bearer ${oauth.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({dateRanges:[{startDate:'90daysAgo',endDate:'today'}],dimensions:dimensions.map(name=>({name})),metrics:metrics.map(name=>({name})),limit})
   });
   const [report,pageReport]=await Promise.all([
     request(['date'],['screenPageViews','sessions','engagedSessions'],1000),
     request(['date','pagePath'],['screenPageViews','activeUsers','userEngagementDuration'],10000)
   ]);
   const website=(report.rows||[]).map(row=>({date:dateValue(row.dimensionValues?.[0]?.value||''),views:numberOrNull(row.metricValues?.[0]?.value)||0,sessions:numberOrNull(row.metricValues?.[1]?.value)||0,engagedSessions:numberOrNull(row.metricValues?.[2]?.value)||0})).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date));
   const websitePages:WebsitePageDay[]=(pageReport.rows||[]).map(row=>{
     const path=row.dimensionValues?.[1]?.value||'';
     return {date:dateValue(row.dimensionValues?.[0]?.value||''),path,title:pageTitle(path),views:numberOrNull(row.metricValues?.[0]?.value)||0,activeUsers:numberOrNull(row.metricValues?.[1]?.value)||0,engagementSeconds:numberOrNull(row.metricValues?.[2]?.value)||0};
   }).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.path.startsWith('/'));
   const partial=(pageReport.rowCount||0)>10000;
   return {platform:'website',status:'connected',message:`تم جلب ${website.length} يوم و${websitePages.length} سجل صفحة من GA4.${partial?' تقرير الصفحات تجاوز 10,000 سجل؛ النتائج المعروضة جزئية.':''}`,posts:[],website,websitePages};
 }catch(e){return {platform:'website',status:'error',message:e instanceof Error?e.message:'تعذّر الاتصال بـGA4',posts:[]};}
}
