import type { DateTime } from 'luxon';
import { dayNumber } from './format';

/** Luxon weekday of the first column (6 = Saturday, the start of the week in Egypt). */
export const WEEK_START = 6;
export const WEEKEND = new Set([5, 6]);

export interface DayCell {
  key: string;
  dayNum: number;
  date: DateTime;
  inMonth: boolean;
  weekend: boolean;
}

const cell = (date: DateTime, month: number): DayCell => ({
  key: date.toISODate() ?? '',
  dayNum: dayNumber(date.toMillis()),
  date,
  inMonth: date.month === month,
  weekend: WEEKEND.has(date.weekday),
});

export const startOfWeek = (date: DateTime) => date.startOf('day').minus({ days: (date.weekday - WEEK_START + 7) % 7 });

/** Whole weeks covering the month — four to six rows, never a trailing empty one. */
export function monthCells(anchor: DateTime): DayCell[] {
  const first = anchor.startOf('month');
  const start = startOfWeek(first);
  const lead = Math.round(first.diff(start, 'days').days);
  const weeks = Math.ceil((lead + (first.daysInMonth ?? 30)) / 7);
  return Array.from({ length: weeks * 7 }, (_, index) => cell(start.plus({ days: index }), first.month));
}

export function weekCells(anchor: DateTime): DayCell[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const date = start.plus({ days: index });
    return cell(date, date.month);
  });
}

export function dayCell(anchor: DateTime): DayCell[] {
  const date = anchor.startOf('day');
  return [cell(date, date.month)];
}

/**
 * Side-by-side lanes for items whose blocks overlap in a time grid.
 * Each item gets its lane and the lane count of the cluster it belongs to.
 */
export function layoutLanes<T extends { ts: number }>(items: T[], spanMs: number): { item: T; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => a.ts - b.ts);
  const placed: { item: T; lane: number; lanes: number }[] = [];
  let cluster: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const close = () => {
    for (const entry of cluster) entry.lanes = laneEnds.length;
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.ts >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= item.ts);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = item.ts + spanMs;
    clusterEnd = Math.max(clusterEnd, item.ts + spanMs);
    cluster.push({ item, lane, lanes: 1 });
  }
  close();
  return placed;
}
