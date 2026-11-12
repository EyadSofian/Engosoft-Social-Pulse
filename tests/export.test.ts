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

test('a workbook with pictures holds one drawing per sheet and places each picture in its own cell',async()=>{
 const { workbook } = await import('../src/lib/export/xlsx.js');
 const sharp = (await import('sharp')).default;
 const jpeg = new Uint8Array(await sharp({create:{width:120,height:200,channels:3,background:'#0046ff'}}).jpeg().toBuffer());
 const blob = workbook([
  {name:'Summary',columns:[{header:'A'}],rows:[[1]]},
  {name:'Posts',title:'Posts',subtitle:'scope',columns:[{header:'Image',width:16},{header:'Post',width:40}],rows:[[null,'first'],['No image','second'],[null,'third']],rowHeight:84,images:[{row:0,column:0,data:jpeg,width:120,height:200},{row:2,column:0,data:jpeg,width:120,height:200}]},
 ]);
 const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
 assert.match(text,/<Default Extension="jpeg" ContentType="image\/jpeg"\/>/);
 assert.match(text,/PartName="\/xl\/drawings\/drawing1\.xml"/);
 assert.ok(text.includes('xl/worksheets/_rels/sheet2.xml.rels'));
 assert.ok(!text.includes('xl/worksheets/_rels/sheet1.xml.rels'));
 assert.ok(text.includes('xl/media/image2.jpeg'));
 // Title, subtitle, blank and header rows come first, so data row 0 is sheet row index 4.
 assert.match(text,/<xdr:from><xdr:col>0<\/xdr:col><xdr:colOff>\d+<\/xdr:colOff><xdr:row>4<\/xdr:row>/);
 assert.match(text,/<xdr:from><xdr:col>0<\/xdr:col><xdr:colOff>\d+<\/xdr:colOff><xdr:row>6<\/xdr:row>/);
 assert.match(text,/<row r="5" ht="84" customHeight="1">/);
 if (process.env.XLSX_OUT) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.XLSX_OUT, new Uint8Array(await blob.arrayBuffer())); }
});

test('a post picture is fetched only over https and comes back as a small JPEG',async()=>{
 const { fetchThumbnail } = await import('../server/post-thumbnails.js');
 const sharp = (await import('sharp')).default;
 const png = await sharp({create:{width:1600,height:1600,channels:4,background:{r:0,g:70,b:255,alpha:0.5}}}).png().toBuffer();
 const asked:string[] = [];
 const fetcher = (async (url: URL) => { asked.push(String(url)); return new Response(new Uint8Array(png),{headers:{'content-type':'image/png'}}); }) as unknown as typeof fetch;
 assert.equal(await fetchThumbnail('http://cdn.example.com/a.png',fetcher),undefined);
 assert.equal(await fetchThumbnail('file:///etc/passwd',fetcher),undefined);
 assert.equal(await fetchThumbnail('not a url',fetcher),undefined);
 assert.deepEqual(asked,[]);
 const image = await fetchThumbnail('https://cdn.example.com/a.png',fetcher);
 assert.ok(image);
 const meta = await sharp(image).metadata();
 assert.equal(meta.format,'jpeg');
 assert.equal(meta.width,480);
 const broken = (async () => new Response('nope',{status:403})) as unknown as typeof fetch;
 assert.equal(await fetchThumbnail('https://cdn.example.com/expired.jpg',broken),undefined);
});
