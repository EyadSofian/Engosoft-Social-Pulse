import { imageForChannel } from '../../domain/output-presets';
import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { CalendarClock, Check, CircleAlert, Clock, Copy, Download, ExternalLink, Hand, Loader2, RotateCcw, Send, Zap } from 'lucide-react';
import { Link } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { useToast } from '../../components/feedback/Toast';
import { Dialog } from '../../components/overlay/Overlay';
import { Button } from '../../components/ui/Button';
import { suggestedSlots } from '../../domain/content-voice';
import { tiktokPhotoTitle } from '../../domain/tiktok-publishing';
import { api, errorMessage } from '../../lib/api';
import { businessZone, fromInputValue, toInputValue } from '../../lib/format';
import { useI18n } from '../../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import type { Channel, PipelineItem } from '../content-pipeline/types';
import { PostPreview } from './PostPreview';
import { ReelCoverPicker } from '../reels/ReelCovers';
import type { ProviderConnection } from './SocialConnections';
import { platformOf, suggestedTime, type JobRow, type ManualPublication, type PublishTarget, type QueueRow } from './publishing';

/** Platforms that ask for their own choices on every post (TikTok's rules require them at posting time). */
const OPTION_PROVIDERS: Channel[] = ['tiktok', 'youtube', 'snapchat'];
const MANUAL: Channel[] = ['linkedin', 'x', 'whatsapp', 'website'];

