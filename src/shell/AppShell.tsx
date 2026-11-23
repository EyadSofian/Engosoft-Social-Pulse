import { useEffect } from 'react';
import { ProductTour } from './ProductTour';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, CalendarDays, House, Layers, LayoutDashboard, Lock, MapPinOff, Menu as MenuIcon, WandSparkles } from 'lucide-react';
import { Link, useRouter } from '../app/router/router';
import { resolveRoute } from '../app/routes';
import { EmptyState } from '../components/feedback/States';
import { ButtonLink } from '../components/ui/Button';
import { useWorkspace } from '../features/workspace/WorkspaceProvider';
import { useMediaQuery, useOverlay } from '../hooks/ui';
import { useI18n } from '../i18n/I18nProvider';
import { CommandPalette } from './CommandPalette';
import { Header } from './Header';
import { activeNav, navItem, sectionOf, type NavId } from './nav';
import { NotificationCenter } from './NotificationCenter';
import { NotificationPopups, useServerNotifications } from './serverNotifications';
import { registerServiceWorker, resyncPush } from '../lib/push';
import { useShell, usePageMeta } from './ShellContext';
import { Sidebar } from './Sidebar';
import { PostDrawerHost } from './PostDrawerHost';

/**
 * The persistent application frame: sidebar (rail when collapsed), sticky
 * header, scrolling workspace. Pages render inside it; only the workspace
 * transitions between routes.
 */
export function AppShell() {
  const { path } = useRouter();
  const { me } = useWorkspace();
  const { collapsed, mobileNavOpen, setMobileNavOpen } = useShell();
  const compact = useMediaQuery('(max-width: 960px)');
  const { t } = useI18n();

  const resolved = resolveRoute(path);
  const allowed = resolved ? navItem(resolved.route.nav).visible(me) : true;

  useEffect(() => {
    if (!compact) setMobileNavOpen(false);
  }, [compact, setMobileNavOpen]);

  useAppNotifications();

  return (
    <div className="shell" data-collapsed={collapsed || undefined}>
      <a href="#app-main" className="skip-link">
        {t('Skip to content', 'تخطَّ إلى المحتوى')}
      </a>
      <aside className="shell-aside" aria-label={t('Sidebar', 'الشريط الجانبي')}>
        <Sidebar />
      </aside>
      <AnimatePresence>{compact && mobileNavOpen && <MobileNav onClose={() => setMobileNavOpen(false)} />}</AnimatePresence>

      <div className="shell-main">
        <Header />
        <SectionTabs path={path} />
        <main id="app-main" className="shell-content" tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={resolved ? `${resolved.route.pattern}:${resolved.params.id ?? ''}` : path}
              className="page"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            >
              {!resolved ? <NotFound /> : !allowed ? <NoAccess nav={resolved.route.nav} /> : resolved.route.render(resolved.params)}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav />
      <CommandPalette />
      <NotificationCenter />
      <NotificationPopups />
      <PostDrawerHost />
      <ProductTour />
    </div>
  );
}

