import { download, workbook, type Sheet, type SheetImage } from '../../lib/export/xlsx';
import { channelName } from '../../i18n/labels';
import type { I18n } from '../../i18n/I18nProvider';
import { dayKeyOf, inZone } from '../../lib/format';
import type { Metrics } from '../../types';
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
    notes: [
      t('The engagement rate is interactions ÷ reach. Its change is in percentage points.', 'معدل التفاعل = التفاعلات ÷ الوصول، وتغييره بالنقاط المئوية.'),
      t('An empty cell means the platform did not return that number.', 'الخلية الفاضية معناها إن المنصة ما رجعتش الرقم ده.'),
    ],
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
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 16, format: 'percent' },
    ],
    rows: model.platforms.map((row) => [
      channelName[row.platform],
      row.count,
      row.reachCount ? row.reach : null,
      row.viewsCount ? row.views : null,
      row.measured ? row.interactions : null,
      round(row.rate, 2),
    ]),
  };
}

const CONTENT_TYPE: Record<string, Text> = {
  reel: { en: 'Reel', ar: 'ريل' },
  reels: { en: 'Reel', ar: 'ريل' },
  video: { en: 'Video', ar: 'فيديو' },
  short: { en: 'Short', ar: 'شورت' },
  image: { en: 'Image', ar: 'صورة' },
  photo: { en: 'Image', ar: 'صورة' },
  carousel: { en: 'Carousel', ar: 'كاروسيل' },
  album: { en: 'Carousel', ar: 'كاروسيل' },
  carousel_album: { en: 'Carousel', ar: 'كاروسيل' },
  story: { en: 'Story', ar: 'ستوري' },
  text: { en: 'Text', ar: 'نص' },
  status: { en: 'Text', ar: 'نص' },
  link: { en: 'Link', ar: 'رابط' },
  article: { en: 'Article', ar: 'مقال' },
  post: { en: 'Post', ar: 'منشور' },
};

export const contentTypeLabel = (value: string, i18n: I18n) => {
  const key = value.trim().toLowerCase();
  return CONTENT_TYPE[key] ? i18n.tx(CONTENT_TYPE[key]) : value;
};

/** Every number a platform can return for one post, in the order the report shows them. */
export const POST_METRICS: { key: keyof Metrics; label: Text }[] = [
  { key: 'reach', label: { en: 'Reach', ar: 'الوصول' } },
  { key: 'views', label: { en: 'Views', ar: 'المشاهدات' } },
  { key: 'impressions', label: { en: 'Impressions', ar: 'مرات الظهور' } },
  { key: 'likes', label: { en: 'Likes', ar: 'إعجابات' } },
  { key: 'comments', label: { en: 'Comments', ar: 'تعليقات' } },
  { key: 'shares', label: { en: 'Shares', ar: 'مشاركات' } },
  { key: 'saves', label: { en: 'Saves', ar: 'حفظ' } },
  { key: 'clicks', label: { en: 'Clicks', ar: 'نقرات' } },
];

const IMAGE_COLUMN = 0;

function postsSheet(model: AnalyticsModel, i18n: I18n, pictures?: Map<string, PostPicture>): Sheet {
  const { t, tx } = i18n;
  const withImages = pictures != null;
  const images: SheetImage[] = [];
  if (pictures)
    model.posts.forEach((post, row) => {
      const picture = pictures.get(post.key);
      if (picture) images.push({ row, column: IMAGE_COLUMN, ...picture.small });
    });
  const lead = withImages ? [{ header: t('Image', 'الصورة'), width: 16 }] : [];
  return {
    name: t('Posts', 'المنشورات'),
    title: t('Every post in the period', 'كل منشورات الفترة'),
    subtitle: scopeLine(model, i18n),
    columns: [
      ...lead,
      { header: t('Published', 'تاريخ النشر'), width: 18 },
      { header: t('Platform', 'المنصة'), width: 13 },
      { header: t('Account', 'الحساب'), width: 22 },
      { header: t('Type', 'النوع'), width: 11 },
      { header: t('Post', 'المنشور'), width: 50 },
      ...POST_METRICS.map((metric) => ({ header: tx(metric.label), width: 12, format: 'int' as const })),
      { header: t('Interactions', 'التفاعلات'), width: 13, format: 'int' },
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 16, format: 'percent' },
      { header: t('Link', 'الرابط'), width: 44 },
    ],
    rows: model.posts.map((post) => [
      ...(withImages ? [pictures?.has(post.key) ? null : t('No image', 'مفيش صورة')] : []),
      inZone(post.ts).toFormat('yyyy-LL-dd HH:mm'),
      channelName[post.platform],
      post.accountName,
      contentTypeLabel(post.contentType, i18n),
      post.title,
      ...POST_METRICS.map((metric) => post.metrics[metric.key]),
      post.measured ? post.interactions : null,
      round(post.engagementRate, 2),
      post.permalink,
    ]),
    rowHeight: withImages ? 84 : undefined,
    images: withImages ? images : undefined,
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

const buildSheets = (model: AnalyticsModel, i18n: I18n, pictures?: Map<string, PostPicture>): Sheet[] => [summarySheet(model, i18n), platformsSheet(model, i18n), postsSheet(model, i18n, pictures), activitySheet(model, i18n)];

const fileName = (model: AnalyticsModel, extension: string) =>
  `analytics-${model.scope.platform === 'all' ? 'all' : model.scope.platform}-${model.scope.period}d-${dayKeyOf(model.todayNum)}.${extension}`;

/** With pictures, the posts sheet starts with each post's image in its row. */
export function exportWorkbook(model: AnalyticsModel, i18n: I18n, pictures?: Map<string, PostPicture>) {
  download(workbook(buildSheets(model, i18n, pictures)), fileName(model, 'xlsx'));
}
