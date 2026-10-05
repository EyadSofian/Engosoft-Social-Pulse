import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar } from '../server/calendar.js';
import { plansToCsv, plansToIcs } from '../src/lib/calendarExport.js';
import { dayNumber, dayKeyOf, parseTimestamp } from '../src/lib/format.js';
import type { Plan } from '../src/types.js';

const plan = (over: Partial<Plan>): Plan => {
 const scheduledAt = over.scheduledAt ?? '2026-10-06T11:30:00.000Z';
 const ts = parseTimestamp(scheduledAt);
 return {id:'7b0f3f8e-4a3b-4c55-9a0e-1f2d3c4b5a69',platform:'instagram',accountId:'',title:'ريل: 5 أخطاء في ETABS',caption:'سطر أول, مع فاصلة\nو"اقتباس" #هندسة',scheduledAt,status:'scheduled',permalink:'',externalId:'',owner:'سارة',contentType:'reel',campaign:'BIM Week',notes:'',computedState:'upcoming',ts,dayNum:dayNumber(ts),day:dayKeyOf(dayNumber(ts)),...over};
};

test('exported CSV re-imports through the calendar parser with the same Cairo time and fields',async()=>{
 const source=[plan({}),plan({id:'0c7a5e43-2b1d-4f8a-9c6e-3d2b1a0f9e87',platform:'facebook',title:'Webinar: BIM',scheduledAt:'2026-10-07T17:00:00.000Z',status:'published',externalId:'123_456',caption:''})];
 const parsed=await parseCalendar(Buffer.from(plansToCsv(source)),'calendar.csv');
 assert.deepEqual(parsed.errors,[]);
 assert.equal(parsed.plans.length,2);
 const [first,second]=parsed.plans;
 assert.equal(first.scheduledAt,'2026-10-06T11:30:00.000Z');
 assert.equal(first.caption,source[0].caption);
 assert.equal(first.owner,'سارة');
 assert.equal(first.campaign,'BIM Week');
 assert.equal(first.contentType,'reel');
 assert.equal(second.status,'published');
 assert.equal(second.externalId,'123_456');
});

test('ICS export escapes text and folds long Arabic lines without splitting characters',()=>{
 const ics=plansToIcs([plan({title:'عنوان طويل جدًا '.repeat(8)})],Date.parse('2026-10-05T10:00:00.000Z'));
 assert.match(ics,/^BEGIN:VCALENDAR\r\n/);
 assert.match(ics,/DTSTART:20261006T113000Z\r\n/);
 assert.match(ics,/DESCRIPTION:سطر أول\\, مع فاصلة\\nو"اقتباس" #هندسة/);
 for(const line of ics.split('\r\n'))assert.ok(new TextEncoder().encode(line).length<=75,line);
 assert.ok(!ics.includes('�'));
});
