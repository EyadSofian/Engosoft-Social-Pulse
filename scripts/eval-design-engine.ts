/**
 * A/B evaluation of the design engine against the previous single-prompt director.
 *
 *   node --import tsx scripts/eval-design-engine.ts [scenario ids…]
 *
 * Each scenario is generated with both engines (A = legacy, B = skills), then a blind judge sees the two
 * images in random order and scores them. Writes outputs/eval/<timestamp>/report.json and report.md.
 * Real cost: two directions per engine per scenario.
 */
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { generateFullCreative, type FullCreativeRun } from '../server/creative-intelligence/generation/full-creative.js';
import { openAIJson } from '../server/creative-intelligence/generation/provider.js';

const SCENARIOS: { id: string; prompt: string }[] = [
  { id: 'cfm', prompt: 'اعمل بوست قوي لويبينار CFM الجاي' },
  { id: 'pmp', prompt: 'بوست ترويجي لدورة PMP' },
  { id: 'bim', prompt: 'بوست لدورة BIM للمهندسين' },
  { id: 'automotive', prompt: 'بوست عن دورة ميكانيكا السيارات الحديثة' },
  { id: 'interior', prompt: 'بوست لدورة التصميم الداخلي' },
  { id: 'saudi', prompt: 'بوست لليوم الوطني السعودي من إنجوسوفت' },
  { id: 'achievement', prompt: 'بوست تهنئة لموظف حقق إنجاز في الشركة' },
  { id: 'student', prompt: 'بوست لعرض مشروع طالب في دورة الريفيت' },
  { id: 'majd', prompt: 'بوست يعرّف بالمساعد الذكي اسأل ماجد' },
  { id: 'corporate', prompt: 'إعلان مؤسسي عن افتتاح فرع جديد لإنجوسوفت' },
];
const AXES = ['professionalQuality', 'composition', 'spacing', 'visualHierarchy', 'photography', 'compositing', 'color', 'brandFit', 'publishability'] as const;

async function judge(a: Buffer, b: Buffer, prompt: string): Promise<{ first: Record<string, number>; second: Record<string, number>; preferred: 'first' | 'second' | 'tie'; why: string }> {
  const img = async (png: Buffer) => `data:image/jpeg;base64,${(await sharp(png).resize({ width: 768 }).jpeg({ quality: 85 }).toBuffer()).toString('base64')}`;
  const scores = { type: 'object', additionalProperties: false, required: [...AXES], properties: Object.fromEntries(AXES.map((k) => [k, { type: 'number' }])) };
  return openAIJson({
    apiKey: process.env.OPENAI_API_KEY ?? '', model: process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-5.5', reasoning: 'low', schemaName: 'blind_design_judge',
    schema: { type: 'object', additionalProperties: false, required: ['first', 'second', 'preferred', 'why'], properties: { first: scores, second: scores, preferred: { type: 'string', enum: ['first', 'second', 'tie'] }, why: { type: 'string' } } },
    instructions: 'You are a strict senior art director judging two social media posts for the same brief, blind. Score each 0-10 on every axis; 8+ only for work you would publish unchanged. Generic AI-looking output scores 5-6.',
    content: [{ type: 'input_text', text: `Brief: ${prompt}. First image:` }, { type: 'input_image', image_url: await img(a), detail: 'high' }, { type: 'input_text', text: 'Second image:' }, { type: 'input_image', image_url: await img(b), detail: 'high' }],
  });
}

const best = (run: FullCreativeRun) => run.results.filter((r) => r.imagePath).sort((x, y) => y.inspection.scores.design - x.inspection.scores.design)[0];

async function main() {
  const picked = process.argv.slice(2);
  const scenarios = picked.length ? SCENARIOS.filter((s) => picked.includes(s.id)) : SCENARIOS;
  const out = resolve('outputs', 'eval', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(out, { recursive: true });
  const rows: Record<string, unknown>[] = [];
  for (const scenario of scenarios) {
    console.log(`▶ ${scenario.id}`);
    const [legacy, engine] = await Promise.all([
      generateFullCreative({ prompt: scenario.prompt, engine: 'legacy', directions: 2 }),
      generateFullCreative({ prompt: scenario.prompt, engine: 'skills', directions: 2 }),
    ]);
    const a = best(legacy), b = best(engine);
    if (!a?.imagePath || !b?.imagePath) { rows.push({ scenario: scenario.id, error: 'a run produced no image', legacy: legacy.requestId, engine: engine.requestId }); continue; }
    const swap = Math.random() < 0.5;
    const [first, second] = swap ? [b, a] : [a, b];
    const verdict = await judge(readFileSync(first.imagePath!), readFileSync(second.imagePath!), scenario.prompt);
    const scoreA = swap ? verdict.second : verdict.first, scoreB = swap ? verdict.first : verdict.second;
    const preferred = verdict.preferred === 'tie' ? 'tie' : (verdict.preferred === 'first') === swap ? 'B (engine)' : 'A (legacy)';
    const mean = (s: Record<string, number>) => AXES.reduce((sum, k) => sum + s[k], 0) / AXES.length;
    rows.push({ scenario: scenario.id, legacy: legacy.requestId, engine: engine.requestId, meanA: mean(scoreA), meanB: mean(scoreB), preferred, why: verdict.why, scoreA, scoreB });
    console.log(`  A ${mean(scoreA).toFixed(1)} · B ${mean(scoreB).toFixed(1)} · preferred ${preferred}`);
  }
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(rows, null, 2));
  const md = ['| Scenario | A legacy | B engine | Preferred | Why |', '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.scenario} | ${typeof r.meanA === 'number' ? r.meanA.toFixed(1) : '—'} | ${typeof r.meanB === 'number' ? r.meanB.toFixed(1) : '—'} | ${r.preferred ?? r.error} | ${String(r.why ?? '').replace(/\|/g, '/')} |`)];
  writeFileSync(resolve(out, 'report.md'), md.join('\n'));
  console.log(`report: ${out}`);
}

void main().catch((error) => { console.error(error); process.exit(1); });
