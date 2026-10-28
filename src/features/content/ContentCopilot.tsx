import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { AlertTriangle, CalendarDays, Camera, Check, Clock, Copy, ExternalLink, Film, Flame, Hash, Layers, Lightbulb, Lock, Mic, Quote, RefreshCw, Search, Sparkles, Type } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import type { Channel } from '../../domain/shared';
import { DIALECTS, DIALECT_INFO, HOOK_FORMULA_LABEL, PILLAR_LABEL, POSTING_WINDOWS, SCRIPT_FORMATS, SCRIPT_INFO, type ContentKit, type Dialect, type ScriptFormat } from '../../domain/content-voice';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { api, errorMessage } from '../../lib/api';
import { businessZone } from '../../lib/format';
import { upcomingOccasions } from '../../lib/occasions';
import { CaptionsEditor, type Captions } from './CaptionsEditor';

type Idea = 'hooks' | 'script' | 'carousel' | 'trends' | 'publish';
const PREFS_KEY = 'content-copilot-voice';
interface Prefs { dialect: Dialect; format: ScriptFormat }
const DEFAULT_PREFS: Prefs = { dialect: 'saudi', format: 'reel' };
function readPrefs(): Prefs {
  try { const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>; return { dialect: DIALECTS.includes(saved.dialect!) ? saved.dialect! : 'saudi', format: SCRIPT_FORMATS.includes(saved.format!) ? saved.format! : 'reel' }; } catch { return DEFAULT_PREFS; }
}

/** The dialect a person last chose, shared by every place that writes captions. */
export function usePreferredDialect(): [Dialect, (next: Dialect) => void] {
  const [dialect, setDialect] = useState<Dialect>(() => readPrefs().dialect);
  return [dialect, (next) => { setDialect(next); try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), dialect: next })); } catch { /* private mode */ } }];
}

export function DialectPicker({ value, onChange }: { value: Dialect; onChange: (next: Dialect) => void }) {
  const { t, tx } = useI18n();
  return <div className="cop__dialects" role="radiogroup" aria-label={t('Dialect', 'اللهجة')}>
    {DIALECTS.map((d) => <button key={d} type="button" role="radio" aria-checked={value === d} title={tx(DIALECT_INFO[d].hint)} onClick={() => onChange(d)}>{tx(DIALECT_INFO[d])}</button>)}
  </div>;
}

/** What the writer is doing while the ideas are written (20–60 seconds). */
const STEPS = [
  { en: 'Choosing the angle…', ar: 'نحدد زاوية المحتوى…' },
  { en: 'Writing hooks…', ar: 'نكتب الهوكات…' },
  { en: 'Writing the video script…', ar: 'نكتب سكربت الفيديو…' },
  { en: 'Outlining the carousel…', ar: 'نجهّز الكاروسيل والستوري…' },
  { en: 'Picking hashtags and keywords…', ar: 'نختار الهاشتاجات وكلمات البحث…' },
];

const IDEAS: { id: Idea; icon: typeof Sparkles; en: string; ar: string }[] = [
  { id: 'script', icon: Film, en: 'Video script', ar: 'سكربت فيديو' },
  { id: 'hooks', icon: Quote, en: 'Hooks', ar: 'هوكات' },
  { id: 'carousel', icon: Layers, en: 'Carousel', ar: 'كاروسيل' },
  { id: 'trends', icon: Flame, en: 'Trends', ar: 'التريند' },
  { id: 'publish', icon: Clock, en: 'Timing & tags', ar: 'التوقيت والهاشتاج' },
];

function useCopy() {
  const [copied, setCopied] = useState('');
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(''), 1500); return () => clearTimeout(timer); }, [copied]);
  return { copied, copy: (key: string, text: string) => void navigator.clipboard.writeText(text).then(() => setCopied(key), () => {}) };
}

function CopyButton({ id, text, state }: { id: string; text: string; state: ReturnType<typeof useCopy> }) {
  const { t } = useI18n();
  return <button type="button" className="cop-copy" onClick={() => state.copy(id, text)} aria-label={t('Copy', 'انسخ')} title={t('Copy', 'انسخ')}>
    {state.copied === id ? <Check size={14} /> : <Copy size={14} />}
  </button>;
}

