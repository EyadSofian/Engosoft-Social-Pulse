/** Google credentials belong to this app, independently of the assistant's Drive connection. */
import { loadSecret, saveSecret } from '../social/store.js';
import { ProviderError, request } from '../social/http.js';
import type { Credential } from '../social/types.js';
import { Readable } from 'node:stream';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets'];
/** Legacy per-user grant; still used when the team has no shared Google account yet. */
export const googleSecret = (owner: string) => `google-calendar:${owner}`;
/** One Google account (the company Drive) that every teammate publishes through. */
export const GOOGLE_SHARED_SECRET = 'google-calendar:workspace';
export type GoogleCredential = Credential & { email?: string; connectedBy?: string };
const usable = (c?: GoogleCredential) => Boolean(c && GOOGLE_SCOPES.every(s => c.scopes.includes(s)));
/** The shared company grant wins; a teammate's old personal grant is only a fallback. */
export async function googleGrant(owner: string): Promise<{ id: string; credential: GoogleCredential; shared: boolean } | undefined> {
  const shared = await loadSecret<GoogleCredential>(GOOGLE_SHARED_SECRET);
  if (usable(shared)) return { id: GOOGLE_SHARED_SECRET, credential: shared!, shared: true };
  const own = await loadSecret<GoogleCredential>(googleSecret(owner));
  return usable(own) ? { id: googleSecret(owner), credential: own!, shared: false } : undefined;
}
export function googleConfig() {
  const client = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;
  const origin = new URL(process.env.APP_URL || 'http://127.0.0.1:4100').origin;
  const redirect = process.env.GOOGLE_DRIVE_REDIRECT_URI || `${origin}/api/oauth/drive/callback`;
  const uri = new URL(redirect);
  if (!client || !secret || uri.origin !== origin || uri.pathname !== '/api/oauth/drive/callback' || uri.search || uri.hash || uri.username || uri.password || (uri.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(uri.hostname)) || Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64').length !== 32)
    throw new Error('أعدّ Google OAuth ومفتاح التشفير على الخادم.');
  return { client, secret, redirect };
}
const refreshing = new Map<string, Promise<string>>();
export async function googleToken(owner: string): Promise<string> {
  const grant = await googleGrant(owner);
  if (!grant) throw new Error('Google Drive مش مربوط. اربط حساب Google بتاع الشركة مرة واحدة من خانة لينك الدرايف أو من الكالندر.');
  const id = grant.id, existing = refreshing.get(id);
  if (existing) return existing;
  const promise = (async () => {
    const saved = (await loadSecret<GoogleCredential>(id)) || grant.credential;
    if (saved.expiresAt > Date.now() + 300_000) return saved.accessToken;
    const config = googleConfig();
    if (!saved.refreshToken) throw new Error('أعد تفويض Google لتفعيل المزامنة المستمرة.');
    const value = await request<{ access_token: string; expires_in: number; refresh_token?: string }>('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refreshToken, client_id: config.client!, client_secret: config.secret! }),
    });
    if (!value.access_token) throw new Error('تعذّر تجديد تفويض Google.');
    const next: GoogleCredential = { ...saved, accessToken: value.access_token, refreshToken: value.refresh_token || saved.refreshToken, expiresAt: Date.now() + value.expires_in * 1000 };
    await saveSecret(id, next);
    return next.accessToken;
  })().finally(() => refreshing.delete(id));
  refreshing.set(id, promise);
  return promise;
}

