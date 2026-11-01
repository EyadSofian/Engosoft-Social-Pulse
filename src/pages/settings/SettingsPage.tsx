import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { BellRing, Check, Copy, KeyRound, Mail, Plug, RefreshCw, Send, UserPlus, Users, X } from 'lucide-react';
import { useQueryState, useRouter } from '../../app/router/router';
import { PermissionsPanel } from '../../features/permissions/PermissionsPanel';
import { Button } from '../../components/ui/Button';
import { useAuth, type SessionUser } from '../../features/auth/AuthProvider';
import type { DepartmentId, RoleId } from '../../domain/users';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ConnectionsPage } from '../connections/ConnectionsPage';

export function SettingsPage({ initialTab }: { initialTab?: 'team' | 'permissions' | 'notifications' | 'connections' } = {}) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { navigate } = useRouter();
  const [params, setParams] = useQueryState();
  type SettingsTab = 'team' | 'permissions' | 'notifications' | 'connections';
  const permitted = (value: string): value is SettingsTab => value === 'connections' ? can('connections.manage') : ['team', 'permissions', 'notifications'].includes(value) && can('users.manage');
  const requested = params.get('tab') || initialTab || '';
  // Course content moved to its own page; an old in-app link lands there.
  const toCourses = requested === 'courses';
  useEffect(() => { if (toCourses) navigate('/courses', { replace: true }); }, [toCourses, navigate]);
  const tab: SettingsTab = permitted(requested) ? requested : can('users.manage') ? 'team' : 'connections';
  const setTab = (value: SettingsTab) => setParams({ tab: value });
  usePageMeta(t('Settings', 'الإعدادات'), [{ label: t('Settings', 'الإعدادات') }]);
  return <div className="u-stack u-stack--lg">
    <PageHeader title={t('Settings', 'الإعدادات')} description={t('People, roles and platform connections.', 'الفريق والصلاحيات وربط المنصات.')} />
    <div className="board-scope settings-tabs" role="tablist">
      {can('users.manage') && <button type="button" role="tab" aria-selected={tab === 'team'} aria-pressed={tab === 'team'} onClick={() => setTab('team')}><Users size={15} /> {t('Team', 'الفريق')}</button>}
      {can('users.manage') && <button type="button" role="tab" aria-selected={tab === 'permissions'} aria-pressed={tab === 'permissions'} onClick={() => setTab('permissions')}>{t('Permissions', 'الصلاحيات')}</button>}
      {can('users.manage') && <button type="button" role="tab" aria-selected={tab === 'notifications'} aria-pressed={tab === 'notifications'} onClick={() => setTab('notifications')}><BellRing size={15} /> {t('Notifications', 'الإشعارات')}</button>}
      {can('connections.manage') && <button type="button" role="tab" aria-selected={tab === 'connections'} aria-pressed={tab === 'connections'} onClick={() => setTab('connections')}><Plug size={15} /> {t('Connections', 'ربط المنصات')}</button>}
    </div>
    <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {toCourses ? null : tab === 'team' ? <TeamSettings /> : tab === 'permissions' ? <PermissionsPanel /> : tab === 'notifications' ? <NotificationSettings /> : <ConnectionsPage />}
    </motion.div>
  </div>;
}

/** Easy to read aloud and to type on any keyboard: no 0/O, 1/l/I. */
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function generatePassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  const body = Array.from(bytes, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join('');
  // Always mixes letters and digits, so every generated password passes any policy.
  return `${body.slice(0, length - 2)}${(bytes[0] % 8) + 2}${(bytes[1] % 8) + 2}`;
}

interface Credentials { name: string; email: string; password: string; reset: boolean }

/** The exact sign-in details, shown once, so the admin copies what was saved instead of retyping it. */
function CredentialsCard({ value, onClose }: { value: Credentials; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const link = window.location.origin;
  const message = t(
    `Hello ${value.name}, your Mobde3 account is ready.\nSign in: ${link}\nEmail: ${value.email}\nPassword: ${value.password}`,
    `أهلًا ${value.name}، حسابك على مبدع جاهز.\nرابط الدخول: ${link}\nالبريد: ${value.email}\nكلمة المرور: ${value.password}`,
  );
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard blocked: the details stay visible to copy by hand */ }
  };
  return <div className="settings-credentials glass" role="status">
    <header>
      <b>{value.reset ? t('New password set', 'تم تعيين كلمة مرور جديدة') : t('Account created', 'تم إنشاء الحساب')}</b>
      <button type="button" className="ui-link" onClick={onClose} aria-label={t('Close', 'إغلاق')}><X size={15} /></button>
    </header>
    <p>{t('Send these exact details to the person. The password is shown only now.', 'أرسل هذه البيانات كما هي للموظف. كلمة المرور تظهر الآن فقط.')}</p>
    <dl dir="ltr">
      <dt>{t('Link', 'الرابط')}</dt><dd>{link}</dd>
      <dt>{t('Email', 'البريد')}</dt><dd>{value.email}</dd>
      <dt>{t('Password', 'كلمة المرور')}</dt><dd className="settings-credentials__password">{value.password}</dd>
    </dl>
    <Button type="button" variant="primary" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t('Copied', 'تم النسخ') : t('Copy sign-in message', 'انسخ رسالة الدخول')}</Button>
  </div>;
}

