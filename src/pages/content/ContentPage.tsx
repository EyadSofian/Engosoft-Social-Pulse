import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Download, LayoutGrid, List, Plus, Rows3, SquareKanban } from 'lucide-react';
import { Link, useQueryState, useRouter } from '../../app/router/router';
import { useLiveData } from '../../app/providers/LiveDataProvider';
import { Channels } from '../../components/data-display/ChannelIcon';
import { DataTable, type Column } from '../../components/data-display/DataTable';
import { EmptyState } from '../../components/feedback/States';
import { Checkbox, FilterSelect, SearchInput, Select } from '../../components/forms/Field';
import { Person, displayName } from '../../components/ui/Avatar';
import { ContentStatusBadge, PriorityBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Tabs';
import { DEPARTMENTS, departmentById } from '../../domain/catalog';
import type { ContentItem, ContentStatus, ContentType } from '../../domain/content';
import { BOARD_STATUSES, CONTENT_STATUSES, CONTENT_TYPES } from '../../domain/content';
import type { Channel } from '../../domain/shared';
import { CHANNELS } from '../../domain/shared';
import type { DepartmentId } from '../../domain/users';
import { useCreateContent } from '../../features/content/CreateContent';
import { DepartmentName, DueLabel, OriginBadge, ProvenanceBadge, transitionLabel, useMove } from '../../features/content/parts';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useAct, useClock } from '../../features/workspace/hooks';
import { useToast } from '../../components/feedback/Toast';
import { allowedTransitions } from '../../features/workspace/permissions';
import { dueBucket, visibleContent, type DueBucket } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName, contentStatusLabel, contentTypeLabel } from '../../i18n/labels';
import { downloadText } from '../../lib/calendarExport';
import { parseTimestamp } from '../../lib/format';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type View = 'table' | 'cards' | 'board' | 'list';
const VIEWS: View[] = ['table', 'cards', 'board', 'list'];
const ms = (iso: string | null) => (iso ? parseTimestamp(iso) : null);

