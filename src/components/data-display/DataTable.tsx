import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Returning a value makes the column sortable. */
  sort?: (row: T) => string | number | null;
  width?: string;
  align?: 'start' | 'end';
  /** Hidden below 900px so the row still reads on a laptop split screen. */
  secondary?: boolean;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  empty: ReactNode;
  pageSize?: number;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (keys: Set<string>) => void;
  bulkActions?: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  caption: string;
  dense?: boolean;
}

/**
 * Sticky header, sortable columns, optional selection with bulk actions and
 * pagination. Rows open with click or Enter; inner buttons stop propagation.
 */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, rowLabel, empty, pageSize = 25, selectable, selected, onSelectedChange, bulkActions, initialSort, caption, dense }: Props<T>) {
  const { t, num } = useI18n();
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((entry) => entry.key === sort.key);
    if (!column?.sort) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = column.sort!(a);
      const y = column.sort!(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * factor;
    });
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const allSelected = selectable && visible.length > 0 && visible.every((row) => selected?.has(rowKey(row)));

  const toggleSort = (key: string) => setSort((value) => (value?.key === key ? { key, dir: value.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const toggleRow = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange?.(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    for (const row of visible) {
      if (allSelected) next.delete(rowKey(row));
      else next.add(rowKey(row));
    }
    onSelectedChange?.(next);
  };

  if (!rows.length) return <div className="ui-table-empty">{empty}</div>;

  return (
    <div className="ui-table-wrap">
      {selectable && selected && selected.size > 0 && (
        <div className="ui-table-bulk" role="region" aria-label={t('Bulk actions', 'إجراءات جماعية')}>
          <span className="u-tnum">{t(`${num(selected.size)} selected`, `${num(selected.size)} محدد`)}</span>
          {bulkActions}
          <button type="button" className="ui-link" onClick={() => onSelectedChange?.(new Set())}>
            {t('Clear', 'إلغاء التحديد')}
          </button>
        </div>
      )}
      <div className="ui-table-scroll">
        <table className={`ui-table${dense ? ' ui-table--dense' : ''}`}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {selectable && (
                <th className="ui-table__check" scope="col">
                  <input type="checkbox" checked={Boolean(allSelected)} onChange={toggleAll} aria-label={t('Select all on this page', 'تحديد كل الصفحة')} />
                </th>
              )}
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={{ width: column.width }}
                    className={`${column.align === 'end' ? 'ui-table__end' : ''}${column.secondary ? ' ui-table__secondary' : ''}`}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {column.sort ? (
                      <button type="button" className="ui-table__sort" onClick={() => toggleSort(column.key)}>
                        {column.header}
                        {active ? sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  className={onRowClick ? 'ui-table__row--link' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' && event.target === event.currentTarget) onRowClick(row);
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                  data-selected={selected?.has(key) || undefined}
                >
                  {selectable && (
                    <td className="ui-table__check" onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" checked={Boolean(selected?.has(key))} onChange={() => toggleRow(key)} aria-label={rowLabel?.(row) ?? key} />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key} className={`${column.align === 'end' ? 'ui-table__end' : ''}${column.secondary ? ' ui-table__secondary' : ''}`}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="ui-table-pager">
          <span className="u-muted u-sm u-tnum">
            {t(`${num(current * pageSize + 1)}–${num(Math.min(sorted.length, (current + 1) * pageSize))} of ${num(sorted.length)}`, `${num(current * pageSize + 1)}–${num(Math.min(sorted.length, (current + 1) * pageSize))} من ${num(sorted.length)}`)}
          </span>
          <div className="u-row">
            <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--secondary" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label={t('Previous page', 'الصفحة السابقة')}>
              <ChevronLeft size={15} className="u-flip" />
            </button>
            <button type="button" className="ui-icon-btn ui-icon-btn--sm ui-icon-btn--secondary" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label={t('Next page', 'الصفحة التالية')}>
              <ChevronRight size={15} className="u-flip" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
