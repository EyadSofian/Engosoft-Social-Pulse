import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, FileSpreadsheet, Printer, RefreshCw, SearchX } from 'lucide-react';
import { useQueryState } from '../../app/router/router';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { SeriesChart, type SeriesDatum } from '../../components/charts/Series';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { DataTable, type Column } from '../../components/data-display/DataTable';
import { EmptyState } from '../../components/feedback/States';
import { LiveGate } from '../../components/feedback/LiveGate';
import { FilterSelect, SearchInput } from '../../components/forms/Field';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Tabs';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { PERIODS, type Period } from '../../lib/analytics';
import { dateFromKey, dayKeyOf } from '../../lib/format';
import { PLATFORMS } from '../../lib/platforms';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import type { Platform, Post } from '../../types';
import { exportWorkbook, KPI_LABEL, printReport } from './export';
import { useAnalytics, type AnalyticsModel, type Kpi } from './model';

const PERIOD_VALUES = PERIODS.map((period) => String(period.value));

/**
 * Analytics on one page: pick a period and a platform, read five numbers, see the activity,
 * compare platforms and go through every post. What is on screen is what Excel and the PDF get.
 */
export function AnalyticsHub() {
  const i18n = useI18n();
  const { t, num, relative } = i18n;
  const [query, setQuery] = useQueryState();
  const { store, runSync } = useLiveData();
  const [syncing, setSyncing] = useState(false);

  const period = (PERIOD_VALUES.includes(query.get('period') ?? '') ? Number(query.get('period')) : 30) as Period;
  const platform = (PLATFORMS as string[]).includes(query.get('platform') ?? '') ? (query.get('platform') as Platform) : 'all';
  const account = query.get('account') ?? 'all';

  usePageMeta(t('Analytics', 'التحليلات'), [{ label: t('Analytics', 'التحليلات') }]);
  const model = useAnalytics({ period, platform, account });

  const setPlatform = (value: Platform | 'all') => setQuery({ platform: value === 'all' ? null : value, account: null });

  const sync = async () => {
    setSyncing(true);
    try {
      await runSync();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="u-stack an">
      <PageHeader
        title={t('Analytics', 'التحليلات')}
        description={t('How the published posts performed on the connected accounts.', 'أداء المنشورات على الحسابات المربوطة.')}
        actions={
          <>
            <Button icon={<FileSpreadsheet size={15} />} onClick={() => exportWorkbook(model, i18n)} disabled={!model.posts.length}>
              {t('Export Excel', 'تصدير Excel')}
            </Button>
            <Button icon={<Printer size={15} />} onClick={() => printReport(model, i18n)} disabled={!model.posts.length}>
              {t('PDF', 'PDF')}
            </Button>
          </>
        }
      />

      <div className="an-bar">
        <Segmented
          label={t('Period', 'الفترة')}
          value={String(period)}
          onChange={(value) => setQuery({ period: value === '30' ? null : value })}
          items={PERIODS.map((item) => ({ value: String(item.value), label: item.value === 365 ? t('1 year', 'سنة') : t(`${item.value} days`, `${item.value} يوم`) }))}
        />
        <FilterSelect
          label={t('Platform', 'المنصة')}
          value={platform}
          onChange={setPlatform}
          allLabel={t('All platforms', 'كل المنصات')}
          options={PLATFORMS.filter((item) => item !== 'website').map((item) => ({ value: item, label: channelName[item] }))}
        />
        {model.accountOptions.length > 1 && (
          <FilterSelect
            label={t('Account', 'الحساب')}
            value={account}
            onChange={(value) => setQuery({ account: value === 'all' ? null : value })}
            allLabel={t('All accounts', 'كل الحسابات')}
            options={model.accountOptions.map((option) => ({ value: option.id, label: option.name }))}
          />
        )}
        <span className="an-bar__spacer" />
        {model.lastCheck > 0 && <span className="an-bar__updated">{t(`Updated ${relative(model.lastCheck, model.now)}`, `اتحدّث ${relative(model.lastCheck, model.now)}`)}</span>}
        <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} busy={syncing} onClick={() => void sync()}>
          {t('Refresh', 'تحديث')}
        </Button>
      </div>

      <LiveGate needs={store.data.posts.length ? undefined : 'posts'}>
        <div className="an-kpis">
          {model.kpis.map((kpi) => (
            <KpiTile key={kpi.key} kpi={kpi} />
          ))}
        </div>

        {model.posts.length ? (
          <>
            <Activity model={model} />
            <PlatformTable model={model} onPick={setPlatform} />
            <PostTable posts={model.posts} />
          </>
        ) : (
          <Card>
            <CardBody>
              <EmptyState
                compact
                title={t(`Nothing was published in the last ${num(period)} days.`, `مفيش منشورات في آخر ${num(period)} يوم.`)}
                text={t('Try a longer period or another platform.', 'جرّب فترة أطول أو منصة تانية.')}
              />
            </CardBody>
          </Card>
        )}
      </LiveGate>
    </div>
  );
}

