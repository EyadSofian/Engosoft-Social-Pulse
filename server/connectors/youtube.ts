import { blankMetrics, type AudienceDemographics, type AudienceSlice, type ConnectorResult, type ObservedPost } from '../types.js';
import { numberOrNull } from './http.js';
import { accessToken } from '../social/credentials.js';
import { checkpoint } from '../social/store.js';
import { headers, request } from '../social/http.js';
import type { SocialAccount } from '../social/types.js';
import { DateTime } from 'luxon';
import type { YouTubeActivityTotals, YouTubeAnalyticsPeriod, YouTubeBreakdownRow, YouTubeBreakdowns, YouTubeChannelMetrics } from '../../src/domain/youtube-analytics.js';
const base='https://www.googleapis.com/youtube/v3/';
const reportingZone = 'America/Los_Angeles';
export async function youtubeAnalytics(account:SocialAccount,startDate:string,endDate:string) {
 const token=await accessToken(account);
 return request(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ids:`channel==${account.externalId}`,startDate,endDate,metrics:'views,estimatedMinutesWatched,likes,comments,shares',dimensions:'day',sort:'day'})}`,{headers:headers(token)},true);
}
export interface YouTubeInsights extends YouTubeChannelMetrics {
  videos: { id: string; title: string; url: string; publishedAt: string | null; views: number | null; minutes: number | null; averageViewSeconds: number | null; likes: number | null; shares: number | null }[];
}

type Report = { columnHeaders?: { name: string }[]; rows?: (string | number)[][] };
/** Rows of a YouTube Analytics report as objects keyed by column name. */
const rowsOf = (report: Report) => (report.rows ?? []).map((row) => Object.fromEntries((report.columnHeaders ?? []).map((h, i) => [h.name, row[i]])));
const metric = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null);
const sum = (rows: Record<string, unknown>[], key: string) => (rows.some((r) => metric(r[key]) !== null) ? rows.reduce((total, r) => total + (metric(r[key]) ?? 0), 0) : null);
const activityMetrics = 'estimatedMinutesWatched,likes,comments,shares,subscribersGained,subscribersLost';
const totalsOf = (views: Record<string, unknown>[], activity: Record<string, unknown>[]): YouTubeActivityTotals => ({
  views: sum(views, 'views'),
  minutes: sum(activity, 'estimatedMinutesWatched'),
  likes: sum(activity, 'likes'),
  comments: sum(activity, 'comments'),
  shares: sum(activity, 'shares'),
  subscribersGained: sum(activity, 'subscribersGained'),
  subscribersLost: sum(activity, 'subscribersLost'),
});

export function youtubeDateRange(days: YouTubeAnalyticsPeriod, now = new Date()) {
  const end = DateTime.fromJSDate(now, { zone: reportingZone }).minus({ days: 1 });
  return { start: end.minus({ days: days - 1 }).toISODate()!, end: end.toISODate()! };
}

/** The post report counts lifetime activity for videos uploaded in the window. */
export function youtubePublishedVideoTotals(posts: ObservedPost[], startDate: string, endDate: string): NonNullable<YouTubeChannelMetrics['publishedVideoTotals']> {
  const rows = posts.flatMap(post => {
    const day = DateTime.fromISO(post.publishedAt, { zone: reportingZone }).toISODate();
    if (!day || day < startDate || day > endDate) return [];
    const { views, engagement, likes, comments, shares, saves } = post.metrics;
    const parts = [likes, comments, shares, saves].flatMap(value => value == null ? [] : [value]);
    return [{ views, interactions: engagement ?? (parts.length ? parts.reduce((total, value) => total + value, 0) : null) }];
  });
  return { count: rows.length, views: sum(rows, 'views'), interactions: sum(rows, 'interactions') };
}

/**
 * The channel's results for a period, as the Analytics page shows them: totals, views and watch time per day, and the
 * top videos by views. Titles come from the synced videos; a video not synced yet keeps its id as the title.
 */
export async function youtubeInsights(account: SocialAccount, startDate: string, endDate: string, titles: Map<string, { title: string; publishedAt: string }>): Promise<YouTubeInsights> {
  const token = await accessToken(account), auth = { headers: headers(token) };
  const report = (params: Record<string, string>) => request(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ids: `channel==${account.externalId}`, startDate, endDate, ...params })}`, auth, true) as Promise<Report>;
  // The API truncates a multi-metric report to the last day common to every requested metric.
  const [views, activity, top] = await Promise.all([
    report({ metrics: 'views', dimensions: 'day', sort: 'day' }),
    report({ metrics: activityMetrics, dimensions: 'day', sort: 'day' }).catch(() => ({})),
    report({ metrics: 'views,estimatedMinutesWatched,averageViewDuration,likes,shares', dimensions: 'video', sort: '-views', maxResults: '10' }).catch(() => ({})),
  ]);
  const viewRows = rowsOf(views), activityRows = rowsOf(activity);
  const activityThrough = activityRows.at(-1)?.day?.toString() ?? null;
  const totals = totalsOf(viewRows, activityRows);
  // YouTube rounds each daily watch-time row to minutes. Use Google's period total for the headline.
  if (activityThrough && totals.minutes != null) {
    const period = await report({ metrics: 'estimatedMinutesWatched', endDate: activityThrough }).catch(() => ({}));
    totals.minutes = metric(rowsOf(period)[0]?.estimatedMinutesWatched) ?? totals.minutes;
  }
  const dailyViews = new Map(viewRows.map((r) => [String(r.day), metric(r.views)]));
  const dailyMinutes = new Map(activityRows.map((r) => [String(r.day), metric(r.estimatedMinutesWatched)]));
  const dates = [...new Set([...dailyViews.keys(), ...dailyMinutes.keys()])].sort();
  return {
    channel: account.name, channelId: account.externalId, startDate, endDate,
    viewsThrough: viewRows.at(-1)?.day?.toString() ?? null,
    activityThrough,
    totals,
    daily: dates.map(date => ({ date, views: dailyViews.get(date) ?? null, minutes: dailyMinutes.get(date) ?? null })),
    videos: rowsOf(top).map((r) => {
      const id = String(r.video);
      const known = titles.get(id);
      return { id, title: known?.title ?? id, url: `https://www.youtube.com/watch?v=${id}`, publishedAt: known?.publishedAt ?? null, views: metric(r.views), minutes: metric(r.estimatedMinutesWatched), averageViewSeconds: metric(r.averageViewDuration), likes: metric(r.likes), shares: metric(r.shares) };
    }),
  };
}

