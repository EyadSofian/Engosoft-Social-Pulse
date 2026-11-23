import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ChartSpline, Layers, Radar, Wallet } from 'lucide-react';
import { Link } from '../../app/router/router';
import { useAuth } from '../../features/auth/AuthProvider';
import type { PipelineItem } from '../../features/content-pipeline/types';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { compact } from '../../lib/format';
import type { RadarData } from '../radar/model';

interface LivePost { interactions: number; metrics: { reach: number | null; views: number | null } }

/**
 * The month in numbers, then one card per section of the app: Content, Results, Competitors and Admin. Every
 * figure comes from the section it summarises and links there; a section this person cannot open is left out,
 * and a number the system does not have shows as a dash, never as zero.
 */
export function SectionSummary({ month, items, monthCount, monthPublished, livePosts, loading }: { month: string; items: PipelineItem[]; monthCount: number; monthPublished: number; livePosts: LivePost[]; loading: boolean }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const analytics = can('analytics.view');
  const credits = can('credits.view') || can('credits.view_all');
  const [usage, setUsage] = useState<{ totalUsd: number } | null>(null);
  const [radar, setRadar] = useState<Pick<RadarData, 'configured' | 'brief' | 'metrics'> | null>(null);

  useEffect(() => {
    let alive = true;
    if (credits) void api<{ totalUsd: number }>(`/api/usage?month=${month}`).then((data) => alive && setUsage(data)).catch(() => {});
    if (analytics) void api<RadarData>('/api/radar').then((data) => alive && setRadar(data)).catch(() => {});
    return () => { alive = false; };
  }, [month, credits, analytics]);

  const count = (statuses: string[]) => items.filter((item) => statuses.includes(item.status)).length;
  const waiting = count(['ready_for_review']);
  const scheduled = count(['scheduled']);
  const ready = count(['approved']);
  const inWork = count(['idea', 'draft', 'in_production', 'changes_requested']);
  const interactions = livePosts.reduce((sum, post) => sum + post.interactions, 0);
  const reachValues = livePosts.map((post) => post.metrics.reach ?? post.metrics.views).filter((value): value is number => value != null);
  const reach = reachValues.length ? reachValues.reduce((a, b) => a + b, 0) : null;
  const n = (value: number | null) => (loading || value == null ? '—' : compact(value));

  const ours = radar?.metrics.ours.reduce((sum, row) => sum + row.posts, 0) ?? null;
  const ideas = radar?.brief?.brief.ideas.length ?? null;

  return (
    <>
      <section className="ov-kpis" aria-label={t('This month in numbers', 'الشهر بالأرقام')}>
        <Kpi label={t('Posts this month', 'منشورات الشهر')} value={n(monthCount)} hint={t(`${monthPublished} published`, `${monthPublished} اتنشر`)} to="/calendar" />
        <Kpi label={t('Waiting for approval', 'مستني الموافقة')} value={n(waiting)} hint={waiting ? t('Review them now', 'راجعهم دلوقتي') : t('Nothing waiting', 'مفيش حاجة مستنية')} to="/content?tab=review" attention={waiting > 0} />
        <Kpi label={t('Scheduled', 'مجدول')} value={n(scheduled)} hint={t(`${ready} ready to schedule`, `${ready} جاهز يتجدول`)} to="/calendar" />
        {analytics && <Kpi label={t('Interactions', 'التفاعل')} value={n(livePosts.length ? interactions : null)} hint={t('From the connected accounts', 'من الحسابات المربوطة')} to="/analytics" />}
        {analytics && <Kpi label={t('Reach', 'الوصول')} value={n(reach)} hint={t(`${livePosts.length} posts went live`, `${livePosts.length} بوست ظهر فعليًا`)} to="/analytics" />}
        {credits && <Kpi label={t('AI cost', 'تكلفة الذكاء الاصطناعي')} value={usage ? `$${usage.totalUsd.toFixed(2)}` : '—'} hint={t('This month', 'الشهر ده')} to="/usage" />}
      </section>

      <section className="ov-sections" aria-label={t('Every section', 'كل الأقسام')}>
        <SectionCard icon={<Layers size={16} />} title={t('Content', 'المحتوى')} to="/content?tab=all" rows={[
          { label: t('Being made', 'بيتعمل'), value: n(inWork), to: '/content?tab=making' },
          { label: t('Waiting for approval', 'مستني الموافقة'), value: n(waiting), to: '/content?tab=review', attention: waiting > 0 },
          { label: t('Ready to publish', 'جاهز للنشر'), value: n(ready), to: '/publish?view=ready' },
          { label: t('Scheduled', 'مجدول'), value: n(scheduled), to: '/calendar' },
        ]} />
        {analytics && <SectionCard icon={<ChartSpline size={16} />} title={t('Results', 'النتائج')} to="/analytics" rows={[
          { label: t('Posts that went live', 'بوستات ظهرت فعليًا'), value: n(livePosts.length), to: '/analytics' },
          { label: t('Interactions', 'التفاعل'), value: n(livePosts.length ? interactions : null), to: '/analytics' },
          { label: t('Reach', 'الوصول'), value: n(reach), to: '/analytics' },
          { label: t('Comments', 'التعليقات'), to: '/comments' },
        ]} />}
        {analytics && <SectionCard icon={<Radar size={16} />} title={t('Competitors', 'المنافسين')} to="/competitors" headline={radar?.brief?.brief.headline} rows={radar?.configured ? [
          { label: t('Ideas for us today', 'أفكار لنا النهارده'), value: ideas == null ? '—' : String(ideas), to: '/competitors' },
          { label: t('Our posts in the window', 'بوستاتنا في الفترة'), value: ours == null ? '—' : String(ours), to: '/competitors' },
        ] : [{ label: t('Competitor tracking is not set up yet', 'متابعة المنافسين لسه مش متفعّلة'), to: '/competitors' }]} />}
        {credits && <SectionCard icon={<Wallet size={16} />} title={t('Admin', 'الإدارة')} to="/usage" rows={[
          { label: t('AI cost this month', 'تكلفة الذكاء الاصطناعي الشهر ده'), value: usage ? `$${usage.totalUsd.toFixed(2)}` : '—', to: '/usage' },
          ...(can('users.manage') ? [{ label: t('Team and permissions', 'الفريق والصلاحيات'), to: '/settings' }] : []),
        ]} />}
      </section>
    </>
  );
}