/** Per-account choices for TikTok, YouTube and Snapchat. TikTok's privacy and interactions have no default, by its rules. */
interface Choices { privacy: string; commercial: 'none' | 'own' | 'paid' | 'both'; comments: boolean; duet: boolean; stitch: boolean; ai: boolean; buffer: boolean; kids: '' | 'yes' | 'no'; snap: 'story' | 'spotlight' }
const NO_CHOICES: Choices = { privacy: '', commercial: 'none', comments: false, duet: false, stitch: false, ai: false, buffer: false, kids: '', snap: 'story' };
interface Creator { creator_nickname?: string; creator_username?: string; privacy_level_options?: string[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean; hybrid?: boolean }
interface Media { url: string; type: 'image' | 'video' }
/** One account the post can go to from here, and what it would send. */
interface Destination { accountId: string; provider: Channel; name: string; options: boolean; blocked: string; kind: 'text' | 'image' | 'video' | null; media: { url: string }[]; /** Blocked by the account's connection: fixed in Connections. */ reconnect?: boolean }
type Outcome = { sending: true } | { sending: false; job?: Pick<JobRow, 'id' | 'state' | 'url' | 'error'>; error?: string };

const PRIVACY: Record<string, [string, string]> = {
  PUBLIC_TO_EVERYONE: ['Everyone', 'الكل'], MUTUAL_FOLLOW_FRIENDS: ['Friends', 'الأصدقاء'], FOLLOWER_OF_CREATOR: ['Followers', 'المتابعين'], SELF_ONLY: ['Only me', 'أنا بس'],
};
const OPEN_URL: Partial<Record<Channel, (caption: string) => string>> = {
  linkedin: () => 'https://www.linkedin.com/feed/?shareActive=true',
  x: (caption) => `https://x.com/intent/post?text=${encodeURIComponent(caption)}`,
  whatsapp: (caption) => `https://wa.me/?text=${encodeURIComponent(caption)}`,
};

/**
 * One place to send an approved post everywhere it is meant for: a preview per platform, every account in one
 * list (TikTok, YouTube and Snapchat with their own choices inline), now or at a time, then each account's live
 * result. Platforms with no publishing API get a kit — copy, download, open — and a record once posted by hand.
 */
export function PublishComposer({ item, open, onClose, onDone, day }: { item: PipelineItem; open: boolean; onClose: () => void; onDone: () => void; day?: string }) {
  const { t, date } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const mayPublish = can('content.publish');
  const maySchedule = can('content.schedule');
  const [targets, setTargets] = useState<PublishTarget[] | null>(null);
  const [providers, setProviders] = useState<ProviderConnection[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [manual, setManual] = useState<ManualPublication[]>([]);
  const [waiting, setWaiting] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [choices, setChoices] = useState<Record<string, Choices>>({});
  const [creators, setCreators] = useState<Record<string, Creator | 'error'>>({});
  const [when, setWhen] = useState<'now' | 'later'>(day || item.scheduledAt ? 'later' : 'now');
  const [at, setAt] = useState(() => toInputValue(item.scheduledAt && !day ? item.scheduledAt : suggestedTime(day)));
  const [phase, setPhase] = useState<'compose' | 'sending' | 'done'>('compose');
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [error, setError] = useState('');

  const load = async () => {
    const [board, social, connections] = await Promise.all([
      api<{ targets: PublishTarget[]; queue: QueueRow[]; jobs: JobRow[]; manual: ManualPublication[] }>(`/api/publishing/${item.id}`),
      api<{ media: Media[] }>(`/api/social/content/${item.id}`).catch(() => ({ media: [] as Media[] })),
      mayPublish ? api<{ providers: ProviderConnection[] }>('/api/social/connections').catch(() => ({ providers: [] as ProviderConnection[] })) : Promise.resolve({ providers: [] as ProviderConnection[] }),
    ]);
    setTargets(board.targets); setJobs(board.jobs); setManual(board.manual ?? []); setMedia(social.media); setProviders(connections.providers);
    return board;
  };
  useEffect(() => {
    if (!open) return;
    setTargets(null); setPhase('compose'); setOutcomes({}); setError(''); setCreators({}); setChoices({});
    void load().then((board) => {
      const queued = board.queue.filter((row) => row.state === 'queued').map((row) => row.accountId);
      setWaiting(queued);
      setSelected(new Set(queued.length ? queued : board.targets.filter((target) => target.ready).map((target) => target.accountId)));
      // Nothing can go out now: start on choosing a time, which works with or without accounts.
      if (!board.targets.some((target) => target.ready)) setWhen('later');
    }).catch((reason: unknown) => setError(errorMessage(reason, t('Could not load the accounts.', 'تعذّر تحميل الحسابات.'))));
  }, [open, item.id]);

  const video = [...media].reverse().find((m) => m.type === 'video');
  const destinations = useMemo<Destination[]>(() => {
    const auto = (targets ?? []).filter((target) => !OPTION_PROVIDERS.includes(target.provider)).map((target): Destination => ({
      accountId: target.accountId, provider: target.provider, name: target.name, options: false, kind: null, media: [], reconnect: !target.ready && target.reason !== 'no_media',
      blocked: target.ready ? '' : target.reason === 'authorization' ? t('Needs reconnecting with publishing permission.', 'محتاج إعادة ربط بصلاحية النشر.') : target.reason === 'no_media' ? t('Add an image or video to the post first.', 'أضف صورة أو فيديو للمنشور الأول.') : t('The last check of this account failed. Review it in Connections.', 'آخر فحص للحساب ده فشل. راجعه من ربط المنصات.'),
    }));
    const withOptions = providers.flatMap((p) => p.accounts).filter((a) => a.status !== 'disconnected' && OPTION_PROVIDERS.includes(a.provider) && item.channels.includes(a.provider)).map((a): Destination => {
      const image = imageForChannel(a.provider, item.creative);
      const kind = video ? 'video' : image && a.provider !== 'youtube' ? 'image' : null;
      const photoDraft = a.provider === 'tiktok' && kind === 'image' && choices[a.id]?.ai;
      const availability = kind ? a.capabilities[photoDraft ? 'upload_draft' : `publish_${kind}` as const] : null;
      const blocked = a.status !== 'connected' ? t('The last check of this account failed. Review it in Connections.', 'آخر فحص للحساب ده فشل. راجعه من ربط المنصات.')
        : !kind ? (a.provider === 'youtube' ? t('YouTube needs a video. Add it in the post files before approval.', 'يوتيوب محتاج فيديو. أضفه من ملفات المنشور قبل الاعتماد.') : t('Add an image or video to the post first.', 'أضف صورة أو فيديو للمنشور الأول.'))
        : availability === 'available' ? ''
          : availability === 'approval_required' ? t('Waiting for the platform to approve the app for publishing.', 'مستني المنصة تعتمد التطبيق للنشر.')
            : t('Needs reconnecting with publishing permission.', 'محتاج إعادة ربط بصلاحية النشر.');
      return { accountId: a.id, provider: a.provider, name: a.name, options: true, kind, media: kind === 'video' ? [{ url: video!.url }] : kind === 'image' ? [{ url: image! }] : [], blocked, reconnect: a.status !== 'connected' || (Boolean(kind) && availability !== 'available' && availability !== 'approval_required') };
    });
    return [...auto, ...withOptions];
  }, [targets, providers, video, item.creative, choices, item.channels]);

  const choiceOf = (id: string) => choices[id] ?? NO_CHOICES;
  const setChoice = (id: string, patch: Partial<Choices>) => setChoices((current) => ({ ...current, [id]: { ...(current[id] ?? NO_CHOICES), ...patch } }));
  const toggle = (destination: Destination) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(destination.accountId)) next.delete(destination.accountId); else next.add(destination.accountId);
    return next;
  });

  // TikTok shows its creator's current privacy options and limits at posting time, so they are read when chosen.
  useEffect(() => {
    for (const d of destinations) {
      if (d.provider !== 'tiktok' || !selected.has(d.accountId) || d.blocked || creators[d.accountId]) continue;
      void api<Creator>(`/api/social/accounts/${encodeURIComponent(d.accountId)}/creator?mediaType=${d.kind === 'video' ? 'video' : 'photo'}`)
        .then((creator) => setCreators((current) => ({ ...current, [d.accountId]: creator })))
        .catch(() => setCreators((current) => ({ ...current, [d.accountId]: 'error' })));
    }
  }, [destinations, selected]);

  const chosen = destinations.filter((d) => selected.has(d.accountId) && !d.blocked);
  const sendable = chosen.filter((d) => when === 'now' || !d.options);
  const heldForLater = when === 'later' ? chosen.filter((d) => d.options) : [];
  /** What a chosen TikTok or YouTube account still needs before it can go. */
  const missing = (d: Destination): string => {
    const c = choiceOf(d.accountId);
    if (d.provider === 'tiktok') {
      const creator = creators[d.accountId];
      if (creator === 'error') return t('TikTok did not return the account settings. Try again in a moment.', 'تيك توك ما رجّعش إعدادات الحساب. جرّب كمان شوية.');
      if (!creator) return t('Reading the TikTok account settings…', 'بنقرا إعدادات حساب تيك توك…');
      if (!c.privacy) return t('Choose who can see it.', 'اختار مين يشوف المنشور.');
      if (d.kind === 'image' && !tiktokPhotoTitle(item.title)) return t('The post title is empty; TikTok photos need one.', 'عنوان المنشور فاضي، وصور تيك توك محتاجة عنوان.');
    }
    if (d.provider === 'youtube' && (!c.privacy || !c.kids)) return t('Choose the visibility and whether it is made for kids.', 'اختار الظهور وهل الفيديو موجّه للأطفال.');
    return '';
  };
  const incomplete = sendable.filter((d) => d.options && missing(d));
  const nowBlocked = when === 'now' && (!mayPublish || !sendable.length);
  const later = fromInputValue(at);
  const laterBlocked = when === 'later' && (!maySchedule || !later || Date.parse(later) < Date.now() || (sendable.length > 0 && !mayPublish));
  const blocked = !targets || phase !== 'compose' || nowBlocked || laterBlocked || incomplete.length > 0;
  const tiktokChosen = sendable.some((d) => d.provider === 'tiktok');

  const payload = (d: Destination, retry = false) => {
    const c = choiceOf(d.accountId);
    const photo = d.provider === 'tiktok' && d.kind === 'image';
    return {
      contentId: item.id, accountId: d.accountId, kind: d.kind, media: d.media, mode: photo && c.ai ? 'draft' : 'direct', privacy: c.privacy || undefined,
      categoryId: '27', tags: [], madeForKids: c.kids === 'yes', disableComment: !c.comments, disableDuet: !c.duet, disableStitch: !c.stitch,
      brandOrganic: ['own', 'both'].includes(c.commercial), brandContent: ['paid', 'both'].includes(c.commercial), snapTarget: c.snap, locale: 'ar_SA',
      bufferDefaultsConsent: c.buffer, isAiGenerated: c.ai, photoCoverIndex: photo ? 0 : undefined, autoAddMusic: photo ? false : undefined, retry, consent: true,
    };
  };
  const settle = (id: string, outcome: Outcome) => setOutcomes((current) => ({ ...current, [id]: outcome }));
  /** Sends to the given accounts now; each reports its own result as it comes back. */
  const send = async (list: Destination[], retry = false) => {
    list.forEach((d) => settle(d.accountId, { sending: true }));
    const auto = list.filter((d) => !d.options);
    await Promise.all([
      auto.length ? api<{ results: { accountId: string; job?: JobRow; error?: string }[] }>(`/api/publishing/${item.id}`, { body: { accountIds: auto.map((d) => d.accountId), consent: true } })
        .then((response) => response.results.forEach((r) => settle(r.accountId, { sending: false, job: r.job, error: r.error })))
        .catch((reason) => auto.forEach((d) => settle(d.accountId, { sending: false, error: errorMessage(reason, t('Could not publish.', 'تعذّر النشر.')) }))) : null,
      ...list.filter((d) => d.options).map((d) => api<JobRow>('/api/social/publish', { body: payload(d, retry) })
        .then((job) => settle(d.accountId, { sending: false, job }))
        .catch((reason) => settle(d.accountId, { sending: false, error: errorMessage(reason, t('Could not publish.', 'تعذّر النشر.')) })))
    ]);
  };

  const submit = async () => {
    setError('');
    if (when === 'later') {
      setPhase('sending');
      try {
        if (!later || Date.parse(later) < Date.now()) throw new Error(t('Choose a time in the future.', 'اختر موعدًا في المستقبل.'));
        if (sendable.length) await api(`/api/publishing/${item.id}`, { body: { accountIds: sendable.map((d) => d.accountId), at: later, consent: true } });
        else {
          // No account publishes by itself: stop any waiting automatic publication and keep the post on the calendar.
          if (waiting.length) await api(`/api/publishing/${item.id}/cancel`, { body: {} });
          await api(`/api/content/${item.id}/transition`, { body: { to: 'scheduled', scheduledAt: later } });
        }
        toast.success(sendable.length ? t('Scheduled to publish automatically', 'اتجدول للنشر التلقائي') : t('Placed on the calendar', 'اتحط في التقويم'), item.title);
        onDone(); onClose();
      } catch (reason) { setError(errorMessage(reason, t('Could not schedule it.', 'تعذّرت الجدولة.'))); setPhase('compose'); }
      return;
    }
    setPhase('sending');
    await send(sendable);
    setPhase('done');
    onDone();
  };

  // Platforms that take a moment (video processing, Instagram containers) are checked until they settle.
  const pending = Object.values(outcomes).some((o) => !o.sending && o.job && ['processing', 'unknown'].includes(o.job.state));
  useEffect(() => {
    if (phase !== 'done' || !pending) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > 24) { clearInterval(timer); return; }
      void api<{ jobs: JobRow[] }>(`/api/publishing/${item.id}`).then((board) => setOutcomes((current) => Object.fromEntries(Object.entries(current).map(([id, o]) => {
        const fresh = !o.sending && o.job ? board.jobs.find((job) => job.id === o.job!.id) : undefined;
        return [id, fresh ? { ...o, job: fresh } : o];
      }))));
    }, 5000);
    return () => clearInterval(timer);
  }, [phase, pending, item.id]);

  const accountNames = Object.fromEntries([...chosen, ...destinations].reverse().map((d) => [d.provider, d.name])) as Partial<Record<Channel, string>>;
  const manualChannels = item.channels.filter((c) => MANUAL.includes(c) && (c!=='linkedin'||!destinations.some(d=>d.provider==='linkedin')));
  const missingPlatforms = item.channels.filter((c) => !MANUAL.includes(c) && !destinations.some((d) => d.provider === c));
  const count = sendable.length;
  const action = when === 'now'
    ? t(`Publish now to ${count} account${count === 1 ? '' : 's'}`, `انشر الآن على ${count === 1 ? 'حساب واحد' : count === 2 ? 'حسابين' : `${count} حسابات`}`)
    : count ? t(`Schedule ${count} account${count === 1 ? '' : 's'}`, `جدول النشر على ${count === 1 ? 'حساب واحد' : count === 2 ? 'حسابين' : `${count} حسابات`}`) : t('Put on the calendar', 'حطه في التقويم');

  return (
    <Dialog open={open} onClose={onClose} size="xl" title={t('Publish', 'نشر')} description={<span dir="auto">{item.title}</span>}
      footer={phase === 'compose' ? <div className="composer-foot">
        <p className="composer-foot__summary">
          {incomplete.length ? <><CircleAlert size={15} /> {missing(incomplete[0])}</>
            : when === 'later' && heldForLater.length ? <><Clock size={15} /> {t(`${heldForLater.map((d) => platformOf(d.provider).name).join(', ')}: publish them from here at the time; they need their own choices then.`, `${heldForLater.map((d) => platformOf(d.provider).name).join(' و')}: تنشرها من هنا في الموعد لأنها محتاجة اختياراتها وقتها.`)}</>
              : when === 'now' && !count ? <><CircleAlert size={15} /> {t('Choose at least one account.', 'اختار حساب واحد على الأقل.')}</>
                : tiktokChosen ? <span>{t('By posting to TikTok you agree to its', 'بالنشر على تيك توك أنت موافق على')} <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.</span>
                  : <span>{t('The design and captions go out exactly as shown. Publishing is the approval.', 'التصميم والنص هيتنشروا زي ما هما بالظبط، ونشرك هو الاعتماد.')}</span>}
        </p>
        <Button variant="ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</Button>
        <Button variant="primary" icon={when === 'now' ? <Send size={15} /> : <CalendarClock size={15} />} disabled={blocked} onClick={() => void submit()}>{action}</Button>
      </div> : phase === 'done' ? <Button variant="primary" onClick={onClose}>{t('Done', 'تم')}</Button> : null}
    >
      {!targets && !error && <p className="u-sm u-muted composer-loading"><Loader2 size={16} className="creative-job__spin" /> {t('Loading the accounts…', 'بنحمّل الحسابات…')}</p>}
      {error && <p role="alert" className="creative-home__error">{error}</p>}
      {targets && <div className="composer">
        <div className="composer__main">
          {phase === 'compose' ? <>
            <section className="composer__section">
              <h3>{t('Where', 'فين')}</h3>
              <ul className="composer-accounts">
                {destinations.map((d) => {
                  const on = selected.has(d.accountId) && !d.blocked;
                  const held = on && d.options && when === 'later';
                  return <li key={d.accountId} data-on={on || undefined} data-blocked={Boolean(d.blocked) || undefined}>
                    <label className="composer-account">
                      <input type="checkbox" checked={on} disabled={Boolean(d.blocked)} onChange={() => toggle(d)} />
                      <ChannelIcon channel={d.provider} size={18} />
                      <span className="composer-account__name"><b><bdi>{d.name}</bdi></b><small>{d.blocked || (d.options ? t('Asks for its choices below', 'محتاج اختياراته تحت') : t('Publishes by itself', 'بيتنشر لوحده'))}{d.reconnect && can('connections.manage') && <> <Link to="/connections">{t('Open Connections', 'افتح ربط المنصات')}</Link></>}</small></span>
                      {!d.blocked && (d.options ? <span className="composer-way" data-way="options">{platformOf(d.provider).name}</span> : <span className="composer-way" data-way="auto"><Zap size={12} /> {t('Automatic', 'تلقائي')}</span>)}
                    </label>
                    {on && d.options && !held && <AccountChoices destination={d} choices={choiceOf(d.accountId)} creator={creators[d.accountId]} onChange={(patch) => setChoice(d.accountId, patch)} />}
                    {held && <p className="composer-account__note"><Clock size={13} /> {t('Publish it from here at the time: TikTok and YouTube ask for their choices when posting.', 'تنشره من هنا في الموعد: تيك توك ويوتيوب بيطلبوا اختياراتهم وقت النشر.')}</p>}
                  </li>;
                })}
                {missingPlatforms.map((c) => <li key={c} data-blocked>
                  <span className="composer-account"><input type="checkbox" disabled /><ChannelIcon channel={c} size={18} /><span className="composer-account__name"><b>{platformOf(c).name}</b><small>{t('No connected account.', 'مفيش حساب مربوط.')} {can('connections.manage') && <Link to="/connections">{t('Connect', 'اربطه')}</Link>}</small></span></span>
                </li>)}
              </ul>
            </section>
            {video && item.creative?.requestId === 'reel' && <section className="composer__section">
              <h3>{t('Reel covers', 'غلاف الريل لكل منصة')}</h3>
              <ReelCoverPicker cover={item.creative.reelCover ?? { url: item.creative.imageUrl }} covers={item.creative.reelCovers ?? {}} channels={item.channels} disabled onChange={() => {}} />
              <Link to={`/content/${item.id}`} onClick={onClose}>{t('Edit covers on the post page', 'عدّل الأغلفة من صفحة المنشور')}</Link>
            </section>}
            <section className="composer__section">
              <h3>{t('When', 'إمتى')}</h3>
              <div className="composer-when" role="radiogroup" aria-label={t('When', 'إمتى')}>
                <button type="button" role="radio" aria-checked={when === 'now'} disabled={!mayPublish} onClick={() => setWhen('now')}><Send size={16} /><b>{t('Now', 'دلوقتي')}</b></button>
                <button type="button" role="radio" aria-checked={when === 'later'} disabled={!maySchedule} onClick={() => setWhen('later')}><CalendarClock size={16} /><b>{t('At a time', 'في ميعاد')}</b></button>
              </div>
              {when === 'later' && <div className="composer-time">
                <span className="content-slots">{suggestedSlots(item.channels, businessZone()).map((slot) => <button key={slot.at} type="button" aria-pressed={at === slot.at} onClick={() => setAt(slot.at)}>
                  {date(DateTime.fromISO(slot.at, { zone: businessZone() }).toISO()!, 'weekday')} {date(DateTime.fromISO(slot.at, { zone: businessZone() }).toISO()!, 'time')}
                </button>)}</span>
                <label><span>{t('Or pick a time', 'أو اختار ميعاد')} <small className="u-muted">({businessZone()})</small></span><input className="ui-input" type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} /></label>
                {!sendable.length && <small className="u-muted">{t('No account publishes by itself: the post goes on the calendar with a reminder.', 'مفيش حساب بينشر لوحده: المنشور هيتحط في التقويم مع تذكير.')}</small>}
              </div>}
            </section>
          </> : <Results destinations={destinations.filter((d) => outcomes[d.accountId])} outcomes={outcomes} sending={phase === 'sending'} onRetry={(d) => void send([d], true)} />}
          {manualChannels.length > 0 && <section className="composer__section">
            <h3><Hand size={15} /> {t('By hand', 'يدوي')}</h3>
            <p className="u-xs u-muted">{t('These platforms have no publishing connection. Copy, post, then record it so the team knows.', 'المنصات دي مفيهاش ربط للنشر. انسخ وانشر، وبعدين سجّل إنه اتنشر علشان الفريق يعرف.')}</p>
            <ul className="composer-manual">{manualChannels.map((c) => <ManualKit key={c} item={item} channel={c} record={manual.find((m) => m.channel === c)} canRecord={mayPublish} onRecorded={setManual} />)}</ul>
          </section>}
        </div>
        <aside className="composer__preview"><PostPreview item={item} accountNames={accountNames} video={video?.url} /></aside>
      </div>}
      {jobs.length > 0 && phase === 'compose' && <p className="u-xs u-muted composer-history">{t(`Published from here before: ${jobs.length} time(s). See the post page for the history.`, `اتنشر من هنا قبل كده ${jobs.length} مرة. السجل في صفحة المنشور.`)}</p>}
    </Dialog>
  );
}

