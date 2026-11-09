import { DateTime } from 'luxon';
import { createHash } from 'node:crypto';
import type { Channel } from '../workspace.js';
import type { GoogleValues } from './client.js';

export const PUBLISHING_HEADERS = ['Post ID', 'Date', 'Time', 'Timezone', 'Post Title', 'Caption', 'Design', 'Thumbnail', 'Media Type', 'Platform', 'Ready', 'Notes', 'Status', 'Published URLs', 'Last Error', 'YouTube Privacy', 'YouTube Category', 'Made For Kids', 'TikTok Privacy', 'AI Generated', 'Snapchat Target', 'TikTok Commercial', 'Snapchat Locale'];
export const CHANNELS: Channel[] = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'snapchat', 'x', 'whatsapp', 'website'];
const aliases: Record<string, string> = { fb: 'facebook', ig: 'instagram', yt: 'youtube', twitter: 'x', 'tik tok': 'tiktok', 'فيسبوك': 'facebook', 'انستجرام': 'instagram', 'تيك توك': 'tiktok', 'يوتيوب': 'youtube', 'سناب شات': 'snapchat', 'لينكدإن': 'linkedin' };
export const header = (v: unknown) => String(v ?? '').trim().toLowerCase();
export const textCell = (v: unknown) => String(v ?? '').trim();
export function headersOf(values: GoogleValues) {
  const headers = (values[0] || []).map(header);
  const present = headers.filter(Boolean);
  if (new Set(present).size !== present.length) throw new Error('أسماء الأعمدة مكررة؛ اكتب كل عمود مرة واحدة.');
  for (const name of ['Post ID', 'Date', 'Time', 'Caption', 'Design', 'Platform', 'Media Type', 'Ready']) if (!headers.includes(header(name))) throw new Error(`العمود المطلوب ناقص: ${name}`);
  return headers;
}
export const rowObject = (headers: string[], row: GoogleValues[number]) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']));
export function rowFingerprint(row: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(Object.keys(row).filter(k => k && !['status', 'published urls', 'last error'].includes(k)).sort().map(k => [k, row[k]]))).digest('hex');
}
export interface PublishingRow {
  postId: string; title: string; caption: string; design: string; mediaType: 'image' | 'reel' | 'video' | 'carousel';
  channels: Channel[]; scheduledAt: string; timezone: string; ready: boolean; fingerprint: string; thumbnail?: string;
  youtubePrivacy?: string; youtubeCategory?: string; madeForKids?: boolean; tiktokPrivacy?: string; aiGenerated?: boolean; snapTarget?: 'story' | 'spotlight'; tiktokCommercial?: string; snapLocale?: string;
}
function yesNo(v: unknown, optional = false): boolean | undefined {
  const value = textCell(v).toUpperCase();
  if (optional && !value) return undefined;
  if (!['YES', 'NO', 'TRUE', 'FALSE'].includes(value)) throw new Error('اكتب YES أو NO في خانات Ready / Made For Kids / AI Generated.');
  return value === 'YES' || value === 'TRUE';
}
export function parsePublishingRow(row: Record<string, unknown>, defaultZone = 'Africa/Cairo'): PublishingRow {
  const postId = textCell(row['post id']);
  if (!/^[\w-]{1,100}$/.test(postId)) throw new Error('Post ID مطلوب بحروف إنجليزية وأرقام وشرطة، ولا يتكرر.');
  const timezone = textCell(row.timezone) || defaultZone;
  if (!DateTime.now().setZone(timezone).isValid) throw new Error('منطقة التوقيت غير صالحة.');
  let date = textCell(row.date);
  if (typeof row.date === 'number' && Number.isFinite(row.date) && row.date >= 1 && row.date < 100000)
    date = DateTime.fromISO('1899-12-30', { zone: 'UTC' }).plus({ days: Math.floor(row.date) }).toISODate()!;
  else if (row.date instanceof Date) date = row.date.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('اكتب التاريخ YYYY-MM-DD، مثل 2026-11-09.');
  let time = textCell(row.time);
  if (row.time instanceof Date) time = row.time.toISOString().slice(11, 16);
  else if (typeof row.time === 'number' && row.time >= 0 && row.time < 1) { const minutes = Math.round(row.time * 1440); time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('اكتب الساعة HH:mm بنظام 24 ساعة، مثل 13:30.');
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  // Luxon adjusts nonexistent local times; accepting that would silently move a publication.
  if (!dt.isValid || dt.toFormat('yyyy-MM-dd HH:mm') !== `${date} ${time}` || dt.getPossibleOffsets().length > 1) throw new Error('موعد غير صالح أو ملتبس بسبب تغيير التوقيت الصيفي؛ اختر ساعة أخرى.');
  const channels = [...new Set(textCell(row.platform).toLowerCase().split(/[,،/]|\s+-\s+/).map(s => s.trim()).filter(Boolean).map(p => aliases[p] || p))];
  if (!channels.length || channels.some(p => !CHANNELS.includes(p as Channel))) throw new Error('منصة غير معروفة؛ استخدم أسماء تابة Platforms وافصل بينها بفاصلة.');
  const mediaType = textCell(row['media type']).toLowerCase();
  if (!['image', 'reel', 'video', 'carousel'].includes(mediaType)) throw new Error('Media Type: image أو reel أو video أو carousel.');
  const thumbnail = textCell(row.thumbnail);
  if (thumbnail && (!['reel', 'video'].includes(mediaType) || thumbnail.length > 2048)) throw new Error('Thumbnail اختياري للريل والفيديو فقط؛ اتركه فارغًا للصور والكاروسيل.');
  const title = textCell(row['post title']), caption = textCell(row.caption), design = textCell(row.design);
  if (!title || title.length > 200 || !caption || caption.length > 63206 || !design || design.length > 2048) throw new Error('أكمل Post Title (حتى 200 حرف) وCaption وDesign.');
  const snapTarget = textCell(row['snapchat target']);
  if (snapTarget && !['story', 'spotlight'].includes(snapTarget)) throw new Error('Snapchat Target: story أو spotlight.');
  const tiktokCommercial = textCell(row['tiktok commercial']);
  if (tiktokCommercial && !['none', 'own', 'paid', 'both'].includes(tiktokCommercial)) throw new Error('TikTok Commercial: none / own / paid / both.');
  const snapLocale = textCell(row['snapchat locale']);
  if (snapLocale && !/^[a-z]{2}_[A-Z]{2}$/.test(snapLocale)) throw new Error('Snapchat Locale مثل ar_SA أو ar_EG أو en_US.');
  return { postId, title, caption, design, thumbnail: thumbnail || undefined, mediaType: mediaType as PublishingRow['mediaType'], channels: channels as Channel[], scheduledAt: dt.toUTC().toISO()!, timezone, ready: yesNo(row.ready)!, fingerprint: rowFingerprint(row), youtubePrivacy: textCell(row['youtube privacy']) || undefined, youtubeCategory: textCell(row['youtube category']) || undefined, madeForKids: yesNo(row['made for kids'], true), tiktokPrivacy: textCell(row['tiktok privacy']) || undefined, aiGenerated: yesNo(row['ai generated'], true), snapTarget: snapTarget as PublishingRow['snapTarget'] || undefined, tiktokCommercial: tiktokCommercial || undefined, snapLocale: snapLocale || undefined };
}