/** "9 م – 11 م" in a zone, from Saudi hours. */
function windowLabel(range: [number, number], zone: string, lang: 'ar' | 'en') {
  const at = (hour: number) => DateTime.now().setZone('Asia/Riyadh').set({ hour: hour % 24, minute: 0 }).setZone(zone);
  const fmt = (d: DateTime) => lang === 'ar' ? `${d.hour % 12 || 12} ${d.hour < 12 ? 'ص' : 'م'}` : d.toFormat('h a');
  return `${fmt(at(range[0]))} – ${fmt(at(range[1]))}`;
}

function scriptText(kit: ContentKit) {
  const s = kit.script;
  return [s.title, `${SCRIPT_INFO[s.format].ar} · ${s.seconds}s`, '', ...s.scenes.map((scene) => [`[${scene.t}]`, `🎥 ${scene.visual}`, `🎙️ ${scene.voiceover}`, scene.onScreen ? `🔤 ${scene.onScreen}` : '', scene.broll ? `🎞️ ${scene.broll}` : ''].filter(Boolean).join('\n')), '', `CTA: ${s.cta}`, `🎵 ${s.audio}`].join('\n');
}

/**
 * The AI content layer beside a post. First the post's caption, written straight into the caption box in the
 * dialect the person picks; then, on demand, extra ideas for the same post (video script, hooks, carousel,
 * trends, timing and hashtags). Approved posts keep their caption; the ideas still work on them.
 */
