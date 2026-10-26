/** Small key/value store for admin settings that must survive restarts (pricing, notification recipients). */
import { db } from './store.js';

db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)`);

export function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value_json FROM app_settings WHERE key=?').get(key) as { value_json: string } | undefined;
  if (!row) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(row.value_json) as T) };
  } catch {
    return fallback;
  }
}

export function setSetting<T>(key: string, value: T): T {
  db.prepare('INSERT INTO app_settings (key,value_json,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at')
    .run(key, JSON.stringify(value), new Date().toISOString());
  return value;
}
