/**
 * Web Push without a library: VAPID (RFC 8292) signs who is sending, and aes128gcm (RFC 8188 / RFC 8291) encrypts the
 * message for the one browser that subscribed. Works with Apple (iPhone home-screen apps, iOS 16.4+), Google and
 * Mozilla push services.
 */
import { createECDH, createPrivateKey, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, sign, createCipheriv, type KeyObject } from 'node:crypto';

export const b64url = (buffer: Buffer | Uint8Array) => Buffer.from(buffer).toString('base64url');
export const fromB64url = (text: string) => Buffer.from(text, 'base64url');

export interface VapidKeys { publicKey: string; privateKey: string }
export interface PushSubscriptionJson { endpoint: string; keys: { p256dh: string; auth: string } }

/** A new P-256 key pair: the public key as the 65-byte uncompressed point, the private key as the 32-byte scalar. */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const point = Buffer.concat([Buffer.from([4]), fromB64url(jwk.x!), fromB64url(jwk.y!)]);
  return { publicKey: b64url(point), privateKey: privateKey.export({ format: 'jwk' }).d! };
}

function vapidPrivateKey(keys: VapidKeys): KeyObject {
  const point = fromB64url(keys.publicKey);
  return createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33, 65)), d: keys.privateKey }, format: 'jwk' });
}

/** The `Authorization` header for one push service origin, valid for 12 hours. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: vapidPrivateKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

/** Encrypts one message for one subscription (a single aes128gcm record). */
export function encryptPayload(subscription: PushSubscriptionJson, payload: Buffer, salt = randomBytes(16)): Buffer {
  const clientPublic = fromB64url(subscription.keys.p256dh);
  const authSecret = fromB64url(subscription.keys.auth);
  // A fresh sender key for every message, as the RFC requires.
  const serverEcdh = createECDH('prime256v1');
  const serverPublic = serverEcdh.generateKeys();
  const shared = serverEcdh.computeSecret(clientPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), clientPublic, serverPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 marks the last (and only) record; no padding.
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, body]);
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number; message: string };

/** Sends one message. `gone` means the subscription no longer exists (uninstalled, permission removed) and should be deleted. */
export async function sendWebPush(subscription: PushSubscriptionJson, message: unknown, keys: VapidKeys, subject: string, options: { ttl?: number; urgency?: 'normal' | 'high'; topic?: string } = {}): Promise<PushResult> {
  const body = encryptPayload(subscription, Buffer.from(JSON.stringify(message)));
  const headers: Record<string, string> = {
    Authorization: vapidAuthorization(subscription.endpoint, keys, subject),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(options.ttl ?? 24 * 3600),
    Urgency: options.urgency ?? 'normal',
  };
  // A topic replaces an undelivered message with the same topic (base64url, at most 32 characters).
  if (options.topic) headers.Topic = options.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  try {
    const response = await fetch(subscription.endpoint, { method: 'POST', headers, body: new Uint8Array(body), signal: AbortSignal.timeout(15_000) });
    if (response.ok) return { ok: true };
    const text = (await response.text().catch(() => '')).slice(0, 300);
    return { ok: false, gone: response.status === 404 || response.status === 410, status: response.status, message: text };
  } catch (error) {
    return { ok: false, gone: false, status: 0, message: error instanceof Error ? error.message : 'network error' };
  }
}

/** Accepts only well-formed P-256 keys so a bad subscription fails at subscribe time, not at every send. */
export function validSubscription(subscription: PushSubscriptionJson): boolean {
  try {
    const point = fromB64url(subscription.keys.p256dh);
    if (point.length !== 65 || point[0] !== 4 || fromB64url(subscription.keys.auth).length < 16) return false;
    createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33, 65)) }, format: 'jwk' });
    const url = new URL(subscription.endpoint);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
