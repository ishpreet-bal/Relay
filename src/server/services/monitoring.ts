import { db } from '@/lib/db';
import { QUEUES, type QueueName } from '@/server/queues/registry';
import { raiseAlert, resolveAlert } from './alerts';

/**
 * Platform health checks, run with scheduled maintenance. Each condition
 * raises one alert while it holds and resolves it when it clears:
 *
 *   - work waiting in a queue that no live worker serves
 *   - a provider paused by its circuit breaker
 *   - jobs dead-lettered in the last day
 *   - webhooks that failed to process
 *   - a customer application whose production runs are failing
 */

const WORKER_SILENT_MS = 10 * 60_000;
const QUEUE_WAIT_MS = 15 * 60_000;
const APP_MIN_RUNS = 10;
const APP_FAILURE_RATE = 0.2;

async function toggle(on: boolean, organizationId: string | null, dedupeKey: string, alert: () => Parameters<typeof raiseAlert>[0]) {
  if (on) await raiseAlert(alert());
  else await resolveAlert(organizationId, dedupeKey);
}

export async function checkPlatformHealth(now = new Date()) {
  const findings: string[] = [];

  // Waiting work no live worker serves. Queues the cron tick runs count as served only when the tick itself is alive.
  const [waiting, beats] = await Promise.all([
    db.job.groupBy({ by: ['queue'], where: { status: { in: ['QUEUED', 'RETRYING'] }, runAt: { lte: new Date(now.getTime() - QUEUE_WAIT_MS) }, queue: { not: 'synthetic' } }, _count: true }),
    db.workerHeartbeat.findMany({ where: { lastSeenAt: { gte: new Date(now.getTime() - WORKER_SILENT_MS) } }, select: { group: true } }),
  ]);
  const liveGroups = new Set(beats.map((b) => b.group));
  for (const name of Object.keys(QUEUES) as QueueName[]) {
    if (name === 'synthetic') continue;
    const def = QUEUES[name];
    const stuck = waiting.find((w) => w.queue === name)?._count ?? 0;
    const served = liveGroups.has('all') || liveGroups.has(def.group) || (def.serverless && liveGroups.has('cron'));
    const on = stuck > 0 && !served;
    if (on) findings.push(`queue:${name}`);
    await toggle(on, null, `worker:${name}`, () => ({
      organizationId: null, kind: 'worker', severity: 'critical', dedupeKey: `worker:${name}`,
      title: `No worker is processing "${def.label}"`,
      detail: `${stuck} job(s) have waited over 15 minutes and no ${def.group} worker has reported in the last 10 minutes. Start one with npm run worker:${def.group === 'platform' ? '' : def.group}`.replace(/:$/, '') + '.',
    }));
  }

  // Providers paused by their breaker.
  const throttles = await db.providerThrottle.findMany({ where: { provider: { not: { startsWith: 'synthetic' } } } });
  for (const t of throttles) {
    const on = !!t.circuitOpenUntil && t.circuitOpenUntil > now;
    if (on) findings.push(`provider:${t.provider}`);
    await toggle(on, null, `provider:${t.provider}`, () => ({
      organizationId: null, kind: 'provider', severity: 'warning', dedupeKey: `provider:${t.provider}`,
      title: `${t.provider} is paused after repeated failures`,
      detail: `Paused until ${t.circuitOpenUntil!.toISOString()}. Last error: ${t.lastError ?? 'unknown'}. Its jobs wait without using their attempts.`,
    }));
  }

  // Dead letters in the last day, per workspace.
  const dead = await db.job.groupBy({ by: ['organizationId', 'queue'], where: { deadLetteredAt: { gte: new Date(now.getTime() - 86_400_000) }, queue: { not: 'synthetic' } }, _count: true });
  const deadOrgs = new Set(dead.map((d) => d.organizationId));
  for (const org of deadOrgs) {
    const rows = dead.filter((d) => d.organizationId === org);
    findings.push(`dead:${org}`);
    await raiseAlert({
      organizationId: org, kind: 'jobs', severity: 'warning', dedupeKey: 'jobs:dead-letters',
      title: `${rows.reduce((n, r) => n + r._count, 0)} job(s) failed for good in the last day`,
      detail: rows.map((r) => `${QUEUES[r.queue as QueueName]?.label ?? r.queue}: ${r._count}`).join(', ') + '. Retry them from System › Queues once the cause is fixed.',
    });
  }
  const openDead = await db.systemAlert.findMany({ where: { dedupeKey: 'jobs:dead-letters', resolvedAt: null }, select: { organizationId: true } });
  for (const a of openDead) if (!deadOrgs.has(a.organizationId!)) await resolveAlert(a.organizationId, 'jobs:dead-letters');

  // Webhooks that failed and haven't been processed since.
  const failedHooks = await db.webhookEvent.groupBy({ by: ['provider'], where: { error: { not: null }, processedAt: null, receivedAt: { gte: new Date(now.getTime() - 86_400_000) } }, _count: true });
  for (const provider of ['stripe', 'clerk', 'resend', 'inbound']) {
    const n = failedHooks.find((f) => f.provider === provider)?._count ?? 0;
    if (n) findings.push(`webhook:${provider}`);
    await toggle(n > 0, null, `webhook:${provider}`, () => ({
      organizationId: null, kind: 'webhook', severity: 'critical', dedupeKey: `webhook:${provider}`,
      title: `${n} ${provider} webhook(s) failed to process`,
      detail: 'The provider retries with backoff; check the error on the event and the logs.',
    }));
  }

  // Customer applications whose production runs are failing.
  const since = new Date(now.getTime() - 86_400_000);
  const runs = await db.workflowExecution.groupBy({ by: ['applicationId', 'organizationId', 'status'], where: { isTest: false, createdAt: { gte: since }, status: { in: ['SUCCEEDED', 'FAILED'] } }, _count: true });
  const appIds = [...new Set(runs.map((r) => r.applicationId))];
  const apps = await db.clientApplication.findMany({ where: { id: { in: appIds } }, select: { id: true, name: true, organizationId: true } });
  const failing = new Set<string>();
  for (const app of apps) {
    const ok = runs.find((r) => r.applicationId === app.id && r.status === 'SUCCEEDED')?._count ?? 0;
    const bad = runs.find((r) => r.applicationId === app.id && r.status === 'FAILED')?._count ?? 0;
    const on = ok + bad >= APP_MIN_RUNS && bad / (ok + bad) >= APP_FAILURE_RATE;
    if (on) { failing.add(app.id); findings.push(`app:${app.id}`); }
    await toggle(on, app.organizationId, `app-failures:${app.id}`, () => ({
      organizationId: app.organizationId, kind: 'studio', severity: 'warning', dedupeKey: `app-failures:${app.id}`,
      title: `${app.name}: ${bad} of ${ok + bad} runs failed in the last day`,
      detail: 'Open the application in Studio to see the failing step and its error.',
    }));
  }
  // Apps that stopped running entirely also clear their alert.
  const openApp = await db.systemAlert.findMany({ where: { dedupeKey: { startsWith: 'app-failures:' }, resolvedAt: null }, select: { organizationId: true, dedupeKey: true } });
  for (const a of openApp) if (!failing.has(a.dedupeKey.slice('app-failures:'.length))) await resolveAlert(a.organizationId, a.dedupeKey);

  return { findings };
}
