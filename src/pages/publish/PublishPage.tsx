import { useState, type JSX } from 'react';
import { CalendarClock, CheckCircle2, CircleAlert, Clock, ExternalLink, Hand, Image as ImageIcon, Plug, Send, Zap } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { EmptyState } from '../../components/feedback/States';
import { useToast } from '../../components/feedback/Toast';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../features/auth/AuthProvider';
import type { PipelineItem } from '../../features/content-pipeline/types';
import { usePipeline } from '../../features/content-pipeline/usePipeline';
import { PLATFORMS, platformOf, PublishDialog, usePublishingBoard, type JobRow, type PublishAccount, type PublishWay, type QueueRow } from '../../features/publishing/PublishDialog';
import { useClock } from '../../features/workspace/hooks';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { parseTimestamp } from '../../lib/format';
import { Journey } from '../../features/content-pipeline/Journey';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type View = 'ready' | 'scheduled' | 'results' | 'accounts';

/**
 * One place to send approved posts out: what is ready, what goes out when (and whether it publishes
 * itself or needs a person), and what happened on each platform.
 */
export function PublishPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const now = useClock();
  const [query, setQuery] = useQueryState();
  const { items, error, reload: reloadItems } = usePipeline();
  const { board, reload } = usePublishingBoard();
  const [open, setOpen] = useState<PipelineItem | null>(null);
  usePageMeta(t('Publishing', 'النشر'), [{ label: t('Publishing', 'النشر') }]);

  const live = items ?? [];
  const ready = live.filter((item) => item.status === 'approved');
  const inReview = live.filter((item) => item.status === 'ready_for_review').length;
  const scheduled = live.filter((item) => item.status === 'scheduled').sort((a, b) => parseTimestamp(a.scheduledAt ?? a.updatedAt) - parseTimestamp(b.scheduledAt ?? b.updatedAt));
  const queueOf = (id: string) => (board?.queue ?? []).filter((row) => row.contentId === id);
  const problems = (board?.queue ?? []).filter((row) => row.state === 'failed').length + (board?.jobs ?? []).filter((job) => job.state === 'failed' || job.state === 'unknown').length;
  const requested = query.get('view') as View | null;
  const view: View = requested && ['ready', 'scheduled', 'results', 'accounts'].includes(requested) ? requested : ready.length || !scheduled.length ? 'ready' : 'scheduled';
  const autoCount = (board?.accounts ?? []).filter((account) => account.auto).length;
  const missing = PLATFORMS.filter((platform) => platform.way !== 'manual' && !(board?.accounts ?? []).some((account) => account.provider === platform.channel)).length;
  const done = () => { void reload(); void reloadItems(); };
  const accountName = (id: string) => board?.accounts.find((account) => account.id === id)?.name ?? id;
  const titleOf = (id: string) => live.find((item) => item.id === id)?.title;

  return (
    <div className="u-stack u-stack--lg publish-page">
      <PageHeader
        title={t('Publishing', 'النشر')}
        description={t('Send approved posts out now or at a time. Facebook and Instagram publish themselves at the chosen time.', 'انشر المنشورات المعتمدة الآن أو في موعد. فيسبوك وإنستجرام يُنشران تلقائيًا في الموعد المحدد.')}
        actions={<ButtonLink to="/calendar" icon={<CalendarClock size={15} />}>{t('Calendar', 'التقويم')}</ButtonLink>}
      />

      {items && <Journey items={live} here={['ready', 'scheduled']} />}
      <PublishWays />

      {board && <button type="button" className="publish-summary" onClick={() => setQuery({ view: 'accounts' })}>
        <Zap size={14} /> {t(`${autoCount} accounts publish by themselves`, `${autoCount} حساب ينشر تلقائيًا`)}
        {missing > 0 && <span data-warn>· {t(`${missing} platforms not connected`, `${missing} منصات غير مربوطة`)}</span>}
        <b>{t('See all accounts', 'كل الحسابات')}</b>
      </button>}

      <Tabs
        label={t('Publishing', 'النشر')}
        value={view}
        onChange={(value) => setQuery({ view: value })}
        items={[
          { value: 'ready', label: t('Ready to publish', 'جاهز للنشر'), count: ready.length },
          { value: 'scheduled', label: t('Scheduled', 'مجدول'), count: scheduled.length },
          { value: 'results', label: t('Results', 'النتائج'), count: problems || undefined },
          { value: 'accounts', label: t('Accounts', 'الحسابات'), count: board?.accounts.length },
        ]}
      />

      {error && !items && <EmptyState title={t('The content service is not reachable.', 'خدمة المحتوى غير متاحة.')} text={error} />}
      {!items && !error && <p role="status" className="u-sm u-muted">{t('Loading…', 'جارٍ التحميل…')}</p>}

      {items && view === 'ready' && (ready.length ? <div className="publish-grid">{ready.map((item) => <article key={item.id} className="publish-card">
        <Thumb item={item} />
        <div className="publish-card__body">
          <Link to={`/content/${item.id}`} className="publish-card__title" dir="auto">{item.title}</Link>
          <span className="publish-card__meta"><Badge tone="success">{t('Approved', 'معتمد')}</Badge></span>
          <ul className="publish-card__ways">{item.channels.map((channel) => <li key={channel}><ChannelIcon channel={channel} size={13} /> <WayLabel channel={channel} /></li>)}</ul>
          <Button variant="primary" size="sm" icon={<Send size={14} />} onClick={() => setOpen(item)}>{t('Publish or schedule', 'انشر أو جدول')}</Button>
        </div>
      </article>)}</div> : <EmptyState icon={<CheckCircle2 size={22} />} title={t('Nothing is waiting to be published.', 'لا شيء ينتظر النشر.')} text={t('Posts appear here once Marketing approves them.', 'تظهر المنشورات هنا بعد اعتمادها من التسويق.')}
        action={inReview > 0 ? <ButtonLink to="/content?tab=review" variant="secondary">{t(`${inReview} waiting for approval`, `${inReview} مستني الاعتماد`)}</ButtonLink> : undefined} />)}

      {items && view === 'scheduled' && (scheduled.length ? <ul className="publish-schedule">{scheduled.map((item) => {
        const rows = queueOf(item.id).filter((row) => row.state !== 'cancelled');
        const waiting = rows.filter((row) => row.state === 'queued' || row.state === 'sending');
        const late = item.scheduledAt ? parseTimestamp(item.scheduledAt) < now : false;
        return <li key={item.id}>
          <span className="publish-schedule__when"><b className="u-tnum">{item.scheduledAt ? <WhenLabel iso={item.scheduledAt} /> : '—'}</b>{late && <Badge tone="warning">{t('Time passed', 'فات الموعد')}</Badge>}</span>
          <Thumb item={item} small />
          <span className="publish-schedule__body">
            <Link to={`/content/${item.id}`} dir="auto">{item.title}</Link>
            <span className="publish-schedule__accounts">
              {waiting.length ? waiting.map((row) => <AccountChip key={row.id} row={row} name={accountName(row.accountId)} />) : <span className="publish-manual"><Hand size={12} /> {t('Manual: nobody set automatic publishing', 'يدوي: لم يُفعَّل النشر التلقائي')}</span>}
            </span>
          </span>
          <span className="publish-schedule__actions">
            <Button size="sm" onClick={() => setOpen(item)}>{waiting.length ? t('Change', 'تعديل') : t('Publish automatically', 'فعّل النشر التلقائي')}</Button>
            {waiting.length > 0 && can('content.schedule') && <CancelAuto contentId={item.id} onDone={done} />}
          </span>
        </li>;
      })}</ul> : <EmptyState icon={<CalendarClock size={22} />} title={t('Nothing is scheduled.', 'لا شيء مجدول.')} text={t('Schedule a ready post, or pick a day on the calendar.', 'جدول منشورًا جاهزًا، أو اختر يومًا من التقويم.')} />)}

      {view === 'accounts' && <AccountsLibrary accounts={board?.accounts ?? null} scheduled={scheduled} />}

      {items && view === 'results' && <Results queue={board?.queue ?? []} jobs={board?.jobs ?? []} titleOf={titleOf} accountName={accountName} />}

      {open && <PublishDialog item={open} open onClose={() => setOpen(null)} onDone={done} />}
    </div>
  );
}

