import { addDays, subDays } from 'date-fns';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { enqueueJobs } from '@/server/services/jobs';
import { logActivity } from '@/server/services/activity';
import { currentProvenance, recordProvenance } from '@/server/services/provenance';
import { readSiteIdentity, type SiteIdentity } from '@/server/services/discovery/site-identity';
import { getPipelineSettings } from './settings';
import { queueAnalysis } from './gates';
import { refreshDue } from './screening';
import { fingerprint } from './versions';

/**
 * Freshness checks without re-running research. A due account's website is
 * read again (one page, robots respected) and compared by fingerprint:
 *   - unchanged: record that it was observed, schedule the next check;
 *   - changed: update only the fields that changed and that came from the
 *     website in the first place (never a value a person entered), keep the
 *     history in provenance, and screen again;
 *   - materially changed on a high-priority account with stale research:
 *     queue a new analysis. Nothing else triggers paid work.
 */

const REFRESHABLE = ['phone', 'addressLine', 'city', 'region', 'postalCode', 'description'] as const;
type Field = (typeof REFRESHABLE)[number];
const MATERIAL: Field[] = ['description', 'addressLine', 'city'];
const REANALYSE_AFTER_DAYS = 30;

export function identityFingerprint(identity: SiteIdentity) {
  return fingerprint(JSON.stringify({
    names: identity.names.slice(0, 3),
    phone: identity.phone,
    address: identity.address,
    description: identity.description,
    social: Object.entries(identity.socialProfiles).sort(),
  }));
}

function incomingValues(identity: SiteIdentity): Record<Field, string | null> {
  return {
    phone: identity.phone,
    addressLine: identity.address?.street ?? null,
    city: identity.address?.city ?? null,
    region: identity.address?.region ?? null,
    postalCode: identity.address?.postalCode ?? null,
    description: identity.description,
  };
}

export type RefreshStatus = 'UNCHANGED' | 'UPDATED' | 'UNREACHABLE' | 'NO_WEBSITE';

export async function refreshAccount(organizationId: string, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, organizationId, deletedAt: null } });
  if (!account) return { status: 'NO_WEBSITE' as RefreshStatus, changed: [], conflicts: [], reanalysis: false };
  const settings = await getPipelineSettings(organizationId);
  const next = refreshDue(account.opportunityTier ?? 'LOW', account.pipelineStage, settings);
  if (!account.websiteUrl) {
    await db.account.update({ where: { id: accountId }, data: { nextRefreshAt: next } });
    return { status: 'NO_WEBSITE' as RefreshStatus, changed: [], conflicts: [], reanalysis: false };
  }

  const { identity, reason } = await readSiteIdentity(account.websiteUrl);
  if (!identity) {
    // Try again sooner; a site that stays down is itself worth noticing.
    await db.account.update({ where: { id: accountId }, data: { nextRefreshAt: addDays(new Date(), 7) } });
    logger.info('refresh.unreachable', { accountId, reason });
    return { status: 'UNREACHABLE' as RefreshStatus, changed: [], conflicts: [], reanalysis: false, reason };
  }

  const print = identityFingerprint(identity);
  const observed = { lastObservedAt: new Date(), fingerprintedAt: new Date(), contentFingerprint: print, nextRefreshAt: next };
  if (print === account.contentFingerprint) {
    await db.account.update({ where: { id: accountId }, data: observed });
    return { status: 'UNCHANGED' as RefreshStatus, changed: [], conflicts: [], reanalysis: false };
  }

  const provenance = await currentProvenance({ accountId });
  const incoming = incomingValues(identity);
  const patch: Partial<Record<Field, string>> = {};
  const conflicts: Field[] = [];
  for (const field of REFRESHABLE) {
    const value = incoming[field];
    const current = account[field];
    if (!value || value === current) continue;
    const source = provenance[field]?.source;
    // Only values that came from the website are the website's to change.
    if (!current || source === 'COMPANY_WEBSITE') patch[field] = value;
    else conflicts.push(field);
  }
  const social = { ...(identity.socialProfiles), ...((account.socialProfiles as Record<string, string> | null) ?? {}) };
  const changed = Object.keys(patch) as Field[];
  await db.account.update({
    where: { id: accountId },
    data: { ...observed, ...patch, socialProfiles: social, ...(changed.length ? { screenedAt: null } : {}) },
  });
  if (changed.length) {
    await recordProvenance({ organizationId, accountId }, patch, { source: 'COMPANY_WEBSITE', provider: 'company_website', sourceUrl: identity.url });
  }

  const material = changed.some((f) => MATERIAL.includes(f));
  const stale = !account.lastResearchedAt || account.lastResearchedAt < subDays(new Date(), REANALYSE_AFTER_DAYS);
  let reanalysis = false;
  if (material && stale && (account.pipelineStage === 'ANALYZED' || account.pipelineStage === 'DEEP_RESEARCHED')
      && (account.opportunityTier === 'HOT' || account.opportunityTier === 'WARM')) {
    reanalysis = !!(await queueAnalysis(organizationId, accountId, 'REFRESH').catch(() => null));
  }

  if (changed.length || conflicts.length) {
    await logActivity({
      organizationId, clientId: account.clientId, accountId, type: 'ENRICHMENT',
      title: changed.length ? `Website changed: updated ${changed.join(', ')}` : 'Website differs from the record',
      body: [
        conflicts.length ? `Kept your values for ${conflicts.join(', ')}; the website now shows something different.` : null,
        reanalysis ? 'A new analysis was queued because the change is material and the last one is over a month old.' : null,
      ].filter(Boolean).join(' ') || null,
      metadata: { changed, conflicts, sourceUrl: identity.url },
    });
  }
  return { status: 'UPDATED' as RefreshStatus, changed, conflicts, reanalysis };
}

/** Queues freshness checks for accounts whose turn has come, best prospects first. */
export async function enqueueDueRefresh(organizationId: string, limit = 200, now = new Date()) {
  const due = await db.account.findMany({
    where: { organizationId, deletedAt: null, websiteUrl: { not: null }, nextRefreshAt: { lte: now } },
    orderBy: [{ screeningScore: { sort: 'desc', nulls: 'last' } }, { nextRefreshAt: 'asc' }],
    select: { id: true, clientId: true, nextRefreshAt: true },
    take: limit,
  });
  return enqueueJobs('RECORD_REFRESH', due.map((a) => ({
    organizationId, clientId: a.clientId, entityType: 'Account', entityId: a.id,
    idempotencyKey: `refresh:${a.id}:${a.nextRefreshAt!.toISOString()}`,
  })));
}
