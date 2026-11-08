import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, truncate, unlink } from 'node:fs/promises';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { db } from '../db.js';
import { mediaDir } from '../paths.js';
import { MiB, reserveStorage, StorageError } from '../storage.js';
import type { Media } from './types.js';

const MAX = 200 * MiB;
let uploading = false;
/** While a chunked upload is open, its session; one video at a time, like a single-request upload. */
let session: ChunkSession | undefined;
/** Reads MP4 headers by offset, skipping mdat instead of buffering the entire video in RAM. */
export async function inspectMP4File(path: string) {
  const file = await open(path, 'r');
  try {
    const size = (await file.stat()).size; let width = 0, height = 0, duration = 0, count = 0;
    const read = async (at: number, n: number) => { const b = Buffer.alloc(n); const r = await file.read(b, 0, n, at); if (r.bytesRead !== n) throw new Error('Truncated MP4.'); return b; };
    if (size < 16 || (await read(0, 8)).toString('ascii', 4, 8) !== 'ftyp') throw new Error('Only MP4 is supported.');
    async function boxes(start: number, end: number, depth = 0): Promise<void> {
      if (depth > 6) throw new Error('Invalid MP4 nesting.');
      for (let at = start; at + 8 <= end;) {
        if (++count > 20_000) throw new Error('Too many MP4 boxes.');
        const h = await read(at, 8); let length = h.readUInt32BE(0), header = 8; const type = h.toString('ascii', 4, 8);
        if (length === 1) { if (at + 16 > end) throw new Error('Invalid MP4 box.'); length = Number((await read(at + 8, 8)).readBigUInt64BE()); header = 16; }
        if (length === 0) length = end - at;
        if (!Number.isSafeInteger(length) || length < header || at + length > end) throw new Error('Invalid MP4 box length.');
        if (['moov', 'trak', 'mdia'].includes(type)) await boxes(at + header, at + length, depth + 1);
        if (type === 'mvhd') {
          const version = (await read(at + header, 1))[0], n = version === 1 ? 32 : 20;
          if (length - header < n) throw new Error('Invalid duration.');
          const b = await read(at + header, n), scale = b.readUInt32BE(version === 1 ? 20 : 12), ticks = version === 1 ? Number(b.readBigUInt64BE(24)) : b.readUInt32BE(16);
          if (scale) duration = ticks / scale;
        }
        if (type === 'tkhd' && length >= 84) { const b = await read(at + length - 8, 8); width = Math.max(width, b.readUInt32BE(0) / 65536); height = Math.max(height, b.readUInt32BE(4) / 65536); }
        at += length;
      }
    }
    await boxes(0, size);
    if (!Number.isFinite(duration) || duration <= 0 || !width || !height) throw new Error('Video metadata missing.');
    return { width: Math.round(width), height: Math.round(height), duration, bytes: size };
  } finally { await file.close(); }
}
/** Checks the finished MP4 and attaches it to the post, unless the post was approved meanwhile. */
async function commitVideo(contentId: string, id: string, temporary: string, file: string) {
  const dimensions = await inspectMP4File(temporary);
  const media: Media = { url: `/api/social/assets/${id}`, type: 'video', mimeType: 'video/mp4', ...dimensions };
  await db.tx(async tx => {
    const now = new Date().toISOString();
    const locked = await tx.run("UPDATE content_items SET updated_at=? WHERE id=? AND status NOT IN ('approved','scheduled','published','archived','cancelled')", [now, contentId]);
    if (!locked.changes) throw new StorageError(409, 'approval_changed', 'أعد المنشور للتعديل قبل تغيير الفيديو المعتمد.');
    await rename(temporary, file);
    await tx.run('INSERT INTO social_media(id,content_id,path,metadata_json,created_at) VALUES(?,?,?,?,?)', [id, contentId, file, JSON.stringify(media), now]);
  });
  return { id, ...media };
}

export async function attachVideoStream(contentId: string, source: Readable, declaredBytes?: number) {
  if (declaredBytes != null && (!Number.isSafeInteger(declaredBytes) || declaredBytes < 1 || declaredBytes > MAX)) throw new StorageError(413, 'video_too_large', 'حجم الفيديو يجب ألا يتجاوز 200 ميجابايت.');
  await expireIdle();
  if (uploading || session) throw new StorageError(429, 'upload_busy', 'يوجد فيديو يُرفع الآن. حاول مجددًا بعد اكتماله لحماية سرعة التطبيق.');
  uploading = true;
  let release: (() => void) | undefined, temporary = '', file = '';
  try {
    release = await reserveStorage(declaredBytes ?? MAX);
    const id = randomUUID(); temporary = mediaDir('social', '.incoming', `${id}.part`); file = mediaDir('social', `${id}.mp4`);
    await mkdir(mediaDir('social', '.incoming'), { recursive: true });
    let bytes = 0;
    const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) { bytes += chunk.length; callback(bytes > (declaredBytes ?? MAX) ? new StorageError(413, 'video_too_large', 'حجم الفيديو تجاوز الحجم المسموح.') : null, chunk); } });
    // Do not let pipeline destroy the HTTP request before an actionable JSON error can be returned.
    const abort = () => limit.destroy(new Error('Upload interrupted.')); const closed = () => { if (!(source as { complete?: boolean }).complete) abort(); };
    source.once('aborted', abort); source.once('error', abort); source.once('close', closed); source.pipe(limit);
    try { await pipeline(limit, createWriteStream(temporary, { flags: 'wx' })); }
    finally { source.unpipe(limit); source.off('aborted', abort); source.off('error', abort); source.off('close', closed); }
    if (!bytes || declaredBytes != null && bytes !== declaredBytes) throw new Error('Incomplete upload.');
    const media = await commitVideo(contentId, id, temporary, file);
    temporary = ''; file = ''; return media;
  } finally {
    if (temporary) await unlink(temporary).catch(() => {}); if (file) await unlink(file).catch(() => {});
    release?.(); uploading = false;
  }
}

