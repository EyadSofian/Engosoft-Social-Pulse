import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  allLogoVariants, backgroundVerdict, clearSpaceFor, getLogoVariant, logoHeightFor, minimumLogoWidth, type LogoVariantId,
} from '../server/creative-intelligence/brand/registry';
import { loadApprovedLogo, verifyBrandAssets } from '../server/creative-intelligence/brand/integrity';
import { brandFontFaceCss, brandFontFor } from '../server/creative-intelligence/brand/fonts';
import { isolateNumericSequences, measureText, outlineText } from '../server/creative-intelligence/typography/text-outline';
import { compositeLogo, LogoPlacementError, rasterizeLogo, verifyComposite } from '../server/creative-intelligence/logo-resolution/compositor';
import { contrastRatio, decodeImage, measureRegion } from '../server/creative-intelligence/logo-resolution/regions';
import { validateLogoPlacement } from '../server/creative-intelligence/logo-resolution/validator';

const flat = (hex: string, width = 1080, height = 1350) => sharp({ create: { width, height, channels: 3, background: hex } }).png().toBuffer();
async function noise(width = 1080, height = 1350) {
  const data = Buffer.alloc(width * height * 3);
  let seed = 7;
  for (let i = 0; i < data.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; data[i] = seed & 255; }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}
const codes = (result: { issues: { code: string; severity: string }[] }) => result.issues.filter((i) => i.severity === 'error').map((i) => i.code);

test('registry exposes the four variants with derived geometry', () => {
  assert.equal(allLogoVariants().length, 4);
  const lockup = getLogoVariant('lockup-reversed');
  assert.equal(logoHeightFor(lockup, 300), 191);
  assert.equal(minimumLogoWidth(lockup, 1080), 240);
  assert.equal(minimumLogoWidth(lockup, 2160), 480);
  assert.ok(clearSpaceFor(lockup, 300) >= 35 && clearSpaceFor(lockup, 300) <= 37);
  assert.equal(backgroundVerdict(lockup, 'brand-blue'), 'approved');
  assert.equal(backgroundVerdict(lockup, 'brand-orange'), 'forbidden');
  assert.equal(backgroundVerdict(lockup, 'dark-photographic'), 'unspecified');
  assert.equal(backgroundVerdict(getLogoVariant('lockup-positive'), 'brand-blue'), 'forbidden');
});

test('brand asset files are intact and load only when verified', () => {
  assert.deepEqual(verifyBrandAssets(), []);
  for (const v of allLogoVariants()) assert.ok(loadApprovedLogo(v.id).toString('utf8').startsWith('<svg'));
});

test('region analysis classifies flat brand surfaces and busy texture', async () => {
  const box = { x: 40, y: 40, width: 300, height: 200 };
  assert.equal(measureRegion(await decodeImage(await flat('#0046FF')), box).backgroundClass, 'brand-blue');
  assert.equal(measureRegion(await decodeImage(await flat('#FFFFFF')), box).backgroundClass, 'white');
  assert.equal(measureRegion(await decodeImage(await flat('#F2F5FA')), box).backgroundClass, 'white');
  assert.equal(measureRegion(await decodeImage(await flat('#FF6600')), box).backgroundClass, 'brand-orange');
  assert.equal(measureRegion(await decodeImage(await flat('#1A1A1A')), box).backgroundClass, 'dark-neutral');
  const busy = measureRegion(await decodeImage(await noise()), box);
  assert.ok(busy.complexity > 0.3, `noise complexity ${busy.complexity}`);
  assert.ok(Math.abs(contrastRatio('#FFFFFF', '#0046FF') - 6.3) < 0.1);
});

test('compositor keeps ratio, touches only the logo box and reproduces the approved artwork', async () => {
  const before = await flat('#0046FF');
  const { image, record } = await compositeLogo(before, { variantId: 'lockup-reversed', x: 60, y: 60, width: 300 });
  assert.equal(record.height, 191);
  assert.equal(record.assetSha256, getLogoVariant('lockup-reversed').sha256);
  assert.deepEqual(await verifyComposite(before, image, record), []);
  const { width, height } = await sharp(image).metadata();
  assert.deepEqual([width, height], [1080, 1350]);
});

test('verifyComposite catches a plate behind the logo and a stretched logo', async () => {
  const before = await flat('#0046FF');
  const { image, record } = await compositeLogo(before, { variantId: 'lockup-reversed', x: 60, y: 60, width: 300 });
  const plated = await sharp(image).composite([{ input: await flat('#FFFFFF', 340, 20), left: 40, top: 255 }]).png().toBuffer();
  assert.ok((await verifyComposite(before, plated, record)).some((p) => p.includes('outside the logo box')));
  assert.ok((await verifyComposite(before, image, { ...record, height: 150 })).some((p) => p.includes('aspect ratio')));
});

test('compositor refuses to clip the logo', async () => {
  await assert.rejects(compositeLogo(await flat('#FFFFFF'), { variantId: 'symbol-positive', x: 1050, y: 40, width: 80 }), LogoPlacementError);
});

