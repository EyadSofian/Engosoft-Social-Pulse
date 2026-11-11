/**
 * The design pipeline end to end with a fake image model: a paid image is never lost when a later step fails, repair
 * calls stay within their budget (words first, then the logo corner), the critic's taste does not hold a post back,
 * and a run a restart cut short is finished from what was drawn.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';
process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'pipeline-safety-'));
const { produceDirection, recoverInterruptedRuns, repairBudgetFor, updateTrace, writeTrace, loadFullCreativeRun, FULL_CREATIVE_VERSIONS } = await import('../server/creative-intelligence/generation/full-creative');
type Brief = import('../server/creative-intelligence/generation/full-creative').CreativeBriefPlan;
type Run = import('../server/creative-intelligence/generation/full-creative').FullCreativeRun;

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

const HEADLINE = 'قُد المرافق باحتراف';
const BRIEF: Brief = {
  language: 'ar', objective: 'Course launch', audience: 'Facility managers',
  canonicalCopy: { headline: HEADLINE, subheadline: '', cta: 'سجّل الآن' },
  caption: '', captions: { facebook: '', instagram: '', whatsapp: '', linkedin: '', tiktok: '', snapchat: '', website: '' },
  directions: [{ id: 'd1', name: 'Hero', concept: 'A manager in a plant room', subject: 'A manager', composition: 'Headline right, subject left', palette: 'Blue', typography: 'Bold', mood: 'Confident' }],
};
const ENV = { OPENAI_API_KEY: 'test', CREATIVE_FINAL_CHECK: 'off', CREATIVE_CANDIDATES: '1' } as NodeJS.ProcessEnv;

/** A fake image model that counts its calls and returns a plain blue picture at the size asked for. */
async function fakeModel() {
  const calls: { prompt: string; mask: boolean }[] = [];
  const picture = (size: string) => { const [width, height] = size.split('x').map(Number); return sharp({ create: { width, height, channels: 3, background: '#0046ff' } }).png().toBuffer(); };
  return {
    calls,
    provider: {
      name: 'fake', model: 'fake-image',
      generate: async (r: { prompt: string; size: string }) => { calls.push({ prompt: r.prompt, mask: false }); return [{ png: await picture(r.size), model: 'fake-image', size: r.size, quality: 'high' as const, latencyMs: 1 }]; },
      edit: async (r: { prompt: string; size: string; mask?: Buffer }) => { calls.push({ prompt: r.prompt, mask: Boolean(r.mask) }); return [{ png: await picture(r.size), model: 'fake-image', size: r.size, quality: 'high' as const, latencyMs: 1 }]; },
    },
  };
}
/** The critic's answer, from a function of how many times it has looked. */
function critic(answer: (look: number) => object | Response) {
  let looks = 0;
  globalThis.fetch = (async () => {
    const out = answer(++looks);
    return out instanceof Response ? out : Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(out) }] }] });
  }) as typeof fetch;
}
const seen = (extra: object = {}) => ({
  texts: [{ text: HEADLINE, box: { x: 0.45, y: 0.3, width: 0.5, height: 0.1 } }, { text: 'سجّل الآن', box: { x: 0.6, y: 0.8, width: 0.3, height: 0.06 } }],
  faces: [], subjects: [], logosOrWatermarks: [], copyAudit: [], defects: [], scores: { design: 8, marketing: 8, imageQuality: 8, brandFit: 8 },
  verdict: 'accept', summary: '', critique: null, repairs: [], ...extra,
});
const dirFor = (name: string) => { const dir = resolve(process.env.MEDIA_DIR!, name); mkdirSync(dir, { recursive: true }); return dir; };

test('the repair budget defaults to one call and stays between 0 and 4', () => {
  assert.equal(repairBudgetFor({} as NodeJS.ProcessEnv), 1);
  assert.equal(repairBudgetFor({ CREATIVE_REPAIR_CALLS: '0' } as NodeJS.ProcessEnv), 0);
  assert.equal(repairBudgetFor({ CREATIVE_REPAIR_CALLS: '9' } as NodeJS.ProcessEnv), 4);
});

test('when the critic cannot run, the drawn design is still finished and shown, never lost', async () => {
  const { calls, provider } = await fakeModel();
  critic(() => Response.json({ error: { message: 'Your API key has expired.' } }, { status: 401 }));
  const dir = dirFor('critic-down');
  const result = await produceDirection({ provider, brief: BRIEF, direction: BRIEF.directions[0], format: 'feed', quality: 'high', dir, env: ENV });
  assert.equal(calls.length, 1, 'one image, no repairs');
  assert.equal(result.status, 'needs_review');
  assert.ok(result.imagePath && existsSync(result.imagePath), 'the finished design is on disk');
  assert.ok(existsSync(resolve(dir, 'd1-raw.png')), 'the drawn picture was saved as soon as it arrived');
  assert.match(result.problems[0], /The critic failed .*API key has expired/);
  const { width, height } = await sharp(result.imagePath!).metadata();
  assert.deepEqual([width, height], [1080, 1350]);
  assert.equal(result.imageCalls, 1);
});

