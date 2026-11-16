import { createHash, randomUUID } from 'node:crypto';
import { db, defineSchema, defineColumn } from './db.js';
import { blankPromotion, type AudienceDemographics, type ConnectorResult, type ObservedPost, type Plan, type Platform, type Promotion } from './types.js';

export { db };
defineSchema(`
CREATE TABLE IF NOT EXISTS plans (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL, account_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,
 caption TEXT NOT NULL DEFAULT '', scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
 permalink TEXT NOT NULL DEFAULT '', external_id TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '',
 content_type TEXT NOT NULL DEFAULT 'post', campaign TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 source_key TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS plans_source_key ON plans(source_key) WHERE source_key != '';
CREATE TABLE IF NOT EXISTS observed_posts (
 platform TEXT NOT NULL, account_id TEXT NOT NULL, account_name TEXT NOT NULL, external_id TEXT NOT NULL,
 permalink TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL,
 content_type TEXT NOT NULL DEFAULT '', thumbnail TEXT NOT NULL DEFAULT '', metrics_json TEXT NOT NULL,
 fetched_at TEXT NOT NULL, PRIMARY KEY(platform, external_id)
);
/** A person's own answer to "was money spent on this post?"; it wins over what the platform reports. */
CREATE TABLE IF NOT EXISTS post_promotion (platform TEXT NOT NULL, external_id TEXT NOT NULL, paid INTEGER NOT NULL, updated_by TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, PRIMARY KEY(platform, external_id));
CREATE TABLE IF NOT EXISTS website_daily (date TEXT PRIMARY KEY, views INTEGER NOT NULL, sessions INTEGER NOT NULL, engaged_sessions INTEGER NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS website_page_daily (date TEXT NOT NULL, path TEXT NOT NULL, title TEXT NOT NULL, views INTEGER NOT NULL, active_users INTEGER NOT NULL, engagement_seconds REAL NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY(date,path));
CREATE TABLE IF NOT EXISTS audience_daily (platform TEXT NOT NULL, account_id TEXT NOT NULL, account_name TEXT NOT NULL, date TEXT NOT NULL, followers INTEGER, demographics_json TEXT NOT NULL DEFAULT '', fetched_at TEXT NOT NULL, PRIMARY KEY(platform,account_id,date));
CREATE TABLE IF NOT EXISTS connector_status (platform TEXT PRIMARY KEY, status TEXT NOT NULL, message TEXT NOT NULL, checked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_tokens (platform TEXT PRIMARY KEY, encrypted_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL,
 created_at TEXT NOT NULL, delivered_at TEXT NOT NULL DEFAULT '', dismissed_at TEXT NOT NULL DEFAULT '', UNIQUE(plan_id, kind));
`);

defineColumn('connector_status','last_success_at','TEXT');
/** Organic or paid, with the organic/paid split of the numbers (JSON of Promotion); empty before the first sync that reads it. */
defineColumn('observed_posts','promotion_json',"TEXT NOT NULL DEFAULT ''");
defineColumn('connector_status','partial',"INTEGER NOT NULL DEFAULT 0");
/** The plan row's goal (reach, engagement, leads, traffic); empty when the spreadsheet gave none. */
defineColumn('plans','goal',"TEXT NOT NULL DEFAULT ''");

const toPlan = (r: Record<string, unknown>): Plan => ({
  id:String(r.id), platform:r.platform as Platform, accountId:String(r.account_id), title:String(r.title), caption:String(r.caption), scheduledAt:String(r.scheduled_at), status:r.status as Plan['status'], permalink:String(r.permalink), externalId:String(r.external_id), owner:String(r.owner), contentType:String(r.content_type), goal:String(r.goal ?? ''), campaign:String(r.campaign), notes:String(r.notes), sourceKey:String(r.source_key), createdAt:String(r.created_at), updatedAt:String(r.updated_at)
});
const PLAN_COLUMNS = 'id, platform, account_id, title, caption, scheduled_at, status, permalink, external_id, owner, content_type, goal, campaign, notes, source_key, created_at, updated_at';
const PLAN_VALUES = '@id,@platform,@accountId,@title,@caption,@scheduledAt,@status,@permalink,@externalId,@owner,@contentType,@goal,@campaign,@notes,@sourceKey,@createdAt,@updatedAt';
const planParams = (plan: Plan) => ({ ...plan }) as unknown as Record<string, unknown>;

