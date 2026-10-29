import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { db } from '../db.js';
import { mediaDir } from '../paths.js';
import { MiB, reserveStorage, StorageError } from '../storage.js';
import type { Media } from './types.js';

const MAX = 200 * MiB;
let uploading = false;
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
export async function attachVideoStream(contentId: string, source: Readable, declaredBytes?: number) {
  if (declaredBytes != null && (!Number.isSafeInteger(declaredBytes) || declaredBytes < 1 || declaredBytes > MAX)) throw new StorageError(413, 'video_too_large', 'حجم الفيديو يجب ألا يتجاوز 200 ميجابايت.');
  if (uploading) throw new StorageError(429, 'upload_busy', 'يوجد فيديو يُرفع الآن. حاول مجددًا بعد اكتماله لحماية سرعة التطبيق.');
  uploading = true;
  let release: (() => void) | undefined, temporary = '', file = '';
  try {
    release = await reserveStorage(declaredBytes ?? MAX);
    const id = randomUUID(); temporary = mediaDir('social', '.incoming', `${id}.part`); file = mediaDir('social', `${id}.mp4`);
    await mkdir(mediaDir('social', '.incoming'), { recursive: true });
    let bytes = 0;
    const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) { bytes += chunk.length; callback(bytes > (declaredBytes ?? MAX) ? new StorageError(413, 'video_too_large', 'حجم الفيديو تجاوز الحجم المسموح.') : null, chunk); } });
    // Do not let pipeline destroy the HTTP request before an actionable JSON error can be returned.
    const abort = () => limit.destroy(new Error('Upload interrupted.')); source.once('aborted', abort); source.once('error', abort); source.pipe(limit);
    try { await pipeline(limit, createWriteStream(temporary, { flags: 'wx' })); }
    finally { source.unpipe(limit); source.off('aborted', abort); source.off('error', abort); }
    if (!bytes || declaredBytes != null && bytes !== declaredBytes) throw new Error('Incomplete upload.');
    const dimensions = await inspectMP4File(temporary);
    const media: Media = { url: `/api/social/assets/${id}`, type: 'video', mimeType: 'video/mp4', ...dimensions };
    await db.tx(async tx => {
      const now = new Date().toISOString();
      const locked = await tx.run("UPDATE content_items SET updated_at=? WHERE id=? AND status NOT IN ('approved','scheduled','published','archived','cancelled')", [now, contentId]);
      if (!locked.changes) throw new StorageError(409, 'approval_changed', 'أعد المنشور للتعديل قبل تغيير الفيديو المعتمد.');
      await rename(temporary, file);
      await tx.run('INSERT INTO social_media(id,content_id,path,metadata_json,created_at) VALUES(?,?,?,?,?)', [id, contentId, file, JSON.stringify(media), now]);
    });
    temporary = ''; file = ''; return { id, ...media };
  } finally {
    if (temporary) await unlink(temporary).catch(() => {}); if (file) await unlink(file).catch(() => {});
    release?.(); uploading = false;
  }
}
