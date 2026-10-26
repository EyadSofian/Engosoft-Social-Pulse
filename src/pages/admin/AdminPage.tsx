import { useState } from 'react';
import { Bell, Check, Minus } from 'lucide-react';
import { useQueryState } from '../../app/router/router';
import { DataTable, type Column } from '../../components/data-display/DataTable';
import { EmptyState } from '../../components/feedback/States';
import { Select } from '../../components/forms/Field';
import { Dialog } from '../../components/overlay/Overlay';
import { Avatar, Person } from '../../components/ui/Avatar';
import { Badge, DemoBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, DefinitionList } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { DEPARTMENTS, ROLE_ORDER, ROLES, departmentById } from '../../domain/catalog';
import { ALL_PERMISSIONS, type DepartmentId, type RoleId, type User } from '../../domain/users';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useAct, useClock } from '../../features/workspace/hooks';
import { useToast } from '../../components/feedback/Toast';
import { businessZone } from '../../lib/format';
import { creditUsage } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { permissionLabel } from '../../i18n/labels';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

type Tab = 'users' | 'departments' | 'roles' | 'permissions' | 'system';
const TABS: Tab[] = ['users', 'departments', 'roles', 'permissions', 'system'];

/** Kept deliberately plain: people, departments, roles, the permission matrix and a few system settings. */
export function AdminPage() {
  const { t } = useI18n();
  const { state } = useWorkspace();
  const [query, setQuery] = useQueryState();
  usePageMeta(t('Admin', 'إدارة النظام'), [{ label: t('Admin', 'إدارة النظام') }]);
  const tab = (TABS as string[]).includes(query.get('tab') ?? '') ? (query.get('tab') as Tab) : 'users';
  return (
    <div className="u-stack">
      <PageHeader title={t('Admin', 'إدارة النظام')} description={t('Users, roles, permissions and system settings.', 'المستخدمون والأدوار والصلاحيات وإعدادات النظام.')} />
      <div className="ui-notice ui-notice--partial" role="status">
        <div className="ui-notice__text">
          <b>{t('Sign-in is not enabled yet', 'تسجيل الدخول غير مفعّل بعد')}</b>
          <span>{t('Roles shape what each person sees in the app today. Server-side enforcement arrives with authentication — until then anyone with the link can reach the API.', 'الأدوار تحدد ما يراه كل شخص في التطبيق اليوم. التطبيق على الخادم يأتي مع تسجيل الدخول — وحتى ذلك الحين يستطيع أي شخص لديه الرابط الوصول إلى الـAPI.')}</span>
        </div>
      </div>
      <Tabs
        label={t('Admin sections', 'أقسام الإدارة')}
        value={tab}
        onChange={(value) => setQuery({ tab: value === 'users' ? null : value, user: null })}
        items={[
          { value: 'users', label: t('Users', 'المستخدمون'), count: state.users.length },
          { value: 'departments', label: t('Departments', 'الأقسام') },
          { value: 'roles', label: t('Roles', 'الأدوار') },
          { value: 'permissions', label: t('Permissions', 'الصلاحيات') },
          { value: 'system', label: t('System', 'النظام') },
        ]}
      />
      {tab === 'users' && <Users />}
      {tab === 'departments' && <Departments />}
      {tab === 'roles' && <Roles />}
      {tab === 'permissions' && <Permissions />}
      {tab === 'system' && <System />}
    </div>
  );
}

