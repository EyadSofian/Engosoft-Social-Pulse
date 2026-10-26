import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { allLogoVariants, getLogoVariant, type LogoVariantId } from './registry.js';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const projectFile = (path: string) => resolve(process.cwd(), path);

export interface AssetIntegrityIssue { variantId: LogoVariantId; file: string; problem: 'missing' | 'hash_mismatch' }

/** Compare every logo file (source and public copy) with the hash pinned in brand/logos.json. */
export function verifyBrandAssets(): AssetIntegrityIssue[] {
  const issues: AssetIntegrityIssue[] = [];
  for (const variant of allLogoVariants()) {
    for (const file of [variant.assetPath, `public${variant.publicPath}`]) {
      let bytes: Buffer;
      try { bytes = readFileSync(projectFile(file)); } catch { issues.push({ variantId: variant.id, file, problem: 'missing' }); continue; }
      if (sha256(bytes) !== variant.sha256) issues.push({ variantId: variant.id, file, problem: 'hash_mismatch' });
    }
  }
  return issues;
}

const verified = new Map<LogoVariantId, Buffer>();
/** The exact approved SVG bytes. Throws rather than return a file that differs from the manifest. */
export function loadApprovedLogo(id: LogoVariantId): Buffer {
  const cached = verified.get(id);
  if (cached) return cached;
  const variant = getLogoVariant(id);
  const bytes = readFileSync(projectFile(variant.assetPath));
  if (sha256(bytes) !== variant.sha256) throw new Error(`Logo ${id} does not match its approved hash; refusing to use it`);
  verified.set(id, bytes);
  return bytes;
}
