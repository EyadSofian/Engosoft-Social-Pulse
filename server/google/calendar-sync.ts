import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { db } from '../db.js';
import { getUser, userCan, type AuthUser } from '../auth.js';
import { createContent, getContent, reopenContent, updateContent, type Channel } from '../workspace.js';
import { attachImage, attachVideo, contentMedia, resolveMedia } from '../social/media.js';
import { attachVideoStream } from '../social/video-upload.js';
import { preparePublishingImage, type ImageProfile } from '../social/image-preparation.js';
import { cancelQueued, contentQueue, getAccount } from '../social/store.js';
import { contentJobs } from '../social/publishing.js';
import { schedulePreparedPublications, validatePreparedPublication } from '../social/queue.js';
import type { PublishInput } from '../social/types.js';
import { chooseDriveMedia, GoogleClient, googleReference, quotedTab, type GoogleValues } from './client.js';
import { header, headersOf, parsePublishingRow, rowFingerprint, rowObject, textCell, type PublishingRow } from './format.js';
import { getSource, sourceRows, type GoogleRow, type GoogleSource } from './store.js';

export interface CalendarGoogleClient {
  metadata: GoogleClient['metadata']; values: GoogleClient['values']; writeValues: GoogleClient['writeValues'];
  file: GoogleClient['file']; children: GoogleClient['children']; download: GoogleClient['download'];
  downloadStream?: GoogleClient['downloadStream'];
}
/** Keep a high-resolution master; Instagram gets its own bounded copy from the same source. */
export const normalizeDriveImage = (buffer: Buffer, profile: ImageProfile = 'original') => preparePublishingImage(buffer, profile);

/**
 * Dashboard uploads: `local:<ids>` in the order the person arranged them, then `;<platform>=<i.j.k>` for a platform
 * with its own carousel order, as positions in that list. Null for Drive designs.
 */
export function localMediaPlan(design: string): { ids: string[]; orders: Partial<Record<Channel, number[]>> } | null {
  if (!design.startsWith('local:')) return null;
  const [main, ...rest] = design.split(';');
  const ids = main.slice(6).split(',').filter(Boolean);
  const orders: Partial<Record<Channel, number[]>> = {};
  for (const part of rest) {
    const [platform, positions] = part.split('=');
    if (!platform || !positions) continue;
    const list = positions.split('.').map(Number);
    if (list.some((n) => !Number.isInteger(n) || n < 0 || n >= ids.length) || new Set(list).size !== list.length) throw new Error(`ترتيب الكاروسيل لمنصة ${platform} غير صالح؛ رتّب الصور تاني.`);
    orders[platform as Channel] = list;
  }
  return { ids, orders };
}

