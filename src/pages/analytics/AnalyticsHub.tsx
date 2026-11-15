import { useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Download, FileSpreadsheet, Printer, RefreshCw } from 'lucide-react';
import { useQueryState } from '../../app/router/router';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { SeriesChart, type SeriesDatum } from '../../components/charts/Series';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { EmptyState } from '../../components/feedback/States';
import { LiveGate } from '../../components/feedback/LiveGate';
import { FilterSelect } from '../../components/forms/Field';
import { Dialog } from '../../components/overlay/Overlay';
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
import type { Platform } from '../../types';
import { exportPostList, exportWorkbook, KPI_LABEL, type ExportPosts } from './export';
import { printDetailedReport } from './report';
import { buildReports, isRankBy, RANK_LABEL, RANK_PER_PLATFORM, type Reports } from './reports';
import { REPORT_VIEWS, ReportsSection, type ReportView } from './ReportsSection';
import { loadPictures, type PostPicture } from './thumbs';
import { useAnalytics, type AnalyticsModel, type Kpi } from './model';
import { PostsSection } from './PostsSection';

const PERIOD_VALUES = PERIODS.map((period) => String(period.value));

type ExportFormat = 'excel' | 'pdf';

/**
 * Analytics on one page: pick a period and a platform, read five numbers, see the activity,
 * compare platforms, read the reports (best and worst posts, content type, timing, interaction type)
 * and go through every post. The export carries all the reports, with the best and worst posts or every post.
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
  const rankBy = isRankBy(query.get('rank')) ? (query.get('rank') as Reports['rankBy']) : 'rate';
  const view = (REPORT_VIEWS as string[]).includes(query.get('report') ?? '') ? (query.get('report') as ReportView) : 'ranking';

  usePageMeta(t('Analytics', 'التحليلات'), [{ label: t('Analytics', 'التحليلات') }]);
  const model = useAnalytics({ period, platform, account });
  const reports = useMemo(() => buildReports(model.posts, model.todayNum, rankBy), [model.posts, model.todayNum, rankBy]);

  const setPlatform = (value: Platform | 'all') => setQuery({ platform: value === 'all' ? null : value, account: null });

  const pictures = useRef(new Map<string, PostPicture>());
  const [exporting, setExporting] = useState(false);
  const [preparing, setPreparing] = useState<{ done: number; total: number } | null>(null);

  /** Fetches the pictures not fetched yet, keeps them for the next export, then writes the file. */
  const exportWith = async (format: ExportFormat, posts: ExportPosts) => {
    const needed = exportPostList(model, reports, posts);
    const missing = needed.filter((post) => !pictures.current.has(post.key));
    setPreparing({ done: 0, total: 0 });
    try {
      const loaded = await loadPictures(missing, (done, total) => setPreparing({ done, total }));
      for (const [key, picture] of loaded) pictures.current.set(key, picture);
      const scoped = new Map(needed.flatMap((post) => (pictures.current.has(post.key) ? [[post.key, pictures.current.get(post.key)!] as const] : [])));
      if (format === 'excel') exportWorkbook(model, reports, i18n, posts, scoped);
      else printDetailedReport(model, reports, i18n, posts, scoped);
      setExporting(false);
    } finally {
      setPreparing(null);
    }
  };

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
        description={t('Published post performance, with reports on the best and worst posts, content types and timing.', 'أداء المنشورات على الحسابات المربوطة، مع تقارير لأفضل وأسوأ المنشورات وأنواع المحتوى والمواعيد.')}
        actions={
          <Button variant="primary" icon={<Download size={15} />} onClick={() => setExporting(true)} disabled={!model.posts.length}>
            {t('Export report', 'تصدير التقرير')}
          </Button>
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
            <ReportsSection reports={reports} view={view} onView={(next) => setQuery({ report: next === 'ranking' ? null : next })} onRankBy={(next) => setQuery({ rank: next === 'rate' ? null : next })} />
            <PostsSection posts={model.posts} />
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

      <ExportDialog open={exporting} onClose={() => preparing == null && setExporting(false)} model={model} reports={reports} preparing={preparing} onExport={(format, posts) => void exportWith(format, posts)} />
    </div>
  );
}

function ExportDialog({
  open,
  onClose,
  model,
  reports,
  preparing,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  model: AnalyticsModel;
  reports: Reports;
  preparing: { done: number; total: number } | null;
  onExport: (format: ExportFormat, posts: ExportPosts) => void;
}) {
  const { t, tx, num } = useI18n();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [posts, setPosts] = useState<ExportPosts>('ranked');
  const ranked = reports.rankings.reduce((sum, row) => sum + row.best.length + row.worst.length, 0);
  const busy = preparing != null;
  const choices: { value: ExportPosts; title: string; text: string }[] = [
    {
      value: 'ranked',
      title: t('Best & worst posts', 'أفضل وأسوأ المنشورات'),
      text: t(
        `Every report, plus the best and worst ${RANK_PER_PLATFORM} on each platform by ${tx(RANK_LABEL[reports.rankBy]).toLowerCase()} (${num(ranked)} posts) with their pictures.`,
        `كل التقارير، ومعاها أفضل وأسوأ ${RANK_PER_PLATFORM} على كل منصة حسب ${tx(RANK_LABEL[reports.rankBy])} (${num(ranked)} منشور) بصورهم.`,
      ),
    },
    {
      value: 'all',
      title: t('Every post', 'كل المنشورات'),
      text: t(`Every report, plus all ${num(model.posts.length)} posts in the period with their pictures and every number.`, `كل التقارير، ومعاها الـ${num(model.posts.length)} منشور كلهم بصورهم وكل أرقامهم.`),
    },
  ];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('Export report', 'تصدير التقرير')}
      description={t('Summary, platforms, activity, best and worst, content types, days and hours, interaction type and accounts.', 'الملخص، المنصات، النشاط، الأفضل والأسوأ، أنواع المحتوى، الأيام والساعات، نوع التفاعل والحسابات.')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('Cancel', 'إلغاء')}
          </Button>
          <Button variant="primary" icon={format === 'excel' ? <FileSpreadsheet size={15} /> : <Printer size={15} />} busy={busy} onClick={() => onExport(format, posts)}>
            {busy && preparing.total ? t(`Images ${num(preparing.done)}/${num(preparing.total)}`, `الصور ${num(preparing.done)}/${num(preparing.total)}`) : format === 'excel' ? t('Download Excel', 'تنزيل Excel') : t('Create PDF', 'اعمل PDF')}
          </Button>
        </>
      }
    >
      <div className="u-stack">
        <div className="an-export-row">
          <span className="an-export-label">{t('Format', 'الصيغة')}</span>
          <Segmented
            label={t('Format', 'الصيغة')}
            value={format}
            onChange={setFormat}
            items={[
              { value: 'pdf', label: 'PDF', icon: <Printer size={15} /> },
              { value: 'excel', label: 'Excel', icon: <FileSpreadsheet size={15} /> },
            ]}
          />
        </div>
        <fieldset className="an-choices">
          <legend className="an-export-label">{t('Posts in the file', 'المنشورات في الملف')}</legend>
          {choices.map((choice) => (
            <label key={choice.value} className="an-choice">
              <input type="radio" name="export-posts" value={choice.value} checked={posts === choice.value} onChange={() => setPosts(choice.value)} />
              <span>
                <b>{choice.title}</b>
                <small>{choice.text}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </Dialog>
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