export const getPlan = async (id: string): Promise<Plan | undefined> => {
  const row = await db.get('SELECT * FROM plans WHERE id=?', [id]);
  return row ? toPlan(row) : undefined;
};
export const getPlans = async (): Promise<Plan[]> => (await db.all('SELECT * FROM plans ORDER BY scheduled_at ASC')).map(toPlan);
export async function savePlan(plan: Plan): Promise<Plan> {
  const previous = await db.get<{scheduled_at:string;status:string;permalink:string;external_id:string}>('SELECT scheduled_at,status,permalink,external_id FROM plans WHERE id=?', [plan.id]);
  await db.run(`INSERT INTO plans (${PLAN_COLUMNS}) VALUES (${PLAN_VALUES})
  ON CONFLICT(id) DO UPDATE SET platform=excluded.platform, account_id=excluded.account_id, title=excluded.title, caption=excluded.caption, scheduled_at=excluded.scheduled_at,
  status=excluded.status, permalink=excluded.permalink, external_id=excluded.external_id, owner=excluded.owner, content_type=excluded.content_type, goal=excluded.goal, campaign=excluded.campaign, notes=excluded.notes, updated_at=excluded.updated_at`, planParams(plan));
  // A new time, status or publish proof resets the plan's alerts.
  if (previous?.scheduled_at !== plan.scheduledAt || (previous && (previous.status !== plan.status || previous.permalink !== plan.permalink || previous.external_id !== plan.externalId)))
    await db.run('DELETE FROM alerts WHERE plan_id=?', [plan.id]);
  return plan;
}
export async function saveImportedPlan(plan: Plan): Promise<boolean> {
  const result = await db.run(`INSERT INTO plans (${PLAN_COLUMNS}) VALUES (${PLAN_VALUES}) ON CONFLICT DO NOTHING`, planParams(plan));
  return result.changes > 0;
}
export async function deletePlan(id: string): Promise<boolean> {
  return db.tx(async (tx) => {
    await tx.run('DELETE FROM alerts WHERE plan_id=?', [id]);
    return (await tx.run('DELETE FROM plans WHERE id=?', [id])).changes > 0;
  });
}