/** The content database: every item from every department, in four views over one filter set. */
export function ContentPage() {
  const { t, tx, num } = useI18n();
  const { state, me, can, assignContent } = useWorkspace();
  const { liveContent, store } = useLiveData();
  const { navigate } = useRouter();
  const create = useCreateContent();
  const toast = useToast();
  const now = useClock();
  const [query, setQuery] = useQueryState();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const searchRef = useRef<HTMLInputElement | null>(null);
  usePageMeta(t('Content', 'المحتوى'), [{ label: t('Content', 'المحتوى') }]);

  const view = (VIEWS as string[]).includes(query.get('view') ?? '') ? (query.get('view') as View) : 'table';
  const q = query.get('q') ?? '';
  const f = {
    department: (query.get('department') ?? 'all') as DepartmentId | 'all',
    owner: query.get('owner') ?? 'all',
    assignee: query.get('assignee') ?? 'all',
    platform: (query.get('platform') ?? 'all') as Channel | 'all',
    campaign: query.get('campaign') ?? 'all',
    status: (query.get('status') ?? 'all') as ContentStatus | 'all',
    type: (query.get('type') ?? 'all') as ContentType | 'all',
    template: query.get('template') ?? 'all',
    origin: (query.get('origin') ?? 'all') as 'ai' | 'manual' | 'all',
    published: (query.get('published') ?? 'all') as 'yes' | 'no' | 'all',
    due: (query.get('due') ?? 'all') as DueBucket | 'all',
  };
  const includeLive = query.get('live') !== '0';
  const filtersOn = Object.values(f).some((value) => value !== 'all') || Boolean(q);

  const all = useMemo(() => [...visibleContent(state, me), ...(includeLive ? liveContent : [])], [state, me, includeLive, liveContent]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((item) => {
      if (needle && !`${item.title} ${item.caption}`.toLowerCase().includes(needle)) return false;
      if (f.department !== 'all' && item.departmentId !== f.department) return false;
      if (f.owner !== 'all' && item.ownerId !== f.owner) return false;
      if (f.assignee !== 'all' && item.assigneeId !== f.assignee) return false;
      if (f.platform !== 'all' && !item.channels.includes(f.platform)) return false;
      if (f.campaign !== 'all' && item.campaignId !== f.campaign) return false;
      if (f.status !== 'all' && item.status !== f.status) return false;
      if (f.type !== 'all' && item.type !== f.type) return false;
      if (f.template !== 'all' && item.templateId !== f.template) return false;
      if (f.origin === 'ai' && !item.ai.used) return false;
      if (f.origin === 'manual' && item.ai.used) return false;
      if (f.published === 'yes' && item.status !== 'published') return false;
      if (f.published === 'no' && item.status === 'published') return false;
      if (f.due !== 'all' && (item.status === 'published' || item.status === 'scheduled' || dueBucket(item.dueAt, now) !== f.due)) return false;
      return true;
    });
    // `f` is derived from `query`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, query, now]);

  const owners = [...new Set(all.map((item) => item.ownerId).filter(Boolean))];
  const set = (key: string) => (value: string) => setQuery({ [key]: value === 'all' ? null : value });

  const exportCsv = (items: ContentItem[]) => {
    const head = ['Title', 'Status', 'Department', 'Type', 'Owner', 'Assignee', 'Platforms', 'Due', 'Publish', 'Source'];
    const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = items.map((item) =>
      [item.title, contentStatusLabel[item.status].en, departmentById(item.departmentId)?.name.en ?? '', contentTypeLabel[item.type].en, displayName(state.users, item.ownerId), displayName(state.users, item.assigneeId), item.channels.map((channel) => channelName[channel]).join(' | '), item.dueAt ?? '', item.publishAt ?? '', item.provenance].map(cell).join(','),
    );
    downloadText(`social-pulse-content-${new Date().toISOString().slice(0, 10)}.csv`, `﻿${[head.map(cell).join(','), ...lines].join('\n')}`, 'text/csv;charset=utf-8');
  };

  const columns: Column<ContentItem>[] = [
    {
      key: 'title',
      header: t('Title', 'العنوان'),
      sort: (item) => item.title,
      cell: (item) => (
        <div className="cell-title">
          <Link to={`/content/${item.id}`} className="cell-title__link" dir="auto" onClick={(event) => event.stopPropagation()}>
            {item.title}
          </Link>
          <span className="cell-title__meta">
            {tx(contentTypeLabel[item.type])}
            <PriorityBadge priority={item.priority} />
            <OriginBadge item={item} />
            <ProvenanceBadge item={item} />
          </span>
        </div>
      ),
    },
    { key: 'status', header: t('Status', 'الحالة'), sort: (item) => CONTENT_STATUSES.indexOf(item.status), cell: (item) => <ContentStatusBadge status={item.status} />, width: '150px' },
    { key: 'department', header: t('Department', 'القسم'), sort: (item) => item.departmentId, cell: (item) => <DepartmentName id={item.departmentId} />, secondary: true },
    { key: 'owner', header: t('Owner', 'المالك'), sort: (item) => displayName(state.users, item.ownerId), cell: (item) => <Person users={state.users} id={item.ownerId} />, secondary: true },
    { key: 'assignee', header: t('Assignee', 'المسند إليه'), sort: (item) => displayName(state.users, item.assigneeId) || null, cell: (item) => <Person users={state.users} id={item.assigneeId} empty="—" />, secondary: true },
    { key: 'channels', header: t('Platforms', 'المنصات'), cell: (item) => <Channels channels={item.channels} /> },
    { key: 'due', header: t('Due', 'التسليم'), sort: (item) => ms(item.dueAt), cell: (item) => <DueLabel iso={item.dueAt} now={now} done={item.status === 'published' || item.status === 'scheduled' || item.status === 'archived' || item.status === 'cancelled'} /> },
    { key: 'publish', header: t('Publish', 'النشر'), sort: (item) => ms(item.publishAt), cell: (item) => <DueLabel iso={item.publishAt} now={now} done />, secondary: true },
  ];

  return (
    <div className="u-stack">
      <PageHeader
        title={t('Content', 'المحتوى')}
        description={t('Every content item from idea to published, across departments.', 'كل عناصر المحتوى من الفكرة حتى النشر، لكل الأقسام.')}
        actions={
          <>
            <Button icon={<Download size={15} />} onClick={() => exportCsv(rows)} disabled={!rows.length}>
              {t('Export', 'تصدير')}
            </Button>
            {can('content.create') && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => create.open()}>
                {t('Create content', 'إنشاء محتوى')}
              </Button>
            )}
          </>
        }
      />

      <div className="toolbar">
        <div className="toolbar__search">
          <SearchInput inputRef={searchRef} value={q} onChange={(value) => setQuery({ q: value || null })} placeholder={t('Search titles and captions', 'ابحث في العناوين والنصوص')} label={t('Search content', 'ابحث في المحتوى')} />
        </div>
        <Segmented
          label={t('View', 'طريقة العرض')}
          iconOnly
          value={view}
          onChange={(value) => setQuery({ view: value === 'table' ? null : value })}
          items={[
            { value: 'table', label: t('Table', 'جدول'), icon: <Rows3 size={15} /> },
            { value: 'cards', label: t('Cards', 'بطاقات'), icon: <LayoutGrid size={15} /> },
            { value: 'board', label: t('Board', 'لوحة'), icon: <SquareKanban size={15} /> },
            { value: 'list', label: t('Compact list', 'قائمة مختصرة'), icon: <List size={15} /> },
          ]}
        />
      </div>

      <div className="filters" role="group" aria-label={t('Filters', 'عوامل التصفية')}>
        <FilterSelect label={t('Department', 'القسم')} allLabel={t('All', 'الكل')} value={f.department} onChange={set('department')} options={DEPARTMENTS.map((entry) => ({ value: entry.id, label: tx(entry.name) }))} />
        <FilterSelect label={t('Status', 'الحالة')} allLabel={t('All', 'الكل')} value={f.status} onChange={set('status')} options={CONTENT_STATUSES.map((value) => ({ value, label: tx(contentStatusLabel[value]) }))} />
        <FilterSelect label={t('Platform', 'المنصة')} allLabel={t('All', 'الكل')} value={f.platform} onChange={set('platform')} options={CHANNELS.map((value) => ({ value, label: channelName[value] }))} />
        <FilterSelect label={t('Owner', 'المالك')} allLabel={t('Anyone', 'أي شخص')} value={f.owner} onChange={set('owner')} options={owners.map((id) => ({ value: id, label: displayName(state.users, id) }))} />
        <FilterSelect label={t('Assignee', 'المسند إليه')} allLabel={t('Anyone', 'أي شخص')} value={f.assignee} onChange={set('assignee')} options={state.users.map((user) => ({ value: user.id, label: user.name }))} />
        <FilterSelect label={t('Campaign', 'الحملة')} allLabel={t('All', 'الكل')} value={f.campaign} onChange={set('campaign')} options={state.campaigns.map((entry) => ({ value: entry.id, label: entry.name }))} />
        <FilterSelect label={t('Type', 'النوع')} allLabel={t('All', 'الكل')} value={f.type} onChange={set('type')} options={CONTENT_TYPES.map((value) => ({ value, label: tx(contentTypeLabel[value]) }))} />
        <FilterSelect label={t('Template', 'القالب')} allLabel={t('All', 'الكل')} value={f.template} onChange={set('template')} options={state.templates.map((entry) => ({ value: entry.id, label: tx(entry.name) }))} />
        <FilterSelect label={t('Due', 'الموعد')} allLabel={t('Any time', 'أي وقت')} value={f.due} onChange={set('due')} options={[{ value: 'overdue' as const, label: t('Overdue', 'متأخر') }, { value: 'today' as const, label: t('Today', 'اليوم') }, { value: 'week' as const, label: t('This week', 'هذا الأسبوع') }, { value: 'later' as const, label: t('Later', 'لاحقًا') }]} />
        <FilterSelect label={t('Made with', 'طريقة الإعداد')} allLabel={t('AI or manual', 'AI أو يدوي')} value={f.origin} onChange={set('origin')} options={[{ value: 'ai' as const, label: t('AI-assisted', 'بمساعدة AI') }, { value: 'manual' as const, label: t('Manual', 'يدوي') }]} />
        <FilterSelect label={t('Published', 'النشر')} allLabel={t('All', 'الكل')} value={f.published} onChange={set('published')} options={[{ value: 'yes' as const, label: t('Published', 'منشور') }, { value: 'no' as const, label: t('Unpublished', 'غير منشور') }]} />
        <Checkbox checked={includeLive} onChange={(value) => setQuery({ live: value ? null : '0' })} label={t(`Calendar plans (${num(liveContent.length)})`, `خطط التقويم (${num(liveContent.length)})`)} disabled={store.phase !== 'ready'} />
        {filtersOn && (
          <button type="button" className="ui-link" onClick={() => setQuery(Object.fromEntries([...Object.keys(f), 'q'].map((key) => [key, null])))}>
            {t('Clear filters', 'مسح الفلاتر')}
          </button>
        )}
      </div>

      <p className="u-sm u-muted u-tnum" aria-live="polite">
        {t(`${num(rows.length)} items`, `${num(rows.length)} عنصر`)}
      </p>

      {view === 'table' && (
        <DataTable
          caption={t('Content items', 'عناصر المحتوى')}
          rows={rows}
          columns={columns}
          rowKey={(item) => item.id}
          rowLabel={(item) => item.title}
          onRowClick={(item) => navigate(`/content/${item.id}`)}
          initialSort={{ key: 'due', dir: 'asc' }}
          selectable={can('task.assign')}
          selected={selected}
          onSelectedChange={setSelected}
          bulkActions={
            <>
              <Select
                aria-label={t('Assign selected to', 'إسناد المحدد إلى')}
                value=""
                onChange={(event) => {
                  const id = event.target.value;
                  if (!id) return;
                  let done = 0;
                  for (const key of selected) if (assignContent(key, id).ok) done++;
                  toast.success(t(`${num(done)} items assigned`, `تم إسناد ${num(done)} عنصر`));
                  setSelected(new Set());
                }}
              >
                <option value="">{t('Assign to…', 'إسناد إلى…')}</option>
                {state.users.filter((user) => user.status === 'active').map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" icon={<Download size={14} />} onClick={() => exportCsv(rows.filter((item) => selected.has(item.id)))}>
                {t('Export selected', 'تصدير المحدد')}
              </Button>
            </>
          }
          empty={<NoResults filtered={filtersOn} />}
        />
      )}
      {view === 'cards' && (rows.length ? <CardsView items={rows} now={now} /> : <NoResults filtered={filtersOn} />)}
      {view === 'list' && (rows.length ? <CompactList items={rows} now={now} /> : <NoResults filtered={filtersOn} />)}
      {view === 'board' && <Board items={rows} now={now} />}
    </div>
  );
}

