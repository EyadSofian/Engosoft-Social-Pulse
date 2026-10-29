import { readSheet } from 'read-excel-file/node';
import { parse as parseCsv } from 'csv-parse/sync';
import { DateTime } from 'luxon';
import { goalFromText } from '../src/domain/goals.js';
import { importKey, isPlanPlatform, newPlan } from './domain.js';
import type { Plan, PlanPlatform } from './types.js';

const aliases:Record<string,string>={
 'date':'date','publish date':'date','التاريخ':'date','تاريخ النشر':'date',
 'time':'time','publish time':'time','الوقت':'time','وقت النشر':'time',
 'platform':'platform','المنصة':'platform',
 'account id':'accountId','account':'accountId','الحساب':'accountId','معرف الحساب':'accountId',
 'post title':'title','title':'title','عنوان البوست':'title','عنوان المنشور':'title','العنوان':'title',
 'caption':'caption','copy':'caption','نص البوست':'caption','نص المنشور':'caption','النص':'caption',
 'content type':'contentType','نوع المحتوى':'contentType',
 'goal':'goal','objective':'goal','الهدف':'goal','هدف المنشور':'goal',
 'campaign':'campaign','الحملة':'campaign',
 'owner':'owner','المسؤول':'owner',
 'status':'status','الحالة':'status',
 'published url':'permalink','post url':'permalink','رابط المنشور':'permalink',
 'external post id':'externalId','post id':'externalId','معرف المنشور':'externalId',
 'notes':'notes','ملاحظات':'notes'
};
/** Platform names as people write them in Arabic or English, mapped to the platform key. */
const platformAliases:Record<string,string>={
 'فيسبوك':'facebook','فيس بوك':'facebook','فيس':'facebook','fb':'facebook',
 'انستجرام':'instagram','إنستجرام':'instagram','انستقرام':'instagram','إنستقرام':'instagram','انستا':'instagram','ig':'instagram',
 'تيك توك':'tiktok','تيكتوك':'tiktok','tik tok':'tiktok',
 'سناب':'snapchat','سناب شات':'snapchat','سنابشات':'snapchat',
 'يوتيوب':'youtube','yt':'youtube',
 'لينكدإن':'linkedin','لينكد إن':'linkedin','لينكدان':'linkedin','لينكدن':'linkedin',
 'تويتر':'x','اكس':'x','إكس':'x','twitter':'x','x (twitter)':'x',
 'الموقع':'website','موقع':'website','web':'website','site':'website'
};
const norm=(x:unknown)=>String(x??'').trim();
function dateCell(v:unknown):string {
 if(v instanceof Date)return `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,'0')}-${String(v.getUTCDate()).padStart(2,'0')}`;
 const s=norm(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)){const [a,b,y]=s.split('/');return `${y}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;}
 return s;
}
function timeCell(v:unknown):string {
 if(v instanceof Date)return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`;
 if(typeof v==='number' && v>=0 && v<1){const m=Math.round(v*1440);return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
 const s=norm(v);return /^\d{1,2}:\d{2}$/.test(s)?s.padStart(5,'0'):s;
}
function toRows(records:unknown[][]):{plans:Plan[];errors:string[]}{
 const headers=(records[0]||[]).map(v=>aliases[norm(v).toLowerCase()]||norm(v));
 const required=['date','time','platform','title'];const missing=required.filter(x=>!headers.includes(x));
 if(missing.length)return {plans:[],errors:[`الأعمدة المطلوبة ناقصة: ${missing.join(', ')}`]};
 const plans:Plan[]=[];const errors:string[]=[];
 for(let i=1;i<records.length;i++){
   const values=records[i];if(!values||values.every(v=>!norm(v)))continue;
   const row=Object.fromEntries(headers.map((h,j)=>[h,values[j]]));
   const date=dateCell(row.date),time=timeCell(row.time),title=norm(row.title);
   const zone=process.env.BUSINESS_TIME_ZONE||'Africa/Cairo';
   const dt=DateTime.fromISO(`${date}T${time}`,{zone});
   const platformValues=norm(row.platform).split(/[,،/]/).map(s=>s.trim().toLowerCase()).filter(Boolean).map(p=>platformAliases[p]??p);
   // Name the cell that is wrong, so the row can be fixed in the sheet without guessing.
   const unknown=platformValues.filter(p=>!isPlanPlatform(p));
   const problem=!DateTime.fromISO(date).isValid?`التاريخ «${norm(row.date)}» (اكتبه 2026-11-03)`
     :!dt.isValid?`الوقت «${norm(row.time)}» (اكتبه 19:00)`
     :!title?'العنوان فاضي'
     :!platformValues.length?'المنصة فاضية'
     :unknown.length?`المنصة «${unknown.join('، ')}» غير معروفة`:'';
   if(problem){errors.push(`صف ${i+1}: ${problem}.`);continue;}
   // A row without a status is a plan: a day and a topic that nobody has designed yet.
   const status=norm(row.status).toLowerCase()||'draft';
   if(!['draft','approved','scheduled','published','cancelled'].includes(status)){errors.push(`صف ${i+1}: حالة غير معروفة.`);continue;}
   if(status==='published' && !norm(row.permalink) && !norm(row.externalId)){errors.push(`صف ${i+1}: المنشور المنشور يحتاج رابطًا أو معرّفًا للتأكيد.`);continue;}
   for(const platform of platformValues as PlanPlatform[]){
     const plan=newPlan({platform,accountId:norm(row.accountId),title,caption:norm(row.caption),scheduledAt:dt.toUTC().toISO()||'',status:status as Plan['status'],permalink:norm(row.permalink),externalId:norm(row.externalId),owner:norm(row.owner),contentType:norm(row.contentType)||'post',goal:goalFromText(norm(row.goal))??'',campaign:norm(row.campaign),notes:norm(row.notes)});
     plan.sourceKey=importKey(plan);plans.push(plan);
   }
 }
 return {plans,errors};
}
export async function parseCalendar(buffer:Buffer,filename:string):Promise<{plans:Plan[];errors:string[]}>{
 if(filename.toLowerCase().endsWith('.csv'))return toRows(parseCsv(buffer.toString('utf8').replace(/^\uFEFF/,''),{skip_empty_lines:true,relax_quotes:true}) as unknown[][]);
 if(filename.toLowerCase().endsWith('.xlsx')){
   // The template's sheet is "Calendar"; a workbook without it is read from its first sheet.
   const rows=await readSheet(buffer,'Calendar').catch(()=>readSheet(buffer,1));
   return toRows(rows as unknown[][]);
 }
 return {plans:[],errors:['ارفع ملف CSV أو XLSX.']};
}
