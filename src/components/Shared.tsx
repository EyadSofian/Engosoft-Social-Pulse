import { useMemo, type ReactNode } from 'react';
import { useApp } from '../context';
import { accountsOf, PERIODS } from '../lib/analytics';
import { compact, fmtDayShort, fmtTime, relative } from '../lib/format';
import { platformName } from '../lib/platforms';
import type { Plan, Post } from '../types';
import { StatePill, Thumb } from './ui/Bits';
import { PlatformFilter, Segmented, Select } from './ui/Controls';
import { PlatformBadge } from './ui/Platform';

/** One filter row above the content it scopes. */
export function FilterBar({ period = true, account = true, children }: { period?: boolean; account?: boolean; children?: ReactNode }) {
  const { data, filters, setFilters } = useApp();
  const accounts = useMemo(() => accountsOf(data.posts, filters.platform), [data.posts, filters.platform]);
  return (
    <div className="filters glass">
      <PlatformFilter value={filters.platform} onChange={(platform) => setFilters({ platform, account: 'all' })} />
      <div className="filters__end">
        {account && accounts.length > 1 && (
          <Select aria-label="الحساب" value={filters.account} onChange={(event) => setFilters({ account: event.target.value })}>
            <option value="all">كل الحسابات</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {filters.platform === 'all' ? ` · ${platformName[item.platform]}` : ''}
              </option>
            ))}
          </Select>
        )}
        {period && (
          <Segmented
            label="الفترة الزمنية"
            size="sm"
            value={filters.period}
            onChange={(value) => setFilters({ period: value })}
            options={PERIODS.map((item) => ({ value: item.value, label: item.label }))}
          />
        )}
        {children}
      </div>
    </div>
  );
}

export function PlanRow({ plan, showDay, onOpen }: { plan: Plan; showDay?: boolean; onOpen: (plan: Plan) => void }) {
  const { now } = useApp();
  const live = plan.computedState === 'upcoming' || plan.computedState === 'due' || plan.computedState === 'missed';
  return (
    <button type="button" className="row row--plan" data-state={plan.computedState} onClick={() => onOpen(plan)}>
      <PlatformBadge platform={plan.platform} size="sm" />
      <span className="row__text">
        <b>{plan.title}</b>
        <small>
          {showDay && `${fmtDayShort(plan.ts)} · `}
          {fmtTime(plan.ts)}
          {live && ` · ${relative(plan.ts, now)}`}
          {plan.owner && ` · ${plan.owner}`}
        </small>
      </span>
      <StatePill state={plan.computedState} />
    </button>
  );
}

export function PostRow({ post, rank, meta, onOpen }: { post: Post; rank?: number; meta?: ReactNode; onOpen: (post: Post) => void }) {
  return (
    <button type="button" className="row row--post" onClick={() => onOpen(post)}>
      {rank != null && <span className="row__rank">{String(rank).padStart(2, '0')}</span>}
      <Thumb src={post.thumbnail} platform={post.platform} />
      <span className="row__text">
        <b>{post.title}</b>
        <small>
          <PlatformBadge platform={post.platform} size="xs" />
          {post.accountName || platformName[post.platform]} · {post.ts ? fmtDayShort(post.ts) : '—'}
        </small>
      </span>
      {meta ?? (
        <span className="row__value">
          <b>{post.measured ? compact(post.interactions) : '—'}</b>
          <small>تفاعل</small>
        </span>
      )}
    </button>
  );
}
