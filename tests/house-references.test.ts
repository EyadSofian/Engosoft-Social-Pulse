import assert from 'node:assert/strict';
import { test } from 'node:test';
import { houseReferences, referenceKind, referencePrompt, HOUSE_REFERENCE_SETS } from '../server/creative-intelligence/generation/house-references';
import { textBoxFor } from '../server/creative-intelligence/generation/full-creative';
import { existsSync } from 'node:fs';

test('the kind of post picks the closest approved Engosoft posts', () => {
  assert.equal(referenceKind('إعلان دورة CFM لمديري المرافق'), 'course');
  assert.equal(referenceKind('تهنئة خريجي دورة السيارات'), 'graduation');
  assert.equal(referenceKind('مساعد ماجد بالذكاء الاصطناعي'), 'ai');
  assert.equal(referenceKind('الدعم الفني على مدار الساعة'), 'service');
  assert.equal(referenceKind('بمناسبة اليوم العالمي للفنان'), 'occasion');
  for (const files of Object.values(HOUSE_REFERENCE_SETS)) for (const f of files) assert.ok(existsSync(`public/design-references/${f}`), f);
});

test('new posts get three reference images and a prompt that says how to use them; they can be turned off', async () => {
  const refs = await houseReferences('دورة PMP');
  assert.equal(refs.length, 3);
  assert.ok(refs.every((r) => r.mime === 'image/jpeg' && r.data.length > 10_000));
  assert.match(referencePrompt(refs), /REFERENCE IMAGES[\s\S]*Create a completely NEW post/);
  assert.match(referencePrompt(refs), /do not copy[\s\S]*logos/);
  assert.deepEqual(await houseReferences('دورة PMP', '', { CREATIVE_REFERENCE_IMAGES: 'off' }), []);
  assert.equal(referencePrompt([]), '');
});

test('a misspelt headline is found across the lines it was read in', () => {
  const box = textBoxFor({
    texts: [{ text: 'قُد المرافق', box: { x: 0.5, y: 0.1, width: 0.4, height: 0.08 } }, { text: 'باحترف', box: { x: 0.55, y: 0.19, width: 0.35, height: 0.08 } }, { text: 'سجّل الآن', box: { x: 0.6, y: 0.5, width: 0.3, height: 0.05 } }],
    copyAudit: [{ expected: 'قُد المرافق باحتراف', rendered: 'قد المرافق باحترف', exact: false }],
  }, 'قُد المرافق باحتراف');
  assert.ok(box);
  assert.ok(Math.abs(box!.y - 0.1) < 1e-9 && Math.abs(box!.y + box!.height - 0.27) < 1e-9, 'both headline lines, not the CTA');
});
