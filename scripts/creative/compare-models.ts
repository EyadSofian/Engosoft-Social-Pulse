/**
 * Fair model comparison: one brief per scenario, then every direction rendered by every model with the same prompt.
 * Usage: node --import tsx scripts/creative/compare-models.ts <scenarios.json> [outDir]
 * scenarios.json: [{ "id": "cfm", "prompt": "...", "format": "feed", "directions": 2, "skipOdoo": false }]
 * Models come from COMPARE_MODELS (comma-separated), default gpt-image-2,gpt-image-2.5-flare.
 */
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveOdooContext } from '../../server/creative-intelligence/context/odoo-context.ts';
import { planCreative, produceDirection, type CreativeFormat } from '../../server/creative-intelligence/generation/full-creative.ts';
import { OpenAIImageProvider } from '../../server/creative-intelligence/generation/provider.ts';
import { copyPasses } from '../../server/creative-intelligence/typography-validation/copy-check.ts';

interface Scenario { id: string; prompt: string; format?: CreativeFormat; directions?: number; skipOdoo?: boolean }
const [scenarioFile, outArg] = process.argv.slice(2);
const scenarios = JSON.parse(readFileSync(scenarioFile, 'utf8')) as Scenario[];
const models = (process.env.COMPARE_MODELS || 'gpt-image-2,gpt-image-2.5-flare').split(',');
const root = resolve(outArg || `data/creatives/compare-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
mkdirSync(root, { recursive: true });

const rows: Record<string, unknown>[] = [];
for (const scenario of scenarios) {
  const format = scenario.format ?? 'feed';
  const dir = resolve(root, scenario.id);
  mkdirSync(dir, { recursive: true });
  const odoo = scenario.skipOdoo ? null : await resolveOdooContext(scenario.prompt);
  const context = odoo?.status === 'matched' ? odoo.context : undefined;
  const brief = await planCreative(scenario.prompt, format, scenario.directions ?? 2, context);
  brief.directions = brief.directions.map((d, i) => ({ ...d, id: `d${i + 1}` }));
  console.log(`\n## ${scenario.id}: ${context ? `${context.event.title} · ${brief.canonicalCopy.facts?.join(' · ')}` : 'no Odoo facts'}`);
  console.log(`copy: ${JSON.stringify({ ...brief.canonicalCopy, facts: undefined })}`);
  const jobs = brief.directions.flatMap((direction) => models.map((model) => ({ direction, model })));
  const settled = await Promise.allSettled(jobs.map(({ direction, model }) =>
    produceDirection({ provider: new OpenAIImageProvider(process.env.OPENAI_API_KEY!, model), brief, direction: { ...direction, id: `${direction.id}-${model}` }, format, quality: 'high', dir, env: process.env })));
  settled.forEach((entry, index) => {
    const { direction, model } = jobs[index];
    const base = { scenario: scenario.id, direction: direction.id, directionName: direction.name, model };
    if (entry.status === 'rejected') { rows.push({ ...base, status: 'error', error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason) }); console.log(`${direction.id} ${model}: ERROR ${String(entry.reason).slice(0, 160)}`); return; }
    const r = entry.value;
    const row = {
      ...base, status: r.status, latencyS: Math.round(r.latencyMs / 1000), repaired: r.repaired,
      logoPlaced: !r.logo.requiresCreativeRepair, logo: r.logo.requiresCreativeRepair ? null : `${r.logo.variantId}@${r.logo.placement.anchor}`,
      copyPass: copyPasses(r.copyChecks), copy: Object.fromEntries(r.copyChecks.map((c) => [c.field, c.verdict])),
      scores: r.inspection.scores, verdict: r.inspection.verdict, generatedLogos: r.inspection.logosOrWatermarks.length,
      defects: r.inspection.defects, image: r.imagePath ?? r.rawImagePath,
    };
    rows.push(row);
    console.log(`${direction.id} ${model}: ${r.status} ${row.latencyS}s copy=${row.copyPass ? 'pass' : 'FAIL'} logo=${row.logo ?? 'none'} scores=${JSON.stringify(r.inspection.scores)} verdict=${r.inspection.verdict}`);
  });
  writeFileSync(resolve(dir, 'brief.json'), JSON.stringify({ scenario, context: context?.facts ?? null, brief }, null, 2));
}
writeFileSync(resolve(root, 'results.json'), JSON.stringify(rows, null, 2));
console.log(`\nResults: ${resolve(root, 'results.json')}`);