const WAYS: Record<PublishWay, { icon: JSX.Element; en: string; ar: string; detailEn: string; detailAr: string }> = {
  auto: { icon: <Zap size={13} />, en: 'Publishes itself', ar: 'تلقائي', detailEn: 'Facebook and Instagram: pick the accounts and the time, the system posts it.', detailAr: 'فيسبوك وإنستجرام: اختار الحسابات والميعاد، والسيستم بينشر لوحده.' },
  post_page: { icon: <Send size={13} />, en: 'From the post page', ar: 'من صفحة المنشور', detailEn: 'TikTok, YouTube, Snapchat: published from the post with each platform’s options.', detailAr: 'تيك توك ويوتيوب وسناب: بتنشره من صفحة المنشور باختيارات كل منصة.' },
  manual: { icon: <Hand size={13} />, en: 'By hand', ar: 'يدوي', detailEn: 'X, LinkedIn, WhatsApp, the website: it goes on the calendar and someone posts it.', detailAr: 'X ولينكدإن وواتساب والموقع: بيتحط في التقويم وحد من الفريق بينشره بإيده.' },
};

/** The three ways a post leaves the platform, so nobody wonders why TikTok is not "automatic". */
function PublishWays() {
  const { t } = useI18n();
  return <ul className="publish-ways">{(Object.keys(WAYS) as PublishWay[]).map((way) => <li key={way} data-way={way}>
    <b>{WAYS[way].icon} {t(WAYS[way].en, WAYS[way].ar)}</b>
    <small>{t(WAYS[way].detailEn, WAYS[way].detailAr)}</small>
  </li>)}</ul>;
}

