import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, LayoutGrid, SearchX, Table2 } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { DataTable, type Column } from '../../components/data-display/DataTable';
import { EmptyState } from '../../components/feedback/States';
import { SearchInput } from '../../components/forms/Field';
import { Dialog } from '../../components/overlay/Overlay';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Tabs';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { useToast } from '../../components/feedback/Toast';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { api, errorMessage } from '../../lib/api';
import type { Metrics, Post } from '../../types';
import { money, REACH_LABEL } from './reach';

type View = 'cards' | 'table';
const PAGE = 24;
const VIEW_KEY = 'analytics.postsView';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
}

/** Every post in the period: as cards showing the creative and its numbers, or as a table. Either opens the post. */
export function PostsSection({ posts }: { posts: Post[] }) {
  const { t, num } = useI18n();
  const [search, setSearch] = useState('');
  const [view, setViewState] = useState<View>(readView);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Post | null>(null);

  const setView = (next: View) => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* Private mode: the choice lasts for this visit only. */
    }
  };

  const found = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return posts;
    return posts.filter((post) => post.title.toLowerCase().includes(needle) || post.accountName.toLowerCase().includes(needle));
  }, [posts, search]);

  useEffect(() => setLimit(PAGE), [posts, search]);

  const empty = <EmptyState compact icon={<SearchX size={22} />} title={t('No post matches this search.', 'مفيش منشور مطابق للبحث.')} text={t('Try another word, or clear the search.', 'جرّب كلمة تانية، أو امسح البحث.')} />;

  return (
    <Card>
      <CardHeader
        title={t('Posts', 'المنشورات')}
        count={num(found.length)}
        actions={
          <div className="u-row">
            <SearchInput value={search} onChange={setSearch} label={t('Search posts', 'ابحث في المنشورات')} placeholder={t('Caption or account…', 'نص المنشور أو اسم الحساب…')} />
            <Segmented
              label={t('View', 'طريقة العرض')}
              iconOnly
              value={view}
              onChange={setView}
              items={[
                { value: 'cards', label: t('Cards', 'كروت'), icon: <LayoutGrid size={15} /> },
                { value: 'table', label: t('Table', 'جدول'), icon: <Table2 size={15} /> },
              ]}
            />
          </div>
        }
      />
      {view === 'table' ? (
        <PostTable posts={found} onOpen={setOpen} empty={empty} />
      ) : (
        <CardBody>
          {found.length ? (
            <>
              <ul className="an-grid">
                {found.slice(0, limit).map((post) => (
                  <li key={post.key}>
                    <PostCard post={post} onOpen={() => setOpen(post)} />
                  </li>
                ))}
              </ul>
              {found.length > limit && (
                <div className="an-more">
                  <Button onClick={() => setLimit((value) => value + PAGE)}>{t(`Show more (${num(found.length - limit)} left)`, `اعرض أكتر (باقي ${num(found.length - limit)})`)}</Button>
                </div>
              )}
            </>
          ) : (
            empty
          )}
        </CardBody>
      )}
      <PostDialog post={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

/** The post's own picture, or the platform's mark when it has none or the link has expired. */
export function Thumb({ post, large }: { post: Post; large?: boolean }) {
  const [failed, setFailed] = useState('');
  if (!post.thumbnail || failed === post.thumbnail)
    return (
      <span className={`an-thumb an-thumb--empty${large ? ' an-thumb--large' : ''}`}>
        <ChannelIcon channel={post.platform} size={large ? 40 : 28} />
      </span>
    );
  return (
    <span className={`an-thumb${large ? ' an-thumb--large' : ''}`}>
      <img src={post.thumbnail} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(post.thumbnail)} />
    </span>
  );
}

function PostCard({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const { t, compact, pct, date } = useI18n();
  // Reach when the platform gives it, views otherwise (YouTube reports views only).
  const audience = post.metrics.reach != null ? { label: t('Reach', 'الوصول'), value: post.metrics.reach } : { label: t('Views', 'المشاهدات'), value: post.metrics.views };
  return (
    <button type="button" className="an-post" onClick={onOpen}>
      <Thumb post={post} />
      <span className="an-post__meta">
        <ChannelIcon channel={post.platform} size={14} />
        <span className="u-truncate">{post.accountName || channelName[post.platform]}</span>
        <KindBadge post={post} />
        <span className="an-post__date u-tnum">{date(post.ts, 'dayShort')}</span>
      </span>
      <span className="an-post__caption" dir="auto">
        {post.title || t('(no caption)', '(بدون نص)')}
      </span>
      <span className="an-post__stats">
        <Stat label={audience.label} value={compact(audience.value)} />
        <Stat label={t('Interactions', 'التفاعلات')} value={post.measured ? compact(post.interactions) : '—'} />
        <Stat label={t('Rate', 'المعدل')} value={pct(post.engagementRate, 1)} />
      </span>
    </button>
  );
}

/** "Organic" or "Paid" on a post. */
export function KindBadge({ post }: { post: Post }) {
  const { t, tx } = useI18n();
  const by = post.reachKindBy === 'manual' ? t('Marked by hand', 'متحدد يدويًا') : post.reachKindBy === 'unknown' ? t('The platform does not say; counted as organic', 'المنصة مش بتقول؛ محسوب أورجانيك') : t('As reported by the platform', 'حسب المنصة');
  return (
    <span className={`an-kind an-kind--${post.reachKind}`} title={by}>
      {tx(REACH_LABEL[post.reachKind])}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="an-stat">
      <b className="u-tnum">{value}</b>
      <small>{label}</small>
    </span>
  );
}

const METRICS: { key: keyof Metrics; en: string; ar: string }[] = [
  { key: 'reach', en: 'Reach', ar: 'الوصول' },
  { key: 'views', en: 'Views', ar: 'المشاهدات' },
  { key: 'impressions', en: 'Impressions', ar: 'مرات الظهور' },
  { key: 'likes', en: 'Likes', ar: 'إعجابات' },
  { key: 'comments', en: 'Comments', ar: 'تعليقات' },
  { key: 'shares', en: 'Shares', ar: 'مشاركات' },
  { key: 'saves', en: 'Saves', ar: 'حفظ' },
  { key: 'clicks', en: 'Clicks', ar: 'نقرات' },
];

export function PostDialog({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const { t, num, pct, date } = useI18n();
  const { store } = useLiveData();
  // Keep the last post on screen while the dialog animates out.
  const last = useRef(post);
  if (post) last.current = post;
  // The store's copy, so marking the post organic or paid shows at once after the reload.
  const shown = last.current ? (store.data.posts.find((item) => item.key === last.current!.key) ?? last.current) : null;
  if (!shown) return null;
  const figures = METRICS.filter((item) => shown.metrics[item.key] != null);
  return (
    <Dialog
      open={post != null}
      onClose={onClose}
      size="lg"
      title={t('Post details', 'تفاصيل المنشور')}
      description={`${channelName[shown.platform]} · ${shown.accountName || '—'} · ${date(shown.ts, 'dateTime')}`}
      footer={
        shown.permalink ? (
          <a className="ui-btn ui-btn--primary ui-btn--md" href={shown.permalink} target="_blank" rel="noreferrer noopener">
            <ExternalLink size={15} aria-hidden /> {t(`Open on ${channelName[shown.platform]}`, `افتح على ${channelName[shown.platform]}`)}
          </a>
        ) : undefined
      }
    >
      <div className="an-detail">
        <Thumb post={shown} large />
        <div className="an-detail__side">
          <p className="an-detail__caption" dir="auto">
            {shown.title || t('(no caption)', '(بدون نص)')}
          </p>
          <div className="an-detail__headline">
            <Stat label={t('Interactions', 'التفاعلات')} value={shown.measured ? num(shown.interactions) : '—'} />
            <Stat label={t('Engagement rate', 'معدل التفاعل')} value={pct(shown.engagementRate, 2)} />
          </div>
          <KindPanel post={shown} onSaved={store.reload} />
          {figures.length ? (
            <dl className="an-detail__figures">
              {figures.map((item) => (
                <div key={item.key}>
                  <dt>{t(item.en, item.ar)}</dt>
                  <dd className="u-tnum">{num(shown.metrics[item.key])}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="u-muted u-sm">{t('The platform has not returned numbers for this post yet.', 'المنصة لسه ما رجعتش أرقام للمنشور ده.')}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Organic or paid, who said so, the organic/paid split of the numbers, and a way to correct it by hand. */
function KindPanel({ post, onSaved }: { post: Post; onSaved: () => Promise<unknown> | void }) {
  const { t, num } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const promotion = post.promotion;
  const save = async (paid: boolean | null) => {
    setBusy(true);
    try {
      await api(`/api/posts/${encodeURIComponent(post.platform)}/${encodeURIComponent(post.externalId)}/promotion`, { method: 'PUT', body: { paid } });
      await onSaved();
    } catch (error) {
      toast.error(t('Not saved', 'ما اتحفظش'), errorMessage(error, t('Could not save the choice.', 'تعذّر حفظ الاختيار.')));
    } finally {
      setBusy(false);
    }
  };
  const split: { label: string; value: string }[] = [];
  if (promotion?.organicViews != null && promotion.paidViews != null) {
    split.push({ label: t('Organic views', 'مشاهدات أورجانيك'), value: num(promotion.organicViews) });
    split.push({ label: t('Views from ads', 'مشاهدات من الإعلانات'), value: num(promotion.paidViews) });
  }
  if (promotion?.adReach != null) split.push({ label: t('Reach from ads', 'الوصول من الإعلانات'), value: num(promotion.adReach) });
  if (promotion?.adImpressions != null) split.push({ label: t('Ad impressions', 'ظهور الإعلان'), value: num(promotion.adImpressions) });
  if (promotion?.adClicks != null) split.push({ label: t('Ad clicks', 'نقرات الإعلان'), value: num(promotion.adClicks) });
  if (promotion?.spend != null) split.push({ label: t('Spend', 'الصرف'), value: money(promotion.spend, promotion.currency) });
  const by = post.reachKindBy === 'manual' ? t('Marked by hand.', 'متحدد يدويًا.') : post.reachKindBy === 'unknown' ? t('The platform does not say whether money was spent, so it counts as organic. Mark it if that is wrong.', 'المنصة مش بتقول لو اتصرف عليه فلوس، فمحسوب أورجانيك. حدده لو ده غلط.') : t('As reported by the platform.', 'حسب المنصة.');
  return (
    <div className="an-detail__kind">
      <KindBadge post={post} />
      <span className="u-row">
        {post.reachKind === 'organic' ? (
          <Button size="sm" busy={busy} onClick={() => void save(true)}>{t('Mark as paid', 'حدده ممول')}</Button>
        ) : (
          <Button size="sm" busy={busy} onClick={() => void save(false)}>{t('Mark as organic', 'حدده أورجانيك')}</Button>
        )}
        {post.reachKindBy === 'manual' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(null)}>{t('Use the platform’s answer', 'رجّع لكلام المنصة')}</Button>
        )}
      </span>
      <small>{by}</small>
      {split.length > 0 && (
        <dl className="an-detail__figures">
          {split.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd className="u-tnum">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function PostTable({ posts, onOpen, empty }: { posts: Post[]; onOpen: (post: Post) => void; empty: ReactNode }) {
  const { t, compact, date, pct } = useI18n();
  // A column no post has a number for is only dashes; leave it out.
  const has = (key: 'reach' | 'views') => posts.some((post) => post.metrics[key] != null);
  const columns: Column<Post>[] = [
    {
      key: 'title',
      header: t('Post', 'المنشور'),
      cell: (post) => (
        <div className="an-cell">
          <Thumb post={post} />
          <span className="an-cell__text">
            <span className="u-truncate" dir="auto">
              {post.title || t('(no caption)', '(بدون نص)')}
            </span>
            <small className="u-muted">{post.accountName || channelName[post.platform]}</small>
          </span>
        </div>
      ),
    },
    { key: 'date', header: t('Published', 'تاريخ النشر'), sort: (post) => post.ts, cell: (post) => <span className="u-tnum u-sm">{date(post.ts, 'dayShort')}</span> },
    { key: 'kind', header: t('Organic / paid', 'أورجانيك / ممول'), sort: (post) => (post.reachKind === 'paid' ? 1 : 0), cell: (post) => <KindBadge post={post} /> },
    ...(has('reach') ? [{ key: 'reach', header: t('Reach', 'الوصول'), align: 'end' as const, sort: (post: Post) => post.metrics.reach, cell: (post: Post) => <span className="u-tnum">{compact(post.metrics.reach)}</span> }] : []),
    ...(has('views') ? [{ key: 'views', header: t('Views', 'المشاهدات'), align: 'end' as const, sort: (post: Post) => post.metrics.views, cell: (post: Post) => <span className="u-tnum">{compact(post.metrics.views)}</span> }] : []),
    { key: 'interactions', header: t('Interactions', 'التفاعلات'), align: 'end', sort: (post) => (post.measured ? post.interactions : null), cell: (post) => <span className="u-tnum">{post.measured ? compact(post.interactions) : '—'}</span> },
    { key: 'rate', header: t('Rate', 'المعدل'), align: 'end', sort: (post) => post.engagementRate, cell: (post) => <span className="u-tnum">{pct(post.engagementRate, 1)}</span>, secondary: true },
    ...(posts.some((post) => post.promotion?.spend != null)
      ? [{ key: 'spend', header: t('Spend', 'الصرف'), align: 'end' as const, sort: (post: Post) => post.promotion?.spend ?? null, cell: (post: Post) => <span className="u-tnum">{post.promotion?.spend != null ? money(post.promotion.spend, post.promotion.currency) : '—'}</span>, secondary: true }]
      : []),
  ];
  return (
    <DataTable
      caption={t('Posts', 'المنشورات')}
      rows={posts}
      columns={columns}
      rowKey={(post) => post.key}
      onRowClick={onOpen}
      rowLabel={(post) => post.title || t('Post', 'منشور')}
      pageSize={25}
      initialSort={{ key: 'date', dir: 'desc' }}
      dense
      empty={empty}
    />
  );
}
