import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { AlertTriangle, CalendarDays, Camera, Check, Clock, Copy, ExternalLink, Film, Flame, Hash, Layers, Lightbulb, Mic, Quote, RefreshCw, Search, Sparkles, Type, Wand2 } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import type { Channel } from '../../domain/shared';
import {
  DIALECTS, DIALECT_INFO, GOALS, GOAL_INFO, HOOK_FORMULA_LABEL, PILLAR_LABEL, POSTING_WINDOWS, SCRIPT_FORMATS, SCRIPT_INFO, TONES, TONE_INFO,
  type ContentKit, type Dialect, type Goal, type ScriptFormat, type Tone,
} from '../../domain/content-voice';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { api, errorMessage } from '../../lib/api';
import { businessZone } from '../../lib/format';
import { upcomingOccasions } from '../../lib/occasions';
import { CaptionsEditor, captionSourceFromValues, type Captions } from './CaptionsEditor';

type Tab = 'captions' | 'hooks' | 'script' | 'carousel' | 'trends' | 'publish';
const PREFS_KEY = 'content-copilot-voice';
interface Prefs { dialect: Dialect; tone: Tone; goal: Goal; format: ScriptFormat }
const DEFAULT_PREFS: Prefs = { dialect: 'saudi', tone: 'expert', goal: 'register', format: 'reel' };
function readPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs> }; } catch { return DEFAULT_PREFS; }
}