function WayLabel({ channel }: { channel: PipelineItem['channels'][number] }) {
  const { t } = useI18n();
  const way = WAYS[platformOf(channel).way];
  return <span className="publish-way" data-way={platformOf(channel).way}>{way.icon} {t(way.en, way.ar)}</span>;
}

function WhenLabel({ iso }: { iso: string }) {
  const { date } = useI18n();
  return <>{date(iso, 'weekday')} {date(iso, 'dayShort')} · {date(iso, 'time')}</>;
}

function Thumb({ item, small }: { item: PipelineItem; small?: boolean }) {
  return item.creative?.imageUrl ? <img className="publish-thumb" data-small={small || undefined} src={item.creative.imageUrl} alt="" loading="lazy" /> : <span className="publish-thumb publish-thumb--empty" data-small={small || undefined}><ImageIcon size={16} /></span>;
}

function AccountChip({ row, name }: { row: QueueRow; name: string }) {
  const { t } = useI18n();
  return <span className="publish-chip" data-state={row.state} title={row.state === 'sending' ? t('Sending…', 'جارٍ الإرسال…') : t('Publishes automatically', 'يُنشر تلقائيًا')}>{row.state === 'sending' ? <Clock size={12} /> : <Zap size={12} />} <bdi>{name}</bdi></span>;
}