async function prepareMedia(client: CalendarGoogleClient, row: PublishingRow, contentId: string, localAllowed = false) {
  if (row.design.startsWith('local:')) {
    if (!localAllowed) throw new Error('الميديا المحلية متاحة لمنشورات الداشبورد فقط.');
    const ids = localMediaPlan(row.design)!.ids, attachments = await contentMedia(contentId);
    const selected = ids.map(id => attachments.find(m => m.id === id && !m.role));
    if (!selected.length || selected.some(m => !m) || new Set(ids).size !== ids.length) throw new Error('اختار الملفات المرفوعة على المنشور.');
    const media = selected as NonNullable<typeof selected[number]>[];
    if (row.mediaType === 'carousel' ? media.length < 2 || media.some(m => m.type !== 'image') : media.length !== 1 || media[0].type !== (row.mediaType === 'image' ? 'image' : 'video')) throw new Error('الملفات لا تطابق نوع المنشور؛ الكاروسيل يحتاج صورتين على الأقل.');
    await db.run("UPDATE social_media SET storage_state='quarantined',quarantined_at=? WHERE content_id=? AND storage_state='active' AND id NOT IN (" + ids.map(() => '?').join(',') + ')', [new Date().toISOString(),contentId,...ids]);
    if (row.channels.includes('instagram')) for (const m of media.filter(m => m.type === 'image')) {
      const [asset] = await resolveMedia((await getContent(contentId))!, [m.url]);
      const bytes = await readFile(asset.file), variant = await normalizeDriveImage(bytes, 'instagram');
      if (!bytes.equals(variant)) await attachImage(contentId, variant, undefined, { provider:'instagram', sourceAssetId:m.id });
    }
    return media;
  }
  const ref = googleReference(row.design), file = await client.file(ref);
  file.resourceKey ||= ref.resourceKey;
  const selected = chooseDriveMedia(file.mimeType === 'application/vnd.google-apps.folder' ? await client.children(file) : [file], row.mediaType);
  if (selected[0].mimeType === 'video/mp4' && client.downloadStream) {
    const video = await attachVideoStream(contentId, await client.downloadStream(selected[0]), selected[0].size ? Number(selected[0].size) : undefined);
    await db.run("UPDATE social_media SET storage_state='quarantined',quarantined_at=? WHERE content_id=? AND id!=? AND storage_state='active'", [new Date().toISOString(), contentId, video.id]);
    return [video];
  }
  // Prepare all bytes before attaching: invalid files never produce a partly approved carousel.
  const prepared: { type: 'image' | 'video'; bytes: Buffer; instagram?: Buffer }[] = [];
  for (const item of selected) {
    const bytes = await client.download(item);
    const image = item.mimeType.startsWith('image/');
    prepared.push({ type: image ? 'image' : 'video', bytes: image ? await normalizeDriveImage(bytes) : bytes,
      ...(image && row.channels.includes('instagram') ? { instagram: await normalizeDriveImage(bytes, 'instagram') } : {}) });
  }
  // Retired assets stay recoverable but cannot be selected for a future publication.
  await db.run("UPDATE social_media SET storage_state='quarantined',quarantined_at=? WHERE content_id=? AND storage_state='active'", [new Date().toISOString(), contentId]);
  const media = [];
  for (const item of prepared) {
    const master = item.type === 'image' ? await attachImage(contentId, item.bytes) : await attachVideo(contentId, item.bytes);
    media.push(master);
    if (item.instagram && !item.instagram.equals(item.bytes)) await attachImage(contentId, item.instagram, undefined, { provider: 'instagram', sourceAssetId: master.id });
  }
  return media;
}

async function prepareThumbnail(client: CalendarGoogleClient, row: PublishingRow, contentId: string) {
  if (!row.thumbnail) return;
  const ref = googleReference(row.thumbnail), file = await client.file(ref);
  file.resourceKey ||= ref.resourceKey;
  const [image] = chooseDriveMedia(file.mimeType === 'application/vnd.google-apps.folder' ? await client.children(file) : [file], 'image');
  return attachImage(contentId, await normalizeDriveImage(await client.download(image), 'thumbnail'), 'thumbnail');
}

const canonicalInput = (rows: GoogleValues) => {
  const headers = headersOf(rows);
  return JSON.stringify(rows.slice(1).filter(row => row.some(v => textCell(v))).map(row => rowFingerprint(rowObject(headers, row))).sort());
};
export function columnLetter(index: number) { let value = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(65 + (n - 1) % 26) + value; return value; }

/** Literal UUIDs survive sorting and row insertion. Blank/formatted template rows do not get IDs. */
export function missingPostIds(values: GoogleValues) {
  const headers = headersOf(values), idColumn = headers.indexOf('post id');
  const contentColumns = ['date', 'time', 'post title', 'caption', 'design', 'thumbnail', 'platform', 'media type'].map(h => headers.indexOf(h)).filter(i => i >= 0);
  return values.slice(1).flatMap((row, index) => !textCell(row[idColumn]) && contentColumns.some(col => textCell(row[col]))
    ? [{ rowIndex: index + 1, idColumn, id: `ENG-${randomUUID()}` }] : []);
}

