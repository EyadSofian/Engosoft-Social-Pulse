import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Download, Sparkles } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { STATUS_LABEL, type PipelineItem } from '../../features/content-pipeline/types';
import { AiTemplatesPanel } from '../../features/ai-templates/AiTemplatesPanel';
import logos from '../../../brand/logos.json';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';
import { PageHeader } from '../../shell/Header';
import { usePageMeta } from '../../shell/ShellContext';

/** Reusable material: approved creatives, AI templates and the official brand assets. */
export function LibraryPage() {
  const { t, tx } = useI18n();
  const { navigate } = useRouter();
  usePageMeta(t('Library', 'المكتبة'), [{ label: t('Library', 'المكتبة') }]);
  const [items, setItems] = useState<PipelineItem[]>([]);
  useEffect(() => { void api<PipelineItem[]>('/api/content').then(setItems).catch(() => {}); }, []);
  const approved = items.filter((item) => item.creative && ['approved', 'scheduled', 'published'].includes(item.status));

  return <div className="u-stack u-stack--lg">
    <PageHeader title={t('Library', 'المكتبة')} description={t('Approved designs, AI templates and the official Engosoft logos.', 'التصميمات المعتمدة وقوالب الـAI ولوجوهات إنجوسوفت الرسمية.')} />
    <AiTemplatesPanel />
    <section className="library-section">
      <h2>{t('Approved designs', 'تصميمات معتمدة')}</h2>
      {approved.length ? <div className="library-grid">{approved.map((item, index) => <motion.button key={item.id} type="button" className="library-card glass" onClick={() => navigate(`/content/${item.id}`)}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * 0.03 }}>
        <img src={item.creative!.imageUrl} alt="" loading="lazy" /><b dir="auto">{item.title}</b><small>{tx(STATUS_LABEL[item.status])}</small>
      </motion.button>)}</div>
        : <div className="library-empty glass"><Sparkles size={20} /><p>{t('Approved posts appear here and can be reused as references.', 'البوستات المعتمدة بتظهر هنا وتقدر تستخدمها كمرجع.')}</p><Button variant="primary" onClick={() => navigate('/')}>{t('Create a post', 'صمّم بوست')}</Button></div>}
    </section>
    <section className="library-section">
      <h2>{t('Official logos', 'اللوجوهات الرسمية')}</h2>
      <p className="u-sm u-muted">{t('Exact files from the brand guidelines. The system places them automatically; download only for external use.', 'الملفات الأصلية من دليل الهوية. السيستم بيركبها لوحده؛ نزّلها بس للاستخدام الخارجي.')}</p>
      <div className="library-logos">{logos.variants.map((v) => <a key={v.id} className="library-logo glass" data-surface={v.id.endsWith('reversed') ? 'dark' : 'light'} href={v.publicPath} download>
        <img src={v.publicPath} alt={v.label} /><small>{v.label}</small><Download size={14} />
      </a>)}</div>
    </section>
  </div>;
}
