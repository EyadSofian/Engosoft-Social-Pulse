/**
 * One async database interface for the whole server. Production uses Postgres (DATABASE_URL, Railway); local
 * development and tests use a SQLite file so they need no database server. Queries are written once with `?`
 * or `@name` placeholders and SQL both engines accept; table definitions are adapted per engine at start-up.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

export type Params = unknown[] | Record<string, unknown>;
export interface Db {
  readonly kind: 'pg' | 'sqlite';
  all<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T | undefined>;
  run(sql: string, params?: Params): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  /** Runs `work` in one transaction; everything inside must use the `tx` handle it receives. */
  tx<T>(work: (tx: Db) => Promise<T>): Promise<T>;
  /** Releases the connection (tests, shutdown). */
  close(): Promise<void>;
}

/* ── Postgres ──────────────────────────────────────────────────────── */

// BIGINT counts and epoch milliseconds, and NUMERIC sums, come back as numbers like they do from SQLite.
pg.types.setTypeParser(20, (value) => Number.parseInt(value, 10));
pg.types.setTypeParser(1700, (value) => Number.parseFloat(value));

/** `@name` and `?` placeholders → `$1…`, with the matching value list. */
export function toPositional(sql: string, params: Params = []): { text: string; values: unknown[] } {
  if (!Array.isArray(params)) {
    const names: string[] = [];
    const text = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) => {
      let index = names.indexOf(name);
      if (index < 0) { names.push(name); index = names.length - 1; }
      return `$${index + 1}`;
    });
    return { text, values: names.map((name) => params[name] ?? null) };
  }
  let n = 0;
  return { text: sql.replace(/\?/g, () => `$${++n}`), values: params };
}

/** SQLite table definitions → Postgres: 64-bit integers (epoch ms), double precision, no NOCASE. */
export const toPgDdl = (sql: string) => sql.replace(/\bINTEGER\b/g, 'BIGINT').replace(/\bREAL\b/g, 'DOUBLE PRECISION').replace(/\s+COLLATE\s+NOCASE/gi, '');

function pgDb(client: pg.Pool | pg.PoolClient): Db {
  const query = (sql: string, params?: Params) => {
    const { text, values } = toPositional(sql, params);
    return client.query(text, values);
  };
  return {
    kind: 'pg',
    all: async <T>(sql: string, params?: Params) => (await query(sql, params)).rows as T[],
    get: async <T>(sql: string, params?: Params) => (await query(sql, params)).rows[0] as T | undefined,
    run: async (sql, params) => ({ changes: (await query(sql, params)).rowCount ?? 0 }),
    exec: async (sql) => { await client.query(sql); },
    close: async () => { if (client instanceof pg.Pool) await client.end(); },
    tx: async (work) => {
      if (!(client instanceof pg.Pool)) return work(pgDb(client));
      const conn: pg.PoolClient = await client.connect();
      try {
        await conn.query('BEGIN');
        const result = await work(pgDb(conn));
        await conn.query('COMMIT');
        return result;
      } catch (error) {
        await conn.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        conn.release();
      }
    },
  };
}

/* ── SQLite ────────────────────────────────────────────────────────── */

function sqliteDb(file: string): Db {
  mkdirSync(dirname(file), { recursive: true });
  const raw = new Database(file);
  raw.pragma('journal_mode = WAL');
  const bind = (params?: Params) => (params === undefined ? [] : Array.isArray(params) ? params : [Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v === undefined ? null : typeof v === 'boolean' ? Number(v) : v]))]);
  const self: Db = {
    kind: 'sqlite',
    all: async <T>(sql: string, params?: Params) => raw.prepare(sql).all(...bind(params)) as T[],
    get: async <T>(sql: string, params?: Params) => raw.prepare(sql).get(...bind(params)) as T | undefined,
    run: async (sql, params) => ({ changes: raw.prepare(sql).run(...bind(params)).changes }),
    exec: async (sql) => { raw.exec(sql); },
    close: async () => { raw.close(); },
    tx: async (work) => {
      raw.exec('BEGIN');
      try {
        const result = await work(self);
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return self;
}

/* ── Connection and schema ─────────────────────────────────────────── */

const url = process.env.DATABASE_URL?.trim();
export const db: Db = url
  ? pgDb(new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE) || 10, ssl: /sslmode=require|\.rlwy\.net|railway\.app/.test(url) && !/\.railway\.internal/.test(url) ? { rejectUnauthorized: false } : undefined }))
  : sqliteDb(resolve(process.env.DATA_FILE || './data/social-pulse.sqlite'));

const schema: string[] = [];
/** Modules declare their tables here (SQLite syntax); `initDb` creates them in declaration order. */
export const defineSchema = (sql: string) => { schema.push(sql); };

const columns: { table: string; column: string; ddl: string }[] = [];
/** Adds a column to a table that may already exist in production (`CREATE TABLE IF NOT EXISTS` never alters one). */
export const defineColumn = (table: string, column: string, ddl: string) => { columns.push({ table, column, ddl }); };

async function hasColumn(table: string, column: string): Promise<boolean> {
  if (db.kind === 'pg') return Boolean(await db.get('SELECT 1 AS ok FROM information_schema.columns WHERE table_name=? AND column_name=?', [table, column]));
  return (await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).some((row) => row.name === column);
}

let ready: Promise<void> | null = null;
/** Creates every declared table and index. Await once before serving requests (and in tests). */
export function initDb(): Promise<void> {
  ready ??= (async () => {
    for (const sql of schema) await db.exec(db.kind === 'pg' ? toPgDdl(sql) : sql);
    for (const { table, column, ddl } of columns) if (!(await hasColumn(table, column))) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${db.kind === 'pg' ? toPgDdl(ddl) : ddl}`);
  })();
  return ready;
}
