import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, Info, Link2, Sparkles, Undo2, Wand2, XCircle } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import type { Channel } from '../../domain/shared';
import type { Dialect } from '../../domain/content-voice';
import { adaptCaption, analyzeCaption, composeCaption, duplicatedChannels, linksOf, specOf, type CaptionReport, type CaptionSource } from '../../domain/platform-content';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { api, errorMessage } from '../../lib/api';

export type Captions = Partial<Record<Channel, string>>;
/** Where AI help gets its facts: a saved post (the server reads it) or the facts of a post not saved yet. */
export type CaptionAi = { contentId: string } | { facts: string };

const INTENTS = [
  { id: 'shorter', en: 'Shorter', ar: 'أقصر' },
  { id: 'hook', en: 'Stronger hook', ar: 'هوك أقوى' },
  { id: 'hashtags', en: 'Fix hashtags', ar: 'ضبط الهاشتاجات' },
  { id: 'cta', en: 'Sharper call to action', ar: 'دعوة أوضح' },
  { id: 'friendlier', en: 'Friendlier', ar: 'أودّ' },
  { id: 'formal', en: 'More formal', ar: 'أكثر رسمية' },
] as const;

/** Captions of a post the way people read them: hashtags and links stand out. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(#[\p{L}\p{N}_]{2,}|https?:\/\/\S+|www\.\S+)/u).map((part, i) => /^(#|https?:|www\.)/.test(part) ? <span key={i} className={part.startsWith('#') ? 'cap-tag' : 'cap-link'}>{part}</span> : part)}</>;
}

/** Length against what works on the platform: the good range, the fold, and the hard limit. */
function Meter({ channel, report }: { channel: Channel; report: CaptionReport }) {
  const { t } = useI18n();
  const spec = specOf(channel);
  const scale = Math.max(spec.ideal.max * 1.6, report.length, 1);
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  return (
    <div className="cap-meter" data-size={report.size}>
      <div className="cap-meter__track" role="img" aria-label={t(`${report.length} characters; best between ${spec.ideal.min} and ${spec.ideal.max}`, `${report.length} حرفًا؛ الأنسب بين ${spec.ideal.min} و${spec.ideal.max}`)}>
        <span className="cap-meter__ideal" style={{ insetInlineStart: pct(spec.ideal.min), width: `calc(${pct(spec.ideal.max)} - ${pct(spec.ideal.min)})` }} />
        {spec.fold && spec.fold < scale && <span className="cap-meter__fold" style={{ insetInlineStart: pct(spec.fold) }} title={t('“See more” cuts here', 'هنا يُقطع النص قبل «عرض المزيد»')} />}
        <span className="cap-meter__fill" style={{ width: pct(report.length) }} />
      </div>
      <div className="cap-meter__legend u-tnum">
        <b>{report.length}</b>
        <span>{t(`best ${spec.ideal.min}–${spec.ideal.max}`, `الأنسب ${spec.ideal.min}–${spec.ideal.max}`)}</span>
        <span>{t(`limit ${spec.limit}`, `الحد ${spec.limit}`)}</span>
      </div>
    </div>
  );
}

/** The caption as the platform shows it: folded behind "see more" where the platform folds. */
function Preview({ channel, text, report }: { channel: Channel; text: string; report: CaptionReport }) {
  const { t } = useI18n();
  if (!text.trim()) return null;
  return (
    <figure className="cap-preview" data-channel={channel}>
      <figcaption><ChannelIcon channel={channel} size={13} /> {t('How it reads', 'كما سيظهر')}</figcaption>
      <p dir="auto"><Rich text={report.fold ? report.fold.visible : text} />{report.fold && <> <span className="cap-preview__more">{t('… see more', '… عرض المزيد')}</span></>}</p>
      {report.fold && <details>
        <summary>{t('What people only see after “see more”', 'ما يظهر بعد «عرض المزيد» فقط')}</summary>
        <p dir="auto" className="cap-preview__hidden"><Rich text={report.fold.hidden} /></p>
      </details>}
    </figure>
  );
}

const ICON = { error: XCircle, warn: AlertTriangle, tip: Info } as const;

/**
 * One caption per platform, each judged by that platform's own rules. Counters, the "see more" preview and
 * checks tell what is wrong; the free adapter and the AI actions fix it; everything can be undone.
 */
