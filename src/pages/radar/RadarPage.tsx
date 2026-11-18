import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ExternalLink, Lightbulb, Play, RefreshCw, Users, WandSparkles } from 'lucide-react';
import { useQueryState } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { EmptyState, SkeletonRows } from '../../components/feedback/States';
import { FilterSelect } from '../../components/forms/Field';
import { Dialog } from '../../components/overlay/Overlay';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Tabs';
import { useAuth } from '../../features/auth/AuthProvider';
import { useCreateContent } from '../../features/content/CreateContent';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import {
  CATEGORY, DIALECT, FORMAT, LESSON, LEVEL, LEVEL_TONE, PLATFORM_NAME, PURPOSE, RADAR_PLATFORMS, byStrength,
  type Agenda, type BriefIdea, type RadarData, type RadarPlatform, type RadarPost,
} from './model';

const PERIODS = ['7', '30', '60'] as const;
type PeriodValue = (typeof PERIODS)[number];
const RIYADH_TIME = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' });
const RIYADH_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' });

/**
 * Competitors: every morning the server reads Engineering Tracks, Bakkah and ILTC and writes a short brief.
 * The page reads top to bottom: today's summary, ideas for us beside today's lectures and coming Odoo events,
 * each competitor at a glance, their best posts, then every post on demand.
 */