async function ensurePostIds(source: GoogleSource, client: CalendarGoogleClient, initial: GoogleValues) {
  const pending = missingPostIds(initial);
  if (!pending.length) return initial;
  const filled = structuredClone(initial);
  for (const item of pending) { while (filled[item.rowIndex].length <= item.idColumn) filled[item.rowIndex].push(''); filled[item.rowIndex][item.idColumn] = item.id; }
  if (source.snapshot_json) {
    const changed = await db.run('UPDATE google_calendar_sources SET snapshot_json=? WHERE id=? AND revision=?', [JSON.stringify(filled), source.id, source.revision]);
    if (!changed.changes) throw new Error('تغير ملف الكالندر أثناء توليد المعرّفات؛ أعد المزامنة.');
    return filled;
  }
  // Re-read before assigning cells: never seed an ID from a stale row position.
  const latest = await client.values(source.spreadsheet_id, source.tab);
  if (canonicalInput(initial) !== canonicalInput(latest)) throw new Error('تغير الشيت أثناء توليد Post ID؛ ستتم مراجعته من جديد.');
  await client.writeValues(source.spreadsheet_id, pending.map(item => ({ range: `${quotedTab(source.tab)}!${columnLetter(item.idColumn)}${item.rowIndex + 1}`, values: [[item.id]] })));
  const committed = await client.values(source.spreadsheet_id, source.tab);
  if (canonicalInput(committed) !== canonicalInput(filled)) throw new Error('لم يثبت Post ID بعد؛ أعد المزامنة قبل الجدولة.');
  return committed;
}

export async function rowOutcome(row: GoogleRow) {
  const jobs = await contentJobs(row.content_id), queue = await contentQueue(row.content_id);
  const channels = JSON.parse(row.channels_json) as Channel[];
  const latest = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) if (!latest.has(job.accountId)) latest.set(job.accountId, job);
  const completed = [...latest.values()].filter(j => j.state === 'published' && j.externalId);
  const urls = completed.filter(j => j.url).map(j => `${j.provider}: ${j.url}`).join('\n');
  const errors = [row.error, ...[...latest.values()].filter(j => ['failed', 'unknown', 'awaiting_user'].includes(j.state)).map(j => `${j.provider}: ${j.error || j.state}`), ...queue.filter(q => q.state === 'failed' && !q.jobId).map(q => `${q.accountId}: ${q.error}`)].filter(Boolean).join('\n');
  const done = new Set(completed.map(j => j.provider));
  const all = channels.length > 0 && channels.every(c => done.has(c as never));
  const active = [...latest.values()].some(j => ['processing', 'unknown', 'awaiting_user'].includes(j.state)) || queue.some(q => q.state === 'sending');
  const waiting = queue.some(q => q.state === 'queued');
  const status = all ? 'published' : completed.length ? 'partial' : active ? 'publishing' : waiting ? 'scheduled' : errors && row.status !== 'draft' ? (jobs.length || queue.some(q => q.state === 'failed') ? 'failed' : 'blocked') : row.status;
  return { status, urls, errors };
}