/** What the writer is doing, shown while a kit is being written (it takes 20–60 seconds). */
const STEPS = [
  { en: 'Choosing the angle…', ar: 'نحدد زاوية المحتوى…' },
  { en: 'Writing hooks…', ar: 'نكتب الهوكات…' },
  { en: 'Adapting each platform…', ar: 'نكيّف النص لكل منصة…' },
  { en: 'Writing the video script…', ar: 'نكتب سكربت الفيديو…' },
  { en: 'Picking hashtags and keywords…', ar: 'نختار الهاشتاجات وكلمات البحث…' },
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

/** "9–11 م" in a zone, from Saudi hours. */
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
 * The AI content layer beside a post: one content kit (angle, hooks, native captions, video script, carousel,
 * stories, trends, hashtags and posting windows) written in the register the person picks. The kit never
 * changes approved copy; editable posts can take its captions into the editor.
 */
export function ContentCopilot({ contentId, title, channels, values, captions, onCaptions, editable, footer }: {
  contentId: string;
  title: string;
  channels: Channel[];
  /** Template fields of the post, for the free caption suggestion. */
  values?: Record<string, string>;
  captions: Captions;
  onCaptions: (next: Captions) => void;
  editable: boolean;
  /** Shown under the captions (the save button of the drawer). */
  footer?: ReactNode;
}) {
  const { t, tx, lang, relative } = useI18n();
  const [tab, setTab] = useState<Tab>('captions');
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [kit, setKit] = useState<ContentKit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'' | 'kit' | 'trends'>('');
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState('');
  const copyState = useCopy();

  useEffect(() => {
    let live = true;
    api<{ kit: ContentKit | null }>(`/api/content/${contentId}/kit`).then((r) => { if (!live) return; setKit(r.kit); if (r.kit?.generatedAt) setPrefs((p) => ({ ...p, dialect: r.kit!.dialect, tone: r.kit!.tone, goal: r.kit!.goal, format: r.kit!.script.format })); }).catch(() => {}).finally(() => live && setLoaded(true));
    return () => { live = false; };
  }, [contentId]);
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ } }, [prefs]);
  useEffect(() => { if (busy !== 'kit') return; setStep(0); const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 7000); return () => clearInterval(timer); }, [busy]);

  const hasKit = Boolean(kit?.generatedAt);
  const stale = hasKit && (kit!.dialect !== prefs.dialect || kit!.tone !== prefs.tone || kit!.goal !== prefs.goal || kit!.script.format !== prefs.format);
  const kitCaptions = useMemo(() => Object.entries(kit?.captions ?? {}).filter(([c, text]) => channels.includes(c as Channel) && text && text.trim() !== (captions[c as Channel] ?? '').trim()), [kit, captions, channels]);
  const occasions = useMemo(() => upcomingOccasions(DateTime.now().setZone(businessZone()).toISODate() ?? '', 45, 6), []);

  const write = async () => {
    setBusy('kit'); setError('');
    try { const r = await api<{ kit: ContentKit }>(`/api/content/${contentId}/kit`, { body: prefs }); setKit(r.kit); if (tab === 'trends' || tab === 'publish') setTab('hooks'); }
    catch (e) { setError(errorMessage(e, t('Could not write the kit. Try again.', 'تعذّرت كتابة الحزمة. حاول مرة أخرى.'))); }
    setBusy('');
  };
  const scan = async () => {
    setBusy('trends'); setError('');
    try { const r = await api<{ kit: ContentKit }>(`/api/content/${contentId}/kit/trends`, { body: focus.trim() ? { focus: focus.trim() } : {} }); setKit(r.kit); }
    catch (e) { setError(errorMessage(e, t('Trend search failed. Try again.', 'تعذّر البحث عن التريند. حاول مرة أخرى.'))); }
    setBusy('');
  };

  const TABS: { id: Tab; icon: typeof Sparkles; en: string; ar: string; count?: number }[] = [
    { id: 'captions', icon: Type, en: 'Captions', ar: 'النصوص' },
    { id: 'hooks', icon: Quote, en: 'Hooks', ar: 'الهوكات', count: kit?.hooks.length },
    { id: 'script', icon: Film, en: 'Video script', ar: 'سكربت فيديو' },
    { id: 'carousel', icon: Layers, en: 'Carousel & stories', ar: 'كاروسيل وستوري' },
    { id: 'trends', icon: Flame, en: 'Trends', ar: 'التريند', count: kit?.trends?.items.length },
    { id: 'publish', icon: Clock, en: 'When & tags', ar: 'التوقيت والهاشتاج' },
  ];

  const needKit = (what: string) => (
    <div className="cop-empty">
      <span className="cop-empty__icon"><Sparkles size={20} /></span>
      <b>{t(`No ${what} yet`, `لا يوجد ${what} بعد`)}</b>
      <p>{t('Write the content kit: hooks, a native caption per platform, a video script, a carousel and hashtags — in the voice you chose above.', 'اكتب حزمة المحتوى: هوكات، ونص أصلي لكل منصة، وسكربت فيديو، وكاروسيل، وهاشتاجات — باللهجة التي اخترتها بالأعلى.')}</p>
      <Button variant="primary" icon={<Sparkles size={15} />} busy={busy === 'kit'} disabled={Boolean(busy)} onClick={() => void write()}>{t('Write the content kit', 'اكتب حزمة المحتوى')}</Button>
    </div>
  );

  return (
    <section className="cop glass" aria-label={t('Content copilot', 'مساعد المحتوى')}>
      <header className="cop__head">
        <div className="cop__title">
          <span className="cop__badge"><Sparkles size={15} /></span>
          <div><h3>{t('Content copilot', 'مساعد المحتوى')}</h3><small>{hasKit ? t(`Kit written ${relative(kit!.generatedAt)}`, `كُتبت الحزمة ${relative(kit!.generatedAt)}`) : t('Native copy for every platform, in your audience’s voice', 'محتوى أصلي لكل منصة بلهجة جمهورك')}</small></div>
        </div>
        <Button size="sm" variant={hasKit && !stale ? 'secondary' : 'primary'} icon={hasKit ? <RefreshCw size={14} /> : <Sparkles size={14} />} busy={busy === 'kit'} disabled={Boolean(busy) || !loaded} onClick={() => void write()}>
          {hasKit ? (stale ? t('Rewrite in this voice', 'أعد الكتابة بهذا الصوت') : t('Rewrite', 'أعد الكتابة')) : t('Write kit', 'اكتب الحزمة')}
        </Button>
      </header>

      <div className="cop__voice">
        <div className="cop__dialects" role="radiogroup" aria-label={t('Dialect', 'اللهجة')}>
          {DIALECTS.map((d) => <button key={d} type="button" role="radio" aria-checked={prefs.dialect === d} title={tx(DIALECT_INFO[d].hint)} onClick={() => setPrefs((p) => ({ ...p, dialect: d }))}>{tx(DIALECT_INFO[d])}</button>)}
        </div>
        <div className="cop__selects">
          <label><span>{t('Tone', 'النبرة')}</span><select value={prefs.tone} onChange={(e) => setPrefs((p) => ({ ...p, tone: e.target.value as Tone }))}>{TONES.map((v) => <option key={v} value={v}>{tx(TONE_INFO[v])}</option>)}</select></label>
          <label><span>{t('Goal', 'الهدف')}</span><select value={prefs.goal} onChange={(e) => setPrefs((p) => ({ ...p, goal: e.target.value as Goal }))}>{GOALS.map((v) => <option key={v} value={v}>{tx(GOAL_INFO[v])}</option>)}</select></label>
          <label><span>{t('Video', 'الفيديو')}</span><select value={prefs.format} onChange={(e) => setPrefs((p) => ({ ...p, format: e.target.value as ScriptFormat }))}>{SCRIPT_FORMATS.map((v) => <option key={v} value={v}>{tx(SCRIPT_INFO[v])}</option>)}</select></label>
        </div>
        <p className="cop__hint"><Lightbulb size={13} /> {tx(DIALECT_INFO[prefs.dialect].hint)} <span dir="auto">«{DIALECT_INFO[prefs.dialect].sample}»</span></p>
      </div>

      {busy === 'kit' && <div className="cop__progress" role="status">
        <span className="ui-btn__spinner" aria-hidden /> <b>{tx(STEPS[step])}</b>
        <div className="cop__steps">{STEPS.map((s, i) => <i key={s.en} data-done={i < step || undefined} data-now={i === step || undefined} />)}</div>
      </div>}
      {error && <p role="alert" className="creative-home__error">{error}</p>}
      {kit?.warnings.length ? <ul className="cop__warnings">{kit.warnings.map((w) => <li key={w}><AlertTriangle size={14} /> <span dir="auto">{w}</span></li>)}</ul> : null}

      <div className="cop__tabs" role="tablist" aria-label={t('Copilot sections', 'أقسام المساعد')}>
        {TABS.map(({ id, icon: Icon, en, ar, count }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
          <Icon size={14} /><span>{t(en, ar)}</span>{count ? <i className="u-tnum">{count}</i> : null}
        </button>)}
      </div>

      <div className="cop__panel" role="tabpanel" aria-busy={busy === 'kit' || undefined}>
        {tab === 'captions' && <>
          {kitCaptions.length > 0 && <div className="cop-apply">
            <Wand2 size={16} />
            <div><b>{t(`The kit has ${kitCaptions.length} new caption(s) in ${DIALECT_INFO[kit!.dialect].en}`, `في الحزمة ${kitCaptions.length} نص جديد باللهجة ${DIALECT_INFO[kit!.dialect].ar}`)}</b>
              <small>{editable ? t('Apply them to the editor; nothing is saved until you save.', 'طبّقها على المحرر؛ لا يُحفظ شيء قبل الضغط على حفظ.') : t('This post is locked for edits. Copy them, or return it for edits first.', 'المنشور مقفول للتعديل. انسخها، أو أعده للتعديل أولًا.')}</small></div>
            {editable && <Button size="sm" variant="primary" onClick={() => onCaptions({ ...captions, ...Object.fromEntries(kitCaptions) })}>{t('Apply all', 'طبّق الكل')}</Button>}
          </div>}
          {!editable && kitCaptions.length > 0 && <div className="cop-list">{kitCaptions.map(([c, text]) => <article key={c} className="cop-card">
            <header><ChannelIcon channel={c as Channel} size={14} /> <b>{channelName[c as Channel]}</b><CopyButton id={`cap-${c}`} text={text!} state={copyState} /></header>
            <p dir="auto" className="cop-pre">{text}</p>
          </article>)}</div>}
          <CaptionsEditor channels={channels} value={captions} onChange={onCaptions} readOnly={!editable} dialect={prefs.dialect}
            source={captionSourceFromValues(title, values)} ai={editable ? { contentId } : undefined} />
          {footer}
        </>}

        {tab === 'hooks' && (!hasKit ? needKit(t('hooks', 'هوكات')) : <>
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
        </>)}

        {tab === 'script' && (!hasKit || !kit!.script.scenes.length ? needKit(t('script', 'سكربت')) : <>
          <div className="cop-script__head">
            <div><b dir="auto">{kit!.script.title}</b><small>{tx(SCRIPT_INFO[kit!.script.format])} · {kit!.script.seconds}{t('s', ' ث')} · {t('cover', 'الغلاف')}: <span dir="auto">«{kit!.script.cover}»</span></small></div>
            <Button size="sm" variant="secondary" icon={copyState.copied === 'script' ? <Check size={14} /> : <Copy size={14} />} onClick={() => copyState.copy('script', scriptText(kit!))}>{copyState.copied === 'script' ? t('Copied', 'تم النسخ') : t('Copy script', 'انسخ السكربت')}</Button>
          </div>
          <ol className="cop-scenes">{kit!.script.scenes.map((s, i) => <li key={i}>
            <span className="cop-scenes__t u-tnum">{s.t}</span>
            <div className="cop-scenes__body">
              <p><Camera size={13} /> <span dir="auto">{s.visual}</span></p>
              <p className="cop-scenes__vo"><Mic size={13} /> <span dir="auto">{s.voiceover}</span></p>
              {s.onScreen && <p className="cop-scenes__os"><Type size={13} /> <span dir="auto">{s.onScreen}</span></p>}
              {s.broll && <p className="cop-scenes__broll"><Film size={13} /> <span dir="auto">{s.broll}</span></p>}
            </div>
          </li>)}</ol>
          <div className="cop-script__foot"><span><b>CTA</b> <span dir="auto">{kit!.script.cta}</span></span><span>🎵 <span dir="auto">{kit!.script.audio}</span></span></div>
        </>)}

        {tab === 'carousel' && (!hasKit || !kit!.carousel.length ? needKit(t('carousel', 'كاروسيل')) : <>
          <h4 className="cop-sub"><Layers size={14} /> {t('Carousel', 'كاروسيل')} <small>{t(`${kit!.carousel.length} slides`, `${kit!.carousel.length} شرائح`)}</small>
            <CopyButton id="carousel" text={kit!.carousel.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`).join('\n\n')} state={copyState} /></h4>
          <div className="cop-slides">{kit!.carousel.map((s, i) => <article key={i} data-first={i === 0 || undefined} data-last={i === kit!.carousel.length - 1 || undefined}>
            <span className="u-tnum">{i + 1}/{kit!.carousel.length}</span><b dir="auto">{s.title}</b><p dir="auto">{s.body}</p>
          </article>)}</div>
          {kit!.stories.length > 0 && <>
            <h4 className="cop-sub"><Camera size={14} /> {t('Stories', 'ستوري')} <small>{t(`${kit!.stories.length} frames`, `${kit!.stories.length} إطارات`)}</small></h4>
            <div className="cop-stories">{kit!.stories.map((s, i) => <article key={i}><span className="u-tnum">{i + 1}</span><p dir="auto">{s.frame}</p>{s.sticker && <small dir="auto">✦ {s.sticker}</small>}</article>)}</div>
          </>}
        </>)}

        {tab === 'trends' && <>
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
            <p dir="auto">{tr.why}</p>
            <p className="cop-trends__use" dir="auto"><Lightbulb size={13} /> {tr.howToUse}</p>
            <footer>{tr.platforms.map((p) => <i key={p} className="cop-chip">{p}</i>)}{tr.risk && !/^low$|^منخفض/i.test(tr.risk.trim()) && <span className="cop-risk" dir="auto"><AlertTriangle size={12} /> {tr.risk}</span>}</footer>
          </li>)}</ol> : null}
          {kit?.trends?.sources.length ? <details className="cop-sources"><summary>{t(`${kit.trends.sources.length} sources`, `${kit.trends.sources.length} مصادر`)}</summary>
            <ul>{kit.trends.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" dir="auto">{s.title} <ExternalLink size={11} /></a></li>)}</ul>
          </details> : null}

          <h4 className="cop-sub"><CalendarDays size={14} /> {t('Coming occasions', 'مناسبات قادمة')} <small>{t('next 45 days', 'خلال ٤٥ يومًا')}</small></h4>
          {occasions.length ? <ul className="cop-occasions">{occasions.map((o) => {
            const idea = kit?.occasions.find((k) => k.day === o.day)?.idea;
            return <li key={o.key}><time className="u-tnum">{DateTime.fromISO(o.day).setLocale(lang === 'ar' ? 'ar' : 'en').toFormat('d LLL')}</time><div><b>{o.name}{o.region ? <small> · {o.region}</small> : null}{o.approximate ? <small> · {t('±1 day', '±يوم')}</small> : null}</b>{idea && <p dir="auto"><Lightbulb size={12} /> {idea}</p>}</div></li>;
          })}</ul> : <p className="cop-muted">{t('No occasions in the next 45 days.', 'لا توجد مناسبات خلال ٤٥ يومًا.')}</p>}
        </>}

        {tab === 'publish' && <>
          <h4 className="cop-sub"><Clock size={14} /> {t('Best windows', 'أفضل أوقات النشر')} <small>{t('Saudi audience · starting points', 'جمهور السعودية · نقطة بداية')}</small></h4>
          <ul className="cop-windows">{channels.map((c) => { const w = POSTING_WINDOWS[c]; return <li key={c}>
            <span><ChannelIcon channel={c} size={14} /> {channelName[c]}</span>
            <b className="u-tnum">{windowLabel(w.primary, 'Asia/Riyadh', lang)}</b>
            <small className="u-tnum">{t('also', 'أو')} {windowLabel(w.secondary, 'Asia/Riyadh', lang)}{w.days ? ` · ${tx(w.days)}` : ''}</small>
          </li>; })}</ul>
          <p className="cop-muted">{t(`Times are Saudi time${businessZone() !== 'Asia/Riyadh' ? `; in ${businessZone()} the primary window for Instagram is ${windowLabel(POSTING_WINDOWS.instagram.primary, businessZone(), lang)}` : ''}. In Ramadan post after Taraweeh. Your own insights beat these benchmarks.`, `الأوقات بتوقيت السعودية${businessZone() !== 'Asia/Riyadh' ? `؛ وبتوقيت ${businessZone()} أفضل وقت لإنستجرام ${windowLabel(POSTING_WINDOWS.instagram.primary, businessZone(), lang)}` : ''}. في رمضان انشر بعد التراويح. إحصاءات حسابك أدق من هذه المعدلات.`)}</p>
          {hasKit ? <>
            <h4 className="cop-sub"><Hash size={14} /> {t('Hashtags', 'الهاشتاجات')}
              <CopyButton id="tags" text={[...kit!.hashtags.core, ...kit!.hashtags.niche, ...kit!.hashtags.local].join(' ')} state={copyState} /></h4>
            <div className="cop-tags">
              {([['core', t('Brand & course', 'العلامة والدورة')], ['niche', t('Topic', 'التخصص')], ['local', t('Local', 'محلي')]] as const).map(([key, label]) => kit!.hashtags[key].length ? <div key={key}><small>{label}</small><p>{kit!.hashtags[key].map((h) => <button key={h} type="button" onClick={() => copyState.copy(h, h)} className="cop-tag" dir="auto">{copyState.copied === h ? <Check size={11} /> : null}{h}</button>)}</p></div> : null)}
            </div>
            {kit!.keywords.length > 0 && <>
              <h4 className="cop-sub"><Search size={14} /> {t('Search keywords', 'كلمات البحث')} <small>{t('use them in captions, on-screen text and speech', 'استخدمها في النص وعلى الشاشة وفي الكلام')}</small></h4>
              <p className="cop-keywords">{kit!.keywords.map((k) => <span key={k} dir="auto">{k}</span>)}</p>
            </>}
          </> : needKit(t('hashtags', 'هاشتاجات'))}
        </>}
      </div>
      {hasKit && <footer className="cop__foot"><small>{t('Written by', 'كتبها')} {kit!.model} · {Object.values(kit!.skills).join(' · ')}</small></footer>}
    </section>
  );
}
