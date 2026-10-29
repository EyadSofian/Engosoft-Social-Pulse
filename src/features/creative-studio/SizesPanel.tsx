import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Loader2, Maximize2, Sparkles, X } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import { PUBLISHING_PRESETS, shapeOf, type PublishingPreset } from '../../domain/output-presets';
import { CHANNELS } from '../../domain/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { channelName } from '../../i18n/labels';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import type { PipelineDetail } from '../content-pipeline/types';

/** Which AI path rebuilds this post's design at another size: the pipeline that made it, or a recreation from the finished image. */
type Source = { kind: 'full'; requestId: string; directionId: string } | { kind: 'reference'; templateId: string; values: Record<string, string> } | { kind: 'fixed' };

function sourceOf(item: PipelineDetail): Source {
  const creative = item.creative!;
  if (creative.requestId === 'reference-design' && creative.svgTemplate) return { kind: 'reference', templateId: creative.svgTemplate.id, values: creative.svgTemplate.values };
  const base = creative.directionId.match(/^d\d/)?.[0];
  if (/^[0-9a-f-]{36}$/.test(creative.requestId) && base) return { kind: 'full', requestId: creative.requestId, directionId: base };
  return { kind: 'fixed' };
}

async function poll<T>(url: string, done: (job: T) => string | null, failed: (job: T) => string | null): Promise<string> {
  for (;;) {
    const job = await api<T>(url);
    const result = done(job);
    if (result) return result;
    const error = failed(job);
    if (error) throw new Error(error);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

const SHAPE_LABEL = { vertical: ['Vertical', 'عمودي'], portrait: ['Portrait', 'طولي'], square: ['Square', 'مربع'], landscape: ['Landscape', 'عرضي'], banner: ['Banner', 'بانر'] } as const;

/**
 * Every publishing size of the post's platforms, from one design. Each size is designed again at its own
 * dimensions by AI: AI designs and AI templates by the pipeline that made them, templates, uploads and studio
 * edits by recreating the finished design for the new shape. Sizes are saved on the post and downloaded here.
 */
export function SizesPanel({ item, onChanged }: { item: PipelineDetail; onChanged: () => void }) {
  const { t, tx } = useI18n();
  const { can } = useAuth();
  const [all, setAll] = useState(false);
  const [working, setWorking] = useState<Record<string, true>>({});
  const [queue, setQueue] = useState<PublishingPreset[]>([]);
  const [error, setError] = useState('');
  const [main, setMain] = useState<{ width: number; height: number } | null>(null);
  const creative = item.creative;
  useEffect(() => {
    if (!creative?.imageUrl) return;
    const image = new Image();
    image.onload = () => setMain({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = creative.imageUrl;
  }, [creative?.imageUrl]);
  const source = useMemo(() => (creative ? sourceOf(item) : { kind: 'fixed' as const }), [item, creative]);
  const aiAllowed = source.kind === 'full' ? can('design.free') : can('content.create');

  /** A size this post already has: saved, the main design itself, or one of the existing publishing slots. */
  const ready = (preset: PublishingPreset): { url: string; main?: boolean } | null => {
    if (!creative) return null;
    if (creative.sizes?.[preset.id]) return { url: creative.sizes[preset.id] };
    if (main && main.width === preset.width && main.height === preset.height) return { url: creative.imageUrl, main: true };
    if (preset.format === 'story' && creative.storyUrl) return { url: creative.storyUrl };
    if ((preset.id === 'website-banner' || preset.id === 'facebook-link') && creative.landscapeUrl) return { url: creative.landscapeUrl };
    if (preset.id === 'youtube-thumbnail-hd' && creative.youtubeUrl) return { url: creative.youtubeUrl };
    return null;
  };

  const make = async (preset: PublishingPreset) => {
    if (!creative) return;
    setWorking((state) => ({ ...state, [preset.id]: true }));
    setError('');
    type ReferenceJob = { status: string; error?: string; result?: { imageUrl: string } };
    const referenceDone = (job: ReferenceJob) => (job.status === 'done' ? job.result?.imageUrl ?? null : null);
    const referenceFailed = (job: ReferenceJob) => (job.status === 'failed' ? job.error ?? t('Could not make this size.', 'تعذّر تجهيز المقاس.') : null);
    try {
      let url: string;
      if (source.kind === 'full') {
        const { jobId } = await api<{ jobId: string }>(`/api/ai/full-creative/${source.requestId}/adapt`, { body: { directionId: source.directionId, format: preset.id, contentId: item.id } });
        const key = `${source.directionId}-${preset.id}`;
        url = await poll<{ status: string; error?: string; run?: { results: { directionId: string; imageUrl?: string }[] } }>(`/api/ai/jobs/${jobId}`,
          (job) => job.status === 'done' ? [...(job.run?.results ?? [])].reverse().find((r) => r.directionId === key)?.imageUrl ?? null : null,
          (job) => job.status === 'failed' ? job.error ?? t('Could not make this size.', 'تعذّر تجهيز المقاس.') : job.status === 'done' ? t('The design came back without an image; try again.', 'رجع التصميم من غير صورة؛ حاول تاني.') : null);
      } else if (source.kind === 'reference') {
        const { jobId } = await api<{ jobId: string }>(`/api/svg-templates/${source.templateId}/adapt`, { body: { imageUrl: creative.imageUrl, values: source.values, outputPreset: preset.id } });
        url = await poll<ReferenceJob>(`/api/reference-design/jobs/${jobId}`, referenceDone, referenceFailed);
      } else {
        // Templates, uploads and studio edits: the finished design is rebuilt at this size from scratch.
        const { jobId } = await api<{ jobId: string }>(`/api/content/${item.id}/sizes/recreate`, { body: { presetId: preset.id } });
        url = await poll<ReferenceJob>(`/api/reference-design/jobs/${jobId}`, referenceDone, referenceFailed);
      }
      await api(`/api/content/${item.id}/sizes`, { body: { presetId: preset.id, imageUrl: url } });
      onChanged();
    } catch (e) { setError(errorMessage(e, t('Could not make this size.', 'تعذّر تجهيز المقاس.'))); }
    setWorking((state) => { const { [preset.id]: _done, ...rest } = state; return rest; });
  };
  // "Make all" runs one size at a time: AI template jobs are limited to one per person, and it keeps the cost visible.
  useEffect(() => {
    if (!queue.length || Object.keys(working).length) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    void make(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, working]);
  const remove = async (preset: PublishingPreset) => {
    try { await api(`/api/content/${item.id}/sizes`, { body: { presetId: preset.id, imageUrl: null } }); onChanged(); }
    catch (e) { setError(errorMessage(e, '')); }
  };

  if (!creative?.imageUrl) return null;
  const channels = all ? CHANNELS : CHANNELS.filter((channel) => item.channels.includes(channel));
  const presets = PUBLISHING_PRESETS.filter((preset) => channels.includes(preset.channel));
  const missing = presets.filter((preset) => !ready(preset));
  const busy = Object.keys(working).length > 0 || queue.length > 0;
  const fileName = (preset: PublishingPreset) => `${item.title.slice(0, 40).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'engosoft'}-${preset.id}.png`;

  return (
    <section className="content-drawer__section content-drawer__section--late sizes">
      <h3><Maximize2 size={15} /> {t('Sizes for every platform', 'مقاسات كل منصة')} <small className="u-tnum">{presets.length - missing.length}/{presets.length}</small></h3>
      <p className="u-xs u-muted">{t('Each size is designed again at its own dimensions: a new layout built for that shape, with the same idea, colours, style and exact words, and the official logo placed on top. Nothing is stretched, cropped or framed. One AI image per size.', 'كل مقاس بيتصمم من جديد بأبعاده: توزيع جديد معمول للشكل ده، بنفس الفكرة والألوان والستايل والكلام بالظبط، والشعار الرسمي بيتحط فوقه. مفيش تمطيط ولا قص ولا برواز. صورة ذكاء اصطناعي واحدة لكل مقاس.')}</p>
      {!item.editable && <p className="u-xs u-muted">{t('The design is locked after approval. To add sizes, edit the post.', 'التصميم بيتقفل بعد الاعتماد. علشان تضيف مقاسات، عدّل المنشور.')}</p>}
      {item.editable && aiAllowed && missing.length > 0 && <div className="sizes__bulk">
        <Button size="sm" variant="primary" icon={<Sparkles size={14} />} disabled={busy} onClick={() => setQueue(missing)}>{t(`Design the ${missing.length} missing sizes (${missing.length} images)`, `صمّم الـ${missing.length} مقاس الناقصين (${missing.length} صورة)`)}</Button>
        {queue.length > 0 && <Button size="sm" variant="ghost" onClick={() => setQueue([])}>{t('Stop after this one', 'وقّف بعد اللي شغال')}</Button>}
      </div>}
      {error && <p role="alert" className="creative-home__error">{error}</p>}
      {channels.map((channel) => {
        const rows = presets.filter((preset) => preset.channel === channel);
        if (!rows.length) return null;
        return <div key={channel} className="sizes__group">
          <b className="sizes__platform"><ChannelIcon channel={channel} size={14} /> {channelName[channel]}</b>
          <ul>{rows.map((preset) => {
            const have = ready(preset);
            const designing = working[preset.id];
            const shape = SHAPE_LABEL[shapeOf(preset.width, preset.height)];
            return <li key={preset.id} className="sizes__row" data-ready={have ? '' : undefined}>
              <span className="sizes__thumb" style={{ aspectRatio: `${preset.width} / ${preset.height}` }}>{have ? <img src={have.url} alt="" loading="lazy" /> : designing ? <Loader2 size={14} className="creative-job__spin" /> : null}</span>
              <span className="sizes__name"><span>{tx(preset.name)}</span><small className="u-tnum">{preset.width}×{preset.height} · {t(shape[0], shape[1])}{have?.main ? ` · ${t('main design', 'التصميم الأساسي')}` : ''}</small></span>
              <span className="sizes__actions">
                {have ? <>
                  <a className="sizes__icon" href={have.url} download={fileName(preset)} aria-label={t('Download', 'نزّل')} title={t('Download', 'نزّل')}><Download size={14} /></a>
                  {item.editable && creative.sizes?.[preset.id] && <button type="button" className="sizes__icon" aria-label={t('Remove this size', 'احذف المقاس ده')} title={t('Remove', 'احذف')} onClick={() => void remove(preset)}><X size={14} /></button>}
                  {!item.editable || !creative.sizes?.[preset.id] ? <Check size={14} className="sizes__ok" aria-label={t('Ready', 'جاهز')} /> : null}
                </> : designing ? <small className="u-muted">{t('Designing…', 'بيتصمم…')}</small>
                  : item.editable && aiAllowed ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void make(preset)}><Sparkles size={13} /> {t('Design it', 'صمّمه')}</Button>
                  : <small className="u-muted">—</small>}
              </span>
            </li>;
          })}</ul>
        </div>;
      })}
      <button type="button" className="ui-link sizes__more" onClick={() => setAll(!all)}>{all ? t('Only this post’s platforms', 'منصات المنشور بس') : t('Show every platform', 'اعرض كل المنصات')}</button>
    </section>
  );
}
