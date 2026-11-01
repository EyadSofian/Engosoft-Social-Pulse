import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { pasteInside, patchRejected } from '../server/creative-intelligence/generation/patch';

const W = 1088, H = 1360;
/** A blue poster background with a soft vertical gradient and a little texture, like the generated posts. */
const poster = (top = '#1450ff', bottom = '#0a2fd0', extra = '') => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M0 40L40 0" stroke="#fff" stroke-opacity="0.06"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#p)"/>${extra}</svg>`)).png().toBuffer();
const lettering = (x: number, y: number, fill = '#fff') => `<rect x="${x + 30}" y="${y + 30}" width="560" height="70" rx="35" fill="none" stroke="#3cff8a" stroke-width="6"/><rect x="${x + 70}" y="${y + 50}" width="480" height="30" fill="${fill}"/>`;
const box = { x: 360, y: 120, width: 640, height: 160 };

test('a black panel with the re-lettered text on it is refused (the bug users saw)', async () => {
  const raw = await poster();
  const edited = await poster('#1450ff', '#0a2fd0', `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#000"/>${lettering(box.x, box.y)}`);
  const candidate = await pasteInside(raw, edited, [box]);
  assert.equal(await patchRejected(raw, candidate, box), true);
});

test('re-lettering on a seamless continuation of the background is accepted', async () => {
  const raw = await poster('#1450ff', '#0a2fd0', lettering(box.x, box.y, '#ffe'));
  const edited = await poster('#1450ff', '#0a2fd0', lettering(box.x, box.y));
  const candidate = await pasteInside(raw, edited, [box]);
  assert.equal(await patchRejected(raw, candidate, box), false);
});

test('a flat unpainted hole is refused, as before', async () => {
  const raw = await poster();
  const edited = await poster('#1450ff', '#0a2fd0', `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#000"/>`);
  assert.equal(await patchRejected(raw, await pasteInside(raw, edited, [box]), box), true);
});

test('a calm logo corner at the canvas edge is accepted; a dark panel there is refused', async () => {
  const corner = { x: 0, y: 0, width: 348, height: 272 };
  const raw = await poster('#1450ff', '#0a2fd0', `<circle cx="150" cy="140" r="90" fill="#fff"/>`);
  const calm = await poster();
  assert.equal(await patchRejected(raw, await pasteInside(raw, calm, [corner]), corner), false);
  const dark = await poster('#1450ff', '#0a2fd0', `<rect width="348" height="272" fill="#05070c"/><circle cx="150" cy="140" r="40" fill="#fff"/>`);
  assert.equal(await patchRejected(raw, await pasteInside(raw, dark, [corner]), corner), true);
});

test('a dark design stays repairable: dark pixels that were already dark are fine', async () => {
  const raw = await poster('#05080f', '#020306', lettering(box.x, box.y, '#ddd'));
  const edited = await poster('#05080f', '#020306', lettering(box.x, box.y));
  assert.equal(await patchRejected(raw, await pasteInside(raw, edited, [box]), box), false);
});

// Cases found by adversarial review: panels the first version let through, and good repairs it refused.
const panel = (fill: string, inset: number, text = lettering(box.x, box.y), rx = 0) => poster('#1450ff', '#0a2fd0', `<rect x="${box.x + inset}" y="${box.y + inset}" width="${box.width - 2 * inset}" height="${box.height - 2 * inset}" rx="${rx}" fill="${fill}"/>${text}`);
const refused = async (edited: Buffer, raw?: Buffer, b = box) => { const base = raw ?? await poster(); return patchRejected(base, await pasteInside(base, edited, [b]), b); };

test('panels inset from the mask edge are refused: black, navy, charcoal, near-white, heavily lettered', async () => {
  for (const inset of [16, 20, 27]) assert.equal(await refused(await panel('#000', inset)), true, `black inset ${inset}`);
  assert.equal(await refused(await panel('#10204a', 20)), true, 'navy');
  assert.equal(await refused(await panel('#1a2a5a', 16, lettering(box.x, box.y), 30)), true, 'rounded navy');
  assert.equal(await refused(await panel('#1a1a1a', 16)), true, 'charcoal');
  assert.equal(await refused(await panel('#202020', 14)), true, 'dark grey');
  assert.equal(await refused(await panel('#f4f6fb', 18, `<rect x="${box.x + 80}" y="${box.y + 60}" width="480" height="40" fill="#1450ff"/>`)), true, 'near-white plate with text');
  assert.equal(await refused(await panel('#000', 16, `<rect x="${box.x + 30}" y="${box.y + 30}" width="580" height="100" fill="#fff"/>`)), true, 'black plate under heavy lettering');
});

test('a plate over half the box is refused', async () => {
  assert.equal(await refused(await poster('#1450ff', '#0a2fd0', `<rect x="${box.x}" y="${box.y}" width="${box.width / 2}" height="${box.height}" fill="#000"/>${lettering(box.x, box.y)}`)), true);
});

