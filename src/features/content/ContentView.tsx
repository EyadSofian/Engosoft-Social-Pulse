import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsDown, Download, ExternalLink, Globe, LayoutGrid, Plug, Rows3, SearchX } from 'lucide-react';
import { FilterBar } from '../../components/Shared';
import { EmptyState, Panel, Reveal, Thumb, ViewHeader } from '../../components/ui/Bits';
import { Button } from '../../components/ui/Button';
import { SearchField, Segmented, Select } from '../../components/ui/Controls';
import { PlatformBadge } from '../../components/ui/Platform';
import { useApp } from '../../context';
import { periodLong, scopePosts, splitByPeriod, summarize, websitePageTotals } from '../../lib/analytics';
import { compact, dayKeyOf, fmtDate, fmtDayShort, num, oneDecimal, pct } from '../../lib/format';
import { platformLatin, platformName } from '../../lib/platforms';
import type { Metrics, Post } from '../../types';

type Section = 'posts' | 'pages';
type Layout = 'table' | 'cards';
type SortKey = 'date' | 'interactions' | 'rate' | MetricKey;
type MetricKey = 'views' | 'reach' | 'impressions' | 'likes' | 'comments' | 'shares' | 'saves';

const PAGE_SIZE = 24;
const COLUMNS: { key: MetricKey; label: string }[] = [
  { key: 'views', label: 'مشاهدات' },
  { key: 'reach', label: 'وصول' },
  { key: 'impressions', label: 'ظهور' },
  { key: 'likes', label: 'إعجابات' },
  { key: 'comments', label: 'تعليقات' },
  { key: 'shares', label: 'مشاركات' },
  { key: 'saves', label: 'حفظ' },
];
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'date', label: 'الأحدث' },
  { value: 'interactions', label: 'الأكثر تفاعلًا' },
  { value: 'rate', label: 'أعلى معدل تفاعل' },
  { value: 'views', label: 'الأكثر مشاهدة' },
  { value: 'reach', label: 'الأكثر وصولًا' },
];

function sortValue(post: Post, key: SortKey): number | null {
  if (key === 'date') return post.ts;
  if (key === 'interactions') return post.measured ? post.interactions : null;
  if (key === 'rate') return post.engagementRate;
  return post.metrics[key as keyof Metrics];
}

/** Spreadsheet apps run cells that start with these characters as formulas. */
const safeCell = (value: unknown) => {
  const text = String(value ?? '');
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};