export function googleReference(value: string, kind: 'drive' | 'sheet' = 'drive') {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('اكتب رابط Google Drive أو Sheets كاملًا.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !['drive.google.com', 'docs.google.com'].includes(url.hostname)) throw new Error('الرابط لازم يكون من Google Drive أو Sheets.');
  const match = kind === 'sheet' ? /^\/spreadsheets\/d\/([\w-]+)/.exec(url.pathname) : /\/(?:folders|d)\/([\w-]+)/.exec(url.pathname);
  const id = match?.[1] || (kind === 'drive' && url.hostname === 'drive.google.com' ? url.searchParams.get('id') : null);
  if (!id || !/^[\w-]{10,200}$/.test(id)) throw new Error('رابط Google لا يحتوي معرّف ملف صالح.');
  return { id, resourceKey: url.searchParams.get('resourcekey') || undefined };
}
export interface DriveFile { id: string; name: string; mimeType: string; size?: string; resourceKey?: string; capabilities?: { canDownload?: boolean }; trashed?: boolean }
export type GoogleValues = (string | number | boolean | null)[][];
export const quotedTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

const FILE_TYPES: Record<string, string> = { 'video/quicktime': 'MOV', 'video/x-msvideo': 'AVI', 'video/webm': 'WebM', 'video/x-matroska': 'MKV', 'video/3gpp': '3GP', 'image/heic': 'HEIC', 'image/heif': 'HEIF', 'image/gif': 'GIF', 'application/vnd.google-apps.shortcut': 'اختصار (Shortcut)' };
const fileType = (mime: string) => FILE_TYPES[mime] || mime;

/** Drive answers 403/404 when the connected account simply can't see the file; say that plainly. */
async function driveAccessError(error: unknown, owner: string): Promise<never> {
  const status = error instanceof ProviderError ? error.status : Number(/HTTP (\d+)/.exec(error instanceof Error ? error.message : '')?.[1] || 0);
  if (status === 403 || status === 404) {
    const email = (await googleGrant(owner).catch(() => undefined))?.credential.email;
    throw new Error(`حساب Google المربوط${email ? ` (${email})` : ''} مش قادر يفتح الملف ده. اعمل Share للملف أو الفولدر مع الحساب ده، أو انقله لدرايف الشركة، وبعدين احفظ البوست تاني.`);
  }
  if (status === 401) throw new Error('تفويض Google انتهى؛ اربط Google Drive تاني من الكالندر.');
  throw error;
}

export class GoogleClient {
  constructor(private owner: string) {}
  private async json<T>(url: string, init: RequestInit = {}, resource?: { id: string; resourceKey?: string }) {
    return request<T>(url, { ...init, headers: { Authorization: `Bearer ${await googleToken(this.owner)}`, ...(resource?.resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${resource.id}/${resource.resourceKey}` } : {}), ...init.headers } }, !init.method || init.method === 'GET');
  }
  async metadata(id: string) {
    return this.json<{ properties: { title: string; timeZone: string }; sheets: { properties: { title: string; sheetId: number } }[] }>(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties(title,timeZone),sheets(properties(title,sheetId))`);
  }
  async values(id: string, tab: string): Promise<GoogleValues> {
    // Serial dates avoid locale-dependent day/month inversions. Limit is intentional and visible.
    const range = encodeURIComponent(`${quotedTab(tab)}!A1:AZ2001`);
    const result = await this.json<{ values?: GoogleValues }>(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
    if ((result.values?.length || 0) > 2000) throw new Error('الشيت يتجاوز حد 1999 بوست؛ قسّمه إلى تابات أصغر.');
    return result.values || [];
  }
  async writeValues(id: string, data: { range: string; values: string[][] }[]) {
    if (!data.length) return;
    return this.json(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valueInputOption: 'RAW', data }) });
  }
  async file(ref: { id: string; resourceKey?: string }): Promise<DriveFile> {
    const file = await this.json<DriveFile>(`https://www.googleapis.com/drive/v3/files/${ref.id}?supportsAllDrives=true&fields=id,name,mimeType,size,resourceKey,capabilities(canDownload),trashed`, {}, ref).catch(e => driveAccessError(e, this.owner));
    if (file.trashed) throw new Error('ملف Drive موجود في سلة المهملات.');
    return file;
  }
  async children(folder: DriveFile): Promise<DriveFile[]> {
    const files: DriveFile[] = []; let token = '';
    do {
      const query = new URLSearchParams({ q: `'${folder.id}' in parents and trashed=false`, pageSize: '100', fields: 'nextPageToken,files(id,name,mimeType,size,resourceKey,capabilities(canDownload))', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(token ? { pageToken: token } : {}) });
      const page = await this.json<{ files: DriveFile[]; nextPageToken?: string }>(`https://www.googleapis.com/drive/v3/files?${query}`, {}, folder).catch(e => driveAccessError(e, this.owner));
      files.push(...page.files); token = page.nextPageToken || '';
      if (files.length > 500) throw new Error('الفولدر كبير جدًا؛ استخدم فولدرًا خاصًا بالبوست.');
    } while (token);
    return files;
  }
  private async downloadResponse(file: DriveFile) {
    const limit = file.mimeType.startsWith('image/') ? 40 * 1024 * 1024 : 200 * 1024 * 1024;
    if (file.capabilities?.canDownload === false || Number(file.size || 0) > limit) throw new Error('تنزيل الملف غير مسموح أو حجمه يتجاوز الحد (40MB للصورة / 200MB للفيديو).');
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${await googleToken(this.owner)}`, ...(file.resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${file.id}/${file.resourceKey}` } : {}) }, signal: AbortSignal.timeout(120_000), redirect: 'error' });
    if (!response.ok || !response.body) await driveAccessError(new Error(`تعذّر تنزيل ملف Drive (HTTP ${response.status}).`), this.owner);
    if (!response.body) throw new Error('تعذّر تنزيل ملف Drive.');
    return response;
  }
  async downloadStream(file: DriveFile): Promise<Readable> {
    return Readable.fromWeb((await this.downloadResponse(file)).body as never);
  }
  async download(file: DriveFile): Promise<Buffer> {
    const limit = file.mimeType.startsWith('image/') ? 40 * 1024 * 1024 : 200 * 1024 * 1024;
    const response = await this.downloadResponse(file);
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      bytes += chunk.length;
      if (bytes > limit) { await response.body?.cancel().catch(() => {}); throw new Error('الملف يتجاوز حد الحجم المسموح.'); }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

export function chooseDriveMedia(files: DriveFile[], type: string): DriveFile[] {
  const image = (f: DriveFile) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.mimeType);
  const selected = files.filter(f => type === 'image' || type === 'carousel' ? image(f) : f.mimeType === 'video/mp4');
  // A single linked file of the wrong kind: name the actual format instead of "found 0".
  if (files.length === 1 && !selected.length) {
    const need = type === 'image' ? 'الصورة لازم تكون JPG أو PNG أو WebP' : type === 'carousel' ? 'الكاروسيل محتاج فولدر فيه صورتين على الأقل' : 'الريل/الفيديو لازم يكون MP4 (صدّره MP4 من برنامج المونتاج أو الموبايل)';
    throw new Error(`الملف «${files[0].name}» نوعه ${fileType(files[0].mimeType)}؛ ${need}.`);
  }
  if (type !== 'carousel' && selected.length !== 1) throw new Error(`المطلوب ملف ${type === 'image' ? 'صورة' : 'MP4'} واحد بالضبط؛ الموجود ${selected.length}. ضع رابط الملف مباشرة أو نظّم الفولدر.`);
  if (type === 'carousel') {
    if (selected.length < 2 || selected.length > 20) throw new Error('الكاروسيل يحتاج من صورتين إلى 20 صورة.');
    const order = selected.map(f => /^(\d+)[ ._-]/.exec(f.name)?.[1]);
    if (order.some(n => !n) || new Set(order.map(Number)).size !== selected.length) throw new Error('رتّب صور الكاروسيل بأرقام فريدة: 01-name.jpg، 02-name.jpg.');
    selected.sort((a, b) => Number(/^(\d+)/.exec(a.name)![1]) - Number(/^(\d+)/.exec(b.name)![1]));
  }
  return selected;
}
