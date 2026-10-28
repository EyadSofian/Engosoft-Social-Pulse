import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ExternalLink, Image as ImageIcon, Loader2, MessageSquare, Paintbrush, Search, Send, X } from 'lucide-react';
import { useQueryState, useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../features/auth/AuthProvider';
import { CHANNEL_LABEL, MOVE_LABEL, STATUS_LABEL, type Channel, type PipelineDetail, type PipelineItem, type TeamMember } from '../../features/content-pipeline/types';
import type { ContentStatus } from '../../domain/content';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { ApprovalCard } from '../../features/content-pipeline/ApprovalCard';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { useOverlay } from '../../hooks/ui';
import { businessZone } from '../../lib/format';

type Scope = 'all' | 'mine' | 'department';
type Tab = 'all' | 'review' | 'approved' | 'rejected' | 'drafts';

/** Content grouped by where it stands with marketing: waiting, approved (incl. scheduled and live), not approved, still being made. */
const TABS: { id: Tab; statuses: ContentStatus[]; en: string; ar: string; tone: string }[] = [
  { id: 'all', statuses: [], en: 'All', ar: 'الكل', tone: 'neutral' },
  { id: 'review', statuses: ['ready_for_review'], en: 'Needs approval', ar: 'بانتظار الاعتماد', tone: 'brand' },
  { id: 'approved', statuses: ['approved', 'scheduled', 'published'], en: 'Approved', ar: 'معتمد', tone: 'success' },
  { id: 'rejected', statuses: ['changes_requested', 'cancelled'], en: 'Not approved', ar: 'غير معتمد', tone: 'warning' },
  { id: 'drafts', statuses: ['idea', 'draft', 'in_production'], en: 'Drafts', ar: 'مسودات', tone: 'neutral' },
];
const tabOf = (status: ContentStatus): Tab => TABS.find((tab) => tab.statuses.includes(status))?.id ?? 'all';

export function ContentBoardPage({ openId }: { openId?: string }) {
  const { t, tx, date } = useI18n();
  const { user, departments, can } = useAuth();
  const { navigate } = useRouter();
  usePageMeta(t('Content approval', 'اعتماد المحتوى'), [{ label: t('Content approval', 'اعتماد المحتوى') }]);
  const [items, setItems] = useState<PipelineItem[] | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [params, setParams] = useQueryState();
  const scope = (['all', 'mine', 'department'].includes(params.get('scope') || '') ? params.get('scope') : 'all') as Scope;
  const tab = TABS.some(x => x.id === params.get('tab')) ? params.get('tab') as Tab : null;
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
  const counts = (id: Tab) => id === 'all' ? scoped.filter((item) => !['archived'].includes(item.status)).length : scoped.filter((item) => tabOf(item.status) === id).length;
  // Approvers land on what waits for them; everyone else on the full list.
  const active: Tab = tab ?? (can('content.approve') ? 'review' : 'all');
  const current = TABS.find((entry) => entry.id === active)!;
  const shown = scoped.filter((item) => active === 'all' ? item.status !== 'archived' : current.statuses.includes(item.status));
  const nameOf = (id: string) => team.find((m) => m.id === id)?.name ?? (id === 'system' ? t('Sync', 'المزامنة') : '—');
  const deptOf = (id: string | null) => departments.find((d) => d.id === id);

  const approve = async (item: PipelineItem) => {
    setBusyId(item.id); setError('');
    try { await api(`/api/content/${item.id}/transition`, { body: { to: 'approved' } }); await load(); }
    catch (e) { setError(errorMessage(e, t('That did not work.', 'لم تنجح العملية.'))); }
    setBusyId('');
  };

  return <div className="u-stack u-stack--lg board-page">
    <PageHeader title={t('Content approval', 'اعتماد المحتوى')} description={t('Preview the design, review the copy, and decide what is ready to publish.', 'عاين التصميم، وراجع النص، وحدّد المنشورات الجاهزة للنشر.')} />
    <div className="ca-bar glass">
      <div className="ca-tabs" role="tablist" aria-label={t('Approval', 'الاعتماد')}>
        {TABS.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={active === entry.id} data-tone={entry.tone} onClick={() => setTab(entry.id)}>
          {t(entry.en, entry.ar)}<i className="u-tnum">{counts(entry.id)}</i>
        </button>)}
      </div>
      <div className="ca-bar__tools">
        <div className="board-scope" role="group" aria-label={t('Show', 'اعرض')}>
          {(['all', 'mine', 'department'] as Scope[]).map((value) => <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>
            {value === 'all' ? t('Everyone', 'الكل') : value === 'mine' ? t('Mine', 'منشوراتي') : t('My department', 'قسمي')}
          </button>)}
        </div>
        <label className="board-search"><Search size={15} /><input aria-label={t('Search posts', 'ابحث في المنشورات')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search posts', 'ابحث في المنشورات')} /></label>
        {can('content.create') && <Button variant="primary" onClick={() => navigate('/')}>{t('New post', 'منشور جديد')}</Button>}
      </div>
    </div>
    {items && <div className="ca-summary"><span>{t(current.en, current.ar)} <b className="u-tnum">{shown.length}</b></span><small>{can('content.approve') ? t('Open a preview to review captions and leave feedback.', 'افتح المعاينة لمراجعة النص وكتابة ملاحظاتك.') : t('Follow the approval status of your team’s posts.', 'تابع حالة اعتماد منشورات فريقك.')}</small></div>}
    {error && <div role="alert" className="creative-home__error">{error} <Button variant="secondary" size="sm" onClick={() => void load()}>{t('Retry', 'أعد المحاولة')}</Button></div>}
    {!items && !error && <div className="board-loading"><Loader2 className="creative-job__spin" size={22} /></div>}
    {items && <>
      {shown.length > 0
        ? <div className="ca-grid">

          {shown.slice(0, limit).map(item => <ApprovalCard key={item.id} item={item} owner={nameOf(item.ownerId)} department={deptOf(item.departmentId) ? tx(deptOf(item.departmentId)!.name) : undefined} busy={busyId === item.id} disabled={Boolean(busyId)} onOpen={() => navigate(boardPath(item.id))} onApprove={() => void approve(item)} />)}
        </div>
        : <div className="ca-empty glass"><CheckCircle2 size={26} /><b>{active === 'review' ? t('Nothing is waiting for approval.', 'لا شيء بانتظار الاعتماد.') : t('No posts here.', 'لا توجد منشورات هنا.')}</b><p>{t('Posts move between these tabs as they are sent, approved or returned.', 'تنتقل المنشورات بين هذه التابات عند إرسالها أو اعتمادها أو إعادتها.')}</p></div>}
    </>}
    {shown.length > limit && <Button variant="secondary" onClick={() => setLimit(value => value + 40)}>{t('Show more posts', 'اعرض منشورات أكثر')}</Button>}
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
  const [note, setNote] = useState('');
  const [when, setWhen] = useState('');
  const [comment, setComment] = useState('');
  const [captions, setCaptions] = useState<Partial<Record<Channel, string>>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<Channel | null>(null);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(null), 1600); return () => clearTimeout(timer); }, [copied]);
  const load = useCallback(() => api<PipelineDetail>(`/api/content/${id}`).then((d) => { setItem(d); setCaptions(d.captions); }).catch((e) => setError(errorMessage(e, 'Not found'))), [id]);
  useEffect(() => { void load(); }, [load]);
  const nameOf = (uid: string) => team.find((m) => m.id === uid)?.name ?? (uid === 'system' ? t('Sync', 'المزامنة') : '—');

  /** Runs one action, then clears only the field that action used: saving captions keeps a half-written comment. */
  const act = async (work: () => Promise<unknown>, clear?: 'note' | 'comment') => {
    setBusy(true); setError('');
    try { await work(); await load(); onChanged(); if (clear === 'note') { setNote(''); setWhen(''); } if (clear === 'comment') setComment(''); }
    catch (e) { setError(errorMessage(e, t('That did not work.', 'لم تنجح العملية.'))); }
    setBusy(false);
  };
  const nowLocal = DateTime.now().setZone(businessZone()).toFormat("yyyy-LL-dd'T'HH:mm");
  const whenPast = Boolean(when) && when < nowLocal;
  const move = (to: ContentStatus) => act(() => api(`/api/content/${id}/transition`, { body: { to, ...(note.trim() ? { note } : {}), ...(to === 'scheduled' && when ? { scheduledAt: DateTime.fromISO(when, { zone: businessZone() }).toUTC().toISO() } : {}) } }), 'note');
  const captionsChanged = item && JSON.stringify(captions) !== JSON.stringify(item.captions);
  const image = preview ?? item?.creative?.imageUrl;

  return <div className="ui-overlay">
    <motion.div className="ui-overlay__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
    <motion.aside ref={overlay} tabIndex={-1} role="dialog" aria-modal="true" aria-label={item?.title ?? t('Post preview', 'معاينة المنشور')} className="content-drawer glass"
      initial={{ x: dir === 'rtl' ? -40 : 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: dir === 'rtl' ? -40 : 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
      <header className="content-drawer__head">
        <div>{item && <span className="content-status" data-status={item.status}>{tx(STATUS_LABEL[item.status])}</span>}<h2 dir="auto">{item?.title ?? '…'}</h2></div>
        <button type="button" className="content-drawer__close" onClick={onClose} aria-label={t('Close', 'إغلاق')}><X size={18} /></button>
      </header>
      {!item && !error && <Loader2 className="creative-job__spin" size={22} />}
      {error && <p role="alert" className="creative-home__error">{error}</p>}
      {item && <div className="content-drawer__body">
        <div className="content-drawer__media">
          {image ? <img src={image} alt={item.title} /> : <span className="board-card__placeholder"><ImageIcon size={26} /></span>}
          {item.creative?.storyUrl && <img className="content-drawer__story" src={item.creative.storyUrl} alt="9:16" />}
        </div>
        {item.creative?.youtubeUrl && <a className="ui-link" href={item.creative.youtubeUrl} download>{t('Download YouTube thumbnail 16:9', 'نزّل صورة يوتيوب 16:9')}</a>}
        {item.editable && item.creative && (can('design.free') || item.creative.svgTemplate) && !['published', 'archived', 'cancelled'].includes(item.status) && <Button variant="secondary" onClick={() => navigate(item.creative!.svgTemplate ? `/library/templates/${item.creative!.svgTemplate.id}?content=${item.id}` : `/studio/${item.id}`)}><Paintbrush size={15} /> {item.creative.requestId === 'reference-design' ? t('Generate a new version from the reference', 'ولّد نسخة جديدة من المرجع') : item.creative.svgTemplate ? t('Edit the template', 'عدّل في القالب') : t('Open in Studio', 'افتح في الاستوديو')}</Button>}

        {item.published?.length ? <section className="content-drawer__section"><h3>{t('Live results', 'النتائج على المنصات')}</h3>
          {item.published.map((p) => <a key={p.permalink} href={p.permalink} target="_blank" rel="noreferrer" className="content-live">{p.platform} · {t('views', 'مشاهدات')} {p.metrics.views ?? '—'} · {t('reach', 'وصول')} {p.metrics.reach ?? '—'} <ExternalLink size={13} /></a>)}
        </section> : null}

        {item.moves.length > 0 && <section className="content-drawer__section content-drawer__actions"><h3>{t('Next step', 'الخطوة التالية')}</h3>
          {item.moves.some((m) => m.needsNote) && <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note for the owner (required to request changes or cancel)', 'ملاحظة لصاحب المنشور (مطلوبة عند طلب التعديل أو الإلغاء)')} dir="auto" />}
          {item.moves.some((m) => m.to === 'scheduled') && <label>{t('Publish at', 'ميعاد النشر')} · {businessZone()}<input type="datetime-local" min={nowLocal} value={when} onChange={(e) => setWhen(e.target.value)} /></label>}
          {whenPast && <small role="alert" className="creative-home__error">{t('This time has already passed. Choose a future time.', 'هذا الموعد مضى بالفعل. اختر موعدًا قادمًا.')}</small>}
          <div className="content-drawer__buttons">{item.moves.map((m) => <Button key={m.to} variant={m.to === 'approved' || m.to === 'ready_for_review' || m.to === 'scheduled' ? 'primary' : 'secondary'} disabled={busy || (m.needsNote && !note.trim()) || (m.to === 'scheduled' && (!when || whenPast))} onClick={() => void move(m.to)}>{tx(MOVE_LABEL[m.to] ?? STATUS_LABEL[m.to])}</Button>)}</div>
        </section>}

        <section className="content-drawer__section"><h3>{t('Captions', 'النص المرافق')}</h3>
          {item.channels.map((channel) => <label key={channel} className="content-caption">{CHANNEL_LABEL[channel]}
            <textarea rows={channel === 'facebook' || channel === 'linkedin' ? 5 : 3} dir="auto" value={captions[channel] ?? ''} disabled={!item.editable} onChange={(e) => setCaptions((c) => ({ ...c, [channel]: e.target.value }))} />
            <button type="button" className="ui-link" onClick={() => void navigator.clipboard.writeText(captions[channel] ?? '').then(() => setCopied(channel), () => setError(t('Copy is blocked in this browser; select the text instead.', 'المتصفح منع النسخ؛ حدّد النص وانسخه يدويًا.')))}>{copied === channel ? t('Copied', 'تم النسخ') : t('Copy', 'انسخ')}</button>
          </label>)}
          {captionsChanged && <Button variant="primary" disabled={busy} onClick={() => void act(() => api(`/api/content/${id}`, { method: 'PATCH', body: { captions } }))}>{t('Save captions', 'احفظ النص المرافق')}</Button>}
        </section>

        {item.versions.length > 1 && <section className="content-drawer__section"><h3>{t('Versions', 'النسخ')}</h3>
          <div className="content-versions">{item.versions.map((v) => <button key={v.id} type="button" aria-pressed={image === v.imageUrl} onClick={() => setPreview(v.imageUrl)}><img src={v.imageUrl} alt="" /><small dir="auto">{v.note}</small></button>)}</div>
        </section>}

        <section className="content-drawer__section"><h3><MessageSquare size={15} /> {t('Activity', 'السجل')}</h3>
          <ol className="content-timeline">{item.events.map((e) => <li key={e.id} data-kind={e.kind}>
            <b>{nameOf(e.actorId)}</b> <span>{e.kind === 'transition' && e.to ? `→ ${tx(STATUS_LABEL[e.to as ContentStatus] ?? { en: e.to, ar: e.to })}` : e.kind === 'comment' ? '' : e.kind === 'created' ? t('created', 'أنشأ') : e.kind === 'version' ? t('new version', 'نسخة جديدة') : t('edited captions', 'عدّل النص المرافق')}</span>
            {e.body && <p dir="auto">{e.body}</p>}<time>{date(e.createdAt, 'dateTime')}</time>
          </li>)}</ol>
          <div className="content-comment"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('Write a comment', 'اكتب تعليقًا')} dir="auto" /><Button variant="secondary" disabled={busy || !comment.trim()} onClick={() => void act(() => api(`/api/content/${id}/comments`, { body: { body: comment } }), 'comment')}><Send size={14} /></Button></div>
        </section>
      </div>}
    </motion.aside>
  </div>;
}
