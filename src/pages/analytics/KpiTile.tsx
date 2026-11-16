import { useId, useState, type PointerEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { KPI_LABEL } from './export';
import type { Kpi } from './model';

const W = 240;
const H = 56;
const PAD = 4;

/**
 * One headline number: its value, the change against the period before as a coloured pill with the earlier
 * value written out, and a trend line of the same number across the period that can be hovered day by day.
 */
export function KpiTile({ kpi, labels }: { kpi: Kpi; labels: string[] }) {
  const { t, tx, num, compact, pct } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const gradient = useId();
  const format = (value: number | null) => (value == null ? '—' : kpi.key === 'rate' ? pct(value, 2) : kpi.key === 'posts' ? num(value) : compact(value));

  const direction = kpi.change == null ? null : kpi.change > 0 ? 'up' : kpi.change < 0 ? 'down' : 'flat';
  const amount = kpi.change == null ? null : kpi.key === 'rate' ? `${num(Math.round(Math.abs(kpi.change) * 100) / 100)} ${t('pts', 'نقطة')}` : pct(Math.abs(kpi.change), 0);

  const series = kpi.series;
  const known = series.filter((value): value is number => value != null);
  const max = Math.max(...known, 0);
  const x = (index: number) => (series.length < 2 ? W / 2 : PAD + (index / (series.length - 1)) * (W - PAD * 2));
  const y = (value: number) => H - PAD - (max ? (value / max) * (H - PAD * 2) : 0);
  // Runs of reported values; a bucket the platform did not report breaks the line instead of dropping to zero.
  const runs: { index: number; value: number }[][] = [];
  series.forEach((value, index) => {
    if (value == null) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1].index === index - 1) last.push({ index, value });
    else runs.push([{ index, value }]);
  });
  const line = runs.map((run) => run.map((point, i) => `${i ? 'L' : 'M'}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join('')).join('');
  const area = runs
    .filter((run) => run.length > 1)
    .map((run) => `M${x(run[0].index).toFixed(1)},${H}${run.map((point) => `L${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join('')}L${x(run[run.length - 1].index).toFixed(1)},${H}Z`)
    .join('');
  const plotted = known.length > 1;

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.round(((event.clientX - box.left) / box.width) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, index)));
  };

  const hovered = hover == null ? null : { value: series[hover], label: labels[hover] ?? '', left: (x(hover) / W) * 100 };

  return (
    <article className="an-kpi">
      <header className="an-kpi__head">
        <h3 className="an-kpi__label">{tx(KPI_LABEL[kpi.key])}</h3>
        {direction && kpi.value != null && (
          <span className={`an-kpi__delta an-kpi__delta--${direction}`} title={t('Against the period before', 'مقارنة بالفترة اللي قبلها')}>
            {direction === 'up' ? <ArrowUpRight size={13} aria-hidden /> : direction === 'down' ? <ArrowDownRight size={13} aria-hidden /> : <Minus size={13} aria-hidden />}
            <bdi>{amount}</bdi>
          </span>
        )}
      </header>
      <p className="an-kpi__value" title={kpi.value == null ? undefined : num(kpi.value)}>
        {format(kpi.value)}
      </p>
      {/* While the trend line is hovered, this line reads out the hovered point instead of the previous period. */}
      <p className={`an-kpi__sub${hovered ? ' an-kpi__sub--point' : ''}`} aria-live="polite">
        {hovered ? (
          <>
            {hovered.label}: <bdi>{format(hovered.value)}</bdi>
          </>
        ) : kpi.value == null ? (
          t('Not reported by the platform', 'المنصة مش بترجع الرقم ده')
        ) : kpi.previous == null || kpi.change == null ? (
          t('No earlier period to compare', 'مفيش فترة قبلها للمقارنة')
        ) : (
          <>
            {t('Previous period: ', 'الفترة اللي قبلها: ')}
            <bdi>{format(kpi.previous)}</bdi>
          </>
        )}
      </p>
      {plotted && (
        <div className="an-kpi__spark" dir="ltr" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t(`${tx(KPI_LABEL[kpi.key])} over the period`, `${tx(KPI_LABEL[kpi.key])} على مدار الفترة`)}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.24" />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradient})`} />
            <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--chart-axis)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          </svg>
          {hovered && hovered.value != null && <span className="an-kpi__dot" style={{ left: `${hovered.left}%`, top: `${(y(hovered.value) / H) * 100}%` }} aria-hidden />}
        </div>
      )}
    </article>
  );
}
