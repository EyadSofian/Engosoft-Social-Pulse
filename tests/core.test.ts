import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCalendar } from '../server/calendar.js';
import { applyPlanPatch, matchingPost, missingPublishProof, newPlan, planState, engagementRate } from '../server/domain.js';
import { blankMetrics, type ObservedPost } from '../server/types.js';

test('late planned post stays unconfirmed until exact post URL or ID matches',()=>{
 const plan=newPlan({platform:'facebook',title:'October launch',scheduledAt:'2026-10-04T09:00:00.000Z',permalink:'https://www.facebook.com/engosoft/posts/123?utm_source=calendar'});
 const now=new Date('2026-10-04T09:20:00.000Z');
 assert.equal(planState(plan,[],now),'missed');
 const unrelated:ObservedPost={platform:'facebook',accountId:'',accountName:'Engosoft',externalId:'999',permalink:'https://www.facebook.com/engosoft/posts/999',title:plan.title,publishedAt:'2026-10-04T09:05:00.000Z',contentType:'post',thumbnail:'',metrics:blankMetrics()};
 assert.equal(planState(plan,[unrelated],now),'missed');
 const actual={...unrelated,permalink:'https://facebook.com/engosoft/posts/123'};
 assert.equal(matchingPost(plan,[actual])?.externalId,'999');
 assert.equal(planState(plan,[actual],now),'published');
});

test('missing metric is not turned into zero engagement rate',()=>{
 const post:ObservedPost={platform:'instagram',accountId:'1',accountName:'',externalId:'1',permalink:'',title:'',publishedAt:'2026-10-01T00:00:00.000Z',contentType:'reel',thumbnail:'',metrics:blankMetrics()};
 assert.equal(engagementRate(post),null);
 post.metrics.views=200;
 assert.equal(engagementRate(post),null);
 post.metrics.reach=200;post.metrics.likes=10;post.metrics.comments=2;
 assert.equal(engagementRate(post),6);
});

test('CSV calendar parses Cairo time and multiple platforms',async()=>{
 const csv='Date,Time,Platform,Account ID,Post Title,Caption,Content Type,Campaign,Owner,Status,Published URL,External Post ID,Notes\n2026-10-06,14:30,"facebook,instagram",,دفعة أكتوبر,,,,,scheduled,,,\n';
 const parsed=await parseCalendar(Buffer.from(csv),'calendar.csv');
 assert.equal(parsed.errors.length,0);
 assert.equal(parsed.plans.length,2);
 assert.equal(parsed.plans[0].scheduledAt,'2026-10-06T11:30:00.000Z');
});

test('downloadable XLSX template has a parser-compatible Calendar sheet',async()=>{
 const path=new URL('../public/calendar-template.xlsx',import.meta.url);
 const parsed=await parseCalendar(await readFile(path),'calendar.xlsx');
 assert.equal(parsed.plans.length,0);
 assert.equal(parsed.errors.length,0);
});

test('calendar move keeps every other plan field and publishing still needs proof',()=>{
 const plan=newPlan({platform:'instagram',title:'Reel',caption:'Copy',owner:'Sara',campaign:'October',scheduledAt:'2026-10-06T11:30:00.000Z',status:'approved'});
 const moved=applyPlanPatch(plan,{scheduledAt:'2026-10-08T15:00:00.000Z'},new Date('2026-10-05T10:00:00.000Z'));
 assert.equal(moved.scheduledAt,'2026-10-08T15:00:00.000Z');
 assert.deepEqual({...moved,scheduledAt:plan.scheduledAt,updatedAt:plan.updatedAt},plan);
 assert.equal(moved.updatedAt,'2026-10-05T10:00:00.000Z');
 assert.equal(applyPlanPatch(plan,{scheduledAt:undefined}).scheduledAt,plan.scheduledAt);
 assert.equal(missingPublishProof(applyPlanPatch(plan,{status:'published'})),true);
 assert.equal(missingPublishProof(applyPlanPatch(plan,{status:'published',externalId:'1789'})),false);
});
