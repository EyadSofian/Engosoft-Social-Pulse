import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import sharp from 'sharp';
import logos from '../brand/logos.json';

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

test('brand manifest lists exactly the four approved logo artworks', () => {
  assert.deepEqual(logos.variants.map((v) => v.id).sort(), ['lockup-positive', 'lockup-reversed', 'symbol-positive', 'symbol-reversed']);
  for (const variant of logos.variants) assert.equal(variant.immutable, true);
});

test('each logo file matches its recorded hash, and its public copy is byte-identical', () => {
  for (const variant of logos.variants) {
    const source = readFileSync(variant.assetPath);
    assert.equal(sha256(source), variant.sha256, `${variant.id} changed without updating brand/logos.json`);
    assert.equal(sha256(readFileSync(`public${variant.publicPath}`)), variant.sha256, `${variant.id} public copy differs`);
  }
});

test('logo geometry and fills match the manifest', () => {
  for (const variant of logos.variants) {
    const svg = readFileSync(variant.assetPath, 'utf8');
    const [, , width, height] = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!.slice(1).map(Number);
    assert.ok(Math.abs(width / height - variant.aspectRatio) < 0.001, `${variant.id} aspect ratio`);
    assert.ok(Math.abs(width - variant.width) < 0.01 && Math.abs(height - variant.height) < 0.01, `${variant.id} size`);
    const fills = [...new Set([...svg.matchAll(/fill="(#[0-9A-F]{6})"/g)].map((m) => m[1]))].sort();
    assert.deepEqual(fills, [...variant.fills].sort(), `${variant.id} fills`);
    assert.ok(!/<rect|<image/.test(svg), `${variant.id} must not carry a background or embedded raster`);
  }
});

test('the orange dot is present in every variant and artwork colors follow the official rules', () => {
  for (const variant of logos.variants) {
    assert.ok(variant.fills.includes('#FF6600'), `${variant.id} lost its orange dot`);
    if (variant.id.endsWith('-reversed')) assert.ok(variant.fills.includes('#FFFFFF') && !variant.fills.includes('#0046FF'));
    if (variant.id.endsWith('-positive')) assert.ok(variant.fills.includes('#0046FF') && !variant.fills.includes('#FFFFFF'));
  }
  assert.ok(logos.variants.find((v) => v.id === 'lockup-positive')!.fills.includes('#1A1A1A'), 'positive tagline must stay #1A1A1A');
});

test('rendered logos have transparent backgrounds', async () => {
  for (const variant of logos.variants) {
    const { data, info } = await sharp(readFileSync(variant.assetPath), { density: 300 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corners = [0, info.width - 1, (info.height - 1) * info.width, info.height * info.width - 1];
    for (const pixel of corners) assert.equal(data[pixel * 4 + 3], 0, `${variant.id} corner is not transparent`);
  }
});
