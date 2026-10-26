/**
 * One-time copy of the SQLite database (the Railway volume file) into Postgres. Every table the app declares is
 * created in Postgres, emptied, and filled with the SQLite rows in one transaction, so a failure leaves Postgres
 * unchanged. Run inside the Railway service, where both DATA_FILE and DATABASE_URL are set:
 *
 *   npx tsx server/migrate-sqlite-to-postgres.ts            # copy
 *   npx tsx server/migrate-sqlite-to-postgres.ts --dry-run  # only count rows
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
// Importing the modules registers every table definition.
import './store.js';
import './auth.js';
import './workspace.js';
import './settings.js';
import './usage.js';
import './notify.js';
import './ai-templates.js';
import './svg-templates.js';
import { db, initDb } from './db.js';

const dryRun = process.argv.includes('--dry-run');
const replace = process.argv.includes('--replace');
const url = process.env.DATABASE_URL?.trim();
const file = resolve(process.env.SQLITE_FILE?.trim() || process.env.DATA_FILE?.trim() || './data/social-pulse.sqlite');
if (!url || db.kind !== 'pg') throw new Error('DATABASE_URL must point at Postgres');
if (!existsSync(file)) throw new Error(`SQLite file not found: ${file}`);

await initDb();
const sqlite = new Database(file, { readonly: true });
const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
const pool = new pg.Pool({ connectionString: url, ssl: /\.railway\.internal/.test(url) ? undefined : /sslmode=require|\.rlwy\.net/.test(url) ? { rejectUnauthorized: false } : undefined });
const client = await pool.connect();
try {
  const known = new Set((await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map((r) => r.table_name as string));
  const plan = tables.filter((t) => known.has(t));
  const skipped = tables.filter((t) => !known.has(t));
  if (skipped.length) throw new Error(`SQLite tables absent from the app schema: ${skipped.join(', ')}`);
  await client.query('BEGIN');
  if (!dryRun && !replace) {
    const occupied: string[] = [];
    for (const table of plan) {
      const { rows } = await client.query(`SELECT EXISTS(SELECT 1 FROM "${table}") AS occupied`);
      if (rows[0].occupied) occupied.push(table);
    }
    if (occupied.length) throw new Error(`Postgres already contains data in ${occupied.join(', ')}; refusing to replace it`);
  }
  for (const table of plan) {
    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
    const pgColumns = new Set((await client.query('SELECT column_name FROM information_schema.columns WHERE table_name=$1', [table])).rows.map((r) => r.column_name as string));
    const columns = rows.length ? Object.keys(rows[0]).filter((c) => pgColumns.has(c)) : [];
    console.log(`${table}: ${rows.length} rows`);
    if (dryRun) continue;
    await client.query(`TRUNCATE "${table}"`);
    for (let start = 0; start < rows.length; start += 200) {
      const chunk = rows.slice(start, start + 200);
      const values: unknown[] = [];
      const tuples = chunk.map((row) => `(${columns.map((column) => { values.push(row[column] ?? null); return `$${values.length}`; }).join(',')})`);
      await client.query(`INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(',')}) VALUES ${tuples.join(',')}`, values);
    }
  }
  if (dryRun) await client.query('ROLLBACK');
  else await client.query('COMMIT');
  console.log(dryRun ? 'Dry run: nothing written.' : `Copied ${plan.length} tables into Postgres.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
  await db.close();
  sqlite.close();
}
