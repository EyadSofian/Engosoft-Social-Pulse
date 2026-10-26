import type { Id, Iso } from './shared';
import type { DepartmentId } from './users';

export type AssetKind = 'image' | 'video' | 'audio' | 'certificate' | 'document' | 'zoom_capture' | 'logo' | 'template_asset';
export const ASSET_KINDS: AssetKind[] = ['image', 'video', 'audio', 'certificate', 'document', 'zoom_capture', 'logo', 'template_asset'];

export interface Asset {
  id: Id;
  name: string;
  kind: AssetKind;
  mime: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
  departmentId: DepartmentId;
  uploadedById: Id;
  uploadedAt: Iso;
  contentIds: Id[];
  tags: string[];
  /** Demo assets have metadata only; there is no stored file behind them yet. */
  hasFile: boolean;
}
