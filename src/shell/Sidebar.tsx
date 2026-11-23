import { useEffect, useState } from 'react';
import { ChevronDown, ChevronsUpDown, Compass, Languages, LogOut, Moon, Plus, SunMedium } from 'lucide-react';
import { startTour } from './ProductTour';
import { Link, useRouter } from '../app/router/router';
import { ROLES, departmentById } from '../domain/catalog';
import { useWorkspace } from '../features/workspace/WorkspaceProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { api } from '../lib/api';
import { useTheme } from '../hooks/ui';
import { useI18n } from '../i18n/I18nProvider';
import { Avatar } from '../components/ui/Avatar';
import { Menu, type MenuItem } from '../components/ui/Menu';
import { activeNav, NAV, type NavId } from './nav';
import { useShell } from './ShellContext';

/** Engosoft mark: the approved white symbol inside the approved brand-blue circle badge (symbol = 31.57% of the diameter). */
export function BrandMark({ size = 32 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="shell-brand__mark"><circle cx="50" cy="50" r="50" fill="#0046FF" /><image href="/brand/logos/engosoft-symbol-reversed.svg" x="34.215" y="28.69" width="31.57" height="42.62" /></svg>;
}

/** What is waiting for this person: posts to review for approvers, change requests on their own posts. */
function useNavCounts(): Partial<Record<NavId, number>> {
  const { user, can } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => void api<{ status: string; ownerId: string }[]>('/api/content').then((items) => {
      if (alive) setCount(items.filter((item) => ((can('content.approve') || can('content.publish')) && item.status === 'ready_for_review') || (item.ownerId === user.id && item.status === 'changes_requested')).length);
    }).catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [user.id, can]);
  return { content: count || undefined };
}

