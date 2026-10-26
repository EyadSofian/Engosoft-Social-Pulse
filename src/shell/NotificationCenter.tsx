import { useMemo, useState } from 'react';
import { AtSign, BellOff, CalendarClock, CircleAlert, CircleCheck, Coins, FilePenLine, Hourglass, ListTodo, PlugZap, SearchCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from '../app/router/router';
import { useLiveData } from '../app/providers/LiveDataProvider';
import { useToast } from '../components/feedback/Toast';
import { EmptyState } from '../components/feedback/States';
import { Drawer } from '../components/overlay/Overlay';
import { DemoBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Tabs';
import type { NotificationCategory } from '../domain/management';
import type { Text } from '../domain/shared';
import { useWorkspace } from '../features/workspace/WorkspaceProvider';
import { hasPermission } from '../features/workspace/permissions';
import { useI18n } from '../i18n/I18nProvider';
import { channelName, notificationCategoryLabel } from '../i18n/labels';
import { alertPhase } from '../lib/analytics';
import { errorMessage } from '../lib/api';
import { parseTimestamp } from '../lib/format';
import { markServerRead, useServerNotifications } from './serverNotifications';
import { useShell } from './ShellContext';

const SERVER_CATEGORY: Record<string, NotificationCategory> = {
  content_created: 'task_assigned',
  content_review: 'review_required',
  content_approved: 'approved',
  content_changes_requested: 'changes_requested',
  content_cancelled: 'changes_requested',
  content_scheduled: 'publishing_reminder',
  content_published: 'approved',
  test: 'mention',
};

const ICON: Record<NotificationCategory, LucideIcon> = {
  task_assigned: ListTodo,
  review_required: SearchCheck,
  changes_requested: FilePenLine,
  approved: CircleCheck,
  publishing_reminder: CalendarClock,
  publishing_failure: CircleAlert,
  deadline: Hourglass,
  mention: AtSign,
  credit_warning: Coins,
  integration_problem: PlugZap,
};

/** One row in the center: related notifications collapse into a group with a count. */
export interface NotificationGroup {
  key: string;
  category: NotificationCategory;
  title: Text;
  bodies: string[];
  count: number;
  at: number;
  unread: boolean;
  href: string;
  provenance: 'live' | 'demo';
  /** Live calendar alerts are dismissed on the server, not marked read locally. */
  alertIds?: string[];
  /** Server notification (post created, sent for review, review result). */
  serverId?: string;
}

/**
 * Workspace notifications for the current person, plus live signals from the
 * API: publishing alerts and connector errors. Grouped by `groupKey`, newest first.
 */
export function useNotificationGroups(): NotificationGroup[] {
  const { me } = useWorkspace();
  const { store } = useLiveData();
  const { data } = store;

  const { items } = useServerNotifications();

  return useMemo(() => {
    const groups = new Map<string, NotificationGroup>();
    // Posts created or sent for review by any department, and review results on your own posts (server, per person).
    for (const entry of items) {
      groups.set(entry.id, {
        key: entry.id,
        category: SERVER_CATEGORY[entry.kind] ?? 'review_required',
        title: { en: entry.title, ar: entry.title },
        bodies: [entry.body],
        count: 1,
        at: parseTimestamp(entry.createdAt),
        unread: !entry.readAt,
        href: entry.link || '/content',
        provenance: 'live',
        serverId: entry.id,
      });
    }

    // Publishing alerts concern whoever schedules and publishes.
    if (hasPermission(me, 'content.schedule')) {
      const plans = new Map(data.plans.map((plan) => [plan.id, plan]));
      const open = data.alerts.filter((alert) => !alert.dismissedAt);
      const missed = new Set(open.filter((alert) => alert.kind === 'missed').map((alert) => alert.planId));
      const now = Date.now();
      for (const alert of open) {
        if (alert.kind !== 'missed' && missed.has(alert.planId)) continue;
        const plan = plans.get(alert.planId);
        const phase = alertPhase(alert.kind, plan, now);
        const key = phase === 'missed' ? 'live-missed' : 'live-reminder';
        const body = plan ? `${plan.title} · ${channelName[plan.platform]}` : alert.message;
        const at = parseTimestamp(alert.createdAt);
        const hit = groups.get(key);
        if (hit) {
          hit.count++;
          hit.bodies.push(body);
          hit.alertIds!.push(alert.id);
          if (at > hit.at) hit.at = at;
        } else
          groups.set(key, {
            key,
            category: phase === 'missed' ? 'publishing_failure' : 'publishing_reminder',
            title: phase === 'missed' ? { en: 'Publishing not confirmed', ar: 'لم يتأكد النشر' } : { en: 'Posts due soon', ar: 'منشورات قريبة' },
            bodies: [body],
            count: 1,
            at,
            unread: true,
            href: '/calendar?view=live',
            provenance: 'live',
            alertIds: [alert.id],
          });
      }
    }

    if (hasPermission(me, 'connections.manage')) {
      const failing = data.connectors.filter((connector) => connector.status === 'error');
      if (failing.length)
        groups.set('live-connectors', {
          key: 'live-connectors',
          category: 'integration_problem',
          title: { en: 'A connection returned an error', ar: 'أعاد مصدر ربط خطأً' },
          bodies: failing.map((connector) => `${channelName[connector.platform]}: ${connector.message}`),
          count: failing.length,
          at: failing.reduce((latest, connector) => Math.max(latest, connector.checkedAt ? parseTimestamp(connector.checkedAt) : 0), 0),
          unread: true,
          href: '/settings',
          provenance: 'live',
        });
    }

    return [...groups.values()].sort((a, b) => Number(b.unread) - Number(a.unread) || b.at - a.at);
  }, [items, me, data.alerts, data.plans, data.connectors]);
}

export function NotificationCenter() {
  const { t, tx, relative, num } = useI18n();
  const { notificationsOpen, setNotificationsOpen } = useShell();
  const { store } = useLiveData();
  const { navigate } = useRouter();
  const toast = useToast();
  const groups = useNotificationGroups();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState('');

  const visible = filter === 'unread' ? groups.filter((group) => group.unread) : groups;
  const unread = groups.filter((group) => group.unread && group.serverId).length;
  const close = () => setNotificationsOpen(false);

  const open = (group: NotificationGroup) => {
    if (group.serverId && group.unread) void markServerRead([group.serverId]);
    close();
    navigate(group.href);
  };

  const dismiss = async (group: NotificationGroup) => {
    if (!group.alertIds) return;
    setBusy(group.key);
    try {
      for (const id of group.alertIds) await store.dismissAlert(id);
      toast.success(t('Alerts dismissed', 'تم إغلاق التنبيهات'));
    } catch (error) {
      toast.error(t('Could not dismiss', 'تعذّر الإغلاق'), errorMessage(error, ''));
    } finally {
      setBusy('');
    }
  };

  return (
    <Drawer
      open={notificationsOpen}
      onClose={close}
      title={t('Notifications', 'الإشعارات')}
      label={t('Notifications', 'الإشعارات')}
      subtitle={t('Related events are grouped so you see each thing once.', 'الأحداث المرتبطة مجمّعة حتى تراها مرة واحدة.')}
      footer={
        <div className="u-row u-row--between u-grow">
          <Segmented
            label={t('Filter notifications', 'تصفية الإشعارات')}
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'all', label: t('All', 'الكل') },
              { value: 'unread', label: t('Unread', 'غير المقروءة') },
            ]}
          />
          <Button size="sm" variant="ghost" disabled={!unread} onClick={() => void markServerRead()}>
            {t('Mark all read', 'تعليم الكل كمقروء')}
          </Button>
        </div>
      }
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={<BellOff size={20} />}
          title={filter === 'unread' ? t('You are all caught up.', 'لا يوجد جديد.') : t('No notifications yet.', 'لا توجد إشعارات بعد.')}
          text={t('Assignments, review requests, mentions and publishing alerts will appear here.', 'الإسنادات وطلبات المراجعة والإشارات وتنبيهات النشر تظهر هنا.')}
        />
      ) : (
        <ul className="nc-list">
          {visible.map((group) => {
            const Icon = ICON[group.category];
            return (
              <li key={group.key} className="nc-item" data-unread={group.unread || undefined} data-category={group.category}>
                <span className="nc-item__icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <button type="button" className="nc-item__main" onClick={() => open(group)}>
                  <span className="nc-item__top">
                    <b>{tx(group.title)}</b>
                    {group.count > 1 && <span className="nc-item__count u-tnum">×{num(group.count)}</span>}
                  </span>
                  <span className="nc-item__body" dir="auto">
                    {group.bodies.slice(0, 2).join(' · ')}
                    {group.bodies.length > 2 && ` ${t(`+${group.bodies.length - 2} more`, `+${group.bodies.length - 2} أخرى`)}`}
                  </span>
                  <span className="nc-item__meta">
                    {tx(notificationCategoryLabel[group.category])} · {group.at ? relative(group.at) : '—'}
                    {group.provenance === 'live' ? <span className="ui-live-badge">{t('Live', 'مباشر')}</span> : <DemoBadge />}
                  </span>
                </button>
                {group.alertIds && (
                  <Button size="sm" variant="ghost" busy={busy === group.key} onClick={() => void dismiss(group)}>
                    {t('Dismiss', 'إغلاق')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
