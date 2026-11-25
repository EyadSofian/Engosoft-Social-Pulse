/**
 * Lets this server call its own API as one named user, without a session.
 *
 * The MCP endpoint reads every tab by issuing ordinary GET requests to itself,
 * so each route's own permission checks decide what comes back, exactly as for
 * that user in the browser, and no session row is created.
 *
 * The key is random per process and never leaves memory. A request only counts
 * as internal when it carries that key AND arrives on the loopback interface.
 */
import crypto from 'node:crypto';
import type express from 'express';

const KEY = crypto.randomBytes(32).toString('hex');
const KEY_DIGEST = crypto.createHash('sha256').update(KEY).digest();
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const INTERNAL_KEY_HEADER = 'x-engosoft-internal-key';
export const INTERNAL_USER_HEADER = 'x-engosoft-internal-user';

export function internalHeaders(userId: string): Record<string, string> {
  return { [INTERNAL_KEY_HEADER]: KEY, [INTERNAL_USER_HEADER]: userId };
}

/** The user id an internal request speaks for, or null when it is not one. */
export function internalUserId(req: express.Request): string | null {
  const supplied = req.headers[INTERNAL_KEY_HEADER];
  if (typeof supplied !== 'string' || !supplied) return null;
  if (!LOOPBACK.has(String(req.socket?.remoteAddress || ''))) return null;
  const digest = crypto.createHash('sha256').update(supplied).digest();
  if (!crypto.timingSafeEqual(digest, KEY_DIGEST)) return null;
  const userId = req.headers[INTERNAL_USER_HEADER];
  return typeof userId === 'string' && userId ? userId : null;
}

/** Base URL of this process for loopback calls. */
export function selfOrigin(): string {
  return `http://127.0.0.1:${Number(process.env.PORT) || 4100}`;
}
