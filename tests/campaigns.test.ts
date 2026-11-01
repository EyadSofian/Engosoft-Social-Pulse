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
const analysis = await import('../server/campaign-analysis');
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
  const archived = await (await call('/api/campaigns')).json() as { id: string; slogan: string; hashtag: string; startsOn: string }[];
  const kept = archived.find((c) => c.id === campaign.id)!;
  assert.deepEqual([kept.slogan, kept.hashtag, kept.startsOn], ['جمعة تغير مسارك', '#جمعة_تغير_مسارك', '2026-11-20'], 'archiving keeps the slogan, hashtag and dates');
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

/** A finished post like the ones marketing uploads: a blue gradient, a small wordmark and a green sticker. */
const finishedPost = () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a3cff"/><stop offset="1" stop-color="#0631c8"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><rect x="60" y="60" width="180" height="30" fill="#fff"/><rect x="340" y="560" width="400" height="200" rx="30" fill="#2bd96b"/><rect x="380" y="610" width="320" height="40" fill="#0a3cff"/></svg>`)).png().toBuffer();

test('the sticker is cut out of a finished post: cropped to the box the model gave and its flat background removed', async () => {
  const post = await finishedPost();
  const detect = async () => ({ name: 'الجمعة البيضاء', slogan: 'جمعة تغير مسارك', hashtag: 'جمعة تغير مسارك', lockup: { x: 0.3, y: 0.4, width: 0.4, height: 0.17 }, corner: 'bottom-right' as const, palette: ['#0A3CFF', '#2BD96B', 'blue'], style: 'Electric blue background, green sticker.' });
  const result = await analysis.analyzeCampaignImage(`data:image/png;base64,${post.toString('base64')}`, {}, detect);
  assert.equal(result.background, 'removed');
  assert.equal(result.hashtag, '#جمعة_تغير_مسارك');
  assert.deepEqual(result.palette, ['#0A3CFF', '#2BD96B']);
  assert.equal(result.wholeDesign, true, 'the upload was a whole post, so it doubles as the key visual');
  const cut = Buffer.from(result.stamp!.split(',')[1], 'base64');
  const meta = await sharp(cut).metadata();
  assert.ok(Math.abs(meta.width! - 400) <= 6 && Math.abs(meta.height! - 200) <= 6, `trimmed to the sticker, got ${meta.width}×${meta.height}`);
  const { data, info } = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  assert.equal(at(1, 1), 0, 'the corner outside the rounded sticker is transparent');
  assert.equal(at(Math.round(info.width / 2), Math.round(info.height / 2)), 255, 'the blue text bar inside the sticker survives');
});

test('an image with no sticker gives no stamp, and a transparent PNG is only trimmed', async () => {
  const none = await analysis.analyzeCampaignImage(`data:image/png;base64,${(await finishedPost()).toString('base64')}`, {}, async () => ({ name: '', slogan: 'x', hashtag: '', lockup: null, corner: 'bottom-right', palette: [], style: '' }));
  assert.equal(none.stamp, null);
  assert.equal((await analysis.cutOut(await lockup())).background, 'transparent');
});
