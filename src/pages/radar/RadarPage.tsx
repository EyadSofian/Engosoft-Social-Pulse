import { ClampText } from '../../components/ui/ClampText';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, Image as ImageIcon, LayoutTemplate, Lightbulb, Play, RefreshCw, Trophy, Users } from 'lucide-react';
import { useQueryState, useRouter } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { EmptyState, SkeletonRows } from '../../components/feedback/States';
import { FilterSelect } from '../../components/forms/Field';
import { Dialog } from '../../components/overlay/Overlay';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Segmented, Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../features/auth/AuthProvider';
import { writeTemplateIdea } from '../../features/content/templateIdea';
import type { Channel } from '../../domain/shared';
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
const VIEWS = ['ideas', 'odoo', 'compare', 'posts'] as const;
type View = (typeof VIEWS)[number];
const RIYADH_TIME = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' });
const RIYADH_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' });

/** Opens Create on the ready templates with this idea written; the picked template makes the design and copy. */
function useMakeFromTemplate() {
  const { navigate } = useRouter();
  return useCallback((idea: string, channels?: Channel[]) => {
    writeTemplateIdea({ idea, channels });
    navigate(`/?idea=${Date.now()}`);
  }, [navigate]);
}

/**
 * Competitors: every morning the server reads Engineering Tracks, Bakkah and ILTC and writes a short brief.
 * A dark summary band on top, then four tabs: ideas for us, Odoo lectures and events, the comparison and the posts.
 */
export function RadarPage() {
  const { t, relative } = useI18n();
  const { can } = useAuth();
  const [query, setQuery] = useQueryState();
  const days = (PERIODS as readonly string[]).includes(query.get('days') ?? '') ? (query.get('days') as PeriodValue) : '30';
  const view = (VIEWS as readonly string[]).includes(query.get('view') ?? '') ? (query.get('view') as View) : 'ideas';
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
  const ideas = data?.brief?.brief.ideas ?? [];
  const lectures = data?.agenda.lectures.length ?? 0;

  return (
    <div className="u-stack cw">
      <PageHeader
        title={t('Competitors', 'متابعة المنافسين')}
        description={t('Engineering Tracks, Bakkah and ILTC, read every morning, with post ideas for us.', 'بنتابع إنجنيرنج تراكس وبكة والتعليم المتكامل كل يوم الصبح، ونطلع منهم بأفكار بوستات لينا.')}
        meta={data ? (
          <span title={runNote || undefined}>
            {lastRun ? t(`Updated ${relative(lastRun.finishedAt || lastRun.startedAt)}`, `اتحدّث ${relative(lastRun.finishedAt || lastRun.startedAt)}`) : t('Not updated yet', 'لسه ما اتحدّثش')}
            {can('connections.manage') && <> · {t(`this month $${data.spentUsd} of $${data.budgetUsd}`, `تكلفة الشهر ${data.spentUsd}$ من ${data.budgetUsd}$`)}</>}
            {runNote ? <> · <span className="cw-warn">{t('some sources did not answer', 'في مصادر ماردّتش')}</span></> : null}
          </span>
        ) : undefined}
        actions={can('connections.manage') && data?.configured ? (
          <Button icon={data.running ? <RefreshCw size={15} className="cw-spin" /> : <Play size={15} />} onClick={() => void run()} disabled={data.running || starting} busy={starting}>
            {data.running ? t('Updating…', 'بنحدّث…') : t('Update now', 'حدّث دلوقتي')}
          </Button>
        ) : undefined}
      />

      {error && <p className="cw-error" role="alert">{error}</p>}
      {!data && !error && <Card><CardBody><SkeletonRows rows={6} /></CardBody></Card>}

      {data && <Hero data={data} byId={byId} onOpen={setOpenId} />}

      {data && (
        <div className="cw-tabsbar">
          <Tabs label={t('Sections', 'الأقسام')} value={view} onChange={(value) => setQuery({ view: value === 'ideas' ? null : value })}
            items={[
              { value: 'ideas', label: t('Ideas for us', 'أفكار لينا'), icon: <Lightbulb size={15} />, count: ideas.length || undefined },
              { value: 'odoo', label: t('Lectures and events', 'محاضرات وفعاليات'), icon: <CalendarDays size={15} />, count: lectures || undefined },
              { value: 'compare', label: t('Comparison', 'المقارنة'), icon: <Trophy size={15} /> },
              { value: 'posts', label: t('Their posts', 'بوستاتهم'), icon: <ImageIcon size={15} />, count: posts.length || undefined },
            ]} />
          {(view === 'compare' || view === 'posts') && (
            <Segmented label={t('Period', 'الفترة')} value={days} onChange={(value) => setQuery({ days: value === '30' ? null : value })}
              items={PERIODS.map((value) => ({ value, label: t(`${value} days`, `${value} يوم`) }))} />
          )}
        </div>
      )}

      {data && view === 'ideas' && <IdeasView data={data} byId={byId} onOpen={setOpenId} />}
      {data && view === 'odoo' && <OdooView agenda={data.agenda} />}
      {data && view === 'compare' && (posts.length ? <Scoreboard data={data} onOpen={setOpenId} /> : <NoPosts data={data} />)}
      {data && view === 'posts' && (posts.length ? <PostsView posts={posts} data={data} nameOf={nameOf} onOpen={setOpenId} /> : <NoPosts data={data} />)}

      <Dialog open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? nameOf(open.competitorId) : ''} size="lg">
        {open && <PostDetail post={open} />}
      </Dialog>
    </div>
  );
}