/** TikTok, YouTube and Snapchat choices for one chosen account, inline under it. */
function AccountChoices({ destination: d, choices: c, creator, onChange }: { destination: Destination; choices: Choices; creator?: Creator | 'error'; onChange: (patch: Partial<Choices>) => void }) {
  const { t } = useI18n();
  if (d.provider === 'snapchat') return <div className="composer-choices">
    <label className="ui-field"><span className="ui-field__label">{t('Where on Snapchat', 'مكانه على سناب')}</span><select className="ui-input" value={c.snap} onChange={(e) => onChange({ snap: e.target.value as Choices['snap'] })}><option value="story">Story</option><option value="spotlight">Spotlight</option></select></label>
  </div>;
  if (d.provider === 'youtube') return <div className="composer-choices">
    <label className="ui-field"><span className="ui-field__label">{t('Visibility', 'الظهور')}</span><select className="ui-input" value={c.privacy} onChange={(e) => onChange({ privacy: e.target.value })}><option value="">{t('Choose…', 'اختار…')}</option><option value="public">{t('Public', 'عام')}</option><option value="unlisted">{t('Unlisted', 'غير مدرج')}</option><option value="private">{t('Private', 'خاص')}</option></select></label>
    <label className="ui-field"><span className="ui-field__label">{t('Made for kids?', 'موجّه للأطفال؟')}</span><select className="ui-input" value={c.kids} onChange={(e) => onChange({ kids: e.target.value as Choices['kids'] })}><option value="">{t('Choose…', 'اختار…')}</option><option value="no">{t('No', 'لا')}</option><option value="yes">{t('Yes', 'أيوه')}</option></select></label>
  </div>;
  if (creator === 'error') return <p className="composer-account__note" data-warn><CircleAlert size={13} /> {t('TikTok did not return the account settings. Close and try again in a moment.', 'تيك توك ما رجّعش إعدادات الحساب. اقفل وجرّب كمان شوية.')}</p>;
  if (!creator) return <p className="composer-account__note"><Loader2 size={13} className="creative-job__spin" /> {t('Reading the TikTok account settings…', 'بنقرا إعدادات حساب تيك توك…')}</p>;
  const photo = d.kind === 'image';
  return <div className="composer-choices">
    <p className="composer-choices__who">{t('Posting as', 'هيتنشر باسم')} <b dir="auto">{creator.creator_nickname || d.name}</b>{creator.creator_username && <small dir="ltr"> @{creator.creator_username}</small>}</p>
    <label className="ui-field"><span className="ui-field__label">{t('Who can see it', 'مين يشوفه')}</span><select className="ui-input" value={c.privacy} onChange={(e) => onChange({ privacy: e.target.value })}><option value="">{t('Choose…', 'اختار…')}</option>{(creator.privacy_level_options ?? []).map((p) => <option key={p} value={p}>{PRIVACY[p] ? t(...PRIVACY[p]) : p}</option>)}</select></label>
    <label className="ui-field"><span className="ui-field__label">{t('Promotional content', 'محتوى ترويجي')}</span><select className="ui-input" value={c.commercial} onChange={(e) => onChange({ commercial: e.target.value as Choices['commercial'], buffer: false })}><option value="none">{t('Not promotional', 'غير ترويجي')}</option><option value="own">{t('Your own brand', 'لعلامتك التجارية')}</option><option value="paid">{t('Paid partnership', 'شراكة مدفوعة')}</option><option value="both">{t('Both', 'الاتنين')}</option></select></label>
    <div className="composer-choices__checks">
      <label><input type="checkbox" checked={c.comments} disabled={creator.comment_disabled} onChange={(e) => onChange({ comments: e.target.checked })} /> {t('Allow comments', 'اسمح بالتعليقات')}</label>
      {!photo && <><label><input type="checkbox" checked={c.duet} disabled={creator.duet_disabled} onChange={(e) => onChange({ duet: e.target.checked })} /> {t('Allow Duet', 'اسمح بالـ Duet')}</label><label><input type="checkbox" checked={c.stitch} disabled={creator.stitch_disabled} onChange={(e) => onChange({ stitch: e.target.checked })} /> {t('Allow Stitch', 'اسمح بالـ Stitch')}</label></>}
      <label><input type="checkbox" checked={c.ai} onChange={(e) => onChange({ ai: e.target.checked })} /> {t('Made with AI', 'معمول بالذكاء الاصطناعي')}</label>
      {creator.hybrid && !photo && <label><input type="checkbox" checked={c.buffer} disabled={c.commercial !== 'none'} onChange={(e) => onChange({ buffer: e.target.checked })} /> {t('Allow Buffer first, with its own TikTok interaction settings', 'اسمح بـ Buffer الأول بإعدادات التفاعل بتاعته')}</label>}
    </div>
    {photo && c.ai && <p className="composer-account__note"><CircleAlert size={13} /> {t('AI photos go to the TikTok inbox: open TikTok, turn on the AI label and publish there.', 'صور الذكاء الاصطناعي بتروح صندوق تيك توك: افتح تيك توك، فعّل علامة الذكاء الاصطناعي وانشر من هناك.')}</p>}
  </div>;
}

