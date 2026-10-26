import type { Platform } from '../types';

export type Id = string;
/** ISO-8601 timestamp (UTC). */
export type Iso = string;

/** Interface copy and seeded reference names carry both languages. */
export interface Text {
  en: string;
  ar: string;
}

/** Channels content can be prepared for. LinkedIn has no connector yet: it can be planned, not measured. */
export type Channel = Platform | 'linkedin' | 'whatsapp';
export const CHANNELS: Channel[] = ['facebook', 'instagram', 'whatsapp', 'linkedin', 'tiktok', 'snapchat', 'website'];

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Where a record came from. `live` rows are read from the Mobde3 API
 * (SQLite + connectors); `demo` rows come from the seeded workspace until the
 * matching backend tables exist.
 */
export type Provenance = 'live' | 'demo';
