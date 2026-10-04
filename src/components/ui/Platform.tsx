import type { CSSProperties } from 'react';
import { Globe } from 'lucide-react';
import { BRAND_PATHS } from '../../lib/platformIcons';
import { platformColor, platformName } from '../../lib/platforms';
import type { Platform } from '../../types';

export function PlatformIcon({ platform, size = 16 }: { platform: Platform; size?: number }) {
  if (platform === 'website') return <Globe size={size} strokeWidth={1.9} aria-hidden />;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d={BRAND_PATHS[platform]} />
    </svg>
  );
}

const ICON_SIZE = { xs: 11, sm: 14, md: 17, lg: 22 } as const;

/** The platform glyph on its tinted tile — identity never rests on colour alone. */
export function PlatformBadge({ platform, size = 'md' }: { platform: Platform; size?: keyof typeof ICON_SIZE }) {
  return (
    <span
      className={`pbadge pbadge--${size}`}
      style={{ '--p': platformColor(platform) } as CSSProperties}
      role="img"
      aria-label={platformName[platform]}
      title={platformName[platform]}
    >
      <PlatformIcon platform={platform} size={ICON_SIZE[size]} />
    </span>
  );
}
