import { useState } from 'react';
import { Check, ExternalLink, FileImage, FileQuestion, Pencil, Plus } from 'lucide-react';
import { Link } from '../../app/router/router';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { ChannelIcon, Channels } from '../../components/data-display/ChannelIcon';
import { SourceLine } from '../../components/data-display/Metric';
import { DataNotice, EmptyState } from '../../components/feedback/States';
import { Select, Textarea } from '../../components/forms/Field';
import { Person } from '../../components/ui/Avatar';
import { ApprovalBadge, ContentStatusBadge, PriorityBadge, TaskStatusBadge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, DefinitionList } from '../../components/ui/Card';
import { departmentById } from '../../domain/catalog';
import type { ContentItem, ContentStatus } from '../../domain/content';
import type { Channel } from '../../domain/shared';
import type { ContentTemplate } from '../../domain/workflow';
import { Comments } from '../../features/content/Comments';
import { AssignMenu, DueLabel, OriginBadge, ProvenanceBadge, TransitionActions, useMove } from '../../features/content/parts';
import { BestTime } from '../../features/publishing/BestTime';
import { NewTaskDialog } from '../../features/tasks/TaskParts';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useAct, useClock } from '../../features/workspace/hooks';
import { canEditContent } from '../../features/workspace/permissions';
import { userById } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { assetKindLabel, channelName, contentStatusLabel, contentTypeLabel, taskKindLabel } from '../../i18n/labels';
import { parseTimestamp } from '../../lib/format';
import { sourceOf } from '../../services/adapters/live';
import type { Metrics, Post } from '../../types';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

const LIMITS: Partial<Record<Channel, number>> = { instagram: 2200, tiktok: 2200, linkedin: 3000, facebook: 63206, snapchat: 250 };

export function ContentDetailPage({ id }: { id: string }) {
  const { t, tx } = useI18n();
  const { state } = useWorkspace();
  const { liveContent, store } = useLiveData();
  const item = state.content.find((entry) => entry.id === id) ?? liveContent.find((entry) => entry.id === id) ?? null;
  const department = item ? departmentById(item.departmentId) : null;
  usePageMeta(item?.title ?? t('Content', 'المحتوى'), [
    { label: t('Content', 'المحتوى'), to: '/content' },
    ...(department ? [{ label: tx(department.name), to: `/content?department=${department.id}` }] : []),
    { label: item?.title ?? t('Not found', 'غير موجود') },
  ]);

  if (!item) {
    if (id.startsWith('live-') && store.phase === 'loading') return <EmptyState title={t('Loading calendar data…', 'جارٍ تحميل بيانات التقويم…')} />;
    return (
      <EmptyState
        icon={<FileQuestion size={22} />}
        title={t('This content item does not exist.', 'عنصر المحتوى غير موجود.')}
        text={t('It may have been created in another browser session. Demo items are kept in memory until the content API is added.', 'ربما أُنشئ في جلسة متصفح أخرى. العناصر التجريبية تبقى في الذاكرة حتى تُضاف واجهة المحتوى.')}
        action={<ButtonLink to="/content" variant="primary">{t('Back to Content', 'العودة إلى المحتوى')}</ButtonLink>}
      />
    );
  }
  return <Workspace item={item} />;
}