function exportCsv(posts: Post[], today: string) {
  const header = ['Platform', 'Account', 'Published At', 'Post', 'URL', 'Views', 'Reach', 'Impressions', 'Likes', 'Comments', 'Shares', 'Saves', 'Engagement Rate %'];
  const rows = posts.map((post) => [
    platformLatin[post.platform],
    post.accountName,
    post.publishedAt,
    post.title,
    post.permalink,
    post.metrics.views,
    post.metrics.reach,
    post.metrics.impressions,
    post.metrics.likes,
    post.metrics.comments,
    post.metrics.shares,
    post.metrics.saves,
    post.engagementRate,
  ]);
  const csv = '﻿' + [header, ...rows].map((row) => row.map(safeCell).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `engosoft-social-posts-${today}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ContentView() {
  const { data, todayNum, filters, go, openPost } = useApp();
  const [section, setSection] = useState<Section>('posts');
  const [layout, setLayout] = useState<Layout>('table');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [allColumns, setAllColumns] = useState(false);

  const scoped = useMemo(() => scopePosts(data.posts, filters), [data.posts, filters]);
  const current = useMemo(() => splitByPeriod(scoped, filters.period, todayNum).current, [scoped, filters.period, todayNum]);
  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return current;
    return current.filter((post) => post.title.toLowerCase().includes(needle) || post.accountName.toLowerCase().includes(needle));
  }, [current, query]);
  const sorted = useMemo(() => {
    const sign = sort.desc ? -1 : 1;
    return [...found].sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      // Missing values always sink to the bottom, whichever way the column is sorted.
      if (left == null || right == null) return left == null ? (right == null ? b.ts - a.ts : 1) : -1;
      return (left - right) * sign || b.ts - a.ts;
    });
  }, [found, sort]);
  const totals = useMemo(() => summarize(found), [found]);
  const emptyColumns = useMemo(() => COLUMNS.filter((column) => !found.some((post) => post.metrics[column.key] != null)), [found]);
  const columns = allColumns ? COLUMNS : COLUMNS.filter((column) => !emptyColumns.includes(column));

  const pages = useMemo(() => websitePageTotals(data.websitePages, filters.period, todayNum), [data.websitePages, filters.period, todayNum]);
  const foundPages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? pages.filter((page) => page.title.toLowerCase().includes(needle) || page.path.toLowerCase().includes(needle)) : pages;
  }, [pages, query]);

  useEffect(() => setLimit(PAGE_SIZE), [filters, query, sort, section]);

  const toggleSort = (key: SortKey) => setSort((state) => (state.key === key ? { key, desc: !state.desc } : { key, desc: true }));
  const sortHead = (column: SortKey, label: string) => (
    <th key={column} className="num" aria-sort={sort.key === column ? (sort.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" className="th-sort" data-active={sort.key === column} onClick={() => toggleSort(column)}>
        {label}
        {sort.key === column ? sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} /> : null}
      </button>
    </th>
  );
  const visible = sorted.slice(0, limit);

  return (
    <>
      <Reveal>
        <ViewHeader title="أداء المحتوى" subtitle="كل بوست برقمه ومصدره — والقيم التي لم تُرجعها المنصة تظهر كما هي «—».">
          <Button icon={<Download size={16} />} disabled={!sorted.length || section !== 'posts'} onClick={() => exportCsv(sorted, dayKeyOf(todayNum))}>
            تصدير CSV
          </Button>
        </ViewHeader>
      </Reveal>

      <Reveal i={1}>
        <FilterBar />
      </Reveal>

      <Reveal i={2} className="toolbar">
        <Segmented
          label="القسم"
          value={section}
          onChange={setSection}
          options={[
            { value: 'posts', label: `بوستات المنصات (${num(found.length)})` },
            { value: 'pages', label: `صفحات الموقع (${num(foundPages.length)})`, icon: <Globe size={15} /> },
          ]}
        />
        <SearchField
          value={query}
          onChange={setQuery}
          label="بحث"
          placeholder={section === 'posts' ? 'ابحث في نص البوست أو اسم الصفحة…' : 'ابحث بعنوان الصفحة أو مسارها…'}
        />
        {section === 'posts' && (
          <>
            <Select aria-label="الترتيب" value={sort.key} onChange={(event) => setSort({ key: event.target.value as SortKey, desc: true })}>
              {SORTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
              {!SORTS.some((item) => item.value === sort.key) && <option value={sort.key}>ترتيب مخصص</option>}
            </Select>
            <Segmented
              label="شكل العرض"
              iconOnly
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'table', label: 'جدول', icon: <Rows3 size={16} /> },
                { value: 'cards', label: 'بطاقات', icon: <LayoutGrid size={16} /> },
              ]}
            />
          </>
        )}
      </Reveal>

      {section === 'posts' && (
        <>
          <Reveal i={3} className="summary">
            <div className="glass summary__item">
              <span>بوستات</span>
              <b>{num(totals.count)}</b>
              <small>{periodLong(filters.period)}</small>
            </div>
            <div className="glass summary__item">
              <span>إجمالي التفاعلات</span>
              <b>{totals.measured ? compact(totals.interactions) : '—'}</b>
              <small>{totals.count ? `${num(totals.measured)} من ${num(totals.count)} بوست لها بيانات` : 'لا توجد بوستات'}</small>
            </div>
            <div className="glass summary__item">
              <span>متوسط التفاعل لكل بوست</span>
              <b>{totals.average == null ? '—' : oneDecimal(totals.average)}</b>
              <small>للبوستات المرصودة فقط</small>
            </div>
            <div className="glass summary__item">
              <span>متوسط معدل التفاعل</span>
              <b>{pct(totals.rate)}</b>
              <small>{totals.rate == null ? 'يحتاج بيانات وصول أو مشاهدات' : 'التفاعلات ÷ الوصول'}</small>
            </div>
          </Reveal>

          <Reveal i={4}>
            {!sorted.length ? (
              <Panel>
                <EmptyState
                  icon={<SearchX size={28} />}
                  title={query ? 'لا توجد نتائج لهذا البحث' : 'لا توجد بوستات في هذه الفترة'}
                  text={query ? 'جرّب كلمة أخرى أو امسح البحث.' : 'اختر فترة أطول أو راجع حالة ربط المنصات.'}
                  action={
                    query ? (
                      <Button size="sm" onClick={() => setQuery('')}>
                        امسح البحث
                      </Button>
                    ) : (
                      <Button size="sm" icon={<Plug size={14} />} onClick={() => go('connections')}>
                        حالة الربط
                      </Button>
                    )
                  }
                />
              </Panel>
            ) : layout === 'table' ? (
              <Panel flush>
                <div className="table-wrap">
                  <table className="table table--posts">
                    <thead>
                      <tr>
                        <th>البوست</th>
                        <th>المنصة</th>
                        {sortHead('date', 'تاريخ النشر')}
                        {columns.map((column) => sortHead(column.key, column.label))}
                        {sortHead('rate', 'معدل التفاعل')}
                        <th>
                          <span className="sr-only">رابط</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((post) => (
                        <tr key={post.key} tabIndex={0} onClick={() => openPost(post)} onKeyDown={(event) => event.key === 'Enter' && openPost(post)}>
                          <td>
                            <div className="cell-post">
                              <Thumb src={post.thumbnail} platform={post.platform} />
                              <span>
                                <b>{post.title}</b>
                                <small>{post.accountName || post.contentType}</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="cell-platform">
                              <PlatformBadge platform={post.platform} size="xs" />
                              {platformName[post.platform]}
                            </span>
                          </td>
                          <td className="num">{post.ts ? fmtDate(post.ts) : '—'}</td>
                          {columns.map((column) => (
                            <td key={column.key} className="num" data-missing={post.metrics[column.key] == null || undefined}>
                              {num(post.metrics[column.key])}
                            </td>
                          ))}
                          <td className="num" data-missing={post.engagementRate == null || undefined}>
                            {post.engagementRate == null ? '—' : <span className="rate">{pct(post.engagementRate)}</span>}
                          </td>
                          <td>
                            {post.permalink && (
                              <a
                                className="icon-btn icon-btn--sm"
                                href={post.permalink}
                                target="_blank"
                                rel="noreferrer noopener"
                                aria-label="افتح المنشور على المنصة"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <ExternalLink size={15} />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {emptyColumns.length > 0 && (
                  <footer className="panel__foot panel__foot--padded">
                    <span>
                      {allColumns
                        ? 'تظهر كل الأعمدة، بما فيها التي لم تُرجع لها المنصات أي قيمة.'
                        : `${emptyColumns.length} أعمدة مخفية لأن المنصات لم تُرجع لها أي قيمة: ${emptyColumns.map((column) => column.label).join('، ')}.`}
                    </span>
                    <button type="button" className="link" onClick={() => setAllColumns((value) => !value)}>
                      {allColumns ? 'أخفِ الأعمدة الفارغة' : 'أظهر كل الأعمدة'}
                    </button>
                  </footer>
                )}
              </Panel>
            ) : (
              <div className="cards">
                {visible.map((post) => (
                  <button key={post.key} type="button" className="glass pcard" data-spot onClick={() => openPost(post)}>
                    <Thumb src={post.thumbnail} platform={post.platform} className="pcard__media" />
                    <span className="pcard__meta">
                      <PlatformBadge platform={post.platform} size="xs" />
                      {post.accountName || platformName[post.platform]} · {post.ts ? fmtDayShort(post.ts) : '—'}
                    </span>
                    <b className="pcard__title">{post.title}</b>
                    <span className="pcard__stats">
                      <span>
                        <b>{post.measured ? compact(post.interactions) : '—'}</b> تفاعل
                      </span>
                      {post.metrics.views != null && (
                        <span>
                          <b>{compact(post.metrics.views)}</b> مشاهدة
                        </span>
                      )}
                      {post.engagementRate != null && <span className="rate">{pct(post.engagementRate)}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {sorted.length > limit && (
              <div className="more">
                <Button icon={<ChevronsDown size={16} />} onClick={() => setLimit((value) => value + PAGE_SIZE)}>
                  عرض المزيد ({num(sorted.length - limit)} متبقٍ)
                </Button>
              </div>
            )}
          </Reveal>
        </>
      )}

      {section === 'pages' && (
        <Reveal i={3}>
          <Panel
            flush
            title="أداء صفحات الموقع"
            subtitle={`مشاهدات كل مسار · ${periodLong(filters.period)} · من Google Analytics 4`}
            className="panel--titled-flush"
          >
            {foundPages.length ? (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>الصفحة</th>
                        <th>المسار</th>
                        <th className="num">المشاهدات</th>
                        <th className="num">نشاط المستخدمين اليومي</th>
                        <th className="num">زمن التفاعل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {foundPages.slice(0, 100).map((page) => (
                        <tr key={page.path}>
                          <td>
                            <b>{page.title}</b>
                          </td>
                          <td dir="ltr" className="cell-path">
                            {page.path}
                          </td>
                          <td className="num">{num(page.views)}</td>
                          <td className="num">{num(page.activeUsers)}</td>
                          <td className="num">{num(Math.round(page.engagementSeconds / 60))} د</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <footer className="panel__foot panel__foot--padded">
                  <span>
                    نشاط المستخدمين اليومي هو مجموع المستخدمين النشطين لكل يوم، وليس عدد مستخدمين فريدين للفترة. يظهر أول 100 مسار حسب المشاهدات؛ GA4 لا
                    يحدد تاريخ نشر الصفحة.
                  </span>
                </footer>
              </>
            ) : (
              <EmptyState
                icon={<Globe size={28} />}
                title={query && pages.length ? 'لا توجد صفحات مطابقة للبحث' : 'بيانات صفحات الموقع لم تصل بعد'}
                text={query && pages.length ? 'جرّب كلمة أخرى أو امسح البحث.' : 'اضبط اتصال GA4 لعرض مشاهدات كل صفحة.'}
                action={
                  query && pages.length ? (
                    <Button size="sm" onClick={() => setQuery('')}>
                      امسح البحث
                    </Button>
                  ) : (
                    <Button size="sm" icon={<Plug size={14} />} onClick={() => go('connections')}>
                      حالة الربط
                    </Button>
                  )
                }
              />
            )}
          </Panel>
        </Reveal>
      )}
    </>
  );
}
