import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarPlus,
  ChartSpline,
  Globe,
  Heart,
  Newspaper,
  Plug,
  ShieldCheck,
  Table2,
  Upload,
} from 'lucide-react';
import { SeriesChart, Sparkline, type SeriesDatum } from '../../components/charts/SeriesChart';
import { FilterBar, PlanRow, PostRow } from '../../components/Shared';
import { AnimatedNumber, ConnectorPill, Delta, EmptyState, Panel, Reveal, Ring, ViewHeader } from '../../components/ui/Bits';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Controls';
import { PlatformBadge } from '../../components/ui/Platform';
import { useApp } from '../../context';
import {
  buildTrend,
  byPlatform,
  change,
  latestPosts,
  periodLong,
  periodPrevious,
  planStats,
  radar,
  scopePosts,
  splitByPeriod,
  summarize,
  topPosts,
  websiteTotals,
} from '../../lib/analytics';
import { compact, dateFromKey, dayKeyOf, fmt, fmtDayShort, fmtWeekdayDate, greeting, num, relative } from '../../lib/format';
import { platformColor, platformName } from '../../lib/platforms';

type Metric = 'interactions' | 'posts';
const UNIT: Record<Metric, string> = { interactions: 'تفاعل', posts: 'بوست' };
const dayMs = (dayNum: number) => dateFromKey(dayKeyOf(dayNum)).toMillis();

function Kpi({
  icon,
  label,
  tone,
  children,
  foot,
  spark,
}: {
  icon: ReactNode;
  label: string;
  tone: 'accent' | 'amber' | 'ok' | 'info';
  children: ReactNode;
  foot: ReactNode;
  spark?: number[];
}) {
  return (
    <article className={`glass kpi kpi--${tone}`} data-spot>
      <header className="kpi__head">
        <span className="kpi__icon">{icon}</span>
        <span className="kpi__label">{label}</span>
      </header>
      <div className="kpi__value">{children}</div>
      <div className="kpi__foot">{foot}</div>
      {spark && <Sparkline values={spark} />}
    </article>
  );
}

