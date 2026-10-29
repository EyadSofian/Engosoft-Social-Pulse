import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable, PassThrough } from 'node:stream';
import express from 'express';

const root = mkdtempSync(join(tmpdir(), 'storage-safety-'));
process.env.DATA_FILE = join(root, 'test.sqlite'); process.env.MEDIA_DIR = root;
delete process.env.DATABASE_URL;
const media = await import('../server/social/media');
await import('../server/workspace'); await import('../server/social/store');
const auth = await import('../server/auth');
const { db, initDb } = await import('../server/db');
const { reserveStorage, storageInventory, GiB, MiB } = await import('../server/storage');
const { attachVideoStream, inspectMP4File } = await import('../server/social/video-upload');
const { retentionPolicy, retentionPreview, runStorageMaintenance, restoreMediaAsset } = await import('../server/storage-retention');
const { setSetting } = await import('../server/settings');
const { registerStorageRoutes } = await import('../server/storage-routes');
const { registerSocialRoutes } = await import('../server/social/routes');
await initDb();
const admin = await auth.createUser({ name: 'Admin', email: 'storage@example.test', password: 'test-password-123', role: 'admin', departmentId: 'marketing' });
const staff = await auth.createUser({ name: 'Creator', email: 'staff@example.test', password: 'test-password-123', role: 'creator', departmentId: 'hr' });
let acting = admin;
const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = acting; next(); }); registerStorageRoutes(app); registerSocialRoutes(app);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
after(async () => { await new Promise<void>(r => server.close(() => r())); await db.close(); rmSync(root, { recursive: true, force: true }); });
const DAY = 86_400_000, now = Date.now(), old = new Date(now - 60 * DAY).toISOString();
async function content(status = 'draft', channels = ['youtube']) {
  const id = randomUUID(); await db.run('INSERT INTO content_items(id,title,status,owner_id,channels_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', [id, 'Storage fixture', status, admin.id, JSON.stringify(channels), old, old]); return id;
}
async function asset(contentId: string, pinned = 0) {
  const id = randomUUID(), path = join(root, 'social', `${id}.mp4`); await mkdir(join(root, 'social'), { recursive: true }); await writeFile(path, 'source');
  await db.run('INSERT INTO social_media(id,content_id,path,metadata_json,created_at,pinned) VALUES(?,?,?,?,?,?)', [id, contentId, path, JSON.stringify({ type: 'video', bytes: 6, url: `/api/social/assets/${id}` }), old, pinned]); return { id, path, contentId };
}
async function job(contentId: string, provider = 'youtube', state = 'published') {
  await db.run('INSERT INTO social_publish_jobs(id,content_id,account_id,provider,actor_id,state,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', [randomUUID(), contentId, `${provider}:${randomUUID()}`, provider, admin.id, state, state === 'published' ? 'verified-remote-id' : null, old, old]);
}
const box = (type: string, payload: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32BE(payload.length + 8); h.write(type, 4); return Buffer.concat([h, payload]); };
function mp4() {
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(10_000, 16);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(1080 * 65536, 76); tkhd.writeUInt32BE(1920 * 65536, 80);
  return Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('mdat', Buffer.alloc(64)), box('moov', Buffer.concat([box('mvhd', mvhd), box('trak', box('tkhd', tkhd))]))]);
}

