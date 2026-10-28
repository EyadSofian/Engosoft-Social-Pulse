import { useCallback, useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { CalendarClock, CircleAlert, Send, Zap } from 'lucide-react';
import { Link } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { useToast } from '../../components/feedback/Toast';
import { Dialog } from '../../components/overlay/Overlay';
import { Button } from '../../components/ui/Button';
import { suggestedSlots } from '../../domain/content-voice';
import { api } from '../../lib/api';
import { businessZone, fromInputValue, toInputValue } from '../../lib/format';
import { useI18n } from '../../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import type { Channel, PipelineItem } from '../content-pipeline/types';

export type QueueState = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
export interface PublishAccount { id: string; provider: Channel; name: string; status: string; auto: boolean }
export interface QueueRow { id: string; contentId: string; accountId: string; kind: string; publishAt: string; state: QueueState; createdBy: string; jobId: string | null; error: string | null; updatedAt: string }
export interface JobRow { id: string; contentId: string; accountId: string; provider: Channel; state: 'processing' | 'awaiting_user' | 'published' | 'failed' | 'unknown'; externalId?: string; url?: string; error?: string; createdAt: string; updatedAt: string }
export interface PublishTarget { accountId: string; provider: Channel; name: string; ready: boolean; reason: 'advanced' | 'disconnected' | 'no_media' | 'authorization' | null }
export interface PublishingBoard { accounts: PublishAccount[]; queue: QueueRow[]; jobs: JobRow[] }

/** Accounts, the automatic-publishing queue and recent results; null until loaded, and for people who cannot publish. */
export function usePublishingBoard() {
  const { can } = useAuth();
  const allowed = can('content.publish') || can('content.schedule');
  const [board, setBoard] = useState<PublishingBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!allowed) return;
    try { setBoard(await api<PublishingBoard>('/api/publishing')); setError(null); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [allowed]);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 60_000);
    return () => clearInterval(timer);
  }, [reload]);
  return { board, error, reload };
}

/** The next whole hour, at least 30 minutes from now, on `day` when given (10:00 on a future day). */
export function suggestedTime(day?: string): string {
  const now = DateTime.now().setZone(businessZone());
  if (day && day > (now.toISODate() ?? '')) return DateTime.fromISO(`${day}T10:00`, { zone: businessZone() }).toUTC().toISO()!;
  return now.plus({ minutes: 30 }).plus({ hours: 1 }).startOf('hour').toUTC().toISO()!;
}

/**
 * Publish one approved post: choose the accounts, then now or a time. Facebook and Instagram go out
 * automatically; with no account chosen the post is only placed on the calendar for manual publishing.
 */
