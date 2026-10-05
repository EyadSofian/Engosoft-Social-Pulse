import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ConnectorResult, ObservedPost, Plan, Platform } from './types.js';

const path = resolve(process.env.DATA_FILE || './data/social-pulse.sqlite');
mkdirSync(dirname(path), { recursive: true });
export const db = new Database(path);
db.pragma('journal_mode = WAL');
db.exec(`
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
CREATE TABLE IF NOT EXISTS website_daily (date TEXT PRIMARY KEY, views INTEGER NOT NULL, sessions INTEGER NOT NULL, engaged_sessions INTEGER NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS website_page_daily (date TEXT NOT NULL, path TEXT NOT NULL, title TEXT NOT NULL, views INTEGER NOT NULL, active_users INTEGER NOT NULL, engagement_seconds REAL NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY(date,path));
CREATE TABLE IF NOT EXISTS connector_status (platform TEXT PRIMARY KEY, status TEXT NOT NULL, message TEXT NOT NULL, checked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_tokens (platform TEXT PRIMARY KEY, encrypted_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL,
 created_at TEXT NOT NULL, delivered_at TEXT NOT NULL DEFAULT '', dismissed_at TEXT NOT NULL DEFAULT '', UNIQUE(plan_id, kind));
`);

const toPlan = (r: Record<string, unknown>): Plan => ({
  id:String(r.id), platform:r.platform as Platform, accountId:String(r.account_id), title:String(r.title), caption:String(r.caption), scheduledAt:String(r.scheduled_at), status:r.status as Plan['status'], permalink:String(r.permalink), externalId:String(r.external_id), owner:String(r.owner), contentType:String(r.content_type), campaign:String(r.campaign), notes:String(r.notes), sourceKey:String(r.source_key), createdAt:String(r.created_at), updatedAt:String(r.updated_at)
});
export const getPlans = (): Plan[] => (db.prepare('SELECT * FROM plans ORDER BY scheduled_at ASC').all() as Record<string,unknown>[]).map(toPlan);
export function savePlan(plan: Plan): Plan {
  const previous=db.prepare('SELECT scheduled_at,status,permalink,external_id FROM plans WHERE id=?').get(plan.id) as {scheduled_at:string;status:string;permalink:string;external_id:string}|undefined;
  db.prepare(`INSERT INTO plans (id, platform, account_id, title, caption, scheduled_at, status, permalink, external_id, owner, content_type, campaign, notes, source_key, created_at, updated_at)
  VALUES (@id,@platform,@accountId,@title,@caption,@scheduledAt,@status,@permalink,@externalId,@owner,@contentType,@campaign,@notes,@sourceKey,@createdAt,@updatedAt)
  ON CONFLICT(id) DO UPDATE SET platform=excluded.platform, account_id=excluded.account_id, title=excluded.title, caption=excluded.caption, scheduled_at=excluded.scheduled_at,
  status=excluded.status, permalink=excluded.permalink, external_id=excluded.external_id, owner=excluded.owner, content_type=excluded.content_type, campaign=excluded.campaign, notes=excluded.notes, updated_at=excluded.updated_at`).run(plan);
  if(previous?.scheduled_at!==plan.scheduledAt)
    db.prepare('DELETE FROM alerts WHERE plan_id=?').run(plan.id);
  else if(previous && (previous.status!==plan.status || previous.permalink!==plan.permalink || previous.external_id!==plan.externalId))
    db.prepare('DELETE FROM alerts WHERE plan_id=?').run(plan.id);
  return plan;
}
export function saveImportedPlan(plan: Plan): boolean {
  const result = db.prepare(`INSERT OR IGNORE INTO plans (id, platform, account_id, title, caption, scheduled_at, status, permalink, external_id, owner, content_type, campaign, notes, source_key, created_at, updated_at)
  VALUES (@id,@platform,@accountId,@title,@caption,@scheduledAt,@status,@permalink,@externalId,@owner,@contentType,@campaign,@notes,@sourceKey,@createdAt,@updatedAt)`).run(plan);
  return result.changes > 0;
}
export function deletePlan(id: string): boolean {
 return db.transaction(() => {
  db.prepare('DELETE FROM alerts WHERE plan_id=?').run(id);
  return db.prepare('DELETE FROM plans WHERE id=?').run(id).changes > 0;
 })();
}

