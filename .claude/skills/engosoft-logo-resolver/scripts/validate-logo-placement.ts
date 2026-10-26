/**
 * Usage: node --import tsx .claude/skills/engosoft-logo-resolver/scripts/validate-logo-placement.ts \
 *          <creative.png> <variantId> <x> <y> <width> [zones.json]
 * zones.json: [{ "kind": "face", "box": { "x": 0, "y": 0, "width": 0, "height": 0 }, "label": "instructor" }]
 * Run from the repository root. Exits 1 when the placement fails.
 */
import { readFileSync } from 'node:fs';
import { validateLogoPlacement, type ContentZone } from '../../../../server/creative-intelligence/logo-resolution/validator.ts';
import type { LogoVariantId } from '../../../../server/creative-intelligence/brand/registry.ts';

const [creativePath, variantId, x, y, width, zonesPath] = process.argv.slice(2);
if (!creativePath || !variantId || !x || !y || !width) {
  console.error('Usage: validate-logo-placement.ts <creative.png> <variantId> <x> <y> <width> [zones.json]');
  process.exit(2);
}
const zones = zonesPath ? JSON.parse(readFileSync(zonesPath, 'utf8')) as ContentZone[] : undefined;
const result = await validateLogoPlacement({
  creative: readFileSync(creativePath),
  placement: { variantId: variantId as LogoVariantId, x: Number(x), y: Number(y), width: Number(width) },
  zones,
});
const m = result.measurements;
if (m) {
  console.log(`Logo box ${m.logoBox.width}×${m.logoBox.height} at ${m.logoBox.x},${m.logoBox.y}; clear space ${m.clearSpacePx}px; minimum width ${m.minimumWidth}px`);
  console.log(`Background ${m.region.backgroundClass} (${m.verdict}); mean ${m.region.meanHex}; complexity ${m.region.complexity.toFixed(3)}; contrast ${m.meanContrast.toFixed(2)}:1`);
}
for (const issue of result.issues) console.log(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
console.log(result.pass ? `PASS (${result.policy})` : 'FAIL');
process.exit(result.pass ? 0 : 1);
