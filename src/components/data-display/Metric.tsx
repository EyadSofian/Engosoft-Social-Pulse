import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { MetricSource } from '../../domain/publishing';
import { useI18n } from '../../i18n/I18nProvider';
import { Link } from '../../app/router/router';

/** A KPI tile: number first, label under it, optional hint and link. Never a decorative giant card. */
export function Stat({ value, label, hint, tone, to, icon }: { value: ReactNode; label: string; hint?: ReactNode; tone?: 'danger' | 'warning' | 'success' | 'brand'; to?: string; icon?: ReactNode }) {
  const body = (
    <>
      <span className="ui-stat__top">
        {icon && <span className="ui-stat__icon">{icon}</span>}
        <span className="ui-stat__value u-tnum">{value}</span>
      </span>
      <span className="ui-stat__label">{label}</span>
      {hint && <span className="ui-stat__hint">{hint}</span>}
    </>
  );
  const cls = `ui-stat${tone ? ` ui-stat--${tone}` : ''}`;
  return to ? (
    <Link to={to} className={`${cls} ui-stat--link`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** "Source: Meta Graph API · Engosoft · updated 12 min ago" — attached to every live number. */
export function SourceLine({ source, now, extra }: { source: MetricSource | MetricSource[]; now: number; extra?: ReactNode }) {
  const { t, relative } = useI18n();
  const list = Array.isArray(source) ? source : [source];
  if (!list.length) return null;
  const providers = [...new Set(list.map((entry) => entry.provider))].join(' · ');
  const accounts = [...new Set(list.map((entry) => entry.account).filter(Boolean))];
  const updated = list.reduce<number>((latest, entry) => Math.max(latest, entry.updatedAt ? Date.parse(entry.updatedAt) : 0), 0);
  return (
    <p className="ui-source">
      <Info size={12} aria-hidden />
      <span>
        {t('Source', 'المصدر')}: <bdi>{providers}</bdi>
        {accounts.length > 0 && (
          <>
            {' · '}
            <bdi>{accounts.length > 2 ? t(`${accounts.length} accounts`, `${accounts.length} حسابات`) : accounts.join('، ')}</bdi>
          </>
        )}
        {' · '}
        {updated ? `${t('updated', 'آخر تحديث')} ${relative(updated, now)}` : t('never synced', 'لم يُزامن بعد')}
        {extra}
      </span>
    </p>
  );
}

/** Origin line for workspace numbers: computed from demo records, not from an external source. */
export function DemoSourceLine({ basis }: { basis: string }) {
  const { t } = useI18n();
  return (
    <p className="ui-source ui-source--demo">
      <Info size={12} aria-hidden />
      <span>
        {t('Computed from demo workspace records', 'محسوب من سجلات المساحة التجريبية')} · {basis}
      </span>
    </p>
  );
}
