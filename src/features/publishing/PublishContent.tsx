import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Button } from '../../components/ui/Button';
import type { PipelineDetail } from '../content-pipeline/types';
import type { PublishJob, Media } from '../../../server/social/types';
import type { ProviderConnection, PublicAccount } from './SocialConnections';
const call=async(path:string,body?:unknown)=>{const r=await fetch(path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed.');return d;};
export function PublishContent({item}:{item:PipelineDetail}) {
 const {t}=useI18n();const [providers,setProviders]=useState<ProviderConnection[]>([]),[assets,setAssets]=useState<(Media&{id:string})[]>([]),[jobs,setJobs]=useState<PublishJob[]>([]);
 const [accountId,setAccount]=useState(''),[kind,setKind]=useState('image'),[selected,setSelected]=useState<string[]>([]),[privacy,setPrivacy]=useState(''),[mode,setMode]=useState('direct'),[creator,setCreator]=useState<Record<string,any>|null>(null);
 const [category,setCategory]=useState('27'),[tags,setTags]=useState(''),[kids,setKids]=useState(''),[snapTarget,setSnapTarget]=useState('story');
 const [allowComment,setComment]=useState(false),[allowDuet,setDuet]=useState(false),[allowStitch,setStitch]=useState(false),[commercial,setCommercial]=useState('none'),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[proof,setProof]=useState<Record<string,string>>({});
 const reload=async()=>{const d=await call(`/api/social/content/${item.id}`);setAssets(d.media);setJobs(d.jobs);};
 useEffect(()=>{void reload().catch(()=>{});if(item.canPublish)void call('/api/social/connections').then(d=>setProviders(d.providers)).catch(()=>{});},[item.id,item.status]);
 const accounts=providers.flatMap(p=>p.accounts).filter(a=>item.channels.includes(a.provider)&&a.status==='connected');
 const account=accounts.find(a=>a.id===accountId);
 useEffect(()=>{setPrivacy('');setConsent(false);setCreator(null);setComment(false);setDuet(false);setStitch(false);if(account?.provider==='tiktok'&&mode==='direct'&&account.capabilities.publish_video==='available')void call(`/api/social/accounts/${encodeURIComponent(account.id)}/creator`).then(setCreator).catch(e=>setError(e.message));},[accountId,mode]);
 const available=[...(item.creative?.imageUrl?[{url:item.creative.imageUrl,type:'image' as const}]:[]),...(item.creative?.storyUrl?[{url:item.creative.storyUrl,type:'image' as const}]:[]),...assets.filter(a=>a.type==='video')];
 const cap=mode==='draft'?'upload_draft':`publish_${kind}`;
 const canPublish=Boolean(account&&account.capabilities[cap as keyof PublicAccount['capabilities']]==='available'&&consent&&(kind==='text'||selected.length)&&(account.provider!=='tiktok'||mode==='draft'||creator&&privacy)&&(account.provider!=='youtube'||privacy&&kids));
 const act=async(work:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await work();await reload();}catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}};
 return <section className="content-drawer__section u-stack">
  <h3>{t('Official platform publishing','النشر عبر المنصات الرسمية')}</h3>
  {item.editable&&<label>{t('Attach an MP4 for marketing review (up to 200 MB)','أرفق فيديو MP4 لمراجعة التسويق (حتى 200 ميجابايت)')}<input type="file" accept="video/mp4" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void act(async()=>{const r=await fetch(`/api/social/content/${item.id}/video`,{method:'POST',headers:{'Content-Type':'video/mp4'},body:file});const d=await r.json();if(!r.ok)throw new Error(d.error);});}} /></label>}
  {assets.filter(a=>a.type==='video').map(a=><video key={a.id} src={a.url} controls preload="metadata" style={{width:'100%',maxHeight:240}} />)}
  {item.canPublish&&['approved','scheduled'].includes(item.status)&&<>
   <p className="u-sm">{t('Publishing sends the approved copy and selected approved media now. Calendar scheduling remains a planning action.','النشر يرسل النص المعتمد والوسائط المختارة الآن. الجدولة في التقويم تظل للتخطيط.')}</p>
   <label>{t('Account','الحساب')}<select value={accountId} onChange={e=>{setAccount(e.target.value);setSelected([]);}}><option value="">{t('Choose an account','اختر الحساب')}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.provider} · {a.name} · {a.externalId}</option>)}</select></label>
   <label>{t('Format','النوع')}<select value={kind} onChange={e=>{setKind(e.target.value);setSelected([]);setConsent(false);}}>{['text','image','video','carousel'].map(k=><option key={k} value={k}>{k}</option>)}</select></label>
   {account?.provider==='tiktok'&&<label>{t('Delivery','الإرسال')}<select value={mode} onChange={e=>setMode(e.target.value)}><option value="direct">Direct Post</option><option value="draft">TikTok inbox — finish in TikTok</option></select></label>}
   {kind!=='text'&&available.map((a,i)=><label key={a.url}><input type="checkbox" checked={selected.includes(a.url)} onChange={e=>{setSelected(e.target.checked?[...(kind==='carousel'?selected:[]),a.url]:selected.filter(x=>x!==a.url));setConsent(false);}} /> {a.type} {i+1}{a.type==='image'&&<img src={a.url} alt="" style={{height:64,maxWidth:100,objectFit:'contain'}} />}</label>)}
   {account&&<p className="u-sm" dir="auto">{item.captions[account.provider]||'—'}</p>}
   {account?.provider==='tiktok'&&mode==='direct'&&<>
    <p>{creator?.creator_nickname||account.name}</p>
    <label>{t('Privacy (choose explicitly)','الخصوصية (اختر بنفسك)')}<select value={privacy} onChange={e=>setPrivacy(e.target.value)}><option value="">—</option>{(creator?.privacy_level_options||[]).map((p:string)=><option key={p}>{p}</option>)}</select></label>
    <label><input type="checkbox" checked={allowComment} disabled={creator?.comment_disabled} onChange={e=>setComment(e.target.checked)} />{t('Allow comments','اسمح بالتعليقات')}</label>
    {kind==='video'&&<><label><input type="checkbox" checked={allowDuet} disabled={creator?.duet_disabled} onChange={e=>setDuet(e.target.checked)} />Allow Duet</label><label><input type="checkbox" checked={allowStitch} disabled={creator?.stitch_disabled} onChange={e=>setStitch(e.target.checked)} />Allow Stitch</label></>}
    <label>{t('Commercial content','محتوى تجاري')}<select value={commercial} onChange={e=>setCommercial(e.target.value)}><option value="none">Not promotional</option><option value="own">Your brand</option><option value="paid">Paid partnership</option><option value="both">Your brand and paid partnership</option></select></label>
   </>}
   {account?.provider==='snapchat'&&<label>Snapchat target<select value={snapTarget} onChange={e=>setSnapTarget(e.target.value)}><option value="story">Story</option><option value="spotlight">Spotlight</option></select></label>}
   {account?.provider==='youtube'&&<>
    <label>Privacy<select value={privacy} onChange={e=>setPrivacy(e.target.value)}><option value="">—</option>{['private','unlisted','public'].map(p=><option key={p}>{p}</option>)}</select></label>
    <label>Category ID<input value={category} onChange={e=>setCategory(e.target.value)} /></label><label>Tags<input value={tags} onChange={e=>setTags(e.target.value)} /></label>
    <label>Made for kids?<select value={kids} onChange={e=>setKids(e.target.value)}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></label>
   </>}
   <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />{t('I authorize sending this approved content to the selected account now.','أوافق على إرسال هذا المحتوى المعتمد للحساب المختار الآن.')}{account?.provider==='tiktok'&&<> By posting, you agree to TikTok’s <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.</>}</label>
   {account&&account.capabilities[cap as keyof PublicAccount['capabilities']]!=='available'&&<p>{t('Publishing unavailable: permissions, app approval or format support is missing. Review Connections.','النشر غير متاح: راجع الصلاحيات واعتماد التطبيق ودعم النوع في صفحة الربط.')}</p>}
   <Button variant="primary" busy={busy} disabled={!canPublish} onClick={()=>void act(()=>call('/api/social/publish',{contentId:item.id,accountId,kind,media:selected.map(url=>({url})),mode,privacy:privacy||undefined,categoryId:category,tags:tags.split(',').map(x=>x.trim()).filter(Boolean),madeForKids:kids==='yes',disableComment:!allowComment,disableDuet:!allowDuet,disableStitch:!allowStitch,brandOrganic:['own','both'].includes(commercial),brandContent:['paid','both'].includes(commercial),snapTarget,locale:'ar_SA',retry:jobs.find(j=>j.accountId===accountId)?.state==='failed',consent:true}))}>{t(mode==='draft'?'Send to TikTok inbox':'Publish approved content now',mode==='draft'?'أرسل لصندوق TikTok':'انشر المحتوى المعتمد الآن')}</Button>
  </>}
  {jobs.map(job=><div key={job.id}><strong>{job.provider} · {job.state}</strong>{job.externalId&&<small dir="ltr"> · {job.externalId}</small>}{job.url&&<a href={job.url} target="_blank" rel="noreferrer"> {t('View publication','شاهد المنشور')}</a>}{job.error&&<p role="alert">{job.error}</p>}{item.canPublish&&job.state==='unknown'&&<label>{t('After checking the live account, enter this content’s exact published ID','بعد مراجعة الحساب، أدخل معرّف هذا المنشور المنشور بالفعل')}<input value={proof[job.id]||''} onChange={e=>setProof({...proof,[job.id]:e.target.value})} /><Button size="sm" disabled={busy||!proof[job.id]?.trim()} onClick={()=>void act(()=>call(`/api/social/jobs/${job.id}/reconcile`,{externalId:proof[job.id].trim(),consent:true}))}>{t('Verify and record this ID','تحقق وسجّل هذا المعرّف')}</Button></label>}{job.state==='awaiting_user'&&<p>{t('Open the TikTok inbox notification and complete publishing in TikTok.','افتح إشعار صندوق TikTok وأكمل النشر داخل TikTok.')}</p>}{item.canPublish&&!['published','failed'].includes(job.state)&&<Button size="sm" disabled={busy} onClick={()=>void act(()=>call(`/api/social/jobs/${job.id}/check`,{}))}>{t('Check existing request','افحص الطلب الحالي')}</Button>}</div>)}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
