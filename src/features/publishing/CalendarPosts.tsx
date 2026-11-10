import { useCallback, useEffect, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, Cloud, Copy, ExternalLink, Film, Image as ImageIcon, LayoutList, Link2, Pause, Plus, RefreshCw, Search, Send, Upload, X } from 'lucide-react';
import { CALENDAR_PLATFORMS, type CalendarPlatform, type CalendarPostInput, type CalendarPostRecord } from '../../domain/calendar-post';
import { api } from '../../lib/api';
import { businessZone } from '../../lib/format';
import { useI18n } from '../../i18n/I18nProvider';
import { Link, useQueryState } from '../../app/router/router';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/overlay/Overlay';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { useToast } from '../../components/feedback/Toast';
import { platformOf, suggestedTime } from './publishing';
import { uploadVideo } from '../reels/upload';
import { CarouselTray } from './CarouselTray';

type Account = { id:string;provider:string;name:string };
interface Board { posts:CalendarPostRecord[];accounts:Account[] }
const STATUS:Record<string,[string,string]>={draft:['Draft','مسودة'],scheduled:['Scheduled','مجدول'],publishing:['Publishing','جارٍ النشر'],published:['Published','منشور'],partial:['Partially published','نُشر جزئيًا'],blocked:['Needs attention','يحتاج مراجعة'],failed:['Failed','تعذّر النشر']};
const statusLabel=(value:string,t:(en:string,ar:string)=>string)=>t(...(STATUS[value]||[value,value]));
function blank(day?:string):CalendarPostInput {
  const at=DateTime.fromISO(suggestedTime(day)).setZone(businessZone());
  return {title:'',caption:'',date:at.toISODate()!,time:at.toFormat('HH:mm'),timezone:businessZone(),mediaType:'image',mediaSource:'drive',design:'',thumbnail:'',mediaIds:[],platforms:[],targets:{},notes:'',youtubePrivacy:'',youtubeCategory:'27',madeForKids:'',tiktokPrivacy:'',aiGenerated:'',tiktokCommercial:'',snapTarget:'story',snapLocale:'ar_SA'};
}
export type CalendarBoard = Board;
/** Everything the calendar-post routes require; managers and admins hold all of them. */
export const CALENDAR_POST_PERMISSIONS = ['connections.manage','content.create','content.edit_own','content.schedule','content.publish'] as const;

/**
 * The signed-in manager's calendar posts (dashboard and Google Sheets), refreshed every 30 seconds. A failed refresh
 * shows its error until the next one succeeds; before, the first error stayed on screen after the server came back.
 */
export function useCalendarBoard() {
  const {can}=useAuth();
  const allowed=CALENDAR_POST_PERMISSIONS.every(p=>can(p));
  const [board,setBoard]=useState<Board|null>(null),[error,setError]=useState('');
  const reload=useCallback(async()=>{
    try { setBoard(await api<Board>('/api/calendar-posts')); setError(''); }
    catch(e) { setError(e instanceof Error?e.message:String(e)); }
  },[]);
  useEffect(()=>{if(!allowed)return;void reload();const timer=setInterval(()=>void reload(),30000);return()=>clearInterval(timer);},[allowed,reload]);
  return {allowed,board,error,reload};
}

/** Opens the post editor from the address: `?calendarPost=new` (with `postDay` or `copyFrom`) or `?calendarPost=<id>`. */
export function CalendarPostHost({board,onChange}:{board:Board|null;onChange:()=>void}) {
  const {t}=useI18n();
  const [query,setQuery]=useQueryState(),[seed,setSeed]=useState<CalendarPostInput|null>(null);
  const open=query.get('calendarPost'),copyFrom=query.get('copyFrom');
  useEffect(()=>{
    setSeed(null);
    if(open!=='new'||!copyFrom)return;
    let alive=true;
    void api<CalendarPostInput>(`/api/calendar-posts/import/${copyFrom}`).then(input=>{
      if(!alive)return;
      const when=blank();
      setSeed({...input,title:`${input.title} — ${t('copy','نسخة')}`,date:when.date,time:when.time,mediaSource:'drive',mediaIds:[],mediaOrder:undefined,...(input.mediaSource==='upload'?{design:''}:{})});
    }).catch(()=>{});
    return()=>{alive=false;};
  },[open,copyFrom]);
  const editing=board?.posts.find(p=>p.id===open);
  if(!open||(open!=='new'&&!editing)||(open==='new'&&copyFrom&&!seed))return null;
  return <CalendarPostEditor key={`${open}-${seed?'copy':'blank'}`} initial={open==='new'?seed||blank(query.get('postDay')||undefined):editing!.input} record={editing} accounts={board?.accounts||[]}
    onClose={()=>{setSeed(null);setQuery({calendarPost:null,postDay:null,copyFrom:null});}} onSaved={onChange}/>;
}