export function CaptionsEditor({ channels, value, onChange, readOnly, source, ai, onBusy, dialect }: {
  channels: Channel[];
  value: Captions;
  onChange: (next: Captions) => void;
  readOnly?: boolean;
  /** Verified facts for the free suggestion; without it only adapting from another platform is offered. */
  source?: CaptionSource;
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
  const [copied, setCopied] = useState<Channel | null>(null);
  const [custom, setCustom] = useState('');
  useEffect(() => { if (!channels.includes(active)) setActive(channels[0]); }, [channels, active]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(null), 1600); return () => clearTimeout(timer); }, [copied]);
  useEffect(() => { onBusy?.(Boolean(busy)); }, [busy, onBusy]);

  const reports = useMemo(() => Object.fromEntries(channels.map((c) => [c, analyzeCaption(c, value[c] ?? '')])) as Record<Channel, CaptionReport>, [channels, value]);
  const duplicates = useMemo(() => duplicatedChannels(value, channels), [value, channels]);
  if (!channels.length || !active) return null;
  const text = value[active] ?? '';
  const report = reports[active];
  const spec = specOf(active);
  const ready = channels.filter((c) => reports[c].state === 'ok').length;
  const others = channels.filter((c) => c !== active && (value[c] ?? '').trim());
  const set = (channel: Channel, next: string) => onChange({ ...value, [channel]: next });
  const apply = (patch: Captions, label: string) => { setUndo({ label, before: value }); onChange({ ...value, ...patch }); };

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
    apply(result.captions, targets.length > 1 ? t('Wrote every platform', 'كتبت كل المنصات') : t(`Wrote ${channelName[targets[0]]}`, `كتبت ${channelName[targets[0]]}`));
    setWarnings((current) => ({ ...current, ...Object.fromEntries(targets.map((c) => [c, result.warnings?.[c] ?? []])) }));
  };
  const aiRefine = async (intent?: (typeof INTENTS)[number]['id'] | 'fix', words?: string) => {
    if (!ai || !text.trim()) return;
    const label = intent ? t(INTENTS.find((i) => i.id === intent)?.en ?? 'Fixed the issues', INTENTS.find((i) => i.id === intent)?.ar ?? 'أصلحت الملاحظات') : t('Applied your change', 'نفّذت طلبك');
    const body = { ...(intent ? { intent } : { custom: words }) };
    const result = await call(`refine:${intent ?? 'custom'}`, () => 'contentId' in ai
      ? api<{ captions: Captions; warnings: Record<string, string[]> }>(`/api/content/${ai.contentId}/captions/ai`, { body: { dialect, refine: { channel: active, text, ...body } } })
      : api<{ text: string; warnings: string[] }>('/api/ai/captions/refine', { body: { channel: active, text, facts: ai.facts, dialect, ...body } }).then((r) => ({ captions: { [active]: r.text } as Captions, warnings: { [active]: r.warnings } })));
    if (!result) return;
    apply(result.captions, label);
    setWarnings((current) => ({ ...current, [active]: result.warnings?.[active] ?? [] }));
    setCustom('');
  };
  const copy = () => void navigator.clipboard.writeText(text).then(() => setCopied(active), () => setError(t('Copy is blocked in this browser; select the text instead.', 'المتصفح منع النسخ؛ حدّد النص وانسخه يدويًا.')));

  return (
    <div className="caps" data-readonly={readOnly || undefined}>
      <div className="caps__head">
        <span className="caps__summary"><CheckCircle2 size={14} /> {t(`${ready} of ${channels.length} ready`, `${ready} من ${channels.length} جاهزة`)}</span>
        {!readOnly && channels.length > 1 && (ai || source) && (
          <Button size="sm" variant="subtle" icon={<Sparkles size={14} />} busy={busy === 'all'} disabled={Boolean(busy)}
            onClick={() => ai ? void aiWrite(channels) : apply(Object.fromEntries(channels.map((c) => [c, composeCaption(c, source!)])), t('Suggested every platform', 'اقترحت كل المنصات'))}>{t('Write every platform', 'اكتب كل المنصات')}</Button>
        )}
      </div>

      <div className="caps__tabs" role="tablist" aria-label={t('Platforms', 'المنصات')}>
        {channels.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={active === c} data-state={reports[c].state} onClick={() => setActive(c)}>
            <ChannelIcon channel={c} size={14} /><span>{channelName[c]}</span><i aria-hidden />
          </button>
        ))}
      </div>

      <div className="caps__panel" role="tabpanel">
        <p className="caps__rule"><Info size={13} /> {t(spec.structure.en, spec.structure.ar)}</p>
        <textarea className="caps__text" dir="auto" rows={active === 'snapchat' || active === 'tiktok' ? 3 : 6} value={text} readOnly={readOnly} aria-label={t(`${channelName[active]} caption`, `نص ${channelName[active]}`)}
          placeholder={readOnly ? '' : t('Write the caption, or let the suggestion start it for you.', 'اكتب النص، أو اطلب اقتراحًا يبدأ لك.')}
          onChange={(e) => { set(active, e.target.value); if (undo) setUndo(null); }} />

        {text.trim() ? <>
          <Meter channel={active} report={report} />
          <div className="caps__chips">
            <span data-warn={report.hashtags > spec.hashtags.max || undefined}>#{report.hashtags} <small>{t('hashtags', 'هاشتاج')}</small></span>
            {report.links.length > 0 && <span data-warn={spec.links === 'inert' || undefined}><Link2 size={12} /> {report.links.length} <small>{spec.links === 'inert' ? t('links (not tappable here)', 'روابط (لا تُفتح هنا)') : t('link', 'رابط')}</small></span>}
          </div>
          {(report.issues.length > 0 || duplicates.includes(active) || (warnings[active] ?? []).length > 0) && (
            <ul className="caps__checks" aria-label={t('Checks', 'الملاحظات')}>
              {(warnings[active] ?? []).map((w, i) => <li key={`f${i}`} data-level="error"><AlertTriangle size={14} /> <span dir="auto">{w}</span></li>)}
              {duplicates.includes(active) && <li data-level="warn"><AlertTriangle size={14} /> <span>{t('The same text is on another platform. Adapt it to this one.', 'نفس النص موجود في منصة أخرى. كيّفه لهذه المنصة.')}</span></li>}
              {report.issues.map((issue) => { const Icon = ICON[issue.level]; return <li key={issue.id} data-level={issue.level}><Icon size={14} /> <span>{t(issue.text.en, issue.text.ar)}</span></li>; })}
            </ul>
          )}
          <Preview channel={active} text={text} report={report} />
        </> : <p className="caps__empty">{t('Nothing written for this platform yet.', 'لم يُكتب شيء لهذه المنصة بعد.')}</p>}

        {!readOnly && (
          <div className="caps__tools">
            <div className="caps__row">
              {ai && <Button size="sm" variant={text.trim() ? 'secondary' : 'primary'} icon={<Sparkles size={14} />} busy={busy === `write:${active}`} disabled={Boolean(busy)} onClick={() => void aiWrite([active])}>{text.trim() ? t('Rewrite with AI', 'أعد كتابته بالذكاء') : t('Write with AI', 'اكتب بالذكاء')}</Button>}
              {source && <Button size="sm" variant="secondary" icon={<Wand2 size={14} />} disabled={Boolean(busy)} onClick={() => apply({ [active]: composeCaption(active, source) }, t(`Suggested ${channelName[active]}`, `اقترحت ${channelName[active]}`))}>{t('Free suggestion', 'اقتراح مجاني')}</Button>}
              {others.length > 0 && (
                <label className="caps__adapt"><span>{t('Adapt from', 'كيّف من')}</span>
                  <select value="" disabled={Boolean(busy)} onChange={(e) => { const from = e.target.value as Channel; if (from) apply({ [active]: adaptCaption(value[from] ?? '', active, { link: source?.link ?? linksOf(value[from] ?? '')[0] }) }, t(`Adapted from ${channelName[from]}`, `كيّفتها من ${channelName[from]}`)); }}>
                    <option value="">{t('Choose a platform…', 'اختر منصة…')}</option>
                    {others.map((c) => <option key={c} value={c}>{channelName[c]}</option>)}
                  </select><ChevronDown size={13} aria-hidden />
                </label>
              )}
              <Button size="sm" variant="ghost" icon={copied === active ? <Check size={14} /> : <Copy size={14} />} disabled={!text.trim()} onClick={copy}>{copied === active ? t('Copied', 'تم النسخ') : t('Copy', 'انسخ')}</Button>
            </div>
            {ai && text.trim() && (
              <div className="caps__improve">
                <span className="caps__improve-label">{t('Improve', 'حسّن')}</span>
                {report.issues.some((i) => i.level !== 'tip') && <button type="button" className="caps__fix" disabled={Boolean(busy)} onClick={() => void aiRefine('fix')}>{busy === 'refine:fix' ? <span className="ui-btn__spinner" /> : <Sparkles size={12} />} {t('Fix the issues', 'أصلح الملاحظات')}</button>}
                {INTENTS.map((intent) => <button key={intent.id} type="button" disabled={Boolean(busy)} onClick={() => void aiRefine(intent.id)}>{busy === `refine:${intent.id}` && <span className="ui-btn__spinner" />}{t(intent.en, intent.ar)}</button>)}
                <form className="caps__custom" onSubmit={(e) => { e.preventDefault(); if (custom.trim().length >= 3) void aiRefine(undefined, custom.trim()); }}>
                  <input dir="auto" value={custom} maxLength={400} disabled={Boolean(busy)} onChange={(e) => setCustom(e.target.value)} placeholder={t('Or say what to change…', 'أو اكتب ما تريد تغييره…')} aria-label={t('Ask for a change', 'اطلب تعديلًا')} />
                  <Button type="submit" size="sm" variant="secondary" disabled={custom.trim().length < 3 || Boolean(busy)} busy={busy === 'refine:custom'}>{t('Apply', 'نفّذ')}</Button>
                </form>
              </div>
            )}
          </div>
        )}
        {readOnly && text.trim() && <div className="caps__row"><Button size="sm" variant="ghost" icon={copied === active ? <Check size={14} /> : <Copy size={14} />} onClick={copy}>{copied === active ? t('Copied', 'تم النسخ') : t('Copy', 'انسخ')}</Button></div>}
        {error && <p role="alert" className="creative-home__error">{error}</p>}
        {undo && !busy && <p className="caps__undo" role="status"><CheckCircle2 size={14} /> {undo.label}<button type="button" className="ui-link" onClick={() => { onChange(undo.before); setUndo(null); }}><Undo2 size={13} /> {t('Undo', 'تراجع')}</button></p>}
      </div>
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