const toObserved = (r: Record<string,unknown>): ObservedPost => ({
 platform:r.platform as Platform, accountId:String(r.account_id), accountName:String(r.account_name), externalId:String(r.external_id), permalink:String(r.permalink), title:String(r.title), publishedAt:String(r.published_at), contentType:String(r.content_type), thumbnail:String(r.thumbnail), metrics:JSON.parse(String(r.metrics_json))
});
export const getObserved = (): ObservedPost[] => (db.prepare('SELECT * FROM observed_posts ORDER BY published_at DESC').all() as Record<string,unknown>[]).map(toObserved);
export function saveConnectorResult(result: ConnectorResult) {
 const now = new Date().toISOString();
 const insert = db.prepare(`INSERT INTO observed_posts (platform,account_id,account_name,external_id,permalink,title,published_at,content_type,thumbnail,metrics_json,fetched_at)
 VALUES (@platform,@accountId,@accountName,@externalId,@permalink,@title,@publishedAt,@contentType,@thumbnail,@metricsJson,@fetchedAt)
 ON CONFLICT(platform,external_id) DO UPDATE SET account_id=excluded.account_id,account_name=excluded.account_name,permalink=excluded.permalink,title=excluded.title,published_at=excluded.published_at,content_type=excluded.content_type,thumbnail=excluded.thumbnail,metrics_json=excluded.metrics_json,fetched_at=excluded.fetched_at`);
 db.transaction(() => {
   for (const post of result.posts) insert.run({...post, metricsJson:JSON.stringify(post.metrics), fetchedAt:now});
   if (result.website) {
     const stmt=db.prepare('INSERT INTO website_daily (date,views,sessions,engaged_sessions,fetched_at) VALUES (@date,@views,@sessions,@engagedSessions,@fetchedAt) ON CONFLICT(date) DO UPDATE SET views=excluded.views,sessions=excluded.sessions,engaged_sessions=excluded.engaged_sessions,fetched_at=excluded.fetched_at');
     for (const day of result.website) stmt.run({...day,fetchedAt:now});
   }
   if (result.websitePages) {
     const stmt=db.prepare('INSERT INTO website_page_daily (date,path,title,views,active_users,engagement_seconds,fetched_at) VALUES (@date,@path,@title,@views,@activeUsers,@engagementSeconds,@fetchedAt) ON CONFLICT(date,path) DO UPDATE SET title=excluded.title,views=excluded.views,active_users=excluded.active_users,engagement_seconds=excluded.engagement_seconds,fetched_at=excluded.fetched_at');
     for (const page of result.websitePages) stmt.run({...page,fetchedAt:now});
   }
   db.prepare('INSERT INTO connector_status(platform,status,message,checked_at) VALUES(?,?,?,?) ON CONFLICT(platform) DO UPDATE SET status=excluded.status,message=excluded.message,checked_at=excluded.checked_at').run(result.platform,result.status,result.message,now);
 })();
}
export function getConnectorStatuses() { return db.prepare('SELECT platform,status,message,checked_at AS checkedAt FROM connector_status').all(); }
export function getWebsiteDaily() { return db.prepare('SELECT date,views,sessions,engaged_sessions AS engagedSessions FROM website_daily ORDER BY date ASC').all(); }
export function getWebsitePages() { return db.prepare('SELECT date,path,title,views,active_users AS activeUsers,engagement_seconds AS engagementSeconds FROM website_page_daily ORDER BY date DESC,views DESC').all(); }
export function getEncryptedToken(platform:Platform):string|undefined {
 return (db.prepare('SELECT encrypted_json FROM oauth_tokens WHERE platform=?').get(platform) as {encrypted_json:string}|undefined)?.encrypted_json;
}
export function saveEncryptedToken(platform:Platform,encrypted:string):void {
 db.prepare('INSERT INTO oauth_tokens(platform,encrypted_json,updated_at) VALUES(?,?,?) ON CONFLICT(platform) DO UPDATE SET encrypted_json=excluded.encrypted_json,updated_at=excluded.updated_at').run(platform,encrypted,new Date().toISOString());
}
export function saveOAuthState(state:string,expiresAt:number):void {
 db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(Date.now());
 db.prepare('INSERT INTO oauth_states(state_hash,expires_at,created_at) VALUES(?,?,?)').run(createHash('sha256').update(state).digest('hex'),expiresAt,new Date().toISOString());
}
export function consumeOAuthState(state:string,now=Date.now()):boolean {
 const hash=createHash('sha256').update(state).digest('hex');
 return db.transaction(()=>{
  const row=db.prepare('SELECT expires_at FROM oauth_states WHERE state_hash=?').get(hash) as {expires_at:number}|undefined;
  db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(hash);
  return Boolean(row&&row.expires_at>=now);
 })();
}
export interface Alert { id:string; planId:string; kind:string; message:string; createdAt:string; deliveredAt:string; dismissedAt:string; }
export function getAlerts(): Alert[] { return db.prepare('SELECT id,plan_id AS planId,kind,message,created_at AS createdAt,delivered_at AS deliveredAt,dismissed_at AS dismissedAt FROM alerts ORDER BY created_at DESC LIMIT 100').all() as Alert[]; }
export function addAlert(planId:string,kind:string,message:string): Alert | null {
 const alert: Alert={id:randomUUID(),planId,kind,message,createdAt:new Date().toISOString(),deliveredAt:'',dismissedAt:''};
 const result=db.prepare('INSERT OR IGNORE INTO alerts(id,plan_id,kind,message,created_at,delivered_at,dismissed_at) VALUES(@id,@planId,@kind,@message,@createdAt,@deliveredAt,@dismissedAt)').run(alert);
 return result.changes ? alert : null;
}
export function markAlertDelivered(id:string) { db.prepare('UPDATE alerts SET delivered_at=? WHERE id=?').run(new Date().toISOString(),id); }
export function dismissAlert(id:string) { return db.prepare('UPDATE alerts SET dismissed_at=? WHERE id=?').run(new Date().toISOString(),id).changes > 0; }
export function dismissPlanAlerts(planId:string) { db.prepare("UPDATE alerts SET dismissed_at=? WHERE plan_id=? AND dismissed_at=''").run(new Date().toISOString(),planId); }
