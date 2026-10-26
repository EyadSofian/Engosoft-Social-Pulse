import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCopy, copyPasses } from '../server/creative-intelligence/typography-validation/copy-check';
import { buildCourseContext } from '../server/creative-intelligence/context/odoo-context';
import { compileFullCreativePrompt, factLines, type CreativeBriefPlan } from '../server/creative-intelligence/generation/full-creative';
import { toPublicRun } from '../server/creative-intelligence/generation/jobs';

const event = { id: 'event.event:5745', title: 'CFM Course Online - 5745', startsAt: '2026-11-24T17:30:00Z', endsAt: '2026-11-24T20:30:00Z', source: 'event.event', location: 'Engosoft - KSA', registrationUrl: 'https://engosoft.com/event/cfm-5745' };

test('Odoo facts are converted to the event time zone and written by code, not a model', () => {
  const context = buildCourseContext(event);
  assert.equal(context.timeZone, 'Asia/Riyadh');
  assert.equal(context.facts.dateText.value, '24-11-2026');
  assert.equal(context.facts.timeText.value, '8:30 مساءً');
  assert.equal(context.facts.weekdayText.value, 'الثلاثاء');
  assert.equal(context.facts.deliveryMode?.value, 'أونلاين');
  assert.deepEqual(factLines(context), ['يبدأ الثلاثاء 24-11-2026', '8:30 مساءً بتوقيت السعودية • أونلاين']);
  assert.ok(Object.values(context.facts).every((fact) => fact!.source === 'odoo' && fact!.verified));
});

test('copy check accepts design line breaks but not wrong words or reordered dates', () => {
  const canonical = { headline: 'قُد مرافقك باحترافية CFM', subheadline: 'طوّر خبرتك', facts: ['يبدأ الثلاثاء 24-11-2026'], cta: 'سجّل الآن' };
  const good = checkCopy(canonical, ['قد مرافقك', 'باحترافية', 'CFM', 'طور خبرتك', '24-11-2026 يبدأ الثلاثاء', 'سجل الآن']);
  assert.ok(good.every((c) => c.verdict === 'exact'), JSON.stringify(good));
  assert.equal(copyPasses(good), true);
  const reordered = checkCopy(canonical, ['قد مرافقك باحترافية CFM', 'يبدأ الثلاثاء 11-24-2026', 'سجل الآن']);
  assert.equal(reordered.find((c) => c.field === 'fact1')!.verdict, 'incorrect');
  assert.equal(copyPasses(reordered), false);
  const misspelled = checkCopy(canonical, ['قد مرافك باحترافيه CFM', 'يبدأ الثلاثاء 24-11-2026', 'سجل الآن']);
  assert.equal(misspelled.find((c) => c.field === 'headline')!.verdict, 'incorrect');
  assert.equal(checkCopy(canonical, ['شيء اخر'])[0].verdict, 'missing');
  // The auto-corrected transcription reads fine, but the letter audit saw a doubled letter.
  const audited = checkCopy(canonical, ['قد مرافقك باحترافية CFM', 'يبدأ الثلاثاء 24-11-2026', 'سجل الآن'], [{ expected: 'قُد مرافقك باحترافية CFM', rendered: 'قُد مرافقك باحترارفية CFM', exact: false }, { expected: 'يبدأ الثلاثاء 24-11-2026', rendered: '24-11-2026 يبدأ الثلاثاء', exact: false }]);
  assert.equal(audited[0].verdict, 'incorrect');
  assert.equal(audited.find((c) => c.field === 'fact1')!.verdict, 'exact');
});

test('full-creative prompt asks for the whole post, reserves the logo corner and forbids generated logos', () => {
  const brief: CreativeBriefPlan = { language: 'ar', objective: 'Registration', audience: 'engineers', caption: '', captions: { facebook: '', instagram: '', whatsapp: '', linkedin: '', tiktok: '', snapchat: '' }, canonicalCopy: { headline: 'عنوان', subheadline: 'سطر', facts: ['يبدأ الثلاثاء 24-11-2026'], cta: 'سجّل الآن' },
    directions: [{ id: 'd1', name: 'Authority', concept: 'c', subject: 's', composition: 'x', palette: 'p', typography: 't', mood: 'm' }] };
  const prompt = compileFullCreativePrompt(brief, brief.directions[0], 'feed');
  assert.match(prompt, /complete, finished, publish-ready/);
  assert.match(prompt, /not a background/);
  assert.match(prompt, /«يبدأ الثلاثاء 24-11-2026»/);
  assert.match(prompt, /top-left area/);
  assert.match(prompt, /Do NOT draw any logo/);
  assert.match(prompt, /No seals, badges, emblems/);
  assert.match(compileFullCreativePrompt(brief, brief.directions[0], 'story'), /top 12% and bottom 17%/);
});

test('public run exposes image URLs but not server paths or prompts', () => {
  const pub = toPublicRun({ requestId: '00000000-0000-0000-0000-000000000000', createdAt: '', request: { prompt: 'x' }, context: { status: 'skipped' }, versions: {} as never, outputDir: '/secret/dir',
    brief: { language: 'ar', objective: '', audience: '', caption: '', captions: { facebook: '', instagram: '', whatsapp: '', linkedin: '', tiktok: '', snapchat: '' }, canonicalCopy: { headline: 'h' }, directions: [] },
    results: [{ directionId: 'd1', directionName: 'n', status: 'ready', problems: [], imagePath: '/secret/dir/d1.png', rawImagePath: '/secret/dir/d1-raw.png', prompt: 'internal', logo: { requiresCreativeRepair: true, reason: '' }, repaired: false, copyChecks: [], inspection: {} as never, model: 'gpt-image-2', latencyMs: 1 }] });
  const json = JSON.stringify(pub);
  assert.ok(!json.includes('/secret') && !json.includes('internal'));
  assert.equal(pub.results[0].imageUrl, '/api/creatives/00000000-0000-0000-0000-000000000000/d1.png');
});
