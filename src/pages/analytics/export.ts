import { download, workbook, type Sheet, type SheetImage } from '../../lib/export/xlsx';
import type { Text } from '../../domain/shared';
import { channelName } from '../../i18n/labels';
import type { I18n } from '../../i18n/I18nProvider';
import { dayKeyOf, inZone } from '../../lib/format';
import type { Post } from '../../types';
import type { AnalyticsModel, KpiKey } from './model';
import {
  contentTypeOf,
  hourBlockLabel,
  median,
  MIX_KEYS,
  MIX_LABEL,
  postRate,
  RANK_LABEL,
  RANK_PER_PLATFORM,
  typeLabel,
  WEEKDAY_LABEL,
  type Ranked,
  type Reports,
  type TimeRow,
} from './reports';
import type { PostPicture } from './thumbs';
import { basisLabel, DEMOGRAPHIC_KEYS, DEMOGRAPHIC_LABEL, shares, sliceLabel } from './audience';

/** Shared with the page, so a tile on screen and its row in the file carry the same name. */
export const KPI_LABEL: Record<KpiKey, Text> = {
  posts: { en: 'Posts', ar: 'المنشورات' },
  reach: { en: 'Reach', ar: 'الوصول' },
  views: { en: 'Views', ar: 'المشاهدات' },
  interactions: { en: 'Interactions', ar: 'التفاعلات' },
  rate: { en: 'Engagement rate', ar: 'معدل التفاعل' },
};

/** What the export carries besides the period-wide reports: the best and worst posts only, or every post too. */
export type ExportPosts = 'ranked' | 'all';

