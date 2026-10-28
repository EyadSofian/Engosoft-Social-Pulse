import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('upgrading a pre-integration database preserves legacy credentials and status records',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'social-migration-'));process.env.DATA_FILE=join(directory,'legacy.sqlite');
 const old=new Database(process.env.DATA_FILE);old.exec(`CREATE TABLE oauth_tokens(platform TEXT PRIMARY KEY,encrypted_json TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE connector_status(platform TEXT PRIMARY KEY,status TEXT NOT NULL,message TEXT NOT NULL,checked_at TEXT NOT NULL);
 INSERT INTO oauth_tokens VALUES('tiktok','legacy-ciphertext','2026-10-01');
 INSERT INTO connector_status VALUES('tiktok','connected','Existing history','2026-10-01');`);old.close();
 await import('../server/social/routes');const {db,initDb}=await import('../server/db');await initDb();
 assert.equal((await db.get('SELECT encrypted_json FROM oauth_tokens WHERE platform=?',['tiktok']))?.encrypted_json,'legacy-ciphertext');
 const r=await db.get('SELECT * FROM connector_status WHERE platform=?',['tiktok']);assert.equal(r?.message,'Existing history');assert.equal(r?.last_success_at,null);assert.equal(r?.partial,0);
 assert.ok(await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='social_accounts'"));await db.close();rmSync(directory,{recursive:true,force:true});
});
