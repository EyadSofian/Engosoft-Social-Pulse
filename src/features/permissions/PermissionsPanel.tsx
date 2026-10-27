import { useEffect, useState } from 'react';
import { Search, ShieldCheck, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ROLES } from '../../domain/catalog';
import {
  ALL_PERMISSIONS,
  type Permission,
  type Role,
} from '../../domain/users';
import { PERMISSION_LABELS } from '../../domain/permission-labels';
import { useAuth, type SessionUser } from '../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
const GROUPS = [
  { id: 'content', en: 'Content', ar: 'المحتوى' },
  { id: 'design', en: 'Design & courses', ar: 'التصميم والدورات' },
  { id: 'workflow', en: 'Review & publishing', ar: 'المراجعة والنشر' },
  { id: 'reports', en: 'Reports', ar: 'التقارير' },
  { id: 'admin', en: 'Administration', ar: 'الإدارة' },
];
export function PermissionsPanel() {
  const { t, tx } = useI18n();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [overrides, setOverrides] = useState<
    Partial<Record<Permission, boolean>>
  >({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'people' | 'roles'>('people');
  const [role, setRole] = useState('operations');
  const reload = () =>
    api<{ users: SessionUser[] }>('/api/permissions')
      .then((data) => {
        setUsers(data.users);
        setSelected(
          (id) => id || data.users.find((u) => u.id !== me.id)?.id || me.id,
        );
      })
      .catch((e) => setError(errorMessage(e, '')));
  useEffect(() => {
    void reload();
  }, []);
  const target = users.find((u) => u.id === selected);
  useEffect(() => {
    setOverrides(target?.permissionOverrides ?? {});
  }, [target]);
  const locked = !target || target.id === me.id || target.role === 'admin';
  const save = async () => {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<SessionUser>(
        `/api/users/${target.id}/permissions`,
        { method: 'PATCH', body: { overrides } },
      );
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      setNotice(
        t(
          'Saved. Changes apply to the next request.',
          'تم الحفظ. تُطبّق الصلاحيات على الطلب التالي.',
        ),
      );
    } catch (e) {
      setError(errorMessage(e, ''));
    }
    setBusy(false);
  };
  const roleInfo = ROLES[role as Role['id']];
  return (
    <div className="permissions">
      <header className="permissions__intro">
        <ShieldCheck size={24} />
        <div>
          <h2>{t('Roles & access', 'الأدوار والصلاحيات')}</h2>
          <p>
            {t(
              'Start with a role, then allow or deny individual capabilities. Server checks use the same choices.',
              'ابدأ بدور جاهز، ثم اسمح أو امنع كل صلاحية بشكل مستقل. السيرفر يطبّق نفس الاختيارات.',
            )}
          </p>
        </div>
      </header>
      <div className="board-scope">
        <button
          type="button"
          aria-pressed={mode === 'people'}
          onClick={() => setMode('people')}
        >
          {t('Customize a person', 'تخصيص مستخدم')}
        </button>
        <button
          type="button"
          aria-pressed={mode === 'roles'}
          onClick={() => setMode('roles')}
        >
          {t('Role directory', 'دليل الأدوار')}
        </button>
      </div>
      {error && (
        <p role="alert" className="creative-home__error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="settings-notice">
          {notice}
        </p>
      )}
      {mode === 'roles' ? (
        <div className="permissions__layout">
          <aside className="permissions__people">
            {Object.values(ROLES).map((r) => (
              <button
                type="button"
                key={r.id}
                aria-pressed={role === r.id}
                onClick={() => setRole(r.id)}
              >
                <b>{tx(r.name)}</b>
                <small>
                  {r.permissions.length} {t('capabilities', 'صلاحية')}
                </small>
              </button>
            ))}
          </aside>
          <PermissionsRoleDetail role={roleInfo} />
        </div>
      ) : (
        <div className="permissions__layout">
          <aside className="permissions__people">
            <label className="board-search">
              <Search size={14} />
              <input
                aria-label={t('Search team', 'ابحث في الفريق')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Search team', 'ابحث في الفريق')}
              />
            </label>
            {users
              .filter((u) =>
                `${u.name} ${u.email}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((u) => (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={selected === u.id}
                  onClick={() => {
                    if (JSON.stringify(overrides) !== JSON.stringify(target?.permissionOverrides ?? {}) && !window.confirm(t('Discard unsaved permission changes?', 'تجاهل تعديلات الصلاحيات غير المحفوظة؟'))) return;
                    setSelected(u.id);
                    setNotice('');
                  }}
                >
                  <b>{u.name}</b>
                  <small>{tx(ROLES[u.role].name)}</small>
                </button>
              ))}
          </aside>
          <section className="permissions__detail glass">
            {target ? (
              <>
                <header className="permissions__head">
                  <div>
                    <h3>{target.name}</h3>
                    <p className="u-muted">
                      {tx(ROLES[target.role].name)} ·{' '}
                      {Object.keys(overrides).length}{' '}
                      {t('overrides', 'تخصيصات')}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={locked || busy}
                    onClick={() => setOverrides({})}
                  >
                    <RotateCcw size={14} />
                    {t('Reset to role', 'استعادة صلاحيات الدور')}
                  </Button>
                </header>
                {locked && (
                  <p className="u-sm u-muted">
                    {t(
                      'Administrator and your own access are protected here.',
                      'صلاحيات المسؤول وحسابك الحالي محمية هنا.',
                    )}
                  </p>
                )}
                {GROUPS.map((group) => (
                  <section key={group.id}>
                    <h4>{t(group.en, group.ar)}</h4>
                    {ALL_PERMISSIONS.filter(
                      (p) => PERMISSION_LABELS[p].group === group.id,
                    ).map((p) => {
                      const inherited =
                        ROLES[target.role].permissions.includes(p);
                      const effective = overrides[p] ?? inherited;
                      return (
                        <label className="permissions__row" key={p}>
                          <span>
                            <b>{tx(PERMISSION_LABELS[p])}</b>
                            <small>
                              {t('Role default: ', 'افتراضي الدور: ')}
                              {inherited
                                ? t('allowed', 'مسموح')
                                : t('denied', 'غير مسموح')}
                            </small>
                          </span>
                          <select
                            aria-label={tx(PERMISSION_LABELS[p])}
                            disabled={locked || busy}
                            value={
                              overrides[p] === undefined
                                ? 'inherit'
                                : String(overrides[p])
                            }
                            onChange={(e) =>
                              setOverrides((old) => {
                                const next = { ...old };
                                if (e.target.value === 'inherit')
                                  delete next[p];
                                else next[p] = e.target.value === 'true';
                                return next;
                              })
                            }
                          >
                            <option value="inherit">
                              {t('Inherit role', 'حسب الدور')}
                            </option>
                            <option value="true">{t('Allow', 'اسمح')}</option>
                            <option value="false">{t('Deny', 'امنع')}</option>
                          </select>
                          <i
                            className="permissions__dot"
                            data-enabled={effective}
                          />
                        </label>
                      );
                    })}
                  </section>
                ))}
                <Button
                  variant="primary"
                  busy={busy}
                  disabled={locked || busy}
                  onClick={() => void save()}
                >
                  {t('Save permissions', 'احفظ الصلاحيات')}
                </Button>
              </>
            ) : (
              <p role="status">{t('Loading team…', 'جارٍ تحميل الفريق…')}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export function PermissionsRoleDetail({ role }: { role: Role }) {
  const { t, tx } = useI18n();
  return (
    <section className="permissions__detail glass">
      <h3>{tx(role.name)}</h3>
      <p className="u-muted">{tx(role.description)}</p>
      {GROUPS.map((group) => (
        <section key={group.id}>
          <h4>{t(group.en, group.ar)}</h4>
          {ALL_PERMISSIONS.filter(
            (p) => PERMISSION_LABELS[p].group === group.id,
          ).map((p) => (
            <div className="permissions__row" key={p}>
              <span>{tx(PERMISSION_LABELS[p])}</span>
              <span
                className="permissions__state"
                data-enabled={role.permissions.includes(p)}
              >
                {role.permissions.includes(p)
                  ? t('Allowed', 'مسموح')
                  : t('Not allowed', 'غير مسموح')}
              </span>
            </div>
          ))}
        </section>
      ))}
    </section>
  );
}
