import { useMemo } from 'react';
import { Check, ChevronsUpDown, Languages, Moon, SunMedium } from 'lucide-react';
import { Link, useRouter } from '../app/router/router';
import { ROLES, departmentById } from '../domain/catalog';
import { useWorkspace } from '../features/workspace/WorkspaceProvider';
import { isOverdue, isTaskOpen, reviewQueue } from '../features/workspace/selectors';
import { useTheme } from '../hooks/ui';
import { useI18n } from '../i18n/I18nProvider';
import { Avatar } from '../components/ui/Avatar';
import { Menu, type MenuItem } from '../components/ui/Menu';
import { activeNav, NAV, type NavId } from './nav';
import { useShell } from './ShellContext';

/** Engosoft mark: a blue tile with the orange accent dot. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return <img src="/social-pulse-app-icon.png" width={size} height={size} alt="" aria-hidden className="shell-brand__mark" />;
}

function useNavCounts(): Partial<Record<NavId, number>> {
  const { state, me, can } = useWorkspace();
  return useMemo(() => {
    const now = Date.now();
    const myTasks = state.tasks.filter((task) => task.assigneeId === me.id && isTaskOpen(task)).length;
    const myOverdue = state.content.filter((item) => (item.ownerId === me.id || item.assigneeId === me.id) && isOverdue(item, now)).length;
    const reviews = can('content.approve') ? reviewQueue(state).length : 0;
    return { 'my-work': myTasks + myOverdue + reviews, tasks: reviews || undefined };
  }, [state, me, can]);
}

/** `drawer` renders the full-width version inside the mobile navigation sheet. */
export function Sidebar({ drawer }: { drawer?: boolean }) {
  const { t, tx } = useI18n();
  const { path } = useRouter();
  const shell = useShell();
  const { setMobileNavOpen } = shell;
  const collapsed = shell.collapsed && !drawer;
  const { me } = useWorkspace();
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
                        <Icon size={17} strokeWidth={1.9} aria-hidden />
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

/** Who the app is showing, plus language and theme. "View as" stands in for sign-in until authentication exists. */
function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { t, tx, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { me, setMe, state } = useWorkspace();
  const { navigate } = useRouter();
  const department = departmentById(me.departmentId);

  const people: MenuItem[] = state.users
    .filter((user) => user.status === 'active')
    .map((user) => ({
      key: user.id,
      label: (
        <span className="shell-user__option">
          <Avatar name={user.name} size={22} />
          <span className="u-truncate">{user.name}</span>
          {user.id === me.id && <Check size={14} aria-label={t('current', 'الحالي')} />}
        </span>
      ),
      hint: `${tx(ROLES[user.role].name)}${user.departmentId ? ` · ${tx(departmentById(user.departmentId)!.name)}` : ''}`,
      onSelect: () => {
        setMe(user.id);
        navigate('/');
      },
    }));

  const items: MenuItem[] = [
    { key: 'lang', icon: <Languages size={15} />, label: lang === 'ar' ? 'English' : 'العربية', onSelect: () => setLang(lang === 'ar' ? 'en' : 'ar') },
    { key: 'theme', icon: theme === 'dark' ? <SunMedium size={15} /> : <Moon size={15} />, label: theme === 'dark' ? t('Light mode', 'الوضع الفاتح') : t('Dark mode', 'الوضع الداكن'), onSelect: toggle },
    ...people,
  ];

  return (
    <div className="shell-user">
      <Menu
        label={t('Account and view', 'الحساب والعرض')}
        align="start"
        header={<span className="u-xs u-muted">{t('View the app as (demo — sign-in is not enabled yet)', 'اعرض التطبيق باسم (تجريبي — تسجيل الدخول غير مفعّل بعد)')}</span>}
        items={items}
        trigger={(props) => (
          <button type="button" className="shell-user__trigger" title={collapsed ? me.name : undefined} aria-label={collapsed ? me.name : undefined} {...props}>
            <Avatar name={me.name} size={30} />
            {!collapsed && (
              <>
                <span className="shell-user__text">
                  <b className="u-truncate">{me.name}</b>
                  <small className="u-truncate">
                    {tx(ROLES[me.role].name)}
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
