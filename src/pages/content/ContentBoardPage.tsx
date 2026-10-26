import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Clock3, ExternalLink, Image as ImageIcon, Loader2, MessageSquare, Paintbrush, Search, Send, X } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../features/auth/AuthProvider';
import { CHANNEL_LABEL, COLUMNS, MOVE_LABEL, STATUS_LABEL, type Channel, type PipelineDetail, type PipelineItem, type TeamMember } from '../../features/content-pipeline/types';
import type { ContentStatus } from '../../domain/content';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type Scope = 'all' | 'mine' | 'department';

export function ContentBoardPage({ openId }: { openId?: string }) {
  const { t, tx } = useI18n();
  const { user, departments } = useAuth();
  const { navigate } = useRouter();
  usePageMeta(t('Content', 'المحتوى'), [{ label: t('Content', 'المحتوى') }]);
  const [items, setItems] = useState<PipelineItem[] | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(() => api<PipelineItem[]>('/api/content').then(setItems).catch((e) => setError(errorMessage(e, t('Could not load content.', 'تعذّر تحميل المحتوى.')))), [t]);
  useEffect(() => { void load(); void api<TeamMember[]>('/api/users').then(setTeam).catch(() => {}); }, [load]);

  const visible = useMemo(() => (items ?? []).filter((item) =>
    (scope === 'all' || (scope === 'mine' ? item.ownerId === user.id : item.departmentId === user.departmentId))
    && (!query.trim() || item.title.toLowerCase().includes(query.trim().toLowerCase()))), [items, scope, query, user]);
  const nameOf = (id: string) => team.find((m) => m.id === id)?.name ?? (id === 'system' ? t('Sync', 'المزامنة') : '—');
  const deptOf = (id: string | null) => departments.find((d) => d.id === id);

  return <div className="u-stack u-stack--lg board-page">
    <PageHeader title={t('Content', 'المحتوى')} description={t('Every department’s posts, from draft to published. Marketing reviews, approves and schedules; publishing is confirmed by the platform sync.', 'بوستات كل الأقسام من المسودة لحد النشر. التسويق بيراجع ويعتمد ويجدول، والنشر بيتأكد من مزامنة المنصات.')} />
    <div className="board-toolbar glass">
      <div className="board-scope" role="group" aria-label={t('Show', 'اعرض')}>
        {(['all', 'mine', 'department'] as Scope[]).map((value) => <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>
          {value === 'all' ? t('All I can see', 'كل اللي يخصني') : value === 'mine' ? t('Mine', 'بتاعي') : t('My department', 'قسمي')}
        </button>)}
      </div>
      <label className="board-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search posts', 'ابحث في البوستات')} /></label>
      <Button variant="primary" onClick={() => navigate('/')}>{t('New post', 'بوست جديد')}</Button>
    </div>
    {error && <p role="alert" className="creative-home__error">{error}</p>}
    {!items && !error && <div className="board-loading"><Loader2 className="creative-job__spin" size={22} /></div>}
    {items && <LayoutGroup>
      <div className="board-columns">
        {COLUMNS.map((column) => {
          const cards = visible.filter((item) => column.statuses.includes(item.status));
          return <section key={column.id} className="board-column glass" data-tone={column.tone}>
            <header><h2>{tx(column.label)}</h2><span className="u-tnum">{cards.length}</span></header>
            <div className="board-column__cards">
              <AnimatePresence initial={false}>
                {cards.map((item) => <motion.button layout layoutId={`card-${item.id}`} key={item.id} type="button" className="board-card" onClick={() => navigate(`/content/${item.id}`)}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
                  {item.creative?.imageUrl ? <img src={item.creative.imageUrl} alt="" loading="lazy" /> : <span className="board-card__placeholder"><ImageIcon size={20} /></span>}
                  <span className="board-card__body">
                    <b dir="auto">{item.title}</b>
                    <small>{nameOf(item.ownerId)}{deptOf(item.departmentId) ? ` · ${tx(deptOf(item.departmentId)!.name)}` : ''}</small>
                    <span className="board-card__chips">{item.channels.map((c) => <i key={c}>{CHANNEL_LABEL[c]}</i>)}</span>
                    {item.scheduledAt && <small className="board-card__when"><Clock3 size={12} />{new Date(item.scheduledAt).toLocaleString()}</small>}
                  </span>
                </motion.button>)}
              </AnimatePresence>
              {!cards.length && <p className="board-empty">{t('Nothing here', 'مفيش حاجة هنا')}</p>}
            </div>
          </section>;
        })}
      </div>
    </LayoutGroup>}
    <AnimatePresence>{openId && <ContentDrawer key={openId} id={openId} team={team} onClose={() => navigate('/content')} onChanged={load} />}</AnimatePresence>
  </div>;
}