export const round = (value: number | null | undefined, digits = 0) => (value == null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

export function reportNotes(model: AnalyticsModel, reports: Reports, i18n: I18n): string[] {
  const { t, tx, num, pct } = i18n;
  const by = tx(RANK_LABEL[reports.rankBy]);
  return [
    t(`Interaction metrics are available for ${num(model.summary.measured)} of ${num(model.summary.count)} posts (${pct(model.summary.coverage)}).`, `بيانات التفاعل متاحة لـ ${num(model.summary.measured)} من ${num(model.summary.count)} منشور (${pct(model.summary.coverage)}).`),
    t(
      `Best and worst posts are ranked by ${by.toLowerCase()} within each platform. Posts from the last 2 days are left out while their numbers settle${reports.rankBy === 'rate' ? ', and so are posts seen by fewer than a quarter of the platform’s typical post' : ''}.`,
      `أفضل وأسوأ المنشورات مترتبة حسب ${by} جوه كل منصة لوحدها. منشورات آخر يومين مش داخلة لأن أرقامها لسه بتزيد${reports.rankBy === 'rate' ? '، ولا المنشورات اللي وصلت لأقل من ربع المنشور المعتاد على المنصة' : ''}.`,
    ),
    t('"× typical" compares a post with the middle post of its platform in this period.', '"× المعتاد" بيقارن المنشور بالمنشور اللي في النص على نفس المنصة في الفترة دي.'),
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

export const shortCaption = (post: Post, limit = 160) => (post.title.length > limit ? `${post.title.slice(0, limit)}…` : post.title);

export function summarySheet(model: AnalyticsModel, reports: Reports, i18n: I18n): Sheet {
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
    notes: reportNotes(model, reports, i18n),
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

const IMAGE_COLUMN = 0;

function imagesFor(posts: Post[], pictures?: Map<string, PostPicture>): SheetImage[] {
  const images: SheetImage[] = [];
  posts.forEach((post, row) => {
    const picture = pictures?.get(post.key);
    if (picture) images.push({ row, column: IMAGE_COLUMN, ...picture.small });
  });
  return images;
}

export interface RankingEntry {
  list: 'best' | 'worst';
  rank: number;
  entry: Ranked;
}

export const rankingEntries = (reports: Reports): RankingEntry[] =>
  reports.rankings.flatMap((row) => [
    ...row.best.map((entry, index) => ({ list: 'best' as const, rank: index + 1, entry })),
    ...row.worst.map((entry, index) => ({ list: 'worst' as const, rank: index + 1, entry })),
  ]);

/** Best then worst for each platform, with the post's picture in the first column. */
export function rankingSheet(model: AnalyticsModel, reports: Reports, i18n: I18n, pictures?: Map<string, PostPicture>): Sheet {
  const { t, tx } = i18n;
  const withImages = pictures != null;
  const entries = rankingEntries(reports);
  const by = tx(RANK_LABEL[reports.rankBy]);
  const notes = reportNotes(model, reports, i18n);
  return {
    name: t('Best & worst', 'الأفضل والأسوأ'),
    title: t(`Best and worst ${RANK_PER_PLATFORM} posts on each platform, by ${by.toLowerCase()}`, `أفضل وأسوأ ${RANK_PER_PLATFORM} منشورات على كل منصة حسب ${by}`),
    subtitle: scopeLine(model, i18n),
    columns: [
      ...(withImages ? [{ header: t('Image', 'الصورة'), width: 16 }] : []),
      { header: t('Platform', 'المنصة'), width: 13 },
      { header: t('List', 'القائمة'), width: 10 },
      { header: t('Rank', 'الترتيب'), width: 8, format: 'int' as const },
      { header: t('Published', 'تاريخ النشر'), width: 17 },
      { header: t('Account', 'الحساب'), width: 20 },
      { header: t('Type', 'النوع'), width: 11 },
      { header: t('Post', 'المنشور'), width: 46 },
      { header: t('Reach', 'الوصول'), width: 12, format: 'int' as const },
      { header: t('Views', 'المشاهدات'), width: 12, format: 'int' as const },
      { header: t('Interactions', 'التفاعلات'), width: 12, format: 'int' as const },
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 15, format: 'percent' as const },
      { header: t('× typical', '× المعتاد'), width: 11, format: 'decimal' as const },
      { header: t('Link', 'الرابط'), width: 40 },
    ],
    rows: entries.map(({ list, rank, entry }) => [
      ...(withImages ? [pictures?.has(entry.post.key) ? null : t('No image', 'مفيش صورة')] : []),
      channelName[entry.post.platform],
      list === 'best' ? t('Best', 'الأفضل') : t('Worst', 'الأسوأ'),
      rank,
      inZone(entry.post.ts).toFormat('yyyy-LL-dd HH:mm'),
      entry.post.accountName,
      tx(typeLabel(contentTypeOf(entry.post))),
      shortCaption(entry.post),
      entry.post.metrics.reach,
      entry.post.metrics.views,
      entry.post.measured ? entry.post.interactions : null,
      round(postRate(entry.post), 2),
      round(entry.vsMedian, 1),
      entry.post.permalink,
    ]),
    rowHeight: withImages ? 84 : undefined,
    images: withImages ? imagesFor(entries.map(({ entry }) => entry.post), pictures) : undefined,
    notes: entries.length ? [notes[1], notes[2]] : [t('No post in this period has the numbers needed to rank it yet.', 'مفيش منشور في الفترة دي عنده الأرقام اللازمة لترتيبه لسه.')],
  };
}

function typesSheet(model: AnalyticsModel, reports: Reports, i18n: I18n): Sheet {
  const { t, tx } = i18n;
  return {
    name: t('Content types', 'أنواع المحتوى'),
    title: t('Results by content type', 'النتائج حسب نوع المحتوى'),
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: t('Platform', 'المنصة'), width: 14 },
      { header: t('Type', 'النوع'), width: 14 },
      { header: t('Posts', 'المنشورات'), width: 11, format: 'int' },
      { header: t('Reach', 'الوصول'), width: 13, format: 'int' },
      { header: t('Interactions', 'التفاعلات'), width: 13, format: 'int' },
      { header: t('Interactions per post', 'تفاعل لكل منشور'), width: 18, format: 'decimal' },
      { header: t('Typical post (median)', 'المنشور المعتاد (الوسيط)'), width: 20, format: 'decimal' },
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 16, format: 'percent' },
    ],
    rows: reports.types.map((row) => [
      channelName[row.platform],
      tx(typeLabel(row.type)),
      row.count,
      row.reachCount ? row.reach : null,
      row.measured ? row.interactions : null,
      round(row.average, 1),
      round(row.medianInteractions, 1),
      round(row.rate, 2),
    ]),
  };
}

function timeSheet(name: string, title: string, firstHeader: string, rows: TimeRow[], label: (row: TimeRow) => string, model: AnalyticsModel, i18n: I18n): Sheet {
  const { t } = i18n;
  return {
    name,
    title,
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: firstHeader, width: 16 },
      { header: t('Posts', 'المنشورات'), width: 11, format: 'int' },
      { header: t('Interactions', 'التفاعلات'), width: 13, format: 'int' },
      { header: t('Interactions per post', 'تفاعل لكل منشور'), width: 18, format: 'decimal' },
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 16, format: 'percent' },
      { header: t('Best', 'الأفضل'), width: 9 },
    ],
    rows: rows.map((row) => [label(row), row.count, row.measured ? row.interactions : null, round(row.average, 1), round(row.rate, 2), row.best ? '★' : '']),
    notes: [t('Best = the most interactions per post, among rows with at least 2 measured posts. Times are in the business timezone.', 'الأفضل = أعلى تفاعل لكل منشور، من الصفوف اللي فيها منشورين على الأقل بأرقام. المواعيد بتوقيت الشركة.')],
  };
}

