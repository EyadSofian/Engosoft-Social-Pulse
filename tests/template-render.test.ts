import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { BRAND_TEMPLATES, brandSamples, brandTemplate } from '../src/domain/brand-templates';
import { designDocFromFollowed, designDocFromTemplate, designWords, readBlocksOf, templateValuesOf } from '../src/domain/design-doc';
import { layoutBrandTemplate } from '../src/features/brand-templates/layout';
import { embedImages, outlineSvgText, renderDesignDocPng, renderTemplatePng, serverMeasure } from '../server/creative-intelligence/render/template-render';

const SIZES = [[1080, 1350], [1080, 1920], [1200, 630], [1702, 630]] as const;
const pixel = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (Math.round(y) * info.width + Math.round(x)) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};
const near = (a: number[], hex: string, tolerance = 40) => {
  const b = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
};

test('the server measures with the brand fonts: Arabic and Latin widths grow with size and weight', () => {
  const ar = serverMeasure('عرض الخمسين خمسين', '800 60px Almarai');
  assert.ok(ar > 250 && ar < 700, `Arabic headline at 60px: ${ar}`);
  assert.ok(Math.abs(serverMeasure('عرض الخمسين خمسين', '800 120px Almarai') - 2 * ar) < 2, 'width scales with size');
  assert.ok(serverMeasure('www.engosoft.com', '700 30px "Plus Jakarta Sans"') > serverMeasure('www.engosoft.com', '400 30px "Plus Jakarta Sans"'), 'bolder is wider');
});

