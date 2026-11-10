import express from 'express';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { db, defineSchema } from './db.js';
import { userCan } from './auth.js';
import { getSource, sourceRows } from './google/store.js';
import { PUBLISHING_HEADERS, parsePublishingRow, headersOf, rowObject } from './google/format.js';
import { GoogleClient, googleReference } from './google/client.js';
import { rowOutcome, syncGoogleSource } from './google/calendar-sync.js';
import { contentJobs } from './social/publishing.js';
import { listAccounts, cancelQueued } from './social/store.js';
import { getContent, reopenContent } from './workspace.js';
import { contentMedia, attachImage, resolveMedia } from './social/media.js';
import { attachVideoStream } from './social/video-upload.js';
import { CALENDAR_PLATFORMS, type CalendarPostInput } from '../src/domain/calendar-post.js';

defineSchema(`CREATE TABLE IF NOT EXISTS dashboard_calendar_posts (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, input_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);`);
const inputSchema = z.object({
  title: z.string().trim().min(1).max(200), caption: z.string().max(63206), date: z.string().max(10), time: z.string().max(5), timezone: z.string().max(100),
  mediaType: z.enum(['image', 'reel', 'video', 'carousel']), mediaSource: z.enum(['drive', 'upload']), design: z.string().max(2048), thumbnail: z.string().max(2048),
  mediaIds: z.array(z.string().uuid()).max(35), mediaOrder: z.partialRecord(z.enum(CALENDAR_PLATFORMS), z.array(z.string().uuid()).max(35)).optional(), platforms: z.array(z.enum(CALENDAR_PLATFORMS)).min(1).max(6),
  targets: z.partialRecord(z.enum(CALENDAR_PLATFORMS), z.string().max(200)), notes: z.string().max(5000),
  youtubePrivacy: z.string().max(30), youtubeCategory: z.string().max(10), madeForKids: z.enum(['', 'YES', 'NO']),
  tiktokPrivacy: z.string().max(60), aiGenerated: z.enum(['', 'YES', 'NO']), tiktokCommercial: z.string().max(10), snapTarget: z.string().max(20), snapLocale: z.string().max(10),
});
/**
 * Uploaded files as the snapshot's Design: `local:<ids>` in the main order, then `;<platform>=<i.j.k>` for each
 * platform with its own carousel order, as positions in that list (short enough for the 2,048-character cell).
 */
