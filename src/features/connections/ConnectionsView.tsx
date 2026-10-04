import { useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Copy, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { ConnectorPill, Panel, Reveal, Ring, ViewHeader } from '../../components/ui/Bits';
import { Button } from '../../components/ui/Button';
import { PlatformBadge } from '../../components/ui/Platform';
import { useToast } from '../../components/ui/Toast';
import { useApp } from '../../context';
import { dateFromKey, fmtDate, fmtDateTime, num, relative } from '../../lib/format';
import { connectorGuide, platformColor, platformLatin, platformName } from '../../lib/platforms';
import type { Platform } from '../../types';

export function ConnectionsView() {
  const { data, now, store, runSync } = useApp();
  const toast = useToast();
  const [expanded, setExpanded] = useState<Platform | null>(null);

  const stored = useMemo(() => {
    const map = new Map<Platform, { count: number; latest: number }>();
    for (const post of data.posts) {
      const hit = map.get(post.platform) ?? { count: 0, latest: 0 };
      hit.count++;
      hit.latest = Math.max(hit.latest, post.ts);
      map.set(post.platform, hit);
    }
    return map;
  }, [data.posts]);

  const connected = data.connectors.filter((item) => item.status === 'connected').length;
  const failing = data.connectors.filter((item) => item.status === 'error').length;
  const lastCheck = data.connectors.reduce((latest, item) => Math.max(latest, item.checkedAt ? Date.parse(item.checkedAt) : 0), 0);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('تم النسخ', value);
    } catch {
      toast.info('انسخ الاسم يدويًا', value);
    }
  };

  return (
    <>
      <Reveal>
        <ViewHeader title="الربط والمنصات" subtitle="حالة كل مصدر كما جرّبها السيرفر فعليًا، وما يحتاجه ليعرض بياناته.">
          <Button variant="primary" icon={<RefreshCw size={16} />} busy={store.syncing} onClick={() => void runSync()}>
            {store.syncing ? 'جارٍ الفحص…' : 'فحص ومزامنة الكل'}
          </Button>
        </ViewHeader>
      </Reveal>

      <Reveal i={1}>
        <section className="glass health" data-spot>
          <Ring value={(connected / data.connectors.length) * 100} size={96} stroke={9} tone="ok">
            <b>{connected}</b>
            <small>من {data.connectors.length}</small>
          </Ring>
          <div className="health__text">
            <h2>
              {connected === data.connectors.length
                ? 'كل المصادر متصلة'
                : connected
                  ? `${connected} ${connected === 1 ? 'مصدر متصل' : 'مصادر متصلة'}، والباقي ينتظر الإعداد`
                  : 'لا يوجد مصدر متصل بعد'}
            </h2>
            <p>
              الحالة مبنية على محاولة المزامنة الفعلية وليس على وجود المفتاح فقط — توكن الإعلانات وحده لا يضمن قراءة البوستات العضوية.
            </p>
          </div>
          <dl className="health__facts">
            <div>
              <dt>آخر فحص</dt>
              <dd>{lastCheck ? relative(lastCheck, now) : '—'}</dd>
            </div>
            <div>
              <dt>مزامنة تلقائية</dt>
              <dd>كل 30 دقيقة</dd>
            </div>
            <div data-alert={failing > 0 || undefined}>
              <dt>تحتاج مراجعة</dt>
              <dd>{num(failing)}</dd>
            </div>
          </dl>
        </section>
      </Reveal>

      <div className="connectors">
        {data.connectors.map((connector, index) => {
          const guide = connectorGuide[connector.platform];
          const info = stored.get(connector.platform);
          const open = expanded === connector.platform;
          return (
            <Reveal key={connector.platform} i={2 + index}>
              <article
                className="glass connector"
                data-status={connector.status}
                data-spot
                style={{ '--p': platformColor(connector.platform) } as CSSProperties}
              >
                <header className="connector__head">
                  <PlatformBadge platform={connector.platform} size="lg" />
                  <div>
                    <h3>{platformName[connector.platform]}</h3>
                    <small>{connector.platform === 'website' ? 'Google Analytics 4' : platformLatin[connector.platform]}</small>
                  </div>
                  <ConnectorPill status={connector.status} />
                </header>

                <p className="connector__message">{connector.message}</p>

                <dl className="connector__facts">
                  <div>
                    <dt>{connector.platform === 'website' ? 'أيام مسجّلة' : 'بوستات محفوظة'}</dt>
                    <dd>{connector.platform === 'website' ? num(data.website.length) : num(info?.count ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>{connector.platform === 'website' ? 'آخر يوم' : 'أحدث منشور'}</dt>
                    <dd>
                      {connector.platform === 'website'
                        ? data.website.length
                          ? fmtDate(dateFromKey(data.website[data.website.length - 1].date).toMillis())
                          : '—'
                        : info?.latest
                          ? fmtDate(info.latest)
                          : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>آخر فحص</dt>
                    <dd title={connector.checkedAt ? fmtDateTime(connector.checkedAt) : undefined}>
                      {connector.checkedAt ? relative(connector.checkedAt, now) : 'لم يُفحص'}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="connector__toggle"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : connector.platform)}
                >
                  <KeyRound size={15} />
                  <span>{connector.status === 'connected' ? 'ما الذي يُقرأ وكيف يُضبط' : 'المطلوب لإكمال الربط'}</span>
                  <ChevronDown size={16} className="connector__chevron" />
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      className="connector__guide"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div className="connector__guide-inner">
                        <p>
                          <b>ما يُقرأ:</b> {guide.reads}
                        </p>
                        <ul>
                          {guide.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                        <b className="connector__env-title">متغيرات البيئة على السيرفر</b>
                        <div className="connector__env">
                          {guide.env.map((name) => (
                            <button key={name} type="button" className="env" onClick={() => void copy(name)} title="انسخ اسم المتغير">
                              <code dir="ltr">{name}</code>
                              <Copy size={12} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </article>
            </Reveal>
          );
        })}
      </div>

      <Reveal i={8}>
        <Panel className="note">
          <span className="note__icon">
            <ShieldCheck size={20} />
          </span>
          <div>
            <b>المفاتيح تبقى على السيرفر فقط</b>
            <p>
              تُضبط كمتغيرات بيئة في خدمة Railway، ولا تُرسل إلى المتصفح ولا تُكتب في الكاليندر. بعد تعديل أي متغير أعد تشغيل الخدمة ثم اضغط «فحص ومزامنة
              الكل».
            </p>
          </div>
        </Panel>
      </Reveal>
    </>
  );
}
