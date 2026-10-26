import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, BookmarkPlus, CheckCircle2, Download, FileText, Globe, Loader2, Send, Smartphone, XCircle } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import type { CreativeJob, PublicResult, PublicRun } from '../../../server/creative-intelligence/generation/jobs';
import { extraFormats, type CreativeMaster, type CreativePlatform } from './platforms';

const STAGES: Record<string, [string, string]> = {
  queued: ['Queued', 'في الانتظار'],
  context: ['Checking Odoo for the course', 'مراجعة الدورة في Odoo'],
  planning: ['Writing the copy and creative directions', 'كتابة النص والاتجاهات الإبداعية'],
  generating: ['Designing the full post', 'تصميم المنشور كاملًا'],
  inspecting: ['Checking text, faces and quality', 'مراجعة النص والوجوه والجودة'],
  repairing: ['Clearing space for the logo', 'تهيئة مساحة للشعار'],
  logo: ['Placing the official logo', 'وضع الشعار الرسمي'],
  done: ['Done', 'اكتمل'],
};
const VERDICT: Record<string, [string, string]> = { exact: ['exact', 'مطابق'], acceptable: ['close', 'قريب'], incorrect: ['wrong', 'خطأ'], missing: ['missing', 'ناقص'] };
type Brief = NonNullable<CreativeJob['brief']>;

