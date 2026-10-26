import { Globe } from 'lucide-react';
import type { Channel } from '../../domain/shared';
import { channelName } from '../../i18n/labels';
import { BRAND_PATHS } from '../../lib/platformIcons';

// LinkedIn glyph from Simple Icons, CC0-1.0.
const LINKEDIN =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';

export function ChannelIcon({ channel, size = 14 }: { channel: Channel; size?: number }) {
  if (channel === 'website') return <Globe size={size} style={{ color: 'var(--p-website)' }} aria-hidden />;
  const path = channel === 'linkedin' ? LINKEDIN : BRAND_PATHS[channel];
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