function KpiTile({ kpi }: { kpi: Kpi }) {
  const { t, tx, num, compact, pct } = useI18n();
  const value = kpi.value == null ? '—' : kpi.key === 'rate' ? pct(kpi.value, 2) : kpi.key === 'posts' ? num(kpi.value) : compact(kpi.value);
  const up = (kpi.change ?? 0) >= 0;
  const amount = kpi.change == null ? null : kpi.key === 'rate' ? `${num(Math.round(Math.abs(kpi.change) * 100) / 100)} ${t('pts', 'نقطة')}` : pct(Math.abs(kpi.change), 0);
  return (
    <article className="an-kpi">
      <h3 className="an-kpi__label">{tx(KPI_LABEL[kpi.key])}</h3>
      <p className="an-kpi__value u-tnum" title={kpi.value == null ? undefined : num(kpi.value)}>
        {value}
      </p>
      {kpi.value == null ? (
        <p className="an-change">{t('Not reported by the platform', 'المنصة مش بترجع الرقم ده')}</p>
      ) : amount == null ? (
        <p className="an-change">{t('No earlier period to compare', 'مفيش فترة قبلها للمقارنة')}</p>
      ) : (
        <p className={`an-change an-change--${kpi.change === 0 ? 'flat' : up ? 'up' : 'down'}`}>
          {kpi.change === 0 ? null : up ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
          <bdi>{amount}</bdi>
          <small>{t('vs previous period', 'عن الفترة اللي قبلها')}</small>
        </p>
      )}
    </article>
  );
}

type Metric = 'posts' | 'interactions';

function Activity({ model }: { model: AnalyticsModel }) {
  const { t, date } = useI18n();
  const [metric, setMetric] = useState<Metric>('posts');
  const dayMs = (dayNum: number) => dateFromKey(dayKeyOf(dayNum)).toMillis();
  const data: SeriesDatum[] = model.trend.map((point) => ({
    key: point.key,
    label: date(dayMs(point.from), 'dayShort'),
    title: model.weekly ? `${date(dayMs(point.from), 'dayShort')} – ${date(dayMs(point.to), 'dayShort')}` : date(dayMs(point.from), 'weekdayDate'),
    value: metric === 'posts' ? point.posts : point.interactions,
    partial: point.to >= model.todayNum,
  }));
  return (
    <Card>
      <CardHeader
        title={t('Activity', 'النشاط')}
        description={model.weekly ? t('Per week', 'كل أسبوع') : t('Per day', 'كل يوم')}
        actions={
          <Segmented
            label={t('Show', 'اعرض')}
            value={metric}
            onChange={setMetric}
            items={[
              { value: 'posts', label: t('Posts', 'المنشورات') },
              { value: 'interactions', label: t('Interactions', 'التفاعلات') },
            ]}
          />
        }
      />
      <CardBody>
        <SeriesChart
          data={data}
          kind="bars"
          unit={metric === 'posts' ? t('post', 'منشور') : t('interaction', 'تفاعل')}
          ariaLabel={metric === 'posts' ? t('Posts over time', 'المنشورات على مدار الفترة') : t('Interactions over time', 'التفاعلات على مدار الفترة')}
          replayKey={`${metric}-${model.scope.period}-${model.scope.platform}-${model.scope.account}`}
        />
      </CardBody>
    </Card>
  );
}

function PlatformTable({ model, onPick }: { model: AnalyticsModel; onPick: (platform: Platform | 'all') => void }) {
  const { t, num, compact, pct } = useI18n();
  const picked = model.scope.platform;
  return (
    <Card>
      <CardHeader title={t('By platform', 'حسب المنصة')} description={picked === 'all' ? t('Click a platform to see only its numbers.', 'دوس على منصة علشان تشوف أرقامها لوحدها.') : t('Click it again to see every platform.', 'دوس عليها تاني علشان ترجع لكل المنصات.')} />
      <div className="ui-table-scroll">
        <table className="ui-table an-platforms">
          <caption className="sr-only">{t('By platform', 'حسب المنصة')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('Platform', 'المنصة')}</th>
              <th scope="col" className="ui-table__end">{t('Posts', 'المنشورات')}</th>
              <th scope="col" className="ui-table__end">{t('Reach', 'الوصول')}</th>
              <th scope="col" className="ui-table__end">{t('Views', 'المشاهدات')}</th>
              <th scope="col" className="ui-table__end">{t('Interactions', 'التفاعلات')}</th>
              <th scope="col" className="ui-table__end">{t('Engagement rate', 'معدل التفاعل')}</th>
            </tr>
          </thead>
          <tbody>
            {model.platforms.map((row) => (
              <tr key={row.platform} aria-current={picked === row.platform || undefined} onClick={() => onPick(picked === row.platform ? 'all' : row.platform)}>
                <td>
                  <button type="button" className="an-cell an-pick" onClick={(event) => { event.stopPropagation(); onPick(picked === row.platform ? 'all' : row.platform); }}>
                    <ChannelIcon channel={row.platform} size={15} /> {channelName[row.platform]}
                  </button>
                </td>
                <td className="ui-table__end u-tnum">{num(row.count)}</td>
                <td className="ui-table__end u-tnum">{row.reachCount ? compact(row.reach) : '—'}</td>
                <td className="ui-table__end u-tnum">{row.viewsCount ? compact(row.views) : '—'}</td>
                <td className="ui-table__end u-tnum">{row.measured ? compact(row.interactions) : '—'}</td>
                <td className="ui-table__end u-tnum">{pct(row.rate, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PostTable({ posts }: { posts: Post[] }) {
  const { t, num, compact, date, pct } = useI18n();
  const [search, setSearch] = useState('');

  const found = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return posts;
    return posts.filter((post) => post.title.toLowerCase().includes(needle) || post.accountName.toLowerCase().includes(needle));
  }, [posts, search]);

  // A column no post has a number for is only dashes; leave it out.
  const has = (key: 'reach' | 'views') => posts.some((post) => post.metrics[key] != null);
  const columns: Column<Post>[] = [
    {
      key: 'title',
      header: t('Post', 'المنشور'),
      cell: (post) => (
        <div className="an-cell">
          <ChannelIcon channel={post.platform} size={15} />
          <span className="an-cell__text">
            <a href={post.permalink} target="_blank" rel="noreferrer" dir="auto">
              <span className="u-truncate">{post.title || t('(no caption)', '(بدون نص)')}</span>
              <ExternalLink size={11} aria-hidden />
            </a>
            <small className="u-muted">{post.accountName || channelName[post.platform]}</small>
          </span>
        </div>
      ),
    },
    { key: 'date', header: t('Published', 'تاريخ النشر'), sort: (post) => post.ts, cell: (post) => <span className="u-tnum u-sm">{date(post.ts, 'dayShort')}</span> },
    ...(has('reach') ? [{ key: 'reach', header: t('Reach', 'الوصول'), align: 'end' as const, sort: (post: Post) => post.metrics.reach, cell: (post: Post) => <span className="u-tnum">{compact(post.metrics.reach)}</span> }] : []),
    ...(has('views') ? [{ key: 'views', header: t('Views', 'المشاهدات'), align: 'end' as const, sort: (post: Post) => post.metrics.views, cell: (post: Post) => <span className="u-tnum">{compact(post.metrics.views)}</span> }] : []),
    { key: 'interactions', header: t('Interactions', 'التفاعلات'), align: 'end', sort: (post) => (post.measured ? post.interactions : null), cell: (post) => <span className="u-tnum">{post.measured ? compact(post.interactions) : '—'}</span> },
    { key: 'rate', header: t('Rate', 'المعدل'), align: 'end', sort: (post) => post.engagementRate, cell: (post) => <span className="u-tnum">{pct(post.engagementRate, 1)}</span>, secondary: true },
  ];

  return (
    <Card>
      <CardHeader
        title={t('Posts', 'المنشورات')}
        count={num(found.length)}
        actions={<SearchInput value={search} onChange={setSearch} label={t('Search posts', 'ابحث في المنشورات')} placeholder={t('Caption or account…', 'نص المنشور أو اسم الحساب…')} />}
      />
      <DataTable
        caption={t('Posts', 'المنشورات')}
        rows={found}
        columns={columns}
        rowKey={(post) => post.key}
        pageSize={25}
        initialSort={{ key: 'date', dir: 'desc' }}
        dense
        empty={<EmptyState compact icon={<SearchX size={22} />} title={t('No post matches this search.', 'مفيش منشور مطابق للبحث.')} text={t('Try another word, or clear the search.', 'جرّب كلمة تانية، أو امسح البحث.')} />}
      />
    </Card>
  );
}
