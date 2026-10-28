import { createHash, randomUUID } from 'node:crypto';
import type { ObservedPost, Plan, Platform } from './types.js';

export const platforms: Platform[]=['facebook','instagram','tiktok','snapchat','youtube','website'];
export const isPlatform=(s:string):s is Platform=>platforms.includes(s as Platform);
export function canonicalUrl(value:string):string {
  try { const u=new URL(value); return `${u.hostname.replace(/^www\./,'').toLowerCase()}${u.pathname.replace(/\/$/,'')}`; } catch { return ''; }
}
export function matchingPost(plan:Plan, posts:ObservedPost[]):ObservedPost|undefined {
  const url=canonicalUrl(plan.permalink);
  return posts.find(p=>p.platform===plan.platform &&
    (plan.externalId && p.externalId===plan.externalId || url && canonicalUrl(p.permalink)===url) &&
    (!plan.accountId || !p.accountId || plan.accountId===p.accountId));
}
export function planState(plan:Plan, posts:ObservedPost[], now=new Date(), graceMinutes=15):'published'|'upcoming'|'due'|'missed'|'draft'|'cancelled' {
  if (plan.status==='cancelled') return 'cancelled';
  if (matchingPost(plan,posts) || plan.status==='published') return 'published';
  if (plan.status==='draft') return 'draft';
  const due=new Date(plan.scheduledAt).getTime();
  if (now.getTime()<due) return 'upcoming';
  return now.getTime()<due+graceMinutes*60_000?'due':'missed';
}
export function newPlan(raw:Partial<Plan>):Plan {
 const now=new Date().toISOString();
 return {id:raw.id||randomUUID(),platform:raw.platform||'facebook',accountId:raw.accountId||'',title:raw.title||'',caption:raw.caption||'',scheduledAt:raw.scheduledAt||now,status:raw.status||'scheduled',permalink:raw.permalink||'',externalId:raw.externalId||'',owner:raw.owner||'',contentType:raw.contentType||'post',campaign:raw.campaign||'',notes:raw.notes||'',sourceKey:raw.sourceKey||'',createdAt:raw.createdAt||now,updatedAt:now};
}
export type PlanPatch=Partial<Pick<Plan,'scheduledAt'|'status'|'permalink'|'externalId'>>;
/** Calendar moves and status changes touch a few fields; everything else is kept from the stored plan. */
export function applyPlanPatch(plan:Plan,patch:PlanPatch,now=new Date()):Plan {
 return {...plan,...Object.fromEntries(Object.entries(patch).filter(([,value])=>value!==undefined)),updatedAt:now.toISOString()};
}
export const missingPublishProof=(plan:Pick<Plan,'status'|'permalink'|'externalId'>)=>plan.status==='published'&&!plan.permalink.trim()&&!plan.externalId.trim();
export function importKey(row:Partial<Plan>):string {
 return createHash('sha256').update([row.platform,row.accountId,row.scheduledAt,row.title].join('|').toLowerCase()).digest('hex');
}
export function engagementRate(post:ObservedPost):number|null {
 const denom=post.metrics.reach ?? post.metrics.views ?? post.metrics.impressions;
 const actions=[post.metrics.likes,post.metrics.comments,post.metrics.shares,post.metrics.saves];
 if(post.metrics.engagement==null && actions.every(value=>value==null))return null;
 const numerator=post.metrics.engagement ?? actions.reduce<number>((s,v)=>s+(v??0),0);
 return denom && denom>0 ? +(numerator/denom*100).toFixed(2) : null;
}
