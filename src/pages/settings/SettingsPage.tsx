import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { BellRing, KeyRound, Mail, Plug, Send, UserPlus, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth, type SessionUser } from '../../features/auth/AuthProvider';
import type { DepartmentId, RoleId } from '../../domain/users';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ConnectionsPage } from '../connections/ConnectionsPage';

export function SettingsPage({ initialTab }: { initialTab?: 'team' | 'notifications' | 'connections' } = {}) {
  const { t } = useI18n();
  const { can } = useAuth();
  const [tab, setTab] = useState<'team' | 'notifications' | 'connections'>(initialTab && (initialTab === 'connections' ? can('connections.manage') : can('users.manage')) ? initialTab : can('users.manage') ? 'team' : 'connections');
  usePageMeta(t('Settings', 'الإعدادات'), [{ label: t('Settings', 'الإعدادات') }]);
  return <div className="u-stack u-stack--lg">
    <PageHeader title={t('Settings', 'الإعدادات')} description={t('People, roles and platform connections.', 'الفريق والصلاحيات وربط المنصات.')} />
    <div className="board-scope settings-tabs" role="tablist">
      {can('users.manage') && <button type="button" role="tab" aria-selected={tab === 'team'} aria-pressed={tab === 'team'} onClick={() => setTab('team')}><Users size={15} /> {t('Team', 'الفريق')}</button>}
      {can('users.manage') && <button type="button" role="tab" aria-selected={tab === 'notifications'} aria-pressed={tab === 'notifications'} onClick={() => setTab('notifications')}><BellRing size={15} /> {t('Notifications', 'الإشعارات')}</button>}
      {can('connections.manage') && <button type="button" role="tab" aria-selected={tab === 'connections'} aria-pressed={tab === 'connections'} onClick={() => setTab('connections')}><Plug size={15} /> {t('Connections', 'ربط المنصات')}</button>}
    </div>
    <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {tab === 'team' ? <TeamSettings /> : tab === 'notifications' ? <NotificationSettings /> : <ConnectionsPage />}
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
    try { await work(); await load(); setNotice(done); } catch (e) { setError(errorMessage(e, t('That did not work.', 'لم تنجح العملية.'))); }
  };
  const add = (event: FormEvent) => { event.preventDefault(); void run(async () => { await api('/api/users', { body: { ...form, departmentId: form.departmentId || null } }); setForm({ ...form, name: '', email: '', password: '' }); }, t('Account created. Share the password with them directly.', 'تم إنشاء الحساب. أرسل كلمة المرور إلى صاحبه بنفسك.')); };
  const patch = (id: string, body: Record<string, unknown>, done: string) => run(() => api(`/api/users/${id}`, { method: 'PATCH', body }), done);
  const resetPassword = (u: SessionUser) => {
    const password = window.prompt(t(`New password for ${u.name} (10+ characters)`, `كلمة مرور جديدة لـ ${u.name} (10 أحرف على الأقل)`));
    if (password) void patch(u.id, { password }, t('Password changed; their other sessions were signed out.', 'تم تغيير كلمة المرور وإنهاء جلساته الأخرى.'));
  };

  return <div className="u-stack u-stack--lg">
    <form className="settings-add glass" onSubmit={add}>
      <h2><UserPlus size={17} /> {t('Add a person', 'أضف شخصًا')}</h2>
      <input required placeholder={t('Name', 'الاسم')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input required type="email" dir="ltr" placeholder={t('Email', 'البريد الإلكتروني')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleId })}>{roles.map((r) => <option key={r.id} value={r.id}>{tx(r.name)}</option>)}</select>
      <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value as DepartmentId })}><option value="">{t('No department', 'بلا قسم')}</option>{departments.map((d) => <option key={d.id} value={d.id}>{tx(d.name)}</option>)}</select>
      <input required minLength={10} type="password" dir="ltr" autoComplete="new-password" placeholder={t('Temporary password (10+)', 'كلمة مرور مؤقتة (10+)')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <Button type="submit" variant="primary">{t('Create account', 'أنشئ الحساب')}</Button>
    </form>
    {error && <p role="alert" className="creative-home__error">{error}</p>}
    {notice && <p role="status" className="settings-notice">{notice}</p>}
    <div className="settings-users glass">
      <table>
        <thead><tr><th>{t('Person', 'الشخص')}</th><th>{t('Role', 'الدور')}</th><th>{t('Department', 'القسم')}</th><th>{t('Status', 'الحالة')}</th><th /></tr></thead>
        <tbody>{users.map((u) => <tr key={u.id} data-suspended={u.status === 'suspended' || undefined}>
          <td><b>{u.name}</b><small dir="ltr">{u.email}</small></td>
          <td><select aria-label={t('Role', 'الدور')} value={u.role} disabled={u.id === me.id} onChange={(e) => void patch(u.id, { role: e.target.value }, t('Role updated.', 'تم تغيير الدور.'))}>{roles.map((r) => <option key={r.id} value={r.id}>{tx(r.name)}</option>)}</select></td>
          <td><select aria-label={t('Department', 'القسم')} value={u.departmentId ?? ''} onChange={(e) => void patch(u.id, { departmentId: e.target.value || null }, t('Department updated.', 'تم تغيير القسم.'))}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{tx(d.name)}</option>)}</select></td>
          <td>{u.status === 'active' ? t('Active', 'نشط') : t('Suspended', 'موقوف')}</td>
          <td className="settings-users__actions">
            <button type="button" className="ui-link" onClick={() => resetPassword(u)}><KeyRound size={13} /> {t('Password', 'كلمة المرور')}</button>
            {u.id !== me.id && <button type="button" className="ui-link" onClick={() => void patch(u.id, { status: u.status === 'active' ? 'suspended' : 'active' }, t('Status updated.', 'تم تغيير الحالة.'))}>{u.status === 'active' ? t('Suspend', 'إيقاف') : t('Reactivate', 'تفعيل')}</button>}
          </td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

interface NotifySettings { userIds: string[]; emails: string[]; onCreate: boolean; onReview: boolean; ownerUpdates: boolean; smtpConfigured: boolean; sender: string | null }

/** Who hears about new posts from every department: chosen people in the app, chosen addresses by email. */
function NotificationSettings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<NotifySettings | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string; email: string; status: string }[]>([]);
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    void api<NotifySettings>('/api/settings/notifications').then((value) => { setSettings(value); setEmails(value.emails.join(', ')); }).catch((e) => setNotice(errorMessage(e, '')));
    void api<{ id: string; name: string; email: string; status: string }[]>('/api/users').then(setPeople).catch(() => {});
  }, []);
  if (!settings) return <div className="board-loading"><span className="ui-btn__spinner" /></div>;
  const toggleUser = (id: string) => setSettings({ ...settings, userIds: settings.userIds.includes(id) ? settings.userIds.filter((u) => u !== id) : [...settings.userIds, id] });
  const save = async () => {
    setBusy('save'); setNotice('');
    try {
      const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
      const next = await api<NotifySettings>('/api/settings/notifications', { method: 'PUT', body: { userIds: settings.userIds, emails: list, onCreate: settings.onCreate, onReview: settings.onReview, ownerUpdates: settings.ownerUpdates } });
      setSettings({ ...settings, ...next }); setEmails(next.emails.join(', '));
      setNotice(t('Saved.', 'تم الحفظ.'));
    } catch (e) { setNotice(errorMessage(e, '')); }
    setBusy('');
  };
  const test = async () => {
    setBusy('test'); setNotice('');
    try {
      const result = await api<{ email: { sent: boolean; reason?: string } }>('/api/settings/notifications/test', { body: {} });
      setNotice(result.email.sent ? t('Test sent in the app and by email.', 'أُرسل إشعار تجريبي داخل التطبيق وعبر البريد الإلكتروني.') : t(`Test sent in the app. Email not sent: ${result.email.reason}.`, `أُرسل إشعار تجريبي داخل التطبيق، ولم يُرسل البريد: ${result.email.reason}.`));
    } catch (e) { setNotice(errorMessage(e, '')); }
    setBusy('');
  };
  const toggle = (key: 'onCreate' | 'onReview' | 'ownerUpdates') => setSettings({ ...settings, [key]: !settings[key] });
  return <div className="u-stack">
    <section className="settings-add glass notify-settings">
      <h2><BellRing size={17} /> {t('When to notify', 'متى يُرسل الإشعار')}</h2>
      <label className="notify-toggle"><input type="checkbox" checked={settings.onCreate} onChange={() => toggle('onCreate')} /> {t('Someone from any team creates a post', 'عندما ينشئ أي شخص من أي فريق منشورًا جديدًا')}</label>
      <label className="notify-toggle"><input type="checkbox" checked={settings.onReview} onChange={() => toggle('onReview')} /> {t('A post is sent to marketing for review', 'عندما يُرسل منشور إلى التسويق للمراجعة')}</label>
      <label className="notify-toggle"><input type="checkbox" checked={settings.ownerUpdates} onChange={() => toggle('ownerUpdates')} /> {t('Tell the author when their post is approved, needs changes or is scheduled', 'إبلاغ صاحب المنشور عند اعتماده أو طلب تعديله أو جدولته')}</label>
    </section>
    <section className="settings-add glass notify-settings">
      <h2><Users size={17} /> {t('People notified in the app (popup + bell)', 'الأشخاص الذين يتلقون الإشعار داخل التطبيق (نافذة منبثقة والجرس)')}</h2>
      <p className="u-sm u-muted">{t('If nobody is chosen, everyone who can approve posts is notified.', 'إذا لم يُحدَّد أحد، يصل الإشعار إلى كل من يملك صلاحية اعتماد المنشورات.')}</p>
      <div className="notify-people">{people.filter((p) => p.status === 'active').map((person) => <label key={person.id} className="notify-person" data-on={settings.userIds.includes(person.id) || undefined}><input type="checkbox" checked={settings.userIds.includes(person.id)} onChange={() => toggleUser(person.id)} /><b>{person.name}</b><small dir="ltr">{person.email}</small></label>)}</div>
    </section>
    <section className="settings-add glass notify-settings">
      <h2><Mail size={17} /> {t('Email addresses', 'عناوين البريد للإشعارات')}</h2>
      <label>{t('Separate with commas', 'افصل بين العناوين بفاصلة')}<input dir="ltr" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="marketing@engosoft.com, manager@engosoft.com" /></label>
      <p className={settings.smtpConfigured ? 'settings-notice' : 'creative-home__error'}>{settings.smtpConfigured ? t(`Email is configured (sending as ${settings.sender}).`, `البريد الإلكتروني مُعَد (الإرسال من ${settings.sender}).`) : t('Email sending is not configured on the server yet (SMTP_HOST, SMTP_USER, SMTP_PASS). In-app notifications work already.', 'لم يُعَد إرسال البريد على الخادم بعد (SMTP_HOST وSMTP_USER وSMTP_PASS). إشعارات التطبيق تعمل.')}</p>
    </section>
    <div className="u-row">
      <Button variant="primary" busy={busy === 'save'} onClick={() => void save()}>{t('Save', 'احفظ')}</Button>
      <Button variant="secondary" busy={busy === 'test'} onClick={() => void test()}><Send size={15} /> {t('Send a test', 'أرسل تجربة')}</Button>
      {notice && <span className="u-sm">{notice}</span>}
    </div>
  </div>;
}
