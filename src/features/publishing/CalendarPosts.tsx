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

type Account = { id:string;provider:string;name:string };
interface Board { posts:CalendarPostRecord[];accounts:Account[] }
const STATUS:Record<string,[string,string]>={draft:['Draft','مسودة'],scheduled:['Scheduled','مجدول'],publishing:['Publishing','جارٍ النشر'],published:['Published','منشور'],partial:['Partially published','نُشر جزئيًا'],blocked:['Needs attention','يحتاج مراجعة'],failed:['Failed','تعذّر النشر']};
const statusLabel=(value:string,t:(en:string,ar:string)=>string)=>t(...(STATUS[value]||[value,value]));
function blank(day?:string):CalendarPostInput {
  const at=DateTime.fromISO(suggestedTime(day)).setZone(businessZone());
  return {title:'',caption:'',date:at.toISODate()!,time:at.toFormat('HH:mm'),timezone:businessZone(),mediaType:'image',mediaSource:'drive',design:'',thumbnail:'',mediaIds:[],platforms:[],targets:{},notes:'',youtubePrivacy:'',youtubeCategory:'27',madeForKids:'',tiktokPrivacy:'',aiGenerated:'',tiktokCommercial:'',snapTarget:'story',snapLocale:'ar_SA'};
}
export function CalendarPosts({onChange}:{onChange:()=>void}) {
  const {can}=useAuth(),{t,date}=useI18n(),toast=useToast();
  const [query,setQuery]=useQueryState(),[board,setBoard]=useState<Board|null>(null),[error,setError]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('all');
  const [seed,setSeed]=useState<CalendarPostInput|null>(null),[copying,setCopying]=useState(false);
  const allowed=['connections.manage','content.create','content.edit_own','content.schedule','content.publish'].every(p=>can(p as never));
  const reload=useCallback(async()=>{setBoard(await api<Board>('/api/calendar-posts'));},[]);
  useEffect(()=>{if(!allowed)return;void reload().catch(e=>setError(e.message));const timer=setInterval(()=>void reload().catch(()=>{}),30000);return()=>clearInterval(timer);},[allowed,reload]);
  if(!allowed)return null;
  const managing=query.get('view')==='publishing',open=query.get('calendarPost'),editing=board?.posts.find(p=>p.id===open),posts=board?.posts||[];
  const visible=posts.filter(p=>(filter==='all'||p.status===filter)&&(!search.trim()||`${p.input.title} ${p.input.caption}`.toLowerCase().includes(search.toLowerCase())));
  const changed=()=>{void reload();onChange();};
  const copy=async(post:CalendarPostRecord)=>{
    setCopying(true);setError('');
    try {
      if(post.origin==='dashboard') {
        const result=await api<{post:CalendarPostRecord}>(`/api/calendar-posts/${post.id}/duplicate`,{body:{}});
        await reload();onChange();setSeed(null);setQuery({calendarPost:result.post.id});return;
      }
      const input=post.origin==='sheet'?await api<CalendarPostInput>(`/api/calendar-posts/import/${post.contentId}`):structuredClone(post.input);
      const when=blank();setSeed({...input,title:`${input.title} — ${t('copy','نسخة')}`,date:when.date,time:when.time,mediaSource:'drive',mediaIds:[],...(input.mediaSource==='upload'?{design:''}:{})});setQuery({calendarPost:'new'});
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setCopying(false);}
  };
  return <>
    <section className="cp-hub" aria-label={t('Publishing calendar','كالندر النشر')}>
      <div className="cp-hub__identity"><span className="cp-hub__icon"><CalendarDays size={22}/></span><div><h2>{t('Your publishing calendar','كالندر النشر')}</h2><p>{t('Write it. Choose its platforms. Give it a date.','النص والمنصات والميعاد… كل حاجة في مكان واحد.')}</p></div></div>
      <div className="cp-hub__stats"><span><i data-status="scheduled"/>{posts.filter(p=>p.status==='scheduled').length} {t('scheduled','مجدول')}</span><span><i data-status="draft"/>{posts.filter(p=>p.status==='draft').length} {t('drafts','مسودة')}</span></div>
      <div className="cp-view" role="group" aria-label={t('Workspace view','عرض مساحة العمل')}><button type="button" aria-pressed={!managing} onClick={()=>setQuery({view:null})}><CalendarDays size={16}/>{t('Calendar','التقويم')}</button><button type="button" aria-pressed={managing} onClick={()=>setQuery({view:'publishing'})}><LayoutList size={16}/>{t('Manage posts','إدارة المنشورات')}<b>{posts.length}</b></button></div>
    </section>
    {error&&<p className="cp-alert" role="alert">{error}</p>}
    {managing&&<section className="cp-board">
      <div className="cp-board__tools"><label className="mc-search"><Search size={16}/><input aria-label={t('Search calendar','ابحث في الكالندر')} placeholder={t('Search by title or caption…','دوّر بالعنوان أو النص…')} value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label={t('Post status','حالة المنشور')} className="mc-select" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{t('All statuses','كل الحالات')}</option>{Object.keys(STATUS).map(k=><option key={k} value={k}>{statusLabel(k,t)}</option>)}</select><Button size="sm" variant="ghost" icon={<RefreshCw size={14}/>} onClick={()=>void reload().catch(e=>setError(e.message))}>{t('Refresh','تحديث')}</Button><span className="u-grow"/><Button variant="primary" icon={<Plus size={16}/>} onClick={()=>{setSeed(null);setQuery({calendarPost:'new'});}}>{t('Add a post','أضف منشور')}</Button></div>
      {!board?<p role="status" className="cp-empty">{t('Loading your posts…','بنحمّل منشوراتك…')}</p>:!visible.length?<div className="cp-empty"><CalendarDays size={32}/><h3>{search||filter!=='all'?t('No matching posts','مفيش منشورات مطابقة'):t('Your next post starts here','بوستك الجاي يبدأ من هنا')}</h3><p>{t('Create and schedule a post without opening a spreadsheet.','أضف النص والميديا وحدد المنصات والميعاد من غير ما تفتح شيت.')}</p><Button icon={<Plus size={15}/>} onClick={()=>{setSeed(null);setQuery({calendarPost:'new'});}}>{t('Create a post','أضف أول منشور')}</Button></div>:<div className="cp-posts">{visible.map(post=><article className="cp-post" key={post.id}>
        <div className="cp-post__art">{post.preview?<img src={post.preview} alt={post.input.title}/>:post.input.mediaType==='reel'||post.input.mediaType==='video'?<Film size={28}/>:<ImageIcon size={28}/>}<span className="cp-status" data-status={post.status}>{statusLabel(post.status,t)}</span></div>
        <div className="cp-post__body"><div className="cp-post__origin">{post.origin==='sheet'?<Cloud size={12}/>:<CalendarDays size={12}/>} {post.origin==='sheet'?t('From Google Sheets','من Google Sheets'):t('From the dashboard','من الداشبورد')}<span>{post.input.mediaType==='reel'?t('Reel','ريل'):post.input.mediaType==='carousel'?t('Carousel','كاروسيل'):post.input.mediaType==='video'?t('Video','فيديو'):t('Image','صورة')}</span></div><h3 dir="auto">{post.input.title}</h3><p className="cp-post__caption" dir="auto">{post.input.caption}</p><div className="cp-post__when"><CalendarClock size={14}/>{post.scheduledAt?date(post.scheduledAt,'dateTime'):t('No date yet','لسه من غير ميعاد')}</div><div className="cp-post__platforms">{post.input.platforms.map(p=><span key={p} title={platformOf(p).name}><ChannelIcon channel={p} size={16}/><small>{post.jobs.find(j=>j.provider===p)?.state==='published'?<Check size={10}/>:null}</small></span>)}</div>
        {post.errors&&<p className="cp-post__error">{post.errors}</p>}
        {post.jobs.length>0&&<div className="cp-post__links">{post.jobs.map((j,i)=>j.url?<a key={i} target="_blank" rel="noreferrer" href={j.url.startsWith('/')&&j.provider==='facebook'?`https://www.facebook.com${j.url}`:j.url}>{platformOf(j.provider as CalendarPlatform)?.name||j.provider}<ExternalLink size={11}/></a>:<span key={i}>{j.provider} · {j.state==='published'?t('Published','تم النشر'):j.state}</span>)}</div>}
        <footer>{post.editable&&<Button size="sm" onClick={()=>{setSeed(null);setQuery({calendarPost:post.id});}}>{t('Edit details','تعديل التفاصيل')}</Button>}<Button size="sm" variant="ghost" icon={<Copy size={13}/>} busy={copying} onClick={()=>void copy(post)}>{t('Duplicate','نسخ')}</Button>{post.origin==='dashboard'&&post.status==='scheduled'&&<Button size="sm" variant="ghost" icon={<Pause size={13}/>} onClick={()=>void api(`/api/calendar-posts/${post.id}/pause`,{body:{}}).then(()=>{changed();toast.success(t('Schedule paused','اتوقفت الجدولة'));}).catch(e=>setError(e.message))}>{t('Pause','إيقاف')}</Button>}<Link className="cp-post__open" to={`/content/${post.contentId}`}>{t('Publication log','سجل النشر')}<ExternalLink size={13}/></Link></footer></div>
      </article>)}</div>}
    </section>}
    {open&&(open==='new'||editing)&&<CalendarPostEditor key={open} initial={open==='new'?seed||blank(query.get('postDay')||undefined):editing!.input} record={editing} accounts={board?.accounts||[]} onClose={()=>{setSeed(null);setQuery({calendarPost:null,postDay:null});}} onSaved={changed}/>}
  </>;
}

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
        {input.mediaSource==='drive'?<label className="ui-field"><span className="ui-field__label">{t('Media link','رابط الميديا من Drive')}</span><div className="cp-link-input"><Link2 size={16}/><input className="ui-input" dir="ltr" type="url" value={input.design} onChange={e=>set({design:e.target.value})} placeholder="https://drive.google.com/file/d/…"/></div><span className="ui-field__hint">{t('Use a file link, or a folder containing only this post’s media. The connected Google account needs access.','رابط الملف مباشرة، أو فولدر مخصص للبوست. لازم حساب Google المربوط يقدر يفتحه.')}</span></label>:<><input hidden ref={fileRef} type="file" multiple={input.mediaType==='carousel'} accept={isVideo?'video/mp4':'image/jpeg,image/png,image/webp'} onChange={e=>void upload(Array.from(e.target.files||[]))}/><button type="button" disabled={busy} className="cp-upload" onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void upload(Array.from(e.dataTransfer.files));}}><Upload size={24}/><b>{progress!==null?t(`Uploading ${Math.round(progress*100)}%`,`جارٍ الرفع ${Math.round(progress*100)}٪`):t('Drop your files here, or browse','اسحب ملفاتك هنا، أو اختار من جهازك')}</b><small>{isVideo?'MP4 · 200 MB':t('JPG, PNG, WebP · up to 8 MB per image','JPG, PNG, WebP · حتى 8MB للصورة')}</small></button>{selectedFiles.length>0&&<div className="cp-files">{selectedFiles.map((f,i)=><div key={f.id}>{f.type==='image'?<img src={f.url} alt={t(`Image ${i+1}`,`صورة ${i+1}`)}/>:<Film size={22}/>}<span>{i+1}</span><button type="button" aria-label={t('Remove media','إزالة الملف')} disabled={busy} onClick={()=>set({mediaIds:input.mediaIds.filter(id=>id!==f.id)})}><X size={12}/></button></div>)}</div>}</>}
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
