import { useEffect, useState } from 'react';
import { HardDrive, RefreshCw } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';

interface Policy { enabled: boolean; publishedDays: number; trashDays: number }
interface Report {
  inventory: { bytes: number; files: number; freeBytes: number; groups: Record<string, { bytes: number; files: number }> };
  limits: { maxBytes: number; reserveBytes: number }; policy: Policy; warning: boolean;
  preview: { candidateCount: number; candidateBytes: number; limited: boolean; candidates: { id: string; title: string; bytes: number }[]; trash: { id: string; quarantined_at: string }[] };
}
const size = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
export function StoragePanel() {
  const { t } = useI18n();
  const [report, setReport] = useState<Report | null>(null), [policy, setPolicy] = useState<Policy | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const load = async () => { const data = await api<Report>('/api/storage'); setReport(data); setPolicy(data.policy); };
  useEffect(() => { void load().catch(e => setError(errorMessage(e, ''))); }, []);
  const act = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); setSaved(false); try { await work(); await load(); setConfirmed(false); setSaved(true); } catch (e) { setError(errorMessage(e, '')); } finally { setBusy(false); } };
  const groups: Record<string, string> = { creatives: t('Designs and sources', 'التصميمات ومصادرها'), studio: t('Studio layers', 'طبقات الاستوديو'), uploads: t('Uploaded designs', 'التصميمات المرفوعة'), social: t('Publishing files and recovery bin', 'ملفات النشر وسلة الاسترجاع'), database: t('Local application data', 'بيانات التطبيق المحلية') };
  return <Card>
    <CardHeader icon={<HardDrive size={18} />} title={t('File storage', 'تخزين الملفات')} description={t('Sync saves links and statistics; only files uploaded or created here occupy this space.', 'المزامنة تحفظ الروابط والإحصاءات؛ الملفات المرفوعة أو المصممة هنا هي التي تستهلك هذه المساحة.')} actions={<Button size="sm" icon={<RefreshCw size={14} />} busy={busy} onClick={() => void act(load)}>{t('Refresh', 'تحديث')}</Button>} />
    <CardBody><div className="u-stack u-stack--sm">
      {error && <p role="alert">{error}</p>}
      {report && policy ? <>
        <p><strong dir="ltr">{size(report.inventory.bytes)} / {size(report.limits.maxBytes)}</strong> · {t('Application file limit', 'حد ملفات التطبيق')}</p>
        <progress style={{ width: '100%' }} max={report.limits.maxBytes} value={Math.min(report.inventory.bytes, report.limits.maxBytes)} aria-label={t('File storage used', 'مساحة الملفات المستخدمة')} />
        <p className="u-sm u-muted">{t('Free disk space', 'المساحة الفارغة على القرص')}: <b dir="ltr">{size(report.inventory.freeBytes)}</b> · {t('Protected reserve', 'احتياطي الحماية')}: <b dir="ltr">{size(report.limits.reserveBytes)}</b></p>
        {report.warning && <p role="alert">{t('Storage is nearing its limit. New file uploads stop before the disk fills; existing content stays accessible.', 'المساحة تقترب من الحد. يتوقف رفع ملفات جديدة قبل امتلاء القرص، ويظل المحتوى الحالي متاحًا.')}</p>}
        <div className="u-row u-row--wrap">{Object.entries(report.inventory.groups).map(([name, group]) => <span key={name} className="u-sm">{groups[name] || t('Other files', 'ملفات أخرى')}: <b dir="ltr">{size(group.bytes)}</b></span>)}</div>
        <p className="u-sm">{t('Drafts, approved and scheduled posts, failed or unconfirmed publications, and saved files never expire automatically.', 'المسودات والمعتمد والمجدول ومحاولات النشر الفاشلة أو غير المؤكدة والملفات المثبتة لا تنتهي صلاحيتها تلقائيًا.')}</p>
        <div className="u-row u-row--wrap">
          <label className="ui-field"><span className="ui-field__label">{t('Days after verified publication on all selected platforms', 'أيام الاحتفاظ بعد تأكيد النشر على كل المنصات المختارة')}</span><input className="ui-input" type="number" min={7} max={365} value={policy.publishedDays} disabled={busy} onChange={e => { setPolicy({ ...policy, publishedDays: Number(e.target.value) }); setConfirmed(false); }} /></label>
          <label className="ui-field"><span className="ui-field__label">{t('Recovery bin days before permanent deletion', 'أيام الاسترجاع قبل الحذف النهائي')}</span><input className="ui-input" type="number" min={7} max={90} value={policy.trashDays} disabled={busy} onChange={e => { setPolicy({ ...policy, trashDays: Number(e.target.value) }); setConfirmed(false); }} /></label>
        </div>
        <label className="u-sm"><input type="checkbox" checked={policy.enabled} disabled={busy} onChange={e => { setPolicy({ ...policy, enabled: e.target.checked }); setConfirmed(false); }} /> {t('Enable automatic expiration of publishing attachments', 'تفعيل انتهاء صلاحية مرفقات النشر تلقائيًا')}</label>
        {policy.enabled && <label className="u-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /> {t('I approve permanent deletion of expired publishing attachments after the recovery period. Published platform posts, their links and statistics stay.', 'أوافق على حذف مرفقات النشر المنتهية نهائيًا بعد فترة الاسترجاع. تظل المنشورات على المنصات وروابطها وإحصاءاتها.')}</label>}
        <div className="u-row u-row--wrap"><Button size="sm" busy={busy} disabled={policy.enabled && !confirmed} onClick={() => void act(() => api('/api/storage/policy', { body: { ...policy, confirmPermanentDeletion: confirmed } }))}>{t('Save retention policy', 'حفظ سياسة الاحتفاظ')}</Button><small>{report.policy.enabled ? t('Automatic expiration enabled', 'انتهاء الصلاحية التلقائي مفعّل') : t('Preview only; automatic deletion is off', 'معاينة فقط؛ الحذف التلقائي غير مفعّل')}</small>{saved && <small role="status">{t('Updated', 'تم التحديث')}</small>}</div>
        <p className="u-sm">{t('Currently eligible for expiration', 'المؤهل حاليًا لانتهاء الصلاحية')}: <b>{report.preview.candidateCount}</b> · <span dir="ltr">{size(report.preview.candidateBytes)}</span></p>
        {report.preview.limited && <p role="alert" className="u-sm">{t('This preview covers only the oldest 2,000 published attachments. Review the larger archive before relying on automatic cleanup.', 'هذه المعاينة تشمل أقدم 2000 مرفق منشور فقط. يلزم مراجعة الأرشيف الأكبر قبل الاعتماد على التنظيف التلقائي.')}</p>}
        {report.preview.candidates.slice(0, 10).map(asset => <div className="u-row u-row--wrap" key={asset.id}><span>{asset.title} · <span dir="ltr">{size(asset.bytes)}</span></span><Button size="sm" disabled={busy} onClick={() => void act(() => api(`/api/storage/assets/${asset.id}/keep`, { body: {} }))}>{t('Keep this file', 'الاحتفاظ بهذا الملف')}</Button></div>)}
        {report.preview.trash.length > 0 && <details><summary>{t('Files in the recovery bin', 'ملفات سلة الاسترجاع')} ({report.preview.trash.length})</summary>{report.preview.trash.map(asset => <div className="u-row u-row--wrap" key={asset.id}><small dir="ltr">{asset.id}</small><Button size="sm" disabled={busy} onClick={() => void act(() => api(`/api/storage/assets/${asset.id}/restore`, { body: {} }))}>{t('Restore and keep', 'استرجاع واحتفاظ')}</Button></div>)}</details>}
      </> : !error && <p aria-busy="true">{t('Checking file storage…', 'جارٍ فحص مساحة الملفات…')}</p>}
    </div></CardBody>
  </Card>;
}