export function ContentCopilot({ contentId, channels, captions, onCaptions, editable, footer }: {
  contentId: string;
  channels: Channel[];
  captions: Captions;
  onCaptions: (next: Captions) => void;
  editable: boolean;
  /** Shown under the caption (the save button of the drawer). */
  footer?: ReactNode;
}) {
  const { t, tx, lang, relative } = useI18n();
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [idea, setIdea] = useState<Idea>('script');
  const [kit, setKit] = useState<ContentKit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'' | 'kit' | 'trends'>('');
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState('');
  const copyState = useCopy();

  useEffect(() => {
    let live = true;
    api<{ kit: ContentKit | null }>(`/api/content/${contentId}/kit`).then((r) => { if (live) setKit(r.kit); }).catch(() => {}).finally(() => live && setLoaded(true));
    return () => { live = false; };
  }, [contentId]);
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ } }, [prefs]);
  useEffect(() => { if (busy !== 'kit') return; setStep(0); const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 7000); return () => clearInterval(timer); }, [busy]);

  const hasKit = Boolean(kit?.generatedAt);
  const occasions = useMemo(() => upcomingOccasions(DateTime.now().setZone(businessZone()).toISODate() ?? '', 45, 6), []);

  const writeIdeas = async () => {
    setBusy('kit'); setError('');
    try { const r = await api<{ kit: ContentKit }>(`/api/content/${contentId}/kit`, { body: { dialect: prefs.dialect, format: prefs.format } }); setKit(r.kit); }
    catch (e) { setError(errorMessage(e, t('Could not write the ideas. Try again.', 'تعذّرت كتابة الأفكار. حاول مرة أخرى.'))); }
    setBusy('');
  };
  const scan = async () => {
    setBusy('trends'); setError('');
    try { const r = await api<{ kit: ContentKit }>(`/api/content/${contentId}/kit/trends`, { body: focus.trim() ? { focus: focus.trim() } : {} }); setKit(r.kit); }
    catch (e) { setError(errorMessage(e, t('Trend search failed. Try again.', 'تعذّر البحث عن التريند. حاول مرة أخرى.'))); }
    setBusy('');
  };

  const writeButton = (label: string) => <Button variant="primary" icon={<Sparkles size={15} />} busy={busy === 'kit'} disabled={Boolean(busy) || !loaded} onClick={() => void writeIdeas()}>{label}</Button>;

  return (
    <section className="cop glass" aria-label={t('Content copilot', 'مساعد المحتوى')}>
      <header className="cop__head">
        <span className="cop__badge"><Sparkles size={15} /></span>
        <div><h3>{t('Post caption', 'نص المنشور')}</h3><small>{t('What people read with the design, written for each platform', 'النص اللي هيتنشر مع التصميم، مكتوب لكل منصة')}</small></div>
      </header>

      <DialectPicker value={prefs.dialect} onChange={(dialect) => setPrefs((p) => ({ ...p, dialect }))} />

      {!editable && <p className="cop-locked"><Lock size={14} /> <span>{t('This post is approved, so its caption is locked. To change it, use “Request changes” in Next step. You can still copy it and use the ideas below.', 'المنشور معتمد، فالنص مقفول. لتغييره اطلب تعديلًا من «الخطوة التالية». تقدر تنسخه وتستخدم الأفكار اللي تحت.')}</span></p>}

      <CaptionsEditor channels={channels} value={captions} onChange={onCaptions} readOnly={!editable} dialect={prefs.dialect} ai={editable ? { contentId } : undefined} />
      {footer}

      <div className="cop-ideas">
        <header className="cop-ideas__head">
          <div><b><Lightbulb size={15} /> {t('More for this post', 'أفكار إضافية للمنشور')}</b>
            <small>{hasKit ? t(`Written ${relative(kit!.generatedAt)} in ${DIALECT_INFO[kit!.dialect].en}`, `اتكتبت ${relative(kit!.generatedAt)} باللهجة ${DIALECT_INFO[kit!.dialect].ar}`) : t('A video script, hooks, a carousel, trends and timing — same voice', 'سكربت فيديو وهوكات وكاروسيل وتريند وتوقيت — بنفس اللهجة')}</small></div>
          {hasKit && <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} busy={busy === 'kit'} disabled={Boolean(busy)} onClick={() => void writeIdeas()}>{t('Rewrite', 'أعد الكتابة')}</Button>}
        </header>

        {busy === 'kit' && <div className="cop__progress" role="status">
          <span className="ui-btn__spinner" aria-hidden /> <b>{tx(STEPS[step])}</b>
          <div className="cop__steps">{STEPS.map((s, i) => <i key={s.en} data-done={i < step || undefined} data-now={i === step || undefined} />)}</div>
        </div>}
        {error && <p role="alert" className="creative-home__error">{error}</p>}

        {!hasKit && busy !== 'kit' ? (
          <div className="cop-start">
            <div className="cop-start__tiles">{IDEAS.map(({ id, icon: Icon, en, ar }) => <span key={id}><Icon size={16} />{t(en, ar)}</span>)}</div>
            {writeButton(t('Write the ideas', 'اكتب الأفكار'))}
          </div>
        ) : hasKit && <>
          {kit!.warnings.length > 0 && <ul className="cop__warnings">{kit!.warnings.map((w) => <li key={w}><AlertTriangle size={14} /> <span dir="auto">{w}</span></li>)}</ul>}
          <div className="cop__tabs" role="tablist" aria-label={t('Ideas', 'الأفكار')}>
            {IDEAS.map(({ id, icon: Icon, en, ar }) => <button key={id} type="button" role="tab" aria-selected={idea === id} onClick={() => setIdea(id)}><Icon size={14} /><span>{t(en, ar)}</span></button>)}
          </div>

          <div className="cop__panel" role="tabpanel" aria-busy={busy === 'kit' || undefined}>
            {idea === 'hooks' && <>
              <article className="cop-angle">
                <span><Lightbulb size={15} /> {t('The angle', 'زاوية المحتوى')}{kit!.angle.pillar && <i>{tx(PILLAR_LABEL[kit!.angle.pillar] ?? { en: kit!.angle.pillar, ar: kit!.angle.pillar })}</i>}</span>
                <p dir="auto">{kit!.angle.idea}</p>
                <dl><div><dt>{t('Audience', 'الجمهور')}</dt><dd dir="auto">{kit!.angle.audience}</dd></div><div><dt>{t('Insight', 'الدافع')}</dt><dd dir="auto">{kit!.angle.insight}</dd></div></dl>
              </article>
              <ol className="cop-hooks">{kit!.hooks.map((h, i) => <li key={i}>
                <span className="cop-hooks__n u-tnum">{i + 1}</span>
                <div><p dir="auto">{h.text}</p>{h.spoken && h.spoken !== h.text && <small dir="auto"><Mic size={12} /> {h.spoken}</small>}</div>
                <i className="cop-chip">{tx(HOOK_FORMULA_LABEL[h.formula] ?? { en: h.formula, ar: h.formula })}</i>
                <CopyButton id={`hook-${i}`} text={h.text} state={copyState} />
              </li>)}</ol>
            </>}

            {idea === 'script' && <>
              <div className="cop-script__head">
                <label className="cop-select"><span>{t('Video', 'الفيديو')}</span>
                  <select value={prefs.format} onChange={(e) => setPrefs((p) => ({ ...p, format: e.target.value as ScriptFormat }))}>{SCRIPT_FORMATS.map((v) => <option key={v} value={v}>{tx(SCRIPT_INFO[v])} · {SCRIPT_INFO[v].seconds}{t('s', 'ث')}</option>)}</select>
                </label>
                {prefs.format !== kit!.script.format
                  ? <Button size="sm" variant="primary" icon={<RefreshCw size={14} />} busy={busy === 'kit'} disabled={Boolean(busy)} onClick={() => void writeIdeas()}>{t('Write for this format', 'اكتبه لهذا النوع')}</Button>
                  : kit!.script.scenes.length > 0 && <Button size="sm" variant="secondary" icon={copyState.copied === 'script' ? <Check size={14} /> : <Copy size={14} />} onClick={() => copyState.copy('script', scriptText(kit!))}>{copyState.copied === 'script' ? t('Copied', 'تم النسخ') : t('Copy script', 'انسخ السكربت')}</Button>}
              </div>
              {kit!.script.scenes.length > 0 && <>
                <p className="cop-script__title"><b dir="auto">{kit!.script.title}</b> <small>· {t('cover', 'الغلاف')}: <span dir="auto">«{kit!.script.cover}»</span></small></p>
                <ol className="cop-scenes">{kit!.script.scenes.map((s, i) => <li key={i}>
                  <span className="cop-scenes__t u-tnum">{s.t}</span>
                  <div className="cop-scenes__body">
                    <p className="cop-scenes__vo"><Mic size={13} /> <span dir="auto">{s.voiceover}</span></p>
                    {s.onScreen && <p className="cop-scenes__os"><Type size={13} /> <span dir="auto">{s.onScreen}</span></p>}
                    <p><Camera size={13} /> <span dir="auto">{s.visual}{s.broll ? ` · ${s.broll}` : ''}</span></p>
                  </div>
                </li>)}</ol>
                <div className="cop-script__foot"><span><b>CTA</b> <span dir="auto">{kit!.script.cta}</span></span><span>🎵 <span dir="auto">{kit!.script.audio}</span></span></div>
              </>}
            </>}

            {idea === 'carousel' && <>
              <h4 className="cop-sub"><Layers size={14} /> {t('Carousel', 'كاروسيل')} <small>{t(`${kit!.carousel.length} slides`, `${kit!.carousel.length} شرائح`)}</small>
                <CopyButton id="carousel" text={kit!.carousel.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`).join('\n\n')} state={copyState} /></h4>
              <div className="cop-slides">{kit!.carousel.map((s, i) => <article key={i} data-first={i === 0 || undefined} data-last={i === kit!.carousel.length - 1 || undefined}>
                <span className="u-tnum">{i + 1}/{kit!.carousel.length}</span><b dir="auto">{s.title}</b><p dir="auto">{s.body}</p>
              </article>)}</div>
              {kit!.stories.length > 0 && <>
                <h4 className="cop-sub"><Camera size={14} /> {t('Stories', 'ستوري')} <small>{t(`${kit!.stories.length} frames`, `${kit!.stories.length} إطارات`)}</small></h4>
                <div className="cop-stories">{kit!.stories.map((s, i) => <article key={i}><span className="u-tnum">{i + 1}</span><p dir="auto">{s.frame}</p>{s.sticker && <small dir="auto">✦ {s.sticker}</small>}</article>)}</div>
              </>}
            </>}

            {idea === 'trends' && <>
              <div className="cop-scan">
                <div><b><Flame size={15} /> {t('Live trends in Saudi Arabia', 'التريند الحالي في السعودية')}</b>
                  <small>{kit?.trends ? t(`Searched ${relative(kit.trends.scannedAt)} · with sources`, `آخر بحث ${relative(kit.trends.scannedAt)} · مع المصادر`) : t('Searches the web now and keeps only trends that fit this post.', 'يبحث في الويب الآن ويحتفظ فقط بما يناسب هذا المنشور.')}</small></div>
                <form onSubmit={(e) => { e.preventDefault(); void scan(); }}>
                  <label className="board-search"><Search size={14} /><input dir="auto" value={focus} maxLength={200} onChange={(e) => setFocus(e.target.value)} placeholder={t('Optional focus, e.g. Vision 2030 projects', 'تركيز اختياري، مثل مشاريع رؤية 2030')} aria-label={t('Trend focus', 'تركيز البحث')} /></label>
                  <Button type="submit" size="sm" variant="primary" icon={<Search size={14} />} busy={busy === 'trends'} disabled={Boolean(busy)}>{kit?.trends ? t('Search again', 'ابحث مجددًا') : t('Find trends', 'ابحث عن التريند')}</Button>
                </form>
              </div>
              {kit?.trends?.items.length ? <ol className="cop-trends">{kit.trends.items.map((tr, i) => <li key={i} data-weak={tr.fit < 60 || undefined}>
                <header><b dir="auto">{tr.title}</b><span className="cop-fit" style={{ ['--fit' as string]: `${tr.fit}%` }} title={t('How well it fits this post', 'مدى ملاءمته للمنشور')}><i /><span className="u-tnum">{tr.fit}</span></span></header>
                <p className="cop-trends__use" dir="auto"><Lightbulb size={13} /> {tr.howToUse}</p>
                <p dir="auto">{tr.why}</p>
                <footer>{tr.platforms.map((p) => <i key={p} className="cop-chip">{p}</i>)}{tr.risk && !/^low$|^منخفض/i.test(tr.risk.trim()) && <span className="cop-risk" dir="auto"><AlertTriangle size={12} /> {tr.risk}</span>}</footer>
              </li>)}</ol> : null}
              {kit?.trends?.sources.length ? <details className="cop-sources"><summary>{t(`${kit.trends.sources.length} sources`, `${kit.trends.sources.length} مصادر`)}</summary>
                <ul>{kit.trends.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" dir="auto">{s.title} <ExternalLink size={11} /></a></li>)}</ul>
              </details> : null}
              <h4 className="cop-sub"><CalendarDays size={14} /> {t('Coming occasions', 'مناسبات قادمة')} <small>{t('next 45 days', 'خلال ٤٥ يومًا')}</small></h4>
              {occasions.length ? <ul className="cop-occasions">{occasions.map((o) => {
                const note = kit?.occasions.find((k) => k.day === o.day)?.idea;
                return <li key={o.key}><time className="u-tnum">{DateTime.fromISO(o.day).setLocale(lang === 'ar' ? 'ar' : 'en').toFormat('d LLL')}</time><div><b>{o.name}{o.region ? <small> · {o.region}</small> : null}{o.approximate ? <small> · {t('±1 day', '±يوم')}</small> : null}</b>{note && <p dir="auto"><Lightbulb size={12} /> {note}</p>}</div></li>;
              })}</ul> : <p className="cop-muted">{t('No occasions in the next 45 days.', 'لا توجد مناسبات خلال ٤٥ يومًا.')}</p>}
            </>}

            {idea === 'publish' && <>
              <h4 className="cop-sub"><Clock size={14} /> {t('Best windows', 'أفضل أوقات النشر')} <small>{t('Saudi time · starting points', 'بتوقيت السعودية · نقطة بداية')}</small></h4>
              <ul className="cop-windows">{channels.map((c) => { const w = POSTING_WINDOWS[c]; return <li key={c}>
                <span><ChannelIcon channel={c} size={14} /> {channelName[c]}</span>
                <b className="u-tnum">{windowLabel(w.primary, 'Asia/Riyadh', lang)}</b>
                <small className="u-tnum">{t('also', 'أو')} {windowLabel(w.secondary, 'Asia/Riyadh', lang)}{w.days ? ` · ${tx(w.days)}` : ''}</small>
              </li>; })}</ul>
              <h4 className="cop-sub"><Hash size={14} /> {t('Hashtags', 'الهاشتاجات')}
                <CopyButton id="tags" text={[...kit!.hashtags.core, ...kit!.hashtags.niche, ...kit!.hashtags.local].join(' ')} state={copyState} /></h4>
              <p className="cop-tags">{[...kit!.hashtags.core, ...kit!.hashtags.niche, ...kit!.hashtags.local].map((h) => <button key={h} type="button" onClick={() => copyState.copy(h, h)} className="cop-tag" dir="auto">{copyState.copied === h ? <Check size={11} /> : null}{h}</button>)}</p>
              {kit!.keywords.length > 0 && <>
                <h4 className="cop-sub"><Search size={14} /> {t('Search keywords', 'كلمات البحث')} <small>{t('use them in the caption and on screen', 'استخدمها في النص وعلى الشاشة')}</small></h4>
                <p className="cop-keywords">{kit!.keywords.map((k) => <span key={k} dir="auto">{k}</span>)}</p>
              </>}
            </>}
          </div>
        </>}
      </div>
    </section>
  );
}
