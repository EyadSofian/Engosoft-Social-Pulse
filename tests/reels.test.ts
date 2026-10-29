import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';

const directory = mkdtempSync(join(tmpdir(), 'sp-reels-'));
process.env.DATA_FILE = join(directory, 'test.sqlite');
process.env.MEDIA_DIR = directory;
delete process.env.OPENAI_API_KEY;
const { checkReel, reelFacts, REEL_RULES } = await import('../src/domain/reels');
const { designReelCover, reelCoverPrompt } = await import('../server/reference-designs');

const vertical = { duration: 45, width: 1080, height: 1920, bytes: 40_000_000 };

test('a 45-second 9:16 Reel fits every short-video platform', () => {
  for (const channel of ['instagram', 'facebook', 'tiktok', 'snapchat', 'youtube'] as const) assert.deepEqual(checkReel(vertical, channel), [], channel);
});

test('each platform names why a video does not fit it', () => {
  const long = { ...vertical, duration: 75 };
  assert.equal(checkReel(long, 'instagram').length, 0);
  assert.match(checkReel(long, 'snapchat')[0].text.ar, /أطول من 1:00 \(مدته 1:15\)/);
  assert.deepEqual(checkReel(long, 'facebook'), [], 'Facebook Reels stop at 90 s; 75 s is fine');
  assert.equal(checkReel({ ...vertical, duration: 95 }, 'facebook')[0].level, 'error');
  assert.equal(checkReel({ ...vertical, duration: 2 }, 'instagram')[0].level, 'error');
  const square = checkReel({ ...vertical, width: 1080, height: 1080 }, 'instagram');
  assert.deepEqual(square.map((i) => i.level), ['warn'], 'a square video still publishes, with a warning');
  assert.equal(checkReel({ ...vertical, width: 480, height: 854 }, 'snapchat')[0].level, 'error');
  assert.equal(checkReel({ ...vertical, bytes: 300 * 1024 * 1024 }, 'tiktok')[0].level, 'error');
  assert.equal(checkReel(vertical, 'website')[0].level, 'warn');
  assert.equal(REEL_RULES.youtube?.max, 180);
});

test('AI captions for a Reel are written from the idea or the script only', () => {
  const idea = reelFacts('3 أخطاء في PMP', 'idea', 'المحاضر بيشرح 3 أخطاء');
  assert.match(idea, /never visuals you were not told about/);
  assert.match(idea, /Idea of the video: المحاضر/);
  assert.match(reelFacts('t', 'script', 'مشهد 1'), /Script of the video:\nمشهد 1/);
  assert.ok(reelFacts('t', 'script', 'x'.repeat(5000)).length <= 3000);
});

test('the AI cover is designed from the chosen frame at 1080×1920 with the title, and the logo is placed after', async () => {
  const prompt = reelCoverPrompt('3 أخطاء في امتحان PMP');
  assert.match(prompt, /Use the attached frame from the video as the hero image/);
  assert.match(prompt, /"3 أخطاء في امتحان PMP"/);
  assert.match(prompt, /Full-screen vertical canvas/);
  const frameId = '00000000-0000-4000-a000-0000000000f1';
  mkdirSync(join(directory, 'uploads'), { recursive: true });
  writeFileSync(join(directory, 'uploads', `${frameId}.png`), await sharp({ create: { width: 540, height: 960, channels: 3, background: { r: 40, g: 40, b: 40 } } }).png().toBuffer());
  let seen: { size: string; images: number } | undefined;
  const provider = {
    name: 'test', model: 'test-cover',
    generate: async () => { throw new Error('the cover must start from the frame'); },
    edit: async (req: { size: string; images: { data: Buffer }[] }) => {
      seen = { size: req.size, images: req.images.length };
      return [{ png: await sharp({ create: { width: 1088, height: 1936, channels: 3, background: { r: 0, g: 70, b: 255 } } }).png().toBuffer(), model: 'test-cover' }];
    },
  };
  const result = await designReelCover(`/api/uploads/${frameId}.png`, 'دورة CFM', provider as never);
  assert.deepEqual(seen, { size: '1088x1936', images: 1 });
  assert.match(result.imageUrl, /^\/api\/uploads\/[0-9a-f-]{36}\.png$/);
  const meta = await sharp(join(directory, 'uploads', result.imageUrl.split('/').pop()!)).metadata();
  assert.deepEqual([meta.width, meta.height], [1080, 1920]);
  await assert.rejects(designReelCover('/api/uploads/00000000-0000-4000-a000-0000000000ff.png', 'x', provider as never), /اختر لقطة/);
});
