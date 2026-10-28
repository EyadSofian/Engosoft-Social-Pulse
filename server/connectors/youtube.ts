import { blankMetrics, type ConnectorResult, type ObservedPost } from '../types.js';
import { numberOrNull } from './http.js';
import { accessToken } from '../social/credentials.js';
import { checkpoint } from '../social/store.js';
import { headers, request } from '../social/http.js';
import type { SocialAccount } from '../social/types.js';
const base='https://www.googleapis.com/youtube/v3/';
export async function youtubeAnalytics(account:SocialAccount,startDate:string,endDate:string) {
 const token=await accessToken(account);
 return request(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ids:`channel==${account.externalId}`,startDate,endDate,metrics:'views,estimatedMinutesWatched,likes,comments,shares',dimensions:'day',sort:'day'})}`,{headers:headers(token)},true);
}
export async function syncYouTube(account:SocialAccount):Promise<ConnectorResult> {
 const posts:ObservedPost[]=[];
 try {
  const token=await accessToken(account),auth={headers:headers(token)};
  const channel=await request(`${base}channels?part=id,snippet,contentDetails&mine=true`,auth,true);
  const mine=channel.items?.find((x:any)=>x.id===account.externalId);
  if(!mine)throw new Error('Authorized channel identity changed. Reconnect YouTube.');
  const playlist=mine.contentDetails?.relatedPlaylists?.uploads;
  if(!playlist)throw new Error('No channel uploads playlist was returned.');
  let next='';let historical=await checkpoint(account.id,'youtube_history');let historyNext=historical||'';
  for(let page=0;page<7;page++) {
   if(page===2) {if(historical==='complete')break;next=historical||'';}
   const params=new URLSearchParams({part:'contentDetails',playlistId:playlist,maxResults:'50',...(next?{pageToken:next}:{})});
   const r=await request(`${base}playlistItems?${params}`,auth,true), ids=(r.items||[]).map((x:any)=>x.contentDetails?.videoId).filter(Boolean);
   if(ids.length) {
    const videos=await request(`${base}videos?${new URLSearchParams({part:'snippet,statistics,status',id:ids.join(',')})}`,auth,true);
    for(const v of videos.items||[]) {
     if(v.status?.uploadStatus!=='processed')continue;
     const m=blankMetrics();m.views=numberOrNull(v.statistics?.viewCount);m.likes=numberOrNull(v.statistics?.likeCount);m.comments=numberOrNull(v.statistics?.commentCount);
     posts.push({platform:'youtube',accountId:account.externalId,accountName:mine.snippet.title,externalId:v.id,permalink:`https://www.youtube.com/watch?v=${v.id}`,title:v.snippet.title,publishedAt:v.snippet.publishedAt,contentType:'video',thumbnail:v.snippet.thumbnails?.medium?.url||'',metrics:m});
    }
   }
   next=r.nextPageToken||'';
   if(page>=2)historyNext=next||'complete';
   if(!next) {historyNext='complete';break;}
  }
  return {platform:'youtube',status:'connected',message:`${mine.snippet.title}: ${posts.length} videos synchronized.`,posts,checkpoints:[{accountId:account.id,kind:'youtube_history',value:historyNext}]};
 }catch {return {platform:'youtube',status:'error',message:'YouTube synchronization failed. Check channel consent, API enablement and quota.',posts};}
}