/** A platform's technical refusal in words the team can act on; the original message stays underneath. */
export function plainError(message: string, t: (en: string, ar: string) => string): string | null {
  if (/\b401\b|reconnect_required|expired|invalid[_ ]?token|OAuthException|authorization/i.test(message)) return t('The account needs reconnecting in Connections, then try again.', 'الحساب محتاج إعادة ربط من صفحة ربط المنصات، وبعدين حاول تاني.');
  if (/\b429\b|rate.?limit|quota|too many/i.test(message)) return t('The platform asked us to slow down. Try again in a few minutes.', 'المنصة طلبت نستنى شوية. حاول تاني بعد دقايق.');
  if (/timeout|timed out|network|ECONN|fetch failed|\b5\d\d\b/i.test(message)) return t('The platform did not answer. Check the account before trying again, so it is not posted twice.', 'المنصة ما ردتش. راجع الحساب قبل ما تحاول تاني علشان المنشور ما يتكررش.');
  if (/privacy|creator/i.test(message)) return t('TikTok changed the account options. Choose who can see it again.', 'تيك توك غيّر اختيارات الحساب. اختار مين يشوف المنشور تاني.');
  return null;
}

/** Each account's result as it comes back, with a retry for the ones that failed. */
function Results({ destinations, outcomes, sending, onRetry }: { destinations: Destination[]; outcomes: Record<string, Outcome>; sending: boolean; onRetry: (d: Destination) => void }) {
  const { t } = useI18n();
  const LABEL: Record<JobRow['state'], [string, string, string]> = {
    published: ['Published', 'اتنشر', 'success'], processing: ['The platform is preparing it', 'المنصة بتجهزه', 'brand'],
    awaiting_user: ['Finish it in the app', 'كمّله من التطبيق', 'warning'], unknown: ['Not confirmed: check the account before retrying', 'غير مؤكد: راجع الحساب قبل ما تعيد', 'warning'], failed: ['Failed', 'فشل', 'danger'],
  };
  return <section className="composer__section">
    <h3>{sending ? t('Publishing…', 'بننشر…') : t('Result', 'النتيجة')}</h3>
    <ul className="composer-results">{destinations.map((d) => {
      const o = outcomes[d.accountId];
      const state = o.sending ? null : o.error ? 'failed' : o.job?.state ?? 'processing';
      const [en, ar, tone] = state ? LABEL[state] : ['Sending…', 'بيتبعت…', 'brand'];
      return <li key={d.accountId} data-state={state ?? 'sending'}>
        <ChannelIcon channel={d.provider} size={18} />
        <span className="composer-results__name"><b><bdi>{d.name}</bdi></b>{!o.sending && (o.error || o.job?.error) && (() => {
          const raw = (o.error || o.job?.error)!;
          const plain = plainError(raw, t);
          return <>{plain && <small className="composer-results__why">{plain}</small>}<small dir="auto" className="composer-results__raw">{raw}</small></>;
        })()}</span>
        <span className={`ui-badge ui-badge--${tone}`}>{o.sending || state === 'processing' ? <Loader2 size={12} className="creative-job__spin" /> : state === 'published' ? <Check size={12} /> : null} {t(en, ar)}</span>
        {!o.sending && o.job?.url && <a href={o.job.url} target="_blank" rel="noreferrer" className="composer-results__open"><ExternalLink size={14} /> {t('Open', 'افتح')}</a>}
        {!o.sending && state === 'failed' && <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => onRetry(d)}>{t('Try again', 'حاول تاني')}</Button>}
      </li>;
    })}</ul>
  </section>;
}

