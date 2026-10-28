import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DateTime } from 'luxon';
import { AlertTriangle, CalendarDays, Camera, Check, Copy, CornerDownLeft, ExternalLink, Film, Flame, Hash, Layers, Lightbulb, Lock, Mic, RefreshCw, Search, Smartphone, Sparkles, Type, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { Channel } from '../../domain/shared';
import { specOf } from '../../domain/platform-content';
import { DIALECTS, DIALECT_INFO, HOOK_FORMULA_LABEL, SCRIPT_FORMATS, SCRIPT_INFO, type ContentKit, type Dialect, type KitPart, type ScriptFormat } from '../../domain/content-voice';
import { useOverlay } from '../../hooks/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { businessZone } from '../../lib/format';
import { upcomingOccasions } from '../../lib/occasions';
import { CaptionsEditor, type CaptionAssist, type Captions } from './CaptionsEditor';

const PREFS_KEY = 'content-copilot-voice';
interface Prefs { dialect: Dialect; format: ScriptFormat }
function readPrefs(): Prefs {
  try { const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>; return { dialect: DIALECTS.includes(saved.dialect!) ? saved.dialect! : 'saudi', format: SCRIPT_FORMATS.includes(saved.format!) ? saved.format! : 'reel' }; } catch { return { dialect: 'saudi', format: 'reel' }; }
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

function useCopy() {
  const [copied, setCopied] = useState('');
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(''), 1500); return () => clearTimeout(timer); }, [copied]);
  return { copied, copy: (key: string, text: string) => void navigator.clipboard.writeText(text).then(() => setCopied(key), () => {}) };
}

function scriptText(kit: ContentKit) {
  const s = kit.script;
  return [s.title, `${SCRIPT_INFO[s.format].ar} · ${s.seconds}s`, '', ...s.scenes.map((scene) => [`[${scene.t}]`, `🎙️ ${scene.voiceover}`, scene.onScreen ? `🔤 ${scene.onScreen}` : '', `🎥 ${scene.visual}${scene.broll ? ` · ${scene.broll}` : ''}`].filter(Boolean).join('\n')), '', `CTA: ${s.cta}`, `🎵 ${s.audio}`].join('\n');
}

type Sheet = 'script' | 'carousel' | 'stories';

