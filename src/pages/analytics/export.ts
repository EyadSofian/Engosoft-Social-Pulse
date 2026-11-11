import { download, workbook, type Sheet } from '../../lib/export/xlsx';
import { channelName } from '../../i18n/labels';
import type { I18n } from '../../i18n/I18nProvider';
import { dayKeyOf, inZone } from '../../lib/format';
import type { AnalyticsModel, KpiKey } from './model';

type Text = { en: string; ar: string };

/** Shared with the page, so a tile on screen and its row in the file carry the same name. */
export const KPI_LABEL: Record<KpiKey, Text> = {
  posts: { en: 'Posts', ar: 'المنشورات' },
  reach: { en: 'Reach', ar: 'الوصول' },
  views: { en: 'Views', ar: 'المشاهدات' },
  interactions: { en: 'Interactions', ar: 'التفاعلات' },
  rate: { en: 'Engagement rate', ar: 'معدل التفاعل' },
};

const round = (value: number | null | undefined, digits = 0) => (value == null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

/** "Facebook · Engosoft · 2026-10-13 → 2026-11-11", the same line on every sheet and the PDF. */
export function scopeLine(model: AnalyticsModel, i18n: I18n) {
  const { t } = i18n;
  const platform = model.scope.platform === 'all' ? t('All platforms', 'كل المنصات') : channelName[model.scope.platform];
  const account = model.scope.account === 'all' ? t('All accounts', 'كل الحسابات') : (model.accountOptions.find((option) => option.id === model.scope.account)?.name ?? model.scope.account);
  return `${platform} · ${account} · ${dayKeyOf(model.todayNum - model.scope.period + 1)} → ${dayKeyOf(model.todayNum)}`;
}

function summarySheet(model: AnalyticsModel, i18n: I18n): Sheet {
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

function platformsSheet(model: AnalyticsModel, i18n: I18n): Sheet {
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

function postsSheet(model: AnalyticsModel, i18n: I18n): Sheet {
  const { t } = i18n;
  return {
    name: t('Posts', 'المنشورات'),
    title: t('Every post in the period', 'كل منشورات الفترة'),
    subtitle: scopeLine(model, i18n),
    columns: [
      { header: t('Published', 'تاريخ النشر'), width: 18 },
      { header: t('Platform', 'المنصة'), width: 13 },
      { header: t('Account', 'الحساب'), width: 22 },
      { header: t('Post', 'المنشور'), width: 50 },
      { header: t('Reach', 'الوصول'), width: 12, format: 'int' },
      { header: t('Views', 'المشاهدات'), width: 12, format: 'int' },
      { header: t('Likes', 'إعجابات'), width: 11, format: 'int' },
      { header: t('Comments', 'تعليقات'), width: 11, format: 'int' },
      { header: t('Shares', 'مشاركات'), width: 11, format: 'int' },
      { header: t('Saves', 'حفظ'), width: 10, format: 'int' },
      { header: t('Interactions', 'التفاعلات'), width: 13, format: 'int' },
      { header: t('Engagement rate %', 'معدل التفاعل %'), width: 16, format: 'percent' },
      { header: t('Link', 'الرابط'), width: 44 },
    ],
    rows: model.posts.map((post) => [
      inZone(post.ts).toFormat('yyyy-LL-dd HH:mm'),
      channelName[post.platform],
      post.accountName,
      post.title,
      post.metrics.reach,
      post.metrics.views,
      post.metrics.likes,
      post.metrics.comments,
      post.metrics.shares,
      post.metrics.saves,
      post.measured ? post.interactions : null,
      round(post.engagementRate, 2),
      post.permalink,
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

const buildSheets = (model: AnalyticsModel, i18n: I18n): Sheet[] => [summarySheet(model, i18n), platformsSheet(model, i18n), postsSheet(model, i18n), activitySheet(model, i18n)];

const fileName = (model: AnalyticsModel, extension: string) =>
  `analytics-${model.scope.platform === 'all' ? 'all' : model.scope.platform}-${model.scope.period}d-${dayKeyOf(model.todayNum)}.${extension}`;

export function exportWorkbook(model: AnalyticsModel, i18n: I18n) {
  download(workbook(buildSheets(model, i18n)), fileName(model, 'xlsx'));
}

/* ── PDF ───────────────────────────────────────────────────────────── */

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string);

function tableHtml(sheet: Sheet, skip: number[] = []): string {
  const columns = sheet.columns.map((column, index) => ({ column, index })).filter(({ index }) => !skip.includes(index));
  const numeric = (format?: string) => format != null && format !== 'text' && format !== 'date';
  const cell = (value: string | number | null | undefined, format?: string) => {
    const text = value == null || value === '' ? '—' : typeof value === 'number' ? `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value)}${format === 'percent' ? '%' : ''}` : String(value);
    return `<td${numeric(format) ? ' class="n"' : ''}>${escapeHtml(text)}</td>`;
  };
  const head = columns.map(({ column }) => `<th${numeric(column.format) ? ' class="n"' : ''}>${escapeHtml(column.header)}</th>`).join('');
  const body = sheet.rows.map((row) => `<tr>${columns.map(({ column, index }) => cell(row[index], column.format)).join('')}</tr>`).join('');
  const notes = sheet.notes?.length ? `<ul class="notes">${sheet.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '';
  return `<section><h2>${escapeHtml(sheet.title ?? sheet.name)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${notes}</section>`;
}

/**
 * The browser prints the report, since it is the only engine here that shapes Arabic
 * correctly; "Save as PDF" in the print dialog writes the file. It prints from a hidden
 * frame so the page stays where it is.
 */
export function printReport(model: AnalyticsModel, i18n: I18n) {
  const { t, dir, lang } = i18n;
  const title = t('Analytics report', 'تقرير التحليلات');
  const posts = postsSheet(model, i18n);
  // The PDF is for reading: the caption is shortened and the link and per-reaction columns are left to Excel.
  const shortPosts: Sheet = { ...posts, rows: posts.rows.map((row) => row.map((value, index) => (index === 3 && typeof value === 'string' && value.length > 90 ? `${value.slice(0, 90)}…` : value))) };
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body { font-family: ${lang === 'ar' ? "'Almarai','IBM Plex Sans Arabic'," : ''}-apple-system, 'Segoe UI', system-ui, sans-serif; color: #0b1324; margin: 0; font-size: 10.5px; line-height: 1.5; }
    header { border-bottom: 2px solid #0046ff; padding-bottom: 8px; margin-bottom: 16px; }
    h1 { font-size: 19px; margin: 0 0 2px; }
    header p { margin: 0; color: #5a6480; font-size: 11px; }
    section { margin-bottom: 18px; }
    h2 { font-size: 13px; margin: 0 0 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e3e8f2; padding: 4px 6px; text-align: start; vertical-align: top; }
    th { background: #eef2ff; font-size: 9.5px; }
    td.n, th.n { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tbody tr { break-inside: avoid; }
    thead { display: table-header-group; }
    .notes { margin: 6px 0 0; padding-inline-start: 16px; color: #6b7280; font-size: 9px; }
  </style></head><body><header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(scopeLine(model, i18n))}</p></header>${[
    tableHtml(summarySheet(model, i18n)),
    tableHtml(platformsSheet(model, i18n)),
    tableHtml(shortPosts, [6, 7, 8, 9, 12]),
  ].join('')}</body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset:auto 0 0 auto;width:0;height:0;border:0;opacity:0';
  document.body.append(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Safari keeps painting the frame while the dialog is open, so it is removed after it closes.
    setTimeout(() => frame.remove(), 60_000);
  };
  if (doc.readyState === 'complete') setTimeout(run, 60);
  else frame.addEventListener('load', () => setTimeout(run, 60), { once: true });
}
