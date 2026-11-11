import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';

// Studio images go to a throwaway folder, never ./data.
process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'kits-'));

const { BRAND_KITS, BRAND_KIT_IDS, brandKit, kitFile, maxDrawWidth } = await import('../src/domain/brand-kits');
const { BRAND_TEMPLATES, templateKit } = await import('../src/domain/brand-templates');
const { placeLogo } = await import('../server/creative-intelligence/brand/place-logo');
const { compositeLogo } = await import('../server/creative-intelligence/logo-resolution/compositor');
const { renderStudio, saveStudioImage, studioPath } = await import('../server/creative-intelligence/studio/studio');
const { STUDIO_VERSION } = await import('../src/domain/studio');

const blue = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#0443F2' } }).png().toBuffer();
const PLACE = { x: 0.03, y: 0.031, width: 0.193, height: 0.054 };

test('every kit file exists and its ratio matches the file', async () => {
  for (const id of BRAND_KIT_IDS) {
    const kit = BRAND_KITS[id];
    for (const tones of Object.values(kit.files)) for (const file of Object.values(tones ?? {})) {
      const path = resolve('public', file!.src.slice(1));
      assert.ok(existsSync(path), `${id}: ${file!.src} is missing`);
      const meta = await sharp(readFileSync(path)).metadata();
      assert.ok(Math.abs(meta.width! / meta.height! - file!.ratio) / file!.ratio < 0.02, `${file!.src}: ratio ${meta.width}/${meta.height} vs ${file!.ratio}`);
      if (!file!.vector) assert.equal(meta.width, file!.nativeWidth, `${file!.src}: native width`);
    }
  }
});

test('the old lockup is a raster capped at 1.25× its width; official files are vectors with no cap', () => {
  const old = brandKit('engo-soft-old');
  const file = kitFile(old, { onDark: true });
  assert.equal(file.vector, false);
  assert.equal(maxDrawWidth(old, file), 214 * 1.25);
  // White only: a light background still gets the white lockup rather than nothing.
  assert.equal(kitFile(old, { onDark: false }).src, file.src);
  assert.equal(maxDrawWidth(brandKit('official'), kitFile(brandKit('official'), { onDark: true })), Infinity);
  assert.equal(brandKit(undefined).id, 'official');
  assert.equal(brandKit('nonsense' as never).id, 'official');
});

test('the 50/50 template uses the old kit; every other template uses the official one', () => {
  for (const template of BRAND_TEMPLATES) assert.equal(templateKit(template).id, template.id === 'brand-campaign-offer' ? 'engo-soft-old' : 'official', template.id);
});

test('placeLogo with an official box is exactly the verified compositor', async () => {
  const canvas = await blue(1080, 1350);
  const placed = (await placeLogo(canvas, 'official', { kind: 'box', variantId: 'horizontal-reversed', x: 60, y: 50, width: 300 }))!;
  const direct = await compositeLogo(canvas, { variantId: 'horizontal-reversed', x: 60, y: 50, width: 300 });
  assert.equal(placed.kit, 'official');
  assert.ok(placed.image.equals(direct.image));
  assert.deepEqual(placed.box, { x: 60, y: 50, width: 300, height: direct.record.height });
});

test('the old kit goes at its spot on the design shape and in the same corner, never past its cap, on other shapes', async () => {
  const feed = (await placeLogo(await blue(1080, 1350), 'engo-soft-old', { kind: 'design-spot', place: PLACE, same: true, designAspect: 0.8 }))!;
  assert.ok(Math.abs(feed.box.x - 34) <= 6 && Math.abs(feed.box.y - 45) <= 6, JSON.stringify(feed.box));
  for (const [w, h] of [[1080, 1920], [1200, 630], [1702, 630], [2160, 2700]]) {
    const out = (await placeLogo(await blue(w, h), 'engo-soft-old', { kind: 'design-spot', place: PLACE, same: false, designAspect: 0.8, safe: { top: h > 1800 ? 230 : 0 } }))!;
    assert.ok(out.box.width <= 214 * 1.25 + 1, `${w}×${h}: ${out.box.width}px wide`);
    assert.ok(out.box.x < w * 0.1 && out.box.y < h * 0.25, `${w}×${h}: top-left, got ${JSON.stringify(out.box)}`);
    if (h > 1800) assert.ok(out.box.y >= 230, 'inside the story safe area');
    const { channels } = await sharp(await sharp(out.image).extract({ left: out.box.x, top: out.box.y, width: out.box.width, height: out.box.height }).toBuffer()).stats();
    assert.ok(channels[0].mean > 30, `${w}×${h}: white strokes drawn (plain blue red is ~4)`);
  }
});

test('a Studio save keeps the design\'s own old logo instead of switching to the official one (audit #10)', async () => {
  const doc = { version: STUDIO_VERSION, width: 1080, height: 1350, baseFile: saveStudioImage(await blue(1080, 1350)), layers: [], objects: [], zones: [], logo: null } as const;
  const own = await renderStudio({ ...doc, layers: [], objects: [], zones: [] }, undefined, undefined, { kit: 'engo-soft-old', place: PLACE, designAspect: 0.8 });
  assert.equal(own.doc.kit, 'engo-soft-old');
  assert.equal(own.doc.logo, null);
  assert.deepEqual(own.problems, []);
  const image = readFileSync(studioPath(own.file));
  const at = await sharp(await sharp(image).extract({ left: 34, top: 45, width: 205, height: 67 }).toBuffer()).stats();
  assert.ok(at.channels[0].mean > 50, `old lockup at its spot, got red mean ${at.channels[0].mean}`);
  const official = await renderStudio({ ...doc, layers: [], objects: [], zones: [] });
  assert.equal(official.doc.kit, 'official');
  assert.ok(official.doc.logo, 'the official logo is placed when the design has no kit of its own');
});
