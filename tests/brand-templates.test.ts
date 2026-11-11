import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { aiDrawable, BRAND_TEMPLATES, brandSamples, brandTemplate, missingInputs } from '../src/domain/brand-templates';
import { PUBLISHING_PRESETS } from '../src/domain/output-presets';
import { layoutBrandTemplate, type Measure } from '../src/features/brand-templates/layout';
import { copyInstructions, removeWhiteBackground, writableInputs } from '../server/brand-templates';

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
  const logoBox = (svg: string) => /<image href="\/brand\/logos\/engosoft-horizontal-reversed\.svg" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"/.exec(svg)!.slice(1).map(Number);
  assert.deepEqual(logoBox(feed), logoBox(square), 'same place and size on the 4:5 and the 1:1');
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
  // The copywriter gets only wording fields: never names, dates, prices or places.
  for (const template of BRAND_TEMPLATES) {
    for (const input of writableInputs(template)) assert.ok(!input.fact && input.type !== 'photo', `${template.id}.${input.key}`);
    const prompt = copyInstructions(template, 'ar');
    assert.match(prompt, /Never invent facts/);
    for (const fact of template.inputs.filter((i) => i.fact)) assert.ok(!prompt.includes(`- ${fact.key} (`), `${template.id} asks AI for ${fact.key}`);
  }
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
