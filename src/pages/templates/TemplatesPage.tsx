import { LayoutTemplate, Workflow, Zap } from 'lucide-react';
import { Link, useQueryState } from '../../app/router/router';
import { Channels } from '../../components/data-display/ChannelIcon';
import { EmptyState } from '../../components/feedback/States';
import { FilterSelect, SearchInput } from '../../components/forms/Field';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DEPARTMENTS, departmentById } from '../../domain/catalog';
import type { DepartmentId } from '../../domain/users';
import { useCreateContent } from '../../features/content/CreateContent';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { contentTypeLabel } from '../../i18n/labels';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

/** Templates are reusable workflows: fields, assets, steps, reviewers and triggers — not just a design. */
export function TemplatesPage() {
  const { t, tx, num } = useI18n();
  const { state, me, can } = useWorkspace();
  const create = useCreateContent();
  const [query, setQuery] = useQueryState();
  usePageMeta(t('Templates', 'القوالب'), [{ label: t('Templates', 'القوالب') }]);
  const department = (query.get('department') ?? 'all') as DepartmentId | 'all';
  const q = (query.get('q') ?? '').toLowerCase();
  const list = state.templates
    .filter((template) => (department === 'all' || template.departmentId === department) && (!q || `${template.name.en} ${template.name.ar} ${template.description.en} ${template.description.ar}`.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.departmentId === me.departmentId) - Number(a.departmentId === me.departmentId) || b.usageCount - a.usageCount);

  return (
    <div className="u-stack">
      <PageHeader title={t('Templates', 'القوالب')} description={t('Saved workflows for recurring content: what to fill in, which assets, who acts, who approves, and when to start.', 'مسارات محفوظة للمحتوى المتكرر: ما يُملأ، والملفات المطلوبة، ومن ينفذ، ومن يعتمد، ومتى يبدأ.')} />
      <Link to="/ai-studio/post-designer" className="post-designer-entry"><span><strong>{t('Visual post templates', 'قوالب تصميم المنشورات')}</strong><small>{t('Open the SVG library and adapt a design to each platform.', 'افتح مكتبة SVG وجهّز التصميم لمقاس كل منصة.')}</small></span><span aria-hidden>←</span></Link>
      <div className="toolbar">
        <div className="toolbar__search">
          <SearchInput value={query.get('q') ?? ''} onChange={(value) => setQuery({ q: value || null })} placeholder={t('Search templates', 'ابحث في القوالب')} label={t('Search templates', 'ابحث في القوالب')} />
        </div>
        <FilterSelect label={t('Department', 'القسم')} allLabel={t('All', 'الكل')} value={department} onChange={(value) => setQuery({ department: value === 'all' ? null : value })} options={DEPARTMENTS.filter((entry) => state.templates.some((template) => template.departmentId === entry.id)).map((entry) => ({ value: entry.id, label: tx(entry.name) }))} />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<LayoutTemplate size={20} />} title={t('No template matches.', 'لا يوجد قالب مطابق.')} text={t('Clear the search or pick another department.', 'امسح البحث أو اختر قسمًا آخر.')} />
      ) : (
        <ul className="template-grid">
          {list.map((template) => (
            <li key={template.id} className="template-card">
              <div className="template-card__top">
                <Badge>{tx(departmentById(template.departmentId)!.name)}</Badge>
                <Channels channels={template.channels} size={13} />
              </div>
              <Link to={`/templates/${template.id}`} className="template-card__name">
                {tx(template.name)}
              </Link>
              <p className="template-card__desc">{tx(template.description)}</p>
              <ul className="template-card__facts">
                <li>
                  <Workflow size={13} aria-hidden /> {template.workflow.map((step) => tx(step.actor)).join(' → ')}
                </li>
                {template.trigger && (
                  <li>
                    <Zap size={13} aria-hidden /> {tx(template.trigger)}
                  </li>
                )}
              </ul>
              <div className="template-card__foot">
                <span className="u-xs u-muted u-tnum">
                  {tx(contentTypeLabel[template.contentType])} · {t(`used ${num(template.usageCount)} times`, `استُخدم ${num(template.usageCount)} مرة`)}
                </span>
                {can('content.create') && (
                  <Button size="sm" variant="secondary" onClick={() => create.open({ templateId: template.id })}>
                    {t('Use template', 'استخدم القالب')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {can('templates.manage') && <p className="u-xs u-muted">{t('Editing templates arrives with the templates API; today they ship with Social Pulse.', 'تعديل القوالب يأتي مع واجهة القوالب؛ حاليًا هي مضمّنة في Social Pulse.')}</p>}
    </div>
  );
}