function mixSheet(model: AnalyticsModel, reports: Reports, i18n: I18n): Sheet {
  const { t, tx } = i18n;
  return {
    name: t('Interaction mix', 'نوع التفاعل'),
    title: t('What people did on each platform', 'الناس عملت إيه على كل منصة'),
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: t('Platform', 'المنصة'), width: 14 },
      { header: t('Posts', 'المنشورات'), width: 10, format: 'int' },
      ...MIX_KEYS.flatMap((key) => [
        { header: tx(MIX_LABEL[key]), width: 11, format: 'int' as const },
        { header: t(`${MIX_LABEL[key].en} per 100 reached`, `${MIX_LABEL[key].ar} لكل 100 وصول`), width: 15, format: 'decimal' as const },
      ]),
    ],
    rows: reports.mix.map((row) => [channelName[row.platform], row.posts, ...MIX_KEYS.flatMap((key) => [row.cells[key].total, round(row.cells[key].rate, 2)])]),
  };
}

function accountsSheet(model: AnalyticsModel, reports: Reports, i18n: I18n): Sheet {
  const { t } = i18n;
  return {
    name: t('Accounts', 'الحسابات'),
    title: t('By account', 'حسب الحساب'),
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: t('Account', 'الحساب'), width: 24 },
      { header: t('Platform', 'المنصة'), width: 13 },
      { header: t('Posts', 'المنشورات'), width: 11, format: 'int' },
      { header: t('Reach', 'الوصول'), width: 13, format: 'int' },
      { header: t('Interactions', 'التفاعلات'), width: 13, format: 'int' },
      { header: t('Interactions per post', 'تفاعل لكل منشور'), width: 18, format: 'decimal' },
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 16, format: 'percent' },
    ],
    rows: reports.accounts.map((row) => [row.name, channelName[row.platform], row.count, row.reachCount ? row.reach : null, row.measured ? row.interactions : null, round(row.average, 1), round(row.rate, 2)]),
  };
}

function audienceSheet(model: AnalyticsModel, i18n: I18n): Sheet {
  const { t } = i18n;
  return {
    name: t('Audience', 'الجمهور'),
    title: t('Followers on each account', 'المتابعين على كل حساب'),
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: t('Platform', 'المنصة'), width: 14 },
      { header: t('Account', 'الحساب'), width: 24 },
      { header: t('Followers', 'المتابعين'), width: 14, format: 'int' },
      { header: t('Change', 'التغيير'), width: 12, format: 'int' },
      { header: t('Since', 'من يوم'), width: 13 },
      { header: t('Counted on', 'اتعدّ يوم'), width: 13 },
    ],
    rows: model.audience.flatMap((row) => row.accounts.map((account) => [channelName[account.platform], account.accountName, account.followers, account.change, account.since ?? '', account.date ?? ''])),
    notes: [t('Followers are read once a day with the sync; the change compares with the count at the start of the period, or the first day counted.', 'المتابعين بيتقروا مرة في اليوم مع المزامنة؛ التغيير مقارنة بعددهم في أول الفترة، أو بأول يوم اتعدّوا فيه.')],
  };
}

function demographicsSheet(model: AnalyticsModel, i18n: I18n): Sheet {
  const { t, tx, lang } = i18n;
  const rows = model.audience.flatMap((row) =>
    row.accounts.flatMap((account) =>
      account.demographics
        ? DEMOGRAPHIC_KEYS.flatMap((key) =>
            shares(account.demographics![key], key, 50).map((slice) => [channelName[account.platform], account.accountName, tx(basisLabel(account.demographics!)), tx(DEMOGRAPHIC_LABEL[key]), sliceLabel(key, slice.key, lang), round(slice.value, 1)]),
          )
        : [],
    ),
  );
  return {
    name: t('Demographics', 'تركيبة الجمهور'),
    title: t('Who the audience is', 'الجمهور مين'),
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: t('Platform', 'المنصة'), width: 14 },
      { header: t('Account', 'الحساب'), width: 22 },
      { header: t('Who', 'مين'), width: 22 },
      { header: t('Breakdown', 'التقسيم'), width: 14 },
      { header: t('Group', 'الفئة'), width: 22 },
      { header: t('Share %', 'النسبة %'), width: 11, format: 'percent' },
    ],
    rows,
  };
}

/** Interactions on each platform's middle post, so every post can be read against it. */
export function typicalByPlatform(posts: Post[]): Map<string, number | null> {
  const typical = new Map<string, number | null>();
  for (const platform of new Set(posts.map((post) => post.platform)))
    typical.set(platform, median(posts.filter((post) => post.platform === platform && post.measured).map((post) => post.interactions)));
  return typical;
}

