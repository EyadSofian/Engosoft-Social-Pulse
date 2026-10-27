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

test('the prompt reserves the planned corner at the size of the planned mark and carries the design standard', () => {
  const prompt = compileFullCreativePrompt(brief, direction({ logoMark: 'symbol', logoCorner: 'top-right' }), 'feed');
  assert.match(prompt, /Keep the top-right area — about 17% of the width/);
  assert.match(prompt, /official logo \(symbol\)/);
  assert.match(prompt, /ART DIRECTION STANDARD\nPremium launch quality/);
  assert.ok(prompt.includes(DESIGN_AVOID[0]));
  const story = compileFullCreativePrompt(brief, direction({ logoMark: 'lockup', logoCorner: 'bottom-left' }), 'story');
  assert.match(story, /bottom-left area — about 32% of the width/);
  assert.match(story, /just above the bottom 17%/);
});

test('older plans without a logo choice keep the format default', () => {
  assert.deepEqual(logoPlanOf(direction(), 'feed'), { mark: 'lockup', corner: 'top-left' });
  assert.deepEqual(logoPlanOf(direction({ logoMark: 'wordmark' as never, logoCorner: 'middle' as never }), 'story'), { mark: 'lockup', corner: 'top-left' });
});