test('every variant renders at the requested width with a transparent background', async () => {
  for (const v of allLogoVariants()) {
    const logo = await rasterizeLogo(v.id, 260);
    const meta = await sharp(logo.png).metadata();
    assert.equal(meta.width, 260);
    assert.equal(meta.height, logoHeightFor(v, 260));
    const { data } = await sharp(logo.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(data[3], 0, `${v.id} top-left pixel must be transparent`);
  }
});

const cases: [string, string, LogoVariantId, number, string[]][] = [
  ['reversed lockup on brand blue', '#0046FF', 'lockup-reversed', 300, []],
  ['positive lockup on white', '#FFFFFF', 'lockup-positive', 300, []],
  ['reversed symbol on brand blue', '#0046FF', 'symbol-reversed', 80, []],
  ['positive symbol on soft blue gray', '#F2F5FA', 'symbol-positive', 80, []],
  ['positive lockup on brand blue', '#0046FF', 'lockup-positive', 300, ['forbidden_background', 'low_contrast']],
  ['reversed lockup on white', '#FFFFFF', 'lockup-reversed', 300, ['forbidden_background', 'low_contrast']],
  ['reversed lockup on orange', '#FF6600', 'lockup-reversed', 300, ['forbidden_background', 'low_contrast']],
  ['lockup below minimum size', '#0046FF', 'lockup-reversed', 200, ['below_minimum_size']],
];
for (const [name, background, variantId, width, expected] of cases) {
  test(`validator: ${name}`, async () => {
    const result = await validateLogoPlacement({ creative: await flat(background), placement: { variantId, x: 80, y: 80, width }, zones: [] });
    assert.deepEqual(codes(result).sort(), [...expected].sort(), JSON.stringify(result.issues));
    assert.equal(result.pass, expected.length === 0);
  });
}

test('validator: busy background, zone collision, edge margin, safe area, unknown variant', async () => {
  const busy = await validateLogoPlacement({ creative: await noise(), placement: { variantId: 'lockup-reversed', x: 80, y: 80, width: 300 }, zones: [] });
  assert.ok(codes(busy).includes('busy_background'));
  const blue = await flat('#0046FF');
  const face = await validateLogoPlacement({ creative: blue, placement: { variantId: 'lockup-reversed', x: 80, y: 80, width: 300 }, zones: [{ kind: 'face', box: { x: 360, y: 100, width: 200, height: 200 }, label: 'instructor' }] });
  assert.deepEqual(codes(face), ['zone_collision']);
  const edge = await validateLogoPlacement({ creative: blue, placement: { variantId: 'lockup-reversed', x: 10, y: 80, width: 300 }, zones: [] });
  assert.ok(codes(edge).includes('edge_margin'));
  const ui = await validateLogoPlacement({ creative: await flat('#0046FF', 1080, 1920), placement: { variantId: 'lockup-reversed', x: 80, y: 80, width: 300 }, zones: [], safeArea: { top: 250, right: 0, bottom: 340, left: 0 } });
  assert.ok(codes(ui).includes('outside_safe_area'));
  const unknown = await validateLogoPlacement({ creative: blue, placement: { variantId: 'whiteOnBlue' as LogoVariantId, x: 80, y: 80, width: 300 } });
  assert.deepEqual(codes(unknown), ['unknown_variant']);
});

test('validator: unspecified background passes only as a logged engineering default, and missing zones are flagged', async () => {
  const result = await validateLogoPlacement({ creative: await flat('#1A1A1A'), placement: { variantId: 'lockup-reversed', x: 80, y: 80, width: 300 } });
  assert.equal(result.pass, true);
  assert.equal(result.policy, 'engineering-default');
  assert.equal(result.zonesChecked, false);
  assert.ok(result.issues.some((i) => i.code === 'unspecified_background'));
  assert.ok(result.issues.some((i) => i.code === 'zones_not_checked'));
});

test('text outlines use the brand fonts, shape Arabic, and keep dates in typed order', () => {
  const block = outlineText({ text: 'دورة CFM تبدأ 04-10-2026', x: 0, y: 0, width: 2000, style: { weight: 800, size: 60, color: '#0046FF' } });
  assert.deepEqual(block.missingGlyphs, []);
  assert.equal(block.overflow, false);
  assert.ok(!block.svg.includes('<text'));
  assert.ok(block.svg.length > 1000);
  assert.equal(isolateNumericSequences('الأحد 04-10-2026 الساعة 7:30'), 'الأحد ⁦04-10-2026⁩ الساعة ⁦7:30⁩');
  // Joined Arabic is narrower than the same letters forced apart.
  const style = { weight: 400, size: 60, color: '#000' };
  assert.ok(measureText('بببب', style) < measureText('ب ب ب ب', style) - 3 * measureText(' ', style) + 1);
});

test('text outlines break lines by measured width and report overflow instead of truncating', () => {
  const style = { weight: 800, size: 76, color: '#000' };
  const fits = Math.ceil(measureText('تعليم هندسي', style));
  assert.deepEqual(outlineText({ text: 'تعليم هندسي', x: 0, y: 0, width: fits, style }).lines.map((l) => l.text), ['تعليم هندسي']);
  assert.deepEqual(outlineText({ text: 'تعليم هندسي', x: 0, y: 0, width: fits - 20, style }).lines.map((l) => l.text), ['تعليم', 'هندسي']);
  const wrapped = outlineText({ text: 'جاهز تضيف شهادة الـ CFM إلى مسارك المهني؟', x: 0, y: 0, width: 700, maxLines: 1, style: { weight: 800, size: 64, color: '#000' } });
  assert.ok(wrapped.lines.length >= 2);
  assert.equal(wrapped.overflow, true);
  assert.ok(wrapped.lines.every((l) => l.width <= 700));
});

test('font registry resolves weights and embeds @font-face data', () => {
  assert.equal(brandFontFor('Almarai', 650).weight, 700);
  assert.equal(brandFontFor('Plus Jakarta Sans', 950).weight, 800);
  const css = brandFontFaceCss([{ family: 'Almarai', weight: 800 }]);
  assert.ok(css.startsWith("@font-face{font-family:'Almarai'") && css.includes('base64,'));
});
