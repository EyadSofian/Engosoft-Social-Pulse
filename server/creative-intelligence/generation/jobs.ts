/** In-memory job tracking for long creative runs. Results are durable on disk (data/creatives/<id>/trace.json); jobs are not. */
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { notifyUser } from '../../notify.js';
import { withStorage, MiB } from '../../storage.js';
import type { FullCreativeResult, FullCreativeRun, ProgressStage } from './full-creative.js';

export interface CreativeJob {
  id: string;
  kind: 'generate' | 'adapt';
  ownerId: string;
  status: 'running' | 'done' | 'failed';
  /** The saved run on disk; lets the page reopen the result even after this in-memory job is gone. */
  requestId?: string;
  stage: ProgressStage | 'queued';
  startedAt: string;
  finishedAt?: string;
  error?: string;
  /** Shared as soon as it is written, so the page can show the directions while images render. */
  brief?: FullCreativeRun['brief'];
  directionStages: Record<string, ProgressStage>;
  run?: PublicRun;
}

/** What the browser receives: file names become URLs, server paths and prompts stay private. */
export interface PublicResult extends Omit<FullCreativeResult, 'imagePath' | 'rawImagePath' | 'prompt'> { imageUrl?: string }
export interface PublicRun extends Omit<FullCreativeRun, 'results' | 'outputDir'> { results: PublicResult[] }

export function toPublicRun(run: FullCreativeRun): PublicRun {
  const { outputDir: _dir, results, ...rest } = run;
  return {
    ...rest,
    results: results.map(({ imagePath, rawImagePath: _raw, prompt: _prompt, ...result }) => ({
      ...result, ...(imagePath ? { imageUrl: `/api/creatives/${run.requestId}/${basename(imagePath)}` } : {}),
    })),
  };
}

const jobs = new Map<string, CreativeJob>();
const MAX_JOBS = 50;

export type ProgressEvent = Parameters<import('./full-creative.js').ProgressFn>[0];
export function startJob(kind: CreativeJob['kind'], ownerId: string, work: (progress: (event: ProgressEvent) => void) => Promise<FullCreativeRun>, requestId?: string): CreativeJob {
  const job: CreativeJob = { id: randomUUID(), kind, ownerId, requestId, status: 'running', stage: 'queued', startedAt: new Date().toISOString(), directionStages: {} };
  jobs.set(job.id, job);
  if (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value!);
  void withStorage(128 * MiB, () => work((event) => { job.stage = event.stage; if (event.brief) job.brief = event.brief; if (event.directionId) job.directionStages[event.directionId] = event.stage; }))
    .then((run) => {
      job.status = 'done'; job.stage = 'done'; job.run = toPublicRun(run); job.requestId = run.requestId;
      // The person may have left the page: tell them wherever they are.
      if (kind === 'generate') notifyUser(ownerId, 'creative_ready', 'تصميمك جاهز', run.brief.canonicalCopy.headline, `/?creative=${run.requestId}`);
    })
    .catch((error) => {
      job.status = 'failed'; job.error = error instanceof Error ? error.message : 'Creative generation failed';
      if (kind === 'generate') notifyUser(ownerId, 'creative_failed', 'تعذّر إكمال التصميم', job.error.slice(0, 200), '/');
    })
    .finally(() => { job.finishedAt = new Date().toISOString(); });
  return job;
}

export const getJob = (id: string) => jobs.get(id);
