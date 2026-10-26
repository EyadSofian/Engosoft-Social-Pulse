import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileDefaultImagePrompt, IMAGE_PROMPT_VERSION } from '../server/image-prompt-compiler';
import { parseImageAssessment } from '../server/image-quality';
import { validateLogoLayer } from '../src/features/brand/registry';
import { composeCreativeDesign, renderCreativeSvg, upgradeLegacyDesign } from '../src/features/creative-studio/creative-renderer';
import logos from '../brand/logos.json';
import { resolveEvent, scoreEventMatch } from '../src/features/creative-studio/context-resolver';
import { localDirections } from '../src/features/creative-studio/design-plan';
import { retrieveVisualReferences } from '../src/features/creative-studio/visual-references';
import scenarios from './fixtures/creative-scenarios.json';

test('reference library contains individual cards and assigns distinct roles', () => {
  const results = retrieveVisualReferences('ويبينار CFM', 'event', 4);
  assert.equal(results.length, 4);
  assert.deepEqual(results.map((item) => item.role), ['content', 'composition', 'color-and-mood', 'subject-treatment']);
  assert.ok(results.every((item) => item.image.startsWith('/reference-cards/')));
  assert.ok(results.every((item) => item.qualityScore === null && item.performance === null));
});

test('CFM generates four distinct direction compositions', () => {
  const directions = localDirections('ويبينار CFM للمهندسين', 'event');
  assert.equal(new Set(directions.map((item) => item.composition)).size, 4);
  assert.ok(directions.every((item) => item.referenceIds.length > 0));
});

test('image prompt is versioned, role-aware and excludes baked-in branding', () => {
  const direction = localDirections('ويبينار CFM للمهندسين', 'event')[0];
  const plan = compileDefaultImagePrompt('CFM facility management webinar', 'event', direction);
  assert.equal(plan.version, IMAGE_PROMPT_VERSION);
  assert.match(plan.prompt, /Actual requested subject: CFM facility management webinar/);
  assert.match(plan.prompt, /role composition/);
  assert.match(plan.prompt, /absolutely no text/i);
  assert.match(plan.prompt, /official Engosoft logo/);
  assert.equal(plan.negativeSpace, 'right');
});

test('quality parser rejects low or fatal results and accepts strong ones', () => {
  const base = { issues: [], strengths: ['Clear copy space'], revision: '', fatal: false };
  assert.equal(parseImageAssessment({ ...base, score: 74 }).pass, false);
  assert.equal(parseImageAssessment({ ...base, score: 85, fatal: true }).pass, false);
  assert.equal(parseImageAssessment({ ...base, score: 85 }).pass, true);
  assert.throws(() => parseImageAssessment({ ...base, score: 110 }));
});

test('Odoo event match keeps facts sourced and exposes date conflict', () => {
  const event = { id: 'event.event:1', title: 'CFM Webinar', startsAt: '2026-11-05T18:00:00Z', endsAt: '2026-11-05T20:00:00Z', source: 'event.event' };
  assert.ok(scoreEventMatch('اعمل بوست ويبينار CFM', event) > 0);
  const resolved = resolveEvent(event, '2026-11-03');
  assert.equal(resolved.startsAt.source, 'odoo');
  assert.equal(resolved.startsAt.verified, true);
  assert.equal(resolved.conflicts[0].resolved, false);
  assert.equal(resolveEvent(event, '2026-11-05').conflicts.length, 0);
});

test('layered design keeps official logo locked through serialization', () => {
  const direction = localDirections('بوست تعليمي عن الكهرباء', 'education')[0];
  const design = composeCreativeDesign(direction, 'square', { headline: 'تعليم هندسي', eyebrow: 'كهرباء', body: 'شرح مبسط', detail: '', cta: 'اقرأ أكثر' });
  const logo = design.layers.find((layer) => layer.type === 'logo');
  assert.ok(logo && logo.type === 'logo');
  assert.deepEqual(validateLogoLayer(logo), []);
  assert.equal(logo.variant, 'lockup-reversed');
  assert.equal(logo.source, '/brand/logos/engosoft-lockup-reversed.svg');
  assert.equal(JSON.parse(JSON.stringify(design)).layers.at(-1).locked, true);
  const svg = renderCreativeSvg(design);
  assert.match(svg, new RegExp(`data-brand-asset="${logos.variants.find((v) => v.id === 'lockup-reversed')!.sha256}"`));
  assert.match(svg, /data-text="تعليم هندسي"/);
});

test('drafts saved with cropped-sheet logo names are upgraded to the approved files', () => {
  const direction = localDirections('بوست تعليمي عن الكهرباء', 'education')[2];
  const design = composeCreativeDesign(direction, 'square', { headline: 'x', eyebrow: '', body: '', detail: '', cta: '' });
  const legacy = { ...design, layers: design.layers.map((layer) => layer.type === 'logo' ? { ...layer, variant: 'blueOnWhite' as never, source: 'data:image/png;base64,AAAA', width: 260 } : layer) };
  const upgraded = upgradeLegacyDesign(legacy);
  const logo = upgraded.layers.find((layer) => layer.type === 'logo');
  assert.ok(logo && logo.type === 'logo');
  assert.equal(logo.variant, 'lockup-positive');
  assert.equal(logo.source, '/brand/logos/engosoft-lockup-positive.svg');
  assert.doesNotThrow(() => renderCreativeSvg(upgraded));
});

test('evaluation fixture covers twenty distinct creative cases', () => {
  assert.equal(scenarios.length, 20);
  assert.equal(new Set(scenarios.map((item) => item.id)).size, 20);
});
