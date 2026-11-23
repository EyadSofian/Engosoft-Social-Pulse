import { ClampText } from '../../components/ui/ClampText';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Clock, ExternalLink, Lightbulb, RefreshCw, TrendingDown, TrendingUp, TriangleAlert, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQueryState } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { EmptyState, SkeletonRows } from '../../components/feedback/States';
import { useToast } from '../../components/feedback/Toast';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Tabs';
import type { Channel } from '../../domain/shared';
import { PushCard } from '../../features/notifications/PushCard';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { markServerRead, useServerNotifications } from '../../shell/serverNotifications';
import { usePageMeta } from '../../shell/ShellContext';

interface InsightPost { platform: Channel; title: string; permalink: string; thumbnail: string; publishedAt: string; contentType: string; interactions: number | null; reach: number | null; ratio: number | null }
interface Insight {
  id: string; key: string; kind: 'insight_daily' | 'insight_best' | 'insight_alert' | 'insight_tip' | 'insight_idea'; title: string; body: string; image: string | null; createdAt: string;
  detail: { stats?: { label: string; value: string; tone?: 'up' | 'down' | 'neutral' }[]; posts?: InsightPost[]; points?: string[]; action?: { label: string; to: string } };
}

const FILTERS = ['all', 'alerts', 'best', 'ideas'] as const;
type Filter = (typeof FILTERS)[number];
const inFilter = (item: Insight, filter: Filter) =>
  filter === 'all' || (filter === 'alerts' && item.kind === 'insight_alert') || (filter === 'best' && item.kind === 'insight_best') || (filter === 'ideas' && (item.kind === 'insight_idea' || item.kind === 'insight_tip'));

function kindOf(item: Insight): { icon: LucideIcon; label: string; tone: string } {
  if (item.kind === 'insight_daily') return { icon: CalendarCheck, label: 'ملخص يومي', tone: 'brand' };
  if (item.kind === 'insight_best') return { icon: Trophy, label: 'أفضل بوست', tone: 'accent' };
  if (item.kind === 'insight_tip') return { icon: Clock, label: 'نصيحة', tone: 'info' };
  if (item.kind === 'insight_idea') return { icon: Lightbulb, label: 'فكرة', tone: 'violet' };
  if (item.key.startsWith('trend:up')) return { icon: TrendingUp, label: 'زيادة', tone: 'success' };
  if (item.key.startsWith('trend:down')) return { icon: TrendingDown, label: 'نقص', tone: 'danger' };
  return { icon: TriangleAlert, label: 'تنبيه', tone: 'warning' };
}

const DAY_FORMAT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
const TIME_FORMAT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
function dayLabel(iso: string) {
  const day = new Date(iso); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  return diff === 0 ? 'النهارده' : diff === 1 ? 'امبارح' : DAY_FORMAT.format(day);
}
const num = (n: number | null) => (n == null ? '—' : n >= 10_000 ? `${+(n / 1000).toFixed(1)} ألف` : Math.round(n).toLocaleString('en-US'));

/**
 * The performance notifications in one feed: what the phone notification said, with the numbers behind it, the posts
 * it is about, and one next step. A notification opens its own card here (?id=).
 */
