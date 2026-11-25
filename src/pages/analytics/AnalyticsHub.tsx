import { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FilterX, Printer, RefreshCw } from 'lucide-react';
import { useQueryState } from '../../app/router/router';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { SeriesChart, type SeriesDatum } from '../../components/charts/Series';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { EmptyState } from '../../components/feedback/States';
import { LiveGate } from '../../components/feedback/LiveGate';
import { FilterSelect } from '../../components/forms/Field';
import { Dialog } from '../../components/overlay/Overlay';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, Section } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Tabs';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { PERIODS, type Period } from '../../lib/analytics';
import { dateFromKey, dayKeyOf } from '../../lib/format';
import { PLATFORMS } from '../../lib/platforms';
import { YOUTUBE_ANALYTICS_PERIODS } from '../../domain/youtube-analytics';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import type { Platform } from '../../types';
import { exportPostList, exportWorkbook, type ExportPosts } from './export';
import { printDetailedReport } from './report';
import { buildReports, isRankBy, RANK_LABEL, RANK_PER_PLATFORM, typeLabel, type Reports } from './reports';
import { REPORT_VIEWS, ReportsSection, type ReportView } from './ReportsSection';
import { loadPictures, type PostPicture } from './thumbs';
import { useAnalytics, type AnalyticsModel } from './model';
import { PostsSection } from './PostsSection';
import { KpiTile } from './KpiTile';
import { AudienceSection } from './AudienceSection';
import { YouTubeChannelSection } from './YouTubeChannelSection';

type ExportFormat = 'excel' | 'pdf';

/**
 * Analytics on one page: pick a period and a platform, read five numbers, see the activity,
 * compare platforms, read the reports (best and worst posts, content type, timing, interaction type)
 * and go through every post. The export carries all the reports, with the best and worst posts or every post.
 */
