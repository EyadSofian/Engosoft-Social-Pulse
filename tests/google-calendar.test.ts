import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import express from 'express';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import type { DriveFile, GoogleValues } from '../server/google/client';
import type { CalendarGoogleClient } from '../server/google/calendar-sync';

const dir = mkdtempSync(join(tmpdir(), 'google-calendar-'));
process.env.DATA_FILE = join(dir, 'db.sqlite'); process.env.MEDIA_DIR = dir;
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.APP_URL = 'http://127.0.0.1:4100';
process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-client'; process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-secret';
const auth = await import('../server/auth');
const workspace = await import('../server/workspace');
const social = await import('../server/social/store');
const accounts = await import('../server/social/accounts');
const queue = await import('../server/social/queue');
const { db, initDb } = await import('../server/db');
const format = await import('../server/google/format');
const google = await import('../server/google/client');
const sync = await import('../server/google/calendar-sync');
const sources = await import('../server/google/store');
const { registerGoogleCalendarRoutes } = await import('../server/google/routes');
await initDb();
const user = await auth.createUser({ name: 'Google Admin', email: 'google-admin@example.test', password: 'test-password-123', role: 'admin', departmentId: 'marketing' });
const viewer = await auth.createUser({ name: 'Google Viewer', email: 'google-viewer@example.test', password: 'test-password-123', role: 'creator', departmentId: 'operations' });
const page = await accounts.registerAccount('facebook', 'drive-page', 'Drive Page', user.id, 'drive-facebook', ['pages_manage_posts']);
await social.saveSecret('drive-facebook', { accessToken: 'fb-test', expiresAt: Date.now() + 3600_000, scopes: ['pages_manage_posts'] });
const jpeg = await sharp({ create: { width: 2000, height: 2500, channels: 3, background: '#164684' } }).jpeg().toBuffer();
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await db.close(); rmSync(dir, { recursive: true, force: true }); });

const when = new Date(Date.now() + 24 * 3600_000);
function raw(id: string, overrides: Record<string, unknown> = {}) {
  return { 'post id': id, date: when.toISOString().slice(0, 10), time: '23:30', timezone: 'Africa/Cairo', 'post title': 'PMP course', caption: 'PMP caption\nhttps://engosoft.com', design: 'https://drive.google.com/drive/folders/drive-folder-123', 'media type': 'image', platform: 'facebook', ready: 'YES', ...overrides };
}
function values(...rows: Record<string, unknown>[]) {
  return [format.PUBLISHING_HEADERS, ...rows.map(row => format.PUBLISHING_HEADERS.map(h => row[h.toLowerCase()] ?? ''))] as GoogleValues;
}
async function setup(rows: GoogleValues) {
  const id = randomUUID(); let snapshot = rows; let downloads = 0;
  const writes: { range: string; values: string[][] }[] = [];
  await db.run('INSERT INTO google_calendar_sources(id,spreadsheet_id,tab,owner_id,targets_json,enabled) VALUES(?,?,?,?,?,?)', [id, `sheet-${id}`, 'Calendar', user.id, JSON.stringify({ facebook: page.id }), 1]);
  const client: CalendarGoogleClient = {
    metadata: async () => ({ properties: { title: 'Publishing', timeZone: 'Africa/Cairo' }, sheets: [{ properties: { title: 'Calendar', sheetId: 0 } }] }),
    values: async () => structuredClone(snapshot),
    writeValues: async (_id, data) => { writes.push(...data); },
    file: async () => ({ id: 'drive-folder-123', name: 'PMP', mimeType: 'application/vnd.google-apps.folder' }),
    children: async () => [{ id: 'drive-image-123', name: 'PMP.jpg', mimeType: 'image/jpeg', size: String(jpeg.length) }],
    download: async () => { downloads++; return jpeg; },
  };
  return { id, client, writes, downloads: () => downloads, replace: (next: GoogleValues) => { snapshot = next; } };
}

