import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { db, defineSchema } from '../db.js';
import type { Credential, SocialAccount, SocialProvider } from './types.js';

defineSchema(`
CREATE TABLE IF NOT EXISTS social_accounts (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, external_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 name TEXT NOT NULL, scopes_json TEXT NOT NULL, metadata_json TEXT NOT NULL, credential_source TEXT NOT NULL,
 status TEXT NOT NULL, verified_at TEXT, last_sync_at TEXT, error TEXT,
 UNIQUE(provider, external_id)
);
CREATE TABLE IF NOT EXISTS social_credentials (id TEXT PRIMARY KEY, encrypted_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS social_checkpoints (account_id TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(account_id,kind));
CREATE TABLE IF NOT EXISTS social_oauth_states (hash TEXT PRIMARY KEY, provider TEXT NOT NULL, owner_id TEXT NOT NULL, mode TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS social_publish_jobs (
 id TEXT PRIMARY KEY, content_id TEXT NOT NULL, account_id TEXT NOT NULL, provider TEXT NOT NULL, actor_id TEXT NOT NULL,
 state TEXT NOT NULL, remote_id TEXT, external_id TEXT, url TEXT, error TEXT, error_code TEXT, retryable INTEGER NOT NULL DEFAULT 0, retry_after INTEGER, phase TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 1, UNIQUE(content_id, account_id, attempt)
);
`);
export const accountId = (provider: SocialProvider, externalId: string) => `${provider}:${externalId}`;
const toAccount = (r: Record<string, unknown>): SocialAccount => ({
 id: String(r.id), provider: r.provider as SocialProvider, externalId: String(r.external_id), name: String(r.name), ownerId: String(r.owner_id),
 scopes: JSON.parse(String(r.scopes_json)), metadata: JSON.parse(String(r.metadata_json)), credentialSource: String(r.credential_source),
 status: r.status as SocialAccount['status'], verifiedAt: r.verified_at as string | null, lastSyncAt: r.last_sync_at as string | null, error: r.error as string | null,
});
export const listAccounts = async (provider?: SocialProvider) => (await db.all(`SELECT * FROM social_accounts${provider ? ' WHERE provider=?' : ''}`, provider ? [provider] : [])).map(toAccount);
export const getAccount = async (id: string) => { const r = await db.get('SELECT * FROM social_accounts WHERE id=?', [id]); return r ? toAccount(r) : undefined; };
export async function putAccount(a: SocialAccount, reconnect = false) {
 await db.run(`INSERT INTO social_accounts(id,provider,external_id,owner_id,name,scopes_json,metadata_json,credential_source,status,verified_at,last_sync_at,error)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,scopes_json=excluded.scopes_json,metadata_json=excluded.metadata_json,
 credential_source=excluded.credential_source,status=CASE WHEN social_accounts.status='disconnected' AND ?=0 THEN social_accounts.status ELSE excluded.status END,
 verified_at=excluded.verified_at,last_sync_at=COALESCE(excluded.last_sync_at,social_accounts.last_sync_at),error=excluded.error`,
 [a.id,a.provider,a.externalId,a.ownerId,a.name,JSON.stringify(a.scopes),JSON.stringify(a.metadata),a.credentialSource,a.status,a.verifiedAt,a.lastSyncAt,a.error,reconnect ? 1 : 0]);
}
export const checkpoint = async (id: string, kind: string) => (await db.get<{value:string}>('SELECT value FROM social_checkpoints WHERE account_id=? AND kind=?',[id,kind]))?.value;
export const saveCheckpoint = async (id: string, kind: string, value: string) => { await db.run('INSERT INTO social_checkpoints(account_id,kind,value) VALUES(?,?,?) ON CONFLICT(account_id,kind) DO UPDATE SET value=excluded.value',[id,kind,value]); };
function key() { const k = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64'); if(k.length !== 32) throw new Error('A valid TOKEN_ENCRYPTION_KEY is required.'); return k; }
/** Same AES-256-GCM envelope as legacy OAuth, with separate AAD per credential. Legacy records stay untouched. */
export function seal(id: string, value: unknown) { const iv=randomBytes(12), c=createCipheriv('aes-256-gcm',key(),iv); c.setAAD(Buffer.from(id)); const bytes=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]); return Buffer.concat([iv,c.getAuthTag(),bytes]).toString('base64'); }
export function unseal<T>(id: string, value: string): T { const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAAD(Buffer.from(id));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')); }
export async function saveSecret(id:string,value:unknown) { await db.run('INSERT INTO social_credentials(id,encrypted_json,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted_json=excluded.encrypted_json,updated_at=excluded.updated_at',[id,seal(id,value),new Date().toISOString()]); }
export async function loadSecret<T=Credential>(id:string):Promise<T|undefined> { const r=await db.get<{encrypted_json:string}>('SELECT encrypted_json FROM social_credentials WHERE id=?',[id]);return r ? unseal<T>(id,r.encrypted_json) : undefined; }
export async function disconnect(id:string) { await db.run("UPDATE social_accounts SET status='disconnected',error=NULL WHERE id=?",[id]); }

export const hasPendingPublication=async(contentId:string)=>Boolean(await db.get("SELECT id FROM social_publish_jobs WHERE content_id=? AND state IN ('processing','awaiting_user','unknown') LIMIT 1",[contentId]));

/** Automatic publications: each row publishes one approved post to one account when its time comes. */
defineSchema(`
CREATE TABLE IF NOT EXISTS social_publish_queue (
 id TEXT PRIMARY KEY, content_id TEXT NOT NULL, account_id TEXT NOT NULL, kind TEXT NOT NULL, media_json TEXT NOT NULL DEFAULT '[]',
 publish_at TEXT NOT NULL, state TEXT NOT NULL, created_by TEXT NOT NULL, job_id TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS social_publish_queue_due ON social_publish_queue(state, publish_at);
CREATE INDEX IF NOT EXISTS social_publish_queue_content ON social_publish_queue(content_id);
`);
export type QueueState = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
export interface QueuedPublication { id: string; contentId: string; accountId: string; kind: 'text' | 'image' | 'video'; media: { url: string }[]; publishAt: string; state: QueueState; createdBy: string; jobId: string | null; error: string | null; createdAt: string; updatedAt: string }
export const toQueued = (r: Record<string, unknown>): QueuedPublication => ({
 id: String(r.id), contentId: String(r.content_id), accountId: String(r.account_id), kind: r.kind as QueuedPublication['kind'], media: JSON.parse(String(r.media_json || '[]')),
 publishAt: String(r.publish_at), state: r.state as QueueState, createdBy: String(r.created_by), jobId: (r.job_id as string | null) ?? null, error: (r.error as string | null) ?? null,
 createdAt: String(r.created_at), updatedAt: String(r.updated_at),
});
export const contentQueue = async (contentId: string) => (await db.all('SELECT * FROM social_publish_queue WHERE content_id=? ORDER BY created_at', [contentId])).map(toQueued);
/** A post taken off the calendar takes its waiting publications with it. */
export async function cancelQueued(contentId: string, reason: string) {
 await db.run("UPDATE social_publish_queue SET state='cancelled', error=?, updated_at=? WHERE content_id=? AND state='queued'", [reason, new Date().toISOString(), contentId]);
}
/** A new publish time moves the waiting publications with the post. */
export async function moveQueued(contentId: string, publishAt: string) {
 await db.run("UPDATE social_publish_queue SET publish_at=?, updated_at=? WHERE content_id=? AND state='queued'", [publishAt, new Date().toISOString(), contentId]);
}
