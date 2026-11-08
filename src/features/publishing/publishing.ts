import { useCallback, useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { businessZone } from '../../lib/format';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import type { Channel } from '../content-pipeline/types';

export type QueueState = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
export interface PublishAccount { id: string; provider: Channel; name: string; status: string; auto: boolean }
export interface QueueRow { id: string; contentId: string; accountId: string; kind: string; publishAt: string; state: QueueState; createdBy: string; jobId: string | null; error: string | null; updatedAt: string }
export interface JobRow { id: string; contentId: string; accountId: string; provider: Channel; state: 'processing' | 'awaiting_user' | 'published' | 'failed' | 'unknown'; externalId?: string; url?: string; error?: string; createdAt: string; updatedAt: string }
export interface PublishTarget { accountId: string; provider: Channel; name: string; ready: boolean; reason: 'advanced' | 'disconnected' | 'no_media' | 'authorization' | null }
export interface PublishingBoard { accounts: PublishAccount[]; queue: QueueRow[]; jobs: JobRow[] }

/** How each platform gets its posts: by itself at the time, from the post page with its own choices, or by hand. */
export type PublishWay = 'auto' | 'post_page' | 'manual';
export const PLATFORMS: { channel: Channel; name: string; way: PublishWay }[] = [
  { channel: 'facebook', name: 'Facebook', way: 'auto' },
  { channel: 'instagram', name: 'Instagram', way: 'auto' },
  { channel: 'tiktok', name: 'TikTok', way: 'post_page' },
  { channel: 'youtube', name: 'YouTube', way: 'post_page' },
  { channel: 'snapchat', name: 'Snapchat', way: 'post_page' },
  { channel: 'linkedin', name: 'LinkedIn', way: 'auto' },
  { channel: 'x', name: 'X', way: 'manual' },
  { channel: 'whatsapp', name: 'WhatsApp', way: 'manual' },
  { channel: 'website', name: 'Website', way: 'manual' },
];
export const platformOf = (channel: Channel) => PLATFORMS.find((platform) => platform.channel === channel)!;

/** Accounts, the automatic-publishing queue and recent results; null until loaded, and for people who cannot publish. */
export function usePublishingBoard() {
  const { can } = useAuth();
  const allowed = can('content.publish') || can('content.schedule');
  const [board, setBoard] = useState<PublishingBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!allowed) return;
    try { setBoard(await api<PublishingBoard>('/api/publishing')); setError(null); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [allowed]);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 60_000);
    return () => clearInterval(timer);
  }, [reload]);
  return { board, error, reload };
}

/** The next whole hour, at least 30 minutes from now, on `day` when given (10:00 on a future day). */
export function suggestedTime(day?: string): string {
  const now = DateTime.now().setZone(businessZone());
  if (day && day > (now.toISODate() ?? '')) return DateTime.fromISO(`${day}T10:00`, { zone: businessZone() }).toUTC().toISO()!;
  return now.plus({ minutes: 30 }).plus({ hours: 1 }).startOf('hour').toUTC().toISO()!;
}

/** A post published by hand on a platform with no publishing API (server/workspace.ts `recordManualPublication`). */
export interface ManualPublication { channel: 'linkedin' | 'x' | 'whatsapp' | 'website'; url: string | null; by: string; at: string }

/**
 * Publications that are still failing: the latest attempt per post and account. A failure later retried,
 * sent another way, or on a post that went out is not counted (it used to inflate the "failed" badges).
 */
export function stillFailing(board: { jobs: JobRow[]; queue: QueueRow[] } | null | undefined, publishedIds: Set<string>): { id: string; contentId: string; accountId: string }[] {
  const latest = new Map<string, { id: string; contentId: string; accountId: string; state: string; at: string }>();
  const consider = (entry: { id: string; contentId: string; accountId: string; state: string; at: string }) => {
    const key = `${entry.contentId}|${entry.accountId}`;
    const seen = latest.get(key);
    if (!seen || entry.at > seen.at) latest.set(key, entry);
  };
  for (const job of board?.jobs ?? []) consider({ id: job.id, contentId: job.contentId, accountId: job.accountId, state: job.state, at: job.updatedAt });
  for (const row of board?.queue ?? []) consider({ id: row.id, contentId: row.contentId, accountId: row.accountId, state: row.state === 'failed' ? 'failed' : 'waiting', at: row.updatedAt });
  return [...latest.values()].filter((entry) => (entry.state === 'failed' || entry.state === 'unknown') && !publishedIds.has(entry.contentId));
}