/** Copy the caption, download the design, open the platform; then record that it was published by hand. */
function ManualKit({ item, channel, record, canRecord, onRecorded }: { item: PipelineItem; channel: Channel; record?: ManualPublication; canRecord: boolean; onRecorded: (manual: ManualPublication[]) => void }) {
  const { t, date } = useI18n();
  const caption = item.captions[channel]?.trim() ?? '';
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = OPEN_URL[channel]?.(caption);
  const image = imageForChannel(channel, item.creative);
  const copy = async () => { try { await navigator.clipboard.writeText(caption); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError(t('Could not copy: select the caption in the preview and copy it.', 'تعذّر النسخ: حدد النص من المعاينة وانسخه.')); } };
  const save = async () => {
    setBusy(true); setError('');
    try { onRecorded((await api<{ manual: ManualPublication[] }>(`/api/publishing/${item.id}/manual`, { body: { channel, url: url.trim() || undefined } })).manual); setRecording(false); }
    catch (reason) { setError(errorMessage(reason, t('Could not record it.', 'تعذّر التسجيل.'))); }
    setBusy(false);
  };
  return <li data-done={record ? true : undefined}>
    <div className="composer-manual__head">
      <ChannelIcon channel={channel} size={18} /><b>{platformOf(channel).name}</b>
      {record && <span className="ui-badge ui-badge--success"><Check size={12} /> {t('Published by hand', 'اتنشر يدوي')} · {date(record.at, 'dayShort')}</span>}
      {record?.url && <a href={record.url} target="_blank" rel="noreferrer" className="composer-results__open"><ExternalLink size={14} /> {t('Open', 'افتح')}</a>}
    </div>
    <div className="composer-manual__tools">
      <Button size="sm" variant="secondary" icon={copied ? <Check size={14} /> : <Copy size={14} />} disabled={!caption} onClick={() => void copy()}>{copied ? t('Copied', 'اتنسخ') : t('Copy caption', 'انسخ النص')}</Button>
      {image && <a className="ui-btn ui-btn--secondary ui-btn--sm" href={image} download={`engosoft-${channel}.png`}><Download size={14} /> {t('Download design', 'نزّل التصميم')}</a>}
      {open && <a className="ui-btn ui-btn--secondary ui-btn--sm" href={open} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {t(`Open ${platformOf(channel).name}`, `افتح ${platformOf(channel).name}`)}</a>}
      {canRecord && !record && !recording && <Button size="sm" variant="ghost" icon={<Check size={14} />} onClick={() => setRecording(true)}>{t('I published it', 'نشرته')}</Button>}
    </div>
    {recording && <div className="composer-manual__record">
      {channel !== 'whatsapp' && <input className="ui-input" dir="ltr" placeholder={t('Link to the post (optional)', 'رابط المنشور (اختياري)')} value={url} onChange={(e) => setUrl(e.target.value)} />}
      <Button size="sm" variant="primary" busy={busy} onClick={() => void save()}>{t('Record as published', 'سجّله منشور')}</Button>
      <Button size="sm" variant="ghost" onClick={() => setRecording(false)}>{t('Cancel', 'إلغاء')}</Button>
    </div>}
    {error && <p role="alert" className="creative-home__error">{error}</p>}
  </li>;
}
