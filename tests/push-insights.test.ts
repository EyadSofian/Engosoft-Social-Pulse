import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { b64url, encryptPayload, fromB64url, generateVapidKeys, vapidAuthorization, validSubscription } from '../server/push/webpush.js';
import { buildInsights, contentMix, platformMedians, weekId, weakPlatforms } from '../server/insights/compute.js';
import { DateTime } from 'luxon';
import type { ObservedPost } from '../server/types.js';

/* ── Web Push ─────────────────────────────────────────────────────── */

function browserSubscription() {
  const ecdh = createECDH('prime256v1');
  const publicKey = ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, json: { endpoint: 'https://web.push.apple.com/QH1abc', keys: { p256dh: b64url(publicKey), auth: b64url(auth) } } };
}

/** What the phone does (RFC 8291): read the header, derive the same key, decrypt. */
function decryptLikeBrowser(body: Buffer, ecdh: ReturnType<typeof createECDH>, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  assert.equal(body.readUInt32BE(16), 4096);
  const idLen = body.readUInt8(20);
  const serverPublic = body.subarray(21, 21 + idLen);
  const cipherText = body.subarray(21 + idLen);
  const shared = ecdh.computeSecret(serverPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), serverPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(cipherText.subarray(cipherText.length - 16));
  const plain = Buffer.concat([decipher.update(cipherText.subarray(0, cipherText.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
  return plain.subarray(0, plain.length - 1).toString('utf8');
}

test('a push message decrypts on the phone exactly as sent (aes128gcm)', () => {
  const { ecdh, auth, json } = browserSubscription();
  const message = JSON.stringify({ title: 'أفضل بوست امبارح على إنستجرام', body: '412 تفاعل — 2.3× المعتاد', url: '/insights?id=x' });
  const body = encryptPayload(json, Buffer.from(message));
  assert.equal(decryptLikeBrowser(body, ecdh, auth), message);
  // A fresh sender key every time: two encryptions of the same text differ.
  assert.notDeepEqual(encryptPayload(json, Buffer.from(message)), body);
});

test('the key derivation matches the RFC 8291 worked example (Appendix A)', () => {
  const ua = createECDH('prime256v1');
  ua.setPrivateKey(fromB64url('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'));
  const body = fromB64url('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  assert.equal(decryptLikeBrowser(body, ua, fromB64url('BTBZMqHH6r4Tts7J_aSIgg')), 'When I grow up, I want to be a watermelon');
});

test('the VAPID header is an ES256 token for the push service origin, signed by our key', () => {
  const keys = generateVapidKeys();
  assert.equal(fromB64url(keys.publicKey).length, 65);
  const header = vapidAuthorization('https://web.push.apple.com/QH1abc', keys, 'https://example.test', Date.UTC(2026, 10, 18));
  const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assert.equal(k, keys.publicKey);
  const [h, c, s] = token.split('.');
  const claims = JSON.parse(fromB64url(c).toString());
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://example.test');
  assert.equal(claims.exp, Date.UTC(2026, 10, 18) / 1000 + 12 * 3600);
  const point = fromB64url(keys.publicKey);
  const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33)) }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, fromB64url(s)));
});

test('only well-formed https subscriptions are accepted', () => {
  const { json } = browserSubscription();
  assert.equal(validSubscription(json), true);
  assert.equal(validSubscription({ ...json, endpoint: 'http://push.example/x' }), false);
  assert.equal(validSubscription({ ...json, keys: { ...json.keys, p256dh: b64url(randomBytes(65)) } }), false);
  assert.equal(validSubscription({ ...json, keys: { ...json.keys, auth: b64url(randomBytes(4)) } }), false);
});

/* ── Performance notifications ────────────────────────────────────── */

const ZONE = 'Asia/Riyadh';
const NOW = DateTime.fromISO('2026-11-18T10:00:00', { zone: ZONE }).toJSDate(); // Wednesday, 10:00
const at = (daysAgo: number, hour = 12) => DateTime.fromJSDate(NOW, { zone: ZONE }).startOf('day').minus({ days: daysAgo }).set({ hour }).toUTC().toISO()!;
let n = 0;
function post(platform: ObservedPost['platform'], daysAgo: number, likes: number, extra: Partial<ObservedPost> = {}): ObservedPost {
  return { platform, accountId: platform, accountName: platform, externalId: `p${n++}`, permalink: `https://example.test/${n}`, title: `بوست ${n}`, publishedAt: at(daysAgo, 9), contentType: 'image', thumbnail: '', metrics: { views: null, reach: likes * 20, impressions: null, likes, comments: 0, shares: 0, saves: 0, clicks: null, engagement: null }, ...extra };
}

test('yesterday gets a summary and a best post measured against each platform\'s usual', () => {
  const posts: ObservedPost[] = [];
  for (let d = 2; d <= 40; d++) posts.push(post('facebook', d, 100), post('instagram', d, 40));
  posts.push(post('facebook', 1, 110, { title: 'عادي على فيسبوك' }), post('instagram', 1, 120, { title: 'ريل قوي', contentType: 'reel' }));
  const out = buildInsights({ posts, now: NOW, zone: ZONE, scheduledLaterToday: 0 });
  const daily = out.find((i) => i.key === 'daily:2026-11-17')!;
  assert.match(daily.title, /بوستين على 2 منصات/);
  assert.match(daily.body, /230 تفاعل/);
  const best = out.find((i) => i.key === 'best:2026-11-17')!;
  // 120 on Instagram is 3× its usual 40; 110 on Facebook is only 1.1× its usual 100.
  assert.match(best.title, /إنستجرام/);
  assert.match(best.body, /3× المعتاد/);
  assert.equal(best.detail.posts![0].contentType, 'reel');
});