const onBar = (padding: number, letters = '#fff') => poster('#1450ff', '#0a2fd0', `<rect x="${box.x + 16 - padding}" y="${box.y + 16 - padding + 30}" width="${box.width - 32 + 2 * padding}" height="${box.height - 60 + 2 * padding}" rx="10" fill="#4CFF7A"/><rect x="${box.x + 70}" y="${box.y + 60}" width="480" height="30" fill="${letters}"/>`);

test('text on a green highlight bar, an orange pill or a dark band can still be re-lettered (and a no-op edit passes)', async () => {
  for (const padding of [8, 12, 16, 20, 24]) {
    const raw = await onBar(padding, '#123');
    assert.equal(await refused(raw, raw), false, `identity on a bar padded ${padding}`);
    assert.equal(await refused(await onBar(padding, '#0b1530'), raw), false, `re-lettering on a bar padded ${padding}`);
  }
  const pill = (letters: string) => poster('#1450ff', '#0a2fd0', `<rect x="${box.x + 4}" y="${box.y + 6}" width="${box.width - 8}" height="${box.height - 12}" rx="${(box.height - 12) / 2}" fill="#FF7A1A"/><rect x="${box.x + 120}" y="${box.y + 62}" width="400" height="36" fill="${letters}"/>`);
  assert.equal(await refused(await pill('#fff'), await pill('#fee')), false, 'orange pill');
  const band = (letters: string) => poster('#1450ff', '#0a2fd0', `<rect x="0" y="${box.y + 4}" width="${W}" height="${box.height - 8}" fill="#081022"/><rect x="${box.x + 70}" y="${box.y + 60}" width="480" height="30" fill="${letters}"/>`);
  assert.equal(await refused(await band('#fff'), await band('#ddd')), false, 'dark band');
});

test('calming a logo corner next to a bright area, or on a near-black poster, is accepted', async () => {
  const corner = { x: 0, y: 0, width: 348, height: 272 };
  const bright = (extra: string) => poster('#1450ff', '#0a2fd0', `<rect x="352" y="0" width="${W - 352}" height="${H}" fill="#e8d7c4"/><rect x="0" y="276" width="${W}" height="${H}" fill="#e8d7c4"/>${extra}`);
  const raw = await bright('<circle cx="150" cy="140" r="90" fill="#fff"/>');
  assert.equal(await patchRejected(raw, await pasteInside(raw, await bright(''), [corner]), corner), false, 'calm corner beside a bright backdrop');
  for (const r of [70, 100, 130]) {
    const glow = await poster('#0b0f18', '#0b0f18', `<circle cx="160" cy="130" r="${r}" fill="#3aa0ff"/>`);
    assert.equal(await patchRejected(glow, await pasteInside(glow, await poster('#0b0f18', '#0b0f18'), [corner]), corner), false, `dark poster, glow r=${r}`);
  }
});

// Second review round.
test('a plate behind only the middle line of a three-line headline is refused', async () => {
  const tall = { x: 120, y: 120, width: 848, height: 372 };
  const raw = await poster();
  for (const fill of ['#000', '#10204a', '#f4f6fb']) {
    const edited = await poster('#1450ff', '#0a2fd0', `<rect x="${tall.x + 40}" y="${tall.y + 121}" width="${tall.width - 80}" height="130" rx="14" fill="${fill}"/><rect x="${tall.x + 60}" y="${tall.y + 30}" width="700" height="60" fill="#fff"/><rect x="${tall.x + 60}" y="${tall.y + 156}" width="700" height="60" fill="#fff"/><rect x="${tall.x + 60}" y="${tall.y + 282}" width="700" height="60" fill="#fff"/>`);
    assert.equal(await patchRejected(raw, await pasteInside(raw, edited, [tall]), tall), true, fill);
  }
});

test('a thin new frame inside the box is refused wherever it falls between the rings', async () => {
  for (const [inset, stroke] of [[10, 3], [11, 2], [18, 3]]) {
    const raw = await poster('#1450ff', '#0a2fd0', `<rect x="${box.x + 70}" y="${box.y + 60}" width="480" height="30" fill="#eee"/>`);
    const edited = await poster('#1450ff', '#0a2fd0', `<rect x="${box.x + inset}" y="${box.y + inset}" width="${box.width - 2 * inset}" height="${box.height - 2 * inset}" rx="14" fill="none" stroke="#3cff8a" stroke-width="${stroke}"/><rect x="${box.x + 70}" y="${box.y + 60}" width="480" height="30" fill="#fff"/>`);
    assert.equal(await patchRejected(raw, await pasteInside(raw, edited, [box]), box), true, `inset ${inset} stroke ${stroke}`);
  }
});

test('a dark scrim over a full-width box at the top of the canvas is refused', async () => {
  const top = { x: 0, y: 0, width: W, height: 220 };
  const raw = await poster();
  const edited = await poster('#1450ff', '#0a2fd0', `<rect x="20" y="20" width="${W - 40}" height="180" fill="#000" fill-opacity="0.35"/>`);
  assert.equal(await patchRejected(raw, await pasteInside(raw, edited, [top]), top), true);
});