/** Request ranked reports for the same dates as the channel's available view data. */
export async function youtubeBreakdowns(account: SocialAccount, startDate: string, endDate: string, period: YouTubeAnalyticsPeriod): Promise<YouTubeBreakdowns> {
  const token = await accessToken(account);
  const report = async (params: Record<string, string>) => {
    try {
      const query = new URLSearchParams({ ids: `channel==${account.externalId}`, startDate, endDate, ...params });
      return rowsOf(await request<Report>(`https://youtubeanalytics.googleapis.com/v2/reports?${query}`, { headers: headers(token) }, true));
    } catch {
      return null;
    }
  };
  const activity = async (dimension: string, params: Record<string, string> = {}): Promise<YouTubeBreakdownRow[] | null> =>
    (await report({ metrics: 'views,estimatedMinutesWatched', dimensions: dimension, sort: '-estimatedMinutesWatched', ...params }))?.map(row => ({
      key: String(row[dimension]), views: metric(row.views), minutes: metric(row.estimatedMinutesWatched),
    })) ?? null;
  const demographics = async (dimension: 'ageGroup' | 'gender') =>
    (await report({ metrics: 'viewerPercentage', dimensions: dimension }))?.flatMap(row => {
      const percentage = metric(row.viewerPercentage);
      return percentage == null ? [] : [{ key: String(row[dimension]), percentage }];
    }) ?? null;
  const previousStart = DateTime.fromISO(startDate, { zone: 'UTC' }).minus({ days: period }).toISODate()!;
  const previousEnd = DateTime.fromISO(endDate, { zone: 'UTC' }).minus({ days: period }).toISODate()!;
  const [devices, mobileSystems, traffic, countries, subscribed, age, gender, watch, previous, previousWatch] = await Promise.all([
    activity('deviceType'),
    activity('operatingSystem', { filters: 'deviceType==MOBILE' }),
    activity('insightTrafficSourceType', { sort: '-views' }),
    activity('country', { sort: '-views', maxResults: '12' }),
    activity('subscribedStatus'),
    demographics('ageGroup'),
    demographics('gender'),
    report({ metrics: 'averageViewDuration,averageViewPercentage' }),
    report({ startDate: previousStart, endDate: previousEnd, metrics: `views,${activityMetrics}`, dimensions: 'day', sort: 'day' }),
    report({ startDate: previousStart, endDate: previousEnd, metrics: 'estimatedMinutesWatched' }),
  ]);
  if ([devices, mobileSystems, traffic, countries, subscribed, age, gender, watch, previous].every(rows => rows === null))
    throw new Error('No YouTube Analytics breakdown succeeded.');
  const previousThrough = previous?.at(-1)?.day?.toString() ?? null;
  const previousTotals = previous && totalsOf(previous, previous);
  if (previousTotals && previousThrough === previousEnd)
    previousTotals.minutes = metric(previousWatch?.[0]?.estimatedMinutesWatched) ?? previousTotals.minutes;
  return {
    startDate, endDate, devices, mobileSystems, traffic, countries, subscribed, age, gender,
    averageViewSeconds: metric(watch?.[0]?.averageViewDuration),
    averageViewPercentage: metric(watch?.[0]?.averageViewPercentage),
    previous: previousTotals && { startDate: previousStart, endDate: previousEnd, availableThrough: previousThrough, totals: previousTotals },
  };
}
/**
 * Who watched the channel in the last 90 days: age and gender (percent of views) and the top countries (views).
 * YouTube reports viewers, not subscribers. Needs the yt-analytics.readonly consent; without it this returns null.
 */
