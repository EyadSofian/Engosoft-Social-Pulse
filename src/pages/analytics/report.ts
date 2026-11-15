import type { I18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { dateFromKey, dayKeyOf } from '../../lib/format';
import type { TrendPoint } from '../../lib/analytics';
import type { Platform, Post } from '../../types';
import { KPI_LABEL, reportNotes, scopeLine, shortCaption, type ExportPosts } from './export';
import type { AnalyticsModel, Kpi } from './model';
import { contentTypeOf, hourBlockLabel, MIX_KEYS, MIX_LABEL, postRate, RANK_LABEL, RANK_PER_PLATFORM, typeLabel, WEEKDAY_LABEL, type Ranked, type Reports, type TimeRow } from './reports';
import type { PostPicture } from './thumbs';
import { basisLabel, DEMOGRAPHIC_KEYS, DEMOGRAPHIC_LABEL, shares, sliceLabel } from './audience';

/**
 * Period-wide analysis (headline numbers, activity, platforms), the best and worst posts on
 * each platform, the content-type, timing and interaction reports, and every post when asked. The browser
 * prints it, because it is the only engine here that shapes Arabic correctly; "Save as PDF"
 * in the print dialog writes the file.
 */

const COLOR: Record<Platform, string> = {
  facebook: '#1877f2',
  instagram: '#c1357b',
  tiktok: '#111111',
  snapchat: '#c9a800',
  youtube: '#ff0033',
  linkedin: '#0a66c2',
  website: '#0046ff',
};

const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

/** Only links that open a page; anything else is shown as text. */
const safeHref = (value: string) => (/^https?:\/\//i.test(value) ? value : '');

const CAPTION_LIMIT = 160;

function kpiTile(kpi: Kpi, i18n: I18n) {
  const { t, tx, num, compact, pct } = i18n;
  const value = kpi.value == null ? '—' : kpi.key === 'rate' ? pct(kpi.value, 2) : kpi.key === 'posts' ? num(kpi.value) : compact(kpi.value);
  let change = `<span class="kpi__ch">${esc(t('No earlier period', 'مفيش فترة قبلها'))}</span>`;
  if (kpi.value == null) change = `<span class="kpi__ch">${esc(t('Not reported', 'المنصة مش بترجعه'))}</span>`;
  else if (kpi.change != null) {
    const up = kpi.change > 0;
    const flat = kpi.change === 0;
    const amount = kpi.key === 'rate' ? `${num(Math.round(Math.abs(kpi.change) * 100) / 100)} ${t('pts', 'نقطة')}` : pct(Math.abs(kpi.change), 0);
    change = `<span class="kpi__ch ${flat ? '' : up ? 'up' : 'down'}">${flat ? '' : up ? '▲ ' : '▼ '}<bdi>${esc(amount)}</bdi> ${esc(t('vs previous', 'عن اللي قبلها'))}</span>`;
  }
  const before = kpi.previous == null ? '' : `<span class="kpi__prev">${esc(t('Before:', 'قبلها:'))} <bdi>${esc(kpi.key === 'rate' ? pct(kpi.previous, 2) : num(kpi.previous))}</bdi></span>`;
  return `<div class="kpi"><span class="kpi__label">${esc(tx(KPI_LABEL[kpi.key]))}</span><b class="kpi__value">${esc(value)}</b>${change}${before}</div>`;
}

/** Bars for one series over the period, with the first, middle and last dates under them. */
function barsSvg(points: TrendPoint[], pick: (point: TrendPoint) => number, color: string, i18n: I18n) {
  const width = 520;
  const height = 120;
  const base = 104;
  const max = Math.max(1, ...points.map(pick));
  const gap = points.length > 60 ? 1 : 2;
  const bar = Math.max(1, (width - gap * (points.length - 1)) / Math.max(1, points.length));
  const rects = points
    .map((point, index) => {
      const value = pick(point);
      const h = value ? Math.max(2, (value / max) * (base - 8)) : 0;
      return h ? `<rect x="${(index * (bar + gap)).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}"/>` : '';
    })
    .join('');
  const label = (point: TrendPoint | undefined) => (point ? i18n.date(dateFromKey(dayKeyOf(point.from)).toMillis(), 'dayShort') : '');
  const middle = points[Math.floor(points.length / 2)];
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="none" role="img" aria-hidden="true">
    <line x1="0" x2="${width}" y1="${base + 0.5}" y2="${base + 0.5}" stroke="#d6ddeb"/>
    ${rects}
    <text x="0" y="${height - 2}" font-size="10" fill="#6b7280" direction="ltr">${esc(label(points[0]))}</text>
    <text x="${width / 2}" y="${height - 2}" font-size="10" fill="#6b7280" text-anchor="middle" direction="ltr">${esc(label(middle))}</text>
    <text x="${width}" y="${height - 2}" font-size="10" fill="#6b7280" text-anchor="end" direction="ltr">${esc(label(points[points.length - 1]))}</text>
  </svg>`;
}

function platformRows(model: AnalyticsModel, i18n: I18n) {
  const { num, compact, pct } = i18n;
  const total = Math.max(1, model.summary.count);
  return model.platforms
    .map((row) => {
      const share = (row.count / total) * 100;
      return `<tr>
        <td><span class="dot" style="background:${COLOR[row.platform]}"></span>${esc(channelName[row.platform])}</td>
        <td class="n">${esc(num(row.count))}<span class="share"><i style="width:${share.toFixed(1)}%;background:${COLOR[row.platform]}"></i></span></td>
        <td class="n">${esc(row.reachCount ? compact(row.reach) : '—')}</td>
        <td class="n">${esc(row.viewsCount ? compact(row.views) : '—')}</td>
        <td class="n">${esc(row.measured ? compact(row.interactions) : '—')}</td>
        <td class="n">${esc(row.average == null ? '—' : num(Math.round(row.average)))}</td>
        <td class="n">${esc(pct(row.rate, 2))}</td>
      </tr>`;
    })
    .join('');
}

/** `extraHtml` must already be escaped. */
function postCard(post: Post, badge: string, picture: PostPicture | undefined, i18n: I18n, extraHtml = '', tone: 'best' | 'worst' | '' = '') {
  const { t, num, pct, date, tx } = i18n;
  const color = COLOR[post.platform];
  const image = picture
    ? `<img src="${picture.dataUrl}" alt="">`
    : `<span class="ph" style="color:${color}">${esc(channelName[post.platform])}<small>${esc(t('No image available', 'الصورة مش متاحة'))}</small></span>`;
  const caption = post.title ? shortCaption(post, CAPTION_LIMIT) : t('(no caption)', '(بدون نص)');
  const figures = [
    { label: t('Reach', 'الوصول'), value: num(post.metrics.reach), strong: false },
    { label: t('Views', 'المشاهدات'), value: num(post.metrics.views), strong: false },
    { label: t('Interactions', 'التفاعلات'), value: post.measured ? num(post.interactions) : '—', strong: true },
    { label: t('Engagement rate', 'معدل التفاعل'), value: pct(postRate(post), 2), strong: true },
  ];
  const href = safeHref(post.permalink);
  return `<article class="post${tone ? ` post--${tone}` : ''}">
    <div class="post__img">${image}</div>
    <div class="post__body">
      <div class="post__meta"><span class="no">${esc(badge)}</span><span class="chip" style="background:${color}">${esc(channelName[post.platform])}</span><span>${esc(tx(typeLabel(contentTypeOf(post))))} · ${esc(post.accountName || '—')} · ${esc(date(post.ts, 'dateTime'))}</span>${extraHtml ? `<span class="vs">${extraHtml}</span>` : ''}</div>
      <p class="post__caption" dir="auto">${esc(caption)}</p>
      <div class="figs">${figures.map((figure) => `<div class="fig${figure.strong ? ' fig--strong' : ''}"><b>${esc(figure.value)}</b><span>${esc(figure.label)}</span></div>`).join('')}</div>
      ${href ? `<a class="link" href="${esc(href)}" dir="ltr">${esc(t('Open post', 'افتح المنشور'))}</a>` : ''}
    </div>
  </article>`;
}

/** Already escaped: the ratio keeps left-to-right order inside Arabic text. */
const times = (value: number | null, i18n: I18n) => (value == null ? '' : `<bdi dir="ltr">${esc(i18n.num(Math.round(value * 10) / 10))}×</bdi> ${esc(i18n.t('typical', 'المعتاد'))}`);

function rankingSection(reports: Reports, pictures: Map<string, PostPicture>, i18n: I18n) {
  const { t, tx, num, pct, compact } = i18n;
  const by = tx(RANK_LABEL[reports.rankBy]);
  const value = (entry: Ranked) => (reports.rankBy === 'rate' ? pct(entry.value, 2) : compact(entry.value));
  const list = (title: string, entries: Ranked[], tone: 'best' | 'worst') =>
    entries.length
      ? `<h4 class="list list--${tone}">${esc(title)}</h4>${entries.map((entry, index) => postCard(entry.post, num(index + 1), pictures.get(entry.post.key), i18n, `${esc(by)}: <bdi>${esc(value(entry))}</bdi>${entry.vsMedian == null ? '' : ` · ${times(entry.vsMedian, i18n)}`}`, tone)).join('')}`
      : '';
  const silent = reports.rankBy === 'views' || reports.rankBy === 'reach' ? reports.rankings.filter((row) => row.reported === 0) : [];
  const silentLine = silent.length ? `<p class="foot">${esc(t(`Not reported here: ${silent.map((row) => channelName[row.platform]).join(', ')}.`, `المنصات دي مش بترجع ${by}: ${silent.map((row) => channelName[row.platform]).join('، ')}.`))}</p>` : '';
  const blocks = silentLine + reports.rankings
    .filter((row) => !silent.includes(row))
    .map((row) => {
      const typical = row.median == null ? '' : t(`Typical post: ${reports.rankBy === 'rate' ? pct(row.median, 2) : compact(row.median)}`, `المنشور المعتاد: ${reports.rankBy === 'rate' ? pct(row.median, 2) : compact(row.median)}`);
      const body = row.best.length
        ? `${list(t('Best', 'الأفضل'), row.best, 'best')}${list(t('Worst', 'الأسوأ'), row.worst, 'worst')}`
        : `<p class="foot">${esc(t('No post here has the numbers needed to rank it yet.', 'مفيش منشور هنا عنده الأرقام اللازمة لترتيبه لسه.'))}</p>`;
      return `<div class="rank"><h3><span class="dot" style="background:${COLOR[row.platform]}"></span>${esc(channelName[row.platform])}<small>${esc(typical)}${row.unranked ? esc(t(` · ${num(row.unranked)} not ranked`, ` · ${num(row.unranked)} مش داخلين الترتيب`)) : ''}</small></h3>${body}</div>`;
    })
    .join('');
  return `<section class="posts-head"><h2>${esc(t(`Best and worst ${RANK_PER_PLATFORM} posts on each platform, by ${by.toLowerCase()}`, `أفضل وأسوأ ${RANK_PER_PLATFORM} منشورات على كل منصة حسب ${by}`))}</h2>${blocks || `<p class="foot">${esc(t('No post in this period has the numbers needed to rank it yet.', 'مفيش منشور في الفترة دي عنده الأرقام اللازمة لترتيبه لسه.'))}</p>`}</section>`;
}

function typesTable(reports: Reports, i18n: I18n) {
  const { t, tx, num, compact, pct } = i18n;
  if (!reports.types.length) return '';
  const rows = reports.types
    .map((row) => `<tr><td><span class="dot" style="background:${COLOR[row.platform]}"></span>${esc(channelName[row.platform])}</td><td>${esc(tx(typeLabel(row.type)))}</td><td class="n">${esc(num(row.count))}</td><td class="n">${esc(row.reachCount ? compact(row.reach) : '—')}</td><td class="n">${esc(row.average == null ? '—' : num(Math.round(row.average)))}</td><td class="n">${esc(row.medianInteractions == null ? '—' : num(Math.round(row.medianInteractions)))}</td><td class="n">${esc(pct(row.rate, 2))}</td></tr>`)
    .join('');
  return `<section><h2>${esc(t('Results by content type', 'النتائج حسب نوع المحتوى'))}</h2><table><thead><tr><th>${esc(t('Platform', 'المنصة'))}</th><th>${esc(t('Type', 'النوع'))}</th><th class="n">${esc(t('Posts', 'المنشورات'))}</th><th class="n">${esc(t('Reach', 'الوصول'))}</th><th class="n">${esc(t('Interactions per post', 'تفاعل لكل منشور'))}</th><th class="n">${esc(t('Typical post', 'المنشور المعتاد'))}</th><th class="n">${esc(t('Engagement rate', 'معدل التفاعل'))}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function timeTable(title: string, head: string, rows: TimeRow[], label: (row: TimeRow) => string, i18n: I18n, ltr = false) {
  const { t, num, pct } = i18n;
  const max = Math.max(1, ...rows.map((row) => row.average ?? 0));
  const body = rows
    .map((row) => `<tr${row.best ? ' class="best"' : ''}><td>${ltr ? `<bdi dir="ltr">${esc(label(row))}</bdi>` : esc(label(row))}${row.best ? ` <b class="tag">${esc(t('Best', 'الأفضل'))}</b>` : ''}</td><td class="n">${esc(num(row.count))}</td><td class="n">${esc(row.average == null ? '—' : num(Math.round(row.average)))}<span class="share"><i style="width:${(((row.average ?? 0) / max) * 100).toFixed(1)}%;background:#0f8a4b"></i></span></td><td class="n">${esc(pct(row.rate, 2))}</td></tr>`)
    .join('');
  return `<div><h3 class="sub">${esc(title)}</h3><table><thead><tr><th>${esc(head)}</th><th class="n">${esc(t('Posts', 'المنشورات'))}</th><th class="n">${esc(t('Per post', 'لكل منشور'))}</th><th class="n">${esc(t('Rate', 'المعدل'))}</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function mixTable(reports: Reports, i18n: I18n) {
  const { t, tx, compact, num } = i18n;
  if (!reports.mix.length) return '';
  const cell = (total: number | null, rate: number | null) => (total == null ? '—' : `${esc(compact(total))}${rate == null ? '' : `<small> · ${esc(num(Math.round(rate * 100) / 100))}</small>`}`);
  const rows = reports.mix.map((row) => `<tr><td><span class="dot" style="background:${COLOR[row.platform]}"></span>${esc(channelName[row.platform])}</td>${MIX_KEYS.map((key) => `<td class="n">${cell(row.cells[key].total, row.cells[key].rate)}</td>`).join('')}</tr>`).join('');
  return `<section><h2>${esc(t('What people did on each platform', 'الناس عملت إيه على كل منصة'))}</h2><p class="foot">${esc(t('Total, then per 100 people reached.', 'الإجمالي، وبعده لكل 100 وصلهم المنشور.'))}</p><table><thead><tr><th>${esc(t('Platform', 'المنصة'))}</th>${MIX_KEYS.map((key) => `<th class="n">${esc(tx(MIX_LABEL[key]))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

function audienceSection(model: AnalyticsModel, i18n: I18n) {
  const { t, tx, num, compact, pct, lang } = i18n;
  if (!model.audience.length) return '';
  const tiles = model.audience
    .map((row) => {
      const change = row.change == null ? '' : `<span class="kpi__ch ${row.change > 0 ? 'up' : row.change < 0 ? 'down' : ''}"><bdi dir="ltr">${row.change > 0 ? '+' : row.change < 0 ? '−' : ''}${esc(num(Math.abs(row.change)))}</bdi> ${esc(t(`since ${row.since}`, `من ${row.since}`))}</span>`;
      return `<div class="kpi"><span class="kpi__label"><span class="dot" style="background:${COLOR[row.platform]}"></span>${esc(channelName[row.platform])}</span><b class="kpi__value">${esc(row.followers == null ? '—' : compact(row.followers))}</b><span class="kpi__ch">${esc(row.platform === 'youtube' ? t('Subscribers', 'المشتركين') : t('Followers', 'المتابعين'))}</span>${change}</div>`;
    })
    .join('');
  const demographics = model.audience
    .flatMap((row) => row.accounts.filter((account) => account.demographics))
    .map((account) => {
      const data = account.demographics!;
      const groups = DEMOGRAPHIC_KEYS.map((key) => ({ key, slices: shares(data[key], key) })).filter((group) => group.slices.length);
      const tables = groups
        .map((group) => `<div><h3 class="sub">${esc(tx(DEMOGRAPHIC_LABEL[group.key]))}</h3><table><tbody>${group.slices.map((slice) => `<tr><td>${group.key === 'age' ? `<bdi dir="ltr">${esc(slice.key)}</bdi>` : esc(sliceLabel(group.key, slice.key, lang))}</td><td class="n">${esc(pct(slice.value, 0))}<span class="share"><i style="width:${slice.value.toFixed(1)}%;background:${COLOR[account.platform]}"></i></span></td></tr>`).join('')}</tbody></table></div>`)
        .join('');
      return `<div class="rank"><h3><span class="dot" style="background:${COLOR[account.platform]}"></span>${esc(channelName[account.platform])} · ${esc(account.accountName)}<small>${esc(tx(basisLabel(data)))}</small></h3><div class="demo">${tables}</div></div>`;
    })
    .join('');
  return `<section><h2>${esc(t('Audience', 'الجمهور'))}</h2><div class="kpis">${tiles}</div>${demographics}</section>`;
}

function accountsTable(reports: Reports, i18n: I18n) {
  const { t, num, compact, pct } = i18n;
  if (!reports.accounts.length) return '';
  const rows = reports.accounts.map((row) => `<tr><td><span class="dot" style="background:${COLOR[row.platform]}"></span>${esc(row.name)} <small>· ${esc(channelName[row.platform])}</small></td><td class="n">${esc(num(row.count))}</td><td class="n">${esc(row.reachCount ? compact(row.reach) : '—')}</td><td class="n">${esc(row.measured ? compact(row.interactions) : '—')}</td><td class="n">${esc(row.average == null ? '—' : num(Math.round(row.average)))}</td><td class="n">${esc(pct(row.rate, 2))}</td></tr>`).join('');
  return `<section><h2>${esc(t('By account', 'حسب الحساب'))}</h2><table><thead><tr><th>${esc(t('Account', 'الحساب'))}</th><th class="n">${esc(t('Posts', 'المنشورات'))}</th><th class="n">${esc(t('Reach', 'الوصول'))}</th><th class="n">${esc(t('Interactions', 'التفاعلات'))}</th><th class="n">${esc(t('Per post', 'لكل منشور'))}</th><th class="n">${esc(t('Engagement rate', 'معدل التفاعل'))}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

const STYLE = (lang: string) => `
  @page { size: A4; margin: 12mm 11mm; }
  :root { color-scheme: light; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { background: #fff; }
  body { font-family: ${lang === 'ar' ? "'Almarai','IBM Plex Sans Arabic'," : "'Plus Jakarta Sans',"} -apple-system, 'Segoe UI', system-ui, sans-serif; color: #0b1324; margin: 0; font-size: 10.5px; line-height: 1.5; }
  bdi { unicode-bidi: isolate; }
  .cover { background: #0a1b3d; color: #fff; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; }
  .cover h1 { font-size: 22px; margin: 0 0 4px; }
  .cover p { margin: 0; color: #c7d2ee; font-size: 11px; }
  h2 { font-size: 13.5px; margin: 0 0 8px; }
  section { margin-bottom: 16px; }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .kpi { border: 1px solid #e3e8f2; border-radius: 8px; padding: 9px 10px; display: flex; flex-direction: column; gap: 2px; }
  .kpi__label { color: #5a6480; font-size: 9.5px; }
  .kpi__value { font-size: 19px; font-variant-numeric: tabular-nums; }
  .kpi__ch, .kpi__prev { font-size: 9px; color: #6b7280; }
  .up { color: #0f8a4b; } .down { color: #c2341d; }
  .kpi__ch.up, .kpi__ch.down { font-weight: 700; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .chart { border: 1px solid #e3e8f2; border-radius: 8px; padding: 9px 10px 4px; }
  .chart h3 { font-size: 10.5px; margin: 0 0 4px; display: flex; justify-content: space-between; }
  .chart h3 small { color: #6b7280; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e3e8f2; padding: 5px 6px; text-align: start; vertical-align: middle; }
  th { background: #eef2ff; font-size: 9.5px; }
  td.n, th.n { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-inline-end: 6px; vertical-align: middle; }
  .share { display: inline-block; width: 46px; height: 5px; background: #eef1f7; border-radius: 3px; margin-inline-start: 6px; vertical-align: middle; overflow: hidden; }
  .share i { display: block; height: 100%; }
  .posts-head { break-before: page; }
  .post { display: grid; grid-template-columns: 28mm 1fr; gap: 12px; border: 1px solid #e3e8f2; border-radius: 10px; padding: 10px; margin-bottom: 9px; break-inside: avoid; }
  .post__img { width: 28mm; height: 28mm; border-radius: 7px; background: #f3f5fa; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .post__img img { width: 100%; height: 100%; object-fit: contain; }
  .ph { font-weight: 700; font-size: 12px; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
  .ph small { color: #6b7280; font-weight: 400; font-size: 9px; }
  .post__body { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .post__meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: #5a6480; font-size: 9.5px; }
  .no { background: #0a1b3d; color: #fff; border-radius: 4px; padding: 0 6px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .chip { color: #fff; border-radius: 999px; padding: 0 8px; font-weight: 700; }
  .post__caption { margin: 0; white-space: pre-line; overflow-wrap: anywhere; font-size: 10px; max-height: 13mm; overflow: hidden; }
  .figs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
  .fig { background: #f6f8fc; border-radius: 6px; padding: 4px 6px; display: flex; flex-direction: column; }
  .fig b { font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .fig span { color: #6b7280; font-size: 8.5px; }
  .fig--strong { background: #e8eeff; }
  .fig--strong b { color: #0035c4; }
  .link { font-size: 8.5px; color: #0046ff; text-decoration: none; overflow-wrap: anywhere; }
  .foot { color: #6b7280; font-size: 9px; margin-top: 4px; }
  .rank { margin-bottom: 12px; }
  .rank h3 { font-size: 12.5px; margin: 6px 0 6px; display: flex; align-items: center; gap: 2px; }
  .rank h3 small { color: #6b7280; font-weight: 400; font-size: 9.5px; margin-inline-start: 8px; }
  .list { font-size: 10.5px; margin: 6px 0 5px; }
  .list--best { color: #0f8a4b; } .list--worst { color: #c2341d; }
  .post--best { border-inline-start: 3px solid #0f8a4b; } .post--worst { border-inline-start: 3px solid #c2341d; }
  .vs { margin-inline-start: auto; font-weight: 700; color: #0b1324; }
  .sub { font-size: 11px; margin: 0 0 6px; }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  tr.best td { background: #ecf8f1; }
  .tag { color: #0f8a4b; font-size: 8.5px; }
  td small { color: #6b7280; }
  .all-head { break-before: page; }
  .demo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .kpis + .rank { margin-top: 12px; }
`;

export function reportHtml(model: AnalyticsModel, reports: Reports, i18n: I18n, posts: ExportPosts, pictures: Map<string, PostPicture>, generatedAt: number): string {
  const { t, tx, dir, lang, num, date } = i18n;
  const title = t('Analytics report', 'تقرير التحليلات');
  const totalInteractions = model.trend.reduce((sum, point) => sum + point.interactions, 0);
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap">
  <style>${STYLE(lang)}</style></head><body>
  <header class="cover"><h1>${esc(title)}</h1><p>${esc(scopeLine(model, i18n))}</p><p>${esc(t(`Generated ${date(generatedAt, 'dateTime')} · ${num(model.posts.length)} posts`, `اتعمل ${date(generatedAt, 'dateTime')} · ${num(model.posts.length)} منشور`))}</p></header>

  <section><h2>${esc(t('Overview', 'نظرة عامة'))}</h2><div class="kpis">${model.kpis.map((kpi) => kpiTile(kpi, i18n)).join('')}</div></section>

  <section><h2>${esc(model.weekly ? t('Activity per week', 'النشاط كل أسبوع') : t('Activity per day', 'النشاط كل يوم'))}</h2><div class="charts">
    <div class="chart"><h3>${esc(t('Posts', 'المنشورات'))}<small>${esc(num(model.summary.count))}</small></h3>${barsSvg(model.trend, (point) => point.posts, '#0046ff', i18n)}</div>
    <div class="chart"><h3>${esc(t('Interactions', 'التفاعلات'))}<small>${esc(num(totalInteractions))}</small></h3>${barsSvg(model.trend, (point) => point.interactions, '#0f8a4b', i18n)}</div>
  </div></section>

  <section><h2>${esc(t('By platform', 'حسب المنصة'))}</h2><table><thead><tr>
    <th>${esc(t('Platform', 'المنصة'))}</th><th class="n">${esc(t('Posts', 'المنشورات'))}</th><th class="n">${esc(t('Reach', 'الوصول'))}</th><th class="n">${esc(t('Views', 'المشاهدات'))}</th><th class="n">${esc(t('Interactions', 'التفاعلات'))}</th><th class="n">${esc(t('Interactions per post', 'تفاعل لكل منشور'))}</th><th class="n">${esc(t('Engagement rate', 'معدل التفاعل'))}</th>
  </tr></thead><tbody>${platformRows(model, i18n)}</tbody></table></section>

  ${audienceSection(model, i18n)}

  ${accountsTable(reports, i18n)}

  ${rankingSection(reports, pictures, i18n)}

  ${typesTable(reports, i18n)}

  <section><h2>${esc(t('When posts did best', 'المنشورات نجحت إمتى'))}</h2><div class="split">
    ${timeTable(t('Day of the week', 'يوم الأسبوع'), t('Day', 'اليوم'), reports.weekdays, (row) => tx(WEEKDAY_LABEL[row.key]), i18n)}
    ${timeTable(t('Time of day', 'وقت النشر'), t('Time', 'الوقت'), reports.hours, (row) => hourBlockLabel(row.key), i18n, true)}
  </div></section>

  ${mixTable(reports, i18n)}

  <section><h2>${esc(t('About these numbers', 'عن الأرقام دي'))}</h2>${reportNotes(model, reports, i18n).map((note) => `<p class="foot">${esc(note)}</p>`).join('')}</section>

  ${posts === 'all' ? `<section class="all-head"><h2>${esc(t(`Every post (${num(model.posts.length)})`, `كل المنشورات (${num(model.posts.length)})`))}</h2>${model.posts.map((post, index) => postCard(post, num(index + 1), pictures.get(post.key), i18n)).join('')}</section>` : ''}
  </body></html>`;
}

/** Prints the report from a hidden frame, so the page stays where it is. */
export function printDetailedReport(model: AnalyticsModel, reports: Reports, i18n: I18n, posts: ExportPosts, pictures: Map<string, PostPicture>) {
  const html = reportHtml(model, reports, i18n, posts, pictures, Date.now());
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
  let printed = false;
  const run = () => {
    if (printed) return;
    printed = true;
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Safari keeps painting the frame while the dialog is open, so it is removed after it closes.
    setTimeout(() => frame.remove(), 60_000);
  };
  // Wait for the fonts and the pictures, but never more than a few seconds.
  const ready = Promise.all([doc.fonts?.ready, ...Array.from(doc.images).map((image) => (image.complete ? undefined : image.decode().catch(() => undefined)))]);
  void Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 4000))]).then(() => setTimeout(run, 80));
}
