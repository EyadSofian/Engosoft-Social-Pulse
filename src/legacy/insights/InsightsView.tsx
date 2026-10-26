import { useMemo, useState, type CSSProperties } from 'react';
import { CalendarClock, Clock3, Flame, Trophy } from 'lucide-react';
import { Heatmap } from './Heatmap';
import { SeriesChart, type SeriesDatum } from './SeriesChart';
import { FilterBar } from '../ui/Shared';
import { Delta, EmptyState, Panel, Reveal, ViewHeader } from '../ui/Bits';
import { Segmented } from '../ui/Controls';
import { PlatformBadge } from '../ui/Platform';
import { useApp } from '../context';
import { byAccount, change, heatmap, monthlyRows, scopePosts, WEEKDAY_NAMES, type HeatCell } from '../../lib/analytics';
import { compact, fmt, fmtMonth, hourLabel, num, oneDecimal, zoneNow } from '../../lib/format';
import { platformName } from '../../lib/platforms';

type Metric = 'posts' | 'interactions' | 'average';
const METRICS: { value: Metric; label: string; unit: string }[] = [
  { value: 'posts', label: 'المنشورات', unit: 'منشور' },
  { value: 'interactions', label: 'التفاعلات', unit: 'تفاعل' },
  { value: 'average', label: 'متوسط التفاعل', unit: 'تفاعل لكل منشور' },
];