function Kpi({ label, value, hint, to, attention }: { label: string; value: string; hint: string; to: string; attention?: boolean }) {
  return (
    <Link to={to} className="ov-kpi" data-attention={attention || undefined}>
      <span className="ov-kpi__label">{label}</span>
      <b className="ov-kpi__value u-tnum">{value}</b>
      <small className="ov-kpi__hint">{hint}</small>
    </Link>
  );
}

function SectionCard({ icon, title, to, headline, rows }: { icon: ReactNode; title: string; to: string; headline?: string; rows: { label: string; value?: string; to: string; attention?: boolean }[] }) {
  const { t } = useI18n();
  return (
    <article className="ov-section">
      <header className="ov-section__head">
        <span className="ov-section__icon">{icon}</span>
        <h2>{title}</h2>
        <Link to={to} className="ov-section__open" aria-label={t(`Open ${title}`, `افتح ${title}`)}><ArrowRight size={15} className="u-flip" /></Link>
      </header>
      {headline && <p className="ov-section__headline" dir="auto">{headline}</p>}
      <ul className="ov-section__rows">
        {rows.map((row) => (
          <li key={row.label}>
            <Link to={row.to} data-attention={row.attention || undefined}><span>{row.label}</span>{row.value == null ? <ArrowRight size={15} className="u-flip ov-section__go" aria-hidden /> : <b className="u-tnum">{row.value}</b>}</Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