async function applyRow(source: GoogleSource, mapping: GoogleRow, row: PublishingRow, user: AuthUser, client: CalendarGoogleClient) {
  let item = await getContent(mapping.content_id);
  const targets = JSON.parse(source.targets_json) as Record<string, string>;
  const fingerprint = `${row.fingerprint}:${JSON.stringify(Object.entries(targets).sort())}:${source.enabled}`;
  if (mapping.fingerprint === fingerprint) return;
  await cancelQueued(mapping.content_id, 'Spreadsheet input changed.');
  const jobs = await contentJobs(mapping.content_id);
  if (jobs.length) throw new Error('بدأت محاولة نشر لهذا البوست؛ راجع نتيجتها في التطبيق. تعديل الصف لا يعيد نشره. استخدم بوستًا جديدًا فقط لمحتوى جديد.');
  if (item && ['approved', 'scheduled'].includes(item.status)) item = await reopenContent(user, item.id, 'تحديث من Google Sheets');
  if (item && ['published', 'cancelled', 'archived'].includes(item.status)) throw new Error('البوست منشور أو ملغي أو مؤرشف؛ راجع حالته داخل التطبيق.');
  const captions = Object.fromEntries(row.channels.map(c => [c, row.caption]));
  if (!item) item = await createContent(user, { title: row.title, channels: row.channels, captions, creative: null, plannedFor: row.scheduledAt }, mapping.content_id);
  else item = await updateContent(user, item.id, { title: row.title, channels: row.channels, captions, plannedFor: row.scheduledAt });
  await db.run('UPDATE google_calendar_rows SET channels_json=? WHERE source_id=? AND post_id=?', [JSON.stringify(row.channels), source.id, row.postId]);
  if (!row.ready || !source.enabled) {
    await db.run("UPDATE google_calendar_rows SET fingerprint=?,status='draft',error='' WHERE source_id=? AND post_id=?", [fingerprint, source.id, row.postId]);
    return;
  }
  if (Date.parse(row.scheduledAt) <= Date.now()) throw new Error('ميعاد النشر مضى؛ حدد ميعادًا مستقبليًا ثم اترك Ready = YES.');
  // A new per-platform order is a new publication plan, not new files: only the uploaded list counts here.
  const plan = localMediaPlan(row.design);
  const mediaFingerprint = `quality-v2:${plan ? row.design.split(';')[0] : row.design}:${row.mediaType}:${row.channels.includes('instagram')}${row.thumbnail ? `:thumbnail:${row.thumbnail}` : ''}`;
  if (mapping.media_fingerprint !== mediaFingerprint || !(await contentMedia(item.id)).length) {
    await prepareMedia(client, row, item.id, source.spreadsheet_id.startsWith('native:'));
    await prepareThumbnail(client, row, item.id);
    await db.run('UPDATE google_calendar_rows SET media_fingerprint=? WHERE source_id=? AND post_id=?', [mediaFingerprint, source.id, row.postId]);
  }
  const attachments = await contentMedia(item.id, true), thumbnail = attachments.find(m => m.role === 'thumbnail');
  // Uploaded files go out in the order the person arranged them, not in upload order.
  const unordered = attachments.filter(m => !m.role);
  const media = plan ? plan.ids.map(id => unordered.find(m => m.id === id)).filter((m): m is typeof unordered[number] => Boolean(m)) : unordered;
  const inputs: PublishInput[] = [], errors: string[] = [];
  // The imported artwork also appears in ordinary content cards and the calendar preview.
  await updateContent(user, item.id, { creative: media[0]?.type === 'image' ? { requestId: 'drive-import', directionId: row.mediaType, imageUrl: media[0].url, directionName: 'Google Drive' } : thumbnail ? { requestId: 'reel', directionId: row.mediaType, imageUrl: thumbnail.url, reelCover: { url: thumbnail.url }, directionName: 'Google Drive' } : null });
  for (const channel of row.channels) {
    try {
      if (['x', 'whatsapp', 'website'].includes(channel)) throw new Error('المنصة مسجلة للتخطيط؛ الربط الحالي يحتاج نشرًا يدويًا من صفحة البوست.');
      const account = targets[channel] ? await getAccount(targets[channel]) : undefined;
      if (!account || account.provider !== channel) throw new Error('حدد حساب النشر المقصود في إعدادات الشيت بالتطبيق.');
      if (channel === 'tiktok' && !row.tiktokCommercial) throw new Error('حدد TikTok Commercial: none أو own أو paid أو both.');
      // A platform with its own carousel order gets those files in that order; the rest get the main order.
      const own = plan?.orders[channel];
      const chosen = own?.length ? own.map(index => media[index]).filter((m): m is typeof media[number] => Boolean(m)) : media;
      if (row.mediaType === 'carousel' && chosen.length < 2) throw new Error('الكاروسيل محتاج صورتين على الأقل لهذه المنصة.');
      const platformMedia = channel === 'instagram' ? chosen.map(m => attachments.find(v => v.variantFor === 'instagram' && v.sourceAssetId === m.id) || m) : chosen;
      const input: PublishInput = { contentId: item.id, accountId: account.id, kind: row.mediaType === 'reel' ? 'video' : row.mediaType, media: platformMedia, mode: 'direct', consent: true,
        ...(channel === 'youtube' ? { privacy: row.youtubePrivacy, categoryId: row.youtubeCategory, madeForKids: row.madeForKids } : {}),
        ...(channel === 'tiktok' ? { privacy: row.tiktokPrivacy, isAiGenerated: row.aiGenerated, brandOrganic: ['own', 'both'].includes(row.tiktokCommercial || ''), brandContent: ['paid', 'both'].includes(row.tiktokCommercial || ''), disableComment: true, disableDuet: true, disableStitch: true } : {}),
        ...(channel === 'snapchat' ? { snapTarget: row.snapTarget, locale: row.snapLocale } : {}),
      };
      await validatePreparedPublication(user, input); inputs.push(input);
    } catch (error) { errors.push(`${channel}: ${error instanceof Error ? error.message : 'تعذّر تجهيز المنصة.'}`); }
  }
  if (inputs.length) await schedulePreparedPublications(user, item.id, inputs, row.scheduledAt, source.id);
  // A partial selection is still one completed snapshot; polling never recreates its waiting queue.
  await db.run('UPDATE google_calendar_rows SET fingerprint=?,status=?,error=?,updated_at=? WHERE source_id=? AND post_id=?', [fingerprint, inputs.length ? 'scheduled' : 'blocked', errors.join('\n'), new Date().toISOString(), source.id, row.postId]);
}

