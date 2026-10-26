import { Link } from '../../app/router/router';
import { DataTable, type Column } from '../../components/data-display/DataTable';
import { DemoSourceLine } from '../../components/data-display/Metric';
import { EmptyState, ProgressBar } from '../../components/feedback/States';
import { Person } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { departmentById } from '../../domain/catalog';
import type { CreditTransaction } from '../../domain/management';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useClock } from '../../features/workspace/hooks';
import { creditUsage, monthKey } from '../../features/workspace/selectors';
import { useI18n } from '../../i18n/I18nProvider';
import { creditKindLabel } from '../../i18n/labels';
import { parseTimestamp } from '../../lib/format';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

/** Admins and Marketing see every wallet; managers their department; others the usage that involves them. */
export function CreditsPage() {
  const { t, tx, num, pct, date } = useI18n();
  const { state, me, can } = useWorkspace();
  const now = useClock();
  usePageMeta(t('Credits & Usage', 'الرصيد والاستخدام'), [{ label: t('Credits & Usage', 'الرصيد والاستخدام') }]);
  const all = can('credits.view_all');
  const manager = me.role === 'department_manager';
  const wallets = creditUsage(state, now).filter((row) => all || row.departmentId === me.departmentId);
  const month = monthKey(now);
  const transactions = state.transactions
    .filter((tx) => tx.at.slice(0, 7) <= month && (all || (manager ? tx.departmentId === me.departmentId : tx.userId === me.id)))
    .sort((a, b) => parseTimestamp(b.at) - parseTimestamp(a.at));

  const columns: Column<CreditTransaction>[] = [
    { key: 'at', header: t('Date', 'التاريخ'), sort: (row) => parseTimestamp(row.at), cell: (row) => <span className="u-tnum u-sm">{date(row.at, 'dayShort')}</span> },
    { key: 'what', header: t('Usage', 'الاستخدام'), cell: (row) => <span className="u-sm">{tx(creditKindLabel[row.kind])} · {row.description}</span> },
    { key: 'dept', header: t('Department', 'القسم'), cell: (row) => tx(departmentById(row.departmentId)!.name), secondary: true },
    { key: 'user', header: t('By', 'بواسطة'), cell: (row) => <Person users={state.users} id={row.userId} size={20} /> },
    { key: 'content', header: t('Content', 'المحتوى'), secondary: true, cell: (row) => { const item = state.content.find((entry) => entry.id === row.contentId); return item ? <Link to={`/content/${item.id}`} className="ui-link u-truncate u-sm" dir="auto">{item.title}</Link> : '—'; } },
    { key: 'amount', header: t('Credits', 'الرصيد'), align: 'end', sort: (row) => row.amount, cell: (row) => <span className="u-tnum">{num(row.amount)}</span> },
  ];

  return (
    <div className="u-stack u-stack--lg">
      <PageHeader title={t('Credits & Usage', 'الرصيد والاستخدام')} description={t(`AI credit budgets per department for ${date(now, 'month')}. Budgets reset monthly.`, `ميزانيات رصيد الذكاء الاصطناعي لكل قسم لشهر ${date(now, 'month')}. تتجدد شهريًا.`)} />
      {wallets.length === 0 ? (
        <EmptyState title={t('No credit wallet for your department this month.', 'لا توجد محفظة رصيد لقسمك هذا الشهر.')} text={t('An administrator sets monthly budgets in Admin › System.', 'مسؤول النظام يحدد الميزانيات الشهرية من الإدارة › النظام.')} />
      ) : (
        <ul className="wallet-grid">
          {wallets.map((row) => (
            <li key={row.departmentId}>
              <Card>
                <CardHeader title={tx(departmentById(row.departmentId)!.name)} actions={row.share >= 90 ? <Badge tone="danger">{t('Almost used up', 'قارب على النفاد')}</Badge> : row.share >= 75 ? <Badge tone="warning">{t('Running low', 'ينخفض')}</Badge> : undefined} />
                <CardBody>
                  <p className="credit-big u-tnum">
                    <span dir="ltr">
                      {num(row.used)} <span className="u-muted">/ {num(row.budget)}</span>
                    </span>
                  </p>
                  <ProgressBar value={row.share} tone={row.share >= 90 ? 'danger' : row.share >= 75 ? 'warning' : 'brand'} label={tx(departmentById(row.departmentId)!.name)} />
                  <p className="u-sm u-muted u-tnum">{t(`${pct(row.share)} used · ${num(row.available)} available`, `${pct(row.share)} مستخدم · ${num(row.available)} متاح`)}</p>
                  <ul className="field-list">
                    {(['image', 'video', 'text'] as const).map((kind) => (
                      <li key={kind}>
                        <span>{tx(creditKindLabel[kind])}</span>
                        <span className="u-tnum">{num(row.byKind[kind])}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <CardHeader title={all ? t('All usage', 'كل الاستخدام') : manager ? t('Department usage', 'استخدام القسم') : t('Your usage', 'استخدامك')} count={transactions.length} />
        <DataTable caption={t('Credit transactions', 'معاملات الرصيد')} rows={transactions} columns={columns} rowKey={(row) => row.id} pageSize={15} dense initialSort={{ key: 'at', dir: 'desc' }} empty={<EmptyState compact title={t('No AI usage recorded yet.', 'لم يُسجل استخدام AI بعد.')} />} />
        <CardBody>
          <DemoSourceLine basis={t('demo wallets; real usage will be recorded by the AI endpoints', 'محافظ تجريبية؛ الاستخدام الفعلي ستسجله خدمات الذكاء الاصطناعي')} />
        </CardBody>
      </Card>
    </div>
  );
}