function CancelAuto({ contentId, onDone }: { contentId: string; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="ghost" busy={busy} onClick={async () => {
    setBusy(true);
    try { await api(`/api/publishing/${contentId}/cancel`, { body: {} }); toast.info(t('Automatic publishing stopped', 'تم إيقاف النشر التلقائي'), t('The post stays on the calendar.', 'يبقى المنشور في التقويم.')); onDone(); }
    catch (reason) { toast.error(t('Could not stop it', 'تعذّر الإيقاف'), reason instanceof Error ? reason.message : String(reason)); }
    setBusy(false);
  }}>{t('Stop automatic', 'أوقف التلقائي')}</Button>;
}

/** What each platform did with each post, newest first; problems at the top. */
function Results({ queue, jobs, titleOf, accountName }: { queue: QueueRow[]; jobs: JobRow[]; titleOf: (id: string) => string | undefined; accountName: (id: string) => string }) {
  const { t, date } = useI18n();
  const failedQueue = queue.filter((row) => row.state === 'failed');
  const rows = [...jobs].sort((a, b) => Number(b.state === 'failed' || b.state === 'unknown') - Number(a.state === 'failed' || a.state === 'unknown') || b.updatedAt.localeCompare(a.updatedAt));
  if (!rows.length && !failedQueue.length) return <EmptyState icon={<Send size={22} />} title={t('Nothing has been published from here in the last 30 days.', 'لم يُنشر شيء من هنا خلال آخر 30 يومًا.')} />;
  const label: Record<JobRow['state'], [string, string, 'success' | 'brand' | 'warning' | 'danger']> = {
    published: ['Published', 'تم النشر', 'success'],
    processing: ['Processing', 'قيد المعالجة', 'brand'],
    awaiting_user: ['Waiting in the app', 'بانتظار إكماله في التطبيق', 'warning'],
    unknown: ['Not confirmed: check before retrying', 'غير مؤكد: تحقق قبل الإعادة', 'warning'],
    failed: ['Failed', 'فشل', 'danger'],
  };
  return <ul className="publish-schedule">
    {failedQueue.map((row) => <li key={row.id} data-problem>
      <span className="publish-schedule__when"><b className="u-tnum">{date(row.publishAt, 'dateTime')}</b><Badge tone="danger">{t('Automatic publishing did not run', 'لم يتم النشر التلقائي')}</Badge></span>
      <CircleAlert size={18} className="publish-result-icon" />
      <span className="publish-schedule__body"><Link to={`/content/${row.contentId}`} dir="auto">{titleOf(row.contentId) ?? t('Post', 'منشور')}</Link><small>{accountName(row.accountId)} · {row.error}</small></span>
    </li>)}
    {rows.map((job) => <li key={job.id} data-problem={job.state === 'failed' || job.state === 'unknown' || undefined}>
      <span className="publish-schedule__when"><b className="u-tnum">{date(job.updatedAt, 'dateTime')}</b><Badge tone={label[job.state][2]}>{t(label[job.state][0], label[job.state][1])}</Badge></span>
      <ChannelIcon channel={job.provider} size={18} />
      <span className="publish-schedule__body"><Link to={`/content/${job.contentId}`} dir="auto">{titleOf(job.contentId) ?? t('Post', 'منشور')}</Link><small>{accountName(job.accountId)}{job.error ? ` · ${job.error}` : ''}</small></span>
      {job.url && <a className="publish-open" href={job.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {t('Open post', 'افتح المنشور')}</a>}
    </li>)}
  </ul>;
}

/**
 * Every platform the team publishes to, connected or not, with how its posts go out:
 * by themselves at the time, from the post page with the platform's own choices, or by hand.
 */
function AccountsLibrary({ accounts, scheduled }: { accounts: PublishAccount[] | null; scheduled: PipelineItem[] }) {
  const { t } = useI18n();
  const { can } = useAuth();
  if (!accounts) return <p role="status" className="u-sm u-muted">{t('Loading accounts…', 'جارٍ تحميل الحسابات…')}</p>;
  const WAY: Record<string, [string, string, string]> = {
    auto: ['Publishes by itself at the time', 'ينشر تلقائيًا في الموعد', 'success'],
    post_page: ['Publish from the post page', 'النشر من صفحة المنشور', 'brand'],
    manual: ['Published by hand', 'يُنشر يدويًا', 'neutral'],
  };
  return <div className="accounts-library">{PLATFORMS.map((platform) => {
    const linked = accounts.filter((account) => account.provider === platform.channel);
    const [en, ar, tone] = WAY[platform.way];
    const queued = scheduled.filter((item) => item.channels.includes(platform.channel)).length;
    return <article key={platform.channel} className="accounts-card" data-empty={(platform.way !== 'manual' && !linked.length) || undefined}>
      <header><span className="accounts-card__icon"><ChannelIcon channel={platform.channel} size={20} /></span><span><b>{platform.name}</b><small className={`ui-badge ui-badge--${tone}`}>{t(en, ar)}</small></span></header>
      {platform.way === 'manual'
        ? <p className="u-xs u-muted">{t('No publishing API. The post goes on the calendar and someone posts it by hand.', 'لا توجد واجهة نشر. يوضع المنشور في التقويم وينشره أحد الفريق يدويًا.')}</p>
        : linked.length
          ? <ul>{linked.map((account) => <li key={account.id} data-state={account.status === 'connected' ? 'ok' : 'warn'}>
            <span className="accounts-card__dot" aria-hidden /><bdi>{account.name}</bdi>
            <small>{account.status === 'connected' ? (account.auto ? t('Ready', 'جاهز') : t('Connected', 'متصل')) : t('Needs a check', 'يحتاج مراجعة')}</small>
          </li>)}</ul>
          : <p className="u-xs u-muted">{t('Not connected yet.', 'غير مربوط بعد.')} {can('connections.manage') && <Link to="/connections">{t('Connect', 'اربط الحساب')}</Link>}</p>}
      <footer className="u-xs u-muted">{t(`${queued} scheduled`, `${queued} مجدول`)}</footer>
    </article>;
  })}</div>;
}