async function poll(jobId: string, onUpdate: (job: CreativeJob) => void, signal: { stopped: boolean }) {
  while (!signal.stopped) {
    const job = await api<CreativeJob>(`/api/ai/jobs/${jobId}`);
    onUpdate(job);
    if (job.status !== 'running') return;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Follows a full-creative job: direction cards appear as soon as the brief exists, each image is revealed when it is ready. */
export function FullCreativeJob({ jobId, platforms, prompt, onRestart }: { jobId: string; platforms: CreativePlatform[]; prompt: string; onRestart: () => void }) {
  const { t } = useI18n();
  const [job, setJob] = useState<CreativeJob | null>(null);
  const [run, setRun] = useState<PublicRun | null>(null);
  // Keyed "d1:story", "d2:landscape": one adaptation per direction and format.
  const [adapting, setAdapting] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const extras = extraFormats(platforms);

  useEffect(() => {
    const signal = { stopped: false };
    void poll(jobId, (next) => { setJob(next); if (next.run) setRun(next.run); }, signal).catch((e) => setError(errorMessage(e, '')));
    return () => { signal.stopped = true; };
  }, [jobId]);

  const adapt = async (directionId: string, format: CreativeMaster) => {
    if (!run) return;
    const key = `${directionId}:${format}`;
    setAdapting((s) => ({ ...s, [key]: 'queued' }));
    try {
      const { jobId: adaptId } = await api<{ jobId: string }>(`/api/ai/full-creative/${run.requestId}/adapt`, { body: { directionId, format } });
      await poll(adaptId, (next) => { setAdapting((s) => ({ ...s, [key]: next.stage })); if (next.run) setRun(next.run); if (next.status === 'failed') setError(next.error ?? ''); }, { stopped: false });
    } catch (e) { setError(errorMessage(e, '')); }
    setAdapting((s) => { const { [key]: _done, ...rest } = s; return rest; });
  };

  const brief: Brief | undefined = run?.brief ?? job?.brief;
  if (error && !brief) return <div className="creative-job"><p role="alert" className="creative-home__error">{error}</p><Button variant="secondary" onClick={onRestart}>{t('Edit request', 'عدّل الطلب')}</Button></div>;
  if (job?.status === 'failed' && !run) return <div className="creative-job"><p role="alert" className="creative-home__error">{job.error}</p><Button variant="secondary" onClick={onRestart}>{t('Try again', 'حاول مرة أخرى')}</Button></div>;
  if (!brief) {
    const stage = STAGES[job?.stage ?? 'queued'];
    return <div className="creative-job creative-job--progress glass" aria-live="polite">
      <div className="creative-orbit" aria-hidden><span /><span /><span /></div>
      <AnimatePresence mode="wait"><motion.h2 key={stage[0]} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>{t(stage[0], stage[1])}…</motion.h2></AnimatePresence>
      <p className="u-muted">{t('Odoo facts, three different ideas, a full AI design for each, then quality checks and the exact Engosoft logo.', 'بيانات Odoo، وثلاث أفكار مختلفة، وتصميم كامل بالذكاء الاصطناعي لكل فكرة، ثم مراجعة الجودة ووضع الشعار الأصلي.')}</p>
    </div>;
  }

  const results = run?.results ?? [];
  const masterIds = brief.directions.map((d) => d.id);
  return <div className="creative-job">
    <motion.div className="creative-job__summary glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div>
        <small>{run?.context.status === 'matched' || job?.brief?.canonicalCopy.facts?.length ? t('VERIFIED FROM ODOO', 'بيانات موثّقة من Odoo') : t('NO ODOO FACTS', 'دون بيانات Odoo')}</small>
        <h2 dir="auto">{brief.canonicalCopy.headline}</h2>
        <p dir="auto">{[run?.context.event?.title, ...(brief.canonicalCopy.facts ?? [])].filter(Boolean).join(' · ')}</p>
      </div>
      <Button variant="secondary" onClick={onRestart}>{t('New request', 'طلب جديد')}</Button>
    </motion.div>
    <div className="creative-job__grid">
      {masterIds.map((id, index) => {
        const direction = brief.directions.find((d) => d.id === id)!;
        const result = results.find((r) => r.directionId === id);
        const story = results.find((r) => r.directionId === `${id}-story`);
        const landscape = results.find((r) => r.directionId === `${id}-landscape`);
        const variants = { story, landscape } as Record<CreativeMaster, PublicResult | undefined>;
        const stage = job?.directionStages[id] ?? (job?.status === 'running' ? 'generating' : 'done');
        return <motion.article key={id} className="creative-job__card glass" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 30 }}>
          <div className="creative-job__frame">
            <AnimatePresence mode="wait">
              {result?.imageUrl
                ? <motion.img key="image" src={result.imageUrl} alt={direction.name} initial={{ opacity: 0, scale: 1.04, filter: 'blur(18px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
                : result ? <motion.div key="failed" className="creative-job__missing"><XCircle size={26} /></motion.div>
                : <motion.div key="forming" className="creative-forming" exit={{ opacity: 0 }}><span className="creative-forming__glow" /><span className="creative-forming__label">{t(STAGES[stage]?.[0] ?? '', STAGES[stage]?.[1] ?? '')}</span></motion.div>}
            </AnimatePresence>
          </div>
          <div className="creative-job__body">
            {result && <Status result={result} />}
            <h3 dir="auto">{direction.name}</h3>
            <p dir="auto" className="u-xs u-muted">{direction.concept}</p>
            {result && <Details result={result} />}
            {result?.imageUrl && run && <ResultActions run={run} result={result} story={story} landscape={landscape} platforms={platforms} prompt={prompt} direction={direction} />}
            {result?.imageUrl && extras.filter((format) => !variants[format]).map((format) => {
              const key = `${id}:${format}`;
              return <Button key={format} variant="secondary" disabled={Boolean(adapting[key])} onClick={() => void adapt(id, format)}>
                {adapting[key] ? <><Loader2 className="creative-job__spin" size={15} /> {t(STAGES[adapting[key]]?.[0] ?? 'Working', STAGES[adapting[key]]?.[1] ?? 'قيد التنفيذ')}</> : format === 'story' ? <><Smartphone size={15} /> {t('Make the 9:16 version (WhatsApp, TikTok, Snapchat)', 'أنشئ نسخة 9:16 (واتساب، تيك توك، سناب شات)')}</> : <><Globe size={15} /> {t('Make the website banner 1200×630', 'أنشئ بانر الموقع 1200×630')}</>}
              </Button>;
            })}
            {(['story', 'landscape'] as const).map((format) => {
              const variant = variants[format];
              if (!variant) return null;
              const size = format === 'story' ? '9:16' : '1200×630';
              return <div key={format} className="creative-job__variant" data-format={format}><motion.img src={variant.imageUrl} alt={size} initial={{ opacity: 0, filter: 'blur(14px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.8 }} /><Status result={variant} />{variant.imageUrl && <a className="ui-btn ui-btn--secondary ui-btn--md" href={variant.imageUrl} download={`engosoft-${variant.directionId}.png`}><Download size={15} /> PNG {size}</a>}</div>;
            })}
          </div>
        </motion.article>;
      })}
    </div>
    {error && <p role="alert" className="creative-home__error">{error}</p>}
  </div>;
}

/** Save the design into the content pipeline, or keep its recipe as an AI template. */
function ResultActions({ run, result, story, landscape, platforms, prompt, direction }: { run: PublicRun; result: PublicResult; story?: PublicResult; landscape?: PublicResult; platforms: CreativePlatform[]; prompt: string; direction: Brief['directions'][number] }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const save = async (send: boolean) => {
    setBusy(send ? 'send' : 'draft'); setError('');
    try {
      const captions = Object.fromEntries(platforms.map((p) => [p, run.brief.captions?.[p] || run.brief.caption]));
      const item = await api<{ id: string }>('/api/content', { body: { title: run.brief.canonicalCopy.headline, channels: platforms, captions, creative: { requestId: run.requestId, directionId: result.directionId, imageUrl: result.imageUrl, ...(story?.imageUrl ? { storyUrl: story.imageUrl } : {}), ...(landscape?.imageUrl ? { landscapeUrl: landscape.imageUrl } : {}), model: result.model, directionName: direction.name } } });
      if (send) await api(`/api/content/${item.id}/transition`, { body: { to: 'ready_for_review' } });
      navigate(`/content/${item.id}`);
    } catch (e) { setError(errorMessage(e, '')); }
    setBusy('');
  };
  const saveTemplate = async () => {
    const name = window.prompt(t('Template name', 'اسم القالب'), direction.name);
    if (!name) return;
    setBusy('template'); setError('');
    try {
      await api('/api/ai-templates', { body: { name, prompt, description: direction.concept, style: [direction.concept, direction.subject, direction.composition, direction.palette, direction.typography, direction.mood].join(' | ').slice(0, 1500), format: result.directionId.endsWith('-story') ? 'story' : 'feed', channels: platforms, sampleUrl: result.imageUrl } });
      setSaved(t('Saved to Library › AI templates', 'حُفظ في المكتبة › قوالب الذكاء الاصطناعي'));
    } catch (e) { setError(errorMessage(e, '')); }
    setBusy('');
  };
  return <div className="creative-job__actions">
    <Button variant="primary" disabled={Boolean(busy)} onClick={() => void save(true)}>{busy === 'send' ? <Loader2 className="creative-job__spin" size={15} /> : <Send size={15} />} {t('Send to marketing', 'أرسله إلى التسويق')}</Button>
    <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void save(false)}><FileText size={15} /> {t('Save as draft', 'احفظه مسودة')}</Button>
    <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void saveTemplate()}><BookmarkPlus size={15} /> {t('Save as AI template', 'احفظه قالب ذكاء اصطناعي')}</Button>
    <a className="ui-btn ui-btn--secondary ui-btn--md" href={result.imageUrl} download={`engosoft-${result.directionId}.png`}><Download size={15} /> PNG</a>
    {saved && <small className="settings-notice">{saved}</small>}
    {error && <small role="alert" className="creative-home__error">{error}</small>}
  </div>;
}

function Status({ result }: { result: PublicResult }) {
  const { t } = useI18n();
  if (result.status === 'ready') return <p className="creative-job__status creative-job__status--ok"><CheckCircle2 size={15} />{t('Passed all checks', 'اجتاز جميع المراجعات')}</p>;
  if (result.status === 'needs_review') return <p className="creative-job__status creative-job__status--warn"><AlertTriangle size={15} />{t('Needs review before publishing', 'يحتاج إلى مراجعة قبل النشر')}</p>;
  return <p className="creative-job__status creative-job__status--fail"><XCircle size={15} />{t('Not usable', 'غير صالح')}</p>;
}

function Details({ result }: { result: PublicResult }) {
  const { t } = useI18n();
  const logo = result.logo;
  return <details className="creative-job__details">
    <summary>{t('Checks', 'المراجعات')}</summary>
    <ul>
      <li>{t('Logo', 'الشعار')}: {logo.requiresCreativeRepair ? logo.reason : `${logo.variantId} · ${logo.placement.anchor} · ${logo.placement.width}px${logo.policy === 'engineering-default' ? t(' · outside guideline pairings, contrast-checked', ' · خارج الأزواج المعتمدة، متراجع التباين') : ''}`}{result.repaired ? t(' · corner repaired', ' · اتصلّح الركن') : ''}</li>
      <li>{t('Text', 'النص')}: {result.copyChecks.map((c) => `${c.field} ${t(VERDICT[c.verdict][0], VERDICT[c.verdict][1])}`).join(' · ')}</li>
      <li>{t('Critic', 'المُقيّم')}: {t('design', 'تصميم')} {result.inspection.scores.design}/10 · {t('marketing', 'تسويق')} {result.inspection.scores.marketing}/10 · {t('image', 'صورة')} {result.inspection.scores.imageQuality}/10 · {t('brand', 'هوية')} {result.inspection.scores.brandFit}/10</li>
      {result.problems.map((problem) => <li key={problem} className="creative-job__problem">{problem}</li>)}
      <li className="u-muted">{result.model} · {(result.latencyMs / 1000).toFixed(0)}s</li>
    </ul>
  </details>;
}
