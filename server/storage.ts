import { mkdir, readdir, lstat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type express from 'express';
import { mediaDir } from './paths.js';

export const MiB = 1024 * 1024, GiB = 1024 * MiB;
export class StorageError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const storageLimits = () => ({ maxBytes: positive(process.env.MEDIA_MAX_GB, 5) * GiB, reserveBytes: positive(process.env.MEDIA_RESERVE_GB, 1) * GiB });
export interface StorageInventory { bytes: number; files: number; groups: Record<string, { bytes: number; files: number }>; totalBytes: number; freeBytes: number; checkedAt: string }
let cached: { root: string; at: number; value: StorageInventory } | undefined;
let scanning: Promise<StorageInventory> | undefined;
export function invalidateStorageInventory() { cached = undefined; }
/** Counts real files, including quarantine. Never follows symbolic links out of the media volume. */
export async function storageInventory(fresh = false): Promise<StorageInventory> {
  const root = mediaDir();
  if (!fresh && cached?.root === root && Date.now() - cached.at < 30_000) return cached.value;
  if (scanning) return scanning;
  scanning = (async () => {
    await mkdir(root, { recursive: true });
    const groups: StorageInventory['groups'] = {};
    async function walk(dir: string, group: string) {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        const path = join(dir, e.name);
        if (e.isDirectory()) await walk(path, group || e.name);
        else if (e.isFile()) {
          try { const st = await lstat(path); if (!st.isFile()) continue; const g = groups[group || 'database'] ??= { bytes: 0, files: 0 }; g.bytes += st.size; g.files++; }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
      }
    }
    await walk(root, '');
    const disk = await statfs(root);
    const value = { bytes: Object.values(groups).reduce((s, g) => s + g.bytes, 0), files: Object.values(groups).reduce((s, g) => s + g.files, 0), groups, totalBytes: disk.blocks * disk.bsize, freeBytes: disk.bavail * disk.bsize, checkedAt: new Date().toISOString() };
    cached = { root, at: Date.now(), value }; return value;
  })().finally(() => { scanning = undefined; });
  return scanning;
}
let reserved = 0;
/** A reservation is held through the write; concurrent uploads cannot each spend the same remaining space. */
export async function reserveStorage(bytes: number): Promise<() => void> {
  const limits = storageLimits(), inventory = await storageInventory(true), disk = await statfs(mediaDir());
  if (inventory.bytes + reserved + bytes > limits.maxBytes || disk.bavail * disk.bsize - reserved - bytes < limits.reserveBytes)
    throw new StorageError(507, 'storage_full', 'المساحة المخصصة للملفات أوشكت على الامتلاء. أُوقف الرفع لحماية التطبيق؛ تواصل مع المسؤول لتنظيف الملفات أو زيادة الحد.');
  reserved += bytes; let released = false;
  return () => { if (!released) { released = true; reserved -= bytes; invalidateStorageInventory(); } };
}
export async function withStorage<T>(bytes: number, work: () => Promise<T>): Promise<T> {
  const release = await reserveStorage(bytes); try { return await work(); } finally { release(); }
}
/** Checks image/design work before it starts. Background generators also reserve their own space. */
export const storageWriteGuard: express.RequestHandler = async (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method) || !/^\/(?:ai\/(?:full-creative|post-image|creative-edit)|studio|uploads|svg-templates|content\/[^/]+\/sizes\/recreate|reels\/cover)/.test(req.path)) return next();
  try { const release = await reserveStorage(128 * MiB); res.once('finish', release); res.once('close', release); next(); }
  catch (error) { const e = error instanceof StorageError ? error : new StorageError(503, 'storage_unavailable', 'تعذّر فحص مساحة التخزين. حاول لاحقًا.'); res.status(e.status).json({ error: e.message, code: e.code }); }
};