/**
 * Chunked uploads: a large Reel goes up in pieces of at most CHUNK_BYTES, each its own short request.
 * A single long request is cut by request time limits on slow connections (Safari shows "Load failed"),
 * and one dropped piece is retried on its own instead of starting the whole video again.
 */
export const CHUNK_BYTES = 8 * MiB;
const IDLE_MS = 10 * 60_000;
interface ChunkSession { id: string; contentId: string; userId: string; bytes: number; received: number; temporary: string; release: () => void; touched: number; writing: boolean }
async function dropSession() {
  const s = session; if (!s) return;
  session = undefined; s.release(); await unlink(s.temporary).catch(() => {});
}
/** An upload left idle (closed tab, lost connection) stops holding the slot and its reserved space. */
async function expireIdle() { if (session && !session.writing && Date.now() - session.touched > IDLE_MS) await dropSession(); }
function own(id: string, userId: string) {
  if (!session || session.id !== id || session.userId !== userId) throw new StorageError(404, 'upload_expired', 'انتهت جلسة رفع الفيديو. ابدأ الرفع من جديد.');
  return session;
}
export async function startVideoUpload(contentId: string, userId: string, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX) throw new StorageError(413, 'video_too_large', 'حجم الفيديو يجب ألا يتجاوز 200 ميجابايت.');
  await expireIdle();
  // The same person starting again on the same post replaces their earlier, unfinished attempt.
  if (session && session.userId === userId && session.contentId === contentId && !session.writing) await dropSession();
  if (session || uploading) throw new StorageError(429, 'upload_busy', 'يوجد فيديو يُرفع الآن. حاول مجددًا بعد اكتماله لحماية سرعة التطبيق.');
  const release = await reserveStorage(bytes);
  const id = randomUUID(), temporary = mediaDir('social', '.incoming', `${id}.part`);
  try { await mkdir(mediaDir('social', '.incoming'), { recursive: true }); await (await open(temporary, 'wx')).close(); }
  catch (error) { release(); throw error; }
  session = { id, contentId, userId, bytes, received: 0, temporary, release, touched: Date.now(), writing: false };
  return { uploadId: id, chunkBytes: CHUNK_BYTES };
}
/** Writes one piece at `offset`. A piece sent again after a lost reply simply rewrites the same bytes. */
export async function writeVideoChunk(id: string, userId: string, offset: number, source: Readable) {
  const s = own(id, userId);
  if (s.writing) throw new StorageError(409, 'upload_busy', 'جزء آخر من الفيديو يُرفع الآن.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > s.received) throw new StorageError(409, 'offset_mismatch', 'جزء من الفيديو وصل بترتيب خاطئ.');
  const limit = Math.min(CHUNK_BYTES, s.bytes - offset);
  s.writing = true; s.touched = Date.now();
  try {
    let written = 0;
    const cap = new Transform({ transform(chunk: Buffer, _encoding, callback) { written += chunk.length; callback(written > limit ? new StorageError(413, 'chunk_too_large', 'جزء الفيديو أكبر من المسموح.') : null, chunk); } });
    const abort = () => cap.destroy(new Error('Upload interrupted.')); const closed = () => { if (!(source as { complete?: boolean }).complete) abort(); };
    source.once('aborted', abort); source.once('error', abort); source.once('close', closed); source.pipe(cap);
    try { await pipeline(cap, createWriteStream(s.temporary, { flags: 'r+', start: offset })); }
    finally { source.unpipe(cap); source.off('aborted', abort); source.off('error', abort); source.off('close', closed); }
    if (!written) throw new StorageError(400, 'empty_chunk', 'جزء الفيديو وصل فاضي.');
    s.received = Math.max(s.received, offset + written);
    return { received: s.received, bytes: s.bytes };
  } finally { s.writing = false; s.touched = Date.now(); }
}
export async function finishVideoUpload(id: string, userId: string) {
  const s = own(id, userId);
  if (s.writing || s.received !== s.bytes) throw new StorageError(409, 'upload_incomplete', 'الفيديو لسه ما اترفعش كله.');
  const file = mediaDir('social', `${s.id}.mp4`);
  s.writing = true;
  try {
    await truncate(s.temporary, s.bytes);
    const media = await commitVideo(s.contentId, s.id, s.temporary, file);
    session = undefined; s.release(); return media;
  } catch (error) {
    // A video that is not a usable MP4, or a post approved meanwhile, ends this attempt.
    session = undefined; s.release(); await unlink(s.temporary).catch(() => {}); await unlink(file).catch(() => {}); throw error;
  }
}
export async function cancelVideoUpload(id: string, userId: string) { if (session?.id === id && session.userId === userId && !session.writing) await dropSession(); }
