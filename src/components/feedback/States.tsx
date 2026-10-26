import type { ReactNode } from 'react';
import { CircleAlert, Clock3, PlugZap, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

/** Says what happened and what to do next; never just "No data". */
export function EmptyState({ icon, title, text, action, compact }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`ui-empty${compact ? ' ui-empty--compact' : ''}`}>
      {icon && <span className="ui-empty__icon">{icon}</span>}
      <p className="ui-empty__title">{title}</p>
      {text && <p className="ui-empty__text">{text}</p>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}

export function Skeleton({ height = 14, width = '100%', radius = 6 }: { height?: number; width?: number | string; radius?: number }) {
  return <span className="ui-skeleton" style={{ height, width, borderRadius: radius }} aria-hidden />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="ui-skeleton-rows" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={36} />
      ))}
    </div>
  );
}

/** Every external-data block has one of these states; numbers are shown only for `ready` and `partial`/`stale`. */
export type DataStatus = 'loading' | 'ready' | 'empty' | 'partial' | 'stale' | 'error' | 'needs_setup';

export function DataNotice({ status, message, onRetry, setupHref }: { status: Exclude<DataStatus, 'ready' | 'loading' | 'empty'>; message?: ReactNode; onRetry?: () => void; setupHref?: string }) {
  const { t } = useI18n();
  const icon = status === 'error' ? <CircleAlert size={16} /> : status === 'needs_setup' ? <PlugZap size={16} /> : <Clock3 size={16} />;
  const title = {
    error: t('This source returned an error', 'أعاد المصدر خطأً'),
    needs_setup: t('This source is not connected yet', 'المصدر غير مربوط بعد'),
    stale: t('Showing the last data we received', 'نعرض آخر بيانات وصلتنا'),
    partial: t('Some values are not provided by the source', 'بعض القيم لا يوفرها المصدر'),
  }[status];
  return (
    <div className={`ui-notice ui-notice--${status}`} role={status === 'error' ? 'alert' : 'status'}>
      {icon}
      <div className="ui-notice__text">
        <b>{title}</b>
        {message && <span>{message}</span>}
      </div>
      {onRetry && (
        <button type="button" className="ui-notice__action" onClick={onRetry}>
          <RefreshCw size={14} /> {t('Retry', 'أعد المحاولة')}
        </button>
      )}
      {setupHref && (
        <a className="ui-notice__action" href={setupHref}>
          {t('Open Connections', 'افتح الربط')}
        </a>
      )}
    </div>
  );
}

/** A thin bar for completion; the number beside it carries the meaning. */
export function ProgressBar({ value, tone = 'brand', label }: { value: number | null; tone?: 'brand' | 'success' | 'warning' | 'danger'; label: string }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <span className={`ui-progress ui-progress--${tone}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value == null ? undefined : Math.round(width)}>
      <span className="ui-progress__fill" style={{ width: `${width}%` }} />
    </span>
  );
}

export const progressTone = (value: number | null): 'brand' | 'success' | 'warning' | 'danger' => (value == null ? 'brand' : value >= 100 ? 'success' : value >= 70 ? 'brand' : value >= 50 ? 'warning' : 'danger');
