import { FileQuestion } from 'lucide-react';
import { Channels } from '../../components/data-display/ChannelIcon';
import { EmptyState } from '../../components/feedback/States';
import { Person } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, DefinitionList } from '../../components/ui/Card';
import { departmentById } from '../../domain/catalog';
import { useCreateContent } from '../../features/content/CreateContent';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useClock } from '../../features/workspace/hooks';
import { useI18n } from '../../i18n/I18nProvider';
import { assetKindLabel, contentTypeLabel } from '../../i18n/labels';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';
import { ContentListCard } from '../home/widgets';

const FIELD_KIND: Record<string, [string, string]> = {
  text: ['Text', 'نص'],
  longtext: ['Long text', 'نص طويل'],
  date: ['Date', 'تاريخ'],
  number: ['Number', 'رقم'],
  url: ['Link', 'رابط'],
  course: ['Course', 'دورة'],
  person: ['Person', 'شخص'],
};

export function TemplateDetailPage({ id }: { id: string }) {
  const { t, tx } = useI18n();
  const { state, can } = useWorkspace();
  const create = useCreateContent();
  const now = useClock();
  const template = state.templates.find((entry) => entry.id === id);
  usePageMeta(template ? tx(template.name) : t('Template', 'قالب'), [{ label: t('Templates', 'القوالب'), to: '/templates' }, { label: template ? tx(template.name) : t('Not found', 'غير موجود') }]);

  if (!template)
    return <EmptyState icon={<FileQuestion size={22} />} title={t('This template does not exist.', 'هذا القالب غير موجود.')} action={<ButtonLink to="/templates" variant="primary">{t('All templates', 'كل القوالب')}</ButtonLink>} />;

  const items = state.content.filter((item) => item.templateId === template.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="u-stack u-stack--lg">
      <PageHeader
        meta={<Badge>{tx(departmentById(template.departmentId)!.name)}</Badge>}
        title={tx(template.name)}
        description={tx(template.description)}
        actions={
          can('content.create') ? (
            <Button variant="primary" onClick={() => create.open({ templateId: template.id })}>
              {t('Create from template', 'أنشئ من القالب')}
            </Button>
          ) : undefined
        }
      />
      <Card>
        <CardHeader title={t('Workflow', 'مسار العمل')} description={t('Who acts, in order. Marketing approves before anything is scheduled.', 'من ينفذ وبأي ترتيب. التسويق يعتمد قبل أي جدولة.')} />
        <CardBody>
          <ol className="flow">
            {template.workflow.map((step, index) => (
              <li key={index} className="flow__step">
                <span className="flow__num u-tnum">{index + 1}</span>
                <b>{tx(step.actor)}</b>
                <small>{tx(step.action)}</small>
              </li>
            ))}
            <li className="flow__step flow__step--end">
              <span className="flow__num u-tnum">{template.workflow.length + 1}</span>
              <b>{t('Publish', 'النشر')}</b>
              <small>{t('Post, then record the link', 'النشر ثم تسجيل الرابط')}</small>
            </li>
          </ol>
        </CardBody>
      </Card>
      <div className="u-grid u-grid--2">
        <Card>
          <CardHeader title={t('Required fields', 'الحقول المطلوبة')} />
          <CardBody>
            {template.fields.length === 0 ? (
              <p className="u-sm u-muted">{t('No extra fields.', 'لا حقول إضافية.')}</p>
            ) : (
              <ul className="field-list">
                {template.fields.map((field) => (
                  <li key={field.key}>
                    <span>{tx(field.label)}</span>
                    <span className="u-xs u-muted">
                      {t(...(FIELD_KIND[field.kind] as [string, string]))}
                      {field.required ? ` · ${t('required', 'إلزامي')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="sub-title">{t('Required assets', 'الملفات المطلوبة')}</h3>
            <ul className="field-list">
              {template.requiredAssets.map((asset, index) => (
                <li key={index}>
                  <span>{tx(asset.label)}</span>
                  <span className="u-xs u-muted">{tx(assetKindLabel[asset.kind])}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('Defaults', 'الإعدادات الافتراضية')} />
          <CardBody>
            <DefinitionList
              items={[
                { label: t('Content type', 'نوع المحتوى'), value: tx(contentTypeLabel[template.contentType]) },
                { label: t('Platforms', 'المنصات'), value: <Channels channels={template.channels} /> },
                { label: t('Caption structure', 'بنية النص'), value: tx(template.captionStructure) },
                { label: t('Call to action', 'الدعوة لإجراء'), value: tx(template.cta) },
                { label: t('Design', 'التصميم'), value: `${template.design.format} · ${tx(template.design.note)}` },
                { label: t('Approval', 'الاعتماد'), value: template.approvalFlow.map((step) => tx(step)).join(' → ') },
                {
                  label: t('Default assignee', 'المسند إليه افتراضيًا'),
                  value: template.defaultAssigneeIds.length ? <Person users={state.users} id={template.defaultAssigneeIds[0]} /> : '—',
                },
                { label: t('Trigger', 'متى يبدأ'), value: template.trigger ? tx(template.trigger) : '—' },
              ]}
            />
            {template.trigger && <p className="u-xs u-muted">{t('Triggers are shown on Home as reminders today; automatic creation comes with the automation backend.', 'المحفزات تظهر حاليًا كتذكيرات في الصفحة الرئيسية؛ الإنشاء التلقائي يأتي مع خدمة الأتمتة.')}</p>}
          </CardBody>
        </Card>
      </div>
      <ContentListCard title={t('Content made from this template', 'محتوى من هذا القالب')} items={items} now={now} empty={{ title: t('Not used yet.', 'لم يُستخدم بعد.') }} more={`/content?template=${template.id}`} />
    </div>
  );
}
