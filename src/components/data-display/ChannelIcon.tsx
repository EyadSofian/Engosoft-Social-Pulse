import { Globe, MessageCircle, Youtube } from 'lucide-react';
import type { Channel } from '../../domain/shared';
import { channelName } from '../../i18n/labels';
import { BRAND_PATHS } from '../../lib/platformIcons';

export function ChannelIcon({ channel, size = 14 }: { channel: Channel; size?: number }) {
  if (channel === 'youtube') return <Youtube size={size} style={{ color: 'var(--p-youtube)' }} aria-hidden />;
  if (channel === 'website') return <Globe size={size} style={{ color: 'var(--p-website)' }} aria-hidden />;
  if (channel === 'whatsapp') return <MessageCircle size={size} style={{ color: '#25d366' }} aria-hidden />;
  const path = BRAND_PATHS[channel];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ color: `var(--p-${channel})`, flex: 'none' }}>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/** Small icon row; names are read out for screen readers. */
export function Channels({ channels, size = 14 }: { channels: Channel[]; size?: number }) {
  if (!channels.length) return <span className="u-muted">—</span>;
  return (
    <span className="ui-channels" aria-label={channels.map((channel) => channelName[channel]).join(', ')} role="img">
      {channels.map((channel) => (
        <ChannelIcon key={channel} channel={channel} size={size} />
      ))}
    </span>
  );
}
