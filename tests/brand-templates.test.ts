import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { aiDrawable, BRAND_TEMPLATES, brandSamples, brandTemplate, missingInputs } from '../src/domain/brand-templates';
import { PUBLISHING_PRESETS } from '../src/domain/output-presets';
import { layoutBrandTemplate, type Measure } from '../src/features/brand-templates/layout';
import { clipWords, fillableInputs, fillInstructions, keepGivenFacts, removeWhiteBackground } from '../server/brand-templates';

/** Rough widths without a browser: Arabic and Latin glyphs at about half and 0.56 of the font size. */
const measure: Measure = (text, font) => {
  const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  return [...text].length * size * (/[؀-ۿ]/.test(text) ? 0.5 : 0.56);
};
const sizes = [...new Map(PUBLISHING_PRESETS.map((p) => [`${p.width}x${p.height}`, p])).values()];

test('every brand template lays out at every publishing size, inside its own canvas', () => {
  for (const template of BRAND_TEMPLATES) {
    for (const surface of template.surfaces) {
      for (const lang of ['ar', 'en'] as const) {
        for (const preset of sizes) {
          const svg = layoutBrandTemplate({ template, surface, measure, values: brandSamples(template, lang), canvas: { width: preset.width, height: preset.height, safe: preset.safe } });
          assert.match(svg, new RegExp(`^<svg[^>]+width="${preset.width}" height="${preset.height}" viewBox="0 0 ${preset.width} ${preset.height}"`), `${template.id} ${preset.id}`);
          assert.ok(!/NaN|undefined|Infinity/.test(svg), `${template.id} ${surface} ${lang} ${preset.id} has a broken number`);
          // Every text block starts on the canvas.
          for (const m of svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)"/g)) {
            const [x, y] = [Number(m[1]), Number(m[2])];
            assert.ok(x >= -1 && x <= preset.width + 1 && y > 0 && y <= preset.height + 1, `${template.id} ${preset.id}: text at ${x},${y}`);
          }
        }
      }
    }
  }
});

test('the official logo is the brand file in the artwork that suits the surface, at the same place', () => {
  const headline = brandTemplate('brand-headline')!;
  const at = (surface: 'light' | 'blue', width = 1080, height = 1350) => layoutBrandTemplate({ template: headline, surface, measure, values: brandSamples(headline, 'ar'), canvas: { width, height } });
  // The headline post frames the logo in a band of the other surface, as in the pack.
  assert.match(at('light'), /href="\/brand\/logos\/engosoft-horizontal-reversed\.svg"/);
  assert.match(at('blue'), /href="\/brand\/logos\/engosoft-horizontal-positive\.svg"/);
  const offer = brandTemplate('brand-campaign-offer')!;
  const feed = layoutBrandTemplate({ template: offer, surface: 'blue', measure, values: brandSamples(offer, 'ar'), canvas: { width: 1080, height: 1350 } });
  const square = layoutBrandTemplate({ template: offer, surface: 'blue', measure, values: brandSamples(offer, 'ar'), canvas: { width: 1080, height: 1080 } });
  // The campaign template uses the campaign's own (older) lockup, with the background grain masked over it.
  const logoBox = (svg: string) => /<image href="\/brand\/logos\/engosoft-old-lockup-reversed\.png" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"[^>]*filter=[^>]*\/><rect[^>]+mask=/.exec(svg)!.slice(1).map(Number);
  assert.deepEqual(logoBox(feed), logoBox(square), 'same place and size on the 4:5 and the 1:1');
  assert.ok(logoBox(feed)[2] <= 214 * 1.25, 'drawn near its native size, so it stays sharp');
  assert.ok(!/engosoft-horizontal/.test(feed));
  // Never the old stacked lockup or a drawn mark.
  for (const template of BRAND_TEMPLATES) assert.ok(!/engosoft-lockup-/.test(layoutBrandTemplate({ template, surface: template.surfaces[0], measure, values: brandSamples(template, 'ar'), canvas: { width: 1080, height: 1350 } })));
});

test('a story keeps the brand story proportions: logo near the top, footer above the reply bar', () => {
  const template = brandTemplate('brand-carousel')!;
  const svg = layoutBrandTemplate({ template, surface: 'blue', measure, values: brandSamples(template, 'ar'), canvas: { width: 1080, height: 1920, safe: { top: 270, bottom: 390, left: 65, right: 65 } } });
  const [, , y] = /<image href="[^"]+horizontal[^"]+" x="([\d.]+)" y="([\d.]+)"/.exec(svg)!.map(Number);
  assert.ok(Math.abs(y - 1920 * 0.06) < 2, `logo at ${y}`);
});

test('each template declares what it needs; real people and campaign files are never drawn by AI', () => {
  const instructor = brandTemplate('brand-instructor')!;
  const photo = instructor.inputs.find((i) => i.key === 'instructorPhoto')!;
  assert.equal(photo.required, true);
  assert.equal(aiDrawable(photo), false);
  assert.equal(aiDrawable(brandTemplate('brand-campaign-offer')!.inputs.find((i) => i.key === 'stamp')!), false);
  assert.equal(aiDrawable(brandTemplate('brand-photo-card')!.inputs.find((i) => i.key === 'photo')!), true);
  assert.deepEqual(missingInputs(instructor, {}).map((i) => i.key), ['title', 'instructorPhoto', 'instructorName']);
  // One request fills every word and fact, but facts only from what the person gave.
  for (const template of BRAND_TEMPLATES) {
    assert.ok(fillableInputs(template).every((input) => input.type !== 'photo'), template.id);
    const prompt = fillInstructions(template, 'ar');
    assert.match(prompt, /Never invent a number/);
    for (const fact of template.inputs.filter((i) => i.fact)) assert.ok(prompt.includes(`- ${fact.key} (`) && prompt.includes('[FACT]'), `${template.id} misses ${fact.key}`);
  }
});

test('a fact whose numbers the person never gave is dropped', () => {
  const offer = brandTemplate('brand-campaign-offer')!;
  const kept = keepGivenFacts(offer, { headline: 'مشاريع أكبر 2026', price: '700', oldPrice: '1,400' }, 'عرض PMP السعر ٧٠٠ بدل 1400');
  assert.deepEqual(kept, { headline: 'مشاريع أكبر 2026', price: '700', oldPrice: '1,400' });
  assert.equal(keepGivenFacts(offer, { price: '650' }, 'عرض PMP بخصم').price, '');
});

test('a drawn cut-out loses its white studio background but keeps white inside the person', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#fff"/><rect x="60" y="40" width="80" height="160" fill="#203060"/><rect x="85" y="80" width="30" height="40" fill="#fff"/></svg>';
  const out = await removeWhiteBackground(await sharp(Buffer.from(svg)).png().toBuffer());
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alpha(5, 5), 0);
  assert.equal(alpha(100, 100), 255, 'white inside the subject stays');
  assert.equal(alpha(100, 150), 255);
});

test('a line over its limit is cut at a whole word, never mid-word', () => {
  assert.equal(clipWords('3 تخصصات تفتح لك آفاق جديدة: Architecture, Structure, MEP', 48), '3 تخصصات تفتح لك آفاق جديدة: Architecture');
  assert.equal(clipWords('من التصميم للتنفيذ.. الـBIM يجمع كل حاجة', 34), 'من التصميم للتنفيذ.. الـBIM يجمع');
  assert.equal(clipWords('قصير', 20), 'قصير');
});

test('two prices for two options are not written as an old and a new price', () => {
  const prompt = fillInstructions(brandTemplate('brand-campaign-offer')!, 'ar');
  assert.match(prompt, /different options \(online and offline/);
});
