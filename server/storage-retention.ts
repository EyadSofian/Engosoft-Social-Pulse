import { lstat, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import './social/media.js';
import { mediaDir } from './paths.js';
import { getSetting } from './settings.js';
import { invalidateStorageInventory } from './storage.js';

const DAY = 86_400_000;
export interface RetentionPolicy { enabled: boolean; publishedDays: number; trashDays: number }
export const defaultRetention: RetentionPolicy = { enabled: false, publishedDays: 30, trashDays: 7 };
export const retentionPolicy = () => getSetting('storage.retention', defaultRetention);
interface Asset { id: string; content_id: string; path: string; metadata_json: string; created_at: string; storage_state: string; quarantined_at: string | null; pinned: number }
interface Candidate { id: string; contentId: string; title: string; bytes: number; eligibleAt: string }
const exists = async (path: string) => { try { return (await lstat(path)).isFile(); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } };
function safePath(asset: Asset) {
  if (!/^[0-9a-f-]{36}$/.test(asset.id)) throw new Error('Invalid media ID.');
  const expected = mediaDir('social', basename(asset.path));
  if (resolve(asset.path) !== expected || !new RegExp(`^${asset.id}\\.(mp4|jpg)$`).test(basename(asset.path))) throw new Error('Unexpected media path.');
  return expected;
}
const trashPath = (asset: Asset) => mediaDir('social', '.trash', basename(safePath(asset)));
/** A published label alone is insufficient: every requested channel needs verified remote publication. */
async function eligible(asset: Asset, policy: RetentionPolicy, now: number, query = db): Promise<Candidate | undefined> {
  if (asset.pinned) return;
  safePath(asset);
  const content = await query.get<{ title: string; status: string; channels_json: string; updated_at: string }>('SELECT title,status,channels_json,updated_at FROM content_items WHERE id=?', [asset.content_id]);
  if (!content || content.status !== 'published') return;
  const jobs = await query.all<{ provider: string; state: string; external_id: string | null; updated_at: string }>('SELECT provider,state,external_id,updated_at FROM social_publish_jobs WHERE content_id=?', [asset.content_id]);
  if (!jobs.length || jobs.some(j => j.state !== 'published')) return;
  const channels: unknown = JSON.parse(content.channels_json);
  if (!Array.isArray(channels) || !channels.length || !channels.every(c => jobs.some(j => j.provider === c && j.external_id))) return;
  if (await query.get("SELECT id FROM social_publish_queue WHERE content_id=? AND state IN ('queued','sending','failed') LIMIT 1", [asset.content_id])) return;
  const latest = Math.max(Date.parse(content.updated_at), Date.parse(asset.created_at), ...jobs.map(j => Date.parse(j.updated_at)));
  const eligibleAt = latest + policy.publishedDays * DAY;
  if (!Number.isFinite(eligibleAt) || eligibleAt > now) return;
  return { id: asset.id, contentId: asset.content_id, title: content.title, bytes: Number(JSON.parse(asset.metadata_json).bytes) || 0, eligibleAt: new Date(eligibleAt).toISOString() };
}
export async function retentionPreview(policy?: RetentionPolicy, now = Date.now()) {
  policy ??= await retentionPolicy();
  const assets = await db.all<Asset>("SELECT m.* FROM social_media m JOIN content_items c ON c.id=m.content_id WHERE m.storage_state='active' AND m.pinned=0 AND c.status='published' ORDER BY m.created_at LIMIT 2000");
  const candidates: Candidate[] = [];
  for (const asset of assets) { const candidate = await eligible(asset, policy, now); if (candidate) candidates.push(candidate); }
  const trash = await db.all<{ id: string; content_id: string; quarantined_at: string; pinned: number }>("SELECT id,content_id,quarantined_at,pinned FROM social_media WHERE storage_state='quarantined' ORDER BY quarantined_at LIMIT 100");
  return { candidates: candidates.slice(0, 100), candidateCount: candidates.length, candidateBytes: candidates.reduce((n, a) => n + a.bytes, 0), scanned: assets.length, limited: assets.length === 2000, trash };
}
export async function restoreMediaAsset(id: string) {
  let moved: Asset | undefined;
  try {
    return await db.tx(async tx => {
      // This row lock also arbitrates with purge on another process.
      await tx.run("UPDATE social_media SET pinned=pinned WHERE id=? AND storage_state='quarantined'", [id]);
      const asset = await tx.get<Asset>('SELECT * FROM social_media WHERE id=?', [id]);
      if (!asset || asset.storage_state !== 'quarantined') throw new Error('الملف ليس في سلة الاسترجاع.');
      if (!await exists(trashPath(asset))) throw new Error('الملف غير متاح للاسترجاع.');
      await rename(trashPath(asset), safePath(asset)); moved = asset;
      await tx.run("UPDATE social_media SET storage_state='active',quarantined_at=NULL,pinned=1 WHERE id=?", [id]);
      return { restored: true, pinned: true };
    });
  } catch (e) { if (moved) await rename(safePath(moved), trashPath(moved)).catch(() => {}); throw e; }
  finally { invalidateStorageInventory(); }
}
let running: Promise<{ quarantined: number; purged: number; partials: number }> | undefined;
export function runStorageMaintenance(now = Date.now()) {
  if (running) return running;
  running = maintain(now).finally(() => { running = undefined; invalidateStorageInventory(); });
  return running;
}
async function maintain(now: number) {
  const policy = await retentionPolicy(), result = { quarantined: 0, purged: 0, partials: 0 };
  // Only incomplete uploads in our own UUID .part directory, never library/generated sources.
  const incoming = mediaDir('social', '.incoming');
  await mkdir(incoming, { recursive: true });
  for (const name of await readdir(incoming)) {
    if (!/^[0-9a-f-]{36}\.part$/.test(name)) continue;
    const path = resolve(incoming, name), stat = await lstat(path);
    if (stat.isFile() && now - stat.mtimeMs > DAY) { await unlink(path); result.partials++; }
  }
  // Recover a crash between an atomic move and its database commit. Active records always win.
  const active = await db.all<Asset>("SELECT * FROM social_media WHERE storage_state='active'");
  for (const asset of active) {
    if (await exists(safePath(asset)) || !await exists(trashPath(asset))) continue;
    await db.tx(async tx => {
      await tx.run("UPDATE social_media SET pinned=pinned WHERE id=? AND storage_state='active'", [asset.id]);
      const current = await tx.get<Asset>('SELECT * FROM social_media WHERE id=?', [asset.id]);
      if (current?.storage_state === 'active' && !await exists(safePath(current)) && await exists(trashPath(current))) await rename(trashPath(current), safePath(current));
    });
  }
  if (!policy.enabled) return result;
  await mkdir(mediaDir('social', '.trash'), { recursive: true });
  const candidates = (await retentionPreview(policy, now)).candidates;
  for (const candidate of candidates) {
    let moved: Asset | undefined;
    try {
      await db.tx(async tx => {
        // Returning content to review must wait until this atomic retention decision finishes.
        await tx.run("UPDATE content_items SET updated_at=updated_at WHERE id=? AND status='published'", [candidate.contentId]);
        await tx.run('UPDATE social_media SET pinned=pinned WHERE id=?', [candidate.id]);
        const asset = await tx.get<Asset>('SELECT * FROM social_media WHERE id=?', [candidate.id]);
        if (!asset || asset.storage_state !== 'active' || !await eligible(asset, policy, now, tx)) return;
        if (!await exists(safePath(asset))) return;
        await rename(safePath(asset), trashPath(asset)); moved = asset;
        await tx.run("UPDATE social_media SET storage_state='quarantined',quarantined_at=? WHERE id=?", [new Date(now).toISOString(), asset.id]);
        await tx.run('INSERT INTO content_events(id,content_id,actor_id,kind,body,created_at) VALUES(?,?,?,?,?,?)', [randomUUID(), asset.content_id, 'system', 'comment', `نُقل مرفق النشر ${asset.id} لسلة استرجاع التخزين بعد انتهاء مدة الاحتفاظ.`, new Date(now).toISOString()]);
      });
      if (moved) result.quarantined++;
    } catch (e) { if (moved) await rename(trashPath(moved), safePath(moved)).catch(() => {}); throw e; }
  }
  const expired = await db.all<Asset>("SELECT * FROM social_media WHERE storage_state='quarantined' AND quarantined_at<? LIMIT 100", [new Date(now - policy.trashDays * DAY).toISOString()]);
  for (const asset of expired) {
    // A new draft, queue, failed attempt or pin restores the file instead of deleting its needed source.
    if (!await eligible(asset, policy, now)) { await restoreMediaAsset(asset.id); continue; }
    await db.tx(async tx => {
      await tx.run("UPDATE content_items SET updated_at=updated_at WHERE id=? AND status='published'", [asset.content_id]);
      await tx.run('UPDATE social_media SET pinned=pinned WHERE id=?', [asset.id]);
      const current = await tx.get<Asset>('SELECT * FROM social_media WHERE id=?', [asset.id]);
      if (!current || current.storage_state !== 'quarantined' || !await eligible(current, policy, now, tx)) return;
      await unlink(trashPath(current)).catch(e => { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; });
      await tx.run("UPDATE social_media SET storage_state='purged' WHERE id=?", [current.id]);
      result.purged++;
    });
  }
  return result;
}