function Workspace({ item }: { item: ContentItem }) {
  const { t, tx } = useI18n();
  const { state } = useWorkspace();
  const now = useClock();
  const { request, dialog } = useMove();
  const course = state.courses.find((entry) => entry.id === item.courseId);
  const template = state.templates.find((entry) => entry.id === item.templateId) ?? null;

  return (
    <div className="u-stack u-stack--lg">
      <PageHeader
        meta={
          <span className="u-row u-row--wrap">
            <ContentStatusBadge status={item.status} />
            <PriorityBadge priority={item.priority} />
            <OriginBadge item={item} />
            <ProvenanceBadge item={item} />
            {course && (
              <span className="u-sm u-muted">
                {course.code} · {course.cohort}
              </span>
            )}
          </span>
        }
        title={<span dir="auto">{item.title}</span>}
        description={
          <span className="u-row u-row--wrap">
            <span>{tx(departmentById(item.departmentId)!.name)}</span>
            <span aria-hidden>·</span>
            <span>{tx(contentTypeLabel[item.type])}</span>
            <span aria-hidden>·</span>
            <span className="u-row">
              {t('Owner', 'المالك')} <Person users={state.users} id={item.ownerId} size={20} />
            </span>
          </span>
        }
        actions={
          item.provenance === 'live' ? (
            <ButtonLink to="/calendar?view=live" variant="primary">
              {t('Edit in Calendar', 'تعديل من التقويم')}
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to={`/ai-studio/post-designer?content=${encodeURIComponent(item.id)}`} variant="secondary">
                {t('Design post', 'صمّم بوست')}
              </ButtonLink>
              <AssignMenu item={item} size="md" />
              <TransitionActions item={item} onRequest={request} limit={3} />
            </>
          )
        }
      />
      {item.provenance === 'live' && (
        <DataNotice status="partial" message={t('This item comes from the live calendar (SQLite). Workflow fields — reviews, tasks, comments — start when the content API stores plans as content items.', 'هذا العنصر من التقويم الحي (SQLite). حقول سير العمل — المراجعات والمهام والتعليقات — تبدأ عندما تحفظ واجهة المحتوى الخطط كعناصر محتوى.')} />
      )}
      <Pipeline item={item} template={template} />
      <div className="detail-grid">
        <div className="detail-grid__main">
          <ContentSection item={item} />
          {item.provenance === 'demo' && (
            <>
              <WorkflowSection item={item} now={now} />
              <Card>
                <CardHeader title={t('Discussion', 'النقاش')} />
                <CardBody>
                  <Comments entity={{ kind: 'content', id: item.id }} now={now} />
                </CardBody>
              </Card>
              <HistorySection item={item} now={now} />
            </>
          )}
        </div>
        <aside className="detail-grid__side">
          <DetailsCard item={item} now={now} template={template} />
          <PublishingCard item={item} now={now} />
          <PerformanceCard item={item} now={now} />
        </aside>
      </div>
      {dialog}
    </div>
  );
}