export function RadarPage() {
  const { t, relative } = useI18n();
  const { can } = useAuth();
  const [query, setQuery] = useQueryState();
  const days = (PERIODS as readonly string[]).includes(query.get('days') ?? '') ? (query.get('days') as PeriodValue) : '30';
  const [data, setData] = useState<RadarData | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  usePageMeta(t('Competitors', 'متابعة المنافسين'), [{ label: t('Competitors', 'متابعة المنافسين') }]);

  const load = useCallback(async () => {
    try { setData(await api<RadarData>(`/api/radar?days=${days}`)); setError(''); }
    catch (e) { setError(errorMessage(e, t('Could not load the page.', 'تعذّر تحميل الصفحة.'))); }
  }, [days, t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!data?.running) return;
    const timer = window.setInterval(() => { void load(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [data?.running, load]);

  const run = async () => {
    setStarting(true);
    try { await api('/api/radar/run', { method: 'POST', body: {} }); await load(); }
    catch (e) { setError(errorMessage(e, t('Could not start the update.', 'تعذّر بدء التحديث.'))); }
    finally { setStarting(false); }
  };

  const posts = data?.posts ?? [];
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  const nameOf = useCallback((id: string) => { const c = data?.competitors.find((x) => x.id === id); return c ? t(c.name, c.nameAr) : id; }, [data, t]);
  const lastRun = data?.runs.find((r) => r.status !== 'running');
  const open = openId ? byId.get(openId) ?? null : null;
  const runNote = lastRun?.message.replace('[weekly]', '').trim();

  return (
    <div className="u-stack cw">
      <PageHeader
        title={t('Competitors', 'متابعة المنافسين')}
        description={t('Engineering Tracks, Bakkah and ILTC, read every morning, with post ideas for us.', 'بنتابع إنجنيرنج تراكس وبكة والتعليم المتكامل كل يوم الصبح، ونطلع منهم بأفكار بوستات لينا.')}
        actions={can('connections.manage') && data?.configured ? (
          <Button icon={data.running ? <RefreshCw size={15} className="cw-spin" /> : <Play size={15} />} onClick={() => void run()} disabled={data.running || starting} busy={starting}>
            {data.running ? t('Updating…', 'بنحدّث…') : t('Update now', 'حدّث دلوقتي')}
          </Button>
        ) : undefined}
      />

      <div className="cw-bar">
        <Segmented label={t('Period', 'الفترة')} value={days} onChange={(value) => setQuery({ days: value === '30' ? null : value })}
          items={PERIODS.map((value) => ({ value, label: t(`${value} days`, `آخر ${value} يوم`) }))} />
        {data && (
          <span className="cw-bar__meta" title={runNote || undefined}>
            {lastRun ? t(`Updated ${relative(lastRun.finishedAt || lastRun.startedAt)}`, `اتحدّث ${relative(lastRun.finishedAt || lastRun.startedAt)}`) : t('Not updated yet', 'لسه ما اتحدّثش')}
            {can('connections.manage') && <> · {t(`this month $${data.spentUsd} of $${data.budgetUsd}`, `تكلفة الشهر ${data.spentUsd}$ من ${data.budgetUsd}$`)}</>}
            {runNote ? <> · <span className="cw-bar__warn">{t('some sources did not answer', 'في مصادر ماردّتش')}</span></> : null}
          </span>
        )}
      </div>

      {error && <p className="cw-error" role="alert">{error}</p>}
      {!data && !error && <Card><CardBody><SkeletonRows rows={6} /></CardBody></Card>}
      {data && !posts.length && !data.running && (
        <Card><CardBody>
          <EmptyState icon={<Users size={22} />} title={data.configured ? t('No posts yet', 'لسه مفيش بوستات') : t('Not set up yet', 'لسه متفعّلتش')}
            text={data.configured ? t('The first update runs after 7:00 Riyadh, or update now.', 'أول تحديث بيحصل بعد 7 الصبح بتوقيت السعودية، أو دوس «حدّث دلوقتي».') : t('Add APIFY_API_TOKEN on the server.', 'محتاجين APIFY_API_TOKEN على الخادم.')} />
        </CardBody></Card>
      )}

      {data && posts.length > 0 && (
        <>
          <Summary data={data} byId={byId} onOpen={setOpenId} />
          <div className="cw-split">
            <Ideas data={data} byId={byId} onOpen={setOpenId} />
            <OdooAgenda agenda={data.agenda} />
          </div>
          <Competitors data={data} onOpen={setOpenId} />
          <BestPosts posts={posts} nameOf={nameOf} onOpen={setOpenId} />
          <AllPosts posts={posts} data={data} nameOf={nameOf} onOpen={setOpenId} />
        </>
      )}
      {data && !posts.length && <OdooAgenda agenda={data.agenda} />}

      <Dialog open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? nameOf(open.competitorId) : ''} size="lg">
        {open && <PostDetail post={open} />}
      </Dialog>
    </div>
  );
}

/* ── Today's summary ────────────────────────────────────────────────── */

function Summary({ data, byId, onOpen }: { data: RadarData; byId: Map<string, RadarPost>; onOpen: (id: string) => void }) {
  const { t, date } = useI18n();
  const [more, setMore] = useState(false);
  const brief = data.brief?.brief;
  if (!brief) return null;
  const points = more ? brief.insights : brief.insights.slice(0, 3);
  return (
    <Card className="cw-summary">
      <CardBody>
        <p className="cw-summary__date">{t("Today's summary", 'ملخص النهارده')} · {date(data.brief!.createdAt, 'day')}</p>
        {brief.headline && <h2 className="cw-summary__headline" dir="auto">{brief.headline}</h2>}
        {brief.alerts.length > 0 && (
          <ul className="cw-alerts">
            {brief.alerts.map((a, i) => (
              <li key={i} className={`cw-alert cw-alert--${a.kind}`}>
                <span dir="auto">{a.text}</span>
                {a.postId && byId.has(a.postId) && <button type="button" className="cw-link" onClick={() => onOpen(a.postId!)}>{t('See it', 'شوفه')}</button>}
              </li>
            ))}
          </ul>
        )}
        {points.length > 0 && (
          <ul className="cw-points">
            {points.map((p, i) => (
              <li key={i}>
                <span dir="auto">{p.text}</span>
                {p.evidence[0] && byId.has(p.evidence[0]) && <button type="button" className="cw-link" onClick={() => onOpen(p.evidence[0])}>{t('Example', 'مثال')}</button>}
              </li>
            ))}
          </ul>
        )}
        {brief.insights.length > 3 && (
          <button type="button" className="cw-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            {more ? t('Less', 'أقل') : t(`${brief.insights.length - 3} more`, `${brief.insights.length - 3} ملاحظات كمان`)} <ChevronDown size={14} className={more ? 'cw-flip' : ''} aria-hidden />
          </button>
        )}
      </CardBody>
    </Card>
  );
}

/* ── Ideas for us ───────────────────────────────────────────────────── */

function Ideas({ data, byId, onOpen }: { data: RadarData; byId: Map<string, RadarPost>; onOpen: (id: string) => void }) {
  const { t, tx, date } = useI18n();
  const { open } = useCreateContent();
  const ideas = data.brief?.brief.ideas ?? [];
  const make = (idea: BriefIdea) => open({ title: idea.title, caption: `${idea.idea}${idea.course ? `\n${idea.course}` : ''}`, channels: [idea.platform] });
  return (
    <Card className="cw-ideas">
      <CardHeader icon={<Lightbulb size={16} />} title={t('Post ideas for us', 'أفكار بوستات لينا')} count={ideas.length || undefined} />
      {ideas.length ? (
        <ol className="cw-ideas__list">
          {ideas.map((idea, i) => (
            <li key={i} className="cw-idea">
              <div className="cw-idea__main">
                <h3 className="cw-idea__title" dir="auto"><ChannelIcon channel={idea.platform} size={15} /> {idea.title}</h3>
                <p className="cw-idea__text" dir="auto">{idea.idea}</p>
                <p className="cw-idea__meta">
                  <span>{tx(PLATFORM_NAME[idea.platform])} · {tx(FORMAT[idea.format] ?? { en: idea.format, ar: idea.format })}</span>
                  {idea.course && <span>· <bdi>{idea.course}</bdi></span>}
                  {idea.suggestedDate && <span>· {t('post on', 'ينزل يوم')} {date(idea.suggestedDate, 'day')}</span>}
                  {idea.evidence[0] && byId.has(idea.evidence[0]) && <button type="button" className="cw-link" onClick={() => onOpen(idea.evidence[0])}>{t('inspired by', 'مستوحاة من')}</button>}
                </p>
              </div>
              <Button size="sm" variant="secondary" icon={<WandSparkles size={14} />} onClick={() => make(idea)}>{t('Make it', 'اعمله')}</Button>
            </li>
          ))}
        </ol>
      ) : <CardBody><p className="cw-muted">{t('Ideas appear with the next update.', 'الأفكار بتظهر مع التحديث الجاي.')}</p></CardBody>}
    </Card>
  );
}

/* ── Odoo: today's lectures and coming events ───────────────────────── */

function OdooAgenda({ agenda }: { agenda: Agenda }) {
  const { t, date } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));
  const cap = (key: string, n: number) => (expanded[key] ? Infinity : n);
  const today = RIYADH_DAY.format(new Date());
  const day = (iso: string) => RIYADH_DAY.format(new Date(iso));
  const groups = [
    { key: 'today', label: t('Lectures today', 'محاضرات النهارده'), items: agenda.lectures.filter((l) => day(l.startsAt) === today), max: 6 },
    { key: 'tomorrow', label: t('Lectures tomorrow', 'محاضرات بكرة'), items: agenda.lectures.filter((l) => day(l.startsAt) !== today), max: 3 },
  ];
  const webinars = agenda.events.filter((e) => e.webinar);
  const runs = agenda.events.filter((e) => !e.webinar);

  return (
    <Card className="cw-agenda">
      <CardHeader icon={<CalendarDays size={16} />} title={t('In Odoo', 'في Odoo')} description={t('Saudi time', 'بتوقيت السعودية')} />
      <CardBody>
        {agenda.status !== 'connected' ? <p className="cw-muted">{t('Odoo is not reachable right now.', 'Odoo مش متاح دلوقتي.')}</p> : (
          <div className="cw-agenda__body">
            {groups.map((g) => (
              <section key={g.key}>
                <h3 className="cw-agenda__h">{g.label} <span className="cw-count">{g.items.length}</span></h3>
                {g.items.length ? (
                  <ul className="cw-agenda__list">
                    {g.items.slice(0, cap(g.key, g.max)).map((l) => (
                      <li key={l.id}><span className="cw-time u-tnum">{RIYADH_TIME.format(new Date(l.startsAt))}</span><bdi className="cw-agenda__name" title={l.title}>{l.course}</bdi></li>
                    ))}
                  </ul>
                ) : <p className="cw-muted">{t('No lectures.', 'مفيش محاضرات.')}</p>}
                {g.items.length > g.max && <MoreButton open={Boolean(expanded[g.key])} total={g.items.length} onClick={() => toggle(g.key)} />}
              </section>
            ))}
            <section>
              <h3 className="cw-agenda__h">{t('Webinars and seminars', 'ويبنارات وندوات')} <span className="cw-count">{webinars.length}</span></h3>
              {webinars.length ? (
                <ul className="cw-agenda__list">
                  {webinars.map((e) => <li key={e.id}><span className="cw-time">{date(e.startsAt, 'dayShort')}</span><bdi className="cw-agenda__name">{e.title}</bdi></li>)}
                </ul>
              ) : <p className="cw-agenda__warn">{t('None booked in the next 30 days.', 'مفيش ولا واحد متسجّل في الـ 30 يوم الجاية.')}</p>}
            </section>
            <section>
              <h3 className="cw-agenda__h">{t('Courses starting', 'كورسات بتبدأ')} <span className="cw-count">{runs.length}</span></h3>
              <ul className="cw-agenda__list">
                {runs.slice(0, cap('runs', 4)).map((e) => <li key={e.id}><span className="cw-time">{date(e.startsAt, 'dayShort')}</span><bdi className="cw-agenda__name">{e.title.replace(/\s*[-–]?\s*\d{3,}\s*$/, '')}</bdi></li>)}
              </ul>
              {runs.length > 4 && <MoreButton open={Boolean(expanded.runs)} total={runs.length} onClick={() => toggle('runs')} />}
            </section>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function MoreButton({ open, total, onClick }: { open: boolean; total: number; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="cw-more" onClick={onClick} aria-expanded={open}>
      {open ? t('Less', 'أقل') : t(`All ${total}`, `الكل (${total})`)} <ChevronDown size={14} className={open ? 'cw-flip' : ''} aria-hidden />
    </button>
  );
}

/* ── Each competitor at a glance ────────────────────────────────────── */

function Competitors({ data, onOpen }: { data: RadarData; onOpen: (id: string) => void }) {
  const { t, tx, num, compact } = useI18n();
  const ours = data.metrics.ours.some((o) => o.posts);
  return (
    <section className="cw-section">
      <header className="cw-section__head">
        <h2>{t('How each one is doing', 'كل منافس عامل إزاي')}</h2>
        <p>{t(`Usual interactions per post in the last ${data.metrics.windowDays} days (reactions, comments and shares).`, `التفاعل المعتاد للبوست في آخر ${data.metrics.windowDays} يوم (إعجاب وتعليق ومشاركة).`)}</p>
      </header>
      <div className="cw-rivals">
        {ours && (
          <article className="cw-rival cw-rival--ours">
            <h3>{t('Us (Engosoft)', 'إحنا (إنجوسوفت)')}</h3>
            <ul>
              {RADAR_PLATFORMS.map((p) => {
                const o = data.metrics.ours.find((x) => x.platform === p);
                return <li key={p}><span className="cw-rival__pf"><ChannelIcon channel={p} size={14} />{tx(PLATFORM_NAME[p])}</span><b className="u-tnum">{num(o?.medianInteractions)}</b><small>{o?.posts ? t(`${o.perWeek}/wk`, `${o.perWeek} في الأسبوع`) : '—'}</small></li>;
              })}
            </ul>
          </article>
        )}
        {data.competitors.map((c) => {
          const rows = RADAR_PLATFORMS.map((p) => ({ p, a: data.metrics.accounts.find((x) => x.competitorId === c.id && x.platform === p) }));
          const best = rows.flatMap((r) => (r.a?.best ? [r.a.best] : [])).sort((a, b) => b.interactions - a.interactions)[0];
          const sales = rows.flatMap((r) => (r.a?.salesShare != null && r.a.posts ? [{ share: r.a.salesShare, n: r.a.posts }] : []));
          const salesShare = sales.length ? Math.round(sales.reduce((s, x) => s + x.share * x.n, 0) / sales.reduce((s, x) => s + x.n, 0)) : null;
          return (
            <article key={c.id} className="cw-rival">
              <h3>{t(c.name, c.nameAr)}</h3>
              <ul>
                {rows.map(({ p, a }) => (
                  <li key={p}>
                    <span className="cw-rival__pf"><ChannelIcon channel={p} size={14} />{tx(PLATFORM_NAME[p])}</span>
                    <b className="u-tnum">{a?.posts ? num(a.medianInteractions) : '—'}</b>
                    <small>{a?.posts ? t(`${a.perWeek}/wk`, `${a.perWeek} في الأسبوع`) : a?.lastPostAt ? t('quiet', 'ساكت') : '—'}{a?.followers != null ? ` · ${compact(a.followers)} ${t('followers', 'متابع')}` : ''}</small>
                  </li>
                ))}
              </ul>
              <footer>
                {salesShare != null && <span>{t(`${salesShare}% selling posts`, `${salesShare}% من بوستاتهم بيع`)}</span>}
                {best && <button type="button" className="cw-link" onClick={() => onOpen(best.id)}>{t(`best post: ${best.interactions}`, `أحسن بوست: ${best.interactions} تفاعل`)}</button>}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ── Posts ──────────────────────────────────────────────────────────── */

function BestPosts({ posts, nameOf, onOpen }: { posts: RadarPost[]; nameOf: (id: string) => string; onOpen: (id: string) => void }) {
  const { t, tx, num, date } = useI18n();
  const top = [...posts].filter((p) => p.level === 'breakout' || p.level === 'high').sort(byStrength).slice(0, 6);
  if (!top.length) return null;
  return (
    <section className="cw-section">
      <header className="cw-section__head">
        <h2>{t('Their best posts', 'أحسن بوستاتهم')}</h2>
        <p>{t('Posts well above what the same account usually gets.', 'بوستات جابت أكتر بكتير من المعتاد بتاع نفس الحساب.')}</p>
      </header>
      <div className="cw-posts">
        {top.map((p) => (
          <button key={p.id} type="button" className="cw-post" onClick={() => onOpen(p.id)}>
            <span className="cw-post__pic">
              {p.picture ? <img src={p.picture} alt="" loading="lazy" /> : <ChannelIcon channel={p.platform} size={26} />}
            </span>
            <span className="cw-post__body">
              <span className="cw-post__who"><ChannelIcon channel={p.platform} size={13} /> {nameOf(p.competitorId)} · {date(p.postedAt, 'dayShort')}</span>
              <span className="cw-post__nums"><b className="u-tnum">{num(p.interactions)}</b> {t('interactions', 'تفاعل')} <span className="cw-muted">· {t('usual', 'المعتاد')} {num(p.groupMedian)}</span> {p.level && <Badge tone={LEVEL_TONE[p.level]}>{tx(LEVEL[p.level])}</Badge>}</span>
              {p.analysis && <span className="cw-post__idea" dir="auto">{p.analysis.idea}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AllPosts({ posts, data, nameOf, onOpen }: { posts: RadarPost[]; data: RadarData; nameOf: (id: string) => string; onOpen: (id: string) => void }) {
  const { t, tx, num, date } = useI18n();
  const [competitor, setCompetitor] = useState<string>('all');
  const [platform, setPlatform] = useState<RadarPlatform | 'all'>('all');
  const [all, setAll] = useState(false);
  const list = posts.filter((p) => (competitor === 'all' || p.competitorId === competitor) && (platform === 'all' || p.platform === platform)).sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const shown = all ? list : list.slice(0, 10);
  return (
    <Card flush className="cw-all">
      <CardHeader title={t('Every post', 'كل البوستات')} count={list.length}
        actions={<div className="cw-filters">
          <FilterSelect label={t('Competitor', 'المنافس')} value={competitor} onChange={setCompetitor} allLabel={t('All', 'الكل')} options={data.competitors.map((c) => ({ value: c.id, label: t(c.name, c.nameAr) }))} />
          <FilterSelect label={t('Platform', 'المنصة')} value={platform} onChange={setPlatform} allLabel={t('All', 'الكل')} options={RADAR_PLATFORMS.map((p) => ({ value: p, label: tx(PLATFORM_NAME[p]) }))} />
        </div>} />
      <ul className="cw-rows">
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" className="cw-row" onClick={() => onOpen(p.id)}>
              {p.picture ? <img src={p.picture} alt="" loading="lazy" /> : <span className="cw-row__nopic"><ChannelIcon channel={p.platform} size={14} /></span>}
              <span className="cw-row__main">
                <span className="cw-row__who"><ChannelIcon channel={p.platform} size={12} /> {nameOf(p.competitorId)} · {date(p.postedAt, 'dayShort')}</span>
                <span className="cw-row__idea" dir="auto">{p.analysis?.idea ?? p.text.slice(0, 140)}</span>
              </span>
              <span className="cw-row__num"><b className="u-tnum">{num(p.interactions)}</b>{p.level && <Badge tone={LEVEL_TONE[p.level]}>{tx(LEVEL[p.level])}</Badge>}</span>
            </button>
          </li>
        ))}
      </ul>
      {list.length > 10 && <div className="cw-all__foot"><button type="button" className="cw-more" onClick={() => setAll((v) => !v)}>{all ? t('Show less', 'عرض أقل') : t(`Show all ${list.length}`, `عرض الكل (${list.length})`)}</button></div>}
    </Card>
  );
}

function PostDetail({ post }: { post: RadarPost }) {
  const { t, tx, num, date } = useI18n();
  const a = post.analysis;
  return (
    <div className="cw-detail">
      <div className="cw-detail__media">
        {post.picture ? <img src={post.picture} alt="" /> : <span className="cw-detail__nopic"><ChannelIcon channel={post.platform} size={28} /></span>}
        <dl className="cw-detail__nums">
          <div><dt>{t('Reactions', 'إعجاب')}</dt><dd className="u-tnum">{num(post.reactions)}</dd></div>
          <div><dt>{t('Comments', 'تعليق')}</dt><dd className="u-tnum">{num(post.comments)}</dd></div>
          <div><dt>{t('Shares', 'مشاركة')}</dt><dd className="u-tnum">{num(post.shares)}</dd></div>
          {post.views != null && <div><dt>{t('Views', 'مشاهدة')}</dt><dd className="u-tnum">{num(post.views)}</dd></div>}
        </dl>
        <p className="cw-muted">
          <ChannelIcon channel={post.platform} size={12} /> {tx(PLATFORM_NAME[post.platform])} · {date(post.postedAt)} · {t('usual for this account', 'المعتاد للحساب')} {num(post.groupMedian)} {post.level && <Badge tone={LEVEL_TONE[post.level]}>{tx(LEVEL[post.level])}</Badge>}
        </p>
        {post.url && <a className="cw-link" href={post.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={13} aria-hidden /> {t('Open on the platform', 'افتحه على المنصة')}</a>}
      </div>
      <div className="cw-detail__text">
        {a ? (
          <>
            <p className="cw-detail__tags">{tx(PURPOSE[a.purpose])} · {tx(CATEGORY[a.category])} · {tx(FORMAT[post.format] ?? { en: post.format, ar: post.format })} · {t('dialect', 'لهجة')} {tx(DIALECT[a.dialect])}{a.hasPrice ? ` · ${t('has a price or offer', 'فيه سعر أو عرض')}` : ''}</p>
            <h3>{t('The idea', 'الفكرة')}</h3><p dir="auto">{a.idea}</p>
            <h3>{t('Why it landed here', 'ليه وصل للمستوى ده')}</h3><p dir="auto">{a.why}</p>
            {a.lesson && <><h3>{t('For us', 'لينا')} <Badge tone={a.lessonKind === 'avoid' ? 'danger' : a.lessonKind === 'copy' ? 'success' : 'info'}>{tx(LESSON[a.lessonKind])}</Badge></h3><p dir="auto">{a.lesson}</p></>}
            <h3>{t('Design', 'التصميم')}</h3><p dir="auto">{a.design}</p>
          </>
        ) : <p className="cw-muted">{t('Not read yet.', 'لسه ما اتحللش.')}</p>}
        {post.text && <details className="cw-detail__caption"><summary>{t('Post text', 'نص البوست')}</summary><p dir="auto">{post.text}</p></details>}
      </div>
    </div>
  );
}
