import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { WEEKDAY_NAMES, type Heat, type HeatCell } from '../../lib/analytics';
import { hourLabel, num, oneDecimal } from '../../lib/format';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const describe = (cell: HeatCell) =>
  `${WEEKDAY_NAMES[cell.weekday]} ${hourLabel(cell.hour)}: ${num(cell.count)} بوست${
    cell.measured ? `، متوسط التفاعل ${oneDecimal(cell.interactions / cell.measured)}` : ''
  }`;

/** Weekday × hour grid of publishing volume: one hue, brighter means more. */
export function Heatmap({ heat }: { heat: Heat }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [focus, setFocus] = useState<{ row: number; hour: number }>({ row: 0, hour: 12 });
  const [tip, setTip] = useState<{ cell: HeatCell; x: number; y: number } | null>(null);

  const show = (cell: HeatCell, element: HTMLElement) => {
    const host = wrap.current;
    if (!host) return;
    const box = element.getBoundingClientRect();
    const origin = host.getBoundingClientRect();
    setTip({ cell, x: box.left - origin.left + box.width / 2, y: box.top - origin.top });
  };

  const onKey = (event: KeyboardEvent<HTMLTableElement>) => {
    // Hours run right-to-left with the page, so the left arrow moves to a later hour.
    const move: Record<string, [number, number]> = { ArrowLeft: [0, 1], ArrowRight: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    const step = move[event.key];
    if (!step) return;
    event.preventDefault();
    const row = Math.max(0, Math.min(heat.rows.length - 1, focus.row + step[0]));
    const hour = Math.max(0, Math.min(23, focus.hour + step[1]));
    setFocus({ row, hour });
    wrap.current?.querySelector<HTMLElement>(`[data-cell="${row}-${hour}"]`)?.focus();
  };

  const width = wrap.current?.clientWidth ?? 0;
  const align = tip ? (tip.x < 110 ? 'start' : tip.x > width - 110 ? 'end' : 'center') : 'center';

  return (
    <div className="heat" ref={wrap}>
      <table onKeyDown={onKey}>
        <caption className="sr-only">عدد البوستات المنشورة حسب اليوم والساعة</caption>
        <thead>
          <tr>
            <td />
            {HOURS.map((hour) => (
              <th key={hour} scope="col">
                <span className={hour % 3 === 0 ? undefined : 'sr-only'}>{hourLabel(hour)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heat.rows.map((row, rowIndex) => (
            <tr key={row.weekday}>
              <th scope="row">{WEEKDAY_NAMES[row.weekday]}</th>
              {row.cells.map((cell) => (
                <td key={cell.hour}>
                  <span
                    className="heat__cell"
                    data-cell={`${rowIndex}-${cell.hour}`}
                    data-empty={cell.count === 0 || undefined}
                    data-best={heat.best === cell || undefined}
                    style={{ '--v': heat.max ? cell.count / heat.max : 0 } as CSSProperties}
                    tabIndex={focus.row === rowIndex && focus.hour === cell.hour ? 0 : -1}
                    role="img"
                    aria-label={describe(cell)}
                    onPointerEnter={(event) => show(cell, event.currentTarget)}
                    onPointerLeave={() => setTip(null)}
                    onFocus={(event) => {
                      setFocus({ row: rowIndex, hour: cell.hour });
                      show(cell, event.currentTarget);
                    }}
                    onBlur={() => setTip(null)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="heat__legend" aria-hidden>
        <span>أقل</span>
        <span className="heat__ramp">
          {[0.12, 0.34, 0.56, 0.78, 1].map((value) => (
            <i key={value} style={{ '--v': value } as CSSProperties} />
          ))}
        </span>
        <span>أكثر</span>
        {heat.max > 0 && <span className="heat__max">أعلى خانة: {num(heat.max)} بوست</span>}
      </div>

      {tip && (
        <div className="chart__tip glass glass--float" data-align={align} style={{ left: tip.x, top: tip.y - 8 }} role="status">
          <strong>
            {num(tip.cell.count)} <small>بوست</small>
          </strong>
          <span>
            {WEEKDAY_NAMES[tip.cell.weekday]} · {hourLabel(tip.cell.hour)}
          </span>
          {tip.cell.measured > 0 && <em>متوسط التفاعل {oneDecimal(tip.cell.interactions / tip.cell.measured)}</em>}
        </div>
      )}
    </div>
  );
}