/** A new draft from a post: dashboard posts copy their files on the server; sheet rows open prefilled in the editor. */
export async function duplicateCalendarPost(post:CalendarPostRecord,open:(patch:Record<string,string|null>)=>void) {
  if(post.origin==='dashboard') {
    const result=await api<{post:CalendarPostRecord}>(`/api/calendar-posts/${post.id}/duplicate`,{body:{}});
    open({calendarPost:result.post.id,copyFrom:null});
  } else open({calendarPost:'new',copyFrom:post.contentId});
}
/** Stops a scheduled post: its waiting publications are cancelled; anything already sent stays sent. */
export const pauseCalendarPost=(post:CalendarPostRecord)=>api(`/api/calendar-posts/${post.id}/pause`,{body:{}});
export {statusLabel as calendarStatusLabel};

function CalendarPostEditor({initial,record,accounts,onClose,onSaved}:{initial:CalendarPostInput;record?:CalendarPostRecord;accounts:Account[];onClose:()=>void;onSaved:()=>void}) {
  const {t,date}=useI18n(),toast=useToast();
  const [input,setInput]=useState<CalendarPostInput>(structuredClone(initial)),[saved,setSaved]=useState(record),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState<number|null>(null),[files,setFiles]=useState<{id:string;url:string;type:string}[]>([]),[preview,setPreview]=useState(record?.preview||'');
  const [creator,setCreator]=useState<{privacy_level_options?:string[]}|null>(null),[creatorError,setCreatorError]=useState('');
  const inputRef=useRef(input);inputRef.current=input;
  const set=(patch:Partial<CalendarPostInput>)=>setInput(current=>({...current,...patch}));
  const fileRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(saved?.contentId)void api<{media:{id:string;url:string;type:string}[]}>(`/api/social/content/${saved.contentId}`).then(r=>setFiles(r.media)).catch(()=>{});},[saved?.contentId]);
  const isVideo=['reel','video'].includes(input.mediaType);
  const tiktokSelected=input.platforms.includes('tiktok'),tiktokAccount=input.targets.tiktok;
  useEffect(()=>{
    let alive=true;setCreator(null);setCreatorError('');
    if(tiktokSelected&&tiktokAccount)void api<{privacy_level_options?:string[]}>(`/api/social/accounts/${encodeURIComponent(tiktokAccount)}/creator?mediaType=${isVideo?'video':'photo'}`).then(value=>{if(alive)setCreator(value);}).catch(e=>{if(alive)setCreatorError(e.message);});
    return()=>{alive=false;};
  },[tiktokSelected,tiktokAccount,isVideo]);
  const currentDate=DateTime.fromISO(`${input.date}T${input.time}`,{zone:input.timezone});
  const checks=[{label:t('Caption & title','العنوان والنص'),ok:Boolean(input.title.trim()&&input.caption.trim())},{label:t('Media','الميديا'),ok:input.mediaSource==='drive'?Boolean(input.design.trim()):input.mediaIds.length>0},{label:t('Accounts','حسابات النشر'),ok:input.platforms.length>0&&input.platforms.every(p=>input.targets[p])},{label:t('Future date','ميعاد مستقبلي'),ok:currentDate.isValid&&currentDate.toMillis()>Date.now()+90000}];
  const toggle=(p:CalendarPlatform)=>{
    const chosen=input.platforms.includes(p),choices=accounts.filter(a=>a.provider===p),targets={...input.targets};
    if(!chosen&&!targets[p]&&choices.length===1)targets[p]=choices[0].id;
    set({platforms:chosen?input.platforms.filter(x=>x!==p):[...input.platforms,p],targets});
  };
  const persist=async(schedule:boolean,value=inputRef.current)=>{
    const result=await api<{post:CalendarPostRecord;errors:string[]}>(saved?`/api/calendar-posts/${saved.id}`:'/api/calendar-posts',{method:saved?'PUT':'POST',body:{input:value,schedule,version:saved?.version,consent:true}});
    if(result.post)setSaved(result.post);
    onSaved();
    if(result.errors.length)throw new Error(result.errors.map(e=>e.replace(/^[^:]+:\s*/, '')).join('\n'));
    return result.post;
  };
  const submit=async(schedule:boolean)=>{
    setError('');
    if(schedule) {
      if(!checks.every(c=>c.ok)){setError(t('Complete the content, media, accounts and a future date.','كمّل النص والميديا وحسابات النشر واختار ميعاد بعد دقيقتين على الأقل.'));return;}
      if(input.platforms.includes('tiktok')&&(!input.tiktokPrivacy||!input.aiGenerated||!input.tiktokCommercial)){setError(t('Complete the TikTok settings below.','كمّل خصوصية TikTok واختيار الذكاء الاصطناعي والإفصاح التجاري تحت.'));return;}
      if(tiktokSelected&&(!creator||!creator.privacy_level_options?.includes(input.tiktokPrivacy))){setError(creatorError||t('Wait for TikTok account settings and choose an available privacy option.','استنى تحميل إعدادات حساب TikTok، واختار خصوصية متاحة للحساب.'));return;}
      if(input.platforms.includes('youtube')&&(!input.youtubePrivacy||!input.madeForKids)){setError(t('Choose YouTube visibility and audience.','اختار خصوصية يوتيوب والجمهور المستهدف.'));return;}
    }
    setBusy(true);try {await persist(schedule);toast.success(schedule?t('Post scheduled','اتجدول المنشور'):t('Draft saved','اتحفظت المسودة'));onClose();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const upload=async(picked:File[])=>{
    if(!picked.length)return;
    setBusy(true);setError('');
    try {
      if(!input.title.trim()||!input.platforms.length)throw new Error(t('Add a title and choose at least one platform first.','اكتب عنوان واختار منصة واحدة على الأقل قبل رفع الملفات.'));
      const post=await persist(false),added:{id:string;url:string;type:string}[]=[];
      for(const file of picked) {
        let media:{id:string;url:string;type:string};
        if(file.type==='video/mp4'){const video=await uploadVideo(post.contentId,file,setProgress);media={...video,type:'video'};}
        else {
          const response=await fetch(`/api/social/content/${post.contentId}/image`,{method:'POST',headers:{'Content-Type':file.type},body:file}),data=await response.json();if(!response.ok)throw new Error(data.error||t('Upload failed','تعذّر رفع الصورة'));media=data;
        }
        added.push(media);
      }
      setFiles(current=>[...current,...added]);set({mediaIds:input.mediaType==='carousel'?[...input.mediaIds,...added.map(m=>m.id)]:[added[0].id]});setPreview(added.find(m=>m.type==='image')?.url||'');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);setProgress(null);if(fileRef.current)fileRef.current.value='';}
  };
  const selectedFiles=input.mediaIds.map(id=>files.find(f=>f.id===id)).filter((f):f is {id:string;url:string;type:string}=>Boolean(f));
  const previewImage=selectedFiles.find(f=>f.type==='image')?.url||preview;
  return <Drawer open onClose={()=>{if(!busy)onClose();}} title={record?t('Edit calendar post','تعديل منشور الكالندر'):t('New calendar post','منشور جديد في الكالندر')} label="Calendar post" subtitle={t('Create once. Publish to your chosen platforms.','جهّز البوست مرة واحدة، وجدوله على المنصات اللي تختارها.')} width="xl" footer={<div className="cp-editor__footer"><span><i className="cp-dot"/>{t('Saved only when you choose an action','الحفظ والجدولة باختيارك')} {saved&&<small dir="ltr">{saved.id.slice(0,8)}</small>}</span><Button disabled={busy} onClick={()=>void submit(false)}>{t('Save draft','حفظ مسودة')}</Button><Button variant="primary" icon={<CalendarClock size={16}/>} busy={busy} onClick={()=>void submit(true)}>{t('Schedule post','جدولة المنشور')}</Button></div>}>
    <div className="cp-editor" aria-busy={busy}><fieldset className="cp-editor__form" disabled={busy}>
      <section className="cp-section"><div className="cp-section__title"><span>01</span><h3>{t('The content','المحتوى')}</h3><small>{t('Your post, in your words','بوستك، بصوتك')}</small></div>
        <label className="ui-field"><span className="ui-field__label">{t('Post title','عنوان المنشور')} <b className="ui-field__req">*</b></span><input className="ui-input" maxLength={200} value={input.title} onChange={e=>set({title:e.target.value})} placeholder={t('e.g. PMP · November offer','مثلًا: PMP · عرض نوفمبر')}/></label>
        <label className="ui-field cp-caption"><span className="ui-field__label">{t('Caption','نص المنشور')} <b className="ui-field__req">*</b></span><textarea className="ui-input" rows={6} value={input.caption} maxLength={63206} onChange={e=>set({caption:e.target.value})} placeholder={t('Write what will appear with your image or video…','اكتب النص اللي هينزل مع الصورة أو الفيديو…')}/><small>{input.caption.length.toLocaleString()} {t('characters · shared across your platforms','حرف · نفس النص للمنصات المختارة')}</small></label>
      </section>
      <section className="cp-section"><div className="cp-section__title"><span>02</span><h3>{t('Media','الميديا')}</h3><small>{t('Your original quality, preserved','بجودة الملف الأصلي')}</small></div>
        <div className="cp-types" role="group" aria-label={t('Post type','نوع المنشور')}>{(['image','reel','carousel','video'] as const).map(type=><button type="button" key={type} aria-pressed={input.mediaType===type} onClick={()=>set({mediaType:type,...(!['reel','video'].includes(type)?{thumbnail:''}:{})})}>{type==='image'?<ImageIcon size={16}/>:type==='carousel'?<LayoutList size={16}/>:<Film size={16}/>} {type==='image'?t('Image','صورة'):type==='reel'?t('Reel','ريل'):type==='carousel'?t('Carousel','كاروسيل'):t('Video','فيديو')}</button>)}</div>
        <div className="cp-source-switch" role="group" aria-label={t('Media source','مصدر الميديا')}><button type="button" aria-pressed={input.mediaSource==='drive'} onClick={()=>set({mediaSource:'drive'})}><Cloud size={15}/>{t('Google Drive','Google Drive')}</button><button type="button" aria-pressed={input.mediaSource==='upload'} onClick={()=>set({mediaSource:'upload'})}><Upload size={15}/>{t('Upload a file','رفع من الجهاز')}</button></div>
        {input.mediaSource==='drive'?<label className="ui-field"><span className="ui-field__label">{t('Media link','رابط الميديا من Drive')}</span><div className="cp-link-input"><Link2 size={16}/><input className="ui-input" dir="ltr" type="url" value={input.design} onChange={e=>set({design:e.target.value})} placeholder="https://drive.google.com/file/d/…"/></div><span className="ui-field__hint">{t('Use a file link, or a folder containing only this post’s media. The connected Google account needs access.','رابط الملف مباشرة، أو فولدر مخصص للبوست. لازم حساب Google المربوط يقدر يفتحه.')}</span></label>:<><input hidden ref={fileRef} type="file" multiple={input.mediaType==='carousel'} accept={isVideo?'video/mp4':'image/jpeg,image/png,image/webp'} onChange={e=>void upload(Array.from(e.target.files||[]))}/><button type="button" disabled={busy} className="cp-upload" onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void upload(Array.from(e.dataTransfer.files));}}><Upload size={24}/><b>{progress!==null?t(`Uploading ${Math.round(progress*100)}%`,`جارٍ الرفع ${Math.round(progress*100)}٪`):t('Drop your files here, or browse','اسحب ملفاتك هنا، أو اختار من جهازك')}</b><small>{isVideo?'MP4 · 200 MB':t('JPG, PNG, WebP · up to 8 MB per image','JPG, PNG, WebP · حتى 8MB للصورة')}</small></button><CarouselTray files={files} ids={input.mediaIds} orders={input.mediaOrder??{}} platforms={input.platforms} carousel={input.mediaType==='carousel'} disabled={busy} onChange={mediaIds=>set({mediaIds})} onOrders={mediaOrder=>set({mediaOrder})}/></>}
        {isVideo&&<details className="cp-cover" open={Boolean(input.thumbnail)}><summary><ImageIcon size={15}/>{t('Reel cover','غلاف الريل')}<small>{t('Optional','اختياري')}</small><ChevronDown size={14}/></summary><label className="ui-field"><span className="ui-field__label">{t('Cover image link from Drive','رابط صورة الغلاف من Drive')}</span><input className="ui-input" dir="ltr" type="url" value={input.thumbnail} onChange={e=>set({thumbnail:e.target.value})} placeholder="https://drive.google.com/file/d/…"/><span className="ui-field__hint">{t('Leave blank to let the platform choose a frame.','سيبه فاضي لو عايز المنصة تختار لقطة من الفيديو.')}</span></label></details>}
      </section>
      <section className="cp-section"><div className="cp-section__title"><span>03</span><h3>{t('Where are we publishing?','هننشر فين؟')}</h3><small>{t('Choose multiple platforms','اختار منصة أو أكتر')}</small></div>
        <div className="cp-destinations">{CALENDAR_PLATFORMS.map(p=>{const chosen=input.platforms.includes(p),options=accounts.filter(a=>a.provider===p);return <div className="cp-destination" data-selected={chosen||undefined} key={p}><button type="button" aria-pressed={chosen} disabled={!options.length} onClick={()=>toggle(p)}><ChannelIcon channel={p} size={21}/><span><b>{platformOf(p).name}</b><small>{options.length?(options.find(a=>a.id===input.targets[p])?.name||t('Choose account','اختار الحساب')):t('Not connected','غير مربوط')}</small></span><i>{chosen&&<Check size={13}/>}</i></button>{chosen&&options.length>1&&<select className="ui-input" aria-label={t(`${platformOf(p).name} account`,`حساب ${platformOf(p).name}`)} value={input.targets[p]||''} onChange={e=>set({targets:{...input.targets,[p]:e.target.value}})}><option value="">{t('Choose the account','اختار الحساب المقصود')}</option>{options.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>}</div>;})}</div>
        <p className="cp-muted">{t('Only connected publishing platforms appear as available.','المنصات المتاحة للاختيار هي اللي ليها حساب نشر مربوط.')} <Link to="/settings?tab=connections">{t('Manage connections','إدارة الربط')}</Link></p>
        {input.platforms.includes('tiktok')&&<details className="cp-options" open><summary><ChannelIcon channel="tiktok" size={16}/>{t('TikTok settings','إعدادات TikTok')}<span>{t('Required','مطلوبة')}</span></summary><div className="cp-fields"><Select label={t('Who can see it?','مين يشوفه؟')} value={input.tiktokPrivacy} onChange={v=>set({tiktokPrivacy:v})} options={(creator?.privacy_level_options||[]).map(v=>[v,({PUBLIC_TO_EVERYONE:t('Everyone','الجميع'),MUTUAL_FOLLOW_FRIENDS:t('Friends','الأصدقاء'),FOLLOWER_OF_CREATOR:t('Followers','المتابعون'),SELF_ONLY:t('Only me','أنا فقط')} as Record<string,string>)[v]||v])}/><Select label={t('AI-generated content?','محتوى مولّد بالذكاء الاصطناعي؟')} value={input.aiGenerated} onChange={v=>set({aiGenerated:v})} options={[["YES",t('Yes','نعم')],["NO",t('No','لا')]]}/><Select label={t('Commercial disclosure','الإفصاح التجاري')} value={input.tiktokCommercial} onChange={v=>set({tiktokCommercial:v})} options={[["none",t('Not commercial','غير تجاري')],["own",t('My brand','ترويج لعلامتي')],["paid",t('Paid partnership','شراكة مدفوعة')],["both",t('Both','الاتنين')]]}/></div><p className="cp-muted">{creatorError||(!creator?t('Reading TikTok account settings…','جارٍ قراءة إعدادات حساب TikTok…'):'')} {t('Comments, Duet and Stitch are disabled for calendar publications.','التعليقات وDuet وStitch مقفولة في منشورات الكالندر.')}</p></details>}
        {input.platforms.includes('youtube')&&<details className="cp-options" open><summary><ChannelIcon channel="youtube" size={16}/>{t('YouTube settings','إعدادات YouTube')}<span>{t('Required','مطلوبة')}</span></summary><div className="cp-fields"><Select label={t('Visibility','الظهور')} value={input.youtubePrivacy} onChange={v=>set({youtubePrivacy:v})} options={[["public",t('Public','عام')],["unlisted",t('Unlisted','غير مدرج')],["private",t('Private','خاص')]]}/><Select label={t('Made for kids?','موجّه للأطفال؟')} value={input.madeForKids} onChange={v=>set({madeForKids:v})} options={[["YES",t('Yes','نعم')],["NO",t('No','لا')]]}/><Select label={t('Category','التصنيف')} value={input.youtubeCategory} onChange={v=>set({youtubeCategory:v})} options={[["27",t('Education','تعليم')],["26",t('How-to & style','إرشادات وأسلوب')],["28",t('Science & technology','علوم وتكنولوجيا')],["22",t('People & blogs','أشخاص ومدونات')]]}/></div></details>}
        {input.platforms.includes('snapchat')&&<details className="cp-options" open><summary><ChannelIcon channel="snapchat" size={16}/>{t('Snapchat settings','إعدادات Snapchat')}</summary><div className="cp-fields"><Select label={t('Destination','مكان النشر')} value={input.snapTarget} onChange={v=>set({snapTarget:v})} options={[["story","Story"],["spotlight","Spotlight"]]}/><Select label={t('Locale','اللغة والمنطقة')} value={input.snapLocale} onChange={v=>set({snapLocale:v})} options={[["ar_SA","العربية · السعودية"],["ar_EG","العربية · مصر"],["en_US","English · US"]]}/></div></details>}
      </section>
      <section className="cp-section"><div className="cp-section__title"><span>04</span><h3>{t('When does it go live?','ينزل إمتى؟')}</h3><small>{t('Your timezone, your schedule','بالوقت المناسب لجمهورك')}</small></div><div className="cp-fields"><label className="ui-field"><span className="ui-field__label">{t('Date','التاريخ')}</span><input className="ui-input" type="date" value={input.date} onChange={e=>set({date:e.target.value})}/></label><label className="ui-field"><span className="ui-field__label">{t('Time','الساعة')}</span><input className="ui-input" type="time" value={input.time} onChange={e=>set({time:e.target.value})}/></label><Select label={t('Timezone','التوقيت')} value={input.timezone} onChange={v=>set({timezone:v})} options={[["Africa/Cairo",t('Cairo','القاهرة')],["Asia/Riyadh",t('Riyadh','الرياض')],["Asia/Dubai",t('Dubai','دبي')],["UTC","UTC"]]}/></div><label className="ui-field"><span className="ui-field__label">{t('Internal notes','ملاحظات للفريق')} <small>{t('Optional · not published','اختياري · مش بتتنشر')}</small></span><textarea className="ui-input" rows={2} maxLength={5000} value={input.notes} onChange={e=>set({notes:e.target.value})} placeholder={t('Anything your team should know?','أي تفاصيل تحب الفريق يعرفها…')}/></label></section>
      {error&&<div className="cp-alert" role="alert">{error}</div>}
    </fieldset><aside className="cp-preview"><div className="cp-preview__sticky"><span className="cp-preview__eyebrow">{t('A LOOK BEFORE IT GOES LIVE','نظرة قبل النشر')}</span><h3>{t('Your post, ready to go','بوستك، قبل ما ينزل')}</h3><div className="cp-preview__post"><header><span className="cp-preview__avatar">E</span><div><b>{input.platforms.length?accounts.find(a=>a.id===input.targets[input.platforms[0]])?.name||'Engosoft':'Engosoft'}</b><small>{currentDate.isValid?date(currentDate.toISO()!,'dateTime'):t('Choose a date','اختار ميعاد')}</small></div><span>•••</span></header><p dir="auto">{input.caption||t('Your caption appears here…','نص بوستك هيظهر هنا…')}</p><div className="cp-preview__art">{input.mediaSource==='upload'&&selectedFiles[0]?.type==='video'?<video controls preload="metadata" src={selectedFiles[0].url}/>:previewImage?<img src={previewImage} alt={t('Post preview','معاينة المنشور')}/>:<><div>{isVideo?<Film size={34}/>:<ImageIcon size={34}/>}</div><b>{isVideo?t('Your reel goes here','الريل بتاعك هنا'):t('Your design goes here','التصميم بتاعك هنا')}</b><small>{input.mediaSource==='drive'&&input.design?t('Drive media is checked when you schedule.','ميديا Drive بتتراجع وقت الجدولة.'):t('Add media to complete the post.','أضف الميديا عشان تكمّل البوست.')}</small></>}</div><footer>{input.platforms.map(p=><ChannelIcon channel={p} size={17} key={p}/>)}</footer></div><div className="cp-checklist"><h4>{t('Ready for its date?','جاهز لموعده؟')}</h4>{checks.map(c=><div key={c.label} data-done={c.ok||undefined}>{c.ok?<CheckCircle2 size={15}/>:<span className="cp-checklist__circle"/>}{c.label}</div>)}</div><p className="cp-preview__note"><CalendarClock size={16}/>{t('We prepare your media and publish automatically at the scheduled time. Results appear in the calendar.','بنجهّز الميديا وننشر تلقائيًا في الميعاد. نتيجة كل منصة هتظهر هنا في الكالندر.')}</p></div></aside></div>
  </Drawer>;
}
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:[string,string][]}) {
  const {t}=useI18n();return <label className="ui-field"><span className="ui-field__label">{label}</span><select className="ui-input" value={value} onChange={e=>onChange(e.target.value)}><option value="">{t('Choose…','اختار…')}</option>{options.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>;
}