test('automatic deletion is disabled by default, including for old verified publications', async () => {
  assert.equal((await retentionPolicy()).enabled, false);
  const id = await content('published'), a = await asset(id); await job(id);
  assert.equal((await retentionPreview()).candidateCount, 1);
  await runStorageMaintenance(now); assert.equal((await readFile(a.path)).toString(), 'source');
  await db.run('UPDATE social_media SET pinned=1 WHERE id=?', [a.id]);
});
test('video streams are saved with inspected metadata and no incomplete file remains', async () => {
  const id = await content(), bytes = mp4();
  const saved = await attachVideoStream(id, Readable.from([bytes]), bytes.length);
  assert.equal(saved.width, 1080); assert.equal(saved.height, 1920); assert.equal(saved.duration, 10);
  assert.deepEqual(await readFile(join(root, 'social', `${saved.id}.mp4`)), bytes);
  assert.deepEqual(await readdir(join(root, 'social', '.incoming')), []);
  assert.equal((await media.contentMedia(id)).length, 1);
});
test('invalid, oversized and approved-content video uploads leave no partial file', async () => {
  const id = await content();
  await assert.rejects(attachVideoStream(id, Readable.from([Buffer.from('not mp4')]), 7));
  await assert.rejects(attachVideoStream(id, Readable.from([mp4()]), 2), (e: any) => e.status === 413);
  const approved = await content('approved'); await assert.rejects(attachVideoStream(approved, Readable.from([mp4()]), mp4().length), (e: any) => e.status === 409);
  assert.deepEqual(await readdir(join(root, 'social', '.incoming')), []);
  assert.equal((await media.contentMedia(id)).length, 0);
});
test('an interrupted upload cleans up and concurrent video uploads are rejected before buffering', async () => {
  const stream = new PassThrough(), started = new Promise<void>(r => stream.once('resume', r));
  const pending = assert.rejects(attachVideoStream(await content(), stream, 100));
  await started;
  await assert.rejects(attachVideoStream(await content(), Readable.from([mp4()]), mp4().length), (e: any) => e.status === 429);
  stream.destroy(new Error('client disconnected')); await pending;
  assert.deepEqual(await readdir(join(root, 'social', '.incoming')), []);
});
test('quota reservations arbitrate concurrent writes and preserve the free-disk reserve', async () => {
  const inventory = await storageInventory(true);
  process.env.MEDIA_MAX_GB = String((inventory.bytes + 2 * MiB) / GiB);
  const release = await reserveStorage(1.5 * MiB);
  try { await assert.rejects(reserveStorage(1.5 * MiB), (e: any) => e.status === 507); } finally { release(); delete process.env.MEDIA_MAX_GB; }
  process.env.MEDIA_RESERVE_GB = '1000000';
  try { await assert.rejects(reserveStorage(1), (e: any) => e.status === 507); } finally { delete process.env.MEDIA_RESERVE_GB; }
});
test('the real HTTP video route accepts streamed MP4, rejects unauthorized users, and returns a storage-full response', async () => {
  const id = await content(), upload = () => fetch(base + `/api/social/content/${id}/video`, { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: new Uint8Array(mp4()) });
  const response = await upload(); assert.equal(response.status, 200); assert.equal((await response.json()).duration, 10);
  process.env.MEDIA_MAX_GB = '0.0000001';
  try { const blocked = await upload(); assert.equal(blocked.status, 507); assert.equal((await blocked.json()).code, 'storage_full'); } finally { delete process.env.MEDIA_MAX_GB; }
  acting = staff; assert.equal((await upload()).status, 403); acting = admin;
  assert.equal((await media.contentMedia(id)).length, 1);
});
test('publishing the same approved design to several accounts reuses one prepared image', async () => {
  const sharp = (await import('sharp')).default, workspace = await import('../server/workspace');
  const id = await content('approved'), name = `${randomUUID()}.png`, url = `/api/uploads/${name}`;
  await mkdir(join(root, 'uploads'), { recursive: true });
  await writeFile(join(root, 'uploads', name), await sharp({ create: { width: 600, height: 600, channels: 3, background: '#c00' } }).png().toBuffer());
  await db.run('UPDATE content_items SET creative_json=? WHERE id=?', [JSON.stringify({ requestId: 'fixture', directionId: 'd1', imageUrl: url }), id]);
  const item = (await workspace.getContent(id))!;
  const first = await media.resolveMedia(item, [url]), second = await media.resolveMedia(item, [url]);
  assert.equal(first[0].id, second[0].id); assert.equal((await media.contentMedia(id)).length, 1);
  await writeFile(join(root, 'uploads', name), await sharp({ create: { width: 600, height: 600, channels: 3, background: '#00c' } }).png().toBuffer());
  assert.notEqual((await media.resolveMedia(item, [url]))[0].id, first[0].id);
});
test('retention protects every non-published status and incomplete/failed/unknown publication', async () => {
  for (const status of ['draft', 'needs_review', 'approved', 'scheduled', 'archived', 'cancelled']) { const id = await content(status); await asset(id); await job(id); }
  for (const state of ['processing', 'awaiting_user', 'unknown', 'failed']) { const id = await content('published'); await asset(id); await job(id, 'youtube', state); }
  const partial = await content('published', ['youtube', 'instagram']); await asset(partial); await job(partial);
  const queued = await content('published'); await asset(queued); await job(queued);
  await db.run('INSERT INTO social_publish_queue(id,content_id,account_id,kind,publish_at,state,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', [randomUUID(), queued, 'youtube:account', 'video', old, 'queued', admin.id, old, old]);
  const pinned = await content('published'); await asset(pinned, 1); await job(pinned);
  assert.equal((await retentionPreview()).candidateCount, 0);
});
test('confirmed retention quarantines first, allows pinned restoration, and only purges after grace', async () => {
  await setSetting('storage.retention', { enabled: true, publishedDays: 30, trashDays: 7 });
  const id = await content('published'), a = await asset(id); await job(id);
  const result = await runStorageMaintenance(now); assert.equal(result.quarantined, 1); assert.equal(result.purged, 0);
  assert.equal((await media.contentMedia(id)).length, 0);
  assert.equal((await media.expiredContentMedia(id))[0].state, 'quarantined');
  assert.equal((await db.get('SELECT storage_state FROM social_media WHERE id=?', [a.id]))?.storage_state, 'quarantined');
  await restoreMediaAsset(a.id); assert.equal((await readFile(a.path)).toString(), 'source');
  assert.equal((await db.get('SELECT pinned FROM social_media WHERE id=?', [a.id]))?.pinned, 1);
  const doomed = await content('published'), b = await asset(doomed); await job(doomed);
  await runStorageMaintenance(now); await runStorageMaintenance(now + 6 * DAY);
  assert.equal((await db.get('SELECT storage_state FROM social_media WHERE id=?', [b.id]))?.storage_state, 'quarantined');
  await runStorageMaintenance(now + 8 * DAY);
  assert.equal((await db.get('SELECT storage_state FROM social_media WHERE id=?', [b.id]))?.storage_state, 'purged');
  await assert.rejects(lstat(join(root, 'social', '.trash', `${b.id}.mp4`)));
});
test('returning a quarantined post to review restores its needed source instead of purging it', async () => {
  const id = await content('published'), a = await asset(id); await job(id);
  await runStorageMaintenance(now); await db.run("UPDATE content_items SET status='draft' WHERE id=?", [id]);
  await runStorageMaintenance(now + 8 * DAY);
  assert.equal((await readFile(a.path)).toString(), 'source');
  assert.equal((await db.get('SELECT storage_state,pinned FROM social_media WHERE id=?', [a.id]))?.storage_state, 'active');
});
test('storage policy is admin-only, needs explicit deletion consent, and rejects other origins', async () => {
  const post = (body: unknown, origin?: string) => fetch(base + '/api/storage/policy', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post({ enabled: true, publishedDays: 30, trashDays: 7 })).status, 400);
  assert.equal((await post({ enabled: true, publishedDays: 30, trashDays: 7, confirmPermanentDeletion: true }, 'https://other.example')).status, 403);
  acting = staff; assert.equal((await fetch(base + '/api/storage')).status, 403);
  assert.equal((await post({ enabled: false, publishedDays: 30, trashDays: 7 })).status, 403); acting = admin;
  assert.equal((await post({ enabled: false, publishedDays: 30, trashDays: 7 })).status, 200);
  const report = await (await fetch(base + '/api/storage')).json();
  assert.equal(report.policy.enabled, false); assert.ok(report.inventory.freeBytes > 0); assert.ok(!JSON.stringify(report).includes(root));
});