export function localDesign(input: CalendarPostInput): string {
  const own = input.mediaType === 'carousel' ? Object.entries(input.mediaOrder ?? {}).flatMap(([platform, ids]) => {
    if (!input.platforms.includes(platform as never) || !ids?.length) return [];
    const positions = ids.map((id) => input.mediaIds.indexOf(id)).filter((index) => index >= 0);
    const same = positions.length === input.mediaIds.length && positions.every((value, index) => value === index);
    return same || !positions.length ? [] : [`${platform}=${positions.join('.')}`];
  }) : [];
  return [`local:${input.mediaIds.join(',')}`, ...own.sort()].join(';');
}
export function nativeSnapshot(id: string, input: CalendarPostInput, enabled: boolean) {
  const row: Record<string, string> = { 'Post ID': id, Date: input.date, Time: input.time, Timezone: input.timezone,
    'Post Title': input.title, Caption: input.caption || (enabled ? '' : '—'), Design: input.mediaSource === 'upload' ? localDesign(input) : input.design || (enabled ? '' : 'pending'),
    Thumbnail: input.thumbnail, 'Media Type': input.mediaType, Platform: input.platforms.join(', '), Ready: enabled ? 'YES' : 'NO', Notes: input.notes,
    'YouTube Privacy': input.youtubePrivacy, 'YouTube Category': input.youtubeCategory, 'Made For Kids': input.madeForKids,
    'TikTok Privacy': input.tiktokPrivacy, 'AI Generated': input.aiGenerated, 'TikTok Commercial': input.tiktokCommercial, 'Snapchat Target': input.snapTarget, 'Snapchat Locale': input.snapLocale };
  return [PUBLISHING_HEADERS, PUBLISHING_HEADERS.map(h => row[h] || '')];
}
export function registerCalendarPostRoutes(app: express.Express) {
  app.use('/api/calendar-posts', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['connections.manage','content.create','content.edit_own','content.schedule','content.publish'].every(p => userCan(req.user!, p as never))) return res.status(403).json({ error: 'يلزم تفويض إنشاء المحتوى والجدولة والنشر وإدارة الربط.' });
    if (req.method !== 'GET' && req.header('origin')) {
      try { const origin = new URL(req.header('origin')!); if (origin.origin !== new URL(process.env.APP_URL || 'http://127.0.0.1:4100').origin && origin.host !== req.header('host')) return res.status(403).json({ error: 'Cross-origin request refused.' }); }
      catch { return res.status(403).end(); }
    }
    next();
  });
  const records = async (owner: string) => {
    const sources = await db.all('SELECT * FROM google_calendar_sources WHERE owner_id=? ORDER BY id', [owner]);
    const output = [];
    for (const source of sources) {
      const native = await db.get('SELECT input_json FROM dashboard_calendar_posts WHERE id=?', [source.id]);
      for (const row of await sourceRows(String(source.id))) {
        const item = await getContent(row.content_id); if (!item || ['archived', 'cancelled'].includes(item.status)) continue;
        const jobs = await contentJobs(item.id), outcome = await rowOutcome(row);
        const storedInput = native ? JSON.parse(String(native.input_json)) as CalendarPostInput : null;
        const attachments = await contentMedia(item.id);
        const localPreview = storedInput?.mediaSource === 'upload' ? attachments.find(m => m.type === 'image' && storedInput.mediaIds.includes(m.id))?.url : undefined;
        const fallbackType = attachments.some(m => m.type === 'video') ? (item.creative?.requestId === 'reel' ? 'reel' : 'video') : attachments.filter(m => !m.role).length > 1 ? 'carousel' : 'image';
        const fallback: CalendarPostInput = { title:item.title, caption:Object.values(item.captions)[0] || '', date:'', time:'', timezone:'Africa/Cairo', mediaType:fallbackType, mediaSource:'drive', design:'',thumbnail:'', mediaIds:[],platforms:item.channels.filter(c => CALENDAR_PLATFORMS.includes(c as never)) as CalendarPostInput['platforms'], targets:JSON.parse(String(source.targets_json)),notes:'',youtubePrivacy:'',youtubeCategory:'27',madeForKids:'',tiktokPrivacy:'',aiGenerated:'',tiktokCommercial:'',snapTarget:'story',snapLocale:'ar_SA' };
        output.push({ id: native ? source.id : row.content_id, contentId:item.id, version:source.revision,
          input:native ? JSON.parse(String(native.input_json)) : fallback, origin:native ? 'dashboard' : 'sheet', editable:Boolean(native && !jobs.length),
          status:outcome.status, errors:outcome.errors, urls:outcome.urls, preview:localPreview || item.creative?.imageUrl || null,scheduledAt:item.scheduledAt || item.plannedFor,
          jobs:jobs.map(j => ({provider:j.provider,state:j.state,url:j.url,error:j.error})) });
      }
    }
    return output;
  };
  app.get('/api/calendar-posts', async (req,res) => {
    const accounts=(await listAccounts()).filter(a=>a.status==='connected').map(a=>({id:a.id,provider:a.provider,name:a.name}));
    res.json({ posts:await records(req.user!.id),accounts });
  });
  app.get('/api/calendar-posts/import/:contentId', async (req,res) => {
    const mapping=await db.get('SELECT r.*,s.owner_id,s.spreadsheet_id,s.tab,s.targets_json FROM google_calendar_rows r JOIN google_calendar_sources s ON s.id=r.source_id WHERE r.content_id=? AND s.owner_id=?',[String(req.params.contentId),req.user!.id]);
    if(!mapping || String(mapping.spreadsheet_id).startsWith('native:'))return res.status(404).end();
    try {
      const source=await getSource(String(mapping.source_id));
      const values=source!.snapshot_json ? JSON.parse(source!.snapshot_json) : await new GoogleClient(req.user!.id).values(String(mapping.spreadsheet_id),String(mapping.tab));
      const h=headersOf(values), row=values.slice(1).find((r:unknown[])=>r[h.indexOf('post id')]===mapping.post_id);
      if(!row)throw new Error('الصف لم يعد موجودًا في المصدر.');
      const raw=rowObject(h,row), p=parsePublishingRow(raw), local=DateTime.fromISO(p.scheduledAt).setZone(p.timezone);
      res.json({title:p.title,caption:p.caption,date:local.toISODate(),time:local.toFormat('HH:mm'),timezone:p.timezone,mediaType:p.mediaType,mediaSource:'drive',design:p.design,thumbnail:p.thumbnail||'',mediaIds:[],platforms:p.channels.filter(c=>CALENDAR_PLATFORMS.includes(c as never)),targets:JSON.parse(String(mapping.targets_json)),notes:String(raw.notes||''),youtubePrivacy:p.youtubePrivacy||'',youtubeCategory:p.youtubeCategory||'27',madeForKids:p.madeForKids===undefined?'':p.madeForKids?'YES':'NO',tiktokPrivacy:p.tiktokPrivacy||'',aiGenerated:p.aiGenerated===undefined?'':p.aiGenerated?'YES':'NO',tiktokCommercial:p.tiktokCommercial||'',snapTarget:p.snapTarget||'story',snapLocale:p.snapLocale||'ar_SA'});
    }catch(e){res.status(409).json({error:e instanceof Error?e.message:'تعذّر نسخ المنشور.'});}
  });
  app.post('/api/calendar-posts/:id/duplicate', async (req,res) => {
    const source=await getSource(String(req.params.id));
    const stored=await db.get<{input_json:string}>('SELECT input_json FROM dashboard_calendar_posts WHERE id=?',[String(req.params.id)]);
    if(!source||source.owner_id!==req.user!.id||!stored)return res.status(404).end();
    try {
      const previous=(await sourceRows(source.id))[0], original=previous?await getContent(previous.content_id):undefined;
      if(!original)throw new Error('المنشور الأصلي غير موجود.');
      const input=JSON.parse(stored.input_json) as CalendarPostInput;
      const selected=input.mediaSource==='upload' ? await resolveMedia(original,input.mediaIds.map(id=>`/api/social/assets/${id}`)) : [];
      const at=DateTime.now().setZone(input.timezone).plus({days:1}).set({hour:10,minute:0,second:0,millisecond:0});
      const originalIds=input.mediaIds, originalOrder=input.mediaOrder;
      input.title=`${input.title.slice(0,190)} — نسخة`; input.date=at.toISODate()!;input.time=at.toFormat('HH:mm');input.mediaIds=[];input.mediaOrder=undefined;
      const id=randomUUID(),now=new Date().toISOString();
      await db.tx(async tx=>{
        await tx.run('INSERT INTO google_calendar_sources(id,spreadsheet_id,tab,owner_id,targets_json,enabled,snapshot_json) VALUES(?,?,?,?,?,?,?)',[id,`native:${id}`,'Calendar',req.user!.id,JSON.stringify(input.targets),0,JSON.stringify(nativeSnapshot(id,input,false))]);
        await tx.run('INSERT INTO dashboard_calendar_posts(id,owner_id,input_json,created_at,updated_at) VALUES(?,?,?,?,?)',[id,req.user!.id,JSON.stringify(input),now,now]);
      });
      await syncGoogleSource(id);
      const copy=(await sourceRows(id))[0];
      for(const asset of selected) {
        const media=asset.type==='image' ? await attachImage(copy.content_id,await readFile(asset.file)) : await attachVideoStream(copy.content_id,createReadStream(asset.file),asset.bytes);
        input.mediaIds.push(media.id);
      }
      // Each platform's carousel order carries over to the copied files.
      if(originalOrder) input.mediaOrder=Object.fromEntries(Object.entries(originalOrder).map(([platform,ids])=>[platform,(ids??[]).map(old=>input.mediaIds[originalIds.indexOf(old)]).filter(Boolean)]));
      await db.tx(async tx=>{
        await tx.run('UPDATE google_calendar_sources SET snapshot_json=? WHERE id=?',[JSON.stringify(nativeSnapshot(id,input,false)),id]);
        await tx.run('UPDATE dashboard_calendar_posts SET input_json=? WHERE id=?',[JSON.stringify(input),id]);
      });
      res.json({post:(await records(req.user!.id)).find(p=>p.id===id)});
    }catch(e){res.status(409).json({error:e instanceof Error?e.message:'تعذّر نسخ المنشور.'});}
  });
  const save: express.RequestHandler = async (req,res) => {
    const parsed=z.object({input:inputSchema,version:z.number().int().nonnegative().optional(),schedule:z.boolean(),consent:z.literal(true)}).safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'راجع عنوان المنشور والحقول المطلوبة.'});
    const {input,schedule}=parsed.data;
    const id=req.params.id ? String(req.params.id) : randomUUID(); let claimed=false;
    try {
      const existing=await getSource(id), native=await db.get('SELECT owner_id FROM dashboard_calendar_posts WHERE id=?',[id]);
      if(req.params.id && (!existing||!native||existing.owner_id!==req.user!.id))return res.status(404).end();
      const mapping=existing?(await sourceRows(id))[0]:undefined;
      if(mapping && (await contentJobs(mapping.content_id)).length)throw new Error('بدأ النشر بالفعل؛ يمكنك نسخ المنشور لإنشاء بوست جديد.');
      const snapshot=nativeSnapshot(id,input,schedule), row=parsePublishingRow(rowObject(headersOf(snapshot),snapshot[1]));
      if(schedule) {
        if(Date.parse(row.scheduledAt)<Date.now()+90_000)throw new Error('اختار موعدًا بعد دقيقتين على الأقل لتجهيز الميديا.');
        if(input.mediaSource==='drive')googleReference(input.design);
        if(input.thumbnail)googleReference(input.thumbnail);
        const accounts=await listAccounts();
        for(const platform of input.platforms)if(!accounts.some(a=>a.id===input.targets[platform]&&a.provider===platform&&a.status==='connected'))throw new Error(`اختار حساب نشر متصلًا لـ ${platform}.`);
      }
      if(input.mediaSource==='upload') {
        const attachments=mapping?await contentMedia(mapping.content_id):[];
        if(input.mediaIds.some(id=>!attachments.some(m=>m.id===id)))throw new Error('اختار ملفات مرفوعة على هذا المنشور فقط.');
        if(schedule && !input.mediaIds.length)throw new Error('ارفع الميديا قبل الجدولة.');
      }
      const now=new Date().toISOString();
      if(existing) {
        const changed=await db.run('UPDATE google_calendar_sources SET enabled=0,last_sync_at=NULL,lock_token=?,lock_until=?,revision=revision+1 WHERE id=? AND owner_id=? AND revision=? AND lock_until<?',['native-edit',Date.now()+120_000,id,req.user!.id,parsed.data.version,Date.now()]);
        if(!changed.changes)throw new Error('المنشور اتغيّر أو بيتم تجهيزه؛ حدّث القائمة وافتحه تاني.');
        claimed=true;
        if((await contentJobs(mapping!.content_id)).length || await db.get("SELECT id FROM social_publish_queue WHERE content_id=? AND state='sending' LIMIT 1",[mapping!.content_id])) throw new Error('بدأ تنفيذ النشر؛ لا يمكن تعديل الملفات الآن. راجع سجل النشر.');
        await cancelQueued(mapping!.content_id,'Calendar post edited.');
        const item=await getContent(mapping!.content_id);
        if(item && ['approved','scheduled'].includes(item.status))await reopenContent(req.user!,item.id,'تعديل من الكالندر');
      }
      await db.tx(async tx=>{
        if(existing) {
          const saved=await tx.run('UPDATE google_calendar_sources SET targets_json=?,enabled=?,snapshot_json=?,error=NULL,lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=? AND revision=?',[JSON.stringify(input.targets),Number(schedule),JSON.stringify(snapshot),id,'native-edit',existing.revision+1]);
          if(!saved.changes)throw new Error('اتغيّرت حالة المنشور أثناء الحفظ؛ حدّث القائمة وافتحه تاني.');
        }else await tx.run('INSERT INTO google_calendar_sources(id,spreadsheet_id,tab,owner_id,targets_json,enabled,snapshot_json) VALUES(?,?,?,?,?,?,?)',[id,`native:${id}`,'Calendar',req.user!.id,JSON.stringify(input.targets),Number(schedule),JSON.stringify(snapshot)]);
        await tx.run('INSERT INTO dashboard_calendar_posts(id,owner_id,input_json,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET input_json=excluded.input_json,updated_at=excluded.updated_at',[id,req.user!.id,JSON.stringify(input),now,now]);
      });
      claimed=false;
      const result=await syncGoogleSource(id);
      if(result.errors.length) {
        await db.run('UPDATE google_calendar_sources SET enabled=0,last_sync_at=NULL WHERE id=?',[id]);
        for(const r of await sourceRows(id)) {
          await cancelQueued(r.content_id,'Preparation needs attention; nothing was scheduled.');
          const item=await getContent(r.content_id);
          if(item&&['approved','scheduled'].includes(item.status)&&!(await contentJobs(item.id)).length)await reopenContent(req.user!,item.id,'تجهيز الكالندر يحتاج مراجعة؛ لم تبدأ الجدولة');
        }
      }
      res.json({post:(await records(req.user!.id)).find(p=>p.id===id),errors:result.errors});
    }catch(e){res.status(409).json({error:e instanceof Error?e.message:'تعذّر حفظ المنشور.'});}
    finally {if(claimed)await db.run('UPDATE google_calendar_sources SET lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?',[id,'native-edit']);}
  };
  app.post('/api/calendar-posts',save);
  app.put('/api/calendar-posts/:id',save);
  app.post('/api/calendar-posts/:id/pause',async(req,res)=>{
    const s=await getSource(String(req.params.id));
    if(!s||s.owner_id!==req.user!.id||!s.spreadsheet_id.startsWith('native:'))return res.status(404).end();
    await db.run('UPDATE google_calendar_sources SET enabled=0,last_sync_at=NULL,revision=revision+1 WHERE id=?',[s.id]);
    for(const r of await sourceRows(s.id)) {
      await cancelQueued(r.content_id,'Paused from the calendar.');
      if(!(await contentJobs(r.content_id)).length) {
        const item=await getContent(r.content_id);if(item&&['scheduled','approved'].includes(item.status))await reopenContent(req.user!,item.id,'إيقاف الجدولة من الكالندر');
        await db.run("UPDATE google_calendar_rows SET status='draft',fingerprint='',error='' WHERE source_id=?",[s.id]);
      }
    }
    res.json({paused:true});
  });
}
