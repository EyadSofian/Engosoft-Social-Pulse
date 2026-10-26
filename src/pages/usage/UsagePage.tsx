import { useEffect, useMemo, useState } from 'react';
import { Coins, ImageIcon, Receipt, Save, Users, Wallet } from 'lucide-react';
import { BarList, ColumnChart } from '../../components/charts/Bars';
import { Stat } from '../../components/data-display/Metric';
import { EmptyState, ProgressBar } from '../../components/feedback/States';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { DEPARTMENTS } from '../../domain/catalog';
import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

interface ModelRate { textIn: number; imageIn: number; out: number }
interface Pricing { usdToEgp: number; defaultMonthlyUsd: number | null; models: Record<string, ModelRate> }
interface UsageReport {
  month: string; scope: 'all' | 'mine'; pricing: Pricing; totalUsd: number; calls: number; images: number; averageImageUsd: number | null;
  byUser: { userId: string; name: string; email: string; departmentId: string | null; status: string; spentUsd: number; images: number; calls: number; budgetUsd: number | null; monthToDateUsd: number }[];
  byPurpose: { name: string; usd: number; calls: number; images: number }[];
  byModel: { name: string; usd: number; calls: number; images: number }[];
  daily: { day: string; usd: number }[];
  recent: { id: string; userId: string | null; purpose: string; kind: string; model: string; images: number; tokens: number; costUsd: number; estimated: boolean; createdAt: string }[];
}

const PURPOSE: Record<string, [string, string]> = {
  generate: ['Full AI post', 'منشور كامل بالذكاء الاصطناعي'],
  adapt: ['Story / website version', 'نسخة ستوري / موقع'],
  studio_ai_edit: ['Studio AI edit', 'تعديل بالذكاء الاصطناعي في الاستوديو'],
  studio_layers: ['Studio editable text', 'نص قابل للتعديل في الاستوديو'],
  template_generate: ['Template design', 'تصميم قالب'],
  template_revise: ['Template change', 'تعديل قالب'],
  captions: ['Captions', 'نصوص مرافقة'],
};

const months = () => Array.from({ length: 6 }, (_, i) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});

