import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { scheduledMaintenance } from '@/server/services/scheduler';
import { heartbeat, processQueues, processStaleScores } from '@/server/services/job-runner';
import { SERVERLESS_QUEUES } from '@/server/queues/registry';

/**
 * Scheduled tick for deployments without a long-running worker. Vercel Cron
 * calls it with `Authorization: Bearer $CRON_SECRET`. Each call starts due
 * discovery runs, does housekeeping, then works through queued jobs until
 * shortly before the function's time limit. Long work (discovery) pauses and
 * resumes on the next call. Website research and customer workflows stay
 * with the worker: they can't promise to fit in one function call.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUDGET_MS = 50_000;

function authorized(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env().CRON_SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response('Unauthorized', { status: 401 });
  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const workerId = 'cron';

  // Report in first, so this tick's own health check counts it as a live worker.
  await heartbeat(workerId, 'cron', 0, null);
  const maintenance = await scheduledMaintenance();
  let jobs = 0;
  let rescored = 0;
  while (Date.now() < deadline - 5_000) {
    const ran = await processQueues(workerId, SERVERLESS_QUEUES, 2, { deadline });
    jobs += ran;
    if (!ran) break;
  }
  if (Date.now() < deadline - 5_000) rescored = await processStaleScores(100);

  const summary = { ...maintenance, jobs, rescored, ms: Date.now() - started };
  await heartbeat(workerId, 'cron', jobs + rescored, null);
  logger.info('cron.tick', summary);
  return Response.json(summary);
}
