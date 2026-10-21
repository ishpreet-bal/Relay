import { releaseStaleJobs } from './jobs';
import { scheduleDueDiscovery } from './discovery/run';
import { sweepRetention } from './discovery/retention';
import { backfillCompanyKeys } from './companies/backfill';

/**
 * Housekeeping on a clock: start due discovery runs, release jobs whose
 * runner died, fill company keys on older records, and remove data past its
 * source's retention limit. Idempotent; the worker runs it every 15 minutes
 * and the cron tick on each call.
 */
export async function scheduledMaintenance(now = new Date()) {
  // A step holds its job for at most a few minutes; 15 without a word means it died.
  const released = await releaseStaleJobs(15 * 60_000);
  const discovery = await scheduleDueDiscovery(now);
  const backfill = await backfillCompanyKeys();
  const retention = await sweepRetention(now);
  return { releasedJobs: released.count, discovery, backfill, retention };
}