/**
 * The AI layer beside a post, built around its caption: one dialect choice, the caption box, and suggestions
 * that act on the caption (a new opening line, hashtags, an occasion or trend to tie it to). Turning the post
 * into a video script, a carousel or stories is a separate, opt-in action shown in its own sheet.
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
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [kit, setKit] = useState<ContentKit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'' | KitPart | 'trends'>('');
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);

  useEffect(() => {
    let live = true;
    api<{ kit: ContentKit | null }>(`/api/content/${contentId}/kit`).then((r) => { if (live) setKit(r.kit); }).catch(() => {}).finally(() => live && setLoaded(true));
    return () => { live = false; };
  }, [contentId]);
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ } }, [prefs]);

  const write = async (part: KitPart) => {
    setBusy(part); setError('');
    try { const r = await api<{ kit: ContentKit }>(`/api/content/${contentId}/kit`, { body: { part, dialect: prefs.dialect, format: prefs.format } }); setKit(r.kit); }
    catch (e) { setError(errorMessage(e, t('Could not write it. Try again.', 'تعذّرت الكتابة. حاول مرة أخرى.'))); }
    setBusy('');
  };
  const scan = async () => {
    setBusy('trends'); setError('');
    try { const r = await api<{ kit: ContentKit }>(`/api/content/${contentId}/kit/trends`, { body: {} }); setKit(r.kit); }
    catch (e) { setError(errorMessage(e, t('Trend search failed. Try again.', 'تعذّر البحث عن التريند. حاول مرة أخرى.'))); }
    setBusy('');
  };
  const open = (next: Sheet) => {
    setSheet(next);
    const part: KitPart = next === 'script' ? 'script' : 'carousel';
    const has = part === 'script' ? Boolean(kit?.script.scenes.length) : Boolean(kit?.carousel.length);
    if (!has && !busy) void write(part);
  };

  return (
    <section className="cop glass" aria-label={t('Post caption', 'نص المنشور')}>
      <header className="cop__head">
        <span className="cop__badge"><Sparkles size={15} /></span>
        <div><h3>{t('Post caption', 'نص المنشور')}</h3><small>{t('What people read with the design, written for each platform', 'النص اللي هيتنشر مع التصميم، مكتوب لكل منصة')}</small></div>
      </header>

      <DialectPicker value={prefs.dialect} onChange={(dialect) => setPrefs((p) => ({ ...p, dialect }))} />
      {!editable && <p className="cop-locked"><Lock size={14} /> <span>{t('This post is approved, so its caption is locked. To change it, use “Request changes” in Next step. You can still copy suggestions.', 'المنشور معتمد، فالنص مقفول. لتغييره اطلب تعديلًا من «الخطوة التالية». تقدر تنسخ الاقتراحات.')}</span></p>}

      <CaptionsEditor channels={channels} value={captions} onChange={onCaptions} readOnly={!editable} dialect={prefs.dialect} ai={editable ? { contentId } : undefined}
        assist={(a) => <Suggestions api={a} kit={kit} loaded={loaded} busy={busy} onIdeas={() => void write('ideas')} onScan={() => void scan()} />} />
      {footer}
      {error && <p role="alert" className="creative-home__error">{error}</p>}

      <div className="cop-repurpose">
        <span>{t('Turn this post into', 'حوّل البوست لـ')}</span>
        <button type="button" onClick={() => open('stories')}><Smartphone size={15} /> {t('Stories', 'ستوري')}</button>
      </div>

      {sheet && <RepurposeSheet sheet={sheet} kit={kit} busy={busy} format={prefs.format} onFormat={(format) => setPrefs((p) => ({ ...p, format }))}
        onWrite={(part) => void write(part)} onSwitch={setSheet} onClose={() => setSheet(null)} />}
    </section>
  );
}

/** Suggestions under the caption: each one changes the caption (with undo), or is copied when the post is locked. */
function Suggestions({ api: a, kit, loaded, busy, onIdeas, onScan }: { api: CaptionAssist; kit: ContentKit | null; loaded: boolean; busy: string; onIdeas: () => void; onScan: () => void }) {
  const { t, lang, relative } = useI18n();
  const copyState = useCopy();
  const occasions = useMemo(() => upcomingOccasions(DateTime.now().setZone(businessZone()).toISODate() ?? '', 30, 4), []);
  const hasIdeas = Boolean(kit?.generatedAt && kit.hooks.length);
  const spec = specOf(a.channel);
  const allTags = kit ? [...kit.hashtags.core, ...kit.hashtags.niche, ...kit.hashtags.local] : [];
  const used = allTags.filter((tag) => a.hasTag(tag)).length;
  const links = [
    ...(kit?.occasions ?? []).map((o) => ({ key: `o:${o.day}`, icon: CalendarDays, label: o.name, sub: DateTime.fromISO(o.day).setLocale(lang === 'ar' ? 'ar' : 'en').toFormat('d LLL'), request: `اربط النص بمناسبة «${o.name}» (${o.day}) بشكل طبيعي ومحترم: ${o.idea}. حافظ على باقي الحقائق والهاشتاجات.` })),
    ...(kit?.trends?.items ?? []).filter((tr) => tr.fit >= 60).map((tr) => ({ key: `t:${tr.title}`, icon: Flame, label: tr.title, sub: `${tr.fit}%`, request: `اربط النص بالتريند «${tr.title}»: ${tr.howToUse}. بدون مبالغة، وحافظ على باقي الحقائق.` })),
  ];
  const idle = !a.editable || a.busy || Boolean(busy);

  if (!hasIdeas) return (
    <div className="sug sug--empty">
      <div><b><Sparkles size={14} /> {t('Suggestions for this caption', 'اقتراحات للنص')}</b>
        <small>{t('Alternative opening lines, hashtags that fit, and occasions to tie it to.', 'افتتاحيات بديلة، وهاشتاجات مناسبة، ومناسبات تربطه بيها.')}{occasions.length ? ` ${t('Coming up:', 'قريبًا:')} ${occasions.slice(0, 2).map((o) => o.name).join('، ')}` : ''}</small></div>
      <Button size="sm" variant="secondary" icon={<Lightbulb size={14} />} busy={busy === 'ideas'} disabled={!loaded || Boolean(busy)} onClick={onIdeas}>{t('Suggest', 'اقترح')}</Button>
    </div>
  );

  return (
    <div className="sug" aria-busy={busy === 'ideas' || undefined}>
      <div className="sug__head">
        <b><Sparkles size={14} /> {t('Suggestions for this caption', 'اقتراحات للنص')}</b>
        <small>{t(`${relative(kit!.generatedAt)} · ${DIALECT_INFO[kit!.dialect].en}`, `${relative(kit!.generatedAt)} · ${DIALECT_INFO[kit!.dialect].ar}`)}</small>
        <button type="button" className="sug__refresh" disabled={Boolean(busy)} onClick={onIdeas} title={t('New suggestions', 'اقتراحات جديدة')} aria-label={t('New suggestions', 'اقتراحات جديدة')}>{busy === 'ideas' ? <span className="ui-btn__spinner" /> : <RefreshCw size={14} />}</button>
      </div>
      {kit!.angle.idea && <p className="sug__angle"><Lightbulb size={13} /> <span dir="auto">{kit!.angle.idea}</span></p>}
      {kit!.warnings.length > 0 && <p className="sug__warn"><AlertTriangle size={13} /> <span dir="auto">{kit!.warnings[0]}</span></p>}

      <h5>{t('Opening line', 'افتتاحية بديلة')} <small>{t('replaces the first line, shown before “see more”', 'تستبدل أول سطر، اللي بيظهر قبل «عرض المزيد»')}</small></h5>
      <ul className="sug__hooks">{kit!.hooks.slice(0, 5).map((h, i) => (
        <li key={i}>
          <button type="button" disabled={a.editable && idle} onClick={() => a.editable ? a.useOpening(h.text) : copyState.copy(`h${i}`, h.text)} title={a.editable ? t('Use as the opening line', 'استخدمها كأول سطر') : t('Copy', 'انسخ')}>
            <span dir="auto">{h.text}</span>
            <i className="cop-chip">{lang === 'ar' ? HOOK_FORMULA_LABEL[h.formula]?.ar : HOOK_FORMULA_LABEL[h.formula]?.en}</i>
            <em>{a.editable ? <><CornerDownLeft size={13} /> {t('Use', 'استخدم')}</> : copyState.copied === `h${i}` ? <Check size={13} /> : <Copy size={13} />}</em>
          </button>
        </li>
      ))}</ul>

      {allTags.length > 0 && <>
        <h5><Hash size={13} /> {t('Hashtags', 'هاشتاجات')} <small className="u-tnum">{t(`${used} in the caption · ${spec.hashtags.max} at most here`, `${used} في النص · الحد ${spec.hashtags.max} هنا`)}</small></h5>
        <div className="sug__tags">{allTags.map((tag) => {
          const on = a.hasTag(tag);
          return <button key={tag} type="button" aria-pressed={on} disabled={a.editable && (idle || (!on && spec.hashtags.max === 0))} dir="auto"
            onClick={() => a.editable ? a.toggleTag(tag) : copyState.copy(tag, tag)}>{on ? <Check size={11} /> : '+'} {tag}</button>;
        })}</div>
      </>}

      <h5><CalendarDays size={13} /> {t('Tie it to an occasion or trend', 'اربطه بمناسبة أو تريند')}</h5>
      <div className="sug__links">
        {links.map((l) => <button key={l.key} type="button" disabled={!a.editable || idle} onClick={() => a.ask(l.request, t(`Tied to ${l.label}`, `ربطته بـ ${l.label}`))} title={l.request}>
          <l.icon size={13} /> <span dir="auto">{l.label}</span> <small className="u-tnum">{l.sub}</small>
        </button>)}
        <button type="button" className="sug__scan" disabled={Boolean(busy)} onClick={onScan}>{busy === 'trends' ? <span className="ui-btn__spinner" /> : <Search size={13} />} {kit?.trends ? t('Search trends again', 'ابحث عن التريند تاني') : t('Find today’s trends in KSA', 'دوّر على تريند السعودية النهارده')}</button>
      </div>
      {!links.length && <p className="sug__muted">{t('No fitting occasion in the next 45 days. Search for a trend.', 'مفيش مناسبة مناسبة خلال ٤٥ يوم. دوّر على تريند.')}</p>}
      {kit?.trends?.sources.length ? <details className="cop-sources"><summary>{t(`Trend sources (${kit.trends.sources.length}) · ${relative(kit.trends.scannedAt)}`, `مصادر التريند (${kit.trends.sources.length}) · ${relative(kit.trends.scannedAt)}`)}</summary>
        <ul>{kit.trends.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" dir="auto">{s.title} <ExternalLink size={11} /></a></li>)}</ul>
      </details> : null}
    </div>
  );
}

/** Video script, carousel or stories made from the post, in a sheet over the drawer. */
function RepurposeSheet({ sheet, kit, busy, format, onFormat, onWrite, onSwitch, onClose }: {
  sheet: Sheet; kit: ContentKit | null; busy: string; format: ScriptFormat;
  onFormat: (next: ScriptFormat) => void; onWrite: (part: KitPart) => void; onSwitch: (next: Sheet) => void; onClose: () => void;
}) {
  const { t, tx } = useI18n();
  const copyState = useCopy();
  const overlay = useOverlay(true, onClose);
  const part: KitPart = sheet === 'script' ? 'script' : 'carousel';
  const writing = busy === part;
  const script = kit?.script;
  const hasScript = Boolean(script?.scenes.length);
  const TITLES: Record<Sheet, [string, string]> = { script: ['Short video script', 'سكربت فيديو قصير'], carousel: ['Carousel', 'كاروسيل'], stories: ['Stories', 'ستوري'] };

  return createPortal(
    <div className="cop-sheet" role="dialog" aria-modal="true" aria-label={t(...TITLES[sheet])}>
      <div className="cop-sheet__scrim" onClick={onClose} />
      <div className="cop-sheet__panel glass" ref={overlay} tabIndex={-1} data-overlay>
        <header className="cop-sheet__head">
          <div className="cop-sheet__switch" role="tablist">
            {(['stories'] as Sheet[]).map((s) => <button key={s} type="button" role="tab" aria-selected={sheet === s} onClick={() => onSwitch(s)}>{s === 'script' ? <Film size={14} /> : s === 'carousel' ? <Layers size={14} /> : <Smartphone size={14} />} {t(...TITLES[s])}</button>)}
          </div>
          <button type="button" className="content-drawer__close" onClick={onClose} aria-label={t('Close', 'إغلاق')}><X size={18} /></button>
        </header>

        <div className="cop-sheet__body">
          {writing && <p className="cop-sheet__writing" role="status"><span className="ui-btn__spinner" /> {sheet === 'script' ? t('Writing the script…', 'بنكتب السكربت…') : t('Writing the slides and stories…', 'بنكتب الشرائح والستوري…')}</p>}

          {sheet === 'script' && <>
            <div className="cop-sheet__tools">
              <label className="cop-select"><span>{t('Format', 'النوع')}</span>
                <select value={format} onChange={(e) => onFormat(e.target.value as ScriptFormat)}>{SCRIPT_FORMATS.map((v) => <option key={v} value={v}>{tx(SCRIPT_INFO[v])} · {SCRIPT_INFO[v].seconds}{t('s', 'ث')}</option>)}</select>
              </label>
              <Button size="sm" variant={hasScript && script!.format === format ? 'ghost' : 'primary'} icon={<RefreshCw size={14} />} busy={writing} disabled={Boolean(busy)} onClick={() => onWrite('script')}>{hasScript ? t('Rewrite', 'أعد الكتابة') : t('Write', 'اكتب')}</Button>
              {hasScript && <Button size="sm" variant="secondary" icon={copyState.copied === 'script' ? <Check size={14} /> : <Copy size={14} />} onClick={() => copyState.copy('script', scriptText(kit!))}>{copyState.copied === 'script' ? t('Copied', 'تم النسخ') : t('Copy', 'انسخ')}</Button>}
            </div>
            {hasScript && <>
              <p className="cop-script__title"><b dir="auto">{script!.title}</b> <small>· {tx(SCRIPT_INFO[script!.format])} · {t('cover', 'الغلاف')}: <span dir="auto">«{script!.cover}»</span></small></p>
              <ol className="cop-scenes">{script!.scenes.map((s, i) => <li key={i}>
                <span className="cop-scenes__t u-tnum">{s.t}</span>
                <div className="cop-scenes__body">
                  <p className="cop-scenes__vo"><Mic size={13} /> <span dir="auto">{s.voiceover}</span></p>
                  {s.onScreen && <p className="cop-scenes__os"><Type size={13} /> <span dir="auto">{s.onScreen}</span></p>}
                  <p><Camera size={13} /> <span dir="auto">{s.visual}{s.broll ? ` · ${s.broll}` : ''}</span></p>
                </div>
              </li>)}</ol>
              <div className="cop-script__foot"><span><b>CTA</b> <span dir="auto">{script!.cta}</span></span><span>🎵 <span dir="auto">{script!.audio}</span></span></div>
            </>}
          </>}

          {sheet === 'carousel' && kit && kit.carousel.length > 0 && <>
            <div className="cop-sheet__tools"><span className="cop-muted">{t(`${kit.carousel.length} slides · one idea each`, `${kit.carousel.length} شرائح · فكرة في كل شريحة`)}</span>
              <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} busy={writing} disabled={Boolean(busy)} onClick={() => onWrite('carousel')}>{t('Rewrite', 'أعد الكتابة')}</Button>
              <Button size="sm" variant="secondary" icon={copyState.copied === 'carousel' ? <Check size={14} /> : <Copy size={14} />} onClick={() => copyState.copy('carousel', kit.carousel.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`).join('\n\n'))}>{t('Copy', 'انسخ')}</Button></div>
            <div className="cop-slides">{kit.carousel.map((s, i) => <article key={i} data-first={i === 0 || undefined} data-last={i === kit.carousel.length - 1 || undefined}>
              <span className="u-tnum">{i + 1}/{kit.carousel.length}</span><b dir="auto">{s.title}</b><p dir="auto">{s.body}</p>
            </article>)}</div>
          </>}

          {sheet === 'stories' && kit && kit.stories.length > 0 && <>
            <div className="cop-sheet__tools"><span className="cop-muted">{t(`${kit.stories.length} frames`, `${kit.stories.length} إطارات`)}</span>
              <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} busy={writing} disabled={Boolean(busy)} onClick={() => onWrite('carousel')}>{t('Rewrite', 'أعد الكتابة')}</Button>
              <Button size="sm" variant="secondary" icon={copyState.copied === 'stories' ? <Check size={14} /> : <Copy size={14} />} onClick={() => copyState.copy('stories', kit.stories.map((s, i) => `${i + 1}. ${s.frame}${s.sticker ? ` (${s.sticker})` : ''}`).join('\n'))}>{t('Copy', 'انسخ')}</Button></div>
            <div className="cop-stories">{kit.stories.map((s, i) => <article key={i}><span className="u-tnum">{i + 1}</span><p dir="auto">{s.frame}</p>{s.sticker && <small dir="auto">✦ {s.sticker}</small>}</article>)}</div>
          </>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