export function InsightsPage() {
  usePageMeta('ملخص الأداء', [{ label: 'ملخص الأداء' }]);
  const toast = useToast();
  const [query, setQuery] = useQueryState();
  const focusId = query.get('id');
  const filter = (FILTERS as readonly string[]).includes(query.get('show') ?? '') ? (query.get('show') as Filter) : 'all';
  const [items, setItems] = useState<Insight[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api<{ items: Insight[] }>('/api/insights?limit=80')).items); setError(''); }
    catch (e) { setError(errorMessage(e, 'تعذّر تحميل الصفحة.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Opening the page reads its notifications, so the dot on «الأداء» clears.
  const { items: notifications } = useServerNotifications();
  const unread = notifications.filter((n) => n.kind.startsWith('insight_') && !n.readAt).map((n) => n.id);
  useEffect(() => { if (unread.length) void markServerRead(unread); }, [unread.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async () => {
    setBusy(true);
    try {
      const { sent } = await api<{ sent: number }>('/api/insights/run', { body: {} });
      await load();
      toast.success(sent ? `${sent} تنبيهات جديدة` : 'مفيش جديد دلوقتي', sent ? undefined : 'كل تنبيه بيتبعت مرة واحدة في يومه أو أسبوعه.');
    } catch (e) { toast.error('تعذّر التحليل', errorMessage(e, '')); }
    finally { setBusy(false); }
  };

  const groups = useMemo(() => {
    const out: { label: string; items: Insight[] }[] = [];
    for (const item of (items ?? []).filter((i) => inFilter(i, filter))) {
      const label = dayLabel(item.createdAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [items, filter]);

  return (
    <>
      <PageHeader
        title="ملخص الأداء"
        description="كل يوم الصبح: ملخص امبارح وأفضل بوست، وتنبيه لو التفاعل اتغيّر أو فيه أيام أو منصات النشر فيها ضعيف، ونصايح وأفكار."
        actions={<Button icon={<RefreshCw size={15} />} busy={busy} onClick={() => void check()}>شوف الجديد</Button>}
      />
      <PushCard compact />
      <Segmented
        label="عرض"
        value={filter}
        onChange={(value) => setQuery({ show: value === 'all' ? null : value })}
        items={[
          { value: 'all', label: 'الكل' },
          { value: 'alerts', label: 'تنبيهات' },
          { value: 'best', label: 'أفضل بوست' },
          { value: 'ideas', label: 'نصايح وأفكار' },
        ]}
      />
      {error ? (
        <EmptyState icon={<TriangleAlert size={20} />} title={error} action={<Button onClick={() => void load()}>حاول تاني</Button>} />
      ) : !items ? (
        <SkeletonRows rows={5} />
      ) : !groups.length ? (
        <EmptyState
          icon={<CalendarCheck size={22} />}
          title={filter === 'all' ? 'لسه مفيش ملخصات' : 'مفيش حاجة هنا لسه'}
          text="أول ملخص بيوصل الساعة 9 الصبح من البوستات اللي على الحسابات المربوطة. دوس «شوف الجديد» لو عاوز تجرّب دلوقتي."
        />
      ) : (
        <div className="ins-feed">
          {groups.map((group) => (
            <section key={group.label} className="ins-day">
              <h2 className="ins-day__label">{group.label}</h2>
              {group.items.map((item) => <InsightCard key={item.id} item={item} focused={item.id === focusId} />)}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function InsightCard({ item, focused }: { item: Insight; focused: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const meta = kindOf(item);
  const Icon = meta.icon;
  const { stats, posts, points, action } = item.detail;
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focused]);
  const external = action?.to.startsWith('http');
  const [allPoints, setAllPoints] = useState(false);
  const shownPoints = points && !allPoints ? points.slice(0, 2) : points;
  return (
    <article ref={ref} className="ins-card" data-tone={meta.tone} data-focused={focused || undefined}>
      <header className="ins-card__head">
        <span className="ins-card__icon"><Icon size={17} /></span>
        <span className="ins-card__kind">{meta.label}</span>
        <time className="ins-card__time" dateTime={item.createdAt}>{TIME_FORMAT.format(new Date(item.createdAt))}</time>
      </header>
      <h3 className="ins-card__title" dir="auto">{item.title}</h3>
      <ClampText text={item.body} lines={2} className="ins-card__body" />
      {stats?.length ? (
        <dl className="ins-stats">
          {stats.map((s) => (
            <div key={s.label} data-tone={s.tone}><dt>{s.label}</dt><dd className="u-tnum">{s.value}</dd></div>
          ))}
        </dl>
      ) : null}
      {posts?.length ? (
        <ul className="ins-posts">
          {posts.slice(0, 5).map((p, i) => (
            <li key={`${p.permalink}-${i}`}>
              <a className="ins-post" href={p.permalink || undefined} target="_blank" rel="noreferrer">
                {p.thumbnail ? <img src={p.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ins-post__blank" />}
                <span className="ins-post__main">
                  <b dir="auto">{p.title}</b>
                  <small><ChannelIcon channel={p.platform} size={13} /> {num(p.interactions)} تفاعل · {num(p.reach)} وصول</small>
                </span>
                {p.ratio != null && <span className="ins-post__ratio u-tnum" data-up={p.ratio >= 1 || undefined}>{p.ratio >= 10 ? Math.round(p.ratio) : p.ratio.toFixed(1)}×</span>}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {shownPoints?.length ? <ul className="ins-points">{shownPoints.map((point) => <li key={point} dir="auto">{point}</li>)}</ul> : null}
      {points && points.length > 2 && <button type="button" className="clamp-text__more ins-card__more" onClick={() => setAllPoints(!allPoints)} aria-expanded={allPoints}>{allPoints ? 'اعرض أقل' : `${points.length - 2} أفكار كمان`}</button>}
      {action && (
        <div className="ins-card__action">
          {external ? (
            <a className="ui-btn ui-btn--secondary ui-btn--sm" href={action.to} target="_blank" rel="noreferrer">{action.label}<ExternalLink size={14} /></a>
          ) : (
            <ButtonLink size="sm" to={action.to}>{action.label}</ButtonLink>
          )}
        </div>
      )}
    </article>
  );
}
