import { queueContactBacklog } from './contact-resolution';
import { releaseStaleJobs } from './jobs';
import { scheduleDueDiscovery } from './discovery/run';
import { sweepRetention } from './discovery/retention';
import { backfillCompanyKeys } from './companies/backfill';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { enqueuePendingScreening, queueQualifiedBacklog } from './pipeline/gates';
import { enqueueDueRefresh } from './pipeline/refresh';
import { runDueSchedules } from '@/server/studio/applications';
import { runBillingCycle } from './customer-billing/subscriptions';
import { checkPlatformHealth } from './monitoring';
import { orchestrateProjects } from './engineering/orchestrator';

/**
 * Housekeeping on a clock: start due discovery runs, release jobs whose
 * runner died, fill company keys on older records, remove data past its
 * source's retention limit, and queue screening and freshness checks. Idempotent; the worker runs it every 15 minutes
 * and the cron tick on each call.
 */
export async function scheduledMaintenance(now = new Date()) {
  // A step holds its job for at most a few minutes; 15 without a word means it died.
  const released = await releaseStaleJobs(15 * 60_000);
  const discovery = await scheduleDueDiscovery(now);
  const backfill = await backfillCompanyKeys();
  const retention = await sweepRetention(now);
  // Research funnel: screen what's new or changed, check what's due.
  let screeningJobs = 0;
  let refreshJobs = 0;
  let backlogAnalyses = 0;
  let contactJobs = 0;
  for (const org of await db.organization.findMany({ where: { deletedAt: null }, select: { id: true } })) {
    try {
      screeningJobs += await enqueuePendingScreening(org.id);
      refreshJobs += await enqueueDueRefresh(org.id, 200, now);
      backlogAnalyses += await queueQualifiedBacklog(org.id);
      contactJobs += await queueContactBacklog(org.id, now);
    } catch (err) {
      logger.error('scheduler.pipeline_failed', { organizationId: org.id, error: err });
    }
  }
  // Studio: scheduled customer workflows (they run on the studio queue).
  const schedules = await runDueSchedules(now).catch((err) => { logger.error('scheduler.studio_failed', { error: err }); return { started: 0 }; });
  // Customer billing: close ended periods (metered usage, ledger invoices, Stripe overage).
  const billing = await runBillingCycle(now).catch((err) => { logger.error('scheduler.billing_failed', { error: err }); return { subscriptions: 0, periods: 0 }; });
  // Engineering: advance projects whose gates are met, release ready tasks, stop work over budget.
  const engineering = await orchestrateProjects(now).catch((err) => { logger.error('scheduler.engineering_failed', { error: err }); return { advanced: 0 }; });
  // Health: raise or clear alerts for stuck queues, paused providers, dead letters, failed webhooks, failing apps.
  const health = await checkPlatformHealth(now).catch((err) => { logger.error('scheduler.health_failed', { error: err }); return { findings: [] as string[] }; });
  return { releasedJobs: released.count, discovery, backfill, retention, screeningJobs, refreshJobs, backlogAnalyses, contactJobs, workflowsStarted: schedules.started, billingPeriodsClosed: billing.periods, engineeringAdvanced: engineering.advanced, healthFindings: health.findings.length };
}