/** AI spend: what each image, edit and template cost, who spent it, and each person's monthly budget. */
export function UsagePage() {
  const { t, num } = useI18n();
  const { can } = useAuth();
  const admin = can('users.manage');
  usePageMeta(t('AI usage', 'استهلاك الذكاء الاصطناعي'), [{ label: t('AI usage', 'استهلاك الذكاء الاصطناعي') }]);
  const [month, setMonth] = useState(months()[0]);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState('');
  const load = () => api<UsageReport>(`/api/usage?month=${month}`).then(setReport).catch((e) => setError(errorMessage(e, '')));
  useEffect(() => {
    void load();
  }, [month]);

  if (error) return <EmptyState title={error} />;
  if (!report) return <div className="board-loading"><span className="ui-btn__spinner" /></div>;
  const usd = (value: number) => `$${value.toFixed(value < 1 ? 3 : 2)}`;
  const names = Object.fromEntries(report.byUser.map((u) => [u.userId, u.name]));

  return (
    <div className="u-stack u-stack--lg">
      <PageHeader
        title={t('AI usage', 'استهلاك الذكاء الاصطناعي')}
        description={t('Every AI call is recorded with its real token cost from OpenAI pricing. Budgets stop new AI work for a person once their monthly limit is reached.', 'يُسجَّل كل طلب ذكاء اصطناعي بتكلفته الفعلية وفق أسعار OpenAI بالدولار. يوقف الرصيدُ الطلبات الجديدة للشخص عند بلوغ حده الشهري.')}
        actions={<select className="usage-month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('Month', 'الشهر')}>{months().map((m) => <option key={m} value={m}>{m}</option>)}</select>}
      />
      <div className="stat-row">
        <Stat tone="brand" icon={<Wallet size={16} />} value={usd(report.totalUsd)} label={report.scope === 'all' ? t('Total spend', 'إجمالي الإنفاق') : t('Your spend', 'إنفاقك')} hint={t('this month', 'هذا الشهر')} />
        <Stat tone="success" icon={<ImageIcon size={16} />} value={num(report.images)} label={t('Images generated or edited', 'صور مُولَّدة أو معدَّلة')} hint={t(`${num(report.calls)} AI calls`, `${num(report.calls)} طلب`)} />
        <Stat tone="warning" icon={<Coins size={16} />} value={report.averageImageUsd == null ? '—' : usd(report.averageImageUsd)} label={t('Average per image', 'متوسط تكلفة الصورة')} />
        <Stat icon={<Receipt size={16} />} value={num(report.calls)} label={t('AI requests', 'طلبات الذكاء الاصطناعي')} hint={t('text and image', 'نصية وصور')} />
      </div>
      <div className="u-grid u-grid--2">
        <Card>
          <CardHeader title={t('Daily spend', 'الإنفاق اليومي')} description={t('USD per day this month', 'بالدولار لكل يوم خلال الشهر')} />
          <CardBody>
            {report.daily.length ? <ColumnChart data={report.daily.map((d) => ({ key: d.day, label: d.day.slice(8), value: Math.round(d.usd * 1000) / 1000 }))} label={t('Daily spend', 'الإنفاق اليومي')} format={(v) => `$${v}`} /> : <EmptyState compact title={t('No AI calls this month yet.', 'لا توجد طلبات ذكاء اصطناعي هذا الشهر بعد.')} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('What the money went on', 'توزيع الإنفاق')} />
          <CardBody>
            {report.byPurpose.length ? <BarList label={t('By purpose', 'حسب النوع')} data={report.byPurpose.map((p) => ({ key: p.name, label: t(PURPOSE[p.name]?.[0] ?? p.name, PURPOSE[p.name]?.[1] ?? p.name), value: p.usd, display: `${usd(p.usd)} · ${num(p.calls)}` }))} /> : <EmptyState compact title="—" />}
            {report.byModel.length > 0 && <p className="u-xs u-muted usage-models">{report.byModel.map((m) => `${m.name}: ${usd(m.usd)}`).join(' · ')}</p>}
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader icon={<Users size={16} />} title={report.scope === 'all' ? t('People and budgets', 'الأشخاص والأرصدة') : t('Your budget', 'رصيدك')} description={admin ? t('Monthly AI budget in USD; empty means no limit.', 'رصيد الذكاء الاصطناعي الشهري بالدولار؛ الحقل الفارغ يعني بلا حد.') : undefined} />
        <div className="ui-table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">{t('Person', 'الشخص')}</th>
                <th scope="col" className="ui-table__end">{t('Spent', 'الإنفاق')}</th>
                <th scope="col" className="ui-table__end">{t('Images', 'صور')}</th>
                <th scope="col">{t('This month vs budget', 'هذا الشهر مقابل الرصيد')}</th>
                <th scope="col">{t('Monthly budget (USD)', 'الرصيد الشهري (دولار)')}</th>
              </tr>
            </thead>
            <tbody>
              {report.byUser.map((user) => <BudgetRow key={user.userId} user={user} usd={usd} admin={admin} onSaved={load} />)}
            </tbody>
          </table>
        </div>
      </Card>
      {admin && <PricingCard pricing={report.pricing} onSaved={load} />}
      <Card>
        <CardHeader title={t('Latest AI calls', 'أحدث طلبات الذكاء الاصطناعي')} />
        <div className="ui-table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">{t('When', 'الوقت')}</th>
                <th scope="col">{t('Who', 'الشخص')}</th>
                <th scope="col">{t('What', 'النوع')}</th>
                <th scope="col">{t('Model', 'الموديل')}</th>
                <th scope="col" className="ui-table__end">{t('Tokens', 'الرموز')}</th>
                <th scope="col" className="ui-table__end">{t('Cost', 'التكلفة')}</th>
              </tr>
            </thead>
            <tbody>
              {report.recent.map((row) => (
                <tr key={row.id}>
                  <td className="u-tnum">{new Date(row.createdAt).toLocaleString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                  <td>{row.userId ? names[row.userId] ?? '—' : t('System', 'النظام')}</td>
                  <td>{t(PURPOSE[row.purpose]?.[0] ?? row.purpose, PURPOSE[row.purpose]?.[1] ?? row.purpose)}{row.images ? ` · ${row.images} 🖼` : ''}</td>
                  <td dir="ltr" className="u-xs">{row.model}</td>
                  <td className="ui-table__end u-tnum">{num(row.tokens)}{row.estimated ? '*' : ''}</td>
                  <td className="ui-table__end u-tnum">{usd(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody><p className="u-xs u-muted">{t('* estimated from image size and quality when OpenAI did not report tokens.', '* قيمة تقديرية من مقاس الصورة وجودتها عندما لا تُرجع OpenAI عدد الرموز.')}</p></CardBody>
      </Card>
    </div>
  );
}

function BudgetRow({ user, usd, admin, onSaved }: { user: UsageReport['byUser'][number]; usd: (value: number) => string; admin: boolean; onSaved: () => void }) {
  const { t, num, tx } = useI18n();
  const [value, setValue] = useState(user.budgetUsd == null ? '' : String(user.budgetUsd));
  const [busy, setBusy] = useState(false);
  const used = user.budgetUsd ? (user.monthToDateUsd / user.budgetUsd) * 100 : null;
  const department = DEPARTMENTS.find((d) => d.id === user.departmentId);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/usage/budgets/${user.userId}`, { method: 'PUT', body: { monthlyUsd: value.trim() === '' ? null : Number(value) } });
      onSaved();
    } catch (e) {
      window.alert(errorMessage(e, ''));
    }
    setBusy(false);
  };
  return (
    <tr data-suspended={user.status === 'suspended' || undefined}>
      <td><b>{user.name}</b><small className="u-xs u-muted" style={{ display: 'block' }}>{department ? tx(department.name) : user.email}</small></td>
      <td className="ui-table__end u-tnum">{usd(user.spentUsd)}</td>
      <td className="ui-table__end u-tnum">{num(user.images)}</td>
      <td style={{ minWidth: 180 }}>
        {used == null ? <span className="u-xs u-muted">{t('No limit', 'بلا حد')}</span> : (
          <span className="u-row"><ProgressBar value={used} tone={used >= 100 ? 'danger' : used >= 80 ? 'warning' : 'brand'} label={user.name} /><span className="u-xs u-tnum">{Math.round(used)}%</span></span>
        )}
      </td>
      <td>
        {admin ? (
          <span className="usage-budget">
            <input inputMode="decimal" value={value} placeholder={t('No limit', 'بلا حد')} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} aria-label={t(`Budget for ${user.name}`, `رصيد ${user.name}`)} />
            <Button size="sm" variant="secondary" busy={busy} onClick={() => void save()}><Save size={13} /></Button>
          </span>
        ) : user.budgetUsd == null ? t('No limit', 'بلا حد') : usd(user.budgetUsd)}
      </td>
    </tr>
  );
}

function PricingCard({ pricing, onSaved }: { pricing: Pricing; onSaved: () => void }) {
  const { t } = useI18n();
  const [defaultBudget, setDefaultBudget] = useState(pricing.defaultMonthlyUsd == null ? '' : String(pricing.defaultMonthlyUsd));
  const [models, setModels] = useState(pricing.models);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const rows = useMemo(() => Object.entries(models), [models]);
  const save = async () => {
    setBusy(true);
    try {
      await api('/api/usage/pricing', { method: 'PUT', body: { usdToEgp: pricing.usdToEgp, defaultMonthlyUsd: defaultBudget.trim() === '' ? null : Number(defaultBudget), models } });
      setNotice(t('Saved.', 'تم الحفظ.'));
      onSaved();
    } catch (e) {
      setNotice(errorMessage(e, ''));
    }
    setBusy(false);
  };
  const edit = (model: string, key: keyof ModelRate, value: string) => setModels((current) => ({ ...current, [model]: { ...current[model], [key]: Number(value) || 0 } }));
  return (
    <Card>
      <CardHeader icon={<Coins size={16} />} title={t('Pricing', 'التسعير')} description={t('OpenAI standard prices in USD per 1M tokens. Update them if OpenAI changes its prices.', 'أسعار OpenAI بالدولار لكل مليون رمز. حدّثها إذا غيّرت OpenAI أسعارها.')} />
      <CardBody>
        <div className="usage-pricing">
          <label>{t('Default monthly budget for everyone (USD)', 'الرصيد الشهري الافتراضي للجميع (دولار)')}<input inputMode="decimal" value={defaultBudget} placeholder={t('No limit', 'بلا حد')} onChange={(e) => setDefaultBudget(e.target.value)} /></label>
        </div>
        <div className="ui-table-scroll">
          <table className="ui-table usage-rates">
            <thead><tr><th scope="col">{t('Model', 'الموديل')}</th><th scope="col">{t('Text in', 'نص مُدخل')}</th><th scope="col">{t('Image in', 'صورة مُدخلة')}</th><th scope="col">{t('Output', 'المُخرَج')}</th></tr></thead>
            <tbody>
              {rows.map(([model, value]) => (
                <tr key={model}>
                  <td dir="ltr">{model}</td>
                  {(['textIn', 'imageIn', 'out'] as const).map((key) => <td key={key}><input inputMode="decimal" value={value[key]} onChange={(e) => edit(model, key, e.target.value)} aria-label={`${model} ${key}`} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="u-row" style={{ marginTop: 12 }}>
          <Button variant="primary" busy={busy} onClick={() => void save()}><Save size={15} /> {t('Save pricing', 'احفظ التسعير')}</Button>
          {notice && <span className="u-sm">{notice}</span>}
        </div>
      </CardBody>
    </Card>
  );
}