async function youtubeDemographics(account:SocialAccount,auth:RequestInit):Promise<AudienceDemographics|null>{
 const day=(offset:number)=>new Date(Date.now()-offset*86_400_000).toISOString().slice(0,10);
 const report=(params:Record<string,string>)=>request(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ids:`channel==${account.externalId}`,startDate:day(90),endDate:day(1),...params})}`,auth,true) as Promise<Report>;
 const output:AudienceDemographics={basis:'viewers'};
 try{
  const rows=rowsOf(await report({metrics:'viewerPercentage',dimensions:'ageGroup,gender'}));
  const age=new Map<string,number>(),gender=new Map<string,number>();
  for(const r of rows){const share=metric(r.viewerPercentage)??0;const group=String(r.ageGroup).replace(/^age/,'');age.set(group,(age.get(group)??0)+share);gender.set(String(r.gender),(gender.get(String(r.gender))??0)+share);}
  const slices=(map:Map<string,number>):AudienceSlice[]=>[...map].map(([key,value])=>({key,value:Math.round(value*100)/100})).filter(s=>s.value>0);
  if(age.size){output.age=slices(age).sort((a,b)=>a.key.localeCompare(b.key));output.gender=slices(gender).sort((a,b)=>b.value-a.value);}
 }catch{/* Optional. */}
 try{
  const rows=rowsOf(await report({metrics:'views',dimensions:'country',sort:'-views',maxResults:'20'}));
  const countries=rows.map(r=>({key:String(r.country),value:metric(r.views)??0})).filter(s=>s.key&&s.value>0);
  if(countries.length)output.country=countries;
 }catch{/* Optional. */}
 return output.age||output.country?output:null;
}
export async function syncYouTube(account:SocialAccount):Promise<ConnectorResult> {
 const posts:ObservedPost[]=[];
 try {
  const token=await accessToken(account),auth={headers:headers(token)};
  const channel=await request(`${base}channels?part=id,snippet,contentDetails,statistics&mine=true`,auth,true);
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
  const subscribers=mine.statistics?.hiddenSubscriberCount?null:numberOrNull(mine.statistics?.subscriberCount);
  const demographics=await youtubeDemographics(account,auth);
  return {platform:'youtube',audience:[{platform:'youtube',accountId:account.externalId,accountName:mine.snippet.title,followers:subscribers,demographics}],status:'connected',message:`${mine.snippet.title}: ${posts.length} videos synchronized.`,posts,checkpoints:[{accountId:account.id,kind:'youtube_history',value:historyNext}]};
 }catch {return {platform:'youtube',status:'error',message:'YouTube synchronization failed. Check channel consent, API enablement and quota.',posts};}
}