function NoPosts({ data }: { data: RadarData }) {
  const { t } = useI18n();
  return (
    <Card><CardBody>
      <EmptyState icon={<Users size={22} />} title={data.configured ? t('No posts yet', 'لسه مفيش بوستات') : t('Not set up yet', 'لسه متفعّلتش')}
        text={data.configured ? t('The first update runs after 7:00 Riyadh, or update now.', 'أول تحديث بيحصل بعد 7 الصبح بتوقيت السعودية، أو دوس «حدّث دلوقتي».') : t('Add APIFY_API_TOKEN on the server.', 'محتاجين APIFY_API_TOKEN على الخادم.')} />
    </CardBody></Card>
  );
}

/* ── Summary band ───────────────────────────────────────────────────── */

function Hero({ data, byId, onOpen }: { data: RadarData; byId: Map<string, RadarPost>; onOpen: (id: string) => void }) {
  const { t, date, num } = useI18n();
  const brief = data.brief?.brief;
  const best = [...data.posts].filter((p) => p.interactions != null).sort((a, b) => (b.interactions ?? 0) - (a.interactions ?? 0))[0];
  const today = RIYADH_DAY.format(new Date());
  const todayLectures = data.agenda.lectures.filter((l) => RIYADH_DAY.format(new Date(l.startsAt)) === today).length;
  const stats = [
    { label: t('Posts read', 'بوست اتقرا'), value: num(data.posts.length) },
    { label: t('Strongest post', 'أقوى بوست (تفاعل)'), value: best ? num(best.interactions) : '—', onClick: best ? () => onOpen(best.id) : undefined },
    { label: t('Lectures today', 'محاضرة النهارده'), value: data.agenda.status === 'connected' ? num(todayLectures) : '—' },
  ];
  return (
    <section className="cw-hero" aria-label={t("Today's summary", 'ملخص النهارده')}>
      <div className="cw-hero__main">
        <p className="cw-hero__date">{t("Today's summary", 'ملخص النهارده')}{data.brief ? ` · ${date(data.brief.createdAt, 'day')}` : ''}</p>
        <h2 className="cw-hero__headline" dir="auto">{brief?.headline || t('The summary appears after the first update.', 'الملخص بيظهر بعد أول تحديث.')}</h2>
        {brief && brief.alerts.length > 0 && (
          <ul className="cw-hero__alerts">
            {brief.alerts.map((a, i) => (
              <li key={i} className={`cw-hero__alert cw-hero__alert--${a.kind}`}>
                {a.postId && byId.has(a.postId)
                  ? <button type="button" onClick={() => onOpen(a.postId!)} dir="auto">{a.text}</button>
                  : <span dir="auto">{a.text}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <dl className="cw-hero__stats">
        {stats.map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd className="u-tnum">{s.onClick ? <button type="button" onClick={s.onClick}>{s.value}</button> : s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ── Ideas for us ───────────────────────────────────────────────────── */

function IdeasView({ data, byId, onOpen }: { data: RadarData; byId: Map<string, RadarPost>; onOpen: (id: string) => void }) {
  const { t, tx, date } = useI18n();
  const make = useMakeFromTemplate();
  const brief = data.brief?.brief;
  const ideas = brief?.ideas ?? [];
  const ideaText = (idea: BriefIdea) => `${idea.title}\n${idea.idea}${idea.course ? `\nالكورس: ${idea.course}` : ''}`;
  return (
    <div className="cw-grid">
      <div className="cw-ideas">
        {ideas.length ? ideas.map((idea, i) => (
          <article key={i} className="cw-idea">
            <header className="cw-idea__head">
              <span className="cw-idea__num u-tnum">{i + 1}</span>
              <h3 dir="auto">{idea.title}</h3>
            </header>
            <div className="cw-idea__text"><ClampText text={idea.idea} lines={2} /></div>
            <div className="cw-idea__foot">
              <span className="cw-tag"><ChannelIcon channel={idea.platform} size={13} /> {tx(PLATFORM_NAME[idea.platform])} · {tx(FORMAT[idea.format] ?? { en: idea.format, ar: idea.format })}</span>
              {idea.course && <span className="cw-tag"><bdi>{idea.course}</bdi></span>}
              {idea.suggestedDate && <span className="cw-tag">{t('post on', 'ينزل')} {date(idea.suggestedDate, 'dayShort')}</span>}
              {idea.evidence[0] && byId.has(idea.evidence[0]) && <button type="button" className="cw-link" onClick={() => onOpen(idea.evidence[0])}>{t('inspired by', 'مستوحاة من بوست')}</button>}
              <Button size="sm" variant="primary" icon={<LayoutTemplate size={14} />} onClick={() => make(ideaText(idea), [idea.platform])}>{t('Pick a template', 'اختار قالب')}</Button>
            </div>
          </article>
        )) : <Card><CardBody><p className="cw-muted">{t('Ideas appear with the next update.', 'الأفكار بتظهر مع التحديث الجاي.')}</p></CardBody></Card>}
      </div>
      {brief && brief.insights.length > 0 && (
        <aside className="cw-notes">
          <h3>{t('What we noticed', 'اللي لاحظناه')}</h3>
          <ol>
            {brief.insights.map((p, i) => (
              <li key={i}>
                <ClampText text={p.text} lines={3} />
                {p.evidence[0] && byId.has(p.evidence[0]) && <button type="button" className="cw-link" onClick={() => onOpen(p.evidence[0])}>{t('Example', 'مثال')}</button>}
              </li>
            ))}
          </ol>
        </aside>
      )}
    </div>
  );
}

/* ── Odoo: lectures and events, each one a post ─────────────────────── */

function OdooView({ agenda }: { agenda: Agenda }) {
  const { t, date } = useI18n();
  const make = useMakeFromTemplate();
  if (agenda.status !== 'connected') return <Card><CardBody><p className="cw-muted">{t('Odoo is not reachable right now.', 'Odoo مش متاح دلوقتي.')}</p></CardBody></Card>;
  const today = RIYADH_DAY.format(new Date());
  const day = (iso: string) => RIYADH_DAY.format(new Date(iso));
  const todays = agenda.lectures.filter((l) => day(l.startsAt) === today);
  const tomorrows = agenda.lectures.filter((l) => day(l.startsAt) !== today);
  const webinars = agenda.events.filter((e) => e.webinar);
  const runs = agenda.events.filter((e) => !e.webinar);
  const lectureIdea = (course: string, iso: string, when: string) => `محاضرة ${course} ${when} الساعة ${RIYADH_TIME.format(new Date(iso))} بتوقيت السعودية. بوست من جوه المحاضرة: معلومة مفيدة من الشرح أو لقطة من المحاضرة، ودعوة للتسجيل في الدفعة الجاية.`;
  const runIdea = (title: string, iso: string) => `كورس ${title.replace(/\s*[-–]?\s*\d{3,}\s*$/, '')} بيبدأ يوم ${date(iso, 'day')}. بوست إعلان عن بداية الكورس ودعوة للتسجيل.`;
  const webinarIdea = (title: string, iso: string, url?: string) => `${title} يوم ${date(iso, 'day')}. دعوة للتسجيل${url ? ` من الرابط: ${url}` : ''}.`;
  const Column = ({ title, count, children, empty }: { title: string; count: number; children: React.ReactNode; empty: string }) => (
    <section className="cw-col">
      <header className="cw-col__head"><h3>{title}</h3><span className="cw-count u-tnum">{count}</span></header>
      {count ? <ul className="cw-col__list">{children}</ul> : <p className="cw-col__empty">{empty}</p>}
    </section>
  );
  const Row = ({ when, name, sub, onMake }: { when: string; name: string; sub?: string; onMake: () => void }) => (
    <li className="cw-item">
      <span className="cw-item__when u-tnum">{when}</span>
      <span className="cw-item__name"><bdi>{name}</bdi>{sub && <small>{sub}</small>}</span>
      <Button size="sm" variant="secondary" icon={<LayoutTemplate size={13} />} onClick={onMake}>{t('Post', 'بوست')}</Button>
    </li>
  );
  return (
    <div className="cw-cols">
      <Column title={t('Lectures today', 'محاضرات النهارده')} count={todays.length} empty={t('No lectures today.', 'مفيش محاضرات النهارده.')}>
        {todays.map((l) => <Row key={l.id} when={RIYADH_TIME.format(new Date(l.startsAt))} name={l.course} onMake={() => make(lectureIdea(l.course, l.startsAt, 'النهارده'))} />)}
      </Column>
      <Column title={t('Lectures tomorrow', 'محاضرات بكرة')} count={tomorrows.length} empty={t('No lectures tomorrow.', 'مفيش محاضرات بكرة.')}>
        {tomorrows.map((l) => <Row key={l.id} when={RIYADH_TIME.format(new Date(l.startsAt))} name={l.course} onMake={() => make(lectureIdea(l.course, l.startsAt, 'بكرة'))} />)}
      </Column>
      <div className="cw-col-stack">
        <Column title={t('Webinars and seminars', 'ويبنارات وندوات')} count={webinars.length} empty={t('None booked in the next 30 days.', 'مفيش ولا واحد متسجّل في الـ 30 يوم الجاية.')}>
          {webinars.map((e) => <Row key={e.id} when={date(e.startsAt, 'dayShort')} name={e.title} sub={e.type} onMake={() => make(webinarIdea(e.title, e.startsAt, e.registrationUrl))} />)}
        </Column>
        <Column title={t('Courses starting (30 days)', 'كورسات بتبدأ (30 يوم)')} count={runs.length} empty={t('No courses starting.', 'مفيش كورسات بتبدأ.')}>
          {runs.map((e) => <Row key={e.id} when={date(e.startsAt, 'dayShort')} name={e.title.replace(/\s*[-–]?\s*\d{3,}\s*$/, '')} onMake={() => make(runIdea(e.title, e.startsAt))} />)}
        </Column>
      </div>
    </div>
  );
}

/* ── Comparison: one scoreboard ─────────────────────────────────────── */

function Scoreboard({ data, onOpen }: { data: RadarData; onOpen: (id: string) => void }) {
  const { t, tx, num, compact } = useI18n();
  const hasOurs = data.metrics.ours.some((o) => o.posts);
  const columns = [
    ...(hasOurs ? [{ id: 'ours', name: t('Us', 'إحنا'), ours: true }] : []),
    ...data.competitors.map((c) => ({ id: c.id, name: t(c.name, c.nameAr), ours: false })),
  ];
  const account = (col: string, p: RadarPlatform) => data.metrics.accounts.find((a) => a.competitorId === col && a.platform === p);
  const valueOf = (col: string, p: RadarPlatform): { median: number | null; perWeek: number | null; bestId?: string } => {
    if (col === 'ours') { const o = data.metrics.ours.find((x) => x.platform === p); return { median: o?.posts ? o.medianInteractions : null, perWeek: o?.posts ? o.perWeek : null }; }
    const a = account(col, p);
    return { median: a?.posts ? a.medianInteractions : null, perWeek: a?.posts ? a.perWeek : null, bestId: a?.best?.id };
  };
  const totals = (col: string) => {
    if (col === 'ours') return { followers: null as number | null, sales: null as number | null, perWeek: data.metrics.ours.reduce((s, o) => s + o.perWeek, 0) };
    const rows = RADAR_PLATFORMS.map((p) => account(col, p)).filter(Boolean) as NonNullable<ReturnType<typeof account>>[];
    const known = rows.filter((a) => a.followers != null);
    const sales = rows.filter((a) => a.salesShare != null && a.posts);
    const n = sales.reduce((s, a) => s + a.posts, 0);
    return {
      followers: known.length ? known.reduce((s, a) => s + (a.followers ?? 0), 0) : null,
      sales: n ? Math.round(sales.reduce((s, a) => s + (a.salesShare ?? 0) * a.posts, 0) / n) : null,
      perWeek: Math.round(rows.reduce((s, a) => s + a.perWeek, 0) * 10) / 10,
    };
  };
  return (
    <Card flush className="cw-board">
      <div className="cw-board__intro">
        <h3>{t('Who gets more interaction, platform by platform', 'مين بياخد تفاعل أكتر على كل منصة')}</h3>
        <p>{t(`Usual interactions per post (reactions + comments + shares), last ${data.metrics.windowDays} days. The leader on each platform is filled.`, `التفاعل المعتاد للبوست (إعجاب + تعليق + مشاركة) في آخر ${data.metrics.windowDays} يوم. المتصدّر على كل منصة لونه مليان.`)}</p>
      </div>
      <div className="ui-table-scroll">
        <table className="cw-board__table">
          <thead>
            <tr>
              <th scope="col" className="cw-board__corner">{t('Platform', 'المنصة')}</th>
              {columns.map((c) => <th key={c.id} scope="col" className={c.ours ? 'cw-board__ours' : undefined}>{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {RADAR_PLATFORMS.map((p) => {
              const cells = columns.map((c) => ({ col: c, v: valueOf(c.id, p) }));
              const max = Math.max(0, ...cells.map((x) => x.v.median ?? 0));
              return (
                <tr key={p}>
                  <th scope="row"><span className="cw-board__pf"><ChannelIcon channel={p} size={16} />{tx(PLATFORM_NAME[p])}</span></th>
                  {cells.map(({ col, v }) => {
                    const lead = v.median != null && max > 0 && v.median === max;
                    const share = v.median != null && max > 0 ? v.median / max : 0;
                    return (
                      <td key={col.id} className={lead ? 'cw-cell cw-cell--lead' : v.median == null ? 'cw-cell cw-cell--none' : 'cw-cell'} style={!lead && v.median != null ? { ['--share' as string]: `${Math.round(8 + share * 30)}%` } : undefined}>
                        <span className="cw-cell__value u-tnum">{v.median == null ? '—' : num(v.median)}</span>
                        <span className="cw-cell__sub">{v.perWeek == null ? t('no posts', 'مفيش بوستات') : t(`${v.perWeek} posts/week`, `${v.perWeek} بوست/أسبوع`)}</span>
                        {v.bestId && <button type="button" className="cw-cell__best" onClick={() => onOpen(v.bestId!)}>{t('best post', 'أحسن بوست')}</button>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t('Posts a week', 'بوستات في الأسبوع')}</th>
              {columns.map((c) => <td key={c.id} className="u-tnum">{num(Math.round(totals(c.id).perWeek * 10) / 10)}</td>)}
            </tr>
            <tr>
              <th scope="row">{t('Selling posts', 'بوستات بيع')}</th>
              {columns.map((c) => { const s = totals(c.id).sales; return <td key={c.id} className="u-tnum">{s == null ? '—' : `${s}%`}</td>; })}
            </tr>
            <tr>
              <th scope="row">{t('Followers', 'المتابعين')}</th>
              {columns.map((c) => { const f = totals(c.id).followers; return <td key={c.id} className="u-tnum">{f == null ? '—' : compact(f)}</td>; })}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/* ── Their posts ────────────────────────────────────────────────────── */

function PostsView({ posts, data, nameOf, onOpen }: { posts: RadarPost[]; data: RadarData; nameOf: (id: string) => string; onOpen: (id: string) => void }) {
  const { t, tx, num, date } = useI18n();
  const [competitor, setCompetitor] = useState<string>('all');
  const [platform, setPlatform] = useState<RadarPlatform | 'all'>('all');
  const list = posts.filter((p) => (competitor === 'all' || p.competitorId === competitor) && (platform === 'all' || p.platform === platform));
  const top = [...list].filter((p) => p.level === 'breakout' || p.level === 'high').sort(byStrength).slice(0, 4);
  const rest = [...list].sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  return (
    <div className="u-stack">
      <div className="cw-filters">
        <FilterSelect label={t('Competitor', 'المنافس')} value={competitor} onChange={setCompetitor} allLabel={t('All', 'الكل')} options={data.competitors.map((c) => ({ value: c.id, label: t(c.name, c.nameAr) }))} />
        <FilterSelect label={t('Platform', 'المنصة')} value={platform} onChange={setPlatform} allLabel={t('All', 'الكل')} options={RADAR_PLATFORMS.map((p) => ({ value: p, label: tx(PLATFORM_NAME[p]) }))} />
      </div>
      {top.length > 0 && (
        <div className="cw-posts">
          {top.map((p) => (
            <button key={p.id} type="button" className="cw-post" onClick={() => onOpen(p.id)}>
              <span className="cw-post__pic">
                {p.picture ? <img src={p.picture} alt="" loading="lazy" /> : <ChannelIcon channel={p.platform} size={26} />}
                {p.level && <span className="cw-post__level"><Badge tone={LEVEL_TONE[p.level]}>{tx(LEVEL[p.level])}</Badge></span>}
              </span>
              <span className="cw-post__body">
                <span className="cw-post__who"><ChannelIcon channel={p.platform} size={13} /> {nameOf(p.competitorId)} · {date(p.postedAt, 'dayShort')}</span>
                <span className="cw-post__nums"><b className="u-tnum">{num(p.interactions)}</b> {t('interactions', 'تفاعل')} <span className="cw-muted">· {t('usual', 'المعتاد')} {num(p.groupMedian)}</span></span>
                {p.analysis && <span className="cw-post__idea" dir="auto">{p.analysis.idea}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      <Card flush>
        <ul className="cw-rows">
          {rest.map((p) => (
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
      </Card>
    </div>
  );
}

function PostDetail({ post }: { post: RadarPost }) {
  const { t, tx, num, date } = useI18n();
  const make = useMakeFromTemplate();
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
            {a.lessonKind !== 'avoid' && (
              <Button size="sm" variant="primary" icon={<LayoutTemplate size={14} />} onClick={() => make(`فكرة مستوحاة من بوست منافس: ${a.idea}\n${a.lesson}`, [post.platform])}>{t('Make ours from a template', 'اعمل واحد لينا من قالب')}</Button>
            )}
          </>
        ) : <p className="cw-muted">{t('Not read yet.', 'لسه ما اتحللش.')}</p>}
        {post.text && <details className="cw-detail__caption"><summary>{t('Post text', 'نص البوست')}</summary><p dir="auto">{post.text}</p></details>}
      </div>
    </div>
  );
}
