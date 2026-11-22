import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, MessageCircle, SearchX } from 'lucide-react';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { useQueryState } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { LiveGate } from '../../components/feedback/LiveGate';
import { EmptyState } from '../../components/feedback/States';
import { Field, SearchInput, Select } from '../../components/forms/Field';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { useAuth } from '../../features/auth/AuthProvider';
import { PostComments } from '../../features/social-comments/PostComments';
import { isCommentPlatform } from '../../domain/social-comments';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import type { Post } from '../../types';
import { Thumb } from '../analytics/PostsSection';

const PAGE_SIZE = 20;
const accountKey = (post: Post) => `${post.platform}:${post.accountId}`;

export function CommentsPage() {
  const { t, num, date } = useI18n();
  const { can } = useAuth();
  const { store } = useLiveData();
  const [query, setQuery] = useQueryState();
  const [term, setTerm] = useState('');
  const [account, setAccount] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const details = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const detailId = useId();
  const posts = useMemo(() => store.data.posts.filter(post => isCommentPlatform(post.platform)), [store.data.posts]);
  const accounts = useMemo(() => Array.from(new Map(posts.map(post => [accountKey(post), `${channelName[post.platform]} · ${post.accountName}`]))), [posts]);
  const selected = posts.find(post => post.key === query.get('post'));
  const search = term.trim().toLocaleLowerCase();
  const found = posts.filter(post => (!account || accountKey(post) === account) &&
    (!search || `${post.title} ${post.accountName}`.toLocaleLowerCase().includes(search)));
  const title = t('Comments', 'التعليقات');
  usePageMeta(title, [{ label: title }]);

  const selectedKey = selected?.key;
  useEffect(() => {
    if (selectedKey) details.current?.focus();
  }, [selectedKey]);
  const clear = () => {
    setQuery({ post: null });
    requestAnimationFrame(() => list.current?.focus());
  };

  return <div className="u-stack u-stack--lg">
    <PageHeader title={title}
      description={t('Read and reply to public comments on Facebook, Instagram, LinkedIn, TikTok and YouTube.', 'تابع تعليقات الجمهور ورد عليها على Facebook وInstagram وLinkedIn وTikTok وYouTube.')}
      actions={can('connections.manage') && <ButtonLink to="/connections" size="sm">{t('Connections', 'ربط المنصات')}</ButtonLink>} />
    <LiveGate>
      {posts.length ? <div className="comment-workspace" data-post-open={Boolean(selected)}>
        <Card className="comment-workspace__list">
          <div ref={list} tabIndex={-1} className="comment-workspace__list-anchor">
            <CardHeader title={t('Posts', 'المنشورات')} count={num(found.length)} />
          </div>
          <CardBody className="u-stack u-stack--sm">
            <SearchInput value={term} onChange={value => { setTerm(value); setLimit(PAGE_SIZE); }}
              label={t('Search posts', 'ابحث في المنشورات')} placeholder={t('Caption or account…', 'نص المنشور أو اسم الحساب…')} />
            <Field label={t('Account', 'الحساب')}>
              {id => <Select id={id} value={account} onChange={event => { setAccount(event.target.value); setLimit(PAGE_SIZE); }}>
                <option value="">{t('All accounts', 'كل الحسابات')}</option>
                {accounts.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>}
            </Field>
            {found.length ? <ul className="comment-workspace__posts">
              {found.slice(0, limit).map(post => <li key={post.key}>
                <button type="button" className="comment-workspace__post" aria-pressed={selected?.key === post.key} aria-controls={detailId}
                  onClick={() => setQuery({ post: post.key }, { replace: false })}>
                  <Thumb post={post} />
                  <span className="comment-workspace__post-text">
                    <strong dir="auto">{post.title || t('Post without a caption', 'منشور بدون نص')}</strong>
                    <small><ChannelIcon channel={post.platform} size={13} /> <bdi>{post.accountName || channelName[post.platform]}</bdi> · {date(post.ts, 'dayShort')}</small>
                  </span>
                  {post.metrics.comments != null && <span className="comment-workspace__count" aria-label={t(`${num(post.metrics.comments)} comments`, `${num(post.metrics.comments)} تعليق`)}>
                    <MessageCircle size={14} aria-hidden /> {num(post.metrics.comments)}
                  </span>}
                </button>
              </li>)}
            </ul> : <EmptyState compact icon={<SearchX size={20} />} title={t('No matching posts', 'مفيش منشورات مطابقة')} />}
            {found.length > limit && <Button size="sm" onClick={() => setLimit(value => value + PAGE_SIZE)}>{t('Show more posts', 'اعرض منشورات أكتر')}</Button>}
          </CardBody>
        </Card>
        <Card className="comment-workspace__detail" id={detailId}>
          <CardBody className="u-stack u-stack--sm">
            {selected ? <>
              <div className="u-row u-row--wrap comment-workspace__detail-actions">
                <Button size="sm" variant="ghost" className="comment-workspace__back" icon={<ArrowLeft size={15} aria-hidden />} onClick={clear}>
                  {t('Back to posts', 'ارجع للمنشورات')}
                </Button>
                {selected.permalink && <a className="ui-btn ui-btn--secondary ui-btn--sm" href={selected.permalink} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} aria-hidden /> {t('Open original post', 'افتح المنشور الأصلي')}
                </a>}
              </div>
              <div className="comment-workspace__detail-post">
                <Thumb post={selected} />
                <div>
                  <h2 ref={details} tabIndex={-1} dir="auto">{selected.title || t('Post without a caption', 'منشور بدون نص')}</h2>
                  <small><bdi>{selected.accountName || channelName[selected.platform]}</bdi> · {date(selected.ts, 'dateTime')}</small>
                </div>
              </div>
              <PostComments key={selected.key} post={selected} />
            </> : <EmptyState compact icon={<MessageCircle size={24} />} title={t('Select a post to view its comments', 'اختار منشور عشان تشوف التعليقات')} />}
          </CardBody>
        </Card>
      </div> : <EmptyState icon={<MessageCircle size={24} />} title={t('No posts have synced yet', 'لسه مفيش منشورات متزامنة')}
        text={t('Posts appear here when the connected accounts sync.', 'المنشورات هتظهر هنا بعد مزامنة الحسابات المربوطة.')} />}
    </LiveGate>
  </div>;
}
