import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import sharp from 'sharp';
const directory = mkdtempSync(join(tmpdir(), 'campaigns-'));
process.env.DATA_FILE = join(directory, 'test.sqlite');
process.env.MEDIA_DIR = directory;
const auth = await import('../server/auth');
const { registerCampaignRoutes, campaignIdentity } = await import('../server/campaigns');
const stamp = await import('../server/creative-intelligence/logo-resolution/campaign-stamp');
const { db, initDb } = await import('../server/db');
await initDb();

const manager = await auth.createUser({ email: 'mm@campaign.test', name: 'Marketing', role: 'marketing_manager', departmentId: 'marketing', password: 'mm-password-123' });
const creator = await auth.createUser({ email: 'maker@campaign.test', name: 'Maker', role: 'creator', departmentId: 'operations', password: 'maker-password-1' });
let acting = manager;
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use((req, _res, next) => { req.user = acting; next(); });
registerCampaignRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const call = (path: string, method = 'GET', body?: unknown) => fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await db.close(); rmSync(directory, { recursive: true, force: true }); });

/** A 600×200 green lockup inside 100 px of transparent padding, like an exported sticker. */
const lockup = async () => {
  const inner = await sharp({ create: { width: 600, height: 200, channels: 4, background: { r: 60, g: 220, b: 90, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: 800, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: inner, left: 100, top: 100 }]).png().toBuffer();
};
const canvas = { width: 1080, height: 1350 };

test('the stamp goes to the preferred corner when it is clear', () => {
  const place = stamp.stampPlacement(canvas, { width: 600, height: 200 }, 'bottom-right', 0.3, []);
  assert.equal(place.corner, 'bottom-right');
  assert.equal(place.clear, true);
  assert.equal(place.width, 324);
  assert.equal(place.height, 108);
  assert.ok(place.x + place.width < canvas.width && place.y + place.height < canvas.height);
});

test('the stamp moves away from text and the logo, then shrinks, then flags for review', () => {
  const textBottomRight = { x: 600, y: 1100, width: 480, height: 250 };
  const moved = stamp.stampPlacement(canvas, { width: 600, height: 200 }, 'bottom-right', 0.3, [textBottomRight]);
  assert.equal(moved.corner, 'bottom-left', 'the other bottom corner comes before the top ones');
  const everywhere = [{ x: 0, y: 0, width: 1080, height: 1350 }];
  const flagged = stamp.stampPlacement(canvas, { width: 600, height: 200 }, 'bottom-right', 0.3, everywhere);
  assert.equal(flagged.clear, false);
});

test('a story keeps the stamp above the platform bar', () => {
  const story = { width: 1080, height: 1920 };
  const place = stamp.stampPlacement(story, { width: 600, height: 200 }, 'bottom-left', 0.3, [], { top: 230, bottom: 330 });
  assert.ok(place.y + place.height <= story.height - 330);
});

test('the exact stamp pixels land on the creative', async () => {
  const creative = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#0046ff' } }).png().toBuffer();
  const identity = { id: 'c', name: 'Black Friday', slogan: '', hashtag: '', corner: 'bottom-right' as const, width: 0.3, stampPath: '', keyVisualPath: '' };
  const { image, placement, problem } = await stamp.applyCampaignStamp(creative, identity, await lockup(), []);
  assert.equal(problem, undefined);
  const { data } = await sharp(image).extract({ left: placement!.x + Math.round(placement!.width / 2), top: placement!.y + Math.round(placement!.height / 2), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[1] > 150 && data[2] < 150, 'the middle of the stamp is the lockup green');
  assert.equal((await stamp.applyCampaignStamp(creative, identity, null, [])).image, creative, 'no stamp, no change');
});

test('the brief and captions carry the slogan and hashtag', () => {
  const identity = { id: 'c', name: 'الجمعة البيضاء', slogan: 'جمعة تغير مسارك', hashtag: '#جمعة_تغير_مسارك', corner: 'bottom-right' as const, width: 0.3, stampPath: '/x.png', keyVisualPath: '' };
  assert.match(stamp.campaignBrief(identity), /جمعة تغير مسارك/);
  assert.match(stamp.stampRoom(identity), /bottom right/);
  // Without a stamp file the hashtag is set as a stamp, so its corner is still kept calm; with no text either, nothing.
  assert.match(stamp.stampRoom({ ...identity, stampPath: '' }), /bottom right/);
  assert.equal(stamp.stampRoom({ ...identity, stampPath: '', slogan: '', hashtag: '' }), '');
  const once = stamp.withHashtag('سجّل الآن', identity.hashtag);
  assert.equal(stamp.withHashtag(once, identity.hashtag), once);
});

test('marketing creates a campaign with its stamp; creators can read it but not change it', async () => {
  const dataUrl = `data:image/png;base64,${(await lockup()).toString('base64')}`;
  const created = await call('/api/campaigns', 'POST', { name: 'الجمعة البيضاء', slogan: 'جمعة تغير مسارك', hashtag: 'جمعة تغير مسارك', stamp: dataUrl, startsOn: '2026-11-20', endsOn: '2026-11-30' });
  assert.equal(created.status, 201);
  const campaign = await created.json();
  assert.equal(campaign.hashtag, '#جمعة_تغير_مسارك');
  assert.ok(campaign.stampUrl);
  const identity = (await campaignIdentity(campaign.id))!;
  assert.ok(existsSync(identity.stampPath));
  const meta = await sharp(identity.stampPath).metadata();
  assert.deepEqual([meta.width, meta.height], [600, 200], 'transparent edges are trimmed');

  acting = creator;
  assert.equal((await call('/api/campaigns')).status, 200);
  assert.equal((await call('/api/campaigns', 'POST', { name: 'Nope' })).status, 403);
  assert.equal((await call(`/api/campaigns/${campaign.id}`, 'PATCH', { status: 'archived' })).status, 403);
  acting = manager;
  assert.equal((await call(`/api/campaigns/${campaign.id}`, 'PATCH', { status: 'archived' })).status, 200);
  assert.equal(await campaignIdentity(campaign.id), undefined, 'an archived campaign is not used for new designs');
});

test('a campaign with only a hashtag still gets a readable stamp set in the brand font', async () => {
  const identity = { id: 'x', name: 'Test', slogan: 'جمعة تغير مسارك', hashtag: '#جمعة_تغير_مسارك', stampPath: '', keyVisualPath: '', corner: 'bottom-right' as const, width: 0.3 };
  const made = await stamp.textStamp(identity);
  assert.ok(made, 'a text stamp is made');
  const meta = await sharp(made!.png).metadata();
  assert.ok(meta.width! > meta.height!, 'a wide pill');
  assert.ok(made!.width >= 0.16 && made!.width <= 0.62);
  assert.equal(await stamp.textStamp({ ...identity, slogan: '', hashtag: '' }), null);
  assert.match(stamp.stampRoom(identity), /CAMPAIGN STAMP RESERVATION/);
});