function NoResults({ filtered }: { filtered: boolean }) {
  const { t } = useI18n();
  return filtered ? (
    <EmptyState title={t('No content matches these filters.', 'لا يوجد محتوى يطابق هذه الفلاتر.')} text={t('Clear a filter or search for another word.', 'امسح أحد الفلاتر أو ابحث بكلمة أخرى.')} />
  ) : (
    <EmptyState title={t('No content yet.', 'لا يوجد محتوى بعد.')} text={t('Create the first item or start from a template.', 'أنشئ أول عنصر أو ابدأ من قالب.')} />
  );
}

function CardsView({ items, now }: { items: ContentItem[]; now: number }) {
  const { tx } = useI18n();
  const { state } = useWorkspace();
  return (
    <ul className="content-cards">
      {items.map((item) => (
        <li key={item.id}>
          <Link to={`/content/${item.id}`} className="content-card">
            <span className="content-card__top">
              <ContentStatusBadge status={item.status} />
              <Channels channels={item.channels} size={13} />
            </span>
            <span className="content-card__title" dir="auto">
              {item.title}
            </span>
            <span className="content-card__meta">
              <DepartmentName id={item.departmentId} /> · {tx(contentTypeLabel[item.type])}
            </span>
            <span className="content-card__foot">
              <Person users={state.users} id={item.assigneeId ?? item.ownerId} size={20} />
              {item.status === 'scheduled' ? <DueLabel iso={item.publishAt} now={now} done /> : <DueLabel iso={item.dueAt} now={now} done={item.status === 'published'} />}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CompactList({ items, now }: { items: ContentItem[]; now: number }) {
  return (
    <ul className="compact-list">
      {items.map((item) => (
        <li key={item.id}>
          <Link to={`/content/${item.id}`} className="compact-list__row">
            <ContentStatusBadge status={item.status} />
            <span className="u-truncate u-grow" dir="auto">
              {item.title}
            </span>
            <DepartmentName id={item.departmentId} />
            <DueLabel iso={item.status === 'scheduled' ? item.publishAt : item.dueAt} now={now} done={item.status === 'published' || item.status === 'scheduled'} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Kanban over the working pipeline. A drop runs the same permission-checked move as the buttons. */
function Board({ items, now }: { items: ContentItem[]; now: number }) {
  const { t, tx, num } = useI18n();
  const { me } = useWorkspace();
  const { request, dialog } = useMove();
  const act = useAct();
  const [dragging, setDragging] = useState<ContentItem | null>(null);
  const [over, setOver] = useState<ContentStatus | null>(null);

  const canDrop = (status: ContentStatus) => Boolean(dragging && dragging.status !== status && allowedTransitions(me, dragging).some((move) => move.to === status));
  const onDrop = (event: DragEvent, status: ContentStatus) => {
    event.preventDefault();
    setOver(null);
    if (!dragging || dragging.status === status) return;
    if (!canDrop(status)) {
      act({ ok: false, error: dragging.provenance === 'live' ? 'live' : allowedTransitions(me, dragging).length ? 'invalid' : 'permission' });
      return;
    }
    request(dragging, status);
  };

  return (
    <>
      <p className="u-xs u-muted">{t('Drag a card to move it. Columns you cannot move it to are dimmed; Marketing approves and schedules.', 'اسحب البطاقة لتحريكها. الأعمدة غير المتاحة لك باهتة؛ التسويق يعتمد ويجدول.')}</p>
      <div className="board" role="list">
        {BOARD_STATUSES.map((status) => {
          const list = items.filter((item) => item.status === status);
          const droppable = dragging ? canDrop(status) : true;
          return (
            <section
              key={status}
              className="board__col"
              role="listitem"
              aria-label={tx(contentStatusLabel[status])}
              data-over={over === status || undefined}
              data-disabled={dragging && !droppable && dragging.status !== status ? true : undefined}
              onDragOver={(event) => {
                if (!canDrop(status)) return;
                event.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((value) => (value === status ? null : value))}
              onDrop={(event) => onDrop(event, status)}
            >
              <header className="board__head">
                <ContentStatusBadge status={status} />
                <span className="u-tnum u-muted u-sm">{num(list.length)}</span>
              </header>
              <ul className="board__list">
                {list.map((item) => {
                  const moves = allowedTransitions(me, item);
                  return (
                    <li
                      key={item.id}
                      className="board-card"
                      draggable={moves.length > 0}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', item.id);
                        setDragging(item);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    >
                      <Link to={`/content/${item.id}`} className="board-card__title" dir="auto">
                        {item.title}
                      </Link>
                      <span className="board-card__meta">
                        <DepartmentName id={item.departmentId} />
                        <Channels channels={item.channels} size={12} />
                      </span>
                      <span className="board-card__foot">
                        <DueLabel iso={item.status === 'scheduled' ? item.publishAt : item.dueAt} now={now} done={item.status === 'published' || item.status === 'scheduled'} />
                        <ProvenanceBadge item={item} />
                      </span>
                      {moves.length > 0 && (
                        <select
                          className="board-card__move"
                          aria-label={t(`Move “${item.title}”`, `تحريك «${item.title}»`)}
                          value=""
                          onChange={(event) => event.target.value && request(item, event.target.value as ContentStatus)}
                        >
                          <option value="">{t('Move to…', 'نقل إلى…')}</option>
                          {moves.map((move) => (
                            <option key={move.to} value={move.to}>
                              {transitionLabel(item.status, move.to, t)}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  );
                })}
                {list.length === 0 && <li className="board__empty">{t('Nothing here', 'لا شيء هنا')}</li>}
              </ul>
            </section>
          );
        })}
      </div>
      {dialog}
    </>
  );
}
