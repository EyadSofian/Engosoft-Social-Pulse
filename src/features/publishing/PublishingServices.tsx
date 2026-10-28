import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import type { ProviderConnection } from './SocialConnections';
type Service={service:'buffer'|'zernio';configured:boolean;enabled:boolean;username:string|null;status:string;verifiedAt:string|null;cooldownUntil:number;error:string|null};
type Mapping={expectedUsername:string;candidates:{id:string;username:string}[]};
export function PublishingServices({connections,onReload}:{connections:ProviderConnection[];onReload:()=>void}) {
 const {t,date}=useI18n(),accounts=connections.find(p=>p.provider==='tiktok')?.accounts||[];
 const [accountId,setAccountId]=useState(''),[services,setServices]=useState<Service[]>([]),[keys,setKeys]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mappings,setMappings]=useState<Record<string,Mapping|undefined>>({});
 const load=async(id:string)=>{const r=await fetch(`/api/social/publishing-services/${encodeURIComponent(id)}`);if(!r.ok)throw new Error(t('Could not load publishing services.','تعذر تحميل خدمات النشر.'));setServices((await r.json()).services);};
 useEffect(()=>{if(!accountId&&accounts.length===1)setAccountId(accounts[0].id);},[accounts.length]);
 useEffect(()=>{setServices([]);setKeys({});setMappings({});setError('');if(accountId)void load(accountId).catch(e=>setError(e.message));},[accountId]);
 const act=async(service:string,action:'connect'|'check'|'disable',identity?:{targetId:string;confirmed:true})=>{
  setBusy(true);setError('');
  try {const r=await fetch(`/api/social/publishing-services/${encodeURIComponent(accountId)}/${service}${action==='connect'?'':'/'+action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='connect'?{apiKey:keys[service],consent:true,identity}:{})});const body=await r.json();if(!r.ok){if(body.candidates)setMappings(v=>({...v,[service]:{expectedUsername:body.expectedUsername,candidates:body.candidates}}));throw new Error(body.error);}setServices(body.services);setMappings(v=>({...v,[service]:undefined}));setKeys(v=>({...v,[service]:''}));onReload();}
  catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}
 };
 return <Card><CardHeader title={t('TikTok publishing backup','النشر الاحتياطي على TikTok')} description={t('Buffer first, Zernio second. A request with an uncertain outcome stays on its original service.','Buffer أولًا ثم Zernio. الطلب غير المؤكد يظل لدى مزوده حتى التحقق، لمنع التكرار.')} /><CardBody><div className="u-stack">
  <p className="u-sm">{t('Public videos use Buffer or Zernio; photos and carousels use Zernio. AI photos go to the TikTok inbox for disclosure and final publishing. Promotional disclosures and explicit interaction settings use Zernio; Buffer needs consent to use its own interaction settings. Connecting a service does not publish content.','الفيديو العام عبر Buffer أو Zernio؛ الصور والكاروسيل عبر Zernio. صور الذكاء الاصطناعي تُرسل لصندوق TikTok لتحديد الإفصاح وإتمام النشر. الإفصاح الترويجي وإعدادات التفاعل المحددة تستخدم Zernio؛ استخدام إعدادات Buffer للتفاعل يحتاج موافقة وقت النشر. ربط الخدمة لا ينشر محتوى.')}</p>
  <label>{t('TikTok account','حساب TikTok')}<select value={accountId} disabled={busy} onChange={e=>setAccountId(e.target.value)}><option value="">{t('Choose account','اختر الحساب')}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.externalId}</option>)}</select></label>
  {!accounts.length&&<p>{t('Connect TikTok first to verify the same creator on both services.','اربط TikTok أولًا للتحقق أن الخدمتين تستخدمان نفس الحساب.')}</p>}
  {accountId&&services.map(s=><div key={s.service} className="u-stack u-stack--sm">
   <p><strong>{s.service==='buffer'?'Buffer':'Zernio'}</strong> · <Badge tone={s.status==='connected'&&s.enabled?'success':'warning'}>{s.status==='connected'&&s.enabled?t('Connected','متصل'):s.configured?t('Needs checking / disabled','يحتاج فحصًا / معطّل'):t('Not connected','غير مربوط')}</Badge> {s.username&&`@${s.username}`}</p>
   {s.verifiedAt&&<small>{t('Last verified','آخر تحقق')}: {date(s.verifiedAt,'dateTime')}</small>}
   {s.cooldownUntil>Date.now()&&<small>{t('Temporarily unavailable until','متوقف مؤقتًا حتى')}: {date(new Date(s.cooldownUntil).toISOString(),'dateTime')}</small>}
   {s.error&&<p role="alert">{s.error}</p>}
   <a href={s.service==='buffer'?'https://publish.buffer.com/settings/channels':'https://zernio.com/dashboard/connections'} target="_blank" rel="noreferrer">{t('Connect this TikTok account at the service','اربط حساب TikTok لدى الخدمة')}</a>
   <label>{t('API key — encrypted on the server, never returned','مفتاح API — يُحفظ مشفرًا على الخادم ولا يُعرض لاحقًا')}<input type="password" autoComplete="off" value={keys[s.service]||''} onChange={e=>setKeys({...keys,[s.service]:e.target.value})} /></label>
   {mappings[s.service]&&<div role="alert" className="u-stack u-stack--sm"><p>{t('The service returned a different account label. Open its Connections page and verify the actual TikTok account before confirming.','الخدمة أعادت اسم عرض مختلفًا. افتح صفحة الربط لديها وتحقق من حساب TikTok الفعلي قبل تأكيد المطابقة.')}</p>{mappings[s.service]!.candidates.map(c=><Button key={c.id} size="sm" disabled={busy||!keys[s.service]?.trim()} onClick={()=>void act(s.service,'connect',{targetId:c.id,confirmed:true})}>{t(`I verified ${c.username} is @${mappings[s.service]!.expectedUsername}`,`تحققت أن ${c.username} هو حساب @${mappings[s.service]!.expectedUsername}`)}</Button>)}</div>}
   <div className="u-row u-row--wrap"><Button size="sm" busy={busy} disabled={!keys[s.service]?.trim()} onClick={()=>void act(s.service,'connect')}>{t('Verify account and save connection','تحقق من الحساب واحفظ الربط')}</Button>{s.configured&&<><Button size="sm" disabled={busy} onClick={()=>void act(s.service,'check')}>{t('Check connection','افحص الاتصال')}</Button>{s.enabled&&<Button size="sm" disabled={busy} onClick={()=>void act(s.service,'disable')}>{t('Disable service','عطّل الخدمة')}</Button>}</>}</div>
  </div>)}
  {error&&<p role="alert">{error}</p>}
 </div></CardBody></Card>;
}