test('date serials preserve September 11 and 13:30 without locale inversion', () => {
  const row = format.parsePublishingRow(raw('serial', { date: 46276, time: 0.5625, platform: 'FB - IG - Linkedin - X' }));
  assert.match(row.scheduledAt, /^2026-09-11T10:30/);
  assert.deepEqual(row.channels, ['facebook', 'instagram', 'linkedin', 'x']);
  assert.throws(() => format.parsePublishingRow(raw('bad-date', { date: '9-11-2026' })), /YYYY-MM-DD/);
  assert.throws(() => format.parsePublishingRow(raw('bad-zone', { timezone: 'Egypt/Unknown' })), /التوقيت/);
});
test('duplicate headers and unknown platforms are rejected', () => {
  assert.throws(() => format.headersOf([['Post ID', ' Post ID ']]), /مكررة/);
  assert.throws(() => format.parsePublishingRow(raw('bad-platform', { platform: 'facebok' })), /منصة/);
});
test('Drive URLs are bounded to Google and carousel selection is deterministic', () => {
  assert.equal(google.googleReference('https://drive.google.com/open?id=drive-file-123').id, 'drive-file-123');
  assert.equal(google.googleReference('https://drive.google.com/file/d/drive-file-123/view?resourcekey=abc').resourceKey, 'abc');
  assert.throws(() => google.googleReference('https://drive.google.com.attacker.test/file/d/drive-file-123'), /Google/);
  const file = (name: string): DriveFile => ({ id: name, name, mimeType: 'image/jpeg' });
  assert.throws(() => google.chooseDriveMedia([file('a.jpg'), file('b.jpg')], 'image'), /واحد/);
  assert.throws(() => google.chooseDriveMedia([file('a.jpg'), file('b.jpg')], 'carousel'), /رتّب/);
  assert.deepEqual(google.chooseDriveMedia([file('02-second.jpg'), file('01-first.jpg')], 'carousel').map(f => f.name), ['01-first.jpg', '02-second.jpg']);
});
test('Drive artwork is normalized without cropping to a valid Instagram-sized JPEG', async () => {
  const b = await sharp({ create: { width: 5000, height: 1000, channels: 3, background: '#e1ab52' } }).png().toBuffer();
  const metadata = await sharp(await sync.normalizeDriveImage(b)).metadata();
  assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1350);
});
test('a ready row downloads Drive media, creates a real scheduled post, and writes results once', async () => {
  const s = await setup(values(raw('ready')));
  await sync.syncGoogleSource(s.id, s.client);
  const [row] = await sources.sourceRows(s.id), [q] = await social.contentQueue(row.content_id);
  assert.equal((await workspace.getContent(row.content_id))?.status, 'scheduled');
  assert.equal(q.kind, 'image'); assert.equal(q.sourceId, s.id); assert.equal(q.state, 'queued');
  assert.match(q.media[0].url, /^\/api\/social\/assets\//);
  assert.ok(s.writes.some(w => w.values[0][0] === 'scheduled'));
  await sync.syncGoogleSource(s.id, s.client);
  assert.equal(s.downloads(), 1); assert.equal((await social.contentQueue(row.content_id)).length, 1);
});
test('Ready NO creates a draft without downloading; switching to NO cancels pending publication', async () => {
  const s = await setup(values(raw('toggle', { ready: 'NO' })));
  await sync.syncGoogleSource(s.id, s.client);
  const [row] = await sources.sourceRows(s.id);
  assert.equal(s.downloads(), 0); assert.equal((await workspace.getContent(row.content_id))?.status, 'draft');
  s.replace(values(raw('toggle'))); await sync.syncGoogleSource(s.id, s.client);
  assert.ok((await social.contentQueue(row.content_id)).some(q => q.state === 'queued'));
  s.replace(values(raw('toggle', { ready: 'NO' }))); await sync.syncGoogleSource(s.id, s.client);
  assert.ok((await social.contentQueue(row.content_id)).every(q => q.state === 'cancelled'));
});
test('Drive MP4s stream to storage and inspect their headers without buffering the video download', async () => {
  const box = (kind: string, bytes: Buffer) => { const head = Buffer.alloc(8); head.writeUInt32BE(bytes.length + 8); head.write(kind, 4); return Buffer.concat([head, bytes]); };
  const mvhd = Buffer.alloc(40); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(10_000, 16);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(1080 * 65536, 76); tkhd.writeUInt32BE(1920 * 65536, 80);
  const video = Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('moov', Buffer.concat([box('mvhd', mvhd), box('trak', box('tkhd', tkhd))]))]);
  const videoPage = await accounts.registerAccount('facebook', 'drive-video-page', 'Video Page', user.id, 'drive-video-token', ['pages_manage_posts', 'publish_video']);
  const s = await setup(values(raw('stream-video', { 'media type': 'reel' })));
  await db.run('UPDATE google_calendar_sources SET targets_json=? WHERE id=?', [JSON.stringify({ facebook: videoPage.id }), s.id]);
  s.client.children = async () => [{ id: 'video-123456', name: 'PMP.mp4', mimeType: 'video/mp4', size: String(video.length) }];
  s.client.download = async () => { throw new Error('Video must use the streaming path.'); };
  s.client.downloadStream = async () => Readable.from([video.subarray(0, 32), video.subarray(32)]);
  await sync.syncGoogleSource(s.id, s.client);
  const [row] = await sources.sourceRows(s.id), [q] = await social.contentQueue(row.content_id);
  assert.equal(q.kind, 'video'); assert.equal(q.state, 'queued');
});
test('unsupported platforms report errors while supported targets keep their stable queue', async () => {
  const s = await setup(values(raw('partial-setup', { platform: 'facebook,x' })));
  await sync.syncGoogleSource(s.id, s.client);
  const [row] = await sources.sourceRows(s.id), queued = await social.contentQueue(row.content_id);
  assert.match(row.error, /x:/); assert.equal(queued.length, 1);
  await sync.syncGoogleSource(s.id, s.client);
  assert.equal((await social.contentQueue(row.content_id))[0].id, queued[0].id);
});
test('changed, removed, invalid and duplicate rows never leave their previous queue active', async () => {
  for (const mode of ['removed', 'invalid', 'duplicate'] as const) {
    const s = await setup(values(raw(mode))); await sync.syncGoogleSource(s.id, s.client);
    const [row] = await sources.sourceRows(s.id);
    s.replace(mode === 'removed' ? values() : mode === 'invalid' ? values(raw(mode, { time: 'invalid' })) : values(raw(mode), raw(mode)));
    await sync.syncGoogleSource(s.id, s.client);
    assert.ok((await social.contentQueue(row.content_id)).every(q => q.state !== 'queued'));
  }
});
test('past dates are blocked, and validation errors persist for background polls', async () => {
  const s = await setup(values(raw('past', { date: '2020-01-01' }), raw('malformed', { time: 'wrong' })));
  const result = await sync.syncGoogleSource(s.id, s.client);
  assert.equal(result.errors.length, 2);
  const source = await db.get<{ validation_errors_json: string }>('SELECT validation_errors_json FROM google_calendar_sources WHERE id=?', [s.id]);
  assert.equal(JSON.parse(source!.validation_errors_json).length, 2);
  assert.ok(s.writes.some(w => w.values[0][0] === 'blocked'));
  assert.equal(s.downloads(), 0);
});
test('a row moved during downloads gets its result at the new row; edited inputs stop publication', async () => {
  const s = await setup(values(raw('move-one'), raw('move-two', { ready: 'NO' })));
  const read = s.client.values; let reads = 0;
  s.client.values = async (...args) => { reads++; return reads === 1 ? read(...args) : values(raw('move-two', { ready: 'NO' }), raw('move-one')); };
  await sync.syncGoogleSource(s.id, s.client);
  assert.ok(s.writes.some(w => /L3$/.test(w.range) && w.values[0][0] === 'scheduled'));
  const changed = await setup(values(raw('concurrent'))); let counter = 0;
  changed.client.values = async () => ++counter === 1 ? values(raw('concurrent')) : values(raw('concurrent', { ready: 'NO' }));
  await assert.rejects(() => sync.syncGoogleSource(changed.id, changed.client), /تغيرت/);
  assert.equal(await sources.sourceCanPublish(changed.id), false);
  assert.equal(changed.writes.length, 0);
});
test('a source lease excludes concurrent sync and stale sources cannot publish', async () => {
  const s = await setup(values(raw('lease')));
  await db.run('UPDATE google_calendar_sources SET lock_token=?,lock_until=? WHERE id=?', ['other', Date.now() + 120_000, s.id]);
  await assert.rejects(() => sync.syncGoogleSource(s.id, s.client), /جارية/);
  assert.equal(await sources.sourceCanPublish(s.id), false);
});
test('only verified per-platform evidence produces Published, and polling does not resubmit', async () => {
  const s = await setup(values(raw('publish'))); await sync.syncGoogleSource(s.id, s.client);
  const [row] = await sources.sourceRows(s.id); let writes = 0;
  globalThis.fetch = async (_url, init) => init?.method === 'POST' ? (writes++, Response.json({ id: 'photo-1', post_id: 'drive-page_post-1' })) : Response.json({ id: 'drive-page_post-1', is_published: true, permalink_url: 'https://facebook.com/drive-page_post-1' });
  // Isolate this post from other scheduled fixture sources.
  await db.run('UPDATE google_calendar_sources SET last_sync_at=NULL WHERE id!=?', [s.id]);
  const [q] = await social.contentQueue(row.content_id);
  await queue.runDuePublications(new Date(Date.parse(q.publishAt) + 1000));
  assert.equal(writes, 1);
  assert.equal((await sync.rowOutcome((await sources.sourceRows(s.id))[0])).status, 'published');
  await sync.syncGoogleSource(s.id, s.client);
  assert.equal(writes, 1); assert.equal((await social.contentQueue(row.content_id)).length, 1);
  assert.ok(s.writes.some(w => w.values[0][0] === 'https://facebook.com/drive-page_post-1' || w.values[0][0].includes('facebook: https://facebook.com/drive-page_post-1')));
  globalThis.fetch = originalFetch;
});
test('Google refresh is single-flight, uses a separate encrypted grant and never leaks it', async () => {
  await social.saveSecret(google.googleSecret(user.id), { accessToken: 'old-google', refreshToken: 'refresh-google', expiresAt: 1, scopes: google.GOOGLE_SCOPES });
  let calls = 0;
  globalThis.fetch = async (url, init) => { assert.equal(String(url), 'https://oauth2.googleapis.com/token'); assert.ok(String(init?.body).includes('refresh_token')); calls++; return Response.json({ access_token: 'new-google', expires_in: 3600 }); };
  assert.deepEqual(await Promise.all([google.googleToken(user.id), google.googleToken(user.id)]), ['new-google', 'new-google']);
  assert.equal(calls, 1);
  const saved = await db.get<{ encrypted_json: string }>('SELECT encrypted_json FROM social_credentials WHERE id=?', [google.googleSecret(user.id)]);
  assert.ok(!saved!.encrypted_json.includes('new-google'));
  globalThis.fetch = originalFetch;
});
test('OAuth and management endpoints enforce CSRF, permissions, source ownership and opaque state', async () => {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = req.header('X-Viewer') ? viewer : user; next(); });
  registerGoogleCalendarRoutes(app);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number }, base = `http://127.0.0.1:${address.port}`;
  try {
    const start = await originalFetch(`${base}/api/oauth/drive/start`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const destination = new URL(start.headers.get('location')!);
    assert.ok(destination.searchParams.get('scope')!.includes('drive.readonly'));
    assert.ok(!destination.toString().includes('test-secret'));
    const bad = await originalFetch(`${base}/api/oauth/drive/callback?state=bad&code=bad`);
    assert.equal(bad.status, 400);
    const denied = await originalFetch(`${base}/api/google-calendar`, { headers: { 'X-Viewer': 'true' } });
    assert.equal(denied.status, 403);
    const csrf = await originalFetch(`${base}/api/google-calendar/inspect`, { method: 'POST', headers: { Origin: 'https://attacker.test', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(csrf.status, 403);
    const state = await (await originalFetch(`${base}/api/google-calendar`)).text();
    assert.ok(!state.includes('refresh-google')); assert.ok(!state.includes('new-google')); assert.ok(!state.includes('encrypted_json'));
    const otherId = randomUUID();
    await db.run('INSERT INTO google_calendar_sources(id,spreadsheet_id,tab,owner_id) VALUES(?,?,?,?)', [otherId, `foreign-${otherId}`, 'Calendar', viewer.id]);
    assert.equal((await originalFetch(`${base}/api/google-calendar/${otherId}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
    const csv = values(raw('upload-stable', { ready: 'NO' })).map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const upload = async () => {
      const response = await originalFetch(`${base}/api/google-calendar/import`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'calendar.csv', 'X-Consent': 'true', 'X-Targets': '{}' }, body: csv });
      assert.equal(response.status, 200); return (await response.json() as { id: string }).id;
    };
    const uploaded = await upload();
    await sync.syncGoogleSource(uploaded);
    const first = (await sources.sourceRows(uploaded))[0];
    assert.equal(await upload(), uploaded);
    await sync.syncGoogleSource(uploaded);
    assert.equal((await sources.sourceRows(uploaded))[0].content_id, first.content_id);
    assert.equal((await workspace.getContent(first.content_id))?.status, 'draft');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('real Google client reads raw date serials and sends resource keys only to Google APIs', async () => {
  const client = new google.GoogleClient(user.id), seen: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    if (String(url).includes('sheets.googleapis.com')) return Response.json({ values: [[46276, 0.5625]] });
    if (String(url).includes('alt=media')) return new Response(new Uint8Array(jpeg));
    return Response.json({ id: 'drive-file-123', name: 'PMP.jpg', mimeType: 'image/jpeg', size: String(jpeg.length), resourceKey: 'key-123', capabilities: { canDownload: true } });
  };
  try {
    assert.deepEqual(await client.values('sheet-123456', 'Calendar'), [[46276, 0.5625]]);
    assert.ok(seen[0].url.includes('UNFORMATTED_VALUE')); assert.ok(seen[0].url.includes('SERIAL_NUMBER'));
    const file = await client.file({ id: 'drive-file-123', resourceKey: 'key-123' });
    assert.equal((await client.download(file)).length, jpeg.length);
    assert.equal((seen[1].init?.headers as Record<string, string>)['X-Goog-Drive-Resource-Keys'], 'drive-file-123/key-123');
    assert.ok(seen.every(r => r.init?.redirect === 'error'));
  } finally { globalThis.fetch = originalFetch; }
});