/** Every post in the period, newest first, with every number the platform gave. */
export function postsSheet(model: AnalyticsModel, i18n: I18n, pictures?: Map<string, PostPicture>): Sheet {
  const { t, tx } = i18n;
  const withImages = pictures != null;
  const typical = typicalByPlatform(model.posts);
  return {
    name: t('All posts', 'كل المنشورات'),
    title: t('Every post in the period', 'كل منشورات الفترة'),
    subtitle: scopeLine(model, i18n),
    columns: [
      ...(withImages ? [{ header: t('Image', 'الصورة'), width: 16 }] : []),
      { header: t('Published', 'تاريخ النشر'), width: 17 },
      { header: t('Platform', 'المنصة'), width: 13 },
      { header: t('Account', 'الحساب'), width: 20 },
      { header: t('Type', 'النوع'), width: 11 },
      { header: t('Post', 'المنشور'), width: 46 },
      { header: t('Reach', 'الوصول'), width: 12, format: 'int' as const },
      { header: t('Views', 'المشاهدات'), width: 12, format: 'int' as const },
      { header: t('Impressions', 'مرات الظهور'), width: 12, format: 'int' as const },
      ...MIX_KEYS.map((key) => ({ header: tx(MIX_LABEL[key]), width: 10, format: 'int' as const })),
      { header: t('Interactions', 'التفاعلات'), width: 12, format: 'int' as const },
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 15, format: 'percent' as const },
      { header: t('Interactions × typical', 'التفاعل × المعتاد'), width: 15, format: 'decimal' as const },
      { header: t('Link', 'الرابط'), width: 40 },
    ],
    rows: model.posts.map((post) => {
      const middle = typical.get(post.platform);
      return [
        ...(withImages ? [pictures?.has(post.key) ? null : t('No image', 'مفيش صورة')] : []),
        inZone(post.ts).toFormat('yyyy-LL-dd HH:mm'),
        channelName[post.platform],
        post.accountName,
        tx(typeLabel(contentTypeOf(post))),
        shortCaption(post),
        post.metrics.reach,
        post.metrics.views,
        post.metrics.impressions,
        ...MIX_KEYS.map((key) => post.metrics[key]),
        post.measured ? post.interactions : null,
        round(postRate(post), 2),
        post.measured && middle ? round(post.interactions / middle, 1) : null,
        post.permalink,
      ];
    }),
    rowHeight: withImages ? 84 : undefined,
    images: withImages ? imagesFor(model.posts, pictures) : undefined,
  };
}

export function buildSheets(model: AnalyticsModel, reports: Reports, i18n: I18n, posts: ExportPosts, pictures?: Map<string, PostPicture>): Sheet[] {
  const { t, tx } = i18n;
  return [
    summarySheet(model, reports, i18n),
    platformsSheet(model, i18n),
    activitySheet(model, i18n),
    rankingSheet(model, reports, i18n, pictures),
    typesSheet(model, reports, i18n),
    timeSheet(t('Days', 'الأيام'), t('Results by day of the week', 'النتائج حسب يوم الأسبوع'), t('Day', 'اليوم'), reports.weekdays, (row) => tx(WEEKDAY_LABEL[row.key]), model, i18n),
    timeSheet(t('Hours', 'الساعات'), t('Results by time of day', 'النتائج حسب وقت النشر'), t('Time', 'الوقت'), reports.hours, (row) => hourBlockLabel(row.key), model, i18n),
    mixSheet(model, reports, i18n),
    ...(reports.accounts.length ? [accountsSheet(model, reports, i18n)] : []),
    ...(model.audience.length ? [audienceSheet(model, i18n)] : []),
    ...(model.audience.some((row) => row.accounts.some((account) => account.demographics)) ? [demographicsSheet(model, i18n)] : []),
    ...(posts === 'all' ? [postsSheet(model, i18n, pictures)] : []),
  ];
}

/** The posts whose pictures an export needs: the ranked ones, plus every post when asked. */
export function exportPostList(model: AnalyticsModel, reports: Reports, posts: ExportPosts): Post[] {
  const ranked = rankingEntries(reports).map(({ entry }) => entry.post);
  const seen = new Set<string>();
  return (posts === 'all' ? [...ranked, ...model.posts] : ranked).filter((post) => !seen.has(post.key) && seen.add(post.key));
}

const fileName = (model: AnalyticsModel, posts: ExportPosts, extension: string) =>
  `analytics-${model.scope.platform === 'all' ? 'all' : model.scope.platform}-${model.scope.period}d-${posts === 'all' ? 'all-posts' : 'best-worst'}-${dayKeyOf(model.todayNum)}.${extension}`;

export function exportWorkbook(model: AnalyticsModel, reports: Reports, i18n: I18n, posts: ExportPosts, pictures?: Map<string, PostPicture>) {
  download(workbook(buildSheets(model, reports, i18n, posts, pictures)), fileName(model, posts, 'xlsx'));
}
