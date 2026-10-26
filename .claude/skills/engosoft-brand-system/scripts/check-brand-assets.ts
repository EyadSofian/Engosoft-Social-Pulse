/** Usage (from the repository root): node --import tsx .claude/skills/engosoft-brand-system/scripts/check-brand-assets.ts */
import { existsSync } from 'node:fs';
import { allLogoVariants, BRAND } from '../../../../server/creative-intelligence/brand/registry.ts';
import { verifyBrandAssets } from '../../../../server/creative-intelligence/brand/integrity.ts';
import { BRAND_FONT_FILES } from '../../../../server/creative-intelligence/brand/fonts.ts';

console.log(`Brand ${BRAND.version} · tagline "${BRAND.tagline}"`);
for (const variant of allLogoVariants()) console.log(`  ${variant.id.padEnd(16)} ${variant.width}×${variant.height}  fills ${variant.fills.join(' ')}`);
const issues = verifyBrandAssets();
for (const issue of issues) console.log(`  FAIL ${issue.variantId}: ${issue.file} ${issue.problem}`);
const missingFonts = BRAND_FONT_FILES.filter((font) => !existsSync(font.file));
for (const font of missingFonts) console.log(`  FAIL font missing: ${font.file}`);
console.log(issues.length || missingFonts.length ? 'Brand assets: FAIL' : 'Brand assets: OK');
process.exit(issues.length || missingFonts.length ? 1 : 0);