function promotionOf(raw: unknown): Promotion | undefined {
 if (!raw) return undefined;
 try { return { ...blankPromotion(), ...JSON.parse(String(raw)) }; } catch { return undefined; }
}
const toObserved = (r: Record<string,unknown>): ObservedPost => ({
 platform:r.platform as Platform, accountId:String(r.account_id), accountName:String(r.account_name), externalId:String(r.external_id), permalink:String(r.permalink), title:String(r.title), publishedAt:String(r.published_at), contentType:String(r.content_type), thumbnail:String(r.thumbnail), metrics:JSON.parse(String(r.metrics_json)), promotion:promotionOf(r.promotion_json)
});
/** Every observed post, newest first. A post someone marked by hand carries that answer, whatever the platform said. */
export async function getObserved(): Promise<ObservedPost[]> {
 const [rows, manual] = await Promise.all([db.all('SELECT * FROM observed_posts ORDER BY published_at DESC'), db.all<{platform:string;external_id:string;paid:number}>('SELECT platform,external_id,paid FROM post_promotion')]);
 const marked = new Map(manual.map((m) => [`${m.platform}:${m.external_id}`, Number(m.paid) === 1]));
 return rows.map(toObserved).map((post) => {
  const paid = marked.get(`${post.platform}:${post.externalId}`);
  return paid == null ? post : { ...post, promotion: { ...(post.promotion ?? blankPromotion()), paid, source: 'manual' as const } };
 });
}
/** Marks a post organic (false) or paid (true) by hand; null goes back to what the platform reports. */
export async function setPostPromotion(platform: Platform, externalId: string, paid: boolean | null, userId: string): Promise<boolean> {
 if (!(await db.get('SELECT 1 AS ok FROM observed_posts WHERE platform=? AND external_id=?', [platform, externalId]))) return false;
 if (paid == null) await db.run('DELETE FROM post_promotion WHERE platform=? AND external_id=?', [platform, externalId]);
 else await db.run('INSERT INTO post_promotion (platform,external_id,paid,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(platform,external_id) DO UPDATE SET paid=excluded.paid,updated_by=excluded.updated_by,updated_at=excluded.updated_at', [platform, externalId, paid ? 1 : 0, userId, new Date().toISOString()]);
 return true;
}
export async function getOldestObservedPublishedAt(platform:Platform,accountId:string):Promise<string|undefined> {
 return (await db.get<{oldest:string|null}>('SELECT MIN(published_at) AS oldest FROM observed_posts WHERE platform=? AND account_id=?',[platform,accountId]))?.oldest||undefined;
}
export async function saveConnectorResult(result: ConnectorResult) {
 const now = new Date().toISOString();
 await db.tx(async (tx) => {
   for (const post of result.posts) await tx.run(`INSERT INTO observed_posts (platform,account_id,account_name,external_id,permalink,title,published_at,content_type,thumbnail,metrics_json,promotion_json,fetched_at)
 VALUES (@platform,@accountId,@accountName,@externalId,@permalink,@title,@publishedAt,@contentType,@thumbnail,@metricsJson,@promotionJson,@fetchedAt)
 ON CONFLICT(platform,external_id) DO UPDATE SET account_id=excluded.account_id,account_name=excluded.account_name,permalink=excluded.permalink,title=excluded.title,published_at=excluded.published_at,content_type=excluded.content_type,thumbnail=excluded.thumbnail,metrics_json=excluded.metrics_json,promotion_json=CASE WHEN excluded.promotion_json!='' THEN excluded.promotion_json ELSE observed_posts.promotion_json END,fetched_at=excluded.fetched_at`, {...post, metricsJson:JSON.stringify(post.metrics), promotionJson:post.promotion?JSON.stringify(post.promotion):'', fetchedAt:now});
   for (const day of result.website ?? []) await tx.run('INSERT INTO website_daily (date,views,sessions,engaged_sessions,fetched_at) VALUES (@date,@views,@sessions,@engagedSessions,@fetchedAt) ON CONFLICT(date) DO UPDATE SET views=excluded.views,sessions=excluded.sessions,engaged_sessions=excluded.engaged_sessions,fetched_at=excluded.fetched_at', {...day,fetchedAt:now});
   for (const page of result.websitePages ?? []) await tx.run('INSERT INTO website_page_daily (date,path,title,views,active_users,engagement_seconds,fetched_at) VALUES (@date,@path,@title,@views,@activeUsers,@engagementSeconds,@fetchedAt) ON CONFLICT(date,path) DO UPDATE SET title=excluded.title,views=excluded.views,active_users=excluded.active_users,engagement_seconds=excluded.engagement_seconds,fetched_at=excluded.fetched_at', {...page,fetchedAt:now});
   // One row per account per business day; a later sync the same day fills in what an earlier one missed.
   const day=businessDay(new Date());
   for(const a of result.audience||[]) await tx.run(`INSERT INTO audience_daily (platform,account_id,account_name,date,followers,demographics_json,fetched_at) VALUES (@platform,@accountId,@accountName,@date,@followers,@demographics,@fetchedAt)
 ON CONFLICT(platform,account_id,date) DO UPDATE SET account_name=excluded.account_name,followers=COALESCE(excluded.followers,audience_daily.followers),demographics_json=CASE WHEN excluded.demographics_json!='' THEN excluded.demographics_json ELSE audience_daily.demographics_json END,fetched_at=excluded.fetched_at`,{platform:a.platform,accountId:a.accountId,accountName:a.accountName,date:day,followers:a.followers,demographics:a.demographics?JSON.stringify(a.demographics):'',fetchedAt:now});
   for(const c of result.checkpoints||[]) await tx.run('INSERT INTO social_checkpoints(account_id,kind,value) VALUES(?,?,?) ON CONFLICT(account_id,kind) DO UPDATE SET value=excluded.value',[c.accountId,c.kind,c.value]);
   await tx.run('INSERT INTO connector_status(platform,status,message,checked_at) VALUES(?,?,?,?) ON CONFLICT(platform) DO UPDATE SET status=excluded.status,message=excluded.message,checked_at=excluded.checked_at',[result.platform,result.status,result.message,now]);
   await tx.run('UPDATE connector_status SET partial=? WHERE platform=?',[result.partial?1:0,result.platform]);
   if(result.status==='connected')await tx.run('UPDATE connector_status SET last_success_at=? WHERE platform=?',[now,result.platform]);
 });
}
/** yyyy-MM-dd in the business timezone. */
export const businessDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.BUSINESS_TIME_ZONE || 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export interface AudienceRow { platform: Platform; accountId: string; accountName: string; date: string; followers: number | null; demographics: AudienceDemographics | null }
/** Daily audience rows for the last two years, oldest first. */
export async function getAudience(): Promise<AudienceRow[]> {
  const since = businessDay(new Date(Date.now() - 730 * 86_400_000));
  const rows = await db.all<Record<string, unknown>>('SELECT platform,account_id,account_name,date,followers,demographics_json FROM audience_daily WHERE date>=? ORDER BY date ASC', [since]);
  return rows.map((r) => {
    let demographics: AudienceDemographics | null = null;
    try { demographics = r.demographics_json ? JSON.parse(String(r.demographics_json)) : null; } catch { demographics = null; }
    return { platform: r.platform as Platform, accountId: String(r.account_id), accountName: String(r.account_name), date: String(r.date), followers: r.followers == null ? null : Number(r.followers), demographics };
  });
}
export const getConnectorStatuses = () => db.all('SELECT platform,status,message,checked_at AS "checkedAt",last_success_at AS "lastSuccessAt",partial FROM connector_status');
export const getWebsiteDaily = () => db.all('SELECT date,views,sessions,engaged_sessions AS "engagedSessions" FROM website_daily ORDER BY date ASC');
export const getWebsitePages = () => db.all('SELECT date,path,title,views,active_users AS "activeUsers",engagement_seconds AS "engagementSeconds" FROM website_page_daily ORDER BY date DESC,views DESC');
export async function getEncryptedToken(platform:Platform):Promise<string|undefined> {
 return (await db.get<{encrypted_json:string}>('SELECT encrypted_json FROM oauth_tokens WHERE platform=?',[platform]))?.encrypted_json;
}
export async function saveEncryptedToken(platform:Platform,encrypted:string):Promise<void> {
 await db.run('INSERT INTO oauth_tokens(platform,encrypted_json,updated_at) VALUES(?,?,?) ON CONFLICT(platform) DO UPDATE SET encrypted_json=excluded.encrypted_json,updated_at=excluded.updated_at',[platform,encrypted,new Date().toISOString()]);
}
export async function saveOAuthState(state:string,expiresAt:number):Promise<void> {
 await db.run('DELETE FROM oauth_states WHERE expires_at < ?',[Date.now()]);
 await db.run('INSERT INTO oauth_states(state_hash,expires_at,created_at) VALUES(?,?,?)',[createHash('sha256').update(state).digest('hex'),expiresAt,new Date().toISOString()]);
}
export async function consumeOAuthState(state:string,now=Date.now()):Promise<boolean> {
 const hash=createHash('sha256').update(state).digest('hex');
 return db.tx(async (tx)=>{
  const row=await tx.get<{expires_at:number}>('SELECT expires_at FROM oauth_states WHERE state_hash=?',[hash]);
  await tx.run('DELETE FROM oauth_states WHERE state_hash=?',[hash]);
  return Boolean(row&&row.expires_at>=now);
 });
}
export interface Alert { id:string; planId:string; kind:string; message:string; createdAt:string; deliveredAt:string; dismissedAt:string; }
export const getAlerts = (): Promise<Alert[]> => db.all<Alert>('SELECT id,plan_id AS "planId",kind,message,created_at AS "createdAt",delivered_at AS "deliveredAt",dismissed_at AS "dismissedAt" FROM alerts ORDER BY created_at DESC LIMIT 100');
export async function addAlert(planId:string,kind:string,message:string): Promise<Alert | null> {
 const alert: Alert={id:randomUUID(),planId,kind,message,createdAt:new Date().toISOString(),deliveredAt:'',dismissedAt:''};
 const result=await db.run('INSERT INTO alerts(id,plan_id,kind,message,created_at,delivered_at,dismissed_at) VALUES(@id,@planId,@kind,@message,@createdAt,@deliveredAt,@dismissedAt) ON CONFLICT DO NOTHING',{...alert});
 return result.changes ? alert : null;
}
export async function markAlertDelivered(id:string) { await db.run('UPDATE alerts SET delivered_at=? WHERE id=?',[new Date().toISOString(),id]); }
export async function dismissAlert(id:string) { return (await db.run('UPDATE alerts SET dismissed_at=? WHERE id=?',[new Date().toISOString(),id])).changes > 0; }
export async function dismissPlanAlerts(planId:string) { await db.run("UPDATE alerts SET dismissed_at=? WHERE plan_id=? AND dismissed_at=''",[new Date().toISOString(),planId]); }
