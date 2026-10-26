/** Small key/value store for admin settings that must survive restarts (pricing, notification recipients). */
import { db, defineSchema } from './db.js';

defineSchema(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)`);

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.get<{ value_json: string }>('SELECT value_json FROM app_settings WHERE key=?', [key]);
  if (!row) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(row.value_json) as T) };
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<T> {
  await db.run('INSERT INTO app_settings (key,value_json,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at',
    [key, JSON.stringify(value), new Date().toISOString()]);
  return value;
}
