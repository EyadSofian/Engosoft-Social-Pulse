import { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from '../../app/router/router';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Field, Textarea } from '../../components/forms/Field';
import { useI18n } from '../../i18n/I18nProvider';
import { api, ApiError, errorMessage } from '../../lib/api';
import type { CommentPage, CommentSettings, PublicSocialComment } from '../../domain/social-comments';
import type { Post } from '../../types';
import { commentAccountPath, CommentPolicyEditor, policyLabel } from './CommentPolicyEditor';

function mergePage(current: PublicSocialComment[], incoming: PublicSocialComment[]) {
  return [...new Map([...current, ...incoming].map(row => [row.id, row])).values()];
}

export function PostComments({ post }: { post: Post }) {
  const { t } = useI18n();
  const path = `${commentAccountPath(post.platform, post.accountId)}/posts/${encodeURIComponent(post.externalId)}`;
  const [settings, setSettings] = useState<CommentSettings>();
  const [page, setPage] = useState<CommentPage>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mode = settings?.policy?.mode ?? settings?.accountPolicy.mode ?? 'manual';
  const fallback = t('Could not load comments.', 'تعذّر تحميل التعليقات.');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const value = await api<CommentSettings>(path + '/settings');
        if (!active) return;
        setSettings(value);
        if (value.authorized) {
          const result = await api<CommentPage>(path);
          if (active) setPage(result);
        }
      } catch (err) { if (active) setError(errorMessage(err, fallback)); }
    }
    void load();
    return () => { active = false; };
  }, [path, fallback]);

  const refresh = async (append = false) => {
    setBusy(true); setError('');
    try {
      if (!append) setSettings(await api<CommentSettings>(path + '/settings'));
      const query = append && page?.next ? '?' + new URLSearchParams({ cursor: page.next }) : '';
      const result = await api<CommentPage>(path + query);
      setPage(append ? { ...result, comments: mergePage(page?.comments ?? [], result.comments) } : result);
    } catch (err) { setError(errorMessage(err, fallback)); }
    finally { setBusy(false); }
  };

  return <section className="social-comments u-stack u-stack--sm" aria-label={t('Public comments', 'تعليقات الجمهور')}>
    <header className="u-row u-row--wrap social-comments__header">
      <h3 className="u-row"><MessageCircle size={17} aria-hidden />{t('Public comments', 'تعليقات الجمهور')}</h3>
      {settings?.authorized && <Button size="sm" variant="ghost" busy={busy} icon={<RefreshCw size={14} />} onClick={() => void refresh()}>{t('Refresh', 'حدّث')}</Button>}
    </header>
    {!settings && !error && <p className="u-sm" role="status">{t('Loading comments…', 'جاري تحميل التعليقات…')}</p>}
    {settings && !settings.authorized && <p className="u-sm">
      {t('This account needs comment authorization.', 'الحساب محتاج تفويض للتعليقات.')} {settings.canManage && <Link to="/connections">{t('Open Connections', 'افتح ربط المنصات')}</Link>}
    </p>}
    {settings && settings.authorized && <>
      <div><Badge tone="neutral">{policyLabel(mode, t)}</Badge></div>
      {settings.canManage && <details><summary>{t('Reply settings', 'إعدادات الرد')}</summary>
        <CommentPolicyEditor path={path + '/settings'} settings={settings} onSave={setSettings} post />
      </details>}
      {settings.canReply && <NewPostComment path={path} account={post.accountName} onSent={() => void refresh()} />}
      {!page && !error && <p className="u-sm" role="status">{t('Loading comments…', 'جاري تحميل التعليقات…')}</p>}
      {page && !page.comments.length && <p className="u-sm">{t('No comments on this post yet.', 'لسه مفيش تعليقات على المنشور.')}</p>}
      {page?.comments.length ? <ul className="social-comments__list">{page.comments.map(comment => <CommentThread key={comment.id}
        comment={comment} path={path} account={post.accountName} canReply={settings.canReply} ai={settings.aiReady && mode !== 'manual'} />)}</ul> : null}
      {page?.next && <div><Button size="sm" busy={busy} onClick={() => void refresh(true)}>{t('Show more comments', 'اعرض تعليقات أكتر')}</Button></div>}
    </>}
    {error && <p className="u-sm" role="alert">{error}</p>}
  </section>;
}

