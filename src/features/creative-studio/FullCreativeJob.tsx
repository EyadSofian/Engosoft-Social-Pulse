import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, BookmarkPlus, CheckCircle2, Download, FileText, Layers, Loader2, Send, Sparkles, XCircle } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { useRouter } from '../../app/router/router';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import { takePostPlan } from '../content/postPlan';
import { api, errorMessage } from '../../lib/api';
import type { CreativeJob, PublicResult, PublicRun } from '../../../server/creative-intelligence/generation/jobs';
import { updateActiveCreative } from './activeCreative';
import { defaultSizes, MASTER_SIZE, masterFormat, PLATFORM_FORMATS, sizeTargets, slotOf, type CreativeMaster, type CreativePlatform, type SizeTarget } from './platforms';
import { useAuth } from '../auth/AuthProvider';
import { PublishHere } from '../publishing/PublishHere';
import { DesignPlanPanel } from './DesignPlanPanel';

const STAGES: Record<string, [string, string]> = {
  queued: ['Queued', 'في الانتظار'],
  context: ['Checking Odoo for the course', 'مراجعة الدورة في Odoo'],
  planning: ['Creative director, copy, hooks and themes', 'المدير الإبداعي والنص والهوك والثيمات'],
  designing: ['Planning layout, type, light and colour', 'تخطيط التكوين والطباعة والإضاءة والألوان'],
  generating: ['Designing the visual', 'تصميم الصورة'],
  typesetting: ['Setting the text in brand fonts', 'كتابة النص بخطوط الهوية'],
  inspecting: ['Checking faces, details and quality', 'مراجعة الوجوه والتفاصيل والجودة'],
  refining: ['Applying the critic’s repairs', 'تطبيق إصلاحات الناقد'],
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
/** Earlier runs made the 9:16, banner and thumbnail versions under the master format's name. */
const LEGACY_KEY: Record<string, string> = { storyUrl: 'story', landscapeUrl: 'landscape', youtubeUrl: 'video' };
/** The finished design of a direction for one extra size, if it was made. */
const resultFor = (results: PublicResult[], directionId: string, target: SizeTarget) => {
  const slot = slotOf(target.width, target.height);
  return results.find((r) => r.directionId === `${directionId}-${target.key}`) ?? (slot ? results.find((r) => r.directionId === `${directionId}-${LEGACY_KEY[slot]}`) : undefined);
};
const targetLabel = (target: SizeTarget) => [...new Set(target.presets.map((p) => PLATFORM_FORMATS[p.channel as CreativePlatform]?.label ?? p.channel))].join(' · ');

export function FullCreativeJob({ jobId, requestId, platforms, sizes, format, prompt, onRestart }: { jobId: string; requestId?: string; platforms: CreativePlatform[]; /** Sizes ticked on the Create page; each platform's defaults when absent. */ sizes?: string[]; /** The size the designs are made at; the saved run knows it once loaded. */ format?: CreativeMaster; prompt: string; onRestart: () => void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const [job, setJob] = useState<CreativeJob | null>(null);
  const [run, setRun] = useState<PublicRun | null>(null);
  // Keyed "d1:instagram-story", "d2:linkedin-landscape": one adaptation per direction and size.
  const [adapting, setAdapting] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  // Adaptations keep polling only while this card is on screen.
  const alive = useRef({ stopped: false });
  useEffect(() => { const signal = { stopped: false }; alive.current = signal; return () => { signal.stopped = true; }; }, []);

  useEffect(() => {
    const signal = { stopped: false };
    // The saved run on disk outlives the in-memory job (page left, server restarted, opened from a notification).
    const fromDisk = () => requestId
      ? api<PublicRun>(`/api/ai/runs/${requestId}`).then((saved) => { setRun(saved); updateActiveCreative({ status: 'done' }); })
      : Promise.reject(new Error(t('This design is no longer available.', 'لم يعد هذا التصميم متاحًا.')));
    const follow = jobId
      ? poll(jobId, (next) => {
          setJob(next);
          if (next.run) setRun(next.run);
          if (next.status !== 'running') updateActiveCreative({ status: next.status === 'done' ? 'done' : 'failed' });
        }, signal).catch(() => fromDisk())
      : fromDisk();
    void follow.catch((e) => { setError(errorMessage(e, '')); updateActiveCreative({ status: 'failed' }); });
    return () => { signal.stopped = true; };
  }, [jobId, requestId]);

  const adapt = async (directionId: string, format: string) => {
    if (!run) return;
    const key = `${directionId}:${format}`;
    setAdapting((s) => ({ ...s, [key]: 'queued' }));
    try {
      const { jobId: adaptId } = await api<{ jobId: string }>(`/api/ai/full-creative/${run.requestId}/adapt`, { body: { directionId, format } });
      await poll(adaptId, (next) => { setAdapting((s) => ({ ...s, [key]: next.stage })); if (next.run) setRun(next.run); if (next.status === 'failed') setError(next.error ?? ''); }, alive.current);
    } catch (e) { setError(errorMessage(e, '')); }
    setAdapting((s) => { const { [key]: _done, ...rest } = s; return rest; });
  };
  /** Every missing size of a direction, one after another (each is its own image-model call). */
  const adaptAll = async (directionId: string, missing: SizeTarget[]) => { for (const target of missing) { if (alive.current.stopped) return; await adapt(directionId, target.key); } };

  const brief: Brief | undefined = run?.brief ?? job?.brief;
  const main: CreativeMaster = run?.request.format ?? format ?? masterFormat(platforms);
  const targets = sizeTargets(platforms, sizes ?? defaultSizes(platforms), main);
  if (error && !brief) return <div className="creative-job"><p role="alert" className="creative-home__error">{error}</p><Button variant="secondary" onClick={onRestart}>{t('Edit request', 'عدّل الطلب')}</Button></div>;
  if (job?.status === 'failed' && !run) return <div className="creative-job"><p role="alert" className="creative-home__error">{job.error}</p><Button variant="secondary" onClick={onRestart}>{t('Try again', 'حاول مرة أخرى')}</Button></div>;
  if (!brief) {
    const stage = STAGES[job?.stage ?? 'queued'];
    return <div className="creative-job creative-job--progress glass" aria-live="polite">
      <div className="creative-orbit" aria-hidden><span /><span /><span /></div>
      <AnimatePresence mode="wait"><motion.h2 key={stage[0]} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>{t(stage[0], stage[1])}…</motion.h2></AnimatePresence>
      <p className="u-muted">{t('Odoo facts, the idea and copy, a full AI design, then quality checks and the exact Engosoft logo. You can leave this page; you will be notified when it is ready.', 'بيانات Odoo، والفكرة والنص، وتصميم كامل بالذكاء الاصطناعي، ثم مراجعة الجودة ووضع الشعار الأصلي. يمكنك الانتقال لصفحة أخرى، وسيصلك إشعار عند الانتهاء.')}</p>
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
        const made = targets.map((target) => ({ target, result: resultFor(results, id, target) }));
        const missing = made.filter((m) => !m.result).map((m) => m.target);
        const stage = job?.directionStages[id] ?? (job?.status === 'running' ? 'generating' : 'done');
        return <motion.article key={id} className="creative-job__card glass" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 30 }}>
          <div className="creative-job__frame" data-format={main} style={{ aspectRatio: `${MASTER_SIZE[main].width} / ${MASTER_SIZE[main].height}` }}>
            <AnimatePresence mode="wait">
              {result?.imageUrl
                ? <motion.img key="image" src={result.imageUrl} alt={direction.name} initial={{ opacity: 0, scale: 1.04, filter: 'blur(18px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
                : result ? <motion.div key="failed" className="creative-job__missing"><XCircle size={26} /></motion.div>
                : <motion.div key="forming" className="creative-forming" exit={{ opacity: 0 }}><span className="creative-forming__glow" /><span className="creative-forming__label">{t(STAGES[stage]?.[0] ?? '', STAGES[stage]?.[1] ?? '')}</span></motion.div>}
            </AnimatePresence>
          </div>
          <div className="creative-job__body">
            {result?.imageUrl && missing.length > 0 && <div className="creative-job__sizes">
              <div className="creative-job__sizes-head">
                <b>{t('Your other sizes', 'باقي المقاسات اللي اخترتها')}</b>
                <p className="u-xs u-muted">{t('Each size is a new design drawn from scratch for its own shape, with this design’s idea, words, subject and colours; nothing is stretched. One AI image each.', 'كل مقاس تصميم جديد بيترسم من الأول لشكله، بنفس فكرة وكلام وعناصر وألوان التصميم ده؛ مفيش مط. صورة ذكاء اصطناعي لكل مقاس.')}</p>
              </div>
              <div className="creative-job__slots">{missing.map((target) => {
                const key = `${id}:${target.key}`;
                const working = adapting[key];
                return <button key={target.key} type="button" className="size-slot" disabled={Boolean(working)} onClick={() => void adapt(id, target.key)}>
                  <span className="size-slot__frame" style={{ aspectRatio: `${target.width} / ${target.height}` }} data-wide={target.width > target.height ? '' : undefined}>
                    {working ? <Loader2 className="creative-job__spin" size={18} /> : <Sparkles size={18} />}
                  </span>
                  <span className="size-slot__name"><span className="creative-job__size-icons">{[...new Set(target.presets.map((p) => p.channel))].map((c) => <ChannelIcon key={c} channel={c} size={12} />)}</span><span dir="ltr" className="u-tnum">{target.width}×{target.height}</span></span>
                  <small>{working ? t(STAGES[working]?.[0] ?? 'Working', STAGES[working]?.[1] ?? 'قيد التنفيذ') : t(`Design ${targetLabel(target)}`, 'صمّمه')}</small>
                </button>;
              })}</div>
              {missing.length > 1 && <Button variant="primary" disabled={Object.keys(adapting).some((k) => k.startsWith(`${id}:`))} onClick={() => void adaptAll(id, missing)}><Layers size={15} /> {t(`Design all ${missing.length} sizes`, `صمّم الـ${missing.length} مقاسات مرة واحدة`)}</Button>}
            </div>}
            {result && <Status result={result} />}
            <h3 dir="auto">{direction.name}</h3>
            <p dir="auto" className="u-xs u-muted">{direction.concept}</p>
            {result && <Details result={result} />}
            {result && run && can('content.approve') && <DesignPlanPanel requestId={run.requestId} directionId={id} />}
            {result?.imageUrl && run && <ResultActions run={run} result={result} main={main} extras={made.filter((m): m is { target: SizeTarget; result: PublicResult } => Boolean(m.result))} platforms={platforms} prompt={prompt} direction={direction} />}
            {made.map(({ target, result: variant }) => {
              if (!variant) return null;
              const size = `${target.width}×${target.height}`;
              return <div key={target.key} className="creative-job__variant" data-format={target.height > target.width ? 'story' : 'landscape'}><motion.img src={variant.imageUrl} alt={size} style={{ aspectRatio: `${target.width} / ${target.height}` }} initial={{ opacity: 0, filter: 'blur(14px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.8 }} /><small className="u-xs u-muted" dir="auto">{size} · {targetLabel(target)}</small><Status result={variant} />{variant.imageUrl && <a className="ui-btn ui-btn--secondary ui-btn--md" href={variant.imageUrl} download={`engosoft-${variant.directionId}.png`}><Download size={15} /> PNG {size}</a>}</div>;
            })}
          </div>
        </motion.article>;
      })}
    </div>
    {error && <p role="alert" className="creative-home__error">{error}</p>}
  </div>;
}

/** Save the design into the content pipeline, or keep its recipe as an AI template. */
function ResultActions({ run, result, main, extras, platforms, prompt, direction }: { run: PublicRun; result: PublicResult; main: CreativeMaster; extras: { target: SizeTarget; result: PublicResult }[]; platforms: CreativePlatform[]; prompt: string; direction: Brief['directions'][number] }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { navigate } = useRouter();
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  // Once the post exists, a retry (after a failed "send") reuses it instead of creating a second copy.
  const created = useRef('');
  /** The post being published from this page: the publish window opens here, no redirect. */
  const [publishing, setPublishing] = useState<string | null>(null);
  const save = async (send: boolean) => {
    setBusy(send ? 'send' : 'draft'); setError('');
    try {
      if (!created.current) {
        // The generator writes no X caption yet, so X starts from the main caption and is trimmed in the editor.
        const written: Partial<Record<string, string>> = run.brief.captions ?? {};
        const captions = Object.fromEntries(platforms.map((p) => [p, written[p] || run.brief.caption]));
        // Every extra size is saved on the post under each publishing size it serves, and fills its slot.
        const made = extras.filter((e) => e.result.imageUrl);
        const sizes = Object.fromEntries(made.flatMap(({ target, result: r }) => target.presets.map((p) => [p.id, r.imageUrl!])));
        // A main design made as a story (or banner) also fills that slot, so publishing finds it there.
        const mainSlot = slotOf(MASTER_SIZE[main].width, MASTER_SIZE[main].height);
        const slots = Object.fromEntries([...(mainSlot ? [[mainSlot, result.imageUrl!]] : []), ...made.flatMap(({ target, result: r }) => { const slot = slotOf(target.width, target.height); return slot ? [[slot, r.imageUrl!]] : []; })]);
        const item = await api<{ id: string }>('/api/content', { body: { ...takePostPlan(), title: run.brief.canonicalCopy.headline, channels: platforms, captions, creative: { requestId: run.requestId, directionId: result.directionId, imageUrl: result.imageUrl, ...slots, ...(made.length ? { sizes } : {}), model: result.model, directionName: direction.name } } });
        created.current = item.id;
      }
      // The publisher goes straight to publishing (that is the approval); everyone else sends it to them.
      if (send && can('content.publish')) { setPublishing(created.current); setBusy(''); return; }
      if (send) await api(`/api/content/${created.current}/transition`, { body: { to: 'ready_for_review' } });
      navigate(`/content/${created.current}`);
    } catch (e) { setError(errorMessage(e, '')); }
    setBusy('');
  };
  const saveTemplate = async () => {
    const name = window.prompt(t('Template name', 'اسم القالب'), direction.name);
    if (!name) return;
    setBusy('template'); setError('');
    try {
      await api('/api/ai-templates', { body: { name, prompt, description: direction.concept, style: [direction.concept, direction.subject, direction.composition, direction.palette, direction.typography, direction.mood].join(' | ').slice(0, 1500), format: result.directionId.endsWith('-story') ? 'story' : result.directionId.endsWith('-video') ? 'video' : result.directionId.endsWith('-landscape') ? 'landscape' : run.request.format ?? 'feed', channels: platforms, sampleUrl: result.imageUrl } });
      setSaved(t('Saved to Library › AI templates', 'حُفظ في المكتبة › قوالب الذكاء الاصطناعي'));
    } catch (e) { setError(errorMessage(e, '')); }
    setBusy('');
  };
  return <div className="creative-job__actions">
    <Button variant="primary" disabled={Boolean(busy)} onClick={() => void save(true)}>{busy === 'send' ? <Loader2 className="creative-job__spin" size={15} /> : <Send size={15} />} {can('content.publish') ? t('Save and publish', 'احفظ وانشر') : t('Send to the publisher', 'ابعته للمسؤول عن النشر')}</Button>
    <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void save(false)}><FileText size={15} /> {t('Save as draft', 'احفظه مسودة')}</Button>
    <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void saveTemplate()}><BookmarkPlus size={15} /> {t('Save as AI template', 'احفظه قالب ذكاء اصطناعي')}</Button>
    <a className="ui-btn ui-btn--secondary ui-btn--md" href={result.imageUrl} download={`engosoft-${result.directionId}.png`}><Download size={15} /> PNG</a>
    <PublishHere contentId={publishing} onClose={() => setPublishing(null)} />
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
      <li>{t('Logo', 'الشعار')}: {logo.requiresCreativeRepair ? logo.reason : `${logo.variantId} · ${logo.placement.anchor} · ${logo.placement.width}px${logo.policy === 'engineering-default' ? t(' · outside guideline pairings, contrast-checked', ' · خارج الأزواج المعتمدة، مع التحقق من التباين') : ''}`}{result.repaired ? t(' · corner repaired', ' · تم إصلاح الركن') : ''}</li>
      <li>{t('Text', 'النص')}: {result.copyChecks.map((c) => `${c.field} ${t(VERDICT[c.verdict][0], VERDICT[c.verdict][1])}`).join(' · ')}</li>
      {result.refinements && result.refinements.length > 0 && <li>{t('Repaired by the critic', 'أصلحه الناقد')}: {result.refinements.join(' · ')}</li>}
      <li>{t('Critic', 'المُقيّم')}: {t('design', 'تصميم')} {result.inspection.scores.design}/10 · {t('marketing', 'تسويق')} {result.inspection.scores.marketing}/10 · {t('image', 'صورة')} {result.inspection.scores.imageQuality}/10 · {t('brand', 'هوية')} {result.inspection.scores.brandFit}/10</li>
      {result.problems.map((problem) => <li key={problem} className="creative-job__problem">{problem}</li>)}
      <li className="u-muted">{result.model} · {(result.latencyMs / 1000).toFixed(0)}s</li>
    </ul>
  </details>;
}