export function AnalyticsHub() {
  const i18n = useI18n();
  const { t, tx, num, relative } = i18n;
  const [query, setQuery] = useQueryState();
  const { store, runSync } = useLiveData();
  const [syncing, setSyncing] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const platform = (PLATFORMS as string[]).includes(query.get('platform') ?? '') ? (query.get('platform') as Platform) : 'all';
  const youtube = platform === 'youtube';
  const youtubeWindow = query.get('youtubeWindow') === 'studio' ? 'studio' : 'complete';
  const periods = youtube ? YOUTUBE_ANALYTICS_PERIODS : PERIODS.map(item => item.value);
  const defaultPeriod = youtube ? 28 : 30;
  const period = (periods.find(value => value === Number(query.get('period'))) ?? defaultPeriod) as Period;
  const account = query.get('account') ?? 'all';
  const type = query.get('type') ?? 'all';
  const rankBy = isRankBy(query.get('rank')) ? (query.get('rank') as Reports['rankBy']) : 'rate';
  const view = (REPORT_VIEWS as string[]).includes(query.get('report') ?? '') ? (query.get('report') as ReportView) : 'ranking';

  usePageMeta(t('Analytics', 'التحليلات'), [{ label: t('Analytics', 'التحليلات') }]);
  const model = useAnalytics({ period, platform, account, type });
  const filtered = platform !== 'all' || account !== 'all' || type !== 'all';
  const trendLabels = useMemo(() => {
    const day = (dayNum: number) => i18n.date(dateFromKey(dayKeyOf(dayNum)).toMillis(), 'dayShort');
    return model.trend.map((point) =>
      model.kpiWindow ? i18n.t(`7 days to ${day(point.to)}`, `7 أيام لحد ${day(point.to)}`) : model.weekly ? `${day(point.from)} – ${day(point.to)}` : day(point.from),
    );
  }, [model.trend, model.weekly, model.kpiWindow, i18n]);
  const reports = useMemo(() => buildReports(model.posts, model.todayNum, rankBy), [model.posts, model.todayNum, rankBy]);

  const setPlatform = (value: Platform | 'all') => setQuery({ platform: value === 'all' ? null : value, account: null, type: null });

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
      setRefresh(value => value + 1);
    }
  };

  return (
    <div className="u-stack an">
      <PageHeader
        title={t('Analytics', 'التحليلات')}
        description={t('Published post performance, with reports on the best and worst posts, content types and timing.', 'أداء المنشورات على الحسابات المربوطة، مع تقارير لأفضل وأسوأ المنشورات وأنواع المحتوى والمواعيد.')}
        actions={
          <Button variant="primary" icon={<Download size={15} />} onClick={() => setExporting(true)} disabled={!model.posts.length}>
            {t('Export post report', 'تصدير تقرير المنشورات')}
          </Button>
        }
      />

      <div className="an-bar">
        <Segmented
          label={t('Period', 'الفترة')}
          value={String(period)}
          onChange={(value) => setQuery({ period: value === String(defaultPeriod) ? null : value })}
          items={periods.map((value) => ({ value: String(value), label: value === 365 ? t('1 year', 'سنة') : t(`${value} days`, `${value} يوم`) }))}
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
        {model.typeOptions.length > 1 && (
          <FilterSelect
            label={t('Content type', 'نوع المحتوى')}
            value={type}
            onChange={(value) => setQuery({ type: value === 'all' ? null : value })}
            allLabel={t('All types', 'كل الأنواع')}
            options={model.typeOptions.map((item) => ({ value: item, label: tx(typeLabel(item)) }))}
          />
        )}
        {filtered && (
          <Button size="sm" variant="ghost" icon={<FilterX size={14} />} onClick={() => setQuery({ platform: null, account: null, type: null })}>
            {t('Clear filters', 'امسح الفلاتر')}
          </Button>
        )}
        <span className="an-bar__spacer" />
        {model.lastCheck > 0 && <span className="an-bar__updated">{t(`Updated ${relative(model.lastCheck, model.now)}`, `اتحدّث ${relative(model.lastCheck, model.now)}`)}</span>}
        <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} busy={syncing} onClick={() => void sync()}>
          {t('Refresh', 'تحديث')}
        </Button>
      </div>

      {youtube && (
        <YouTubeChannelSection days={YOUTUBE_ANALYTICS_PERIODS.find(days => days === period) ?? 28} account={account} refresh={refresh}
          window={youtubeWindow} onWindowChange={value => setQuery({ youtubeWindow: value === 'studio' ? value : null })} />
      )}

      <LiveGate needs={store.data.posts.length ? undefined : 'posts'}>
        <Section title={t('Posts published in this period', 'المنشورات اللي نزلت خلال الفترة')}
          description={t('Views and interactions are the totals to date for those posts.', 'المشاهدات والتفاعلات هنا هي إجمالي الأرقام حتى الآن للمنشورات دي.')}>
          <div className="an-kpis">
            {model.kpis.map((kpi) => (
              <KpiTile key={kpi.key} kpi={kpi} labels={trendLabels} />
            ))}
          </div>
        </Section>

        {model.posts.length ? (
          <>
            <Activity model={model} />
            <PlatformTable model={model} onPick={setPlatform} />
            {!youtube && <AudienceSection audience={model.audience} />}
            <ReportsSection reports={reports} view={view} onView={(next) => setQuery({ report: next === 'ranking' ? null : next })} onRankBy={(next) => setQuery({ rank: next === 'rate' ? null : next })} />
            <PostsSection posts={model.posts} />
          </>
        ) : (
          <>
          <Card>
            <CardBody>
              <EmptyState
                compact
                title={filtered ? t('No post matches these filters.', 'مفيش منشور مطابق للفلاتر دي.') : t(`Nothing was published in the last ${num(period)} days.`, `مفيش منشورات في آخر ${num(period)} يوم.`)}
                text={filtered ? t('Try a longer period, or clear the filters.', 'جرّب فترة أطول، أو امسح الفلاتر.') : t('Try a longer period or another platform.', 'جرّب فترة أطول أو منصة تانية.')}
              />
            </CardBody>
          </Card>
          {!youtube && <AudienceSection audience={model.audience} />}
          </>
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
          replayKey={`${metric}-${model.scope.period}-${model.scope.platform}-${model.scope.account}-${model.scope.type}`}
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
