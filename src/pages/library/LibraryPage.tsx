import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Download, LayoutTemplate, Sparkles } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { STATUS_LABEL, type PipelineItem } from '../../features/content-pipeline/types';
import { AiTemplatesPanel } from '../../features/ai-templates/AiTemplatesPanel';
import { TemplateGenerator, TemplateGrid, useSvgTemplates } from '../../features/svg-templates/SvgTemplates';
import logos from '../../../brand/logos.json';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

/** AI-designed SVG templates: generate from a prompt or reference, then make posts from them at no image cost. */
function SvgTemplateSection() {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { items, setItems } = useSvgTemplates();
  return <section className="library-section">
    <div className="library-section__head">
      <h2><LayoutTemplate size={18} /> {t('Editable templates', 'قوالب قابلة للتعديل')}</h2>
      {items && items.length > 0 && <small className="u-muted">{t(`${items.length} templates`, `${items.length} قالب`)}</small>}
    </div>
    <TemplateGenerator onCreated={(template) => { setItems((current) => [template, ...(current ?? [])]); navigate(`/library/templates/${template.id}`); }} />
    {items && items.length > 0 && <TemplateGrid items={items} onOpen={(template) => navigate(`/library/templates/${template.id}`)} />}
  </section>;
}

/** Reusable material: approved creatives, AI templates and the official brand assets. */
export function LibraryPage() {
  const { t, tx } = useI18n();
  const { navigate } = useRouter();
  usePageMeta(t('Library', 'المكتبة'), [{ label: t('Library', 'المكتبة') }]);
  const [items, setItems] = useState<PipelineItem[]>([]);
  useEffect(() => { void api<PipelineItem[]>('/api/content').then(setItems).catch(() => {}); }, []);
  const approved = items.filter((item) => item.creative && ['approved', 'scheduled', 'published'].includes(item.status));

  return <div className="u-stack u-stack--lg">
    <PageHeader title={t('Library', 'المكتبة')} description={t('Editable templates, approved designs, AI recipes and the official Engosoft logos.', 'قوالب قابلة للتعديل، وتصاميم معتمدة، ووصفات الذكاء الاصطناعي، وشعارات إنجوسوفت الرسمية.')} />
    <SvgTemplateSection />
    <AiTemplatesPanel />
    <section className="library-section">
      <h2>{t('Approved designs', 'تصميمات معتمدة')}</h2>
      {approved.length ? <div className="library-grid">{approved.map((item, index) => <motion.button key={item.id} type="button" className="library-card glass" onClick={() => navigate(`/content/${item.id}`)}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * 0.03 }}>
        <img src={item.creative!.imageUrl} alt="" loading="lazy" /><b dir="auto">{item.title}</b><small>{tx(STATUS_LABEL[item.status])}</small>
      </motion.button>)}</div>
        : <div className="library-empty glass"><Sparkles size={20} /><p>{t('Approved posts appear here and can be reused as references.', 'تظهر هنا المنشورات المعتمدة ويمكن استخدامها مرجعًا.')}</p><Button variant="primary" onClick={() => navigate('/')}>{t('Create a post', 'صمّم منشور')}</Button></div>}
    </section>
    <section className="library-section">
      <h2>{t('Official logos', 'الشعارات الرسمية')}</h2>
      <p className="u-sm u-muted">{t('Exact files from the brand guidelines. The system places them automatically; download only for external use.', 'الملفات الأصلية من دليل الهوية. يضيفها النظام تلقائيًا؛ نزّلها للاستخدام الخارجي فقط.')}</p>
      <div className="library-logos">{logos.variants.map((v) => <a key={v.id} className="library-logo glass" data-surface={v.id.endsWith('reversed') ? 'dark' : 'light'} href={v.publicPath} download>
        <img src={v.publicPath} alt={v.label} /><small>{v.label}</small><Download size={14} />
      </a>)}</div>
    </section>
  </div>;
}
