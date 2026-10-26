import { AnimatePresence, motion } from 'motion/react';
import { Bell, ChevronRight, Menu as MenuIcon, Moon, PanelLeft, Search, SunMedium } from 'lucide-react';
import { Link } from '../app/router/router';
import { useLiveData } from '../app/providers/LiveDataProvider';
import { useTheme } from '../hooks/ui';
import { useI18n } from '../i18n/I18nProvider';
import { useNotificationGroups } from './NotificationCenter';
import { useShell } from './ShellContext';

/** Sticky 60px bar: sidebar toggle, breadcrumbs, search, notifications. */
export function Header() {
  const { t } = useI18n();
  const { toggleSidebar, setMobileNavOpen, crumbs, setPaletteOpen, setNotificationsOpen } = useShell();
  const groups = useNotificationGroups();
  const unread = groups.filter((group) => group.unread).length;
  const { store } = useLiveData();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="shell-header">
      <button type="button" className="ui-icon-btn ui-icon-btn--md ui-icon-btn--ghost shell-header__toggle" onClick={toggleSidebar} aria-label={t('Toggle sidebar', 'إظهار/إخفاء الشريط الجانبي')} title={t('Toggle sidebar', 'إظهار/إخفاء الشريط الجانبي')}>
        <PanelLeft size={17} className="u-flip" />
      </button>
      <button type="button" className="ui-icon-btn ui-icon-btn--md ui-icon-btn--ghost shell-header__menu" onClick={() => setMobileNavOpen(true)} aria-label={t('Open navigation', 'افتح القائمة')}>
        <MenuIcon size={18} />
      </button>
      <span className="shell-header__sep" aria-hidden />
      <nav className="shell-crumbs" aria-label={t('Breadcrumb', 'مسار الصفحة')}>
        <ol>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${index}`}>
                {index > 0 && <ChevronRight size={13} className="u-flip shell-crumbs__sep" aria-hidden />}
                {crumb.to && !last ? (
                  <Link to={crumb.to} className="shell-crumbs__link">
                    <bdi>{crumb.label}</bdi>
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={last ? 'shell-crumbs__current' : undefined}>
                    <bdi>{crumb.label}</bdi>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="shell-header__end">
        {store.staleError && store.phase === 'ready' && (
          <span className="ui-badge ui-badge--warning" title={store.staleError}>
            {t('Live data is stale', 'البيانات الحية غير محدثة')}
          </span>
        )}
        <button type="button" className="shell-search-trigger" onClick={() => setPaletteOpen(true)} aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}>
          <Search size={15} aria-hidden />
          <span className="shell-search-trigger__text">{t('Search', 'بحث')}</span>
          <kbd className="ui-kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <ThemeToggle />
        <button type="button" className="ui-icon-btn ui-icon-btn--md ui-icon-btn--ghost shell-bell" onClick={() => setNotificationsOpen(true)} aria-label={unread ? t(`Notifications, ${unread} unread`, `الإشعارات، ${unread} غير مقروءة`) : t('Notifications', 'الإشعارات')} title={t('Notifications', 'الإشعارات')}>
          <Bell size={17} />
          {unread > 0 && <span className="shell-bell__dot u-tnum">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>
    </header>
  );
}

/** Sun and moon swap with a turn; the page cross-fades between themes. */
function ThemeToggle() {
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? t('Switch to light mode', 'التحويل للوضع الفاتح') : t('Switch to dark mode', 'التحويل للوضع الداكن');
  return (
    <button type="button" className="ui-icon-btn ui-icon-btn--md ui-icon-btn--ghost shell-theme" onClick={toggle} aria-label={label} title={label}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          className="shell-theme__icon"
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {theme === 'dark' ? <SunMedium size={17} /> : <Moon size={17} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/** The title block at the top of each page: title, one-line description, actions. */
export function PageHeader({ title, description, actions, meta }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-head__titles">
        {meta && <div className="page-head__meta">{meta}</div>}
        <h1 className="page-head__title">{title}</h1>
        {description && <p className="page-head__desc">{description}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  );
}