function NewPostComment({ path, account, onSent }: { path: string; account: string; onSent: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [requestId, setRequestId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  async function send() {
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    setBusy(true); setError(''); setNotice('');
    try {
      await api(path, { body: { requestId: id, message: text.trim() } });
      setText(''); setRequestId(undefined); setPendingConfirmation(false);
      setNotice(t('Comment published.', 'اتنشر التعليق.'));
      onSent();
    } catch (err) {
      const details = err instanceof ApiError ? err.details as { code?: string } | undefined : undefined;
      if (details?.code === 'reply_unconfirmed') setUncertain(true);
      setPendingConfirmation(err instanceof ApiError && (err.status === 0 || err.status >= 500));
      setError(errorMessage(err, t('Could not publish the comment.', 'تعذّر نشر التعليق.')));
    } finally { setBusy(false); }
  }
  return <details className="social-comments__new">
    <summary>{t('Write a new comment', 'اكتب تعليق جديد')}</summary>
    <div className="u-stack u-stack--xs social-comments__settings">
      <Field label={account ? t(`Comment publicly as ${account}`, `تعليق علني باسم ${account}`) : t('Public comment', 'تعليق علني')}>
        {id => <Textarea id={id} rows={2} maxLength={600} dir="auto" value={text} readOnly={uncertain || pendingConfirmation} disabled={busy} onChange={event => {
          setText(event.target.value);
          setRequestId(undefined);
        }} />}
      </Field>
      <div><Button size="sm" variant="primary" busy={busy} disabled={!text.trim() || uncertain} onClick={() => void send()}>{pendingConfirmation ? t('Check sending status', 'تحقّق من الإرسال') : t('Publish comment', 'انشر التعليق')}</Button></div>
      {notice && <small role="status">{notice}</small>}
      {error && <p role="alert" className="u-sm">{error}</p>}
    </div>
  </details>;
}

function CommentContent({ comment }: { comment: PublicSocialComment }) {
  const { t, date } = useI18n();
  return <>
    <div className="social-comments__person u-row u-row--wrap">
      <strong dir="auto">{comment.author || t('Commenter', 'صاحب التعليق')}</strong>
      {comment.createdAt && <small>{date(comment.createdAt, 'dateTime')}</small>}
      {comment.own && <Badge tone="neutral">{t('Your account', 'حسابك')}</Badge>}
    </div>
    <p className="social-comments__text" dir="auto">{comment.text || t('Comment without text', 'تعليق بدون نص')}</p>
  </>;
}

function CommentThread({ comment, path, account, canReply, ai }: { comment: PublicSocialComment; path: string; account: string; canReply: boolean; ai: boolean }) {
  const { t } = useI18n();
  const [panel, setPanel] = useState(false);
  const [text, setText] = useState('');
  const [page, setPage] = useState<CommentPage>();
  const [busy, setBusy] = useState<'read' | 'send' | 'draft'>();
  const [sent, setSent] = useState<{ id: string; message: string }>();
  const [unconfirmedReference, setUnconfirmedReference] = useState<string>();
  const uncertain = unconfirmedReference === comment.reference;
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const route = `${path}/${encodeURIComponent(comment.id)}`;
  const delivery = comment.delivery;
  const blocked = uncertain || Boolean(sent) || Boolean(delivery && delivery.state !== 'failed');
  const canWrite = canReply && comment.canReply && !comment.own && !blocked;

  async function loadReplies(append = false) {
    const query = new URLSearchParams({ reference: comment.reference });
    if (append && page?.next) query.set('cursor', page.next);
    const result = await api<CommentPage>(route + '/replies?' + query);
    setPage(append ? { ...result, comments: mergePage(page?.comments ?? [], result.comments) } : result);
  }

  async function run(action: 'read' | 'send' | 'draft', append = false) {
    setBusy(action); setError(''); setNotice('');
    try {
      if (action === 'read') {
        setPanel(true);
        await loadReplies(append);
      } else if (action === 'draft') {
        const result = await api<{ draft: string | null }>(route + '/draft', { body: { reference: comment.reference } });
        if (result.draft) setText(result.draft);
        else setNotice(t('This comment needs a team member to write the reply.', 'التعليق ده محتاج حد من الفريق يكتب الرد.'));
      } else {
        const message = text.trim();
        const result = await api<{ id: string }>(route + '/replies', { body: { reference: comment.reference, message } });
        setSent({ id: result.id, message });
        setText('');
        await loadReplies().catch(() => {});
      }
    } catch (err) {
      if (action === 'send' && err instanceof ApiError && (err.status === 0 || (err.details as { code?: string } | undefined)?.code === 'reply_unconfirmed')) {
        setUnconfirmedReference(comment.reference);
      }
      setError(errorMessage(err, t('The comment request failed.', 'تعذّر تنفيذ طلب التعليق.')));
    } finally { setBusy(undefined); }
  }

  const saved = sent ?? (delivery?.state === 'sent' ? { id: delivery.remoteId, message: delivery.message } : null);
  return <li className="social-comments__item u-stack u-stack--xs">
    <CommentContent comment={comment} />
    {comment.review && !saved && <div><Badge tone="warning">{t('Needs review', 'محتاج مراجعة')}</Badge></div>}
    {(uncertain || delivery?.state === 'uncertain' || delivery?.state === 'sending') && <p className="u-sm" role="status">
      {t('Awaiting confirmation. Check the replies before resending.', 'الإرسال لسه غير مؤكد. راجع الردود قبل أي محاولة تانية.')}
    </p>}
    {saved && <p className="social-comments__reply" dir="auto"><strong>{delivery?.automatic ? t('Automatic reply', 'رد تلقائي') : t('Published reply', 'الرد المنشور')}</strong>{page?.comments.some(row => row.id === saved.id) ? '' : ` · ${saved.message}`}</p>}
    <div>
      <Button variant="ghost" size="sm" busy={busy === 'read'} disabled={Boolean(busy && busy !== 'read')} onClick={() => panel ? setPanel(false) : void run('read')}>
        {panel ? t('Close replies', 'اقفل الردود') : canWrite ? t('View replies / reply', 'اعرض الردود أو رد') : t('View replies', 'اعرض الردود')}
      </Button>
    </div>
    {panel && <>
      {page?.comments.length ? <ul className="social-comments__list social-comments__replies">
        {page.comments.map(reply => <li key={reply.id}><CommentContent comment={reply} /></li>)}
      </ul> : null}
      {page?.next && <div><Button size="sm" disabled={Boolean(busy)} onClick={() => void run('read', true)}>{t('More replies', 'ردود أكتر')}</Button></div>}
      {canWrite && <>
        <Field label={account ? t(`Reply publicly as ${account}`, `رد علني باسم ${account}`) : t('Public reply', 'رد علني')}>
          {id => <Textarea id={id} dir="auto" rows={2} value={text} maxLength={600} disabled={Boolean(busy)} onChange={event => setText(event.target.value)} />}
        </Field>
        <div className="u-row u-row--wrap">
          {ai && <Button size="sm" icon={<Sparkles size={14} />} busy={busy === 'draft'} disabled={Boolean(busy)} onClick={() => void run('draft')}>{t('Suggest with AI', 'اقترح رد بالذكاء الاصطناعي')}</Button>}
          <Button size="sm" variant="primary" busy={busy === 'send'} disabled={Boolean(busy) || !text.trim()} onClick={() => void run('send')}>{t('Send public reply', 'انشر الرد')}</Button>
        </div>
      </>}
    </>}
    {notice && <small role="status">{notice}</small>}
    {error && <p className="u-sm" role="alert">{error}</p>}
  </li>;
}
