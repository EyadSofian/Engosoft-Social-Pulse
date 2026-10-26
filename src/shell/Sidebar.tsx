import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronsUpDown, Languages, LogOut, Moon, Plus, Sparkles, SunMedium } from 'lucide-react';
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
      if (alive) setCount(items.filter((item) => (can('content.approve') && item.status === 'ready_for_review') || (item.ownerId === user.id && item.status === 'changes_requested')).length);
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

  return (
    <div className="shell-sidebar" data-collapsed={collapsed || undefined}>
      <Link to="/" className="shell-brand" title={collapsed ? 'Engosoft Social Pulse' : undefined} onClick={() => setMobileNavOpen(false)}>
        <BrandMark />
        {!collapsed && (
          <span className="shell-brand__text">
            <b>Social Pulse</b>
            <small>Engosoft · {t('Content Operations', 'عمليات المحتوى')}</small>
          </span>
        )}
      </Link>

      {can('content.create') && (
        <Link to="/" className="shell-create" title={collapsed ? t('New post', 'بوست جديد') : undefined} aria-label={collapsed ? t('New post', 'بوست جديد') : undefined} onClick={() => setMobileNavOpen(false)}>
          <span className="shell-create__icon">
            <Plus size={18} strokeWidth={2.4} aria-hidden />
          </span>
          {!collapsed && (
            <>
              <span className="shell-create__text">{t('New post', 'بوست جديد')}</span>
              <Sparkles size={15} className="shell-create__spark" aria-hidden />
            </>
          )}
        </Link>
      )}

      <nav className="shell-nav" aria-label={t('Main navigation', 'التنقل الرئيسي')}>
        {NAV.map((group) => {
          const items = group.items.filter((item) => item.visible(me));
          if (!items.length) return null;
          return (
            <div key={group.id} className="shell-nav__group">
              {!collapsed ? <p className="shell-nav__label">{tx(group.label)}</p> : <span className="shell-nav__divider" aria-hidden />}
              <ul>
                {items.map((item) => {
                  const Icon = item.icon;
                  const count = counts[item.id];
                  const current = active === item.id;
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.path}
                        className="shell-nav__item"
                        aria-current={current ? 'page' : undefined}
                        data-tip={collapsed ? tx(item.label) : undefined}
                        aria-label={collapsed ? tx(item.label) : undefined}
                        onClick={() => setMobileNavOpen(false)}
                      >
                        {current && <motion.span layoutId={drawer ? 'nav-pill-drawer' : 'nav-pill'} className="shell-nav__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} aria-hidden />}
                        <span className="shell-nav__icon">
                          <Icon size={17} strokeWidth={1.9} aria-hidden />
                        </span>
                        {!collapsed && <span className="shell-nav__text">{tx(item.label)}</span>}
                        {count ? (
                          <span className="shell-nav__count u-tnum" aria-label={t(`${count} open`, `${count} مفتوحة`)}>
                            {count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
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
          <button type="button" className="shell-user__trigger" title={collapsed ? user.name : undefined} aria-label={collapsed ? user.name : undefined} {...props}>
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