function TeamSettings() {
  const { t, tx, date } = useI18n();
  const { user: me, roles, departments } = useAuth();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'creator' as RoleId, departmentId: 'operations' as DepartmentId | '', password: generatePassword() });
  const load = useCallback(() => api<SessionUser[]>('/api/users').then(setUsers).catch((e) => setError(errorMessage(e, ''))), []);
  useEffect(() => { void load(); }, [load]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setError(''); setNotice('');
    try { await work(); await load(); setNotice(done); return true; } catch (e) { setError(errorMessage(e, t('That did not work.', 'لم تنجح العملية.'))); return false; }
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    const sent = { ...form, name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password.trim() };
    void run(async () => {
      await api('/api/users', { body: { ...sent, departmentId: sent.departmentId || null } });
      setCredentials({ name: sent.name, email: sent.email, password: sent.password, reset: false });
      setForm({ ...form, name: '', email: '', password: generatePassword() });
    }, '');
  };
  const patch = (id: string, body: Record<string, unknown>, done: string) => run(() => api(`/api/users/${id}`, { method: 'PATCH', body }), done);
  const resetPassword = async (u: SessionUser) => {
    if (!window.confirm(t(`Give ${u.name} a new password? Their current sessions will be signed out.`, `تعيين كلمة مرور جديدة لـ ${u.name}؟ سيُسجَّل خروجه من الأجهزة الأخرى.`))) return;
    const password = generatePassword();
    if (await patch(u.id, { password }, '')) setCredentials({ name: u.name, email: u.email, password, reset: true });
  };
  const roleInfo = roles.find((r) => r.id === form.role);
  const lastSeen = (u: SessionUser) => u.lastActiveAt ? date(u.lastActiveAt, 'dateTime') : t('Never signed in', 'لم يدخل بعد');

  return <div className="u-stack u-stack--lg">
    <form className="settings-add glass" onSubmit={add} autoComplete="off">
      <h2><UserPlus size={17} /> {t('Add a person', 'أضف شخصًا')}</h2>
      <input required name="new-member-name" autoComplete="off" placeholder={t('Name', 'الاسم')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input required type="email" name="new-member-email" autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" placeholder={t('Email', 'البريد الإلكتروني')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleId })}>{roles.map((r) => <option key={r.id} value={r.id}>{tx(r.name)}</option>)}</select>
      <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value as DepartmentId })}><option value="">{t('No department', 'بلا قسم')}</option>{departments.map((d) => <option key={d.id} value={d.id}>{tx(d.name)}</option>)}</select>
      {/* Plain text on purpose: the admin sees exactly what is saved, and browsers do not autofill their own password here. */}
      <span className="settings-add__password">
        <input required minLength={10} type="text" name="new-member-password" autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" aria-label={t('Temporary password', 'كلمة المرور المؤقتة')} placeholder={t('Temporary password (10+)', 'كلمة مرور مؤقتة (10+)')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="button" className="ui-link" onClick={() => setForm({ ...form, password: generatePassword() })} title={t('Generate another', 'كلمة مرور أخرى')} aria-label={t('Generate another password', 'توليد كلمة مرور أخرى')}><RefreshCw size={14} /></button>
      </span>
      <Button type="submit" variant="primary">{t('Create account', 'أنشئ الحساب')}</Button>
      {roleInfo?.description && <p className="settings-add__hint">{tx(roleInfo.name)}: {tx(roleInfo.description)} {t('Fine-tune each person in Permissions.', 'يمكنك ضبط صلاحيات كل شخص من تبويب الصلاحيات.')}</p>}
    </form>
    {credentials && <CredentialsCard value={credentials} onClose={() => setCredentials(null)} />}
    {error && <p role="alert" className="creative-home__error">{error}</p>}
    {notice && <p role="status" className="settings-notice">{notice}</p>}
    <div className="settings-users glass">
      <table>
        <thead><tr><th>{t('Person', 'الشخص')}</th><th>{t('Role', 'الدور')}</th><th>{t('Department', 'القسم')}</th><th>{t('Status', 'الحالة')}</th><th>{t('Last sign-in', 'آخر دخول')}</th><th /></tr></thead>
        <tbody>{users.map((u) => <tr key={u.id} data-suspended={u.status === 'suspended' || undefined}>
          <td><b>{u.name}</b><small dir="ltr">{u.email}</small></td>
          <td><select aria-label={t('Role', 'الدور')} value={u.role} disabled={u.id === me.id} onChange={(e) => void patch(u.id, { role: e.target.value }, t('Role updated.', 'تم تغيير الدور.'))}>{roles.map((r) => <option key={r.id} value={r.id}>{tx(r.name)}</option>)}</select></td>
          <td><select aria-label={t('Department', 'القسم')} value={u.departmentId ?? ''} onChange={(e) => void patch(u.id, { departmentId: e.target.value || null }, t('Department updated.', 'تم تغيير القسم.'))}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{tx(d.name)}</option>)}</select></td>
          <td>{u.status === 'active' ? t('Active', 'نشط') : t('Suspended', 'موقوف')}</td>
          <td className={u.lastActiveAt ? undefined : 'settings-users__never'}>{lastSeen(u)}</td>
          <td className="settings-users__actions">
            <button type="button" className="ui-link" onClick={() => void resetPassword(u)}><KeyRound size={13} /> {t('New password', 'كلمة مرور جديدة')}</button>
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