function Users() {
  const { t, tx, relative } = useI18n();
  const { state } = useWorkspace();
  const now = useClock();
  const [query, setQuery] = useQueryState();
  const editing = state.users.find((user) => user.id === query.get('user')) ?? null;
  const status = (user: User) => (user.status === 'active' ? <Badge tone="success" dot>{t('Active', 'نشط')}</Badge> : user.status === 'invited' ? <Badge tone="warning" dot>{t('Invited', 'مدعو')}</Badge> : <Badge dot>{t('Suspended', 'موقوف')}</Badge>);
  const columns: Column<User>[] = [
    { key: 'name', header: t('Name', 'الاسم'), sort: (user) => user.name, cell: (user) => <span className="u-row"><Avatar name={user.name} size={26} /><span className="u-stack u-stack--xs"><b className="u-sm">{user.name}</b><small className="u-xs u-muted">{tx(user.title)}</small></span></span> },
    { key: 'email', header: t('Email', 'البريد'), cell: (user) => <span className="u-sm" dir="ltr">{user.email}</span>, secondary: true },
    { key: 'role', header: t('Role', 'الدور'), sort: (user) => ROLE_ORDER.indexOf(user.role), cell: (user) => tx(ROLES[user.role].name) },
    { key: 'department', header: t('Department', 'القسم'), sort: (user) => user.departmentId ?? '', cell: (user) => (user.departmentId ? tx(departmentById(user.departmentId)!.name) : '—') },
    { key: 'status', header: t('Status', 'الحالة'), cell: status },
    { key: 'seen', header: t('Last active', 'آخر نشاط'), secondary: true, sort: (user) => (user.lastActiveAt ? Date.parse(user.lastActiveAt) : null), cell: (user) => <span className="u-sm u-muted">{user.lastActiveAt ? relative(user.lastActiveAt, now) : '—'}</span> },
  ];
  return (
    <Card>
      <CardHeader title={t('Users', 'المستخدمون')} count={state.users.length} icon={<DemoBadge />} description={t('Click a person to change role, department or status.', 'اضغط على شخص لتغيير الدور أو القسم أو الحالة.')} />
      <DataTable caption={t('Users', 'المستخدمون')} rows={state.users} columns={columns} rowKey={(user) => user.id} rowLabel={(user) => user.name} onRowClick={(user) => setQuery({ user: user.id })} empty={<EmptyState compact title={t('No users.', 'لا مستخدمين.')} />} />
      <Dialog open={Boolean(editing)} onClose={() => setQuery({ user: null })} title={editing?.name ?? ''} description={editing?.email}>
        {editing && <UserForm key={editing.id} user={editing} onDone={() => setQuery({ user: null })} />}
      </Dialog>
    </Card>
  );
}

function UserForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { t, tx } = useI18n();
  const { updateUser } = useWorkspace();
  const act = useAct();
  const [role, setRole] = useState<RoleId>(user.role);
  const [department, setDepartment] = useState<DepartmentId | ''>(user.departmentId ?? '');
  const [status, setStatus] = useState<User['status']>(user.status);
  return (
    <form
      className="u-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (act(updateUser(user.id, { role, departmentId: department || null, status }), t('User updated', 'تم تحديث المستخدم'))) onDone();
      }}
    >
      <label className="ui-field">
        <span className="ui-field__label">{t('Role', 'الدور')}</span>
        <Select value={role} onChange={(event) => setRole(event.target.value as RoleId)}>
          {ROLE_ORDER.map((id) => (
            <option key={id} value={id}>
              {tx(ROLES[id].name)}
            </option>
          ))}
        </Select>
        <span className="ui-field__hint">{tx(ROLES[role].description)}</span>
      </label>
      <label className="ui-field">
        <span className="ui-field__label">{t('Department', 'القسم')}</span>
        <Select value={department} onChange={(event) => setDepartment(event.target.value as DepartmentId | '')}>
          <option value="">{t('None', 'بدون')}</option>
          {DEPARTMENTS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {tx(entry.name)}
            </option>
          ))}
        </Select>
      </label>
      <label className="ui-field">
        <span className="ui-field__label">{t('Status', 'الحالة')}</span>
        <Select value={status} onChange={(event) => setStatus(event.target.value as User['status'])}>
          <option value="active">{t('Active', 'نشط')}</option>
          <option value="invited">{t('Invited', 'مدعو')}</option>
          <option value="suspended">{t('Suspended', 'موقوف')}</option>
        </Select>
      </label>
      <div className="u-row u-row--between">
        <span className="u-xs u-muted">{t('Changes last for this browser session (demo workspace).', 'التغييرات تبقى لجلسة المتصفح هذه (مساحة تجريبية).')}</span>
        <div className="u-row">
          <Button variant="ghost" onClick={onDone}>
            {t('Cancel', 'إلغاء')}
          </Button>
          <Button type="submit" variant="primary">
            {t('Save', 'حفظ')}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Departments() {
  const { t, tx, num } = useI18n();
  const { state } = useWorkspace();
  return (
    <Card>
      <CardHeader title={t('Departments', 'الأقسام')} count={DEPARTMENTS.length} />
      <ul className="lines">
        {DEPARTMENTS.map((department) => (
          <li key={department.id} className="line">
            <div className="line__main">
              <span className="line__title">{tx(department.name)}</span>
              <span className="line__meta">{tx(department.responsibility)}</span>
            </div>
            <div className="line__side">
              {department.plansContent ? <Badge tone="brand">{t('Monthly plan', 'خطة شهرية')}</Badge> : <Badge>{t('Production team', 'فريق إنتاج')}</Badge>}
              <span className="u-xs u-muted u-tnum">{t(`${num(state.users.filter((user) => user.departmentId === department.id).length)} people`, `${num(state.users.filter((user) => user.departmentId === department.id).length)} أشخاص`)}</span>
              <span className="line__person">
                <Person users={state.users} id={department.managerId} size={20} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Roles() {
  const { t, tx, num } = useI18n();
  const { state } = useWorkspace();
  return (
    <ul className="role-grid">
      {ROLE_ORDER.map((id) => (
        <li key={id}>
          <Card>
            <CardHeader title={tx(ROLES[id].name)} description={tx(ROLES[id].description)} />
            <CardBody>
              <p className="u-xs u-muted u-tnum">
                {t(`${num(ROLES[id].permissions.length)} permissions · ${num(state.users.filter((user) => user.role === id).length)} people`, `${num(ROLES[id].permissions.length)} صلاحية · ${num(state.users.filter((user) => user.role === id).length)} أشخاص`)}
              </p>
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Permissions() {
  const { t, tx } = useI18n();
  return (
    <Card>
      <CardHeader title={t('Permission matrix', 'مصفوفة الصلاحيات')} description={t('Marketing roles hold approval and scheduling, so departments cannot publish around review.', 'أدوار التسويق تملك الاعتماد والجدولة، فلا تنشر الأقسام دون مراجعة.')} />
      <div className="ui-table-scroll">
        <table className="ui-table ui-table--dense matrix">
          <caption className="sr-only">{t('Permissions by role', 'الصلاحيات حسب الدور')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('Permission', 'الصلاحية')}</th>
              {ROLE_ORDER.map((id) => (
                <th key={id} scope="col" className="matrix__role">
                  {tx(ROLES[id].name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map((permission) => (
              <tr key={permission}>
                <th scope="row">{tx(permissionLabel[permission])}</th>
                {ROLE_ORDER.map((id) => {
                  const has = ROLES[id].permissions.includes(permission);
                  return (
                    <td key={id} className="matrix__cell" data-on={has || undefined}>
                      {has ? <Check size={14} aria-label={t('Allowed', 'مسموح')} /> : <Minus size={14} aria-label={t('Not allowed', 'غير مسموح')} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type NotificationState = NotificationPermission | 'unsupported';

function System() {
  const { t, tx, num } = useI18n();
  const { state, reset } = useWorkspace();
  const toast = useToast();
  const now = useClock();
  const [confirming, setConfirming] = useState(false);
  const [permission, setPermission] = useState<NotificationState>(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const wallets = creditUsage(state, now);
  return (
    <div className="u-grid u-grid--2">
      <Card>
        <CardHeader title={t('AI configuration', 'إعداد الذكاء الاصطناعي')} />
        <CardBody>
          <DefinitionList
            items={[
              { label: t('Text generation', 'توليد النصوص'), value: <Badge>{t('Not configured', 'غير مُعد')}</Badge> },
              { label: t('Image generation', 'توليد الصور'), value: <Badge>{t('Not configured', 'غير مُعد')}</Badge> },
              { label: t('Video generation', 'توليد الفيديو'), value: <Badge>{t('Not configured', 'غير مُعد')}</Badge> },
            ]}
          />
          <p className="u-xs u-muted">{t('Providers are added on the server; keys never reach the browser. AI Studio enables its tools once an endpoint is verified.', 'المزودون يُضافون على السيرفر؛ المفاتيح لا تصل للمتصفح أبدًا. الاستوديو يفعّل أدواته عند التحقق من الـendpoint.')}</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Credit limits', 'حدود الرصيد')} icon={<DemoBadge />} />
        <CardBody>
          <ul className="field-list">
            {wallets.map((row) => (
              <li key={row.departmentId}>
                <span>{tx(departmentById(row.departmentId)!.name)}</span>
                <span className="u-tnum">{num(row.budget)}</span>
              </li>
            ))}
          </ul>
          <p className="u-xs u-muted">{t('Monthly budgets become editable with the credits API.', 'الميزانيات الشهرية تصبح قابلة للتعديل مع واجهة الرصيد.')}</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Publishing defaults', 'إعدادات النشر')} />
        <CardBody>
          <DefinitionList
            items={[
              { label: t('Time zone', 'المنطقة الزمنية'), value: <span dir="ltr">{businessZone()}</span> },
              { label: t('Reminder before a post', 'التذكير قبل المنشور'), value: t('1 hour (server)', 'ساعة (الخادم)') },
              { label: t('“Not confirmed” after', '«غير مؤكد» بعد'), value: <span dir="ltr">ALERT_GRACE_MINUTES</span> },
              { label: t('Automatic sync', 'المزامنة التلقائية'), value: t('Every 30 minutes', 'كل 30 دقيقة') },
            ]}
          />
          <p className="u-xs u-muted">{t('These are server settings (environment variables); they are listed, not edited, here.', 'هذه إعدادات خادم (متغيرات بيئة)؛ تُعرض هنا ولا تُعدّل.')}</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Notifications', 'الإشعارات')} icon={<Bell size={16} />} />
        <CardBody>
          <p className="u-sm">
            {permission === 'granted'
              ? t('Browser notifications are on for this device.', 'إشعارات المتصفح مفعلة على هذا الجهاز.')
              : permission === 'denied'
                ? t('Browser notifications are blocked. Allow them from the browser’s site settings.', 'إشعارات المتصفح محظورة. اسمح بها من إعدادات الموقع في المتصفح.')
                : permission === 'unsupported'
                  ? t('This browser does not support notifications.', 'هذا المتصفح لا يدعم الإشعارات.')
                  : t('Get publishing alerts on this device even when the tab is in the background.', 'استلم تنبيهات النشر على هذا الجهاز حتى والتبويب في الخلفية.')}
          </p>
          {permission === 'default' && (
            <Button size="sm" onClick={() => void Notification.requestPermission().then(setPermission)}>
              {t('Allow browser notifications', 'اسمح بإشعارات المتصفح')}
            </Button>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Branding', 'الهوية')} />
        <CardBody>
          <div className="brand-swatches">
            <span className="brand-swatch" style={{ background: 'var(--brand)' }}>
              <b>#0046FF</b>
              <small>{t('Primary', 'الأساسي')}</small>
            </span>
            <span className="brand-swatch" style={{ background: 'var(--accent)' }}>
              <b>#FF6600</b>
              <small>{t('Accent', 'التمييز')}</small>
            </span>
          </div>
          <p className="u-xs u-muted">Plus Jakarta Sans · Almarai</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Demo workspace', 'المساحة التجريبية')} />
        <CardBody>
          <p className="u-sm">{t('Workflow records (content, tasks, approvals, plans) are seeded in the browser until their API exists. Resetting restores the seed; live calendar and analytics data are not touched.', 'سجلات سير العمل (المحتوى والمهام والاعتمادات والخطط) مولّدة في المتصفح حتى تتوفر واجهتها. إعادة الضبط تستعيدها؛ ولا تمس بيانات التقويم والتحليلات الحية.')}</p>
          <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
            {t('Reset demo workspace', 'إعادة ضبط المساحة التجريبية')}
          </Button>
        </CardBody>
      </Card>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('Reset the demo workspace?', 'إعادة ضبط المساحة التجريبية؟')}
        description={t('Content, tasks and comments created in this session are discarded.', 'المحتوى والمهام والتعليقات المنشأة في هذه الجلسة ستُحذف.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t('Cancel', 'إلغاء')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setConfirming(false);
                toast.success(t('Demo workspace reset', 'تمت إعادة الضبط'));
              }}
            >
              {t('Reset', 'إعادة الضبط')}
            </Button>
          </>
        }
      />
    </div>
  );
}