test('nothing posted yesterday says so, and says when the last post was', () => {
  const posts = [post('facebook', 4, 50), post('facebook', 5, 50), post('facebook', 6, 50)];
  const out = buildInsights({ posts, now: NOW, zone: ZONE, scheduledLaterToday: 2 });
  const daily = out.find((i) => i.key === 'daily:2026-11-17')!;
  assert.equal(daily.title, 'امبارح مفيش ولا بوست اتنشر');
  assert.match(daily.body, /من 4 أيام/);
  assert.match(daily.body, /بوستين مجدول/);
});

test('a 20%+ change in settled interactions week over week raises one alert, named for its week', () => {
  const posts: ObservedPost[] = [];
  for (let d = 2; d < 9; d++) posts.push(post('facebook', d, 50), post('linkedin', d, 10));
  for (let d = 9; d < 16; d++) posts.push(post('facebook', d, 100), post('linkedin', d, 10));
  const out = buildInsights({ posts, now: NOW, zone: ZONE, scheduledLaterToday: 0 });
  const trend = out.find((i) => i.kind === 'insight_alert' && i.key.startsWith('trend:'))!;
  assert.equal(trend.key, `trend:down:${weekId(DateTime.fromJSDate(NOW, { zone: ZONE }).startOf('day'))}`);
  assert.equal(trend.key, 'trend:down:2026-11-15'); // Sunday starts the week
  assert.match(trend.title, /قلّ 45%/);
  assert.match(trend.body, /فيسبوك/);
});

test('no post by 2 pm on a weekday we usually post, and nothing scheduled, raises an alert', () => {
  const afternoon = DateTime.fromISO('2026-11-18T15:00:00', { zone: ZONE }).toJSDate();
  const posts = [1, 2, 3, 4, 5, 6].map((w) => post('instagram', w * 7, 30));
  const out = buildInsights({ posts, now: afternoon, zone: ZONE, scheduledLaterToday: 0 });
  assert.ok(out.some((i) => i.key === 'gap-today:2026-11-18'));
  assert.ok(!buildInsights({ posts, now: afternoon, zone: ZONE, scheduledLaterToday: 1 }).some((i) => i.key.startsWith('gap-today')));
  assert.ok(!buildInsights({ posts, now: NOW, zone: ZONE, scheduledLaterToday: 0 }).some((i) => i.key.startsWith('gap-today')), 'not before 2 pm');
});

test('a platform that went quiet or posts far less than usual is flagged', () => {
  const posts: ObservedPost[] = [];
  for (let d = 1; d < 90; d += 2) posts.push(post('facebook', d, 50));
  for (let d = 25; d < 90; d += 3) posts.push(post('linkedin', d, 10));
  for (let d = 20; d < 90; d += 2) posts.push(post('instagram', d, 30));
  for (let d = 1; d < 14; d += 7) posts.push(post('instagram', d, 30));
  const weak = weakPlatforms(posts, NOW, platformMedians(posts, NOW));
  assert.deepEqual(weak.map((w) => w.platform).sort(), ['instagram', 'linkedin']);
  assert.match(weak.find((w) => w.platform === 'linkedin')!.reason, /مفيش نشر من 25 يوم/);
  assert.match(weak.find((w) => w.platform === 'instagram')!.reason, /بوستين بس في آخر أسبوعين/);
});

test('one dominant content type with a stronger alternative suggests varying', () => {
  const posts: ObservedPost[] = [];
  for (let d = 2; d < 28; d++) posts.push(post('instagram', d, 30));
  for (const d of [3, 9, 15, 21]) posts.push(post('instagram', d, 90, { contentType: 'REELS' }));
  const mix = contentMix(posts, NOW, platformMedians(posts, NOW))!;
  assert.match(mix.title, /ريلز/);
  assert.match(mix.body, /3× تفاعلها/);
});

test('today\'s competitor idea is sent once per brief date, only when the brief is fresh', () => {
  const ideas = [{ title: 'نصايح PMP', idea: 'كاروسيل 5 أخطاء', platform: 'instagram', format: 'carousel', why: 'كاروسيل بكة جاب 3×' }];
  const fresh = buildInsights({ posts: [], now: NOW, zone: ZONE, scheduledLaterToday: 0, radarIdeas: ideas, radarDate: '2026-11-18' });
  assert.equal(fresh.find((i) => i.kind === 'insight_idea')?.key, 'idea:2026-11-18');
  const stale = buildInsights({ posts: [], now: NOW, zone: ZONE, scheduledLaterToday: 0, radarIdeas: ideas, radarDate: '2026-11-10' });
  assert.ok(!stale.some((i) => i.key.startsWith('idea:')));
});

test('nothing is sent before 9 in the morning', () => {
  const early = DateTime.fromISO('2026-11-18T07:30:00', { zone: ZONE }).toJSDate();
  const posts = [post('facebook', 1, 10), post('facebook', 2, 10), post('facebook', 3, 10)];
  assert.deepEqual(buildInsights({ posts, now: early, zone: ZONE, scheduledLaterToday: 0 }), []);
});
