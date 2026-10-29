import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { api } from '../../lib/api';

export const isReel = (creative: { requestId: string } | null | undefined) => creative?.requestId === 'reel';

/** The Reel itself on the post page, so reviewers watch what will be published; the cover is its poster. */
export function ReelPlayer({ contentId, cover }: { contentId: string; cover?: string }) {
  const { t } = useI18n();
  const [video, setVideo] = useState<{ url: string; duration?: number; width?: number; height?: number } | null | undefined>(undefined);
  const [expired, setExpired] = useState(false), [publishedUrl, setPublishedUrl] = useState('');
  useEffect(() => {
    let alive = true;
    setVideo(undefined); setExpired(false); setPublishedUrl('');
    void api<{ media: { type: string; url: string; duration?: number; width?: number; height?: number }[]; expiredMedia?: {type:string}[]; jobs?: {state:string;url?:string}[] }>(`/api/social/content/${contentId}`)
      .then((data) => { if (alive) { setVideo([...data.media].reverse().find((m) => m.type === 'video') ?? null); setExpired(Boolean(data.expiredMedia?.some(m=>m.type==='video'))); setPublishedUrl(data.jobs?.find(j=>j.state==='published'&&j.url?.startsWith('https://'))?.url||''); } })
      .catch(() => { if (alive) setVideo(null); });
    return () => { alive = false; };
  }, [contentId]);
  if (video === undefined) return <div className="reel-player reel-player--empty" aria-busy="true" />;
  if (!video && expired) return <div className="reel-player reel-player--empty"><Film size={22} /><small>{t('The local video expired under the storage retention policy. The platform post remains.', 'انتهت مدة الاحتفاظ بنسخة الفيديو المحلية. المنشور على المنصة باقٍ.')}</small>{publishedUrl&&<a href={publishedUrl} target="_blank" rel="noreferrer">{t('View published post','شاهد المنشور')}</a>}</div>;
  if (!video) return <div className="reel-player reel-player--empty"><Film size={22} /><small>{t('No video attached yet. Add it under “Post files”.', 'لسه مفيش فيديو. ضيفه من «ملفات المنشور».')}</small></div>;
  return <figure className="reel-player">
    <video src={video.url} poster={cover} controls playsInline preload="metadata" />
    {video.width && video.duration ? <figcaption className="u-xs u-muted u-tnum">{video.width}×{video.height} · {Math.floor(video.duration / 60)}:{String(Math.round(video.duration % 60)).padStart(2, '0')}</figcaption> : null}
  </figure>;
}