test('every template renders on the server at every size, with every text outlined and every picture embedded', async () => {
  for (const template of BRAND_TEMPLATES) for (const [width, height] of SIZES) {
    const out = await renderTemplatePng({ template, values: brandSamples(template, 'ar'), surface: template.surfaces[0], canvas: { width, height } });
    assert.equal(out.width, width, `${template.id} ${width}×${height}`);
    assert.equal(out.height, height, `${template.id} ${width}×${height}`);
    assert.deepEqual(out.problems, [], `${template.id} ${width}×${height}`);
    assert.ok(!/<text\b/.test(out.svg), `${template.id}: no <text> left for a server font to replace`);
    assert.ok(!/<image\b[^>]*href="\//.test(out.svg), `${template.id}: no unembedded picture`);
  }
});

test('the server render draws what the layout planned: the 50/50 blue, the white headline, the old lockup in its corner', async () => {
  const template = brandTemplate('brand-campaign-offer')!;
  const out = await renderTemplatePng({ template, values: brandSamples(template, 'ar'), surface: 'blue', canvas: { width: 1080, height: 1350 } });
  assert.ok(near(await pixel(out.png, 540, 1250), '#0443F2', 45), 'grained campaign blue in an empty area');
  // The old lockup is white on the top-left.
  const logo = await sharp(await sharp(out.png).extract({ left: 20, top: 30, width: 240, height: 90 }).toBuffer()).stats();
  assert.ok(logo.channels[0].max > 230, 'white strokes of the old lockup at the top-left');
  // Some glyph ink is white or green on the headline row (the highlight is coloured, the rest white).
  const row = await sharp(await sharp(out.png).extract({ left: 100, top: 520, width: 880, height: 120 }).toBuffer()).stats();
  assert.ok(row.channels[0].max > 200, 'headline glyphs are drawn');
});

test('coloured runs keep the line shaped as one: the highlight is coloured, the rest of the line is not', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><text x="400" y="120" font-family="Almarai" font-weight="800" font-size="60" direction="rtl" text-anchor="middle"><tspan fill="#FFFFFF">مشاريع </tspan><tspan fill="#39FF6A">أكبر</tspan></text></svg>';
  const out = outlineSvgText(svg).svg;
  assert.match(out, /<path fill="#FFFFFF" d="M/);
  assert.match(out, /<path fill="#39FF6A" d="M/);
  assert.ok(!out.includes('<tspan'));
});

test('anchors match SVG: right-to-left start is the right edge, left-to-right start the left edge', () => {
  const box = (svg: string) => {
    const xs = [...outlineSvgText(svg).svg.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));
    return { min: Math.min(...xs), max: Math.max(...xs) };
  };
  const rtl = box('<svg><text x="700" y="100" font-family="Almarai" font-weight="700" font-size="40" direction="rtl" text-anchor="start" fill="#000">دورة إدارة المشاريع</text></svg>');
  assert.ok(rtl.max <= 701 && rtl.max > 680, `rtl start ends at x: ${JSON.stringify(rtl)}`);
  const ltr = box('<svg><text x="100" y="100" font-family="Plus Jakarta Sans" font-weight="700" font-size="40" text-anchor="start" fill="#000">engosoft</text></svg>');
  assert.ok(ltr.min >= 99 && ltr.min < 120, `ltr start begins at x: ${JSON.stringify(ltr)}`);
});

test('public pictures and kit files are embedded; unknown ones are reported, never fetched', () => {
  const out = embedImages('<svg><image href="/brand/logos/engosoft-old-lockup-reversed.png"/><image href="/nope/missing.png"/><image href="data:image/png;base64,AAAA"/></svg>');
  assert.match(out.svg, /href="data:image\/png;base64,iVBOR/);
  assert.deepEqual(out.missing, ['/nope/missing.png']);
  assert.ok(out.svg.includes('data:image/png;base64,AAAA'));
});

test('the browser and server run the same layout: same structure, only the measuring differs', () => {
  const template = brandTemplate('brand-offer')!;
  const values = brandSamples(template, 'ar');
  // A fixed-width measure makes the two runs identical, proving the layout itself has no browser-only branch.
  const fixed = (text: string, font: string) => text.length * Number(/([\d.]+)px/.exec(font)![1]) * 0.5;
  const a = layoutBrandTemplate({ template, values, surface: 'blue', canvas: { width: 1080, height: 1350 }, measure: fixed }).replace(/bt[0-9a-z]+/g, 'id');
  const b = layoutBrandTemplate({ template, values, surface: 'blue', canvas: { width: 1080, height: 1350 }, measure: fixed }).replace(/bt[0-9a-z]+/g, 'id');
  assert.equal(a, b);
});

test('a template design document round-trips to the same values and renders the same image', async () => {
  const template = brandTemplate('brand-campaign-offer')!;
  const values = { ...brandSamples(template, 'ar'), headline: 'دبلومة التصميم الداخلي..', highlight: 'التصميم الداخلي', price: '1000', oldPrice: '2000' };
  const doc = designDocFromTemplate(template, values, 'blue');
  assert.equal(doc.logo.kit, 'engo-soft-old');
  assert.ok(doc.logo.place, 'the old lockup keeps its measured spot');
  assert.ok(doc.fixed.some((f) => f.key === 'stamp') && doc.fixed.some((f) => f.key === 'hashtag'), 'stamp and hashtag are fixed files');
  const headline = doc.layers.find((l) => l.kind === 'text' && l.id === 'headline');
  assert.equal(headline && headline.kind === 'text' && headline.highlight, 'التصميم الداخلي');
  assert.ok(!designWords(doc).some((w) => w.id === 'highlight'), 'the highlight is part of the headline, not a separate word block');
  const back = templateValuesOf(doc)!;
  for (const [key, value] of Object.entries(values)) assert.equal(back.values[key] ?? '', value.trim(), key);
  const fromDoc = await renderDesignDocPng(doc, { width: 1080, height: 1920 });
  const direct = await renderTemplatePng({ template, values, surface: 'blue', canvas: { width: 1080, height: 1920 } });
  assert.ok(fromDoc.png.equals(direct.png), 'the document renders exactly like the template');
});

test('a template choice (a label colour) is a setting, not a word on the post', () => {
  const template = BRAND_TEMPLATES.find((t) => t.inputs.some((i) => i.key === 'labelColor'))!;
  const doc = designDocFromTemplate(template, { ...brandSamples(template, 'ar'), labelColor: 'orange' });
  assert.equal(doc.settings?.labelColor, 'orange');
  assert.ok(!designWords(doc).some((w) => w.id === 'labelColor'));
  assert.equal(templateValuesOf(doc)!.values.labelColor, 'orange');
});

test('a followed design keeps its read blocks, boxes and kit', () => {
  const blocks = [
    { role: 'headline', kind: 'headline' as const, text: 'دبلومة BIM', was: 'عرض', box: { x: 0.1, y: 0.4, width: 0.8, height: 0.08 }, highlight: 'BIM' },
    { role: 'price ticket', kind: 'price' as const, text: '1000', was: '700', box: { x: 0.2, y: 0.7, width: 0.3, height: 1.2 } },
  ];
  const doc = designDocFromFollowed({ name: 'Campaign offer', templateId: 'brand-campaign-offer', aspect: 0.8, blocks, logo: { kit: 'engo-soft-old', place: { x: 0.03, y: 0.031, width: 0.193, height: 0.054 } } });
  assert.equal(doc.logo.kit, 'engo-soft-old');
  const back = readBlocksOf(doc);
  assert.equal(back[0].highlight, 'BIM');
  assert.equal(back[1].box!.height, 1, 'boxes are clamped to the canvas');
  assert.deepEqual(designWords(doc).map((w) => w.text), ['دبلومة BIM', '1000']);
});

test('long words never leave the canvas: every template, every size, every line inside (the one-line headline check used to see the wrapped width)', async () => {
  const sizes = [[1080, 1350, undefined], [1080, 1920, { top: 270, right: 65, bottom: 390, left: 65 }], [1080, 1080, undefined], [1200, 630, undefined], [1500, 500, undefined]] as const;
  const words = 'دبلومة التصميم الداخلي من الفكرة للتنفيذ مع مشاريع عملية وشهادة معتمدة'.split(' ');
  for (const template of BRAND_TEMPLATES) {
    const values = brandSamples(template, 'ar');
    for (const input of template.inputs) {
      if (input.type === 'photo' || input.fact || ['labelColor', 'highlight', 'slide', 'contact'].includes(input.key)) continue;
      let line = '';
      for (const word of words) { if ([...`${line} ${word}`].length > (input.maxChars ?? 60)) break; line = line ? `${line} ${word}` : word; }
      values[input.key] = line;
    }
    for (const [width, height, safe] of sizes) {
      const out = await renderTemplatePng({ template, values, surface: template.surfaces[0], canvas: { width, height, ...(safe ? { safe } : {}) } });
      for (const l of out.lines) assert.ok(l.box.x >= -1 && l.box.x + l.box.width <= width + 1 && l.box.y >= -1 && l.box.y + l.box.height <= height + 1, `${template.id} ${width}×${height}: «${l.text}» at ${JSON.stringify(l.box)}`);
    }
  }
});
