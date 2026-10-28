import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, Eye, EyeOff, Sparkles, Undo2, Wand2 } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import type { Channel } from '../../domain/shared';
import type { Dialect } from '../../domain/content-voice';
import { analyzeCaption, duplicatedChannels, linksOf, specOf, type CaptionReport, type CaptionSource } from '../../domain/platform-content';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { api, errorMessage } from '../../lib/api';

export type Captions = Partial<Record<Channel, string>>;
/** Where AI help gets its facts: a saved post (the server reads it) or the facts of a post not saved yet. */
export type CaptionAi = { contentId: string } | { facts: string };

const INTENTS = [
  { id: 'hook', en: 'Stronger hook', ar: 'هوك أقوى' },
  { id: 'shorter', en: 'Shorter', ar: 'أقصر' },
  { id: 'cta', en: 'Sharper call to action', ar: 'دعوة أوضح للتسجيل' },
  { id: 'hashtags', en: 'Better hashtags', ar: 'هاشتاجات أفضل' },
  { id: 'friendlier', en: 'Friendlier', ar: 'أودّ وأقرب' },
  { id: 'formal', en: 'More formal', ar: 'أكثر رسمية' },
] as const;

/** Captions of a post the way people read them: hashtags and links stand out. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(#[\p{L}\p{N}_]{2,}|https?:\/\/\S+|www\.\S+)/u).map((part, i) => /^(#|https?:|www\.)/.test(part) ? <span key={i} className={part.startsWith('#') ? 'cap-tag' : 'cap-link'}>{part}</span> : part)}</>;
}

/** The caption as the platform shows it: folded behind "see more" where the platform folds. */
function Preview({ channel, text, report }: { channel: Channel; text: string; report: CaptionReport }) {
  const { t } = useI18n();
  return (
    <figure className="cap-preview" data-channel={channel}>
      <figcaption><ChannelIcon channel={channel} size={13} /> {t('How it reads on the platform', 'كما سيظهر على المنصة')}</figcaption>
      <p dir="auto"><Rich text={report.fold ? report.fold.visible : text} />{report.fold && <> <span className="cap-preview__more">{t('… see more', '… عرض المزيد')}</span></>}</p>
    </figure>
  );
}

/**
 * One caption per platform in one box. A status line says whether it is ready by that platform's rules; one
 * button writes every platform with AI in the chosen dialect, a menu improves the current one, and every AI
 * change can be undone.
 */
