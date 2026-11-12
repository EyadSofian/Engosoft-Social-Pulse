import { download, workbook, type Sheet, type SheetImage } from '../../lib/export/xlsx';
import { channelName } from '../../i18n/labels';
import type { I18n } from '../../i18n/I18nProvider';
import { dayKeyOf, inZone } from '../../lib/format';
import { topPosts } from '../../lib/analytics';
import type { AnalyticsModel, KpiKey } from './model';
import type { PostPicture } from './thumbs';

type Text = { en: string; ar: string };

/** Shared with the page, so a tile on screen and its row in the file carry the same name. */
export const KPI_LABEL: Record<KpiKey, Text> = {
  posts: { en: 'Posts', ar: 'المنشورات' },
  reach: { en: 'Reach', ar: 'الوصول' },
  views: { en: 'Views', ar: 'المشاهدات' },
  interactions: { en: 'Interactions', ar: 'التفاعلات' },
  rate: { en: 'Engagement rate', ar: 'معدل التفاعل' },
};

export const round = (value: number | null | undefined, digits = 0) => (value == null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

export const REPORT_TOP_LIMIT = 5;
export const reportTopPosts = (model: AnalyticsModel) => topPosts(model.posts, REPORT_TOP_LIMIT);

export function reportNotes(model: AnalyticsModel, i18n: I18n): string[] {
  const { t, num, pct } = i18n;
  return [
    t(`Interaction metrics are available for ${num(model.summary.measured)} of ${num(model.summary.count)} posts (${pct(model.summary.coverage)}).`, `بيانات التفاعل متاحة لـ ${num(model.summary.measured)} من ${num(model.summary.count)} منشور (${pct(model.summary.coverage)}).`),
    t('Top posts are ranked by total interactions, newest first when tied. Posts without interaction data are excluded.', 'أفضل المنشورات مرتبة بإجمالي التفاعلات، والأحدث أولًا عند التعادل. المنشورات بدون بيانات تفاعل لا تدخل الترتيب.'),
    t('Reach is summed across posts; it does not represent unique people across the whole period.', 'الوصول مجموع وصول المنشورات؛ لا يمثل عدد أشخاص فريدين خلال الفترة كلها.'),
    t('The engagement rate is weighted by reach, falling back to views or impressions when reach is unavailable. Its change is in percentage points.', 'معدل التفاعل موزون بالوصول، أو المشاهدات ثم مرات الظهور عند غياب الوصول. تغييره بالنقاط المئوية.'),
    t('An empty cell or a dash means the platform did not return that number.', 'الخلية الفاضية أو الشرطة معناها إن المنصة ما رجعتش الرقم ده.'),
  ];
}

/** "Facebook · Engosoft · 2026-10-13 → 2026-11-11", the same line on every sheet and the PDF. */
export function scopeLine(model: AnalyticsModel, i18n: I18n) {
  const { t } = i18n;
  const platform = model.scope.platform === 'all' ? t('All platforms', 'كل المنصات') : channelName[model.scope.platform];
  const account = model.scope.account === 'all' ? t('All accounts', 'كل الحسابات') : (model.accountOptions.find((option) => option.id === model.scope.account)?.name ?? model.scope.account);
  return `${platform} · ${account} · ${dayKeyOf(model.todayNum - model.scope.period + 1)} → ${dayKeyOf(model.todayNum)}`;
}

export function summarySheet(model: AnalyticsModel, i18n: I18n): Sheet {
  const { t, tx } = i18n;
  return {
    name: t('Summary', 'الملخص'),
    title: t('Analytics summary', 'ملخص التحليلات'),
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: t('Metric', 'المؤشر'), width: 24 },
      { header: t('This period', 'الفترة دي'), width: 16, format: 'decimal' },
      { header: t('Previous period', 'الفترة اللي قبلها'), width: 18, format: 'decimal' },
      { header: t('Change %', 'التغيير %'), width: 14, format: 'decimal' },
    ],
    rows: model.kpis.map((kpi) => {
      const digits = kpi.key === 'rate' ? 2 : 0;
      return [kpi.key === 'rate' ? `${tx(KPI_LABEL.rate)} %` : tx(KPI_LABEL[kpi.key]), round(kpi.value, digits), round(kpi.previous, digits), round(kpi.change, 1)];
    }),
    notes: reportNotes(model, i18n),
  };
}

