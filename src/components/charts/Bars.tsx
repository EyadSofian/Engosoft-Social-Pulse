import type { ReactNode } from 'react';

export interface BarDatum {
  key: string;
  label: ReactNode;
  value: number | null;
  /** Printed next to the bar instead of the raw value, e.g. "42 · n=12". */
  display?: ReactNode;
}

/** Horizontal bars for ranked categories. One hue; the value is printed, so color carries no meaning alone. */
export function BarList({ data, label, format = String }: { data: BarDatum[]; label: string; format?: (value: number) => string }) {
  const max = Math.max(1, ...data.map((datum) => datum.value ?? 0));
  return (
    <ul className="bar-list" aria-label={label}>
      {data.map((datum) => (
        <li key={datum.key} className="bar-list__row">
          <span className="bar-list__label">{datum.label}</span>
          <span className="bar-list__track" aria-hidden>
            <span className="bar-list__fill" style={{ width: `${datum.value == null ? 0 : Math.max(1.5, (datum.value / max) * 100)}%` }} />
          </span>
          <span className="bar-list__value u-tnum">{datum.display ?? (datum.value == null ? '—' : format(datum.value))}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Vertical columns over time. The accessible table carries the exact values;
 * the drawing is decorative.
 */
export function ColumnChart({ data, label, format = String, height = 140 }: { data: { key: string; label: string; value: number; partial?: boolean }[]; label: string; format?: (value: number) => string; height?: number }) {
  const max = Math.max(1, ...data.map((datum) => datum.value));
  return (
    <figure className="col-chart">
      <div className="col-chart__plot" style={{ height }} aria-hidden>
        {data.map((datum) => (
          <span key={datum.key} className="col-chart__col" data-partial={datum.partial || undefined} title={`${datum.label}: ${format(datum.value)}`}>
            <span className="col-chart__bar" style={{ height: `${(datum.value / max) * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="col-chart__axis" aria-hidden>
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      {/* A table ignores the 1px box, so the wrapper is what hides it; otherwise its rows stretch the page. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key}>
                <th scope="row">{datum.label}</th>
                <td>{format(datum.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
