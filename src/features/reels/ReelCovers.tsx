import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { COVER_HELP, type ReelCover, type ReelCovers } from '../../domain/reel-covers';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { CHANNEL_LABEL, type Channel, type PipelineDetail } from '../content-pipeline/types';
import { timedVideoFrames, type VideoFrame } from './video';
import { useAuth } from '../auth/AuthProvider';

/** Upload each new image once, even when the same cover is used on several platforms. */
export async function saveReelCovers(cover: ReelCover, covers: ReelCovers) {
  const saved = new Map<string, string>();
  const upload = async (value: ReelCover): Promise<ReelCover> => {
    if (!value.url.startsWith('data:')) return value;
    let url = saved.get(value.url);
    if (!url) { url = (await api<{ url: string }>('/api/uploads', { body: { dataUrl: value.url } })).url; saved.set(value.url, url); }
    return { ...value, url };
  };
  const common = await upload(cover), overrides: ReelCovers = {};
  for (const [channel, value] of Object.entries(covers)) if (value) overrides[channel as Channel] = await upload(value);
  return { cover: common, covers: overrides };
}

/** One common cover, with optional platform overrides. A frame retains its exact timestamp for TikTok. */
export function ReelCoverPicker({ cover, covers, channels, videoUrl, disabled = false, onChange }: {
  cover: ReelCover; covers: ReelCovers; channels: Channel[]; videoUrl?: string; disabled?: boolean;
  onChange: (cover: ReelCover, covers: ReelCovers) => void;
}) {
  const { t, tx } = useI18n();
  const [target, setTarget] = useState<Channel | 'all'>('all');
  const [frames, setFrames] = useState<VideoFrame[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const current = useRef({ cover, covers, onChange });
  current.current = { cover, covers, onChange };
  const active = target === 'all' || !channels.includes(target) ? 'all' : target;
  const shown = active === 'all' ? cover : covers[active] ?? cover;
  useEffect(() => {
    let alive = true; setFrames([]); setError('');
    if (!videoUrl || disabled) { setLoading(false); return; }
    setLoading(true);
    void timedVideoFrames(videoUrl).then((value) => { if (alive) { setFrames(value); const latest = current.current; if (!latest.cover.url && value.length) latest.onChange(value[Math.min(1, value.length - 1)], latest.covers); } })
      .catch(() => { if (alive) setError(t('Could not read frames. You can still upload a cover.', 'تعذّرت قراءة اللقطات. تقدر ترفع صورة غلاف.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [videoUrl, disabled]);
  const choose = (value: ReelCover) => {
    setError('');
    if (active === 'all') onChange(value, covers); else onChange(cover, { ...covers, [active]: value });
  };
  const pick = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) { setError(t('Choose a PNG, JPEG or WebP image up to 8 MB.', 'اختار صورة PNG أو JPEG أو WebP لحد 8 ميجابايت.')); return; }
    const selectedTarget = active;
    try {
      const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
      if (selectedTarget === 'all') onChange({ url }, covers); else onChange(cover, { ...covers, [selectedTarget]: { url } });
      setError('');
    } catch { setError(t('Could not read the image.', 'تعذّرت قراءة الصورة.')); }
  };
  return <div className="reel-covers">
    <div className="reel-covers__tabs" role="tablist" aria-label={t('Cover for', 'الغلاف الخاص بـ')}>
      <button type="button" role="tab" aria-selected={active === 'all'} onClick={() => setTarget('all')}>{t('Common cover', 'غلاف موحّد')}</button>
      {channels.map((channel) => <button key={channel} type="button" role="tab" aria-selected={active === channel} onClick={() => setTarget(channel)}><ChannelIcon channel={channel} size={14} /> {CHANNEL_LABEL[channel]}{covers[channel] && <span className="reel-covers__dot" aria-label={t('Custom cover', 'غلاف مخصص')} />}</button>)}
    </div>
    <div className="reel-covers__body">
      {shown.url ? <img className="reel-covers__image" src={shown.url} alt={t('Selected Reel cover', 'صورة غلاف الريل المختارة')} /> : <div className="reel-covers__image reel-covers__empty"><ImagePlus size={24} /></div>}
      <div className="u-stack">
        <b>{active === 'all' ? t('Thumbnail / Reel cover', 'الصورة المصغّرة / واجهة الريل') : CHANNEL_LABEL[active]}</b>
        <small className="u-muted">{active === 'all' ? t('Used on every platform unless you choose a different cover in its tab.', 'بتستخدم لكل المنصات، وتقدر تختار غلاف مختلف من تاب كل منصة.') : tx(COVER_HELP[active])}</small>
        {shown.timestampMs !== undefined && <small className="u-tnum">{t('Video frame at', 'لقطة من الفيديو عند')} {(shown.timestampMs / 1000).toFixed(2)} {t('seconds', 'ثانية')}</small>}
        {!disabled && <Button size="sm" variant="secondary" icon={<ImagePlus size={14} />} onClick={() => input.current?.click()}>{t('Upload thumbnail', 'ارفع صورة الغلاف')}</Button>}
        {shown.url && <a className="ui-link" href={shown.url} download={`reel-cover-${active}.jpg`}><Download size={13} /> {t('Download cover', 'نزّل الغلاف')}</a>}
        {!disabled && active !== 'all' && covers[active] && <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => { const next = { ...covers }; delete next[active]; onChange(cover, next); }}>{t('Use common cover', 'استخدم الغلاف الموحّد')}</Button>}
      </div>
    </div>
    <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ''; }} />
    {!disabled && frames.length > 0 && <div>
      <p className="u-xs u-muted">{t('Or choose a frame from the video', 'أو اختار لقطة من الفيديو')}</p>
      <div className="reel__frames" role="radiogroup" aria-label={t('Video cover frame', 'لقطة غلاف الفيديو')}>{frames.map((frame) => <button key={frame.timestampMs} type="button" role="radio" aria-checked={shown.timestampMs === frame.timestampMs} aria-label={t(`Frame at ${(frame.timestampMs / 1000).toFixed(2)} seconds`, `لقطة عند ${(frame.timestampMs / 1000).toFixed(2)} ثانية`)} onClick={() => choose(frame)}><img src={frame.url} alt="" /></button>)}</div>
    </div>}
    {loading && <small className="u-muted"><Loader2 size={13} className="creative-job__spin" /> {t('Reading video frames…', 'بنجهّز لقطات الفيديو…')}</small>}
    {error && <p role="alert" className="creative-home__error">{error}</p>}
  </div>;
}

/** Editable on the post page, with the same approval lock as the video and captions. */
export function ReelCoversPanel({ item, onSaved }: { item: PipelineDetail; onSaved: () => void }) {
  const { t } = useI18n();
  const canEdit = item.editable && useAuth().can('design.video');
  const initial = item.creative?.reelCover ?? { url: item.creative?.imageUrl ?? '' };
  const [cover, setCover] = useState<ReelCover>(initial), [covers, setCovers] = useState<ReelCovers>(item.creative?.reelCovers ?? {});
  const [videoUrl, setVideoUrl] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setCover(initial); setCovers(item.creative?.reelCovers ?? {}); }, [item.creative]);
  useEffect(() => { let alive = true; void api<{ media: { type: string; url: string }[] }>(`/api/social/content/${item.id}`).then((data) => { if (alive) setVideoUrl([...data.media].reverse().find((m) => m.type === 'video')?.url); }).catch(() => {}); return () => { alive = false; }; }, [item.id]);
  const changed = JSON.stringify([cover, covers]) !== JSON.stringify([initial, item.creative?.reelCovers ?? {}]);
  const save = async () => {
    setBusy(true); setError('');
    try { const data = await saveReelCovers(cover, covers); await api(`/api/content/${item.id}/reel-covers`, { method: 'PUT', body: data }); onSaved(); }
    catch (reason) { setError(errorMessage(reason, t('Could not save the cover.', 'تعذّر حفظ الغلاف.'))); }
    setBusy(false);
  };
  return <section className="content-drawer__section">
    <h3>{t('Reel covers', 'غلاف الريل لكل منصة')}</h3>
    <ReelCoverPicker cover={cover} covers={covers} channels={item.channels} videoUrl={videoUrl} disabled={!canEdit || busy} onChange={(common, next) => { setCover(common); setCovers(next); }} />
    {canEdit && changed && <Button size="sm" variant="primary" busy={busy} disabled={!cover.url} onClick={() => void save()}>{t('Save covers', 'احفظ الأغلفة')}</Button>}
    {!item.editable && item.canReopen && <small className="u-muted">{t('Open the post for editing to change the covers before publishing.', 'افتح المنشور للتعديل علشان تغيّر الأغلفة قبل النشر.')}</small>}
    {error && <p role="alert" className="creative-home__error">{error}</p>}
  </section>;
}
