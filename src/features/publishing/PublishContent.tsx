import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { tiktokPhotoTitle } from '../../domain/tiktok-publishing';
import { Button } from '../../components/ui/Button';
import type { PipelineDetail } from '../content-pipeline/types';
import type { PublishJob, Media } from '../../../server/social/types';
import type { ProviderConnection, PublicAccount } from './SocialConnections';
const call=async(path:string,body?:unknown)=>{const r=await fetch(path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed.');return d;};
export function PublishContent({item}:{item:PipelineDetail}) {
 const {t}=useI18n();const [providers,setProviders]=useState<ProviderConnection[]>([]),[assets,setAssets]=useState<(Media&{id:string})[]>([]),[jobs,setJobs]=useState<PublishJob[]>([]);
 const [accountId,setAccount]=useState(''),[kind,setKind]=useState('image'),[selected,setSelected]=useState<string[]>([]),[privacy,setPrivacy]=useState(''),[mode,setMode]=useState('direct'),[creator,setCreator]=useState<Record<string,any>|null>(null);
 const [category,setCategory]=useState('27'),[tags,setTags]=useState(''),[kids,setKids]=useState(''),[snapTarget,setSnapTarget]=useState('story');
 const [allowComment,setComment]=useState(false),[allowDuet,setDuet]=useState(false),[allowStitch,setStitch]=useState(false),[commercial,setCommercial]=useState('none'),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[proof,setProof]=useState<Record<string,string>>({}),[bufferDefaults,setBufferDefaults]=useState(false),[aiGenerated,setAiGenerated]=useState(false);
 const [coverUrl,setCoverUrl]=useState(''),[autoMusic,setAutoMusic]=useState(false);
 const reload=async()=>{const d=await call(`/api/social/content/${item.id}`);setAssets(d.media);setJobs(d.jobs);};
 useEffect(()=>{void reload().catch(()=>{});if(item.canPublish)void call('/api/social/connections').then(d=>setProviders(d.providers)).catch(()=>{});},[item.id,item.status]);
 const accounts=providers.flatMap(p=>p.accounts).filter(a=>item.channels.includes(a.provider)&&a.status==='connected');
 const account=accounts.find(a=>a.id===accountId);
 useEffect(()=>{
  let active=true;setPrivacy('');setConsent(false);setCreator(null);setError('');setBufferDefaults(false);setAiGenerated(false);setAutoMusic(false);setCoverUrl('');setComment(false);setDuet(false);setStitch(false);
  if(account?.provider==='tiktok'&&(mode==='direct'||kind!=='video')&&(kind==='video'?account.capabilities.publish_video==='available':account.capabilities.publish_image==='available'))void call(`/api/social/accounts/${encodeURIComponent(account.id)}/creator?mediaType=${kind==='video'?'video':'photo'}`).then(value=>{if(active)setCreator(value);}).catch(e=>{if(active)setError(e.message);});
  return ()=>{active=false;};
 },[accountId,mode,kind]);
 const available=[...(item.creative?.imageUrl?[{url:item.creative.imageUrl,type:'image' as const}]:[]),...(item.creative?.storyUrl?[{url:item.creative.storyUrl,type:'image' as const}]:[]),...(item.creative?.landscapeUrl?[{url:item.creative.landscapeUrl,type:'image' as const}]:[]),...assets];
 const photo=kind==='image'||kind==='carousel',tiktokPhoto=account?.provider==='tiktok'&&photo;
 const choices=[...new Map(available.filter(a=>a.type===(photo?'image':'video')).map(a=>[a.url,a])).values()];
 const photoTitle=tiktokPhotoTitle(item.title);
 const coverIndex=Math.max(0,selected.indexOf(coverUrl));
 const aiPhotoBlocked=tiktokPhoto&&aiGenerated&&mode==='direct';
 const cap=mode==='draft'?'upload_draft':`publish_${kind}`;
 const validSelection=kind==='text'||(kind==='carousel'?selected.length>=2&&selected.length<=(account?.provider==='tiktok'?35:20):selected.length===1);
 const canPublish=Boolean(account&&account.capabilities[cap as keyof PublicAccount['capabilities']]==='available'&&consent&&validSelection&&!aiPhotoBlocked&&(!tiktokPhoto||photoTitle)&&(account.provider!=='tiktok'||mode==='draft'&&!photo||creator&&privacy)&&(account.provider!=='youtube'||privacy&&kids));
 const act=async(work:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{await reload().catch(()=>{});setBusy(false);}};
 return <section className="content-drawer__section u-stack">
  <h3>{t('Official platform publishing','النشر عبر المنصات الرسمية')}</h3>
  {item.editable&&<label>{t('Attach an MP4 for marketing review (up to 200 MB)','أرفق فيديو MP4 لمراجعة التسويق (حتى 200 ميجابايت)')}<input type="file" accept="video/mp4" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void act(async()=>{const r=await fetch(`/api/social/content/${item.id}/video`,{method:'POST',headers:{'Content-Type':'video/mp4'},body:file});const d=await r.json();if(!r.ok)throw new Error(d.error);});}} /></label>}
  {item.editable&&<label>{t('Attach photos for marketing review (JPEG, PNG, WebP; up to 8 MB each)','أرفق صورًا لمراجعة التسويق (JPEG أو PNG أو WebP؛ حتى 8 ميجابايت للصورة)')}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)void act(async()=>{for(const file of files){const r=await fetch(`/api/social/content/${item.id}/image`,{method:'POST',headers:{'Content-Type':file.type},body:file});const d=await r.json();if(!r.ok)throw new Error(d.error);}});}} /></label>}
  {assets.filter(a=>a.type==='image').map(a=><img key={a.id} src={a.url} alt={t('Attached photo for review','صورة مرفقة للمراجعة')} style={{maxHeight:180,maxWidth:'100%',objectFit:'contain'}} />)}
  {assets.filter(a=>a.type==='video').map(a=><video key={a.id} src={a.url} controls preload="metadata" style={{width:'100%',maxHeight:240}} />)}
  {item.canPublish&&['approved','scheduled'].includes(item.status)&&<>
   <p className="u-sm">{t('Publishing sends the approved copy and selected approved media now. Calendar scheduling remains a planning action.','النشر يرسل النص المعتمد والوسائط المختارة الآن. الجدولة في التقويم تظل للتخطيط.')}</p>
   <label>{t('Account','الحساب')}<select value={accountId} onChange={e=>{setAccount(e.target.value);setSelected([]);}}><option value="">{t('Choose an account','اختر الحساب')}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.provider} · {a.name} · {a.externalId}</option>)}</select></label>
   <label>{t('Format','النوع')}<select value={kind} onChange={e=>{setKind(e.target.value);setSelected([]);setConsent(false);}}>{['text','image','video','carousel'].map(k=><option key={k} value={k}>{({text:t('Text','نص'),image:t('Single photo','صورة واحدة'),video:t('Video','فيديو'),carousel:t('Photo carousel','كاروسيل صور')})[k]}</option>)}</select></label>
   {account?.provider==='tiktok'&&<label>{t('Delivery','الإرسال')}<select value={mode} onChange={e=>setMode(e.target.value)}><option value="direct">Direct Post</option><option value="draft">TikTok inbox — finish in TikTok</option></select></label>}
   {kind!=='text'&&choices.map((a,i)=><label key={a.url}><input type="checkbox" checked={selected.includes(a.url)} disabled={kind==='carousel'&&!selected.includes(a.url)&&selected.length>=(account?.provider==='tiktok'?35:20)} onChange={e=>{setSelected(e.target.checked?[...(kind==='carousel'?selected:[]),a.url]:selected.filter(x=>x!==a.url));setConsent(false);}} /> {a.type} {i+1}{a.type==='image'&&<img src={a.url} alt="" style={{height:64,maxWidth:100,objectFit:'contain'}} />}</label>)}
   {photo&&selected.length>0&&<div className="u-stack">
    <p>{t('Selected photo order','ترتيب الصور المختارة')}: {selected.length}{tiktokPhoto?' / 35':''}</p>
    {selected.map((url,index)=><div key={url} style={{display:'flex',alignItems:'center',gap:8}}>
     <span>{index+1}</span><img src={url} alt={`${t('Photo','صورة')} ${index+1}`} style={{height:72,width:54,objectFit:'contain'}} />
     {kind==='carousel'&&<><Button size="sm" disabled={index===0} onClick={()=>{setSelected(list=>{const next=[...list];[next[index-1],next[index]]=[next[index],next[index-1]];return next;});setConsent(false);}}>{t('Earlier','للأمام')}</Button><Button size="sm" disabled={index===selected.length-1} onClick={()=>{setSelected(list=>{const next=[...list];[next[index+1],next[index]]=[next[index],next[index+1]];return next;});setConsent(false);}}>{t('Later','للخلف')}</Button></>}
    </div>)}
   </div>}
   {tiktokPhoto&&<>
    <label>{t('Photo title from approved content (up to 90 characters)','عنوان الصور من المحتوى المعتمد (حتى 90 حرفًا)')}<input value={photoTitle} readOnly /></label>
    <p className="u-sm">{t('Photos use Zernio. Choose one photo or 2–35 photos for a carousel. Your full approved caption stays in the description.','الصور تُرسل عبر Zernio. اختر صورة واحدة أو 2–35 صورة للكاروسيل. النص المعتمد الكامل يُحفظ في الوصف.')}</p>
    {selected.length>0&&<label>{t('Cover photo','صورة الغلاف')}<select value={selected[coverIndex]} onChange={e=>{setCoverUrl(e.target.value);setConsent(false);}}>{selected.map((url,index)=><option key={url} value={url}>{t('Photo','صورة')} {index+1}</option>)}</select></label>}
    <label><input type="checkbox" checked={autoMusic} disabled={commercial!=='none'} onChange={e=>{setAutoMusic(e.target.checked);setConsent(false);}} />{t('Let TikTok recommend music (non-promotional photos only)','اسمح لتيك توك باختيار موسيقى (للصور غير الترويجية فقط)')}</label>
    {aiPhotoBlocked&&<p role="alert">{t('AI photo disclosure is unavailable for direct publishing on this connection. Choose TikTok inbox, then enable the AI disclosure in TikTok before publishing.','إفصاح الذكاء الاصطناعي للصور غير متاح في النشر المباشر على هذا الربط. اختر صندوق TikTok، ثم فعّل الإفصاح داخل تيك توك قبل النشر.')}</p>}
    {aiGenerated&&mode==='draft'&&<p>{t('These photos will only reach your TikTok inbox. Enable AI disclosure and review the final settings in TikTok before publishing.','الصور هتوصل لصندوق TikTok فقط. فعّل إفصاح الذكاء الاصطناعي وراجع الإعدادات النهائية داخل تيك توك قبل النشر.')}</p>}
   </>}
   {account&&<p className="u-sm" dir="auto">{item.captions[account.provider]||'—'}</p>}
   {account?.provider==='tiktok'&&(mode==='direct'||photo)&&<>
    <p>{creator?.creator_nickname||account.name}</p>
    <label>{t('Privacy (choose explicitly)','الخصوصية (اختر بنفسك)')}<select value={privacy} onChange={e=>{setPrivacy(e.target.value);setConsent(false);}}><option value="">—</option>{(creator?.privacy_level_options||[]).map((p:string)=><option key={p}>{p}</option>)}</select></label>
    <label><input type="checkbox" checked={allowComment} disabled={creator?.comment_disabled} onChange={e=>{setComment(e.target.checked);setConsent(false);}} />{t('Allow comments','اسمح بالتعليقات')}</label>
    {kind==='video'&&<><label><input type="checkbox" checked={allowDuet} disabled={creator?.duet_disabled} onChange={e=>setDuet(e.target.checked)} />Allow Duet</label><label><input type="checkbox" checked={allowStitch} disabled={creator?.stitch_disabled} onChange={e=>setStitch(e.target.checked)} />Allow Stitch</label></>}
    <label>{t('Commercial content','محتوى تجاري')}<select value={commercial} onChange={e=>{setCommercial(e.target.value);setAutoMusic(false);setConsent(false);}}><option value="none">Not promotional</option><option value="own">Your brand</option><option value="paid">Paid partnership</option><option value="both">Your brand and paid partnership</option></select></label>
   </>}
   {account?.provider==='snapchat'&&<label>Snapchat target<select value={snapTarget} onChange={e=>setSnapTarget(e.target.value)}><option value="story">Story</option><option value="spotlight">Spotlight</option></select></label>}
   {account?.provider==='youtube'&&<>
    <label>Privacy<select value={privacy} onChange={e=>{setPrivacy(e.target.value);setConsent(false);}}><option value="">—</option>{['private','unlisted','public'].map(p=><option key={p}>{p}</option>)}</select></label>
    <label>Category ID<input value={category} onChange={e=>setCategory(e.target.value)} /></label><label>Tags<input value={tags} onChange={e=>setTags(e.target.value)} /></label>
    <label>Made for kids?<select value={kids} onChange={e=>setKids(e.target.value)}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></label>
   </>}
   {account?.provider==='tiktok'&&<label><input type="checkbox" checked={aiGenerated} onChange={e=>{setAiGenerated(e.target.checked);setConsent(false);}} />{t('This content contains AI-generated material','هذا المحتوى يتضمن صورًا أو فيديو مولدًا بالذكاء الاصطناعي')}</label>}
   {creator?.hybrid&&kind==='video'&&mode==='direct'&&<label><input type="checkbox" checked={bufferDefaults} disabled={commercial!=='none'} onChange={e=>{setBufferDefaults(e.target.checked);setConsent(false);}} />{t('Allow Buffer as first choice using its own TikTok interaction settings. Promotional posts use Zernio.','أسمح باستخدام Buffer أولًا بإعدادات التفاعل الخاصة به على TikTok. المنشورات الترويجية تستخدم Zernio.')}</label>}
   <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />{t('I authorize sending this approved content to the selected account now.','أوافق على إرسال هذا المحتوى المعتمد للحساب المختار الآن.')}{account?.provider==='tiktok'&&<> By posting, you agree to TikTok’s <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.</>}</label>
   {account&&account.capabilities[cap as keyof PublicAccount['capabilities']]!=='available'&&<p>{t('Publishing unavailable: permissions, app approval or format support is missing. Review Connections.','النشر غير متاح: راجع الصلاحيات واعتماد التطبيق ودعم النوع في صفحة الربط.')}</p>}
   <Button variant="primary" busy={busy} disabled={!canPublish} onClick={()=>void act(()=>call('/api/social/publish',{contentId:item.id,accountId,kind,media:selected.map(url=>({url})),mode,privacy:privacy||undefined,categoryId:category,tags:tags.split(',').map(x=>x.trim()).filter(Boolean),madeForKids:kids==='yes',disableComment:!allowComment,disableDuet:!allowDuet,disableStitch:!allowStitch,brandOrganic:['own','both'].includes(commercial),brandContent:['paid','both'].includes(commercial),snapTarget,locale:'ar_SA',bufferDefaultsConsent:bufferDefaults,isAiGenerated:aiGenerated,photoCoverIndex:tiktokPhoto?coverIndex:undefined,autoAddMusic:tiktokPhoto?autoMusic:undefined,retry:jobs.find(j=>j.accountId===accountId)?.state==='failed',consent:true}))}>{t(mode==='draft'?'Send to TikTok inbox':'Publish approved content now',mode==='draft'?'أرسل لصندوق TikTok':'انشر المحتوى المعتمد الآن')}</Button>
  </>}
  {jobs.map(job=><div key={job.id}><strong>{job.provider} · {job.state}{job.phase?.startsWith('hybrid:')?' · '+job.phase.split(':')[1]:''}</strong>{job.externalId&&<small dir="ltr"> · {job.externalId}</small>}{job.url&&<a href={job.url} target="_blank" rel="noreferrer"> {t('View publication','شاهد المنشور')}</a>}{job.error&&<p role="alert">{job.error}</p>}{item.canPublish&&job.state==='unknown'&&<label>{t('After checking the live account, enter this content’s exact published ID','بعد مراجعة الحساب، أدخل معرّف هذا المنشور المنشور بالفعل')}<input value={proof[job.id]||''} onChange={e=>setProof({...proof,[job.id]:e.target.value})} /><Button size="sm" disabled={busy||!proof[job.id]?.trim()} onClick={()=>void act(()=>call(`/api/social/jobs/${job.id}/reconcile`,{externalId:proof[job.id].trim(),consent:true}))}>{t('Verify and record this ID','تحقق وسجّل هذا المعرّف')}</Button></label>}{job.state==='awaiting_user'&&<p>{t('Open the TikTok inbox notification, set AI disclosure if needed, and complete publishing in TikTok.','افتح إشعار صندوق TikTok، وحدد إفصاح الذكاء الاصطناعي إذا لزم، ثم أكمل النشر داخل TikTok.')}</p>}{item.canPublish&&!['published','failed'].includes(job.state)&&<Button size="sm" disabled={busy} onClick={()=>void act(()=>call(`/api/social/jobs/${job.id}/check`,{}))}>{t('Check existing request','افحص الطلب الحالي')}</Button>}</div>)}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
