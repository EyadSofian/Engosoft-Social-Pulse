/**
 * A/B the design-engine pipeline the Create page runs: one engine brief per scenario (saved, so later rounds reuse
 * it), then every direction rendered by every variant — image model, quality and prompt compiler — and a contact
 * sheet per scenario with the variants side by side.
 * Usage: node --import tsx scripts/creative/ab-engine.ts <scenarios.json> <outDir>
 * AB_VARIANTS: comma-separated model:quality:prompt[:candidates], e.g. gpt-image-2.5-flare:high:detailed,gpt-image-2.5-sunburst:high:detailed
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { resolveOdooContext } from '../../server/creative-intelligence/context/odoo-context.ts';
import { planCreativeWithEngine, produceDirection, type CreativeBriefPlan, type CreativeFormat } from '../../server/creative-intelligence/generation/full-creative.ts';
import { OpenAIImageProvider, type ImageQuality } from '../../server/creative-intelligence/generation/provider.ts';
import { copyPasses } from '../../server/creative-intelligence/typography-validation/copy-check.ts';

interface Scenario { id: string; prompt: string; format?: CreativeFormat; directions?: number; skipOdoo?: boolean }
interface Variant { key: string; model: string; quality: ImageQuality; prompt: string; candidates: string }
const [scenarioFile, outArg] = process.argv.slice(2);
if (!scenarioFile || !outArg) throw new Error('Usage: ab-engine.ts <scenarios.json> <outDir>');
const scenarios = JSON.parse(readFileSync(scenarioFile, 'utf8')) as Scenario[];
const variants: Variant[] = (process.env.AB_VARIANTS || 'gpt-image-2.5-flare:high:detailed').split(',').map((spec) => {
  const [model, quality, prompt, candidates = '1'] = spec.split(':');
  return { key: `${model.replace('gpt-image-', '')}-${quality}-${prompt}${candidates !== '1' ? `-n${candidates}` : ''}`, model, quality: quality as ImageQuality, prompt, candidates };
});
const root = resolve(outArg);
mkdirSync(root, { recursive: true });

/** Runs at most `limit` tasks at once, keeping the input order in the results. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      try { results[index] = { status: 'fulfilled', value: await tasks[index]() }; } catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }));
  return results;
}

const label = (text: string, width: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="44"><rect width="100%" height="100%" fill="#fff"/><text x="10" y="29" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#111">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);

const resultsFile = resolve(root, 'results.json');
const rows: Record<string, unknown>[] = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : [];
/** Rows written by other runs into the same folder since this one started are kept, not overwritten. */
function saveRows() {
  const key = (r: Record<string, unknown>) => `${r.scenario}|${r.direction}|${r.variant}`;
  const onDisk: Record<string, unknown>[] = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : [];
  const mine = new Set(rows.map(key));
  const merged = [...onDisk.filter((r) => !mine.has(key(r))), ...rows];
  rows.splice(0, rows.length, ...merged);
  writeFileSync(resultsFile, JSON.stringify(rows, null, 2));
}
for (const scenario of scenarios) {
  const format = scenario.format ?? 'feed';
  const dir = resolve(root, scenario.id);
  mkdirSync(dir, { recursive: true });
  const briefFile = resolve(dir, 'brief.json');
  let brief: CreativeBriefPlan;
  if (existsSync(briefFile)) brief = JSON.parse(readFileSync(briefFile, 'utf8')) as CreativeBriefPlan;
  else {
    const odoo = scenario.skipOdoo ? null : await resolveOdooContext(scenario.prompt).catch(() => null);
    const context = odoo?.status === 'matched' ? odoo.context : undefined;
    brief = await planCreativeWithEngine(scenario.prompt, format, scenario.directions ?? 2, context, process.env, undefined, undefined);
    brief.directions = brief.directions.map((d, i) => ({ ...d, id: `d${i + 1}` }));
    writeFileSync(briefFile, JSON.stringify(brief, null, 2));
  }
  console.log(`\n## ${scenario.id}: ${JSON.stringify({ ...brief.canonicalCopy })}`);
  const jobs = brief.directions.flatMap((direction) => variants.map((variant) => ({ direction, variant })));
  const settled = await pool(jobs.map(({ direction, variant }) => () => produceDirection({
    provider: new OpenAIImageProvider(process.env.OPENAI_API_KEY!, variant.model), brief, direction: { ...direction, id: `${direction.id}-${variant.key}` },
    format, quality: variant.quality, dir, env: { ...process.env, CREATIVE_PROMPT: variant.prompt, CREATIVE_CANDIDATES: variant.candidates },
  })), 4);
  settled.forEach((entry, index) => {
    const { direction, variant } = jobs[index];
    const base = { scenario: scenario.id, direction: direction.id, directionName: direction.name, variant: variant.key };
    if (entry.status === 'rejected') { rows.push({ ...base, status: 'error', error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason) }); console.log(`${direction.id} ${variant.key}: ERROR ${String(entry.reason).slice(0, 200)}`); return; }
    const r = entry.value;
    const row = {
      ...base, status: r.status, latencyS: Math.round(r.latencyMs / 1000), repaired: r.repaired, refinements: r.refinements?.length ?? 0,
      logoPlaced: !r.logo.requiresCreativeRepair, copyPass: copyPasses(r.copyChecks), copy: Object.fromEntries(r.copyChecks.map((c) => [c.field, c.verdict])),
      scores: r.inspection.scores, verdict: r.inspection.verdict, candidates: r.candidates, defects: r.inspection.defects, promptChars: r.prompt.length, image: r.imagePath ?? r.rawImagePath,
    };
    rows.push(row);
    console.log(`${direction.id} ${variant.key}: ${r.status} ${row.latencyS}s copy=${row.copyPass ? 'pass' : 'FAIL'} scores=${JSON.stringify(r.inspection.scores)} verdict=${r.inspection.verdict} prompt=${row.promptChars}ch`);
  });
  saveRows();

  // Contact sheet: one row per direction, one column per variant that has an image for this scenario.
  const keys = [...new Set(rows.filter((r) => r.scenario === scenario.id && r.image).map((r) => String(r.variant)))];
  const cell = 432, h = Math.round(cell * 1.25);
  const tiles: sharp.OverlayOptions[] = [];
  brief.directions.forEach((direction, row) => keys.forEach((key, col) => {
    const hit = [...rows].reverse().find((r) => r.scenario === scenario.id && r.direction === direction.id && r.variant === key && r.image);
    tiles.push({ input: label(`${direction.id} · ${key}${hit?.scores ? ` · ${Object.values(hit.scores as Record<string, number>).join('/')}` : ''}`, cell), left: col * (cell + 8), top: row * (h + 52) });
    if (hit && existsSync(String(hit.image))) tiles.push({ input: String(hit.image), left: col * (cell + 8), top: row * (h + 52) + 46 });
  }));
  const images = await Promise.all(tiles.map(async (t) => typeof t.input === 'string' ? { ...t, input: await sharp(t.input).resize(cell, h, { fit: 'cover' }).toBuffer() } : t));
  await sharp({ create: { width: Math.max(1, keys.length) * (cell + 8), height: brief.directions.length * (h + 52), channels: 3, background: '#ffffff' } }).composite(images).jpeg({ quality: 82 }).toFile(resolve(root, `${scenario.id}-sheet.jpg`));
}
console.log(`\nResults: ${resolve(root, 'results.json')}`);
