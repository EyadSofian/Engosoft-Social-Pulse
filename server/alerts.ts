import { addAlert, dismissPlanAlerts, getAlerts, getConnectorStatuses, getObserved, getPlans, markAlertDelivered } from './store.js';
import { isPlatform, planState } from './domain.js';

async function notifyTelegram(message:string):Promise<boolean>{
 const bot=process.env.TELEGRAM_BOT_TOKEN?.trim(),chat=process.env.TELEGRAM_CHAT_ID?.trim();if(!bot||!chat)return false;
 try{
   const response=await fetch(`https://api.telegram.org/bot${bot}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:message}),signal:AbortSignal.timeout(10_000)});
   return response.ok;
 }catch{return false;}
}
export async function checkAlerts(now=new Date()):Promise<number>{
 const [plans,observed]=await Promise.all([getPlans(),getObserved()]);const grace=Number(process.env.ALERT_GRACE_MINUTES)||15;
 const statuses=new Map((await getConnectorStatuses() as {platform:string;status:string}[]).map(x=>[x.platform,x.status]));
 let created=0;
 for(const plan of plans){
   const state=planState(plan,observed,now,grace);
   if(state==='published'||state==='cancelled'){await dismissPlanAlerts(plan.id);continue;}
   if(state==='draft')continue;
   const minutes=(new Date(plan.scheduledAt).getTime()-now.getTime())/60_000;
   let kind='';let message='';
   if(minutes>0 && minutes<=60){kind='upcoming';message=`تذكير: منشور «${plan.title}» على ${plan.platform} موعده خلال ${Math.ceil(minutes)} دقيقة.`;}
   if(state==='missed'){
     kind='missed';const source=statuses.get(plan.platform);
     message=`تنبيه: لم يتم تأكيد نشر «${plan.title}» على ${plan.platform} بعد موعده.${!isPlatform(plan.platform)?' المنصة دي بتتنشر يدوي: لما يتنشر حط رابطه في الخطة.':source!=='connected'?' الربط غير متاح حاليًا؛ راجع الصفحة يدويًا.':''}`;
   }
   if(!kind)continue;
   const alert=await addAlert(plan.id,kind,message);if(alert)created++;
 }
 if(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID){
   for(const alert of (await getAlerts()).filter(a=>!a.deliveredAt&&!a.dismissedAt&&now.getTime()-new Date(a.createdAt).getTime()<86_400_000))
     if(await notifyTelegram(alert.message))await markAlertDelivered(alert.id);
 }
 return created;
}