export function CaptionsEditor({ channels, value, onChange, readOnly, ai, onBusy, dialect }: {
  channels: Channel[];
  value: Captions;
  onChange: (next: Captions) => void;
  readOnly?: boolean;
  ai?: CaptionAi;
  onBusy?: (busy: boolean) => void;
  /** The register AI writing uses; without it the server writes modern Standard Arabic. */
  dialect?: Dialect;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<Channel>(channels[0]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<Partial<Record<Channel, string[]>>>({});
  const [undo, setUndo] = useState<{ label: string; before: Captions } | null>(null);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [custom, setCustom] = useState('');
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (!channels.includes(active)) setActive(channels[0]); }, [channels, active]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(timer); }, [copied]);
  useEffect(() => { onBusy?.(Boolean(busy)); }, [busy, onBusy]);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const reports = useMemo(() => Object.fromEntries(channels.map((c) => [c, analyzeCaption(c, value[c] ?? '')])) as Record<Channel, CaptionReport>, [channels, value]);
  const duplicates = useMemo(() => duplicatedChannels(value, channels), [value, channels]);
  if (!channels.length || !active) return null;
  const text = value[active] ?? '';
  const report = reports[active];
  const spec = specOf(active);
  const anyText = channels.some((c) => (value[c] ?? '').trim());
  const apply = (patch: Captions, label: string) => { setUndo({ label, before: value }); onChange({ ...value, ...patch }); };

  const issues = [
    ...(warnings[active] ?? []).map((w, i) => ({ id: `f${i}`, level: 'error' as const, text: w })),
    ...(duplicates.includes(active) ? [{ id: 'dup', level: 'warn' as const, text: t('Same text as another platform — adapt it.', 'نفس نص منصة أخرى — كيّفه لهذه المنصة.') }] : []),
    ...report.issues.filter((i) => i.id !== 'empty').map((i) => ({ id: i.id, level: i.level, text: t(i.text.en, i.text.ar) })),
  ];
  const fixable = issues.some((i) => i.level !== 'tip');

  const call = async <T,>(key: string, work: () => Promise<T>) => {
    setBusy(key); setError('');
    try { return await work(); } catch (e) { setError(errorMessage(e, t('Could not reach the AI. Try again.', 'تعذّر الوصول للذكاء الاصطناعي. حاول مرة أخرى.'))); return null; } finally { setBusy(''); }
  };
  const aiWrite = async (targets: Channel[]) => {
    if (!ai) return;
    const result = await call(targets.length > 1 ? 'all' : `write:${targets[0]}`, () => 'contentId' in ai
      ? api<{ captions: Captions; warnings: Record<string, string[]> }>(`/api/content/${ai.contentId}/captions/ai`, { body: { channels: targets, dialect } })
      : api<{ captions: Captions; warnings: Record<string, string[]> }>('/api/ai/captions', { body: { facts: ai.facts, channels: targets, dialect } }));
    if (!result) return;
    apply(result.captions, targets.length > 1 ? t('Wrote every platform', 'كتبت النص لكل المنصات') : t(`Rewrote ${channelName[targets[0]]}`, `أعدت كتابة ${channelName[targets[0]]}`));
    setWarnings((current) => ({ ...current, ...Object.fromEntries(targets.map((c) => [c, result.warnings?.[c] ?? []])) }));
  };
  const aiRefine = async (intent?: (typeof INTENTS)[number]['id'] | 'fix', words?: string) => {
    if (menu.current) menu.current.open = false;
    if (!ai || !text.trim()) return;
    const label = intent === 'fix' ? t('Fixed the issues', 'أصلحت الملاحظات') : intent ? t(INTENTS.find((i) => i.id === intent)!.en, INTENTS.find((i) => i.id === intent)!.ar) : t('Applied your change', 'نفّذت طلبك');
    const body = { ...(intent ? { intent } : { custom: words }) };
    const result = await call(`refine:${intent ?? 'custom'}`, () => 'contentId' in ai
      ? api<{ captions: Captions; warnings: Record<string, string[]> }>(`/api/content/${ai.contentId}/captions/ai`, { body: { dialect, refine: { channel: active, text, ...body } } })
      : api<{ text: string; warnings: string[] }>('/api/ai/captions/refine', { body: { channel: active, text, facts: ai.facts, dialect, ...body } }).then((r) => ({ captions: { [active]: r.text } as Captions, warnings: { [active]: r.warnings } })));
    if (!result) return;
    apply(result.captions, label);
    setWarnings((current) => ({ ...current, [active]: result.warnings?.[active] ?? [] }));
    setCustom('');
  };
  const copy = () => void navigator.clipboard.writeText(text).then(() => setCopied(true), () => setError(t('Copy is blocked in this browser; select the text instead.', 'المتصفح منع النسخ؛ حدّد النص وانسخه يدويًا.')));

  const status = !text.trim() ? null : issues.length === 0
    ? <span className="caps__ok"><CheckCircle2 size={14} /> {t('Ready to post', 'جاهز للنشر')}</span>
    : <button type="button" className="caps__issue" data-level={issues[0].level} onClick={() => setShowIssues((v) => !v)} aria-expanded={showIssues}>
      <AlertTriangle size={14} /> <span>{issues[0].text}</span>{issues.length > 1 && <i>+{issues.length - 1}</i>}
    </button>;

  return (
    <div className="caps" data-readonly={readOnly || undefined} aria-busy={Boolean(busy) || undefined}>
      {channels.length > 1 && (
        <div className="caps__tabs" role="tablist" aria-label={t('Platforms', 'المنصات')}>
          {channels.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={active === c} data-state={reports[c].state} onClick={() => { setActive(c); setShowIssues(false); }}>
              <ChannelIcon channel={c} size={14} /><span>{channelName[c]}</span><i aria-hidden />
            </button>
          ))}
        </div>
      )}

      <div className="caps__box">
        <textarea className="caps__text" dir="auto" rows={active === 'snapchat' || active === 'tiktok' ? 3 : 7} value={text} readOnly={readOnly}
          aria-label={t(`${channelName[active]} caption`, `نص ${channelName[active]}`)}
          placeholder={readOnly ? '' : t(`Write the ${channelName[active]} caption, or press “Write with AI”.`, `اكتب نص ${channelName[active]}، أو اضغط «اكتب بالذكاء».`)}
          onChange={(e) => { onChange({ ...value, [active]: e.target.value }); if (undo) setUndo(null); }} />
        <div className="caps__status">
          <span className="u-tnum" data-over={report.size === 'over' || report.size === 'long' || undefined}>{t(`${report.length} chars`, `${report.length} حرف`)}</span>
          <span className="u-tnum" data-over={report.hashtags > spec.hashtags.max || undefined}>#{report.hashtags}/{spec.hashtags.max}</span>
          <span className="caps__fill" />
          {status}
        </div>
        {showIssues && issues.length > 0 && <ul className="caps__checks">{issues.map((i) => <li key={i.id} data-level={i.level}><AlertTriangle size={13} /> <span dir="auto">{i.text}</span></li>)}</ul>}
      </div>

      <div className="caps__bar">
        {!readOnly && ai && <Button size="sm" variant="primary" icon={<Sparkles size={14} />} busy={busy === 'all' || busy === `write:${active}`} disabled={Boolean(busy)}
          onClick={() => void aiWrite(channels)}>{anyText ? t('Rewrite with AI', 'أعد الكتابة بالذكاء') : t('Write with AI', 'اكتب بالذكاء')}</Button>}
        {!readOnly && ai && text.trim() && fixable && <Button size="sm" variant="subtle" icon={<Wand2 size={14} />} busy={busy === 'refine:fix'} disabled={Boolean(busy)} onClick={() => void aiRefine('fix')}>{t('Fix issues', 'أصلح الملاحظات')}</Button>}
        {!readOnly && ai && text.trim() && (
          <details className="caps__menu" ref={menu}>
            <summary className="ui-btn ui-btn--secondary ui-btn--sm">{busy.startsWith('refine:') && busy !== 'refine:fix' ? <span className="ui-btn__spinner" /> : <Wand2 size={14} />}<span className="ui-btn__label">{t('Improve', 'حسّن')}</span><ChevronDown size={13} /></summary>
            <div className="caps__menu-list" role="menu">
              {INTENTS.map((intent) => <button key={intent.id} type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => void aiRefine(intent.id)}>{t(intent.en, intent.ar)}</button>)}
              {channels.length > 1 && <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => { if (menu.current) menu.current.open = false; void aiWrite([active]); }}>{t(`Rewrite ${channelName[active]} only`, `أعد كتابة ${channelName[active]} فقط`)}</button>}
              <form className="caps__custom" onSubmit={(e) => { e.preventDefault(); if (custom.trim().length >= 3) void aiRefine(undefined, custom.trim()); }}>
                <input dir="auto" value={custom} maxLength={400} disabled={Boolean(busy)} onChange={(e) => setCustom(e.target.value)} placeholder={t('Or say what to change…', 'أو اكتب طلبك… مثلًا: اذكر إن الدورة أونلاين')} aria-label={t('Ask for a change', 'اطلب تعديلًا')} />
                <Button type="submit" size="sm" variant="primary" disabled={custom.trim().length < 3 || Boolean(busy)}>{t('Apply', 'نفّذ')}</Button>
              </form>
            </div>
          </details>
        )}
        <span className="caps__fill" />
        {text.trim() && <button type="button" className="caps__icon" aria-pressed={preview} onClick={() => setPreview((v) => !v)} title={t('Preview', 'معاينة')} aria-label={t('Preview', 'معاينة')}>{preview ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
        {text.trim() && <button type="button" className="caps__icon" onClick={copy} title={t('Copy', 'انسخ')} aria-label={t('Copy', 'انسخ')}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>}
      </div>

      {preview && text.trim() && <Preview channel={active} text={text} report={report} />}
      {error && <p role="alert" className="creative-home__error">{error}</p>}
      {undo && !busy && <p className="caps__undo" role="status"><CheckCircle2 size={14} /> {undo.label}<button type="button" className="ui-link" onClick={() => { onChange(undo.before); setUndo(null); }}><Undo2 size={13} /> {t('Undo', 'تراجع')}</button></p>}
    </div>
  );
}

/** Facts for the free suggestion and the AI, from a post's template or reference fields. */
export function captionSourceFromValues(title: string, values: Record<string, string> = {}): CaptionSource {
  const lines = (text?: string) => (text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const link = Object.values(values).flatMap((v) => linksOf(v))[0];
  const when = Object.entries(values).find(([key, v]) => /date|when|start|موعد|تاريخ/i.test(key) && v.trim())?.[1];
  const points = lines(values.objectives).length ? lines(values.objectives) : lines(values.body);
  return { title: title.trim() || values.title || '', points, audience: values.audience?.trim() || undefined, when: when?.trim(), link, cta: values.cta?.trim() || undefined };
}

/** The same facts as lines of text, for AI help on a post that is not saved yet. */
export function captionFactsFromValues(title: string, values: Record<string, string> = {}, context = ''): string {
  const lines = [`Post title: ${title}`, ...Object.entries(values).filter(([, v]) => v && !v.startsWith('data:') && !v.startsWith('/api/') && v.length < 600).map(([k, v]) => `${k}: ${v.replace(/\s*\n\s*/g, ' | ')}`), ...(context.trim() ? [`Subject: ${context.trim()}`] : [])];
  return lines.join('\n').slice(0, 3000);
}
