import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { DESIGN_AVOID, markOfVariant } from '../server/creative-intelligence/brand/design-language';
import { compileFullCreativePrompt, logoPlanOf, type CreativeBriefPlan, type CreativeDirectionPlan } from '../server/creative-intelligence/generation/full-creative';
import { resolveLogo } from '../server/creative-intelligence/logo-resolution/resolver';

const flat = (hex: string) => sharp({ create: { width: 1080, height: 1350, channels: 3, background: hex } }).png().toBuffer();
const brief: CreativeBriefPlan = { language: 'ar', objective: 'Registration', audience: 'engineers', caption: '', captions: { facebook: '', instagram: '', whatsapp: '', linkedin: '', tiktok: '', snapchat: '', website: '' }, canonicalCopy: { headline: 'عنوان', cta: 'سجّل الآن' }, directions: [] };
const direction = (extra: Partial<CreativeDirectionPlan> = {}): CreativeDirectionPlan => ({ id: 'd1', name: 'Cinematic', concept: 'c', subject: 's', composition: 'x', palette: 'p', typography: 't', mood: 'm', ...extra });

test('the resolver uses the mark and corner the director planned, and falls back to fit without a plan', async () => {
  const navy = await flat('#0B1B4D');
  const auto = await resolveLogo({ creative: navy, zones: [] });
  assert.ok(!auto.requiresCreativeRepair && markOfVariant(auto.variantId) === 'lockup');
  const symbol = await resolveLogo({ creative: navy, zones: [], preferredMark: 'symbol', preferredCorner: 'bottom-right' });
  assert.ok(!symbol.requiresCreativeRepair);
  assert.equal(markOfVariant(symbol.variantId), 'symbol');
  assert.equal(symbol.placement.anchor, 'bottom-right');
  // Colour still comes from the measured background: the reversed (white) artwork on navy.
  assert.match(symbol.variantId, /reversed/);
});

test('by default every design gets the house logo: the horizontal lockup in the top-left corner, whatever the direction planned', () => {
  assert.deepEqual(logoPlanOf(direction({ logoMark: 'symbol', logoCorner: 'bottom-right' }), 'feed'), { mark: 'horizontal', corner: 'top-left' });
  const prompt = compileFullCreativePrompt(brief, direction({ logoMark: 'symbol', logoCorner: 'bottom-right' }), 'feed');
  assert.match(prompt, /Keep the top-left area — about 34% of the width/);
  assert.match(prompt, /horizontal lockup/);
});

test('with CREATIVE_LOGO=auto the prompt reserves the planned corner at the size of the planned mark and carries the design standard', (t) => {
  process.env.CREATIVE_LOGO = 'auto';
  t.after(() => { delete process.env.CREATIVE_LOGO; });
  const prompt = compileFullCreativePrompt(brief, direction({ logoMark: 'symbol', logoCorner: 'top-right' }), 'feed');
  assert.match(prompt, /Keep the top-right area — about 17% of the width/);
  assert.match(prompt, /official logo \(symbol\)/);
  assert.match(prompt, /ART DIRECTION STANDARD\nPremium launch quality/);
  assert.ok(prompt.includes(DESIGN_AVOID[0]));
  const story = compileFullCreativePrompt(brief, direction({ logoMark: 'lockup', logoCorner: 'bottom-left' }), 'story');
  // On a story the logo space is placed where the logo goes: above the bottom platform bar, at the logo's real height.
  assert.match(story, /left area from 6% to 38% of the width and from 66% to 80% of the height \(just above the platform bar at the bottom/);
  assert.match(story, /just above the bottom 20%/);
});

test('older plans without a logo choice get the house logo', () => {
  assert.deepEqual(logoPlanOf(direction(), 'feed'), { mark: 'horizontal', corner: 'top-left' });
  assert.deepEqual(logoPlanOf(direction({ logoMark: 'wordmark' as never, logoCorner: 'middle' as never }), 'story'), { mark: 'horizontal', corner: 'top-left' });
});

test('a story keeps the logo space just below the top bar, and a recomposed story gets a full-height plan', async () => {
  const { canvasOf, logoRepairZone, recomposePlan } = await import('../server/creative-intelligence/generation/full-creative');
  const { logoReservation } = await import('../server/creative-intelligence/brand/design-language');
  const c = canvasOf('instagram-story');
  const prompt = logoReservation('lockup', 'top-left', { width: c.output.width, height: c.output.height, safe: c.safeArea });
  assert.match(prompt, /from 6% to 38% of the width and from 14% to 28% of the height \(just below the platform bar/);
  assert.match(prompt, /full lockup/);
  // The corner repair cleans the same spot, starting below the top bar.
  const zone = logoRepairZone(c, { mark: 'lockup', corner: 'top-left' });
  assert.ok(zone.y > 0.12 * Number(c.generation.split('x')[1]));
  // The feed keeps its zone unchanged.
  assert.match(logoReservation('lockup', 'top-left', { width: 1080, height: 1350, safe: { top: 0, bottom: 0, left: 0, right: 0 } }), /top-left area — about 32% of the width and 20% of the height/);
  const plan = recomposePlan('instagram-story');
  assert.match(plan, /stretched/);
  assert.match(plan, /use its whole height/);
  assert.match(plan, /Below 80%: background only/);
  assert.doesNotMatch(recomposePlan('feed'), /phone story/);
});

test('the house logo never moves corner or turns into the symbol: a busy corner is reported, then placed anyway', async () => {
  const { forcedHouseLogo } = await import('../server/creative-intelligence/generation/full-creative');
  const busy = await sharp(Buffer.from(Array.from({ length: 1080 * 1350 * 3 }, (_, i) => (i * 7919) % 251)), { raw: { width: 1080, height: 1350, channels: 3 } }).png().toBuffer();
  const strict = await resolveLogo({ creative: busy, zones: [], preferredCorner: 'top-left', preferredMark: 'horizontal', strictCorner: true });
  assert.equal(strict.requiresCreativeRepair, true);
  const placed = await forcedHouseLogo(busy, { output: { width: 1080, height: 1350 }, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } }, { mark: 'horizontal', corner: 'top-left' });
  assert.match(placed.variantId, /^horizontal-/);
  assert.equal(placed.placement.anchor, 'top-left');
  assert.ok(placed.placement.x < 120 && placed.placement.y < 120 && placed.placement.width > 250);
  const blue = await resolveLogo({ creative: await flat('#0046FF'), zones: [], preferredCorner: 'top-left', preferredMark: 'horizontal', strictCorner: true });
  assert.ok(!blue.requiresCreativeRepair && blue.variantId === 'horizontal-reversed' && blue.placement.anchor === 'top-left');
  const light = await resolveLogo({ creative: await flat('#F1F4F9'), zones: [], preferredCorner: 'top-left', preferredMark: 'horizontal', strictCorner: true });
  assert.ok(!light.requiresCreativeRepair && light.variantId === 'horizontal-positive');
});
