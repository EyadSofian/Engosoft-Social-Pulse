import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { KeyRound, Plug, UserPlus, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth, type SessionUser } from '../../features/auth/AuthProvider';
import type { DepartmentId, RoleId } from '../../domain/users';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ConnectionsPage } from '../connections/ConnectionsPage';

export function SettingsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [tab, setTab] = useState<'team' | 'connections'>(can('users.manage') ? 'team' : 'connections');
  usePageMeta(t('Settings', 'الإعدادات'), [{ label: t('Settings', 'الإعدادات') }]);
  return <div className="u-stack u-stack--lg">
    <PageHeader title={t('Settings', 'الإعدادات')} description={t('People, roles and platform connections.', 'الفريق والصلاحيات وربط المنصات.')} />
    <div className="board-scope settings-tabs" role="tablist">
      {can('users.manage') && <button type="button" role="tab" aria-selected={tab === 'team'} aria-pressed={tab === 'team'} onClick={() => setTab('team')}><Users size={15} /> {t('Team', 'الفريق')}</button>}
      {can('connections.manage') && <button type="button" role="tab" aria-selected={tab === 'connections'} aria-pressed={tab === 'connections'} onClick={() => setTab('connections')}><Plug size={15} /> {t('Connections', 'ربط المنصات')}</button>}
    </div>
    <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {tab === 'team' ? <TeamSettings /> : <ConnectionsPage />}
    </motion.div>
  </div>;
}

function TeamSettings() {
  const { t, tx } = useI18n();
  const { user: me, roles, departments } = useAuth();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'employee' as RoleId, departmentId: 'operations' as DepartmentId | '', password: '' });
  const load = useCallback(() => api<SessionUser[]>('/api/users').then(setUsers).catch((e) => setError(errorMessage(e, ''))), []);
  useEffect(() => { void load(); }, [load]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setError(''); setNotice('');
    try { await work(); await load(); setNotice(done); } catch (e) { setError(errorMessage(e, t('That did not work.', 'العملية منجحتش.'))); }
  };
  const add = (event: FormEvent) => { event.preventDefault(); void run(async () => { await api('/api/users', { body: { ...form, departmentId: form.departmentId || null } }); setForm({ ...form, name: '', email: '', password: '' }); }, t('Account created. Share the password with them directly.', 'الحساب اتعمل. ابعتله الباسورد بنفسك.')); };
  const patch = (id: string, body: Record<string, unknown>, done: string) => run(() => api(`/api/users/${id}`, { method: 'PATCH', body }), done);
  const resetPassword = (u: SessionUser) => {
    const password = window.prompt(t(`New password for ${u.name} (10+ characters)`, `كلمة مرور جديدة لـ ${u.name} (10 حروف على الأقل)`));
    if (password) void patch(u.id, { password }, t('Password changed; their other sessions were signed out.', 'كلمة المرور اتغيرت، وخرج من أي جلسة تانية.'));
  };

  return <div className="u-stack u-stack--lg">
    <form className="settings-add glass" onSubmit={add}>
      <h2><UserPlus size={17} /> {t('Add a person', 'ضيف شخص')}</h2>
      <input required placeholder={t('Name', 'الاسم')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input required type="email" dir="ltr" placeholder={t('Email', 'الإيميل')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleId })}>{roles.map((r) => <option key={r.id} value={r.id}>{tx(r.name)}</option>)}</select>
      <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value as DepartmentId })}><option value="">{t('No department', 'بدون قسم')}</option>{departments.map((d) => <option key={d.id} value={d.id}>{tx(d.name)}</option>)}</select>
      <input required minLength={10} type="password" dir="ltr" autoComplete="new-password" placeholder={t('Temporary password (10+)', 'كلمة مرور مؤقتة (10+)')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <Button type="submit" variant="primary">{t('Create account', 'اعمل الحساب')}</Button>
    </form>
    {error && <p role="alert" className="creative-home__error">{error}</p>}
    {notice && <p role="status" className="settings-notice">{notice}</p>}
    <div className="settings-users glass">
      <table>
        <thead><tr><th>{t('Person', 'الشخص')}</th><th>{t('Role', 'الدور')}</th><th>{t('Department', 'القسم')}</th><th>{t('Status', 'الحالة')}</th><th /></tr></thead>
        <tbody>{users.map((u) => <tr key={u.id} data-suspended={u.status === 'suspended' || undefined}>
          <td><b>{u.name}</b><small dir="ltr">{u.email}</small></td>
          <td><select aria-label={t('Role', 'الدور')} value={u.role} disabled={u.id === me.id} onChange={(e) => void patch(u.id, { role: e.target.value }, t('Role updated.', 'الدور اتغير.'))}>{roles.map((r) => <option key={r.id} value={r.id}>{tx(r.name)}</option>)}</select></td>
          <td><select aria-label={t('Department', 'القسم')} value={u.departmentId ?? ''} onChange={(e) => void patch(u.id, { departmentId: e.target.value || null }, t('Department updated.', 'القسم اتغير.'))}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{tx(d.name)}</option>)}</select></td>
          <td>{u.status === 'active' ? t('Active', 'نشط') : t('Suspended', 'موقوف')}</td>
          <td className="settings-users__actions">
            <button type="button" className="ui-link" onClick={() => resetPassword(u)}><KeyRound size={13} /> {t('Password', 'الباسورد')}</button>
            {u.id !== me.id && <button type="button" className="ui-link" onClick={() => void patch(u.id, { status: u.status === 'active' ? 'suspended' : 'active' }, t('Status updated.', 'الحالة اتغيرت.'))}>{u.status === 'active' ? t('Suspend', 'إيقاف') : t('Reactivate', 'تفعيل')}</button>}
          </td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
