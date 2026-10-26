import { useMemo } from 'react';
import { AtSign, CircleCheck } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { EmptyState } from '../../components/feedback/States';
import { Avatar } from '../../components/ui/Avatar';
import { Card, CardHeader } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { isOpen } from '../../domain/content';
import { ContentLine } from '../../features/content/parts';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useClock } from '../../features/workspace/hooks';
import { dueBucket, isTaskOpen, reviewQueue, userById, type DueBucket } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { parseTimestamp } from '../../lib/format';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ReviewQueueCard, TaskListCard } from '../home/widgets';

type Tab = 'tasks' | 'content' | 'reviews' | 'mentions';

/** Everything assigned to the signed-in person, grouped by when it is due. */
export function MyWorkPage() {
  const { t, relative } = useI18n();
  const { state, me, can } = useWorkspace();
  const now = useClock();
  const [query, setQuery] = useQueryState();
  usePageMeta(t('My Work', 'عملي'), [{ label: t('My Work', 'عملي') }]);

  const tasks = state.tasks.filter((task) => task.assigneeId === me.id && isTaskOpen(task));
  const content = state.content.filter((item) => (item.ownerId === me.id || item.assigneeId === me.id) && isOpen(item));
  const reviews = can('content.approve') ? reviewQueue(state) : [];
  const mentions = useMemo(() => state.comments.filter((comment) => comment.mentions.includes(me.id)).sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt)), [state.comments, me.id]);

  const tabs = [
    { value: 'tasks' as const, label: t('Tasks', 'المهام'), count: tasks.length },
    { value: 'content' as const, label: t('My content', 'محتواي'), count: content.length },
    ...(can('content.approve') ? [{ value: 'reviews' as const, label: t('Reviews', 'المراجعات'), count: reviews.length }] : []),
    { value: 'mentions' as const, label: t('Mentions', 'الإشارات'), count: mentions.length },
  ];
  const requested = query.get('tab') as Tab | null;
  const tab: Tab = tabs.some((entry) => entry.value === requested) ? requested! : 'tasks';

  const BUCKETS: { key: DueBucket; label: string }[] = [
    { key: 'overdue', label: t('Overdue', 'متأخر') },
    { key: 'today', label: t('Today', 'اليوم') },
    { key: 'week', label: t('This week', 'هذا الأسبوع') },
    { key: 'later', label: t('Later', 'لاحقًا') },
    { key: 'none', label: t('No due date', 'بدون موعد') },
  ];

  return (
    <div className="u-stack u-stack--lg">
      <PageHeader title={t('My Work', 'عملي')} description={t('Everything assigned to you, in the order it is due.', 'كل ما أُسند إليك مرتبًا حسب موعده.')} />
      <Tabs label={t('My work sections', 'أقسام عملي')} items={tabs} value={tab} onChange={(value) => setQuery({ tab: value === 'tasks' ? null : value })} />

      {tab === 'tasks' &&
        (tasks.length === 0 ? (
          <EmptyState icon={<CircleCheck size={20} />} title={t('You have no open tasks.', 'ليس لديك مهام مفتوحة.')} text={t('Tasks assigned to you by Marketing or your department appear here.', 'المهام التي يسندها لك التسويق أو قسمك تظهر هنا.')} />
        ) : (
          BUCKETS.map((bucket) => {
            const list = tasks.filter((task) => dueBucket(task.dueAt, now) === bucket.key);
            if (!list.length) return null;
            return <TaskListCard key={bucket.key} title={bucket.label} tasks={list} now={now} empty={{ title: '' }} />;
          })
        ))}

      {tab === 'content' &&
        (content.length === 0 ? (
          <EmptyState title={t('You own no open content.', 'لا تملك محتوى مفتوحًا.')} text={t('Items you create or are assigned to appear here until they are published.', 'العناصر التي تنشئها أو تُسند إليك تظهر هنا حتى تُنشر.')} />
        ) : (
          BUCKETS.map((bucket) => {
            const list = content.filter((item) => dueBucket(item.status === 'scheduled' ? item.publishAt : item.dueAt, now) === bucket.key);
            if (!list.length) return null;
            return (
              <Card key={bucket.key}>
                <CardHeader title={bucket.label} count={list.length} />
                <ul className="lines">
                  {list.map((item) => (
                    <ContentLine key={item.id} item={item} now={now} />
                  ))}
                </ul>
              </Card>
            );
          })
        ))}

      {tab === 'reviews' && <ReviewQueueCard now={now} limit={50} title={t('Waiting for your review', 'بانتظار مراجعتك')} />}

      {tab === 'mentions' && (
        <Card>
          <CardHeader title={t('Mentions', 'الإشارات')} count={mentions.length} icon={<AtSign size={16} />} />
          {mentions.length === 0 ? (
            <EmptyState compact title={t('Nobody has mentioned you yet.', 'لم يُشر إليك أحد بعد.')} text={t('Type @ and a first name in a comment to bring someone in.', 'اكتب @ واسمًا أول في تعليق لإشراك شخص.')} />
          ) : (
            <ul className="comments">
              {mentions.map((comment) => {
                const author = userById(state, comment.authorId);
                const target = comment.entity.kind === 'content' ? state.content.find((item) => item.id === comment.entity.id) : state.tasks.find((task) => task.id === comment.entity.id);
                const href = comment.entity.kind === 'content' ? `/content/${comment.entity.id}` : `/tasks?task=${comment.entity.id}`;
                return (
                  <li key={comment.id} className="comment">
                    <Avatar name={author?.name ?? '?'} size={28} />
                    <div className="comment__body">
                      <p className="comment__meta">
                        <b>{author?.name}</b> · <Link to={href} dir="auto">{target?.title}</Link> · <span className="u-subtle">{relative(comment.createdAt, now)}</span>
                      </p>
                      <p dir="auto">{comment.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