export function OverviewView() {
  const { data, now, todayNum, filters, setFilters, go, openPlan, openPost } = useApp();
  const [metricChoice, setMetricChoice] = useState<Metric | null>(null);
  const [asTable, setAsTable] = useState(false);

  const scoped = useMemo(() => scopePosts(data.posts, filters), [data.posts, filters]);
  const { current, previous } = useMemo(() => splitByPeriod(scoped, filters.period, todayNum), [scoped, filters.period, todayNum]);
  const totals = useMemo(() => summarize(current), [current]);
  const before = useMemo(() => summarize(previous), [previous]);
  const trend = useMemo(() => buildTrend(current, filters.period, todayNum), [current, filters.period, todayNum]);
  const best = useMemo(() => topPosts(current, 5), [current]);
  const recent = useMemo(() => (best.length ? [] : latestPosts(current, 5)), [best, current]);

  const plans = useMemo(
    () => data.plans.filter((plan) => filters.platform === 'all' || plan.platform === filters.platform),
    [data.plans, filters.platform],
  );
  const stats = useMemo(() => planStats(plans), [plans]);
  const watch = useMemo(() => radar(plans, 5), [plans]);

  const channels = useMemo(() => {
    const everyPlatform = splitByPeriod(scopePosts(data.posts, { platform: 'all', account: 'all' }), filters.period, todayNum).current;
    const rows = byPlatform(everyPlatform);
    const top = Math.max(1, ...rows.map((row) => row.count));
    return rows.map((row) => ({ ...row, share: row.count / top, connector: data.connectors.find((item) => item.platform === row.platform) }));
  }, [data.posts, data.connectors, filters.period, todayNum]);

  const site = useMemo(() => websiteTotals(data.website, filters.period, todayNum), [data.website, filters.period, todayNum]);
  const siteScoped = filters.platform === 'all' || filters.platform === 'website';
  const connected = data.connectors.filter((item) => item.status === 'connected').length;

  const metric: Metric = metricChoice ?? (totals.measured ? 'interactions' : 'posts');
  const weekly = filters.period > 120;
  const series = useMemo<SeriesDatum[]>(
    () =>
      trend.map((point) => ({
        key: point.key,
        label: fmt(dayMs(point.from), { day: 'numeric', month: 'short' }),
        title: weekly ? `${fmtDayShort(dayMs(point.from))} – ${fmtDayShort(dayMs(point.to))}` : fmtWeekdayDate(dayMs(point.from)),
        value: metric === 'interactions' ? point.interactions : point.posts,
        note:
          metric === 'interactions'
            ? point.posts
              ? `${num(point.measured)} من ${num(point.posts)} بوست لها بيانات تفاعل`
              : 'لا توجد بوستات'
            : undefined,
      })),
    [trend, metric, weekly],
  );
  const previousLabel = periodPrevious(filters.period);
  const noInteractionData = metric === 'interactions' && totals.measured === 0;

  return (
    <>
      <Reveal>
        <ViewHeader
          title={greeting(now)}
          subtitle={
            <>
              {fmtWeekdayDate(now)} · {connected} من {data.connectors.length} مصادر متصلة
            </>
          }
        />
      </Reveal>

      <Reveal i={1}>
        <FilterBar />
      </Reveal>

      <div className="grid">
        <Reveal i={2} className="col-3">
          <Kpi
            tone="accent"
            icon={<Newspaper size={18} />}
            label="بوستات منشورة"
            spark={trend.map((point) => point.posts)}
            foot={<Delta value={change(totals.count, before.count)} label={before.count ? previousLabel : 'لا توجد فترة سابقة للمقارنة'} />}
          >
            <AnimatedNumber value={totals.count} format={compact} />
          </Kpi>
        </Reveal>

        <Reveal i={3} className="col-3">
          <Kpi
            tone="amber"
            icon={<Heart size={18} />}
            label="التفاعلات المرصودة"
            spark={totals.measured ? trend.map((point) => point.interactions) : undefined}
            foot={
              totals.measured ? (
                <>
                  <Delta
                    value={before.measured ? change(totals.interactions, before.interactions) : null}
                    label={before.measured ? previousLabel : 'لا توجد فترة سابقة للمقارنة'}
                  />
                  <span className="kpi__note">
                    من {num(totals.measured)} بوست لها بيانات، من أصل {num(totals.count)}
                  </span>
                </>
              ) : (
                <span className="kpi__note">{totals.count ? 'المنصات لم تُرجع أرقام تفاعل لهذه الفترة.' : 'لا توجد بوستات في هذه الفترة.'}</span>
              )
            }
          >
            <AnimatedNumber value={totals.measured ? totals.interactions : null} format={compact} />
          </Kpi>
        </Reveal>

        <Reveal i={4} className="col-3">
          <article className="glass kpi kpi--ok" data-spot>
            <header className="kpi__head">
              <span className="kpi__icon">
                <CalendarCheck2 size={18} />
              </span>
              <span className="kpi__label">تنفيذ خطة النشر</span>
            </header>
            {stats.total ? (
              <div className="kpi__meter">
                <Ring value={stats.execution} tone="ok">
                  {stats.execution == null ? '—' : `${Math.round(stats.execution)}%`}
                </Ring>
                <ul>
                  <li>
                    <b>{num(stats.published)}</b> نشر مؤكد
                  </li>
                  <li data-alert={stats.attention > 0 || undefined}>
                    <b>{num(stats.attention)}</b> يحتاج متابعة
                  </li>
                  <li>
                    <b>{num(stats.upcoming)}</b> قادم
                  </li>
                </ul>
              </div>
            ) : (
              <>
                <div className="kpi__value kpi__value--muted">—</div>
                <div className="kpi__foot">
                  <span className="kpi__note">لم تُرفع خطة بعد.</span>
                  <button type="button" className="link" onClick={() => go('calendar')}>
                    افتح الكاليندر <ArrowLeft size={14} />
                  </button>
                </div>
              </>
            )}
          </article>
        </Reveal>

        <Reveal i={5} className="col-3">
          <Kpi
            tone="info"
            icon={<Globe size={18} />}
            label="مشاهدات الموقع"
            foot={
              !siteScoped ? (
                <span className="kpi__note">تظهر عند اختيار كل المنصات أو الموقع.</span>
              ) : site.days ? (
                <Delta value={change(site.views, site.previousViews)} label={site.previousViews ? previousLabel : 'من Google Analytics 4'} />
              ) : (
                <>
                  <span className="kpi__note">GA4 غير متصل بعد.</span>
                  <button type="button" className="link" onClick={() => go('connections')}>
                    حالة الربط <ArrowLeft size={14} />
                  </button>
                </>
              )
            }
          >
            <AnimatedNumber value={siteScoped && site.days ? site.views : null} format={compact} />
          </Kpi>
        </Reveal>

        <Reveal i={6} className="col-8">
          <Panel
            title="حركة الأداء"
            subtitle={`${metric === 'interactions' ? 'إجمالي التفاعلات على البوستات المرصودة' : 'عدد البوستات المنشورة'} · ${periodLong(filters.period)}${weekly ? ' · أسبوعيًا' : ''}`}
            actions={
              <>
                <Segmented
                  label="المقياس"
                  size="sm"
                  value={metric}
                  onChange={setMetricChoice}
                  options={[
                    { value: 'interactions', label: 'التفاعلات' },
                    { value: 'posts', label: 'البوستات' },
                  ]}
                />
                <Segmented
                  label="طريقة العرض"
                  size="sm"
                  iconOnly
                  value={asTable ? 'table' : 'chart'}
                  onChange={(value) => setAsTable(value === 'table')}
                  options={[
                    { value: 'chart', label: 'رسم بياني', icon: <ChartSpline size={15} /> },
                    { value: 'table', label: 'جدول', icon: <Table2 size={15} /> },
                  ]}
                />
              </>
            }
          >
            {noInteractionData ? (
              <EmptyState
                icon={<Heart size={26} />}
                title="بيانات التفاعل لم تتوفر بعد"
                text="راجع صلاحيات الإعجابات والتعليقات والـinsights في المنصات المتصلة."
                action={
                  <Button size="sm" onClick={() => setMetricChoice('posts')}>
                    اعرض عدد البوستات
                  </Button>
                }
              />
            ) : asTable ? (
              <div className="table-wrap table-wrap--short">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{weekly ? 'الأسبوع' : 'اليوم'}</th>
                      <th>{metric === 'interactions' ? 'التفاعلات' : 'البوستات'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map((item) => (
                      <tr key={item.key}>
                        <td>{item.title}</td>
                        <td className="num">{num(item.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <SeriesChart
                data={series}
                kind={metric === 'interactions' ? 'area' : 'bars'}
                unit={UNIT[metric]}
                ariaLabel={metric === 'interactions' ? 'التفاعلات على مدار الفترة' : 'عدد البوستات على مدار الفترة'}
                replayKey={`${metric}-${filters.period}-${filters.platform}-${filters.account}`}
              />
            )}
            <footer className="panel__foot">
              <span>
                {totals.reachCount
                  ? `الوصول متاح لـ ${num(totals.reachCount)} من ${num(totals.count)} بوست · ${compact(totals.reach)}`
                  : 'بيانات الوصول غير متاحة حتى الآن.'}
              </span>
              {totals.average != null && <span>متوسط التفاعل لكل بوست مرصود: {compact(Math.round(totals.average))}</span>}
            </footer>
          </Panel>
        </Reveal>

        <Reveal i={7} className="col-4">
          <Panel
            title="على رادارك"
            subtitle="المتأخر أولًا ثم القادم"
            actions={
              <button type="button" className="link" onClick={() => go('calendar')}>
                الكاليندر <ArrowLeft size={14} />
              </button>
            }
          >
            {watch.length ? (
              <div className="rows">
                {watch.map((plan) => (
                  <PlanRow key={plan.id} plan={plan} showDay onOpen={(item) => openPlan({ mode: 'edit', plan: item })} />
                ))}
              </div>
            ) : plans.length ? (
              <EmptyState compact icon={<ShieldCheck size={24} />} title="لا يوجد ما يحتاج متابعة" text="لا بوستات متأخرة ولا قادمة في الخطة." />
            ) : (
              <EmptyState
                compact
                icon={<CalendarPlus size={24} />}
                title="الخطة فارغة"
                text="ارفع كاليندر الفريق أو أضف أول بوست لتبدأ المتابعة والتنبيهات."
                action={
                  <div className="empty__actions">
                    <Button size="sm" variant="primary" onClick={() => openPlan({ mode: 'new' })}>
                      أضف بوست
                    </Button>
                    <Button size="sm" icon={<Upload size={14} />} onClick={() => go('calendar')}>
                      ارفع كاليندر
                    </Button>
                  </div>
                }
              />
            )}
          </Panel>
        </Reveal>

        <Reveal i={8} className="col-7">
          <Panel
            title={best.length ? 'أفضل البوستات' : 'أحدث البوستات'}
            subtitle={best.length ? 'حسب التفاعلات المتاحة فقط' : 'لا توجد أرقام تفاعل للفترة — هذه أحدث المنشورات'}
            actions={
              <button type="button" className="link" onClick={() => go('content')}>
                كل البوستات <ArrowLeft size={14} />
              </button>
            }
          >
            {best.length || recent.length ? (
              <div className="rows">
                {(best.length ? best : recent).map((post, index) => (
                  <PostRow key={post.key} post={post} rank={best.length ? index + 1 : undefined} onOpen={openPost} />
                ))}
              </div>
            ) : (
              <EmptyState compact icon={<Newspaper size={24} />} title="لا توجد بوستات في هذه الفترة" text="جرّب فترة أطول أو راجع حالة ربط المنصات." />
            )}
          </Panel>
        </Reveal>

        <Reveal i={9} className="col-5">
          <Panel
            title="المنصات"
            subtitle={`كل المنصات · ${periodLong(filters.period)}`}
            actions={
              <button type="button" className="link" onClick={() => go('connections')}>
                الربط <ArrowLeft size={14} />
              </button>
            }
          >
            <div className="channels">
              {channels.map((row) => (
                <button
                  key={row.platform}
                  type="button"
                  className="channel"
                  data-active={filters.platform === row.platform}
                  style={{ '--p': platformColor(row.platform), '--share': row.share } as CSSProperties}
                  onClick={() => setFilters({ platform: filters.platform === row.platform ? 'all' : row.platform, account: 'all' })}
                >
                  <PlatformBadge platform={row.platform} size="sm" />
                  <span className="channel__name">
                    <b>{platformName[row.platform]}</b>
                    <small>{row.connector?.checkedAt ? `آخر فحص ${relative(row.connector.checkedAt, now)}` : 'لم يُفحص بعد'}</small>
                  </span>
                  <span className="channel__bar" aria-hidden data-off={row.platform === 'website' || undefined}>
                    <i />
                  </span>
                  <span className="channel__count">
                    <b>
                      {row.platform === 'website'
                        ? site.days
                          ? compact(site.views)
                          : '—'
                        : row.connector?.status === 'connected' || row.count
                          ? num(row.count)
                          : '—'}
                    </b>
                    <small>{row.platform === 'website' ? 'مشاهدة' : 'بوست'}</small>
                  </span>
                  <ConnectorPill status={row.connector?.status ?? 'needs_setup'} />
                </button>
              ))}
            </div>
            <footer className="panel__foot">
              <span>
                <Plug size={13} /> الضغط على منصة يطبّقها كفلتر على اللوحة.
              </span>
            </footer>
          </Panel>
        </Reveal>
      </div>
    </>
  );
}
