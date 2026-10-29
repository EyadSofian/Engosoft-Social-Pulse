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
export interface YouTubeInsights {
  channel: string; startDate: string; endDate: string;
  /** Null when YouTube did not report the metric, never zero. */
  totals: { views: number | null; minutes: number | null; likes: number | null; comments: number | null; shares: number | null; subscribersGained: number | null; subscribersLost: number | null };
  daily: { date: string; views: number | null; minutes: number | null }[];
  videos: { id: string; title: string; url: string; publishedAt: string | null; views: number | null; minutes: number | null; averageViewSeconds: number | null; likes: number | null; shares: number | null }[];
}

type Report = { columnHeaders?: { name: string }[]; rows?: (string | number)[][] };
/** Rows of a YouTube Analytics report as objects keyed by column name. */
const rowsOf = (report: Report) => (report.rows ?? []).map((row) => Object.fromEntries((report.columnHeaders ?? []).map((h, i) => [h.name, row[i]])));
const metric = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null);
const sum = (rows: Record<string, unknown>[], key: string) => (rows.some((r) => metric(r[key]) !== null) ? rows.reduce((total, r) => total + (metric(r[key]) ?? 0), 0) : null);

/**
 * The channel's results for a period, as the Analytics page shows them: totals, views and watch time per day, and the
 * top videos by views. Titles come from the synced videos; a video not synced yet keeps its id as the title.
 */
export async function youtubeInsights(account: SocialAccount, startDate: string, endDate: string, titles: Map<string, { title: string; publishedAt: string }>): Promise<YouTubeInsights> {
  const token = await accessToken(account), auth = { headers: headers(token) };
  const report = (params: Record<string, string>) => request(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ids: `channel==${account.externalId}`, startDate, endDate, ...params })}`, auth, true) as Promise<Report>;
  const [days, top] = await Promise.all([
    report({ metrics: 'views,estimatedMinutesWatched,likes,comments,shares,subscribersGained,subscribersLost', dimensions: 'day', sort: 'day' }),
    report({ metrics: 'views,estimatedMinutesWatched,averageViewDuration,likes,shares', dimensions: 'video', sort: '-views', maxResults: '10' }),
  ]);
  const daily = rowsOf(days);
  return {
    channel: account.name, startDate, endDate,
    totals: { views: sum(daily, 'views'), minutes: sum(daily, 'estimatedMinutesWatched'), likes: sum(daily, 'likes'), comments: sum(daily, 'comments'), shares: sum(daily, 'shares'), subscribersGained: sum(daily, 'subscribersGained'), subscribersLost: sum(daily, 'subscribersLost') },
    daily: daily.map((r) => ({ date: String(r.day), views: metric(r.views), minutes: metric(r.estimatedMinutesWatched) })),
    videos: rowsOf(top).map((r) => {
      const id = String(r.video);
      const known = titles.get(id);
      return { id, title: known?.title ?? id, url: `https://www.youtube.com/watch?v=${id}`, publishedAt: known?.publishedAt ?? null, views: metric(r.views), minutes: metric(r.estimatedMinutesWatched), averageViewSeconds: metric(r.averageViewDuration), likes: metric(r.likes), shares: metric(r.shares) };
    }),
  };
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
