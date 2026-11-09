import { db, defineSchema, defineColumn } from '../db.js';

defineSchema(`
CREATE TABLE IF NOT EXISTS google_calendar_sources (
 id TEXT PRIMARY KEY, spreadsheet_id TEXT NOT NULL, tab TEXT NOT NULL, owner_id TEXT NOT NULL,
 targets_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 0,
 last_sync_at INTEGER, error TEXT, lock_token TEXT, lock_until INTEGER NOT NULL DEFAULT 0,
 UNIQUE(spreadsheet_id,tab)
);
CREATE TABLE IF NOT EXISTS google_calendar_rows (
 source_id TEXT NOT NULL, post_id TEXT NOT NULL, content_id TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL DEFAULT '', media_fingerprint TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
 error TEXT NOT NULL DEFAULT '', channels_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL,
 PRIMARY KEY(source_id,post_id)
);
`);
defineColumn('google_calendar_sources', 'snapshot_json', 'TEXT');
defineColumn('google_calendar_sources', 'revision', 'INTEGER NOT NULL DEFAULT 0');
defineColumn('google_calendar_sources', 'validation_errors_json', "TEXT NOT NULL DEFAULT '[]'");
export interface GoogleSource { id: string; spreadsheet_id: string; tab: string; owner_id: string; targets_json: string; enabled: number; last_sync_at: number | null; error: string | null; lock_token: string | null; lock_until: number; snapshot_json: string | null; revision: number }
export interface GoogleRow { source_id: string; post_id: string; content_id: string; fingerprint: string; media_fingerprint: string; status: string; error: string; channels_json: string; updated_at: string }
export const getSource = (id: string) => db.get<GoogleSource>('SELECT * FROM google_calendar_sources WHERE id=?', [id]);
export const sourceRows = (id: string) => db.all<GoogleRow>('SELECT * FROM google_calendar_rows WHERE source_id=? ORDER BY updated_at DESC', [id]);
export async function sourceCanPublish(id: string) {
  const source = await getSource(id);
  return Boolean(source && source.enabled && !source.error && !source.lock_token && source.last_sync_at && source.last_sync_at > Date.now() - 120_000);
}
