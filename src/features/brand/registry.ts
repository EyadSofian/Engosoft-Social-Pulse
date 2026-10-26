import { getLogoVariant, isLogoVariantId, logoEdgeMargin, minimumLogoWidth } from '../../../server/creative-intelligence/brand/registry';

/** Structural checks for the logo layer of a layered design document. Pixel checks run on the server. */
export function validateLogoLayer(layer: { type: string; id: string; source?: string; locked?: boolean; variant?: string; width?: number; x?: number; y?: number }, canvasWidth = 1080): string[] {
  if (layer.type !== 'logo' || layer.id !== 'official-logo') return ['Missing official logo layer'];
  const issues: string[] = [];
  if (!layer.locked) issues.push('Official logo must be locked');
  if (!layer.source) issues.push('Official logo source missing');
  if (!isLogoVariantId(layer.variant)) return [...issues, 'Unapproved logo variant'];
  const variant = getLogoVariant(layer.variant);
  const margin = logoEdgeMargin(canvasWidth);
  if ((layer.width ?? 0) < minimumLogoWidth(variant, canvasWidth)) issues.push('Logo below minimum width');
  if ((layer.x ?? 0) < margin || (layer.y ?? 0) < margin || (layer.x ?? 0) + (layer.width ?? 0) > canvasWidth - margin) issues.push('Logo outside safe area');
  return issues;
}
