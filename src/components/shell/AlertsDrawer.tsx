import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, BellRing, Check, CircleAlert, Clock3, Hourglass, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context';
import { alertPhase, type AlertPhase } from '../../lib/analytics';
import { errorMessage } from '../../lib/api';
import { fmtDateTime, relative } from '../../lib/format';
import { platformName } from '../../lib/platforms';
import type { Alert, Dashboard, Plan } from '../../types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Bits';
import { Segmented } from '../ui/Controls';
import { Drawer } from '../ui/Overlay';
import { PlatformBadge } from '../ui/Platform';
import { useToast } from '../ui/Toast';

export interface AlertItem {
  alert: Alert;
  plan?: Plan;
  phase: AlertPhase;
}

/** Open alerts, minus reminders already superseded by a "missed" alert for the same post. */
export function openAlertItems(data: Dashboard, now: number): AlertItem[] {
  const plans = new Map(data.plans.map((plan) => [plan.id, plan]));
  const open = data.alerts.filter((alert) => !alert.dismissedAt);
  const missed = new Set(open.filter((alert) => alert.kind === 'missed').map((alert) => alert.planId));
  return open
    .filter((alert) => alert.kind === 'missed' || !missed.has(alert.planId))
    .map((alert) => {
      const plan = plans.get(alert.planId);
      return { alert, plan, phase: alertPhase(alert.kind, plan, now) };
    });
}

const PHASE: Record<AlertPhase, { title: string; icon: typeof Bell }> = {
  missed: { title: 'لم يتأكد نشر البوست', icon: CircleAlert },
  due: { title: 'حان موعد النشر', icon: Hourglass },
  reminder: { title: 'بوست قريب', icon: Clock3 },
};

type Permission = NotificationPermission | 'unsupported';
const readPermission = (): Permission => ('Notification' in window ? Notification.permission : 'unsupported');

export function AlertsDrawer({ open, onClose, items }: { open: boolean; onClose: () => void; items: AlertItem[] }) {
  const { data, now, store, openPlan } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<'open' | 'history'>('open');
  const [busy, setBusy] = useState('');
  const [permission, setPermission] = useState<Permission>(readPermission);

  const history = useMemo(() => {
    const plans = new Map(data.plans.map((plan) => [plan.id, plan]));
    return data.alerts.filter((alert) => alert.dismissedAt).map((alert) => ({ alert, plan: plans.get(alert.planId) }));
  }, [data.alerts, data.plans]);
  const connected = useMemo(
    () => new Set(data.connectors.filter((item) => item.status === 'connected').map((item) => item.platform)),
    [data.connectors],
  );

  const dismiss = async (id: string) => {
    setBusy(id);
    try {
      await store.dismissAlert(id);
    } catch (error) {
      toast.error('تعذّر إخفاء التنبيه', errorMessage(error, ''));
    } finally {
      setBusy('');
    }
  };

  const enable = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') toast.success('تم تفعيل تنبيهات المتصفح', 'ستصلك التنبيهات ما دامت اللوحة مفتوحة.');
    else toast.info('التنبيهات غير مفعّلة', 'يمكنك متابعة التنبيهات من هذه القائمة.');
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="التنبيهات"
      subtitle={items.length ? `${items.length} تنبيه مفتوح` : 'لا توجد تنبيهات مفتوحة'}
      icon={
        <span className="drawer__icon">
          <Bell size={19} />
        </span>
      }
      width={460}
      footer={
        permission === 'granted' ? (
          <span className="alerts__perm">
            <BellRing size={15} /> تنبيهات المتصفح مفعّلة
          </span>
        ) : permission === 'default' ? (
          <Button variant="glass" icon={<BellRing size={16} />} onClick={() => void enable()}>
            فعّل تنبيهات المتصفح
          </Button>
        ) : (
          <span className="alerts__perm alerts__perm--off">
            {permission === 'denied' ? 'تنبيهات المتصفح محظورة من إعدادات الموقع.' : 'هذا المتصفح لا يدعم التنبيهات.'}
          </span>
        )
      }
    >
      <Segmented
        label="عرض التنبيهات"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'open', label: `مفتوحة (${items.length})` },
          { value: 'history', label: `السجل (${history.length})` },
        ]}
      />

      {tab === 'open' && (
        <div className="alerts">
          {!items.length && (
            <EmptyState icon={<ShieldCheck size={26} />} title="كل شيء تحت السيطرة" text="تذكيرات ما قبل النشر وتنبيهات عدم تأكيد النشر ستظهر هنا." />
          )}
          <AnimatePresence initial={false}>
            {items.map(({ alert, plan, phase }) => {
              const Icon = PHASE[phase].icon;
              return (
                <motion.article
                  key={alert.id}
                  layout
                  className={`alert alert--${phase}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                >
                  <span className="alert__icon">
                    <Icon size={17} />
                  </span>
                  <div className="alert__body">
                    <b>{PHASE[phase].title}</b>
                    {plan ? (
                      <>
                        <p className="alert__title">
                          <PlatformBadge platform={plan.platform} size="xs" />
                          {plan.title}
                        </p>
                        <span className="alert__meta">
                          {platformName[plan.platform]} · {fmtDateTime(plan.ts)} · {relative(plan.ts, now)}
                        </span>
                        {phase === 'missed' && !connected.has(plan.platform) && (
                          <span className="alert__note">ربط {platformName[plan.platform]} غير متاح حاليًا؛ راجع الصفحة يدويًا.</span>
                        )}
                      </>
                    ) : (
                      <p className="alert__title">{alert.message}</p>
                    )}
                    <div className="alert__actions">
                      {plan && (
                        <Button
                          size="sm"
                          variant="glass"
                          onClick={() => {
                            onClose();
                            openPlan({ mode: 'edit', plan });
                          }}
                        >
                          افتح البوست
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon={<Check size={14} />} busy={busy === alert.id} onClick={() => void dismiss(alert.id)}>
                        إخفاء
                      </Button>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {tab === 'history' && (
        <div className="alerts">
          {!history.length && <EmptyState icon={<Clock3 size={26} />} title="السجل فارغ" text="التنبيهات التي تُخفيها أو تُحل تلقائيًا تظهر هنا." />}
          {history.map(({ alert, plan }) => (
            <article key={alert.id} className="alert alert--past">
              <span className="alert__icon">
                <Check size={16} />
              </span>
              <div className="alert__body">
                <b>{alert.kind === 'missed' ? 'تنبيه عدم تأكيد النشر' : 'تذكير قبل الموعد'}</b>
                <p className="alert__title">{plan ? plan.title : alert.message}</p>
                <span className="alert__meta">
                  أُنشئ {fmtDateTime(alert.createdAt)} · أُغلق {relative(alert.dismissedAt, now)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </Drawer>
  );
}
