import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Download, LayoutTemplate, Sparkles } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../features/auth/AuthProvider';
import { STATUS_LABEL, type PipelineItem } from '../../features/content-pipeline/types';
import { AiTemplatesPanel } from '../../features/ai-templates/AiTemplatesPanel';
import { KindPicker, TemplateGenerator, TemplateGrid, useSvgTemplates } from '../../features/svg-templates/SvgTemplates';
import type { TemplateFormat, TemplateKind } from '../../features/svg-templates/render';
import logos from '../../../brand/logos.json';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

/** AI-designed SVG templates: generate from a prompt or reference, then make posts from them at no image cost. */
function SvgTemplateSection() {
  const { t } = useI18n();
  const { can } = useAuth();
  const { navigate } = useRouter();
  const { items, setItems, error, reload } = useSvgTemplates();
  const [kind, setKind] = useState<TemplateKind | 'all'>('all');
  const [format, setFormat] = useState<TemplateFormat | 'all'>('all');
  const shown = (items ?? []).filter((item) => (kind === 'all' || item.kind === kind) && (format === 'all' || item.format === format));
  return <section className="library-section">
    <div className="library-section__head">
      <h2><LayoutTemplate size={18} /> {t('Design references & templates', 'مراجع التصميم والقوالب')}</h2>
      {items && items.length > 0 && <small className="u-muted">{t(`${items.length} templates`, `${items.length} قالب`)}</small>}
    </div>
    {can('design.free') && <TemplateGenerator onCreated={(template) => { setItems((current) => [template, ...(current ?? [])]); navigate(`/library/templates/${template.id}`); }} />}
    {error && <div role="alert">{error}<Button onClick={() => void reload()}>{t('Retry', 'أعد المحاولة')}</Button></div>}
    {!items && !error && <p role="status" className="u-muted">{t('Loading templates…', 'جارٍ تحميل القوالب…')}</p>}
    {items && items.length > 0 && <>
      <div className="tpl-library-filters"><KindPicker items={items} value={kind} onChange={setKind} /><select className="mc-select" aria-label={t('Template size', 'مقاس القالب')} value={format} onChange={(e) => setFormat(e.target.value as TemplateFormat | 'all')}><option value="all">{t('All sizes', 'كل المقاسات')}</option><option value="feed">4:5</option><option value="square">1:1</option><option value="story">9:16</option><option value="landscape">1.91:1</option></select></div>
      <TemplateGrid items={shown} onOpen={(template) => navigate(`/library/templates/${template.id}`)} />
      {shown.length === 0 && <p className="u-muted">{t('No templates match these filters.', 'لا توجد قوالب تطابق هذه الفلاتر.')}</p>}
    </>}
  </section>;
}

/** Reusable material: approved creatives, AI templates and the official brand assets. */
export function LibraryPage() {
  const { t, tx } = useI18n();
  const { can } = useAuth();
  const { navigate } = useRouter();
  usePageMeta(t('Library', 'المكتبة'), [{ label: t('Library', 'المكتبة') }]);
  const [items, setItems] = useState<PipelineItem[]>([]);
  useEffect(() => { void api<PipelineItem[]>('/api/content').then(setItems).catch(() => {}); }, []);
  const approved = items.filter((item) => item.creative && ['approved', 'scheduled', 'published'].includes(item.status));

  return <div className="u-stack u-stack--lg">
    <PageHeader title={t('Library', 'المكتبة')} description={t('Editable templates, approved designs, AI recipes and the official Engosoft logos.', 'قوالب قابلة للتعديل، وتصاميم معتمدة، ووصفات الذكاء الاصطناعي، وشعارات إنجوسوفت الرسمية.')} />
    <SvgTemplateSection />
    {can('design.free') && <AiTemplatesPanel />}
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
        <img src={v.publicPath} alt={v.label} /><span className="library-logo__label"><small>{v.label}</small><Download size={14} aria-hidden /></span>
      </a>)}</div>
    </section>
  </div>;
}
