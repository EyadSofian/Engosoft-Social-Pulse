import { useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useElementWidth } from '../../hooks/ui';
import { num, tick } from '../../lib/format';

export interface SeriesDatum {
  key: string;
  /** Axis label. */
  label: string;
  /** Full label for the tooltip and the table view. */
  title: string;
  value: number;
  note?: string;
  /** An unfinished bucket (the running month) is drawn lighter. */
  partial?: boolean;
}

interface Props {
  data: SeriesDatum[];
  kind: 'area' | 'bars';
  /** What one unit of the value is, e.g. "تفاعل". */
  unit: string;
  ariaLabel: string;
  height?: number;
  /** Label every category and print the value on each cap — only for a handful of bars. */
  categorical?: boolean;
  /** Changing it replays the draw-in animation. */
  replayKey?: string;
}

const MARGIN = { top: 22, right: 14, bottom: 30, left: 46 };

function niceStep(raw: number) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power;
}

function axis(maxValue: number, lines = 4) {
  const step = Math.max(1, niceStep(Math.max(1, maxValue) / lines));
  const top = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(value);
  return { top, ticks };
}

/** Monotone cubic: the curve never dips below the points it connects. */
function smoothPath(points: [number, number][]) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  const slopes: number[] = [];
  const widths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    widths[i] = points[i + 1][0] - points[i][0];
    slopes[i] = (points[i + 1][1] - points[i][1]) / widths[i];
  }
  const tangents = [slopes[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const before = slopes[i - 1];
    const after = slopes[i];
    tangents[i] = before * after <= 0 ? 0 : (2 * before * after) / (before + after);
  }
  tangents.push(slopes[slopes.length - 1]);
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const third = widths[i] / 3;
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    path += `C${x0 + third},${y0 + tangents[i] * third} ${x1 - third},${y1 - tangents[i + 1] * third} ${x1},${y1}`;
  }
  return path;
}

/** Rounded at the data end, square on the baseline. */
function barPath(x: number, y: number, width: number, baseline: number) {
  const radius = Math.min(4, width / 2, baseline - y);
  return `M${x},${baseline}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${baseline}Z`;
}

