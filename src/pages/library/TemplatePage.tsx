import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useRouter } from '../../app/router/router';
import { EmptyState } from '../../components/feedback/States';
import type { PipelineItem } from '../../features/content-pipeline/types';
import type { SvgTemplate } from '../../features/svg-templates/render';
import { TemplateEditor } from '../../features/svg-templates/SvgTemplates';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { usePageMeta } from '../../shell/ShellContext';

/** One SVG template: make a post from it, change it with AI, or edit its code. `?content=` edits an existing template post. */
export function TemplatePage({ id }: { id: string }) {
  const { t } = useI18n();
  const { query, navigate } = useRouter();
  const contentId = query.get('content') ?? undefined;
  const [template, setTemplate] = useState<SvgTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string> | undefined>();
  const [ready, setReady] = useState(!contentId);
  const [error, setError] = useState('');
  usePageMeta(template?.name ?? t('Template', 'قالب'), [{ label: t('Library', 'المكتبة'), to: '/library' }, { label: template?.name ?? t('Template', 'قالب') }]);
  useEffect(() => {
    api<SvgTemplate>(`/api/svg-templates/${id}`).then(setTemplate).catch((e) => setError(errorMessage(e, '')));
  }, [id]);
  useEffect(() => {
    if (!contentId) return;
    api<PipelineItem>(`/api/content/${contentId}`)
      .then((item) => setValues(item.creative?.svgTemplate?.values))
      .catch(() => {})
      .finally(() => setReady(true));
  }, [contentId]);
  if (error) return <EmptyState title={error} action={<Link to="/library">{t('Back to the library', 'العودة إلى المكتبة')}</Link>} />;
  if (!template || !ready) return <div className="board-loading"><span className="auth-spin ui-btn__spinner" /></div>;
  return (
    <div className="u-stack">
      <Link to={contentId ? `/content/${contentId}` : '/library'} className="tpl-back"><ArrowRight size={15} className="u-flip" /> {contentId ? t('Back to the post', 'العودة إلى المنشور') : t('Library', 'المكتبة')}</Link>
      <TemplateEditor template={template} contentId={contentId} initialValues={values} onDeleted={() => navigate('/library')} />
    </div>
  );
}