test('with one repair call, wrong words are fixed first and the logo corner is not repaired', async () => {
  const { calls, provider } = await fakeModel();
  // A face in the logo corner on every look, and a misspelt headline until it is re-lettered.
  const face = { faces: [{ x: 0.02, y: 0.02, width: 0.3, height: 0.12 }] };
  critic((look) => look === 1
    ? seen({ ...face, texts: [{ text: 'قُد المرافق باحترف', box: { x: 0.45, y: 0.3, width: 0.5, height: 0.1 } }, { text: 'سجّل الآن', box: { x: 0.6, y: 0.8, width: 0.3, height: 0.06 } }], copyAudit: [{ expected: HEADLINE, rendered: 'قُد المرافق باحترف', exact: false }] })
    : seen(face));
  const result = await produceDirection({ provider, brief: BRIEF, direction: BRIEF.directions[0], format: 'feed', quality: 'high', dir: dirFor('budget'), env: ENV });
  assert.equal(calls.length, 2, calls.map((c) => c.prompt.slice(0, 40)).join(' | '));
  assert.match(calls[1].prompt, /Re-letter only the text/);
  assert.equal(result.imageCalls, 2);
  assert.equal(result.repaired, false, 'no call was left for the logo corner');
  assert.ok(result.notes?.some((n) => /placed at its usual spot anyway/.test(n)), JSON.stringify(result.notes));
  assert.ok(result.copyChecks.every((c) => c.verdict === 'exact'), JSON.stringify(result.copyChecks));
  assert.ok(result.imagePath && existsSync(result.imagePath));
});

test('with no repair budget, nothing beyond the drawing is paid for', async () => {
  const { calls, provider } = await fakeModel();
  critic(() => seen({ copyAudit: [{ expected: HEADLINE, rendered: 'قُد المرافق باحترف', exact: false }] }));
  const result = await produceDirection({ provider, brief: BRIEF, direction: BRIEF.directions[0], format: 'feed', quality: 'high', dir: dirFor('no-budget'), env: { ...ENV, CREATIVE_REPAIR_CALLS: '0' } });
  assert.equal(calls.length, 1);
  assert.equal(result.status, 'needs_review', 'the wrong headline still holds the post');
  assert.ok(result.notes?.some((n) => /Text repair skipped/.test(n)));
});

test('the critic\'s taste is a note: a design with the right words and its logo is ready', async () => {
  const { provider } = await fakeModel();
  critic(() => seen({ verdict: 'repair', defects: ['The button could use an arrow.'], logosOrWatermarks: [{ description: 'a small mark on the wall', box: { x: 0.8, y: 0.5, width: 0.05, height: 0.05 } }] }));
  const result = await produceDirection({ provider, brief: BRIEF, direction: BRIEF.directions[0], format: 'feed', quality: 'high', dir: dirFor('taste'), env: ENV });
  assert.equal(result.status, 'ready', result.problems.join('; '));
  assert.deepEqual(result.problems, []);
  assert.ok(result.notes?.some((n) => /arrow/.test(n)));
  assert.ok(result.notes?.some((n) => /watermark/.test(n)));
});

test('a run a restart cut short is finished from what was drawn; a design never drawn is reported', async () => {
  const requestId = '00000000-0000-4000-8000-0000000000a1';
  const outputDir = dirFor(join('creatives', requestId));
  const brief: Brief = { ...BRIEF, directions: [BRIEF.directions[0], { ...BRIEF.directions[0], id: 'd2', name: 'Second' }] };
  const run: Run = { requestId, createdAt: new Date().toISOString(), request: { prompt: 'CFM course', format: 'feed' }, brief, results: [], versions: FULL_CREATIVE_VERSIONS, outputDir, context: { status: 'skipped' }, state: 'running' };
  writeTrace(run);
  writeFileSync(resolve(outputDir, 'd1-raw.png'), await sharp({ create: { width: 1632, height: 2032, channels: 3, background: '#0046ff' } }).png().toBuffer());
  assert.equal(await recoverInterruptedRuns({ ...ENV }), 1);
  const saved = loadFullCreativeRun(requestId);
  assert.equal(saved.state, 'interrupted');
  const d1 = saved.results.find((r) => r.directionId === 'd1')!;
  assert.equal(d1.status, 'needs_review');
  assert.ok(d1.imagePath && existsSync(d1.imagePath));
  assert.match(d1.problems[0], /server restarted/);
  assert.equal(saved.results.find((r) => r.directionId === 'd2')?.status, 'failed');
  // Nothing left to recover the second time.
  assert.equal(await recoverInterruptedRuns({ ...ENV }), 0);
});

test('two sizes saved at once both stay in the run', () => {
  const requestId = '00000000-0000-4000-8000-0000000000a2';
  const outputDir = dirFor(join('creatives', requestId));
  writeTrace({ requestId, createdAt: '', request: { prompt: 'x' }, brief: BRIEF, results: [], versions: FULL_CREATIVE_VERSIONS, outputDir, context: { status: 'skipped' }, state: 'done' });
  const result = (id: string) => ({ directionId: id, directionName: 'x', status: 'ready' as const, problems: [], rawImagePath: '', logo: { requiresCreativeRepair: true as const, reason: '' }, repaired: false, copyChecks: [], inspection: JSON.parse('{}'), prompt: '', model: '', latencyMs: 0 });
  updateTrace(requestId, (r) => { r.results.push(result('d1-story')); });
  updateTrace(requestId, (r) => { r.results.push(result('d1-x-header')); });
  assert.deepEqual(JSON.parse(readFileSync(resolve(outputDir, 'trace.json'), 'utf8')).results.map((r: { directionId: string }) => r.directionId), ['d1-story', 'd1-x-header']);
});
