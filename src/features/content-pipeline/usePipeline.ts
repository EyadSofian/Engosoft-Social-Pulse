import { useEffect, useState } from 'react';
import type { ContentStatus } from '../../domain/content';
import { api } from '../../lib/api';
import type { PipelineItem, TeamMember } from './types';

/** The real content pipeline and team from the server; reloads every minute so analytics follow the board. */
export function usePipeline() {
  const [items, setItems] = useState<PipelineItem[] | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([api<PipelineItem[]>('/api/content'), api<TeamMember[]>('/api/users')])
        .then(([content, users]) => {
          if (!alive) return;
          setItems(content);
          setTeam(users);
          setError(null);
        })
        .catch((reason: unknown) => alive && setError(reason instanceof Error ? reason.message : String(reason)));
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return { items, team, error };
}

export interface PipelineRollup {
  created: number;
  inReview: number;
  changes: number;
  approved: number;
  published: number;
  reach: number | null;
  interactions: number | null;
}

const IN_REVIEW: ContentStatus[] = ['ready_for_review'];
const APPROVED: ContentStatus[] = ['approved', 'scheduled'];

/** Status counts plus the synced metrics of published posts, so every post's reach rolls up to its owner and department. */
export function rollup(items: PipelineItem[]): PipelineRollup {
  let reach: number | null = null;
  let interactions: number | null = null;
  for (const item of items) {
    for (const post of item.published ?? []) {
      const m = post.metrics;
      const r = m.reach ?? m.views ?? m.impressions ?? null;
      if (r != null) reach = (reach ?? 0) + r;
      const actions = m.engagement ?? (['likes', 'comments', 'shares', 'saves'].some((key) => m[key] != null) ? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0) : null);
      if (actions != null) interactions = (interactions ?? 0) + actions;
    }
  }
  return {
    created: items.length,
    inReview: items.filter((item) => IN_REVIEW.includes(item.status)).length,
    changes: items.filter((item) => item.status === 'changes_requested').length,
    approved: items.filter((item) => APPROVED.includes(item.status)).length,
    published: items.filter((item) => item.status === 'published').length,
    reach,
    interactions,
  };
}

/** Items created in the given month (yyyy-LL in the business zone is close enough at month granularity). */
export const inMonth = (items: PipelineItem[], month: string) => items.filter((item) => item.createdAt.slice(0, 7) === month);