export function SeriesChart({ data, kind, unit, ariaLabel, height = 280, categorical, replayKey }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
    const innerHeight = height - MARGIN.top - MARGIN.bottom;
    const baseline = MARGIN.top + innerHeight;
    const band = data.length ? innerWidth / data.length : 0;
    const { top, ticks } = axis(Math.max(0, ...data.map((item) => item.value)));
    const x = (index: number) => MARGIN.left + band * (index + 0.5);
    const y = (value: number) => baseline - (value / top) * innerHeight;
    const barWidth = Math.max(2, Math.min(categorical ? 30 : 24, band - 2));
    const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerWidth / (categorical ? 58 : 92)))));
    return { innerWidth, innerHeight, baseline, band, ticks, x, y, barWidth, every };
  }, [data, width, height, categorical]);

  const { innerWidth, baseline, band, ticks, x, y, barWidth, every } = geometry;
  const line = useMemo(
    () => (kind === 'area' ? smoothPath(data.map((item, index) => [x(index), y(item.value)])) : ''),
    [kind, data, x, y],
  );
  const last = data.length - 1;
  const focused = active != null && active <= last ? active : null;
  const current = focused != null ? data[focused] : null;

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!band) return;
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - box.left - MARGIN.left) / band);
    setActive(Math.max(0, Math.min(last, index)));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!data.length) return;
    const from = focused ?? last;
    const next =
      event.key === 'ArrowRight' ? from + 1 : event.key === 'ArrowLeft' ? from - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (next == null) return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(last, next)));
  };

  const tipLeft = focused != null ? x(focused) : 0;
  const tipAlign = tipLeft < 96 ? 'start' : tipLeft > width - 96 ? 'end' : 'center';

  return (
    <figure className="chart" dir="ltr" style={{ height }}>
      <div
        ref={ref}
        className="chart__stage"
        tabIndex={0}
        role="img"
        aria-label={`${ariaLabel}. استخدم الأسهم للتنقل بين القيم.`}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((value) => value ?? last)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {width > 0 && (
          <svg width={width} height={height} key={replayKey} aria-hidden>
            <defs>
              <linearGradient id="chart-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--data)" stopOpacity="0.26" />
                <stop offset="1" stopColor="var(--data)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((value) => (
              <g key={value}>
                <line className={value === 0 ? 'chart__axis' : 'chart__grid'} x1={MARGIN.left} x2={MARGIN.left + innerWidth} y1={y(value)} y2={y(value)} />
                <text className="chart__tick" x={MARGIN.left - 10} y={y(value)} dy="0.34em" textAnchor="end">
                  {tick(value)}
                </text>
              </g>
            ))}
            {data.map((item, index) =>
              (last - index) % every === 0 ? (
                <text
                  key={item.key}
                  className="chart__label"
                  x={Math.max(MARGIN.left + 18, Math.min(MARGIN.left + innerWidth - 18, x(index)))}
                  y={baseline + 20}
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              ) : null,
            )}

            {kind === 'bars' &&
              data.map((item, index) =>
                item.value > 0 ? (
                  <path
                    key={item.key}
                    className="chart__bar"
                    data-active={focused === index}
                    data-partial={item.partial || undefined}
                    style={{ '--i': index } as CSSProperties}
                    d={barPath(x(index) - barWidth / 2, y(item.value), barWidth, baseline)}
                  />
                ) : null,
              )}
            {kind === 'bars' &&
              categorical &&
              band >= 34 &&
              data.map((item, index) => (
                <text key={item.key} className="chart__cap" x={x(index)} y={y(item.value) - 8} textAnchor="middle">
                  {tick(item.value)}
                </text>
              ))}

            {kind === 'area' && data.length > 1 && (
              <>
                <path className="chart__area" d={`${line}L${x(last)},${baseline}L${x(0)},${baseline}Z`} fill="url(#chart-wash)" />
                <path className="chart__line" d={line} pathLength={1} />
                <circle className="chart__dot chart__dot--end" cx={x(last)} cy={y(data[last].value)} r={4.5} />
              </>
            )}
            {kind === 'area' && current && focused != null && (
              <>
                <line className="chart__cross" x1={x(focused)} x2={x(focused)} y1={MARGIN.top - 6} y2={baseline} />
                <circle className="chart__dot" cx={x(focused)} cy={y(current.value)} r={5} />
              </>
            )}
          </svg>
        )}

        {current && focused != null && (
          <div
            className="chart__tip glass glass--float"
            data-align={tipAlign}
            style={{ left: tipLeft, top: Math.max(4, y(current.value) - 14) }}
            role="status"
          >
            <strong>
              {num(current.value)} <small>{unit}</small>
            </strong>
            <span>
              <i className="chart__key" data-kind={kind} />
              {current.title}
            </span>
            {current.note && <em>{current.note}</em>}
          </div>
        )}
      </div>

      {/* A table ignores the 1px box, so the wrapper is what hides it; otherwise its rows stretch the page. */}
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">الفترة</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.key}>
                <th scope="row">{item.title}</th>
                <td>{num(item.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** A stat tile's trend: the period in a recessive ink, the latest point in the accent. */
export function Sparkline({ values, height = 38 }: { values: number[]; height?: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const points = useMemo(() => {
    if (values.length < 2 || !width) return [];
    const size = Math.ceil(values.length / 24);
    const buckets: number[] = [];
    for (let i = values.length; i > 0; i -= size) buckets.unshift(values.slice(Math.max(0, i - size), i).reduce((sum, value) => sum + value, 0));
    const top = Math.max(1, ...buckets);
    const step = (width - 10) / Math.max(1, buckets.length - 1);
    return buckets.map((value, index): [number, number] => [5 + index * step, height - 6 - (value / top) * (height - 12)]);
  }, [values, width, height]);
  const end = points[points.length - 1];

  return (
    <div ref={ref} className="spark" style={{ height }} dir="ltr" aria-hidden>
      {points.length > 1 && (
        <svg width={width} height={height}>
          <path className="spark__line" d={smoothPath(points)} />
          <circle className="spark__dot" cx={end[0]} cy={end[1]} r={3.5} />
        </svg>
      )}
    </div>
  );
}
