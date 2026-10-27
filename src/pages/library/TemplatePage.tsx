import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useRouter } from '../../app/router/router';
import { EmptyState } from '../../components/feedback/States';
import type { PipelineItem } from '../../features/content-pipeline/types';
import type { SvgTemplate, TemplateFormat } from '../../features/svg-templates/render';
import { useAuth } from '../../features/auth/AuthProvider';
import { TemplateComposer, TemplateEditor } from '../../features/svg-templates/SvgTemplates';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { usePageMeta } from '../../shell/ShellContext';
import type { CreativePlatform } from '../../features/creative-studio/platforms';

/** One SVG template: make a post from it, change it with AI, or edit its code. `?content=` edits an existing template post. */
export function TemplatePage({ id }: { id: string }) {
  const { t } = useI18n();
  const { query, navigate } = useRouter();
  const { can } = useAuth();
  const contentId = query.get('content') ?? undefined;
  const [template, setTemplate] = useState<SvgTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string> | undefined>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [channels, setChannels] = useState<CreativePlatform[]>();
  const [format, setFormat] = useState<TemplateFormat>();
  const [context, setContext] = useState<string>();
  const [preset, setPreset] = useState<string>();
  const [ready, setReady] = useState(!contentId);
  const [error, setError] = useState('');
  usePageMeta(template?.name ?? t('Template', 'قالب'), [{ label: t('Library', 'المكتبة'), to: '/library' }, { label: template?.name ?? t('Template', 'قالب') }]);
  useEffect(() => {
    let alive = true;
    setReady(false); setTemplate(null); setError('');
    const load = async () => {
      try {
        const [next, item] = await Promise.all([
          api<SvgTemplate>(`/api/svg-templates/${id}`),
          contentId ? api<PipelineItem>(`/api/content/${contentId}`) : Promise.resolve(null),
        ]);
        if (!alive) return;
        if (item && (!item.editable || item.creative?.svgTemplate?.id !== id)) throw new Error(t('Return this post for changes before editing, and use its original reference.', 'أعد المنشور للتعديل أولًا، وافتح المرجع الخاص به.'));
        setTemplate(next);
        setValues(item?.creative?.svgTemplate?.values);
        setImageUrl(item?.creative?.imageUrl);
        setChannels(item?.channels);
        setContext(item?.creative?.svgTemplate?.context);
        setPreset(item?.creative?.svgTemplate?.outputPreset);
        const format = item?.creative?.svgTemplate?.format ?? item?.creative?.directionId;
        setFormat(format && ['feed', 'square', 'story', 'landscape'].includes(format) ? format as TemplateFormat : undefined);
        setReady(true);
      } catch (e) { if (alive) setError(errorMessage(e, '')); }
    };
    void load();
    return () => { alive = false; };
  }, [id, contentId, t]);
  if (error) return <EmptyState title={error} action={<Link to="/library">{t('Back to the library', 'العودة إلى المكتبة')}</Link>} />;
  if (!template || !ready) return <div className="board-loading"><span className="auth-spin ui-btn__spinner" /></div>;
  return (
    <div className="u-stack">
      <Link to={contentId ? `/content/${contentId}` : '/library'} className="tpl-back"><ArrowRight size={15} className="u-flip" /> {contentId ? t('Back to the post', 'العودة إلى المنشور') : t('Library', 'المكتبة')}</Link>
      {can('design.free') && !template.sourceImage
        ? <TemplateEditor template={template} contentId={contentId} initialValues={values} onDeleted={() => navigate('/library')} />
        : <TemplateComposer key={`${template.id}:${contentId ?? 'new'}`} template={template} contentId={contentId} initialValues={values} initialImageUrl={imageUrl} initialChannels={channels} initialFormat={format} initialContext={context} initialPreset={preset} />}
    </div>
  );
}
