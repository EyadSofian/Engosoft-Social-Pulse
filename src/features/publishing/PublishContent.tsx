import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { tiktokPhotoTitle } from '../../domain/tiktok-publishing';
import { ChevronDown, Film, ImagePlus, Send } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import type { PipelineDetail } from '../content-pipeline/types';
import type { PublishJob, Media } from '../../../server/social/types';
import type { ProviderConnection, PublicAccount } from './SocialConnections';
const call=async(path:string,body?:unknown)=>{const r=await fetch(path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed.');return d;};
export function PublishContent({item}:{item:PipelineDetail}) {
 const {t}=useI18n();const canVideo=useAuth().can('design.video');const [providers,setProviders]=useState<ProviderConnection[]>([]),[assets,setAssets]=useState<(Media&{id:string})[]>([]),[jobs,setJobs]=useState<PublishJob[]>([]);
 const [accountId,setAccount]=useState(''),[kind,setKind]=useState('image'),[selected,setSelected]=useState<string[]>([]),[privacy,setPrivacy]=useState(''),[mode,setMode]=useState('direct'),[creator,setCreator]=useState<Record<string,any>|null>(null);
 const [category,setCategory]=useState('27'),[tags,setTags]=useState(''),[kids,setKids]=useState(''),[snapTarget,setSnapTarget]=useState('story');
 const [allowComment,setComment]=useState(false),[allowDuet,setDuet]=useState(false),[allowStitch,setStitch]=useState(false),[commercial,setCommercial]=useState('none'),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[proof,setProof]=useState<Record<string,string>>({}),[bufferDefaults,setBufferDefaults]=useState(false),[aiGenerated,setAiGenerated]=useState(false);
 const [coverUrl,setCoverUrl]=useState(''),[autoMusic,setAutoMusic]=useState(false);
 const reload=async()=>{const d=await call(`/api/social/content/${item.id}`);setAssets(d.media);setJobs(d.jobs);};
 useEffect(()=>{void reload().catch(()=>{});if(item.canPublish)void call('/api/social/connections').then(d=>setProviders(d.providers)).catch(()=>{});},[item.id,item.status]);
 const connected=providers.flatMap(p=>p.accounts).filter(a=>a.status==='connected');
 const accounts=connected.filter(a=>item.channels.includes(a.provider));
 // Accounts on platforms the post was not made for: shown, so the whole library is visible, but they need the post edited first.
 const outside=connected.filter(a=>!item.channels.includes(a.provider));
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
 const attach=(path:string,files:File[])=>void act(async()=>{for(const file of files){const r=await fetch(path,{method:'POST',headers:{'Content-Type':file.type},body:file});const d=await r.json();if(!r.ok)throw new Error(d.error);}});
 const STATE:Record<string,[string,string,string]>={published:['Published','تم النشر','success'],processing:['Processing','قيد المعالجة','brand'],awaiting_user:['Finish in the app','أكمله داخل التطبيق','warning'],unknown:['Not confirmed','غير مؤكد','warning'],failed:['Failed','فشل','danger']};
 const publishable=item.canPublish&&['approved','scheduled'].includes(item.status);
 const PLATFORM:Record<string,string>={facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',snapchat:'Snapchat',youtube:'YouTube'};
 return <>
  {(item.editable||assets.length>0)&&<section className="content-drawer__section post-files">
   <h3>{t('Post files','ملفات المنشور')}</h3>
   <p className="u-xs u-muted">{t('Add the video or extra photos that go out with this post. They are reviewed with it and locked once approved.','أضف الفيديو أو الصور الإضافية اللي هتنزل مع المنشور. بتتراجع معاه وبتتقفل بعد الاعتماد.')}</p>
   {item.editable&&<div className="post-files__add">
    {canVideo&&<label className="post-files__drop"><Film size={18} /><b>{t('Add a video','أضف فيديو')}</b><small>MP4 · {t('up to 200 MB','حتى 200 ميجابايت')}</small><input type="file" accept="video/mp4" hidden disabled={busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)attach(`/api/social/content/${item.id}/video`,files.map(f=>new File([f],f.name,{type:'video/mp4'})));}} /></label>}
    <label className="post-files__drop"><ImagePlus size={18} /><b>{t('Add photos','أضف صورًا')}</b><small>JPEG · PNG · WebP · {t('up to 8 MB each','حتى 8 ميجابايت للصورة')}</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)attach(`/api/social/content/${item.id}/image`,files);}} /></label>
   </div>}
   {assets.length>0&&<div className="post-files__grid">{assets.map(a=>a.type==='image'?<img key={a.id} src={a.url} alt={t('Attached photo','صورة مرفقة')} />:<video key={a.id} src={a.url} controls preload="metadata" />)}</div>}
  </section>}

  {publishable&&connected.length>0&&<details className="content-drawer__section post-advanced">
   <summary><span><b>{t('Publish to TikTok, YouTube or Snapchat','النشر على تيك توك ويوتيوب وسناب شات')}</b><small>{t('Also videos, carousels and text posts on Facebook and Instagram. Each platform asks for its own choices.','وكمان الفيديو والكاروسيل والنص على فيسبوك وإنستجرام. كل منصة بتطلب اختياراتها.')}</small></span><ChevronDown size={16} /></summary>
   <div className="u-stack">
    <div className="post-advanced__accounts" role="radiogroup" aria-label={t('Account','الحساب')}>
     {accounts.map(a=><button key={a.id} type="button" role="radio" aria-checked={accountId===a.id} onClick={()=>{setAccount(a.id);setSelected([]);}}><ChannelIcon channel={a.provider} size={15} /><span dir="auto">{a.name}</span><small>{PLATFORM[a.provider]}</small></button>)}
     {outside.map(a=><button key={a.id} type="button" role="radio" aria-checked={false} disabled title={t('Not one of this post’s platforms','ليست ضمن منصات المنشور')}><ChannelIcon channel={a.provider} size={15} /><span dir="auto">{a.name}</span><small>{PLATFORM[a.provider]}</small></button>)}
    </div>
    {outside.length>0&&<p className="u-xs u-muted">{t('Greyed accounts are on platforms this post was not made for. Use “Edit post” to add the platform and its caption, then approve it again.','الحسابات الباهتة على منصات المنشور ما اتعملش ليها. استخدم «تعديل المنشور» لإضافة المنصة ونصها، ثم يتعتمد تاني.')}</p>}
    {account&&<div className="post-advanced__grid">
     <label className="ui-field"><span className="ui-field__label">{t('Format','النوع')}</span><select className="ui-input" value={kind} onChange={e=>{setKind(e.target.value);setSelected([]);setConsent(false);}}>{['text','image','video','carousel'].map(k=><option key={k} value={k}>{({text:t('Text only','نص فقط'),image:t('One photo','صورة واحدة'),video:t('Video','فيديو'),carousel:t('Photo carousel','كاروسيل صور')})[k]}</option>)}</select></label>
     {account.provider==='tiktok'&&<label className="ui-field"><span className="ui-field__label">{t('Delivery','طريقة الإرسال')}</span><select className="ui-input" value={mode} onChange={e=>setMode(e.target.value)}><option value="direct">{t('Publish directly','نشر مباشر')}</option><option value="draft">{t('Send to the TikTok inbox, finish in TikTok','إرسال لصندوق تيك توك وإكماله هناك')}</option></select></label>}
     {account.provider==='tiktok'&&(mode==='direct'||photo)&&<label className="ui-field"><span className="ui-field__label">{t('Who can see it','مين يقدر يشوفه')}</span><select className="ui-input" value={privacy} onChange={e=>{setPrivacy(e.target.value);setConsent(false);}}><option value="">{t('Choose…','اختر…')}</option>{(creator?.privacy_level_options||[]).map((p:string)=><option key={p}>{p}</option>)}</select></label>}
     {account.provider==='tiktok'&&(mode==='direct'||photo)&&<label className="ui-field"><span className="ui-field__label">{t('Commercial content','محتوى تجاري')}</span><select className="ui-input" value={commercial} onChange={e=>{setCommercial(e.target.value);setAutoMusic(false);setConsent(false);}}><option value="none">{t('Not promotional','غير ترويجي')}</option><option value="own">{t('Your own brand','علامتك التجارية')}</option><option value="paid">{t('Paid partnership','شراكة مدفوعة')}</option><option value="both">{t('Both','الاتنين')}</option></select></label>}
     {account.provider==='snapchat'&&<label className="ui-field"><span className="ui-field__label">{t('Where on Snapchat','مكان النشر على سناب')}</span><select className="ui-input" value={snapTarget} onChange={e=>setSnapTarget(e.target.value)}><option value="story">Story</option><option value="spotlight">Spotlight</option></select></label>}
     {account.provider==='youtube'&&<>
      <label className="ui-field"><span className="ui-field__label">{t('Visibility','الظهور')}</span><select className="ui-input" value={privacy} onChange={e=>{setPrivacy(e.target.value);setConsent(false);}}><option value="">{t('Choose…','اختر…')}</option><option value="public">{t('Public','عام')}</option><option value="unlisted">{t('Unlisted','غير مدرج')}</option><option value="private">{t('Private','خاص')}</option></select></label>
      <label className="ui-field"><span className="ui-field__label">{t('Made for kids?','موجّه للأطفال؟')}</span><select className="ui-input" value={kids} onChange={e=>setKids(e.target.value)}><option value="">{t('Choose…','اختر…')}</option><option value="no">{t('No','لا')}</option><option value="yes">{t('Yes','نعم')}</option></select></label>
      <label className="ui-field"><span className="ui-field__label">{t('Category ID','رقم الفئة')}</span><input className="ui-input" dir="ltr" value={category} onChange={e=>setCategory(e.target.value)} /></label>
      <label className="ui-field"><span className="ui-field__label">{t('Tags (comma separated)','الوسوم (مفصولة بفاصلة)')}</span><input className="ui-input" dir="auto" value={tags} onChange={e=>setTags(e.target.value)} /></label>
     </>}
    </div>}
    {account&&kind!=='text'&&<div className="ui-field"><span className="ui-field__label">{photo?(kind==='carousel'?t('Choose 2 or more photos, in order','اختر صورتين أو أكتر بالترتيب'):t('Choose the photo','اختر الصورة')):t('Choose the video','اختر الفيديو')}</span>
     {choices.length?<div className="post-advanced__media">{choices.map((a,i)=>{const order=selected.indexOf(a.url);return <button key={a.url} type="button" aria-pressed={order>=0} disabled={kind==='carousel'&&order<0&&selected.length>=(account.provider==='tiktok'?35:20)} onClick={()=>{setSelected(order>=0?selected.filter(x=>x!==a.url):[...(kind==='carousel'?selected:[]),a.url]);setConsent(false);}}>{a.type==='image'?<img src={a.url} alt="" />:<span className="post-advanced__video"><Film size={18} /> {t('Video','فيديو')} {i+1}</span>}{order>=0&&<i className="u-tnum">{kind==='carousel'?order+1:'✓'}</i>}</button>;})}</div>:<p className="u-xs u-muted">{photo?t('No photos on this post yet.','لا توجد صور على المنشور بعد.'):t('No video on this post. Add one in Post files before approval.','لا يوجد فيديو على المنشور. أضفه من ملفات المنشور قبل الاعتماد.')}</p>}
     {kind==='carousel'&&selected.length>1&&<div className="post-advanced__order">{selected.map((url,index)=><span key={url}><b className="u-tnum">{index+1}</b><button type="button" disabled={index===0} aria-label={t('Move earlier','قدّمها')} onClick={()=>{setSelected(list=>{const next=[...list];[next[index-1],next[index]]=[next[index],next[index-1]];return next;});setConsent(false);}}>‹</button><button type="button" disabled={index===selected.length-1} aria-label={t('Move later','أخّرها')} onClick={()=>{setSelected(list=>{const next=[...list];[next[index+1],next[index]]=[next[index],next[index+1]];return next;});setConsent(false);}}>›</button></span>)}</div>}
    </div>}
    {tiktokPhoto&&<div className="post-advanced__notes">
     <label className="ui-field"><span className="ui-field__label">{t('Photo title (from the approved title, up to 90 characters)','عنوان الصور (من العنوان المعتمد، حتى 90 حرفًا)')}</span><input className="ui-input" dir="auto" value={photoTitle} readOnly /></label>
     {selected.length>0&&<label className="ui-field"><span className="ui-field__label">{t('Cover photo','صورة الغلاف')}</span><select className="ui-input" value={selected[coverIndex]} onChange={e=>{setCoverUrl(e.target.value);setConsent(false);}}>{selected.map((url,index)=><option key={url} value={url}>{t('Photo','صورة')} {index+1}</option>)}</select></label>}
     <label className="post-advanced__check"><input type="checkbox" checked={autoMusic} disabled={commercial!=='none'} onChange={e=>{setAutoMusic(e.target.checked);setConsent(false);}} />{t('Let TikTok add suggested music (non-promotional photos only)','خلّي تيك توك يضيف موسيقى مقترحة (للصور غير الترويجية فقط)')}</label>
     {aiPhotoBlocked&&<p role="alert" className="post-advanced__warn">{t('AI disclosure is not available for direct photo posts here. Choose the TikTok inbox, then turn on the AI label in TikTok.','إفصاح الذكاء الاصطناعي غير متاح للنشر المباشر للصور هنا. اختر صندوق تيك توك، وفعّل علامة الذكاء الاصطناعي من جوه تيك توك.')}</p>}
    </div>}
    {account?.provider==='tiktok'&&(mode==='direct'||photo)&&<div className="post-advanced__checks">
     <label className="post-advanced__check"><input type="checkbox" checked={allowComment} disabled={creator?.comment_disabled} onChange={e=>{setComment(e.target.checked);setConsent(false);}} />{t('Allow comments','اسمح بالتعليقات')}</label>
     {kind==='video'&&<><label className="post-advanced__check"><input type="checkbox" checked={allowDuet} disabled={creator?.duet_disabled} onChange={e=>setDuet(e.target.checked)} />{t('Allow Duet','اسمح بالـ Duet')}</label><label className="post-advanced__check"><input type="checkbox" checked={allowStitch} disabled={creator?.stitch_disabled} onChange={e=>setStitch(e.target.checked)} />{t('Allow Stitch','اسمح بالـ Stitch')}</label></>}
    </div>}
    {account?.provider==='tiktok'&&<label className="post-advanced__check"><input type="checkbox" checked={aiGenerated} onChange={e=>{setAiGenerated(e.target.checked);setConsent(false);}} />{t('This post contains AI-generated images or video','المنشور فيه صور أو فيديو معمولين بالذكاء الاصطناعي')}</label>}
    {creator?.hybrid&&kind==='video'&&mode==='direct'&&<label className="post-advanced__check"><input type="checkbox" checked={bufferDefaults} disabled={commercial!=='none'} onChange={e=>{setBufferDefaults(e.target.checked);setConsent(false);}} />{t('Allow Buffer first, with its own TikTok interaction settings (promotional posts use Zernio)','اسمح بـ Buffer أولًا بإعدادات التفاعل بتاعته (المنشورات الترويجية بتروح Zernio)')}</label>}
    {account&&<blockquote className="post-advanced__caption" dir="auto">{item.captions[account.provider]||t('No caption for this platform.','مفيش نص لهذه المنصة.')}</blockquote>}
    {account&&account.capabilities[cap as keyof PublicAccount['capabilities']]!=='available'&&<p className="post-advanced__warn">{t('This account cannot publish this format yet: permission, app approval or format support is missing. Check Settings → Connections.','الحساب ده لسه ما يقدرش ينشر النوع ده: صلاحية أو اعتماد تطبيق أو دعم النوع ناقص. راجع الإعدادات ← ربط المنصات.')}</p>}
    {account&&<label className="publish-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} /><span>{t('I confirm sending this approved post to the selected account now.','أؤكد إرسال المنشور المعتمد للحساب المختار الآن.')}{account.provider==='tiktok'&&<> {t('By posting you agree to TikTok’s','بالنشر أنت موافق على')} <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.</>}</span></label>}
    {account&&<div><Button variant="primary" icon={<Send size={15} />} busy={busy} disabled={!canPublish} onClick={()=>void act(()=>call('/api/social/publish',{contentId:item.id,accountId,kind,media:selected.map(url=>({url})),mode,privacy:privacy||undefined,categoryId:category,tags:tags.split(',').map(x=>x.trim()).filter(Boolean),madeForKids:kids==='yes',disableComment:!allowComment,disableDuet:!allowDuet,disableStitch:!allowStitch,brandOrganic:['own','both'].includes(commercial),brandContent:['paid','both'].includes(commercial),snapTarget,locale:'ar_SA',bufferDefaultsConsent:bufferDefaults,isAiGenerated:aiGenerated,photoCoverIndex:tiktokPhoto?coverIndex:undefined,autoAddMusic:tiktokPhoto?autoMusic:undefined,retry:jobs.find(j=>j.accountId===accountId)?.state==='failed',consent:true}))}>{mode==='draft'&&account.provider==='tiktok'?t('Send to the TikTok inbox','أرسل لصندوق تيك توك'):t('Publish now','انشر الآن')}</Button></div>}
   </div>
  </details>}

  {jobs.length>0&&<section className="content-drawer__section">
   <h3>{t('Publishing history','سجل النشر')}</h3>
   <ul className="post-jobs">{jobs.map(job=>{const [en,ar,tone]=STATE[job.state]??[job.state,job.state,'neutral'];return <li key={job.id}>
    <span className="post-jobs__head"><ChannelIcon channel={job.provider} size={15} /><b>{PLATFORM[job.provider]??job.provider}</b><span className={`ui-badge ui-badge--${tone}`}>{t(en,ar)}</span>{job.url&&<a href={job.url} target="_blank" rel="noreferrer">{t('Open post','افتح المنشور')}</a>}</span>
    {job.error&&<p className="post-advanced__warn">{job.error}</p>}
    {job.state==='awaiting_user'&&<p className="u-xs u-muted">{t('Open the TikTok inbox notification, add the AI label if needed, and publish from TikTok.','افتح إشعار صندوق تيك توك، أضف علامة الذكاء الاصطناعي لو لازم، وانشر من جوه تيك توك.')}</p>}
    {item.canPublish&&job.state==='unknown'&&<div className="post-jobs__proof"><input className="ui-input" dir="ltr" placeholder={t('Published post ID from the account','معرّف المنشور من الحساب')} value={proof[job.id]||''} onChange={e=>setProof({...proof,[job.id]:e.target.value})} /><Button size="sm" disabled={busy||!proof[job.id]?.trim()} onClick={()=>void act(()=>call(`/api/social/jobs/${job.id}/reconcile`,{externalId:proof[job.id].trim(),consent:true}))}>{t('Verify and record','تحقق وسجّل')}</Button></div>}
    {item.canPublish&&!['published','failed'].includes(job.state)&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void act(()=>call(`/api/social/jobs/${job.id}/check`,{}))}>{t('Check again','افحص مرة تانية')}</Button>}
   </li>;})}</ul>
  </section>}
  {error&&<p role="alert" className="creative-home__error">{error}</p>}
 </>;
}