function ContentDrawer({ id, team, onClose, onChanged }: { id: string; team: TeamMember[]; onClose: () => void; onChanged: () => void }) {
  const { t, tx, dir } = useI18n();
  const { navigate } = useRouter();
  const [item, setItem] = useState<PipelineDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [when, setWhen] = useState('');
  const [comment, setComment] = useState('');
  const [captions, setCaptions] = useState<Partial<Record<Channel, string>>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const load = useCallback(() => api<PipelineDetail>(`/api/content/${id}`).then((d) => { setItem(d); setCaptions(d.captions); }).catch((e) => setError(errorMessage(e, 'Not found'))), [id]);
  useEffect(() => { void load(); }, [load]);
  const nameOf = (uid: string) => team.find((m) => m.id === uid)?.name ?? (uid === 'system' ? t('Sync', 'المزامنة') : '—');

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await work(); await load(); onChanged(); setNote(''); setComment(''); }
    catch (e) { setError(errorMessage(e, t('That did not work.', 'العملية منجحتش.'))); }
    setBusy(false);
  };
  const move = (to: ContentStatus) => act(() => api(`/api/content/${id}/transition`, { body: { to, ...(note.trim() ? { note } : {}), ...(to === 'scheduled' && when ? { scheduledAt: new Date(when).toISOString() } : {}) } }));
  const captionsChanged = item && JSON.stringify(captions) !== JSON.stringify(item.captions);
  const image = preview ?? item?.creative?.imageUrl;

  return <div className="ui-overlay">
    <motion.div className="ui-overlay__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
    <motion.aside role="dialog" aria-modal="true" aria-label={item?.title ?? ''} className="content-drawer glass"
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
        {item.editable && item.creative && !['published', 'archived', 'cancelled'].includes(item.status) && <Button variant="secondary" onClick={() => navigate(`/studio/${item.id}`)}><Paintbrush size={15} /> {t('Open in Studio', 'افتح في الستوديو')}</Button>}

        {item.published?.length ? <section className="content-drawer__section"><h3>{t('Live results', 'النتايج على المنصات')}</h3>
          {item.published.map((p) => <a key={p.permalink} href={p.permalink} target="_blank" rel="noreferrer" className="content-live">{p.platform} · {t('views', 'مشاهدات')} {p.metrics.views ?? '—'} · {t('reach', 'وصول')} {p.metrics.reach ?? '—'} <ExternalLink size={13} /></a>)}
        </section> : null}

        {item.moves.length > 0 && <section className="content-drawer__section content-drawer__actions"><h3>{t('Next step', 'الخطوة الجاية')}</h3>
          {item.moves.some((m) => m.needsNote) && <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note for the owner (required to request changes or cancel)', 'ملاحظة لصاحب البوست (لازم لو هتطلب تعديل أو تلغي)')} dir="auto" />}
          {item.moves.some((m) => m.to === 'scheduled') && <label>{t('Publish at', 'ميعاد النشر')}<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>}
          <div className="content-drawer__buttons">{item.moves.map((m) => <Button key={m.to} variant={m.to === 'approved' || m.to === 'ready_for_review' || m.to === 'scheduled' ? 'primary' : 'secondary'} disabled={busy || (m.needsNote && !note.trim()) || (m.to === 'scheduled' && !when)} onClick={() => void move(m.to)}>{tx(MOVE_LABEL[m.to] ?? STATUS_LABEL[m.to])}</Button>)}</div>
        </section>}

        <section className="content-drawer__section"><h3>{t('Captions', 'الكابشن')}</h3>
          {item.channels.map((channel) => <label key={channel} className="content-caption">{CHANNEL_LABEL[channel]}
            <textarea rows={channel === 'facebook' || channel === 'linkedin' ? 5 : 3} dir="auto" value={captions[channel] ?? ''} disabled={!item.editable} onChange={(e) => setCaptions((c) => ({ ...c, [channel]: e.target.value }))} />
            <button type="button" className="ui-link" onClick={() => void navigator.clipboard.writeText(captions[channel] ?? '')}>{t('Copy', 'انسخ')}</button>
          </label>)}
          {captionsChanged && <Button variant="primary" disabled={busy} onClick={() => void act(() => api(`/api/content/${id}`, { method: 'PATCH', body: { captions } }))}>{t('Save captions', 'احفظ الكابشن')}</Button>}
        </section>

        {item.versions.length > 1 && <section className="content-drawer__section"><h3>{t('Versions', 'النسخ')}</h3>
          <div className="content-versions">{item.versions.map((v) => <button key={v.id} type="button" aria-pressed={image === v.imageUrl} onClick={() => setPreview(v.imageUrl)}><img src={v.imageUrl} alt="" /><small dir="auto">{v.note}</small></button>)}</div>
        </section>}

        <section className="content-drawer__section"><h3><MessageSquare size={15} /> {t('Activity', 'السجل')}</h3>
          <ol className="content-timeline">{item.events.map((e) => <li key={e.id} data-kind={e.kind}>
            <b>{nameOf(e.actorId)}</b> <span>{e.kind === 'transition' && e.to ? `→ ${tx(STATUS_LABEL[e.to as ContentStatus] ?? { en: e.to, ar: e.to })}` : e.kind === 'comment' ? '' : e.kind === 'created' ? t('created', 'أنشأ') : e.kind === 'version' ? t('new version', 'نسخة جديدة') : t('edited captions', 'عدّل الكابشن')}</span>
            {e.body && <p dir="auto">{e.body}</p>}<time>{new Date(e.createdAt).toLocaleString()}</time>
          </li>)}</ol>
          <div className="content-comment"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('Write a comment', 'اكتب تعليق')} dir="auto" /><Button variant="secondary" disabled={busy || !comment.trim()} onClick={() => void act(() => api(`/api/content/${id}/comments`, { body: { body: comment } }))}><Send size={14} /></Button></div>
        </section>
      </div>}
    </motion.aside>
  </div>;
}