export function InsightsView() {
  const { data, now, filters } = useApp();
  const [months, setMonths] = useState<6 | 12>(6);
  const [metric, setMetric] = useState<Metric>('posts');

  const today = zoneNow(now);
  const monthKey = today.toFormat('yyyy-LL');
  const scoped = useMemo(() => scopePosts(data.posts, filters), [data.posts, filters]);
  // Keyed on the month, not on `now`: the rows only change when the month rolls over.
  const rows = useMemo(() => monthlyRows(scoped, months, now), [scoped, months, monthKey]);
  const inRange = useMemo(() => scoped.filter((post) => post.ts >= rows[0].start), [scoped, rows]);
  const heat = useMemo(() => heatmap(inRange), [inRange]);
  const accounts = useMemo(() => byAccount(inRange), [inRange]);

  const currentRow = rows[rows.length - 1];
  const lastRow = rows[rows.length - 2];
  const beforeLast = rows[rows.length - 3];
  const sameSpanLastMonth = useMemo(() => {
    const previous = today.minus({ months: 1 }).toFormat('yyyy-LL');
    return scoped.filter((post) => post.month === previous && Number(post.day.slice(8)) <= today.day).length;
  }, [scoped, monthKey, today.day]);
  const fullMonths = rows.slice(0, -1);
  const bestMonth = fullMonths.reduce<(typeof rows)[number] | null>((best, row) => (row.count > (best?.count ?? 0) ? row : best), null);
  const monthlyAverage = fullMonths.length ? fullMonths.reduce((sum, row) => sum + row.count, 0) / fullMonths.length : null;

  const bestEngagement = useMemo(() => {
    let best: HeatCell | null = null;
    for (const row of heat.rows)
      for (const cell of row.cells)
        if (cell.measured >= 2 && (!best || cell.interactions / cell.measured > best.interactions / best.measured)) best = cell;
    return best;
  }, [heat]);
  const busiestDay = heat.rows.reduce<(typeof heat.rows)[number] | null>((best, row) => (row.total > (best?.total ?? 0) ? row : best), null);
  const topDayTotal = Math.max(1, ...heat.rows.map((row) => row.total));

  const series = useMemo<SeriesDatum[]>(
    () =>
      rows.map((row) => ({
        key: row.key,
        label: fmt(row.start, months === 12 ? { month: 'short' } : { month: 'long' }),
        title: fmtMonth(row.start),
        value: metric === 'posts' ? row.count : metric === 'interactions' ? row.interactions : Math.round(row.average ?? 0),
        partial: row.isCurrent,
        note: row.isCurrent
          ? 'الشهر الجاري — حتى الآن'
          : metric === 'posts'
            ? undefined
            : `${num(row.measured)} من ${num(row.count)} منشور لها بيانات تفاعل`,
      })),
    [rows, metric, months],
  );
  const unit = METRICS.find((item) => item.value === metric)?.unit ?? '';
  const hasData = inRange.length > 0;

  return (
    <>
      <Reveal>
        <ViewHeader title="التحليلات" subtitle="مقارنة الشهور وأنماط النشر — محسوبة من المنشورات المرصودة فعليًا على المنصات." />
      </Reveal>

      <Reveal i={1}>
        <FilterBar period={false}>
          <Segmented
            label="نطاق المقارنة"
            size="sm"
            value={months}
            onChange={setMonths}
            options={[
              { value: 6, label: '6 أشهر' },
              { value: 12, label: '12 شهرًا' },
            ]}
          />
        </FilterBar>
      </Reveal>

      <Reveal i={2} className="summary">
        <div className="glass summary__item">
          <span>هذا الشهر حتى الآن</span>
          <b>{num(currentRow.count)}</b>
          <Delta value={change(currentRow.count, sameSpanLastMonth)} label={sameSpanLastMonth ? 'عن الفترة نفسها من الشهر الماضي' : 'لا توجد فترة مقابلة للمقارنة'} />
        </div>
        <div className="glass summary__item">
          <span>الشهر الماضي</span>
          <b>{lastRow ? num(lastRow.count) : '—'}</b>
          <Delta value={lastRow && beforeLast ? change(lastRow.count, beforeLast.count) : null} label={beforeLast?.count ? 'عن الشهر الذي قبله' : 'لا يوجد شهر سابق للمقارنة'} />
        </div>
        <div className="glass summary__item">
          <span>أنشط شهر في النطاق</span>
          <b>{bestMonth ? fmt(bestMonth.start, { month: 'long' }) : '—'}</b>
          <small>{bestMonth ? `${num(bestMonth.count)} منشور` : 'لا توجد أشهر مكتملة بها منشورات'}</small>
        </div>
        <div className="glass summary__item">
          <span>متوسط المنشورات شهريًا</span>
          <b>{monthlyAverage == null ? '—' : oneDecimal(monthlyAverage)}</b>
          <small>للأشهر المكتملة في النطاق</small>
        </div>
      </Reveal>

      <div className="grid">
        <Reveal i={3} className="col-12">
          <Panel
            title="المقارنة الشهرية"
            subtitle={`آخر ${months === 6 ? '6 أشهر' : '12 شهرًا'} · العمود الباهت هو الشهر الجاري ولم يكتمل بعد`}
            actions={<Segmented label="المقياس" size="sm" value={metric} onChange={setMetric} options={METRICS.map(({ value, label }) => ({ value, label }))} />}
          >
            {hasData ? (
              <SeriesChart data={series} kind="bars" categorical unit={unit} ariaLabel={`المقارنة الشهرية: ${unit}`} height={300} replayKey={`${metric}-${months}-${filters.platform}-${filters.account}`} />
            ) : (
              <EmptyState icon={<CalendarClock size={26} />} title="لا توجد منشورات في هذا النطاق" text="جرّب نطاق 12 شهرًا أو غيّر المنصة." />
            )}
          </Panel>
        </Reveal>

        <Reveal i={4} className="col-12">
          <Panel flush title="تفاصيل الشهور" subtitle="متوسط التفاعل محسوب فقط للمنشورات التي رجعت لها أرقام؛ التغطية توضّح عددها." className="panel--titled-flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>الشهر</th>
                    <th className="num">المنشورات</th>
                    <th>التغيّر عن الشهر السابق</th>
                    <th className="num">تغطية المقاييس</th>
                    <th className="num">التفاعلات</th>
                    <th className="num">متوسط التفاعل / منشور</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((row, index, list) => {
                    const older = list[index + 1];
                    return (
                      <tr key={row.key}>
                        <td>
                          <b>{fmtMonth(row.start)}</b>
                          {row.isCurrent && <em className="today-tag">حتى الآن</em>}
                        </td>
                        <td className="num">
                          <span className="bar-cell" style={{ '--share': row.count / Math.max(1, ...rows.map((item) => item.count)) } as CSSProperties}>
                            <i />
                            {num(row.count)}
                          </span>
                        </td>
                        <td>{row.isCurrent || !older ? <span className="muted">—</span> : <Delta value={change(row.count, older.count)} label="" />}</td>
                        <td className="num" data-missing={!row.count || undefined}>
                          {row.count ? `${Math.round(row.coverage ?? 0)}% (${num(row.measured)}/${num(row.count)})` : '—'}
                        </td>
                        <td className="num" data-missing={!row.measured || undefined}>
                          {row.measured ? num(row.interactions) : '—'}
                        </td>
                        <td className="num" data-missing={row.average == null || undefined}>
                          {row.average == null ? '—' : oneDecimal(row.average)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </Reveal>

        <Reveal i={5} className="col-8">
          <Panel title="متى ننشر؟" subtitle="عدد المنشورات حسب اليوم والساعة بتوقيت القاهرة · كل خانة ساعة واحدة">
            {hasData ? (
              <>
                <Heatmap heat={heat} />
                <div className="facts">
                  {heat.best && (
                    <div className="fact">
                      <Flame size={16} />
                      <span>
                        أكثر وقت نشر: <b>{WEEKDAY_NAMES[heat.best.weekday]} {hourLabel(heat.best.hour)}</b> ({num(heat.best.count)} منشور)
                      </span>
                    </div>
                  )}
                  {bestEngagement ? (
                    <div className="fact">
                      <Trophy size={16} />
                      <span>
                        أعلى متوسط تفاعل: <b>{WEEKDAY_NAMES[bestEngagement.weekday]} {hourLabel(bestEngagement.hour)}</b> (
                        {oneDecimal(bestEngagement.interactions / bestEngagement.measured)} لكل منشور، من {num(bestEngagement.measured)} منشورات)
                      </span>
                    </div>
                  ) : (
                    <div className="fact fact--muted">
                      <Trophy size={16} />
                      <span>أفضل وقت من حيث التفاعل يظهر عند توفر بيانات تفاعل لمنشورين على الأقل في الساعة نفسها.</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyState icon={<Clock3 size={26} />} title="لا توجد بيانات كافية" text="خريطة أوقات النشر تظهر بعد رصد منشورات في هذا النطاق." />
            )}
          </Panel>
        </Reveal>

        <Reveal i={6} className="col-4">
          <Panel title="أيام الأسبوع" subtitle={busiestDay?.total ? `الأنشط: ${WEEKDAY_NAMES[busiestDay.weekday]}` : 'توزيع المنشورات على الأيام'}>
            <div className="bars">
              {heat.rows.map((row) => (
                <div key={row.weekday} className="bars__row" style={{ '--share': row.total / topDayTotal } as CSSProperties}>
                  <span>{WEEKDAY_NAMES[row.weekday]}</span>
                  <span className="bars__track" aria-hidden>
                    <i />
                  </span>
                  <b>{num(row.total)}</b>
                </div>
              ))}
            </div>
          </Panel>
        </Reveal>

        {accounts.length > 1 && (
          <Reveal i={7} className="col-12">
            <Panel flush title="الحسابات والصفحات" subtitle="أداء كل حساب داخل النطاق المحدد" className="panel--titled-flush">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>الحساب</th>
                      <th>المنصة</th>
                      <th className="num">المنشورات</th>
                      <th className="num">تغطية المقاييس</th>
                      <th className="num">التفاعلات</th>
                      <th className="num">متوسط التفاعل / منشور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <b>{row.name}</b>
                        </td>
                        <td>
                          <span className="cell-platform">
                            <PlatformBadge platform={row.platform} size="xs" />
                            {platformName[row.platform]}
                          </span>
                        </td>
                        <td className="num">{num(row.count)}</td>
                        <td className="num">{`${Math.round(row.coverage ?? 0)}% (${num(row.measured)}/${num(row.count)})`}</td>
                        <td className="num" data-missing={!row.measured || undefined}>
                          {row.measured ? compact(row.interactions) : '—'}
                        </td>
                        <td className="num" data-missing={row.average == null || undefined}>
                          {row.average == null ? '—' : oneDecimal(row.average)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </Reveal>
        )}
      </div>
    </>
  );
}