export function PublishDialog({ item, open, onClose, onDone, day }: { item: PipelineItem; open: boolean; onClose: () => void; onDone: () => void; day?: string }) {
  const { t, date } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const [targets, setTargets] = useState<PublishTarget[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [when, setWhen] = useState<'now' | 'later'>(day || item.scheduledAt ? 'later' : 'now');
  const [at, setAt] = useState(() => toInputValue(item.scheduledAt && !day ? item.scheduledAt : suggestedTime(day)));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ accountId: string; job?: JobRow; error?: string }[] | null>(null);
  const [waiting, setWaiting] = useState<string[]>([]);
  const mayPublish = can('content.publish');
  const maySchedule = can('content.schedule');

  useEffect(() => {
    if (!open) return;
    setTargets(null); setResults(null); setError(''); setConsent(false);
    void api<{ targets: PublishTarget[]; queue: QueueRow[] }>(`/api/publishing/${item.id}`).then((data) => {
      setTargets(data.targets);
      const queued = data.queue.filter((row) => row.state === 'queued').map((row) => row.accountId);
      setWaiting(queued);
      setSelected(new Set(queued.length ? queued : data.targets.filter((target) => target.ready).map((target) => target.accountId)));
      // Nothing can go out now: start on choosing a time, which works with or without accounts.
      if (!data.targets.some((target) => target.ready)) setWhen('later');
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [open, item.id]);

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const chosen = [...selected];
  const nameOf = (id: string) => targets?.find((target) => target.accountId === id)?.name ?? id;
  const reasonText = (target: PublishTarget) => target.reason === 'advanced' ? t('Has its own options. Publish it from the post page.', 'لها خيارات خاصة. انشرها من صفحة المنشور.')
    : target.reason === 'authorization' ? t('Needs reconnecting with publishing permission.', 'تحتاج إعادة ربط بصلاحية النشر.')
    : target.reason === 'no_media' ? t('Add an image or video to the post first.', 'أضف صورة أو فيديو للمنشور أولًا.')
    : t('Not connected right now. Check it in Settings → Connections.', 'غير متصل الآن. راجعه من الإعدادات ← ربط المنصات.');

  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (when === 'now') {
        const response = await api<{ results: { accountId: string; job?: JobRow; error?: string }[] }>(`/api/publishing/${item.id}`, { body: { accountIds: chosen, consent: true } });
        setResults(response.results);
        const failed = response.results.filter((result) => result.error || result.job?.state === 'failed').length;
        if (failed) toast.error(t('Some accounts did not publish', 'بعض الحسابات لم تنشر'), t(`${failed} of ${response.results.length}`, `${failed} من ${response.results.length}`));
        else toast.success(t('Sent to the platforms', 'أُرسل للمنصات'), item.title);
      } else {
        const scheduledAt = fromInputValue(at);
        if (!scheduledAt || Date.parse(scheduledAt) < Date.now()) throw new Error(t('Choose a time in the future.', 'اختر موعدًا في المستقبل.'));
        if (chosen.length) await api(`/api/publishing/${item.id}`, { body: { accountIds: chosen, at: scheduledAt, consent: true } });
        else {
          // Every account unticked: stop the automatic publication and keep the post on the calendar.
          if (waiting.length) await api(`/api/publishing/${item.id}/cancel`, { body: {} });
          await api(`/api/content/${item.id}/transition`, { body: { to: 'scheduled', scheduledAt } });
        }
        toast.success(chosen.length ? t('Scheduled to publish automatically', 'تمت الجدولة للنشر التلقائي') : t('Placed on the calendar', 'وُضع في التقويم'), item.title);
        onClose();
      }
      onDone();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    setBusy(false);
  };

  const needsConsent = chosen.length > 0;
  const blocked = busy || !targets || (needsConsent && !consent) || (when === 'now' && !chosen.length) || (when === 'later' && (!maySchedule || (chosen.length > 0 && !mayPublish)));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('Publish', 'نشر')}
      description={<span dir="auto">{item.title}</span>}
      footer={results ? <Button variant="primary" onClick={onClose}>{t('Done', 'تم')}</Button> : <>
        <Button variant="ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</Button>
        <Button variant="primary" icon={when === 'now' ? <Send size={15} /> : <CalendarClock size={15} />} busy={busy} disabled={blocked} onClick={() => void submit()}>
          {when === 'now' ? t('Publish now', 'انشر الآن') : chosen.length ? t('Schedule publishing', 'جدول النشر') : t('Put on the calendar', 'ضعه في التقويم')}
        </Button>
      </>}
    >
      {results ? <ul className="publish-results">{results.map((result) => {
        const ok = !result.error && result.job?.state !== 'failed';
        return <li key={result.accountId} data-ok={ok || undefined}>
          {ok ? <Zap size={15} /> : <CircleAlert size={15} />}
          <b>{nameOf(result.accountId)}</b>
          <span>{result.error ?? (result.job?.state === 'published' ? t('Published', 'تم النشر') : result.job?.state === 'failed' ? result.job.error ?? t('Refused by the platform', 'رفضته المنصة') : t('Sent, waiting for the platform to confirm', 'أُرسل، بانتظار تأكيد المنصة'))}</span>
          {result.job?.url && <a href={result.job.url} target="_blank" rel="noreferrer">{t('Open', 'افتح')}</a>}
        </li>;
      })}</ul> : <div className="u-stack publish-dialog">
        <section>
          <h3 className="publish-step"><span>1</span>{t('Where?', 'أين؟')}</h3>
          {!targets && !error && <p className="u-sm u-muted">{t('Loading accounts…', 'جارٍ تحميل الحسابات…')}</p>}
          {targets && !targets.length && <p className="u-sm u-muted">{t('No connected account matches this post’s platforms.', 'لا يوجد حساب مربوط من منصات هذا المنشور.')} {can('connections.manage') && <Link to="/connections">{t('Connect accounts', 'اربط الحسابات')}</Link>}</p>}
          <ul className="publish-targets">{targets?.map((target) => <li key={target.accountId}>
            <label data-disabled={!target.ready || undefined}>
              <input type="checkbox" checked={selected.has(target.accountId)} disabled={!target.ready} onChange={() => toggle(target.accountId)} />
              <ChannelIcon channel={target.provider} size={16} />
              <span className="u-grow"><b dir="auto">{target.name}</b>{!target.ready && <small>{reasonText(target)}{target.reason === 'advanced' && <> <Link to={`/content/${item.id}`}>{t('Post page', 'صفحة المنشور')}</Link></>}</small>}</span>
            </label>
          </li>)}</ul>
        </section>
        <section>
          <h3 className="publish-step"><span>2</span>{t('When?', 'متى؟')}</h3>
          <div className="publish-when" role="radiogroup" aria-label={t('When', 'متى')}>
            <button type="button" role="radio" aria-checked={when === 'now'} disabled={!mayPublish} onClick={() => setWhen('now')}><Send size={16} /><b>{t('Now', 'الآن')}</b><small>{t('Goes out right away', 'يُنشر فورًا')}</small></button>
            <button type="button" role="radio" aria-checked={when === 'later'} disabled={!maySchedule} onClick={() => setWhen('later')}><CalendarClock size={16} /><b>{t('At a time', 'في موعد')}</b><small>{t('Publishes itself at the time', 'يُنشر تلقائيًا في الموعد')}</small></button>
          </div>
          {when === 'later' && <label className="ui-field publish-time">
            <span className="ui-field__label">{t('Date and time', 'التاريخ والوقت')} <small className="u-muted">({businessZone()})</small></span>
            <input className="ui-input" type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} />
            <span className="content-slots">{t('Best times', 'أفضل وقت')}: {suggestedSlots(item.channels, businessZone()).map((slot) => <button key={slot.at} type="button" aria-pressed={at === slot.at} onClick={() => setAt(slot.at)}>{date(DateTime.fromISO(slot.at, { zone: businessZone() }).toISO()!, 'weekday')} {date(DateTime.fromISO(slot.at, { zone: businessZone() }).toISO()!, 'time')}</button>)}</span>
            {!chosen.length && <span className="ui-field__hint">{t('No account chosen: the post goes on the calendar and someone publishes it by hand.', 'بدون حساب: يوضع المنشور في التقويم ويُنشر يدويًا.')}</span>}
          </label>}
        </section>
        {needsConsent && <label className="publish-consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>{t(`I confirm publishing this approved post, exactly as approved, to ${chosen.length} account${chosen.length > 1 ? 's' : ''}.`, `أؤكد نشر هذا المنشور المعتمد كما هو على ${chosen.length} ${chosen.length > 1 ? 'حسابات' : 'حساب'}.`)}</span>
        </label>}
        {error && <p role="alert" className="creative-home__error">{error}</p>}
      </div>}
    </Dialog>
  );
}