/** One persistent lease arbitrates between manual checks, workers and multiple server replicas. */
export async function syncGoogleSource(id: string, clientOverride?: CalendarGoogleClient) {
  let source = await getSource(id);
  if (!source) throw new Error('الشيت غير مربوط.');
  const token = randomUUID();
  if (!(await db.run('UPDATE google_calendar_sources SET lock_token=?,lock_until=? WHERE id=? AND lock_until<?', [token, Date.now() + 120_000, id, Date.now()])).changes) throw new Error('توجد مزامنة جارية لهذا الشيت.');
  const heartbeat = setInterval(() => { void db.run('UPDATE google_calendar_sources SET lock_until=? WHERE id=? AND lock_token=?', [Date.now() + 120_000, id, token]).catch(() => {}); }, 30_000);
  heartbeat.unref();
  try {
    source = (await getSource(id))!;
    const user = await getUser(source.owner_id);
    if (!user || user.status !== 'active' || !['connections.manage', 'content.create', 'content.edit_own', 'content.schedule', 'content.publish'].every(p => userCan(user, p as never))) throw new Error('المسؤول عن الربط لم يعد يملك صلاحيات الربط والإنشاء والجدولة والنشر.');
    const google = new GoogleClient(user.id);
    const client: CalendarGoogleClient = clientOverride || (source.snapshot_json ? {
      metadata: async () => ({ properties: { title: 'Uploaded calendar', timeZone: 'Africa/Cairo' }, sheets: [{ properties: { title: source!.tab, sheetId: 0 } }] }),
      values: async () => JSON.parse((await getSource(id))!.snapshot_json!) as GoogleValues,
      writeValues: async () => undefined,
      file: google.file.bind(google), children: google.children.bind(google), download: google.download.bind(google),
      downloadStream: google.downloadStream.bind(google),
    } : google);
    const meta = await client.metadata(source.spreadsheet_id);
    if (!meta.sheets.some(s => s.properties.title === source!.tab)) throw new Error('تابة الكالندر غير موجودة؛ اختر اسم التابة الصحيح.');
    const values = await ensurePostIds(source, client, await client.values(source.spreadsheet_id, source.tab)), headers = headersOf(values);
    const rawRows = values.slice(1).map(row => rowObject(headers, row)).filter(row => Object.entries(row).some(([k, v]) => !['status', 'published urls', 'last error'].includes(k) && textCell(v)));
    const ids = rawRows.map(row => textCell(row['post id']));
    const duplicates = new Set(ids.filter((id, i) => id && ids.indexOf(id) !== i));
    const previous = await sourceRows(id);
    for (const old of previous) if (!ids.includes(old.post_id) || duplicates.has(old.post_id)) {
      await cancelQueued(old.content_id, 'Spreadsheet row removed or duplicated.');
      await db.run("UPDATE google_calendar_rows SET fingerprint='',status='blocked',error=? WHERE source_id=? AND post_id=?", ['الصف محذوف أو Post ID مكرر؛ توقفت الجدولة المنتظرة.', id, old.post_id]);
    }
    const rowErrors: string[] = [], invalid = new Map<string, string>();
    for (const [index, raw] of rawRows.entries()) {
      const postId = textCell(raw['post id']);
      if (!postId || duplicates.has(postId)) { rowErrors.push(`صف ${index + 2}: Post ID فارغ أو مكرر.`); continue; }
      let mapping = previous.find(r => r.post_id === postId);
      try {
        const row = parsePublishingRow(raw, meta.properties.timeZone);
        if (!mapping) {
          await db.run('INSERT INTO google_calendar_rows(source_id,post_id,content_id,updated_at) VALUES(?,?,?,?)', [id, postId, randomUUID(), new Date().toISOString()]);
          mapping = (await sourceRows(id)).find(r => r.post_id === postId)!;
        }
        await applyRow(source, mapping, row, user, client);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'تعذّرت قراءة الصف.';
        rowErrors.push(`${postId}: ${message}`);
        invalid.set(postId, message);
        if (mapping) {
          await cancelQueued(mapping.content_id, 'Spreadsheet row is invalid or changed.');
          await db.run("UPDATE google_calendar_rows SET fingerprint='',status='blocked',error=?,updated_at=? WHERE source_id=? AND post_id=?", [message, new Date().toISOString(), id, postId]);
        }
      }
    }
    // Resolve rows again by stable ID after downloads. Never write results into a row moved/replaced during sync.
    const current = await client.values(source.spreadsheet_id, source.tab);
    if (canonicalInput(values) !== canonicalInput(current)) throw new Error('تغيرت بيانات الشيت أثناء المزامنة؛ ستُراجع من جديد قبل النشر.');
    if ((await getSource(id))?.revision !== source.revision) throw new Error('تغيرت إعدادات الربط أثناء المزامنة؛ أعد الفحص.');
    const currentHeaders = headersOf(current), mappings = await sourceRows(id), data: { range: string; values: string[][] }[] = [];
    const summary = [];
    for (const mapping of mappings) {
      const outcome = await rowOutcome(mapping); summary.push({ postId: mapping.post_id, contentId: mapping.content_id, ...outcome });
      const rowIndexes = current.slice(1).flatMap((r, i) => textCell(r[currentHeaders.indexOf('post id')]) === mapping.post_id ? [i + 2] : []);
      if (rowIndexes.length !== 1) continue;
      for (const [name, value] of [['Status', outcome.status], ['Published URLs', outcome.urls], ['Last Error', outcome.errors]]) {
        const col = currentHeaders.indexOf(header(name));
        if (col >= 0) data.push({ range: `${quotedTab(source.tab)}!${columnLetter(col)}${rowIndexes[0]}`, values: [[value]] });
      }
    }
    for (const [postId, message] of invalid) {
      if (mappings.some(m => m.post_id === postId)) continue;
      const indexes = current.slice(1).flatMap((r, i) => textCell(r[currentHeaders.indexOf('post id')]) === postId ? [i + 2] : []);
      if (indexes.length !== 1) continue;
      for (const [name, value] of [['Status', 'blocked'], ['Last Error', message]]) {
        const col = currentHeaders.indexOf(header(name));
        if (col >= 0) data.push({ range: `${quotedTab(source.tab)}!${columnLetter(col)}${indexes[0]}`, values: [[value]] });
      }
    }
    for (let offset = 0; offset < data.length; offset += 300) await client.writeValues(source.spreadsheet_id, data.slice(offset, offset + 300));
    const committed = await db.run('UPDATE google_calendar_sources SET last_sync_at=?,error=NULL,validation_errors_json=? WHERE id=? AND lock_token=? AND revision=?', [Date.now(), JSON.stringify(rowErrors), id, token, source.revision]);
    if (!committed.changes) throw new Error('تغيرت إعدادات الربط؛ أعد الفحص قبل النشر.');
    return { rows: summary, errors: rowErrors };
  } catch (error) {
    await db.run('UPDATE google_calendar_sources SET error=? WHERE id=? AND lock_token=?', [error instanceof Error ? error.message : 'Google synchronization failed.', id, token]);
    throw error;
  } finally {
    clearInterval(heartbeat);
    await db.run('UPDATE google_calendar_sources SET lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?', [id, token]);
  }
}

let running = false;
export async function syncGoogleCalendars() {
  if (running) return;
  running = true;
  try { for (const source of await db.all<GoogleSource>('SELECT * FROM google_calendar_sources WHERE enabled=1 ORDER BY id')) await syncGoogleSource(source.id).catch(() => {}); }
  finally { running = false; }
}
