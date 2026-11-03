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

test('by default every design gets the house logo: the lockup in the top-left corner, whatever the direction planned', () => {
  assert.deepEqual(logoPlanOf(direction({ logoMark: 'symbol', logoCorner: 'bottom-right' }), 'feed'), { mark: 'lockup', corner: 'top-left' });
  const prompt = compileFullCreativePrompt(brief, direction({ logoMark: 'symbol', logoCorner: 'bottom-right' }), 'feed');
  assert.match(prompt, /Keep the top-left area — about 32% of the width/);
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
  assert.match(story, /left area from 0% to 32% of the width and from 69% to 83% of the height \(just above the platform bar at the bottom/);
  assert.match(story, /just above the bottom 17%/);
});

test('older plans without a logo choice keep the format default', () => {
  assert.deepEqual(logoPlanOf(direction(), 'feed'), { mark: 'lockup', corner: 'top-left' });
  assert.deepEqual(logoPlanOf(direction({ logoMark: 'wordmark' as never, logoCorner: 'middle' as never }), 'story'), { mark: 'lockup', corner: 'top-left' });
});

test('a story keeps the logo space just below the top bar, and a recomposed story gets a full-height plan', async () => {
  const { canvasOf, logoRepairZone, recomposePlan } = await import('../server/creative-intelligence/generation/full-creative');
  const { logoReservation } = await import('../server/creative-intelligence/brand/design-language');
  const c = canvasOf('instagram-story');
  const prompt = logoReservation('lockup', 'top-left', { width: c.output.width, height: c.output.height, safe: c.safeArea });
  assert.match(prompt, /from 6% to 38% of the width and from 13% to 27% of the height \(just below the platform bar/);
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
