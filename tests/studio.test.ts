import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { migrateStudioDoc, STUDIO_VERSION, type StudioDoc } from '../src/domain/studio';
import { keyGreen, liftDecor, measureShape, measureTextBox, toRaw } from '../server/creative-intelligence/studio/pixels';
import { approvedWithBreaks, layersSvg, pasteInside } from '../server/creative-intelligence/studio/studio';
import { outlineText } from '../server/creative-intelligence/typography/text-outline';

const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();
const pixel = async (image: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};

test('an AI patch only replaces pixels inside its boxes', async () => {
  const base = await png('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#ff0000"/></svg>');
  const edited = await png('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0000ff"/></svg>');
  const out = await pasteInside(base, edited, [{ x: 10, y: 10, width: 40, height: 40 }]);
  assert.deepEqual(await pixel(out, 30, 30), [0, 0, 255]);
  assert.deepEqual(await pixel(out, 150, 80), [255, 0, 0]);
});

test('text color and lines come from the original pixels', async () => {
  const image = await png('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#0b1b4d"/><rect x="40" y="40" width="200" height="30" fill="#ffffff"/><rect x="40" y="110" width="150" height="30" fill="#ffffff"/></svg>');
  const m = measureTextBox(await toRaw(image), { x: 30, y: 30, width: 230, height: 120 });
  assert.equal(m.color, '#FFFFFF');
  assert.equal(m.lines.length, 2);
  assert.ok(Math.abs(m.lines[0].top - 40) <= 1 && Math.abs(m.lines[1].left - 40) <= 1);
});

test('a pill is measured from its fill and keeps its icon as a separate image', async () => {
  const image = await png('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#f0f0f0"/><rect x="50" y="60" width="300" height="80" rx="40" fill="#ff6600"/><circle cx="110" cy="100" r="14" fill="#ffffff"/></svg>');
  const raw = await toRaw(image);
  const shape = measureShape(raw, { x: 60, y: 66, width: 280, height: 70 }, []);
  assert.ok(Math.abs(shape.box.x - 50) <= 3 && Math.abs(shape.box.x + shape.box.width - 350) <= 3, JSON.stringify(shape.box));
  assert.equal(shape.fill, '#FF6600');
  const decor = await liftDecor(raw, shape, 40, []);
  assert.equal(decor.length, 1);
  assert.ok(Math.abs(decor[0].box.x + decor[0].box.width / 2 - 110) <= 3);
});

test('a green-screen result is keyed to a transparent cut-out', async () => {
  const image = await png('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#00ff00"/><rect x="30" y="20" width="40" height="60" fill="#334455"/></svg>');
  const keyed = await keyGreen(image, 100, 100);
  assert.ok(keyed);
  assert.deepEqual(keyed.trim, { x: 30, y: 20, width: 40, height: 60 });
  assert.equal(await keyGreen(await png('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="#123456"/></svg>'), 50, 50), null);
});

test('approved spelling fixes a misspelled line but never merges a whole headline into one line', () => {
  assert.equal(approvedWithBreaks('باحترارف', 'باحتراف'), 'باحتراف');
  assert.equal(approvedWithBreaks('باحتـــراف', 'باحتراف'), 'باحتراف');
  assert.equal(approvedWithBreaks('باحتراف', 'قُد إدارة المرافق باحتراف'), 'باحتراف');
  assert.equal(approvedWithBreaks('قد إدارة\nالمرافق باحترارف', 'قد إدارة المرافق باحتراف'), 'قد إدارة\nالمرافق باحتراف');
});

test('typed line breaks are kept and words never break in the middle', () => {
  const style = { weight: 800, size: 40, color: '#000000' };
  const kept = outlineText({ text: 'سجّل\nالآن', x: 0, y: 0, width: 2000, preserveNewlines: true, style });
  assert.deepEqual(kept.lines.map((l) => l.text), ['سجّل', 'الآن']);
  const narrow = outlineText({ text: 'أتقن Revit MEP', x: 0, y: 0, width: 10, preserveNewlines: true, style });
  assert.deepEqual(narrow.lines.map((l) => l.text.replace(/[⁦-⁩]/g, '')), ['أتقن', 'Revit', 'MEP']);
  const collapsed = outlineText({ text: 'سجّل\nالآن', x: 0, y: 0, width: 2000, style });
  assert.equal(collapsed.lines.length, 1);
});

test('older Studio documents upgrade to layered ones', () => {
  const doc = migrateStudioDoc({ version: 'studio:v1', width: 1080, height: 1350, baseFile: 'x.png', zones: [], logo: null, layers: [{ id: 't1', text: 'نص', x: 1, y: 2, width: 300, size: 40, color: '#FFFFFF', weight: 800, align: 'start', lineHeight: 1.3 }] });
  assert.equal(doc?.version, STUDIO_VERSION);
  assert.equal(doc?.layers[0].kind, 'text');
  assert.equal(doc?.layers[0].opacity, 1);
  assert.deepEqual(doc?.objects, []);
  assert.equal(migrateStudioDoc({ svgTemplate: {} }), null);
});

test('layers render in order, hidden ones are skipped', () => {
  const doc: StudioDoc = {
    version: STUDIO_VERSION, width: 400, height: 300, baseFile: '00000000-0000-0000-0000-000000000000.png', objects: [], zones: [], logo: null,
    layers: [
      { kind: 'shape', id: 's1', x: 10, y: 10, width: 200, height: 60, fill: '#FF6600', fill2: '#FF8800', radius: 30, shadow: true, opacity: 1 },
      { kind: 'text', id: 't1', text: 'سجّل الآن', x: 20, y: 20, width: 180, size: 30, color: '#FFFFFF', weight: 800, align: 'center', lineHeight: 1.3, opacity: 0.5 },
      { kind: 'shape', id: 's2', x: 0, y: 0, width: 5, height: 5, fill: '#000000', radius: 0, opacity: 1, hidden: true },
    ],
  };
  const { svg, textHeights } = layersSvg(doc);
  assert.ok(svg.indexOf('<rect') < svg.indexOf('<path'));
  assert.ok(svg.includes('url(#g-s1)') && svg.includes('feDropShadow') && svg.includes('opacity="0.5"'));
  assert.equal((svg.match(/<rect/g) ?? []).length, 1);
  assert.ok((textHeights.get('t1') ?? 0) > 20);
});

test('a shape fill is its dominant color even when white text covers much of it', async () => {
  const image = await png('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#f0f0f0"/><rect x="50" y="60" width="300" height="80" rx="40" fill="#f75913"/><rect x="120" y="80" width="160" height="40" fill="#ffffff"/></svg>');
  const shape = measureShape(await toRaw(image), { x: 55, y: 62, width: 290, height: 76 }, []);
  assert.equal(shape.fill, '#F75913');
});
