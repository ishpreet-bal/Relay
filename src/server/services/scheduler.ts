import { releaseStaleJobs } from './jobs';
import { scheduleDueDiscovery } from './discovery/run';
import { sweepRetention } from './discovery/retention';
import { backfillCompanyKeys } from './companies/backfill';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { enqueuePendingScreening } from './pipeline/gates';
import { enqueueDueRefresh } from './pipeline/refresh';

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
  for (const org of await db.organization.findMany({ where: { deletedAt: null }, select: { id: true } })) {
    try {
      screeningJobs += await enqueuePendingScreening(org.id);
      refreshJobs += await enqueueDueRefresh(org.id, 200, now);
    } catch (err) {
      logger.error('scheduler.pipeline_failed', { organizationId: org.id, error: err });
    }
  }
  return { releasedJobs: released.count, discovery, backfill, retention, screeningJobs, refreshJobs };
}
