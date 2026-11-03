import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import type { Availability, Capability, SocialAccount, SocialProvider } from '../../../server/social/types';
export type PublicAccount=Omit<SocialAccount,'credentialSource'|'ownerId'>&{capabilities:Record<Capability,Availability>;authorization?:{expiresAt:string|null;refreshEnabled:boolean;state:string}};
export interface ProviderConnection {provider:SocialProvider;oauthConfigured:boolean;accounts:PublicAccount[];capabilities:Record<Capability,Availability>;requirements:string[]}
const STATUS:Record<string,[string,string]>={available:['Available','متاح'],authorization_required:['Authorization required','مطلوب تفويض'],approval_required:['Approval required','مطلوب اعتماد التطبيق'],unconfigured:['Not configured','غير مُعدّ'],unsupported:['Unavailable','غير متاح'],connected:['Connected','متصل'],disconnected:['Not connected','غير متصل'],sync_failed:['Synchronization failed','فشلت المزامنة']};
const CAP:Record<Capability,[string,string]>={read_posts:['Read posts','قراءة المنشورات'],read_metrics:['Read metrics','قراءة الإحصاءات'],read_analytics:['Analytics reports','تقارير التحليلات'],publish_text:['Publish text','نشر نص'],publish_image:['Publish images','نشر صور'],publish_video:['Publish videos','نشر فيديو'],publish_carousel:['Publish carousels','نشر كاروسيل'],upload_draft:['Send to TikTok inbox','إرسال لصندوق TikTok']};
export function SocialConnectionDetails({connection,manage,onReload}:{connection?:ProviderConnection;manage:boolean;onReload:()=>void}) {
 const {t,date}=useI18n(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!connection)return null;
 const act=async(path:string)=>{setBusy(true);setError('');try{const r=await fetch(path,{method:'POST'});const body=await r.json();if(!r.ok)throw new Error(body.error||'Request failed.');onReload();}catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}};
 const p=connection.provider;
 return <div className="u-stack u-stack--sm">
  {connection.accounts.map(a=><div key={a.id} className="u-stack u-stack--xs">
   <p className="u-sm"><strong>{a.name}</strong> · <Badge tone={a.status==='connected'?'success':'warning'}>{t(...(STATUS[a.status]||STATUS.authorization_required))}</Badge></p>
   <small dir="ltr">{a.externalId}</small>
   <small>{t('Last successful account sync','آخر مزامنة ناجحة للحساب')}: {a.lastSyncAt?date(a.lastSyncAt,'dateTime'):'—'}</small>
   <small>{t('Authorization','التفويض')}: {a.scopes.length?t('Permissions recorded; credentials remain encrypted on the server.','الصلاحيات مُسجلة؛ بيانات الدخول مشفّرة على الخادم.'):t('Reconnect to verify permissions.','أعد الربط للتحقق من الصلاحيات.')}</small>
   {a.authorization&&<small>{p==='linkedin'?t('Authorization managed by Zernio; reconnect there if required.','Zernio يدير التفويض؛ أعد الربط هناك عند الحاجة.'):`${t('Token status','حالة التفويض')}: ${a.authorization.state} · ${t('Automatic refresh','تجديد تلقائي')}: ${a.authorization.refreshEnabled?t('Enabled','مفعّل'):t('Reauthorization when needed','أعد التفويض عند الحاجة')}`}{a.authorization.expiresAt?` · ${date(a.authorization.expiresAt,'dateTime')}`:''}</small>}
   {a.error&&<p role="alert" className="u-sm">{a.error}</p>}
   <div className="u-row u-row--wrap">{Object.entries(a.capabilities).filter(([,s])=>s!=='unsupported').map(([key,s])=><Badge key={key} tone={s==='available'?'success':'warning'}>{t(...CAP[key as Capability])}: {t(...STATUS[s])}</Badge>)}</div>
   {manage&&a.status!=='disconnected'&&<Button size="sm" disabled={busy} onClick={()=>void act(`/api/social/accounts/${encodeURIComponent(a.id)}/disconnect`)}>{t('Disconnect this account','افصل هذا الحساب')}</Button>}
  </div>)}
  {!connection.accounts.length&&<p className="u-sm">{t('Not connected. Account verification is required.','غير متصل. يلزم التحقق من الحساب.')}</p>}
  <details><summary>{t('Publishing and approval requirements','متطلبات النشر واعتماد التطبيق')}</summary>{connection.requirements.map(r=><p className="u-xs" dir="auto" key={r}>{r}</p>)}</details>
  {manage&&<div className="u-row u-row--wrap">
   {p==='linkedin'?<a className="ui-btn ui-btn--secondary ui-btn--sm" href="https://zernio.com/dashboard/connections" target="_blank" rel="noreferrer">{t('Manage LinkedIn connection','إدارة ربط LinkedIn')}</a>:connection.oauthConfigured?<><a className="ui-btn ui-btn--secondary ui-btn--sm" href={`/api/oauth/${p}/start`}>{t('Connect / reconnect','اربط / أعد الربط')}</a><a className="ui-btn ui-btn--secondary ui-btn--sm" href={`/api/oauth/${p}/start?mode=${p==='tiktok'?'publishing-and-draft':'publishing'}`}>{p==='tiktok'?t('Authorize publishing and inbox uploads','فوّض النشر وإرسال المسودات'):t('Authorize publishing','فوّض النشر')}</a>{p==='tiktok'&&<a className="ui-btn ui-btn--secondary ui-btn--sm" href="/api/oauth/tiktok/start?mode=draft">{t('Authorize inbox uploads','فوّض إرسال المسودات')}</a>}</>:<small>{t('OAuth client and exact callback URL need server configuration.','يلزم إعداد تطبيق OAuth ورابط العودة المطابق على الخادم.')}</small>}
   <Button size="sm" busy={busy} onClick={()=>void act(`/api/social/${p}/sync`)}>{t('Sync this platform','زامن هذه المنصة')}</Button>
  </div>}
  {manage&&p==='linkedin'&&<LinkedInSetup onReload={onReload} />}
  {error&&<p role="alert">{error}</p>}
 </div>;
}

function LinkedInSetup({onReload}:{onReload:()=>void}) {
 const {t}=useI18n();
 const [accounts,setAccounts]=useState<{targetId:string;organizationId:string;name:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const act=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}};
 const read=async(path:string,body?:unknown)=>{const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined),d=await r.json();if(!r.ok)throw new Error(d.error);return d;};
 return <details><summary>{t('Select a connected LinkedIn page','اختيار صفحة LinkedIn متصلة')}</summary><div className="u-stack u-stack--sm">
  <p className="u-xs">{t('Connect the company page in Zernio, then load it here. The API key stays on the server.','اربط صفحة الشركة في Zernio، ثم حمّل الصفحات هنا. مفتاح الربط يبقى على الخادم.')}</p>
  <Button size="sm" busy={busy} onClick={()=>void act(async()=>setAccounts((await read('/api/social/linkedin/candidates')).accounts))}>{t('Load connected pages','حمّل الصفحات المتصلة')}</Button>
  {accounts.map(a=><div className="u-row u-row--wrap" key={a.targetId}><span dir="auto">{a.name} · {a.organizationId}</span><Button size="sm" disabled={busy} onClick={()=>void act(async()=>{await read('/api/social/linkedin/connect',{...a,consent:true});onReload();})}>{t('Connect this page','اربط هذه الصفحة')}</Button></div>)}
  {error&&<p role="alert" className="u-xs">{error}</p>}
 </div></details>;
}