/** `drawer` renders the full-width version inside the mobile navigation sheet. */
export function Sidebar({ drawer }: { drawer?: boolean }) {
  const { t, tx } = useI18n();
  const { path } = useRouter();
  const shell = useShell();
  const { setMobileNavOpen } = shell;
  const collapsed = shell.collapsed && !drawer;
  const { me } = useWorkspace();
  const { can } = useAuth();
  const counts = useNavCounts();
  const active = activeNav(path);
  const [open, setOpen] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('mobde3-nav-open') || '[]'); } catch { return []; } });
  const toggle = (id: string, here: boolean) => {
    if (here) return;
    setOpen((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      try { localStorage.setItem('mobde3-nav-open', JSON.stringify(next)); } catch { /* private window */ }
      return next;
    });
  };

  return (
    <div className="shell-sidebar" data-collapsed={collapsed || undefined}>
      <Link to="/" className="shell-brand" title={collapsed ? 'Engosoft Mobde3' : undefined} onClick={() => setMobileNavOpen(false)}>
        <BrandMark />
        {!collapsed && (
          <span className="shell-brand__text">
            <b>{t('Mobde3', 'مبدع')}</b>
            <small>Engosoft · {t('Content Operations', 'عمليات المحتوى')}</small>
          </span>
        )}
      </Link>

      {can('content.create') && (
        <Link to="/" className="shell-create" data-tour="new-post" title={collapsed ? t('New post', 'منشور جديد') : undefined} aria-label={collapsed ? t('New post', 'منشور جديد') : undefined} onClick={() => setMobileNavOpen(false)}>
          <span className="shell-create__icon">
            <Plus size={18} strokeWidth={2.4} aria-hidden />
          </span>
          {!collapsed && (
            <>
              <span className="shell-create__text">{t('New post', 'منشور جديد')}</span>
            </>
          )}
        </Link>
      )}

      <nav className="shell-nav" aria-label={t('Main navigation', 'التنقل الرئيسي')}>
        {NAV.map((group) => {
          const items = group.items.filter((item) => item.visible(me));
          if (!items.length) return null;
          const SectionIcon = group.icon;
          const here = items.some((item) => item.id === active);
          const total = items.reduce((sum, item) => sum + (counts[item.id] ?? 0), 0);
          // A one-page section, or the narrow rail, is a single link to its first page.
          if (items.length === 1 || collapsed) {
            const first = items[0];
            return (
              <div key={group.id} className="shell-nav__section">
                <Link
                  to={first.path}
                  className="shell-nav__item shell-nav__item--section"
                  data-tour={`nav-${first.id}`}
                  data-tour-also={items.map((item) => `nav-${item.id}`).join(' ')}
                  aria-current={here ? 'page' : undefined}
                  data-tip={collapsed ? tx(group.label) : undefined}
                  aria-label={collapsed ? tx(group.label) : undefined}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span className="shell-nav__icon"><SectionIcon size={18} strokeWidth={1.9} aria-hidden /></span>
                  {!collapsed && <span className="shell-nav__text">{tx(group.label)}</span>}
                  {total ? <span className="shell-nav__count u-tnum" aria-label={t(`${total} open`, `${total} مفتوحة`)}>{total}</span> : null}
                </Link>
              </div>
            );
          }
          const isOpen = here || open.includes(group.id);
          return (
            <div key={group.id} className="shell-nav__section" data-open={isOpen || undefined} data-here={here || undefined}>
              <button
                type="button"
                className="shell-nav__item shell-nav__item--section"
                aria-expanded={isOpen}
                data-tour-also={items.map((item) => `nav-${item.id}`).join(' ')}
                onClick={() => toggle(group.id, here)}
              >
                <span className="shell-nav__icon"><SectionIcon size={18} strokeWidth={1.9} aria-hidden /></span>
                <span className="shell-nav__text">{tx(group.label)}</span>
                {!isOpen && total ? <span className="shell-nav__count u-tnum">{total}</span> : null}
                <ChevronDown size={15} className="shell-nav__chevron" aria-hidden />
              </button>
              {isOpen && (
                <ul className="shell-nav__children">
                  {items.map((item) => {
                    const count = counts[item.id];
                    return (
                      <li key={item.id}>
                        <Link
                          to={item.path}
                          className="shell-nav__child"
                          data-tour={`nav-${item.id}`}
                          aria-current={active === item.id ? 'page' : undefined}
                          onClick={() => setMobileNavOpen(false)}
                        >
                          <span className="shell-nav__text">{tx(item.label)}</span>
                          {count ? <span className="shell-nav__count u-tnum" aria-label={t(`${count} open`, `${count} مفتوحة`)}>{count}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <UserMenu collapsed={collapsed} />
    </div>
  );
}

/** The signed-in account, language, theme and sign-out. */
function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { t, tx, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const department = departmentById(user.departmentId);
  const items: MenuItem[] = [
    { key: 'lang', icon: <Languages size={15} />, label: lang === 'ar' ? 'English' : 'العربية', onSelect: () => setLang(lang === 'ar' ? 'en' : 'ar') },
    { key: 'theme', icon: theme === 'dark' ? <SunMedium size={15} /> : <Moon size={15} />, label: theme === 'dark' ? t('Light mode', 'الوضع الفاتح') : t('Dark mode', 'الوضع الداكن'), onSelect: toggle },
    { key: 'tour', icon: <Compass size={15} />, label: t('Take the tour', 'جولة تعريفية'), onSelect: startTour },
    { key: 'logout', icon: <LogOut size={15} />, label: t('Sign out', 'تسجيل الخروج'), onSelect: () => void logout() },
  ];
  return (
    <div className="shell-user">
      <Menu
        label={t('Account', 'الحساب')}
        align="start"
        header={<span className="u-xs u-muted" dir="ltr">{user.email}</span>}
        items={items}
        trigger={(props) => (
          <button type="button" className="shell-user__trigger" data-tour="user-menu" title={collapsed ? user.name : undefined} aria-label={collapsed ? user.name : undefined} {...props}>
            <Avatar name={user.name} size={30} />
            {!collapsed && (
              <>
                <span className="shell-user__text">
                  <b className="u-truncate">{user.name}</b>
                  <small className="u-truncate">
                    {tx(ROLES[user.role].name)}
                    {department ? ` · ${tx(department.name)}` : ''}
                  </small>
                </span>
                <ChevronsUpDown size={15} aria-hidden />
              </>
            )}
          </button>
        )}
      />
    </div>
  );
}