/** The pages of the open section as tabs under the header: Content shows Create, Approval, Calendar, Publishing. */
function SectionTabs({ path }: { path: string }) {
  const { me } = useWorkspace();
  const { tx, t } = useI18n();
  const active = activeNav(path);
  const section = sectionOf(active, me);
  if (!section || section.visibleItems.length < 2) return null;
  return (
    <nav className="section-tabs" aria-label={t(`${section.label.en} pages`, `صفحات ${section.label.ar}`)}>
      <div className="section-tabs__inner">
        <span className="section-tabs__title">{tx(section.label)}</span>
        <div className="section-tabs__list">
          {section.visibleItems.map((item) => (
            <Link key={item.id} to={item.path} className="section-tabs__tab" aria-current={active === item.id ? 'page' : undefined}>
              {tx(item.label)}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

function MobileNav({ onClose }: { onClose: () => void }) {
  const ref = useOverlay(true, onClose);
  const { t, dir } = useI18n();
  const offset = dir === 'rtl' ? 24 : -24;
  return (
    <div className="ui-overlay ui-overlay--nav">
      <motion.div className="ui-overlay__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} />
      <motion.div
        ref={ref}
        data-overlay
        role="dialog"
        aria-modal="true"
        aria-label={t('Navigation', 'التنقل')}
        tabIndex={-1}
        className="shell-mobile-nav"
        initial={{ x: offset, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: offset, opacity: 0, transition: { duration: 0.14 } }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <Sidebar drawer />
      </motion.div>
    </div>
  );
}

/**
 * The installed app: the service worker shows phone notifications, and tapping one while the app is open moves to
 * its page here instead of reloading. The device's subscription is re-sent after each sign-in.
 */
function useAppNotifications() {
  const { navigate } = useRouter();
  useEffect(() => {
    void registerServiceWorker().then(() => resyncPush());
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== 'open' || !data.url) return;
      const url = new URL(data.url, window.location.origin);
      if (url.origin === window.location.origin) navigate(`${url.pathname}${url.search}`);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}

/**
 * Phones: four daily destinations and «المزيد» for everything else. People who follow performance get its summary
 * in the bar (with a dot for unread notifications); the others get the calendar.
 */
function BottomNav() {
  const { path } = useRouter();
  const { me } = useWorkspace();
  const { tx, t } = useI18n();
  const { setMobileNavOpen } = useShell();
  const { items } = useServerNotifications();
  const active = activeNav(path);
  const performance = navItem('insights').visible(me);
  const unreadInsights = items.some((item) => item.kind.startsWith('insight_') && !item.readAt);
  const ids: { id: NavId; icon: typeof House }[] = [
    { id: 'overview', icon: LayoutDashboard },
    { id: 'content', icon: Layers },
    { id: 'home', icon: WandSparkles },
    performance ? { id: 'insights', icon: BellRing } : { id: 'calendar', icon: CalendarDays },
  ];
  return (
    <nav className="shell-bottom-nav" aria-label={t('Quick navigation', 'تنقل سريع')}>
      {ids.filter(({ id }) => navItem(id).visible(me)).map(({ id, icon: Icon }) => {
        const item = navItem(id);
        return (
          <Link key={id} to={item.path} className="shell-bottom-nav__item" data-tour={`nav-${id}`} data-create={id === 'home' || undefined} aria-current={active === id ? 'page' : undefined}>
            <span className="shell-bottom-nav__icon">
              <Icon size={19} aria-hidden />
              {id === 'insights' && unreadInsights && <span className="shell-bottom-nav__dot" aria-label={t('New', 'جديد')} />}
            </span>
            <span>{id === 'insights' ? t('Performance', 'الأداء') : tx(item.label)}</span>
          </Link>
        );
      })}
      <button type="button" className="shell-bottom-nav__item" onClick={() => setMobileNavOpen(true)}>
        <span className="shell-bottom-nav__icon">
          <MenuIcon size={19} aria-hidden />
        </span>
        <span>{t('More', 'المزيد')}</span>
      </button>
    </nav>
  );
}

function NotFound() {
  const { t } = useI18n();
  usePageMeta(t('Not found', 'غير موجود'), [{ label: t('Not found', 'غير موجود') }]);
  return (
    <EmptyState
      icon={<MapPinOff size={22} />}
      title={t('This page does not exist.', 'هذه الصفحة غير موجودة.')}
      text={t('The link may be old. Old dashboard links redirect automatically; this one did not match any page.', 'قد يكون الرابط قديمًا. روابط اللوحة القديمة تتحول تلقائيًا، وهذا الرابط لا يطابق أي صفحة.')}
      action={<ButtonLink to="/" variant="primary">{t('Go to Home', 'اذهب للرئيسية')}</ButtonLink>}
    />
  );
}

function NoAccess({ nav }: { nav: NavId }) {
  const { t, tx } = useI18n();
  const item = navItem(nav);
  usePageMeta(tx(item.label), [{ label: tx(item.label) }]);
  return (
    <EmptyState
      icon={<Lock size={22} />}
      title={t(`${item.label.en} is not part of your role.`, `صفحة «${item.label.ar}» ليست ضمن صلاحيات دورك.`)}
      text={t('Ask an administrator if you need access. Your Home shows what is waiting for you.', 'اطلب الصلاحية من مسؤول النظام إن احتجتها. صفحتك الرئيسية تعرض ما ينتظرك.')}
      action={<ButtonLink to="/" variant="primary">{t('Go to Home', 'اذهب للرئيسية')}</ButtonLink>}
    />
  );
}