/** Where the item is in its workflow. Template workflows show their real actors. */
function Pipeline({ item, template }: { item: ContentItem; template: ContentTemplate | null }) {
  const { t, tx } = useI18n();
  if (item.status === 'cancelled' || item.status === 'archived') return null;
  const steps = template
    ? [...template.workflow.map((step) => ({ label: tx(step.actor), hint: tx(step.action) })), { label: t('Publish', 'النشر'), hint: t('Post and record the link', 'النشر وتسجيل الرابط') }]
    : [
        { label: t('Draft', 'مسودة'), hint: t('Owner prepares it', 'يجهّزه المالك') },
        { label: t('Production', 'الإنتاج'), hint: t('Design / video', 'تصميم / فيديو') },
        { label: t('Marketing review', 'مراجعة التسويق'), hint: t('Approve or request changes', 'اعتماد أو طلب تعديل') },
        { label: t('Publish', 'النشر'), hint: t('Schedule, post, record', 'جدولة ونشر وتسجيل') },
      ];
  const n = steps.length;
  const marketing = n - 2;
  const position: Record<ContentStatus, number> = {
    idea: 0,
    draft: 0,
    in_production: Math.max(0, marketing - 1),
    changes_requested: Math.max(0, marketing - 1),
    ready_for_review: marketing,
    approved: n - 1,
    scheduled: n - 1,
    published: n,
    archived: n,
    cancelled: 0,
  };
  const current = position[item.status];
  return (
    <ol className="pipeline" aria-label={t('Workflow progress', 'تقدم سير العمل')}>
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li key={index} className="pipeline__step" data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="pipeline__dot">{state === 'done' ? <Check size={12} /> : index + 1}</span>
            <span className="pipeline__text">
              <b>{step.label}</b>
              <small>{step.hint}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ContentSection({ item }: { item: ContentItem }) {
  const { t, tx, num, bytes } = useI18n();
  const { state, me, editContent } = useWorkspace();
  const act = useAct();
  const editable = canEditContent(me, item);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(item.caption);
  const [versionChannel, setVersionChannel] = useState<Channel | ''>('');
  const assets = item.assetIds.map((id) => state.assets.find((asset) => asset.id === id)).filter((asset) => asset != null);

  const save = () => {
    if (act(editContent(item.id, { caption }), t('Caption saved', 'تم حفظ النص'))) setEditing(false);
  };
  const addVersion = () => {
    if (!versionChannel) return;
    act(editContent(item.id, { versions: [...item.versions, { channel: versionChannel, caption: item.caption, note: '' }] }), t('Platform version added', 'تمت إضافة نسخة المنصة'));
    setVersionChannel('');
  };
  const free = item.channels.filter((channel) => !item.versions.some((version) => version.channel === channel));

  return (
    <Card>
      <CardHeader
        title={t('Content', 'المحتوى')}
        actions={
          editable && !editing ? (
            <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>
              {t('Edit caption', 'تعديل النص')}
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <div className="u-stack">
          {editing ? (
            <div className="u-stack u-stack--sm">
              <Textarea rows={8} value={caption} onChange={(event) => setCaption(event.target.value)} dir="auto" aria-label={t('Caption', 'النص')} data-autofocus />
              <CaptionLimits text={caption} channels={item.channels} />
              <div className="u-row">
                <Button size="sm" variant="primary" onClick={save}>
                  {t('Save', 'حفظ')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCaption(item.caption);
                    setEditing(false);
                  }}
                >
                  {t('Cancel', 'إلغاء')}
                </Button>
                <ButtonLink size="sm" variant="ghost" to={`/ai-studio?content=${item.id}`}>
                  {t('Open in AI Studio', 'افتح في استوديو AI')}
                </ButtonLink>
              </div>
            </div>
          ) : item.caption ? (
            <>
              <p className="caption" dir="auto">
                {item.caption}
              </p>
              <CaptionLimits text={item.caption} channels={item.channels} />
            </>
          ) : (
            <p className="u-muted u-sm">{t('No caption yet.', 'لا يوجد نص بعد.')}</p>
          )}

          <div className="u-stack u-stack--sm">
            <h3 className="sub-title">{t('Platform versions', 'نسخ المنصات')}</h3>
            {item.versions.length === 0 ? (
              <p className="u-sm u-muted">{t('One caption for every platform. Add a version when a platform needs its own wording.', 'نص واحد لكل المنصات. أضف نسخة عندما تحتاج منصة صياغة خاصة.')}</p>
            ) : (
              <ul className="versions">
                {item.versions.map((version) => (
                  <li key={version.channel} className="version">
                    <span className="u-row">
                      <ChannelIcon channel={version.channel} /> <b>{channelName[version.channel]}</b>
                    </span>
                    <p dir="auto" className="u-sm">
                      {version.caption}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {editable && free.length > 0 && (
              <div className="u-row">
                <Select value={versionChannel} onChange={(event) => setVersionChannel(event.target.value as Channel)} aria-label={t('Platform', 'المنصة')}>
                  <option value="">{t('Add a version for…', 'أضف نسخة لـ…')}</option>
                  {free.map((channel) => (
                    <option key={channel} value={channel}>
                      {channelName[channel]}
                    </option>
                  ))}
                </Select>
                <Button size="sm" icon={<Plus size={14} />} disabled={!versionChannel} onClick={addVersion}>
                  {t('Add', 'إضافة')}
                </Button>
              </div>
            )}
          </div>

          <div className="u-stack u-stack--sm">
            <h3 className="sub-title">{t('Media', 'الوسائط')}</h3>
            {assets.length === 0 ? (
              <p className="u-sm u-muted">{t('No media attached. Link files from the Media Library.', 'لا وسائط مرفقة. اربط ملفات من مكتبة الوسائط.')}</p>
            ) : (
              <ul className="asset-chips">
                {assets.map((asset) => (
                  <li key={asset.id}>
                    <Link to={`/media?asset=${asset.id}`} className="asset-chip">
                      <FileImage size={15} aria-hidden />
                      <span className="u-truncate">{asset.name}</span>
                      <small>
                        {tx(assetKindLabel[asset.kind])} · {bytes(asset.sizeBytes)}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {item.provenance === 'demo' && (
              <ButtonLink size="sm" variant="ghost" to={`/media?link=${item.id}`}>
                {t('Attach from Media Library', 'أرفق من مكتبة الوسائط')}
              </ButtonLink>
            )}
          </div>
          {item.ai.used && <p className="u-xs u-muted">{t(`AI help recorded on this item: ${item.ai.tools.join(', ')} · ${num(item.ai.credits)} credits.`, `مساعدة AI مسجلة على العنصر: ${item.ai.tools.join('، ')} · ${num(item.ai.credits)} رصيد.`)}</p>}
        </div>
      </CardBody>
    </Card>
  );
}

function CaptionLimits({ text, channels }: { text: string; channels: Channel[] }) {
  const { num, ratio } = useI18n();
  const length = [...text].length;
  const limited = channels.filter((channel) => LIMITS[channel]);
  if (!limited.length) return null;
  return (
    <p className="caption-limits u-xs">
      {limited.map((channel) => (
        <span key={channel} data-over={length > LIMITS[channel]! || undefined}>
          <ChannelIcon channel={channel} size={11} /> <span className="u-tnum">{ratio(length, LIMITS[channel]!)}</span>
        </span>
      ))}
    </p>
  );
}

function WorkflowSection({ item, now }: { item: ContentItem; now: number }) {
  const { t, tx, date } = useI18n();
  const { state } = useWorkspace();
  const [taskOpen, setTaskOpen] = useState(false);
  const tasks = state.tasks.filter((task) => task.link?.kind === 'content' && task.link.id === item.id);
  const approvals = state.approvals.filter((approval) => approval.contentId === item.id).sort((a, b) => b.round - a.round);
  return (
    <Card>
      <CardHeader
        title={t('Workflow', 'سير العمل')}
        actions={
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setTaskOpen(true)}>
            {t('Add task', 'إضافة مهمة')}
          </Button>
        }
      />
      <CardBody>
        <div className="u-stack">
          <div className="u-stack u-stack--sm">
            <h3 className="sub-title">{t('Tasks', 'المهام')}</h3>
            {tasks.length === 0 ? (
              <p className="u-sm u-muted">{t('No tasks linked. Add one for design, video or copy work.', 'لا مهام مرتبطة. أضف مهمة للتصميم أو الفيديو أو الكتابة.')}</p>
            ) : (
              <ul className="lines lines--flush">
                {tasks.map((task) => (
                  <li key={task.id} className="line">
                    <div className="line__main">
                      <Link to={`/tasks?task=${task.id}`} className="line__title" dir="auto">
                        {task.title}
                      </Link>
                      <span className="line__meta">{tx(taskKindLabel[task.kind])}</span>
                    </div>
                    <div className="line__side">
                      <TaskStatusBadge status={task.status} />
                      <DueLabel iso={task.dueAt} now={now} done={task.status === 'done'} />
                      <span className="line__person">
                        <Person users={state.users} id={task.assigneeId} size={20} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="u-stack u-stack--sm">
            <h3 className="sub-title">{t('Approvals', 'الاعتمادات')}</h3>
            {approvals.length === 0 ? (
              <p className="u-sm u-muted">{t('Not submitted for review yet.', 'لم يُرسل للمراجعة بعد.')}</p>
            ) : (
              <ol className="approvals">
                {approvals.map((approval) => (
                  <li key={approval.id} className="approval">
                    <span className="approval__round u-tnum">{t(`Round ${approval.round}`, `الجولة ${approval.round}`)}</span>
                    <div className="u-grow u-stack u-stack--xs">
                      <span className="u-row u-row--wrap">
                        <ApprovalBadge status={approval.status} />
                        <span className="u-xs u-muted">
                          {t('Submitted by', 'أرسله')} {userById(state, approval.requestedById)?.name ?? '—'} · {date(approval.requestedAt, 'dateTime')}
                        </span>
                      </span>
                      {approval.decidedAt && (
                        <span className="u-xs u-muted">
                          {t('Decided by', 'قرار')} {userById(state, approval.decidedById)?.name ?? '—'} · {date(approval.decidedAt, 'dateTime')}
                        </span>
                      )}
                      {approval.note && (
                        <p className="approval__note" dir="auto">
                          {approval.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </CardBody>
      <NewTaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} link={{ kind: 'content', id: item.id }} />
    </Card>
  );
}

function HistorySection({ item, now }: { item: ContentItem; now: number }) {
  const { t, tx, relative, date } = useI18n();
  const { state } = useWorkspace();
  const entries = state.activity.filter((entry) => entry.entity.kind === 'content' && entry.entity.id === item.id).sort((a, b) => parseTimestamp(b.at) - parseTimestamp(a.at));
  const describe = (action: string, detail: string) => {
    switch (action) {
      case 'created':
        return t('created the item', 'أنشأ العنصر');
      case 'submitted_for_review':
        return t('submitted it for Marketing review', 'أرسله لمراجعة التسويق');
      case 'approved':
        return t('approved it', 'اعتمده');
      case 'changes_requested':
        return t('requested changes', 'طلب تعديلات');
      case 'rejected':
        return t('rejected it', 'رفضه');
      case 'scheduled':
        return detail ? t(`scheduled it for ${date(detail, 'dateTime')}`, `جدوله في ${date(detail, 'dateTime')}`) : t('scheduled it', 'جدوله');
      case 'published_recorded':
        return t('recorded it as published', 'سجّل نشره');
      case 'commented':
        return t('commented', 'علّق');
      case 'task_created':
        return t(`added a task: ${detail}`, `أضاف مهمة: ${detail}`);
      case 'task_completed':
        return t(`completed a task: ${detail}`, `أنجز مهمة: ${detail}`);
      case 'assigned':
        return detail ? t(`assigned it to ${userById(state, detail)?.name ?? ''}`, `أسنده إلى ${userById(state, detail)?.name ?? ''}`) : t('cleared the assignee', 'ألغى الإسناد');
      case 'asset_attached':
        return t(`attached ${detail}`, `أرفق ${detail}`);
      default: {
        if (detail.startsWith('edited:')) return t('edited the content', 'عدّل المحتوى');
        const [from, to] = detail.split('→') as [ContentStatus, ContentStatus];
        return contentStatusLabel[from] && contentStatusLabel[to] ? t(`moved it from ${tx(contentStatusLabel[from])} to ${tx(contentStatusLabel[to])}`, `نقله من ${tx(contentStatusLabel[from])} إلى ${tx(contentStatusLabel[to])}`) : t('updated it', 'حدّثه');
      }
    }
  };
  return (
    <Card>
      <CardHeader title={t('History', 'السجل')} count={entries.length} />
      <ul className="history history--card">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Person users={state.users} id={entry.actorId} size={20} />
            <span className="u-sm">{describe(entry.action, entry.detail)}</span>
            <time className="u-xs u-subtle" dateTime={entry.at} title={date(entry.at, 'dateTime')}>
              {relative(entry.at, now)}
            </time>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DetailsCard({ item, now, template }: { item: ContentItem; now: number; template: ContentTemplate | null }) {
  const { t, tx, num, date } = useI18n();
  const { state } = useWorkspace();
  const campaign = state.campaigns.find((entry) => entry.id === item.campaignId);
  const course = state.courses.find((entry) => entry.id === item.courseId);
  const target = state.plans.flatMap((plan) => plan.targets).find((entry) => entry.id === item.planTargetId);
  return (
    <Card>
      <CardHeader title={t('Details', 'التفاصيل')} as="h2" />
      <CardBody>
        <DefinitionList
          items={[
            { label: t('Status', 'الحالة'), value: <ContentStatusBadge status={item.status} /> },
            { label: t('Department', 'القسم'), value: <Link to={`/departments/${item.departmentId}`} className="ui-link">{tx(departmentById(item.departmentId)!.name)}</Link> },
            { label: t('Owner', 'المالك'), value: <Person users={state.users} id={item.ownerId} /> },
            { label: t('Assignee', 'المسند إليه'), value: <Person users={state.users} id={item.assigneeId} empty={t('Unassigned', 'بدون إسناد')} /> },
            { label: t('Platforms', 'المنصات'), value: <Channels channels={item.channels} /> },
            { label: t('Due', 'التسليم'), value: <DueLabel iso={item.dueAt} now={now} done={item.status === 'published' || item.status === 'scheduled'} /> },
            { label: t('Template', 'القالب'), value: template ? <Link to={`/templates/${template.id}`} className="ui-link">{tx(template.name)}</Link> : '—' },
            { label: t('Campaign', 'الحملة'), value: campaign ? <Link to={`/content?campaign=${campaign.id}`} className="ui-link">{campaign.name}</Link> : '—' },
            { label: t('Course', 'الكورس'), value: course ? `${course.code} — ${course.cohort}` : '—' },
            { label: t('Plan target', 'هدف الخطة'), value: target ? tx(target.label) : '—' },
            { label: t('AI credits used', 'رصيد AI المستخدم'), value: <span className="u-tnum">{item.ai.used ? num(item.ai.credits) : '—'}</span> },
            { label: t('Created', 'أُنشئ'), value: date(item.createdAt, 'date') },
          ]}
        />
      </CardBody>
    </Card>
  );
}

function PublishingCard({ item, now }: { item: ContentItem; now: number }) {
  const { t, date } = useI18n();
  const open = !['published', 'archived', 'cancelled', 'scheduled'].includes(item.status);
  return (
    <Card>
      <CardHeader title={t('Publishing', 'النشر')} as="h2" />
      <CardBody>
        <div className="u-stack">
          <DefinitionList
            items={[
              { label: t('Publish date', 'موعد النشر'), value: item.publishAt ? date(item.publishAt, 'dateTime') : '—' },
              { label: t('Platforms', 'المنصات'), value: item.channels.map((channel) => channelName[channel]).join(' · ') },
              {
                label: t('Published link', 'رابط المنشور'),
                value: item.publishedUrl ? (
                  <a href={item.publishedUrl} target="_blank" rel="noreferrer" className="ui-link u-truncate" dir="ltr">
                    {item.publishedUrl.replace(/^https?:\/\//, '').slice(0, 38)}
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  '—'
                ),
              },
            ]}
          />
          {open && <BestTime channels={item.channels} now={now} compact />}
        </div>
      </CardBody>
    </Card>
  );
}

function findPost(item: ContentItem, posts: Post[]): Post | null {
  const url = item.publishedUrl.trim();
  if (!url) return null;
  return posts.find((post) => post.permalink === url || (post.externalId && url.includes(post.externalId))) ?? null;
}

const METRICS: { key: keyof Metrics; en: string; ar: string }[] = [
  { key: 'reach', en: 'Reach', ar: 'الوصول' },
  { key: 'views', en: 'Views', ar: 'المشاهدات' },
  { key: 'likes', en: 'Likes', ar: 'الإعجابات' },
  { key: 'comments', en: 'Comments', ar: 'التعليقات' },
  { key: 'shares', en: 'Shares', ar: 'المشاركات' },
  { key: 'clicks', en: 'Clicks', ar: 'النقرات' },
];

/** Numbers only from a live post matched by its link; leads have no source yet and say so. */
function PerformanceCard({ item, now }: { item: ContentItem; now: number }) {
  const { t, compact, pct } = useI18n();
  const { store } = useLiveData();
  const post = findPost(item, store.data.posts);
  return (
    <Card>
      <CardHeader title={t('Performance', 'الأداء')} as="h2" />
      <CardBody>
        {item.status !== 'published' ? (
          <p className="u-sm u-muted">{t('Performance appears after the item is published and its link is recorded.', 'يظهر الأداء بعد نشر العنصر وتسجيل رابطه.')}</p>
        ) : !item.publishedUrl ? (
          <p className="u-sm u-muted">{t('Published without a recorded link, so no live post can be matched. Values stay —.', 'نُشر دون رابط مسجل، فلا يمكن مطابقته مع بوست حي. القيم تبقى —.')}</p>
        ) : store.phase === 'loading' ? (
          <p className="u-sm u-muted">{t('Loading…', 'جارٍ التحميل…')}</p>
        ) : !post ? (
          <DataNotice status="partial" message={t('No synced post matches this link yet. It appears after the next sync if the platform is connected.', 'لا يوجد بوست متزامن يطابق هذا الرابط بعد. يظهر بعد المزامنة التالية إذا كانت المنصة متصلة.')} />
        ) : (
          <div className="u-stack u-stack--sm">
            <dl className="metric-grid">
              {METRICS.map((metric) => (
                <div key={metric.key}>
                  <dt>{t(metric.en, metric.ar)}</dt>
                  <dd className="u-tnum">{compact(post.metrics[metric.key])}</dd>
                </div>
              ))}
              <div>
                <dt>{t('Engagement rate', 'معدل التفاعل')}</dt>
                <dd className="u-tnum">{pct(post.engagementRate, 1)}</dd>
              </div>
              <div>
                <dt>{t('Leads', 'العملاء المحتملون')}</dt>
                <dd title={t('No lead source is connected yet', 'لا يوجد مصدر عملاء محتملين مربوط بعد')}>—</dd>
              </div>
            </dl>
            <SourceLine source={sourceOf(post.platform, store.data.connectors, post.accountName)} now={now} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