export function platformsSheet(model: AnalyticsModel, i18n: I18n): Sheet {
  const { t } = i18n;
  return {
    name: t('Platforms', 'المنصات'),
    title: t('By platform', 'حسب المنصة'),
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: t('Platform', 'المنصة'), width: 18 },
      { header: t('Posts', 'المنشورات'), width: 12, format: 'int' },
      { header: t('Reach', 'الوصول'), width: 14, format: 'int' },
      { header: t('Views', 'المشاهدات'), width: 14, format: 'int' },
      { header: t('Interactions', 'التفاعلات'), width: 14, format: 'int' },
      { header: t('Interactions per post', 'تفاعل لكل منشور'), width: 18, format: 'decimal' },
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 16, format: 'percent' },
    ],
    rows: model.platforms.map((row) => [
      channelName[row.platform],
      row.count,
      row.reachCount ? row.reach : null,
      row.viewsCount ? row.views : null,
      row.measured ? row.interactions : null,
      round(row.average, 1),
      round(row.rate, 2),
    ]),
  };
}

const IMAGE_COLUMN = 0;

function topPostsSheet(model: AnalyticsModel, i18n: I18n, pictures?: Map<string, PostPicture>): Sheet {
  const { t } = i18n;
  const posts = reportTopPosts(model);
  const withImages = pictures != null;
  const images: SheetImage[] = [];
  if (pictures)
    posts.forEach((post, row) => {
      const picture = pictures.get(post.key);
      if (picture) images.push({ row, column: IMAGE_COLUMN, ...picture.small });
    });
  const lead = withImages ? [{ header: t('Image', 'الصورة'), width: 16 }] : [];
  return {
    name: t('Top posts', 'أفضل المنشورات'),
    title: t(`Top ${REPORT_TOP_LIMIT} posts by interactions`, `أفضل ${REPORT_TOP_LIMIT} منشورات حسب التفاعلات`),
    subtitle: scopeLine(model, i18n),
    columns: [
      ...lead,
      { header: t('Rank', 'الترتيب'), width: 10, format: 'int' },
      { header: t('Published', 'تاريخ النشر'), width: 18 },
      { header: t('Platform', 'المنصة'), width: 13 },
      { header: t('Account', 'الحساب'), width: 22 },
      { header: t('Post', 'المنشور'), width: 50 },
      { header: t('Reach', 'الوصول'), width: 14, format: 'int' },
      { header: t('Views', 'المشاهدات'), width: 14, format: 'int' },
      { header: t('Interactions', 'التفاعلات'), width: 13, format: 'int' },
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 16, format: 'percent' },
      { header: t('Link', 'الرابط'), width: 44 },
    ],
    rows: posts.map((post, index) => [
      ...(withImages ? [pictures?.has(post.key) ? null : t('No image', 'مفيش صورة')] : []),
      index + 1,
      inZone(post.ts).toFormat('yyyy-LL-dd HH:mm'),
      channelName[post.platform],
      post.accountName,
      post.title.length > 160 ? `${post.title.slice(0, 160)}…` : post.title,
      post.metrics.reach,
      post.metrics.views,
      post.measured ? post.interactions : null,
      round(post.engagementRate, 2),
      post.permalink,
    ]),
    rowHeight: withImages ? 84 : undefined,
    images: withImages ? images : undefined,
    notes: posts.length ? [reportNotes(model, i18n)[1]] : [t('No interaction data is available to rank posts in this period.', 'مفيش بيانات تفاعل متاحة لترتيب المنشورات في الفترة دي.')],
  };
}

function activitySheet(model: AnalyticsModel, i18n: I18n): Sheet {
  const { t } = i18n;
  return {
    name: model.weekly ? t('By week', 'حسب الأسبوع') : t('By day', 'حسب اليوم'),
    title: model.weekly ? t('Posts and interactions per week', 'المنشورات والتفاعلات كل أسبوع') : t('Posts and interactions per day', 'المنشورات والتفاعلات كل يوم'),
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: model.weekly ? t('Week starting', 'بداية الأسبوع') : t('Day', 'اليوم'), width: 16 },
      { header: t('Posts', 'المنشورات'), width: 12, format: 'int' },
      { header: t('Interactions', 'التفاعلات'), width: 14, format: 'int' },
    ],
    rows: model.trend.map((point) => [dayKeyOf(point.from), point.posts, point.measured ? point.interactions : null]),
  };
}

export const buildSheets = (model: AnalyticsModel, i18n: I18n, pictures?: Map<string, PostPicture>): Sheet[] => [summarySheet(model, i18n), platformsSheet(model, i18n), activitySheet(model, i18n), topPostsSheet(model, i18n, pictures)];

const fileName = (model: AnalyticsModel, extension: string) =>
  `analytics-${model.scope.platform === 'all' ? 'all' : model.scope.platform}-${model.scope.period}d-${dayKeyOf(model.todayNum)}.${extension}`;

/** Period-wide analysis, with pictures and a brief summary for only the top posts. */
export function exportWorkbook(model: AnalyticsModel, i18n: I18n, pictures?: Map<string, PostPicture>) {
  download(workbook(buildSheets(model, i18n, pictures)), fileName(model, 'xlsx'));
}
