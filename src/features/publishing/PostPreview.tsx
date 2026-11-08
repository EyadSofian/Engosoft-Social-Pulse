import { useState } from 'react';
import { Bookmark, Heart, MessageCircle, Repeat2, Send, Share2, ThumbsUp } from 'lucide-react';
import { ChannelIcon } from '../../components/data-display/ChannelIcon';
import { useI18n } from '../../i18n/I18nProvider';
import { imageForChannel } from '../../domain/output-presets';
import type { Channel, PipelineItem } from '../content-pipeline/types';

/** Caption length each platform accepts; the preview warns past it. */
export const CAPTION_LIMIT: Partial<Record<Channel, number>> = { x: 280, instagram: 2200, tiktok: 2200, linkedin: 3000, youtube: 5000, facebook: 63206 };
const NAME: Record<Channel, string> = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', snapchat: 'Snapchat', linkedin: 'LinkedIn', x: 'X', whatsapp: 'WhatsApp', website: 'Website' };
/** Platforms that show the picture first and the words under it (or over it, full screen). */
const MEDIA_FIRST: Channel[] = ['instagram', 'tiktok', 'snapchat', 'youtube'];
const VERTICAL: Channel[] = ['tiktok', 'snapchat'];

/**
 * The post as each of its platforms will show it: the picture in that platform's frame and that platform's
 * approved caption, with its length checked. Close to the real feed, not a pixel copy of it.
 */
export function PostPreview({ item, accountNames, video }: { item: PipelineItem; accountNames: Partial<Record<Channel, string>>; video?: string }) {
  const { t, num } = useI18n();
  const [channel, setChannel] = useState<Channel>(item.channels[0] ?? 'facebook');
  const caption = item.captions[channel]?.trim() ?? '';
  const limit = CAPTION_LIMIT[channel];
  // The image this platform will get; a story-shaped frame only when it is a 9:16 design (or a video).
  const image = imageForChannel(channel, item.creative);
  const vertical = VERTICAL.includes(channel) && Boolean(video || (image && image !== item.creative?.imageUrl));
  const media = video
    ? <video className="post-preview__media" src={video} poster={image} muted playsInline controls preload="metadata" data-vertical={vertical || undefined} />
    : image ? <img className="post-preview__media" src={image} alt="" data-vertical={vertical || undefined} /> : null;
  const words = caption
    ? <p className="post-preview__caption" dir="auto">{caption}</p>
    : <p className="post-preview__caption post-preview__caption--empty">{t('No caption for this platform.', 'مفيش نص لهذه المنصة.')}</p>;

  return (
    <div className="post-preview">
      <div className="post-preview__tabs" role="tablist" aria-label={t('Preview on', 'المعاينة على')}>
        {item.channels.map((c) => <button key={c} type="button" role="tab" aria-selected={c === channel} title={NAME[c]} onClick={() => setChannel(c)}>
          <ChannelIcon channel={c} size={15} /><span>{NAME[c]}</span>
        </button>)}
      </div>
      <article className="post-preview__frame" data-channel={channel}>
        <header className="post-preview__head">
          <img src="/engosoft-mark.png" alt="" />
          <span><b><bdi>{accountNames[channel] ?? 'Engosoft'}</bdi></b><small>{t('Now', 'الآن')} · <ChannelIcon channel={channel} size={11} /></small></span>
        </header>
        {MEDIA_FIRST.includes(channel) ? <>{media}{words}</> : <>{words}{media}</>}
        <footer className="post-preview__actions" aria-hidden>
          {channel === 'x' ? <><MessageCircle size={16} /><Repeat2 size={16} /><Heart size={16} /><Share2 size={16} /></>
            : channel === 'instagram' ? <><Heart size={16} /><MessageCircle size={16} /><Send size={16} /><Bookmark size={16} className="post-preview__end" /></>
              : <><ThumbsUp size={16} /><MessageCircle size={16} /><Share2 size={16} /></>}
        </footer>
      </article>
      <p className="post-preview__meta">
        {limit ? <span data-over={caption.length > limit || undefined} className="u-tnum">{num(caption.length)} / {num(limit)} {t('characters', 'حرف')}</span> : <span className="u-tnum">{num(caption.length)} {t('characters', 'حرف')}</span>}
        <span>{t('Approved caption: edit the post to change it.', 'النص المعتمد: لتغييره عدّل المنشور.')}</span>
      </p>
    </div>
  );
}
