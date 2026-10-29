import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Film, ImagePlus, Loader2, Sparkles, XCircle } from 'lucide-react';
import { useRouter } from '../../app/router/router';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { Button } from '../../components/ui/Button';
import { checkReel, reelFacts, type VideoFacts } from '../../domain/reels';
import { useI18n } from '../../i18n/I18nProvider';
import { api, errorMessage } from '../../lib/api';
import { DialectPicker, usePreferredDialect } from '../content/ContentCopilot';
import { readPostPlan, takePostPlan } from '../content/postPlan';
import { CREATIVE_PLATFORMS, PLATFORM_FORMATS, type CreativePlatform } from '../creative-studio/platforms';
import { readVideo, videoFrames } from './video';

type Words = 'idea' | 'script' | 'manual';
type ReferenceJob = { status: string; error?: string; result?: { imageUrl: string } };

const asDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/**
 * A finished Reel made outside the app: upload the MP4, see whether each platform accepts it, pick or design a cover,
 * then write the caption by hand or let AI write it from the idea or the script (AI never watches the video).
 * It becomes a draft post with the video attached, and follows the same approval and publishing path.
 */
export function ReelMode() {
  const { t, tx } = useI18n();
  const { navigate } = useRouter();
  const videoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [video, setVideo] = useState<{ facts: VideoFacts; url: string } | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  // The cover is a data URL (frame or upload) until it is uploaded, or an /api/uploads URL once AI designed it.
  const [cover, setCover] = useState<string>('');
  const [title, setTitle] = useState(() => readPostPlan().slotTitle ?? '');
  const [platforms, setPlatforms] = useState<CreativePlatform[]>(() => {
    const planned = (readPostPlan().channels ?? []).filter((c): c is CreativePlatform => (CREATIVE_PLATFORMS as string[]).includes(c));
    return planned.length ? planned : ['instagram', 'facebook', 'tiktok'];
  });
  const [words, setWords] = useState<Words>('idea');
  const [source, setSource] = useState('');
  const [captions, setCaptions] = useState<Partial<Record<CreativePlatform, string>>>({});
  const [manual, setManual] = useState('');
  const [dialect, setDialect] = usePreferredDialect();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [created, setCreated] = useState('');
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  const pickVideo = async (next: File | undefined) => {
    if (!next) return;
    setMessage('');
    if (next.type !== 'video/mp4') { setMessage(t('Use an MP4 video.', 'استخدم فيديو MP4.')); return; }
    try {
      const read = await readVideo(next);
      setFile(next); setVideo(read); setCover(''); setFrames([]);
      if (!title.trim()) setTitle(next.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '));
      const stills = await videoFrames(read.url).catch(() => []);
      setFrames(stills);
      if (stills[0]) setCover((current) => current || stills[Math.min(1, stills.length - 1)]);
    } catch (error) { setMessage(errorMessage(error, '')); }
  };
  const pickCover = async (next: File | undefined) => {
    if (!next) return;
    if (!/^image\/(png|jpeg|webp)$/.test(next.type) || next.size > 12_000_000) { setMessage(t('Use a PNG, JPEG or WebP image under 12 MB.', 'استخدم صورة PNG أو JPEG أو WebP أقل من 12 ميجابايت.')); return; }
    setCover(await asDataUrl(next));
  };
  const uploadCover = async () => (cover.startsWith('/api/') ? cover : (await api<{ url: string }>('/api/uploads', { body: { dataUrl: cover } })).url);

  const designCover = async () => {
    if (!cover || title.trim().length < 2) { setMessage(t('Pick a frame and write the title first.', 'اختار لقطة واكتب العنوان الأول.')); return; }
    setBusy('cover'); setMessage('');
    try {
      const frameUrl = await uploadCover();
      const { jobId } = await api<{ jobId: string }>('/api/reels/cover', { body: { frameUrl, title: title.trim() } });
      for (;;) {
        const job = await api<ReferenceJob>(`/api/reference-design/jobs/${jobId}`);
        if (job.status === 'done' && job.result) { setCover(job.result.imageUrl); break; }
        if (job.status === 'failed') throw new Error(job.error ?? t('Could not design the cover.', 'تعذّر تصميم الغلاف.'));
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    } catch (error) { setMessage(errorMessage(error, '')); }
    setBusy('');
  };

  const writeCaptions = async () => {
    if (source.trim().length < 10) { setMessage(words === 'script' ? t('Paste the script first.', 'الزق السكريبت الأول.') : t('Write the idea in a sentence or two.', 'اكتب الفكرة في جملة أو اتنين.')); return; }
    setBusy('captions'); setMessage('');
    try {
      const result = await api<{ captions: Partial<Record<CreativePlatform, string>> }>('/api/ai/captions', { body: { facts: reelFacts(title, words === 'script' ? 'script' : 'idea', source), channels: platforms, dialect } });
      setCaptions(result.captions);
    } catch (error) { setMessage(errorMessage(error, '')); }
    setBusy('');
  };

  const blocked = video ? platforms.filter((p) => checkReel(video.facts, p).some((issue) => issue.level === 'error')) : [];
  const submit = async () => {
    if (!file || !video) { setMessage(t('Choose the video first.', 'اختار الفيديو الأول.')); return; }
    if (!cover) { setMessage(t('Pick a cover.', 'اختار غلاف.')); return; }
    if (title.trim().length < 2) { setMessage(t('Give the Reel a short title.', 'اكتب عنوان قصير للريل.')); return; }
    if (!platforms.length) { setMessage(t('Choose at least one platform.', 'اختار منصة واحدة على الأقل.')); return; }
    if (blocked.length) { setMessage(t(`The video does not fit ${blocked.map((p) => PLATFORM_FORMATS[p].label).join(', ')}. Remove those platforms or export a new video.`, `الفيديو مش مناسب لـ ${blocked.map((p) => PLATFORM_FORMATS[p].label).join('، ')}. شيل المنصات دي أو صدّر فيديو جديد.`)); return; }
    setBusy('submit'); setMessage('');
    try {
      const imageUrl = await uploadCover();
      const text = words === 'manual' ? Object.fromEntries(platforms.map((p) => [p, manual.trim()])) : Object.fromEntries(platforms.map((p) => [p, captions[p] ?? '']));
      const id = created || (await api<{ id: string }>('/api/content', { body: { ...takePostPlan(), title: title.trim(), channels: platforms, captions: Object.fromEntries(Object.entries(text).filter(([, v]) => v)), creative: { requestId: 'reel', directionId: 'reel', imageUrl, directionName: 'Reel' } } })).id;
      setCreated(id);
      const response = await fetch(`/api/social/content/${id}/video`, { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: file });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || t('The video did not upload.', 'الفيديو ما اترفعش.'));
      navigate(`/content/${id}`);
    } catch (error) { setMessage(errorMessage(error, '')); }
    setBusy('');
  };

  const toggle = (platform: CreativePlatform) => setPlatforms((current) => current.includes(platform) ? current.filter((value) => value !== platform) : [...current, platform]);
  const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return <section className="reel glass">
    <input ref={videoInput} hidden type="file" accept="video/mp4" onChange={(event) => void pickVideo(event.target.files?.[0])} />
    <input ref={coverInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pickCover(event.target.files?.[0])} />
    <div className="reel__media">
      {video
        ? <video className="reel__player" src={video.url} controls playsInline poster={cover || undefined} />
        : <button type="button" className="create-upload__drop reel__drop" onClick={() => videoInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void pickVideo(event.dataTransfer.files[0]); }}>
          <Film size={28} /><b>{t('Choose or drop the Reel', 'اختار الريل أو اسحبه هنا')}</b><small>{t('MP4 · 9:16 · up to 200 MB', 'MP4 · 9:16 · لحد 200 ميجابايت')}</small>
        </button>}
      {video && <p className="u-xs u-muted u-tnum">{video.facts.width}×{video.facts.height} · {minutes(video.facts.duration)} · {(video.facts.bytes / 1_048_576).toFixed(1)} MB · <button type="button" className="ui-link reel__swap" onClick={() => videoInput.current?.click()}>{t('Change video', 'غيّر الفيديو')}</button></p>}
    </div>

    <div className="reel__form u-stack">
      <section className="reel__step">
        <h3><span className="u-tnum">1</span> {t('Platforms', 'المنصات')}</h3>
        <div className="creative-home__platforms" role="group" aria-label={t('Platforms', 'المنصات')}>{CREATIVE_PLATFORMS.filter((p) => p !== 'website').map((platform) => <button key={platform} type="button" aria-pressed={platforms.includes(platform)} onClick={() => toggle(platform)}><span className="creative-home__platform-icon"><ChannelIcon channel={platform} size={15} /></span>{PLATFORM_FORMATS[platform].label}</button>)}</div>
        {video && platforms.length > 0 && <ul className="reel__checks">{platforms.map((platform) => {
          const issues = checkReel(video.facts, platform);
          const state = issues.some((i) => i.level === 'error') ? 'error' : issues.length ? 'warn' : 'ok';
          return <li key={platform} data-state={state}>
            {state === 'ok' ? <Check size={14} /> : state === 'warn' ? <AlertTriangle size={14} /> : <XCircle size={14} />}
            <ChannelIcon channel={platform} size={13} /> <b>{PLATFORM_FORMATS[platform].label}</b>
            <span>{issues.length ? issues.map((i) => tx(i.text)).join(' ') : t('Ready', 'جاهز')}</span>
          </li>;
        })}</ul>}
      </section>

      <section className="reel__step">
        <h3><span className="u-tnum">2</span> {t('Title and cover', 'العنوان والغلاف')}</h3>
        <label className="ui-field"><span className="ui-field__label">{t('Title', 'العنوان')}</span><input className="ui-input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} dir="auto" placeholder={t('e.g. 3 PMP exam mistakes', 'مثال: 3 أخطاء في امتحان PMP')} /></label>
        {frames.length > 0 && <div className="reel__frames" role="radiogroup" aria-label={t('Cover from the video', 'غلاف من الفيديو')}>{frames.map((frame, i) => <button key={i} type="button" role="radio" aria-checked={cover === frame} onClick={() => setCover(frame)}><img src={frame} alt="" /></button>)}</div>}
        <div className="reel__cover">
          {cover && <img src={cover} alt={t('Cover', 'الغلاف')} />}
          <div className="u-stack">
            <Button size="sm" variant="secondary" icon={<ImagePlus size={14} />} onClick={() => coverInput.current?.click()}>{t('Upload a cover', 'ارفع غلاف')}</Button>
            <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} busy={busy === 'cover'} disabled={Boolean(busy) || !cover} onClick={() => void designCover()}>{t('Design the cover with AI (1 image)', 'صمّم الغلاف بالذكاء الاصطناعي (صورة واحدة)')}</Button>
            <small className="u-muted">{t('AI turns the chosen frame into a 1080×1920 cover with the title and the official logo.', 'الذكاء الاصطناعي بيحوّل اللقطة اللي اخترتها لغلاف 1080×1920 بالعنوان والشعار الرسمي.')}</small>
          </div>
        </div>
      </section>

      <section className="reel__step">
        <h3><span className="u-tnum">3</span> {t('Caption', 'الكلام')}</h3>
        <div className="reel__words" role="radiogroup" aria-label={t('How to write the caption', 'هتكتب الكلام إزاي')}>
          {([['idea', 'From the idea', 'من الفكرة'], ['script', 'From the script', 'من السكريبت'], ['manual', 'I will write it', 'هكتبه بإيدي']] as const).map(([value, en, ar]) => <button key={value} type="button" role="radio" aria-checked={words === value} onClick={() => setWords(value)}>{t(en, ar)}</button>)}
        </div>
        {words === 'manual'
          ? <textarea className="ui-input" rows={5} dir="auto" value={manual} onChange={(event) => setManual(event.target.value)} placeholder={t('The caption for every platform. You can tailor each one on the post page.', 'الكلام لكل المنصات. تقدر تظبط كل منصة لوحدها من صفحة المنشور.')} />
          : <>
            <textarea className="ui-input" rows={words === 'script' ? 8 : 3} dir="auto" maxLength={2600} value={source} onChange={(event) => setSource(event.target.value)}
              placeholder={words === 'script' ? t('Paste the video script', 'الزق سكريبت الفيديو') : t('What is the Reel about? e.g. the instructor explains 3 mistakes people make in the PMP exam and how to avoid them', 'الريل عن إيه؟ مثلًا: المحاضر بيشرح 3 أخطاء بيقع فيها الناس في امتحان PMP وإزاي يتجنبوها')} />
            <div className="reel__ai"><DialectPicker value={dialect} onChange={setDialect} /><Button size="sm" variant="secondary" icon={<Sparkles size={14} />} busy={busy === 'captions'} disabled={Boolean(busy) || !platforms.length} onClick={() => void writeCaptions()}>{t('Write the captions', 'اكتب الكلام')}</Button></div>
            <small className="u-muted">{t('AI does not watch the video: it writes only from what you type here.', 'الذكاء الاصطناعي مش بيتفرج على الفيديو: بيكتب من اللي إنت كاتبه هنا بس.')}</small>
            {platforms.filter((p) => captions[p] !== undefined).map((platform) => <label key={platform} className="ui-field"><span className="ui-field__label"><ChannelIcon channel={platform} size={13} /> {PLATFORM_FORMATS[platform].label}</span>
              <textarea className="ui-input" rows={4} dir="auto" value={captions[platform] ?? ''} onChange={(event) => setCaptions((current) => ({ ...current, [platform]: event.target.value }))} /></label>)}
          </>}
      </section>

      {message && <p role="alert" className="creative-home__error">{message}</p>}
      <div className="reel__submit">
        <Button variant="primary" busy={busy === 'submit'} disabled={Boolean(busy)} onClick={() => void submit()}>{created ? t('Upload the video again', 'ارفع الفيديو تاني') : t('Create the Reel post', 'أنشئ منشور الريل')}</Button>
        <small className="u-muted">{busy === 'submit' ? <><Loader2 size={13} className="creative-job__spin" /> {t('Uploading the video…', 'بيترفع الفيديو…')}</> : t('Saved as a draft with the video attached. Open it to check, then send it for approval.', 'بيتحفظ كمسودة والفيديو معاه. افتحه راجعه وابعته للاعتماد.')}</small>
      </div>
    </div>
  </section>;
}
