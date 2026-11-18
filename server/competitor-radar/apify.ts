/**
 * Runs one Apify actor and returns its dataset items with what the run cost. Every run has a cost cap
 * (maxTotalChargeUsd), so a misbehaving actor cannot spend more than its cap.
 */
const API = 'https://api.apify.com/v2';

export class ApifyError extends Error {}

export interface ActorResult { items: Record<string, unknown>[]; usd: number; runId: string; status: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runActor(actor: string, input: unknown, options: { token: string; maxUsd: number; timeoutSecs?: number }): Promise<ActorResult> {
  const headers = { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' };
  const timeout = options.timeoutSecs ?? 240;
  // Some actors refuse a cap under $0.50; the cap only limits spend, the run is charged for what it returns.
  const cap = Math.max(options.maxUsd, 0.5);
  const start = await fetch(`${API}/acts/${actor.replace('/', '~')}/runs?timeout=${timeout}&maxTotalChargeUsd=${cap}`, { method: 'POST', headers, body: JSON.stringify(input), signal: AbortSignal.timeout(30_000) });
  const started = (await start.json().catch(() => ({}))) as { data?: { id?: string }; error?: { message?: string } };
  if (!start.ok || !started.data?.id) throw new ApifyError(`${actor}: ${started.error?.message || `HTTP ${start.status}`}`);
  const runId = started.data.id;
  let run: { status?: string; defaultDatasetId?: string; usageTotalUsd?: number; statusMessage?: string } = {};
  const deadline = Date.now() + (timeout + 60) * 1000;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/actor-runs/${runId}?waitForFinish=60`, { headers, signal: AbortSignal.timeout(75_000) });
    run = ((await res.json().catch(() => ({}))) as { data?: typeof run }).data ?? {};
    if (run.status && !['READY', 'RUNNING'].includes(run.status)) break;
    await sleep(1000);
  }
  if (!run.defaultDatasetId || !run.status || ['READY', 'RUNNING'].includes(run.status)) throw new ApifyError(`${actor}: did not finish in time`);
  const data = await fetch(`${API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, { headers, signal: AbortSignal.timeout(60_000) });
  const items = (await data.json().catch(() => [])) as unknown;
  if (!Array.isArray(items)) throw new ApifyError(`${actor}: invalid dataset`);
  const usd = Number(run.usageTotalUsd) || 0;
  if (run.status !== 'SUCCEEDED' && !items.length) throw new ApifyError(`${actor}: ${run.status}${run.statusMessage ? ` — ${run.statusMessage}` : ''}`);
  // An actor that hit its free-plan or charge limit says so in the item list; those items are not posts.
  return { items: items.filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === 'object' && !('error' in (i as object))), usd, runId, status: run.status };
}
