import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';

export interface AiTemplate { id: string; name: string; description: string; prompt: string; style: string; format: 'feed' | 'story' | 'landscape' | 'video'; channels: string[]; createdBy: string; usageCount: number; sampleUrl: string | null }
export const TEMPLATE_PREFILL_KEY = 'social-pulse:ai-template';

/** Saved creative recipes. "Use" opens Create with the template's request and style. */
export function AiTemplatesPanel() {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { user, can } = useAuth();
  const [templates, setTemplates] = useState<AiTemplate[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', prompt: '', style: '', format: 'feed' as 'feed' | 'story' | 'landscape' | 'video' });
  const [error, setError] = useState('');
  const load = useCallback(() => api<AiTemplate[]>('/api/ai-templates').then(setTemplates).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);

  const use = (template: AiTemplate) => {
    try { sessionStorage.setItem(TEMPLATE_PREFILL_KEY, JSON.stringify(template)); } catch { /* prefill not available */ }
    navigate('/?template=1');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try { await api('/api/ai-templates', { body: form }); setForm({ name: '', prompt: '', style: '', format: 'feed' }); setAdding(false); await load(); }
    catch (e) { setError(errorMessage(e, '')); }
  };
  const remove = async (id: string) => { await api(`/api/ai-templates/${id}`, { method: 'DELETE' }).catch((e) => setError(errorMessage(e, ''))); await load(); };

  return <section className="library-section">
    <div className="library-section__head"><h2><Wand2 size={17} /> {t('AI templates', 'قوالب الذكاء الاصطناعي')}</h2>
      {can('content.create') && <Button variant="secondary" onClick={() => setAdding((v) => !v)}><Plus size={15} /> {t('New template', 'قالب جديد')}</Button>}</div>
    <p className="u-sm u-muted">{t('A template saves a request and a visual style. Using it fills today’s course facts from Odoo and designs new posts in that style.', 'يحفظ القالب الطلب والنمط. عند استخدامه يجلب بيانات الدورة من Odoo ويصمّم منشورات جديدة بالنمط نفسه.')}</p>
    <AnimatePresence>{adding && <motion.form className="template-form glass" onSubmit={(e) => void save(e)} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
      <input required placeholder={t('Template name, e.g. Course launch — instructor authority', 'اسم القالب، مثلًا: إطلاق دورة — المحاضر')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="auto" />
      <textarea required rows={2} placeholder={t('Request, e.g. Launch post for the next {course} cohort', 'الطلب، مثلًا: منشور إطلاق للدفعة القادمة من دورة ...')} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} dir="auto" />
      <textarea rows={3} placeholder={t('Visual style: subject, composition, palette, typography', 'النمط: العنصر الأساسي، التكوين، الألوان، الخط')} value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} dir="auto" />
      <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as 'feed' | 'story' | 'landscape' | 'video' })}><option value="feed">4:5 Feed</option><option value="story">9:16 Story / WhatsApp</option><option value="landscape">1.91:1 Website</option><option value="video">16:9 YouTube</option></select>
      <Button type="submit" variant="primary">{t('Save template', 'احفظ القالب')}</Button>
    </motion.form>}</AnimatePresence>
    {error && <p role="alert" className="creative-home__error">{error}</p>}
    {templates.length ? <div className="template-grid">{templates.map((template) => <motion.article key={template.id} layout className="template-card glass">
      {template.sampleUrl ? <img src={template.sampleUrl} alt="" /> : <span className="template-card__art"><Sparkles size={22} /></span>}
      <div><b dir="auto">{template.name}</b><p dir="auto">{template.prompt}</p><small>{template.format === 'story' ? '9:16' : template.format === 'video' ? '16:9' : template.format === 'landscape' ? '1.91:1' : '4:5'} · {t(`used ${template.usageCount}×`, `استُخدم ${template.usageCount} مرة`)}</small></div>
      <div className="template-card__actions"><Button variant="primary" onClick={() => use(template)}>{t('Use', 'استخدم')}</Button>
        {(template.createdBy === user.id || can('templates.manage')) && <button type="button" className="ui-link" aria-label={t('Delete', 'احذف')} onClick={() => void remove(template.id)}><Trash2 size={14} /></button>}</div>
    </motion.article>)}</div>
      : !adding && <p className="board-empty">{t('No templates yet. Save one from a design you liked in Create.', 'لا توجد قوالب بعد. احفظ تصميمًا أعجبك قالبًا من صفحة الإنشاء.')}</p>}
  </section>;
}
