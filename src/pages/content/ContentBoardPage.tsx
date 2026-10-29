import { PublishContent } from '../../features/publishing/PublishContent';
import { SizesPanel } from '../../features/creative-studio/SizesPanel';
import { isReel, ReelPlayer } from '../../features/reels/ReelPlayer';
import { PublishDialog } from '../../features/publishing/PublishDialog';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { GoalBadge, PostPlanCard } from '../../features/content-pipeline/PostPlan';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ExternalLink, Image as ImageIcon, Loader2, MessageSquare, Paintbrush, Pencil, Search, Send, X } from 'lucide-react';
import { Dialog } from '../../components/overlay/Overlay';
import { useQueryState, useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../features/auth/AuthProvider';
import { CHANNEL_LABEL, STATUS_LABEL, type Channel, type PipelineDetail, type PipelineItem, type TeamMember } from '../../features/content-pipeline/types';
import type { ContentStatus } from '../../domain/content';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { ApprovalCard } from '../../features/content-pipeline/ApprovalCard';
import { ContentCopilot } from '../../features/content/ContentCopilot';
import { NextStep, type MoveInput } from '../../features/content-pipeline/NextStep';
import { Journey, JOURNEY, NextForYou, stageOf, type JourneyStage } from '../../features/content-pipeline/Journey';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { useOverlay } from '../../hooks/ui';

type Scope = 'all' | 'mine' | 'department';
type Tab = 'all' | JourneyStage;
/** Older links used approval-state tabs; they open the matching stop on the journey. */
const LEGACY_TAB: Record<string, Tab> = { drafts: 'making', approved: 'ready', rejected: 'making' };

export function ContentBoardPage({ openId }: { openId?: string }) {
  const { t, tx, date } = useI18n();
  const { user, departments, can } = useAuth();
  const { navigate } = useRouter();
  usePageMeta(t('Content & approval', 'المحتوى والاعتماد'), [{ label: t('Content & approval', 'المحتوى والاعتماد') }]);
  const [items, setItems] = useState<PipelineItem[] | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [params, setParams] = useQueryState();
  const scope = (['all', 'mine', 'department'].includes(params.get('scope') || '') ? params.get('scope') : 'all') as Scope;
  const requestedTab = params.get('tab') || '';
  const tab: Tab | null = requestedTab === 'all' || JOURNEY.some((stage) => stage.id === requestedTab) ? requestedTab as Tab : LEGACY_TAB[requestedTab] ?? null;
  const query = params.get('q') || '';
  const [limit, setLimit] = useState(40);
  const setScope = (value: Scope) => { setParams({ scope: value }); setLimit(40); };
  const setTab = (value: Tab) => { setParams({ tab: value }); setLimit(40); };
  const setQuery = (value: string) => { setParams({ q: value }); setLimit(40); };
  const boardPath = (id?: string) => `/content${id ? `/${id}` : ''}${params.size ? `?${params}` : ''}`;
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => api<PipelineItem[]>('/api/content').then((data) => { setItems(data); setError(''); }).catch((e) => setError(errorMessage(e, t('Could not load content.', 'تعذّر تحميل المحتوى.')))), [t]);
  useEffect(() => { void load(); void api<TeamMember[]>('/api/users').then(setTeam).catch(() => {}); }, [load]);

  const scoped = useMemo(() => (items ?? []).filter((item) =>
    (scope === 'all' || (scope === 'mine' ? item.ownerId === user.id : item.departmentId === user.departmentId))
    && (!query.trim() || item.title.toLowerCase().includes(query.trim().toLowerCase()))), [items, scope, query, user]);
  // Approvers land on what waits for them; everyone else on the full list.
  const active: Tab = tab ?? (can('content.approve') ? 'review' : 'all');
  const current = JOURNEY.find((stage) => stage.id === active);
  const shown = scoped.filter((item) => active === 'all' ? item.status !== 'archived' : stageOf(item.status) === active);
  const allCount = scoped.filter((item) => item.status !== 'archived').length;
  const [publishing, setPublishing] = useState<PipelineItem | null>(null);
  const canPublish = can('content.publish') || can('content.schedule');
  const nameOf = (id: string) => team.find((m) => m.id === id)?.name ?? (id === 'system' ? t('Sync', 'المزامنة') : '—');
  const deptOf = (id: string | null) => departments.find((d) => d.id === id);

  const move = async (item: PipelineItem, to: ContentStatus) => {
    setBusyId(item.id); setError('');
    try { await api(`/api/content/${item.id}/transition`, { body: { to } }); await load(); }
    catch (e) { setError(errorMessage(e, t('That did not work.', 'لم تنجح العملية.'))); }
    setBusyId('');
  };

  return <div className="u-stack u-stack--lg board-page">
    <PageHeader title={t('Content & approval', 'المحتوى والاعتماد')} description={t('Every post moves through the same five steps. Press a step to see its posts; each card says who has it and what to do next.', 'كل منشور بيمشي في نفس الخمس خطوات. اضغط على أي خطوة تشوف منشوراتها، وكل كارت بيقولك هو عند مين والخطوة الجاية إيه.')} />
    {items && <Journey items={scoped} active={active === 'all' ? null : active} onSelect={(stage) => setTab(active === stage ? 'all' : stage)} />}
    {items && <NextForYou items={scoped} onGo={(stage) => stage === 'ready' ? navigate('/publish?view=ready') : setTab(stage)} />}
    <div className="ca-bar glass">
      <div className="ca-bar__tools">
        <button type="button" className="ca-filter-all" aria-pressed={active === 'all'} onClick={() => setTab('all')}>{t('All posts', 'كل المنشورات')} <i className="u-tnum">{allCount}</i></button>
        <div className="board-scope" role="group" aria-label={t('Show', 'اعرض')}>
          {(['all', 'mine', 'department'] as Scope[]).map((value) => <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>
            {value === 'all' ? t('Everyone', 'الكل') : value === 'mine' ? t('Mine', 'منشوراتي') : t('My department', 'قسمي')}
          </button>)}
        </div>
        <label className="board-search"><Search size={15} /><input aria-label={t('Search posts', 'ابحث في المنشورات')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search posts', 'ابحث في المنشورات')} /></label>
        {can('content.create') && <Button variant="primary" onClick={() => navigate('/')}>{t('New post', 'منشور جديد')}</Button>}
      </div>
    </div>
    {items && <div className="ca-summary"><span>{current ? t(current.en, current.ar) : t('All posts', 'كل المنشورات')} <b className="u-tnum">{shown.length}</b></span><small>{current ? t(current.whoEn, current.whoAr) : t('Press a step above to narrow the list.', 'اضغط على خطوة فوق علشان تفلتر القائمة.')}</small></div>}
    {error && <div role="alert" className="creative-home__error">{error} <Button variant="secondary" size="sm" onClick={() => void load()}>{t('Retry', 'أعد المحاولة')}</Button></div>}
    {!items && !error && <div className="board-loading"><Loader2 className="creative-job__spin" size={22} /></div>}
    {items && <>
      {shown.length > 0
        ? <div className="ca-grid">

          {shown.slice(0, limit).map(item => <ApprovalCard key={item.id} item={item} owner={nameOf(item.ownerId)} department={deptOf(item.departmentId) ? tx(deptOf(item.departmentId)!.name) : undefined} busy={busyId === item.id} disabled={Boolean(busyId)} onOpen={() => navigate(boardPath(item.id))} onApprove={() => void move(item, 'approved')} onSend={() => void move(item, 'ready_for_review')} onPublish={canPublish ? () => setPublishing(item) : undefined} />)}
        </div>
        : <div className="ca-empty glass"><CheckCircle2 size={26} /><b>{active === 'review' ? t('Nothing is waiting for approval.', 'لا شيء بانتظار الاعتماد.') : t('No posts at this step.', 'مفيش منشورات في الخطوة دي.')}</b><p>{t('Posts move to the next step when they are sent, approved, scheduled or published.', 'المنشور بينتقل للخطوة اللي بعدها لما يتبعت أو يتعتمد أو يتجدول أو يتنشر.')}</p></div>}
    </>}
    {shown.length > limit && <Button variant="secondary" onClick={() => setLimit(value => value + 40)}>{t('Show more posts', 'اعرض منشورات أكثر')}</Button>}
    {publishing && <PublishDialog item={publishing} open onClose={() => setPublishing(null)} onDone={() => void load()} />}
    <AnimatePresence>{openId && <ContentDrawer key={openId} id={openId} team={team} onClose={() => navigate(boardPath())} onChanged={load} />}</AnimatePresence>
  </div>;
}

function ContentDrawer({ id, team, onClose, onChanged }: { id: string; team: TeamMember[]; onClose: () => void; onChanged: () => void }) {
  const { t, tx, dir, date } = useI18n();
  const overlay = useOverlay(true, onClose);
  const { can } = useAuth();
  const { navigate } = useRouter();
  const [item, setItem] = useState<PipelineDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [captions, setCaptions] = useState<Partial<Record<Channel, string>>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');
  const load = useCallback(() => api<PipelineDetail>(`/api/content/${id}`).then((d) => { setItem(d); setCaptions(d.captions); }).catch((e) => setError(errorMessage(e, 'Not found'))), [id]);
  useEffect(() => { void load(); }, [load]);
  const nameOf = (uid: string) => team.find((m) => m.id === uid)?.name ?? (uid === 'system' ? t('Sync', 'المزامنة') : '—');

  /** Runs one action and reports whether it worked; a comment is cleared only when it was the one sent. */
  const act = async (work: () => Promise<unknown>, clear?: 'comment') => {
    setBusy(true); setError('');
    let ok = false;
    try { await work(); await load(); onChanged(); if (clear === 'comment') setComment(''); ok = true; }
    catch (e) { setError(errorMessage(e, t('That did not work.', 'لم تنجح العملية.'))); }
    setBusy(false);
    return ok;
  };
  const captionsChanged = item && JSON.stringify(captions) !== JSON.stringify(item.captions);
  // Edited captions travel with the post: they are saved before it moves (sent for review, approved, scheduled).
  const move = (to: ContentStatus, input: MoveInput) => act(async () => {
    if (captionsChanged && item?.editable) await api(`/api/content/${id}`, { method: 'PATCH', body: { captions } });
    await api(`/api/content/${id}/transition`, { body: { to, ...input } });
  });
  const image = preview ?? item?.creative?.imageUrl;

  return <div className="ui-overlay">
    <motion.div className="ui-overlay__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
    <motion.aside ref={overlay} tabIndex={-1} data-overlay role="dialog" aria-modal="true" aria-label={item?.title ?? t('Post preview', 'معاينة المنشور')} className="content-drawer content-drawer--wide glass"
      initial={{ x: dir === 'rtl' ? -40 : 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: dir === 'rtl' ? -40 : 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
      <header className="content-drawer__head">
        <div>
          {item && <span className="content-drawer__facts"><span className="content-status" data-status={item.status}>{tx(STATUS_LABEL[item.status])}</span><GoalBadge goal={item.goal} empty />{(item.scheduledAt ?? item.plannedFor) && <small className="u-tnum">{date((item.scheduledAt ?? item.plannedFor)!, 'weekdayDate')}</small>}<span className="content-drawer__channels">{item.channels.map((channel) => <ChannelIcon key={channel} channel={channel} size={14} />)}</span></span>}
          <h2 dir="auto">{item?.title ?? '…'}</h2>
        </div>
        <span className="content-drawer__tools">
          {item?.canReopen && <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => setReopening(true)}>{t('Edit post', 'تعديل المنشور')}</Button>}
          <button type="button" className="content-drawer__close" onClick={onClose} aria-label={t('Close', 'إغلاق')}><X size={18} /></button>
        </span>
      </header>
      {item && <Dialog open={reopening} onClose={() => setReopening(false)} title={t('Edit this post', 'تعديل هذا المنشور')}
        description={item.status === 'scheduled'
          ? t('Editing an approved post takes it off the calendar and stops its automatic publishing. It goes back for changes and must be approved again.', 'تعديل منشور معتمد يشيله من التقويم ويوقف نشره التلقائي، ويرجعه للتعديل، ولازم يتعتمد تاني قبل النشر.')
          : t('Editing an approved post sends it back for changes. It must be approved again before publishing.', 'تعديل منشور معتمد يرجعه للتعديل، ولازم يتعتمد تاني قبل النشر.')}
        footer={<><Button variant="ghost" onClick={() => setReopening(false)}>{t('Cancel', 'إلغاء')}</Button>
          <Button variant="primary" icon={<Pencil size={15} />} busy={busy} disabled={!reason.trim()} onClick={() => void act(() => api(`/api/content/${id}/reopen`, { body: { note: reason } })).then((ok) => { if (ok) { setReopening(false); setReason(''); } })}>{t('Open for editing', 'افتح للتعديل')}</Button></>}>
        <label className="ui-field"><span className="ui-field__label">{t('What needs to change?', 'إيه اللي محتاج يتغيّر؟')}</span><textarea className="ui-input" rows={3} dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('e.g. the course date is wrong', 'مثال: تاريخ الدورة غلط')} /></label>
      </Dialog>}
      {!item && !error && <Loader2 className="creative-job__spin" size={22} />}
      {error && !item && <p role="alert" className="creative-home__error">{error}</p>}
      {item && <div className="content-drawer__body content-drawer__layout">
        <div className="content-drawer__post">
        {/* What happens next comes first: it was below a tall preview and easy to miss. */}
        {publishing && <PublishDialog item={item} open onClose={() => setPublishing(false)} onDone={() => { void load(); onChanged(); }} />}
        <NextStep key={item.status} item={item} busy={busy} onMove={move} onPublish={can('content.publish') || can('content.schedule') ? () => setPublishing(true) : undefined} />
        {isReel(item.creative) ? <ReelPlayer contentId={item.id} cover={image ?? undefined} /> : <div className="content-drawer__media">
          {image ? <img src={image} alt={item.title} /> : <span className="board-card__placeholder"><ImageIcon size={26} /></span>}
          {item.creative?.storyUrl && <img className="content-drawer__story" src={item.creative.storyUrl} alt="9:16" />}
        </div>}
        {item.creative?.youtubeUrl && <a className="ui-link" href={item.creative.youtubeUrl} download>{t('Download YouTube thumbnail 16:9', 'نزّل صورة يوتيوب 16:9')}</a>}
        {item.editable && item.creative && (item.creative.svgTemplate ? can('design.templates') : can('design.free')) && !['published', 'archived', 'cancelled'].includes(item.status) && <Button variant="secondary" onClick={() => navigate(item.creative!.svgTemplate ? `/library/templates/${item.creative!.svgTemplate.id}?content=${item.id}` : `/studio/${item.id}`)}><Paintbrush size={15} /> {item.creative.requestId === 'reference-design' ? t('Generate a new version from the reference', 'ولّد نسخة جديدة من المرجع') : item.creative.svgTemplate ? t('Edit the template', 'عدّل في القالب') : t('Open in Studio', 'افتح في الاستوديو')}</Button>}

        {item.published?.length ? <section className="content-drawer__section"><h3>{t('Live results', 'النتائج على المنصات')}</h3>
          {item.published.map((p) => <a key={p.permalink} href={p.permalink} target="_blank" rel="noreferrer" className="content-live">{p.platform} · {t('views', 'مشاهدات')} {p.metrics.views ?? '—'} · {t('reach', 'وصول')} {p.metrics.reach ?? '—'} <ExternalLink size={13} /></a>)}
        </section> : null}

        <PostPlanCard key={`${item.goal}-${item.plannedFor}`} item={item} onSaved={() => { void load(); onChanged(); }} />
        <PublishContent item={item} />
        {error && <p role="alert" className="creative-home__error">{error}</p>}

        </div>

        {/* The second column carries the words, the sizes and the history, so neither column ends in empty space. */}
        <div className="content-drawer__side">
          <ContentCopilot contentId={id} channels={item.channels} captions={captions} onCaptions={setCaptions} editable={item.editable}
            footer={captionsChanged ? <Button variant="primary" disabled={busy} onClick={() => void act(() => api(`/api/content/${id}`, { method: 'PATCH', body: { captions } }))}>{t('Save captions', 'احفظ النص المرافق')}</Button> : null} />
          {!isReel(item.creative) && <SizesPanel item={item} onChanged={() => { void load(); onChanged(); }} />}
          {item.versions.length > 1 && <section className="content-drawer__section content-drawer__section--late"><h3>{t('Versions', 'النسخ')}</h3>
            <div className="content-versions">{item.versions.map((v) => <button key={v.id} type="button" aria-pressed={image === v.imageUrl} onClick={() => setPreview(v.imageUrl)}><img src={v.imageUrl} alt="" /><small dir="auto">{v.note}</small></button>)}</div>
          </section>}

          <section className="content-drawer__section content-drawer__section--late"><h3><MessageSquare size={15} /> {t('Activity', 'السجل')}</h3>
            <ol className="content-timeline">{item.events.map((e) => <li key={e.id} data-kind={e.kind}>
              <b>{nameOf(e.actorId)}</b> <span>{e.kind === 'transition' && e.to ? `→ ${tx(STATUS_LABEL[e.to as ContentStatus] ?? { en: e.to, ar: e.to })}` : e.kind === 'comment' ? '' : e.kind === 'created' ? t('created', 'أنشأ') : e.kind === 'version' ? t('new version', 'نسخة جديدة') : t('edited captions', 'عدّل النص المرافق')}</span>
              {e.body && <p dir="auto">{e.body}</p>}<time>{date(e.createdAt, 'dateTime')}</time>
            </li>)}</ol>
            <div className="content-comment"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('Write a comment', 'اكتب تعليقًا')} dir="auto" /><Button variant="secondary" disabled={busy || !comment.trim()} onClick={() => void act(() => api(`/api/content/${id}/comments`, { body: { body: comment } }), 'comment')}><Send size={14} /></Button></div>
          </section>
        </div>
      </div>}
    </motion.aside>
  </div>;
}
