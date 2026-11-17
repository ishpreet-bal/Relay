import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { chainFor } from '@/server/connectors/registry';
import { recordProviderCall } from '@/server/connectors/records';
import { startOfDay } from 'date-fns';
import { logger } from '@/lib/logger';
import { createContactRecord } from './contacts';
import { crawlSite } from './crawler';
import { discoverContacts, revealEmail, verifyContactEmail } from './enrichment';
import { getPipelineSettings } from './pipeline/settings';
import type { WebsiteContact } from './website-contacts';

/** Same-account lock makes retried/concurrent crawls safe, including phone-only contacts. */
export async function saveWebsiteContacts(access: AccessContext, accountId: string, found: WebsiteContact[]) {
  const account = await db.account.findFirst({ where: { id: accountId, ...clientFilter(access), deletedAt: null } });
  if (!account) throw new NotFoundError('Account');
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('relay:website-contacts'), hashtext(${accountId}))`;
    const existing = await tx.contact.findMany({ where: { accountId }, select: { email: true, phone: true } });
    const known = new Set(existing.flatMap((c) => [c.email?.toLowerCase(), c.phone].filter(Boolean)));
    let added = 0;
    for (const c of found.slice(0, 12)) {
      if (known.has(c.value)) continue;
      const result = await createContactRecord(tx, {
        organizationId: account.organizationId, clientId: account.clientId, accountId,
        isPrimary: existing.length === 0 && added === 0,
        input: { ...(c.kind === 'EMAIL' ? { email: c.value } : { phone: c.value }), title: 'Published business contact',
          source: 'COMPANY_WEBSITE', sourceProvider: 'company_website', sourceUrl: c.sourceUrl,
          consentBasis: 'UNKNOWN', consentNote: 'Public contact detail found on the company website. A person must establish an applicable outreach basis; publication alone is not consent.' },
      });
      known.add(c.value);
      if (!result.duplicate) added++;
    }
    const phone = found.find((c) => c.kind === 'PHONE');
    if (!account.phone && phone) await tx.account.update({ where: { id: accountId }, data: { phone: phone.value } });
    return { added };
    // Up to twelve contacts, each a handful of round trips to a pooled remote
    // database: Prisma's default five-second limit closed the transaction
    // mid-save and failed the research run that called it.
  }, { maxWait: 10_000, timeout: 30_000 });
}

const WEBSITE_READ_FRESH_DAYS = 30;
/** A few pages are enough for the contact page; research reads more. */
const CONTACT_CRAWL_PAGES = 6;

/**
 * Reads the company's own site for published contact details when nothing has
 * read it recently. Free, robots-respecting, and independent of AI research,
 * so a contact route exists even while analysis is paused or out of budget.
 */
export async function ensureWebsiteContacts(access: AccessContext, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, ...clientFilter(access), deletedAt: null }, select: { id: true, organizationId: true, clientId: true, websiteUrl: true, domain: true } });
  if (!account) throw new NotFoundError('Account');
  if (!account.websiteUrl) return { read: false as const, reason: 'NO_WEBSITE' as const, added: 0 };
  const since = new Date(Date.now() - WEBSITE_READ_FRESH_DAYS * 86400_000);
  const recent = await db.providerRecord.findFirst({
    where: { organizationId: account.organizationId, accountId, provider: 'company_website', operation: { in: ['website.crawl', 'website.contacts'] }, requestedAt: { gte: since } },
    select: { id: true },
  });
  if (recent) return { read: false as const, reason: 'FRESH' as const, added: 0 };
  const crawl = await crawlSite(account.websiteUrl, { maxPages: CONTACT_CRAWL_PAGES });
  await recordProviderCall({
    organizationId: account.organizationId, clientId: account.clientId, accountId,
    provider: 'company_website', operation: 'website.contacts', lookupKey: account.domain ?? account.websiteUrl,
    status: crawl.pages.length ? 'SUCCESS' : 'NOT_FOUND',
    normalized: { pages: crawl.pages.map((p) => ({ url: p.url, title: p.title })), errors: crawl.errors, blockedByRobots: crawl.blockedByRobots, contactsFound: crawl.contacts?.length ?? 0, coverage: crawl.coverage ?? null } as Prisma.InputJsonValue,
  });
  if (crawl.blockedByRobots) return { read: true as const, reason: 'BLOCKED' as const, added: 0 };
  const { added } = await saveWebsiteContacts(access, accountId, crawl.contacts ?? []);
  return { read: true as const, reason: 'READ' as const, added };
}

/** Contact data enrichment. Never enrolls contacts, approves drafts, or sends mail. */
export async function resolveAccountContacts(access: AccessContext, accountId: string, limit = 3, opts: { readWebsite?: boolean } = {}) {
  const account = await db.account.findFirst({ where: { id: accountId, ...clientFilter(access), deletedAt: null } });
  if (!account) throw new NotFoundError('Account');
  if (account.doNotContact) return { state: 'SUPPRESSED', attempted: [], issues: ['Account is marked do not contact'] };
  const attempted: string[] = [];
  const issues: string[] = [];
  if (opts.readWebsite) {
    // A site that can't be read is a gap to report, not a reason to skip the providers.
    try { await ensureWebsiteContacts(access, accountId); }
    catch (err) { logger.warn('contacts.website_read_failed', { accountId, error: err }); issues.push('Could not read the company website for published contacts.'); }
  }
  const providers = await chainFor(access.organizationId, 'CONTACT_DATA');
  const verifiers = await chainFor(access.organizationId, 'EMAIL_VERIFICATION');
  const finders = await chainFor(access.organizationId, 'EMAIL_FINDER');
  const contacts = () => db.contact.findMany({ where: { accountId, deletedAt: null, doNotEmail: false, status: { not: 'LEFT_COMPANY' } }, orderBy: [{ isPrimary: 'desc' }, { score: 'desc' }, { id: 'asc' }] });
  // A verified email short-circuits unnecessary paid searches. Website contacts
  // are verified first; named decision makers can still be searched manually.
  let reveals = 0;
  let checks = 0;
  const finishCandidates = async () => {
    for (const c of (await contacts()).filter((c) => c.emailVerification !== 'INVALID').slice(0, limit)) {
      let email = c.email;
      if (!email && finders.length && reveals < limit && ((c.sourceProvider === 'apollo' && c.sourceRef) || (c.firstName && c.lastName))) {
        reveals++;
        const r = await revealEmail(access, c.id);
        if (r.status === 'ERROR') throw new Error('Email lookup failed; inspect provider log and retry the contact job');
        email = r.email;
      }
      if (email && c.emailVerification !== 'INVALID' && verifiers.length && checks < limit
        && (!c.emailVerifiedAt || Date.now() - c.emailVerifiedAt.getTime() > 30 * 86400_000)) {
        checks++;
        const r = await verifyContactEmail(access, c.id);
        if (r.status === 'ERROR') throw new Error('Email verification failed; inspect provider log and retry the contact job');
      }
    }
  };
  await finishCandidates();
  const hasVerified = async () => (await contacts()).some((c) => c.email && c.emailVerification === 'VALID' && c.emailVerifiedAt && Date.now() - c.emailVerifiedAt.getTime() <= 30 * 86400_000);
  for (const provider of providers) {
    if (await hasVerified()) break;
    attempted.push(provider.id);
    const r = await discoverContacts(access, accountId, limit, { provider: provider.id });
    if (r.status === 'ERROR') { issues.push(`${provider.name} contact search failed; inspect provider log`); continue; }
    await finishCandidates();
  }
  const rows = await contacts();
  if (!providers.length) issues.push('No contact search provider configured. Add Apollo or Hunter under Connectors.');
  if (!verifiers.length) issues.push('No independent email verifier configured. Add Hunter or ZeroBounce.');
  const verified = await hasVerified();
  const state = verified ? 'VERIFIED_EMAIL' : rows.some((c) => c.email) ? 'NEEDS_VERIFICATION' : account.phone || rows.some((c) => c.phone || c.directPhone) ? 'PHONE_ONLY' : 'CONTACT_MISSING';
  if (state === 'CONTACT_MISSING') issues.push('No usable contact found. Check the contact page or call the published business number; do not guess an email.');
  await recordProviderCall({ organizationId: account.organizationId, clientId: account.clientId, accountId,
    provider: 'relay', operation: 'contact.resolve', lookupKey: accountId, status: issues.some((i) => i.includes('failed')) ? 'ERROR' : 'SUCCESS',
    normalized: { state, attempted, issues, reveals, checks }, error: issues.join(' ').slice(0, 500) || null });
  if (issues.some((i) => i.includes('failed')) && !verified) throw new Error(issues.join(' '));
  return { state, attempted, issues };
}

/** Automatic contact lookups started today (manual "Resolve contacts" clicks don't count). */
async function automaticLookupsToday(organizationId: string) {
  return db.job.count({ where: { organizationId, type: 'CONTACT_ENRICHMENT', createdAt: { gte: startOfDay(new Date()) }, createdById: null } });
}

/**
 * Qualified accounts without a verified email get a contact lookup, best
 * first, within the day's allowance. It does not wait for AI research:
 * screening is deterministic and free, so a company that passed it is worth
 * a contact route even while analysis is paused, failing or out of budget.
 * Each paid provider call is still checked against the enrichment budget.
 */
export async function queueContactBacklog(organizationId: string, now = new Date()) {
  const settings = await getPipelineSettings(organizationId);
  if (!settings.autoContacts) return 0;
  const room = settings.maxContactLookupsPerDay - await automaticLookupsToday(organizationId);
  if (room <= 0) return 0;
  const since = new Date(now.getTime() - 30 * 86400_000);
  const rows = await db.$queryRaw<Array<{ id: string; clientId: string; researchVersion: number }>>(Prisma.sql`
    SELECT a.id, a."clientId", a."researchVersion" FROM "Account" a
    WHERE a."organizationId" = ${organizationId}::uuid AND a."deletedAt" IS NULL AND NOT a."doNotContact"
      AND a."pipelineStage" IN ('QUALIFIED', 'ANALYZED', 'DEEP_RESEARCHED')
      AND (a."websiteUrl" IS NOT NULL OR a."domain" IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM "Contact" c WHERE c."accountId" = a.id AND c."deletedAt" IS NULL
        AND NOT c."doNotEmail" AND c.email IS NOT NULL AND c."emailVerification" = 'VALID' AND c."emailVerifiedAt" >= ${since})
      AND NOT EXISTS (SELECT 1 FROM "Job" j WHERE j."organizationId" = ${organizationId}::uuid AND j."entityId" = a.id::text
        AND j.type = 'CONTACT_ENRICHMENT' AND (j.status IN ('QUEUED', 'RUNNING', 'RETRYING') OR j."createdAt" >= ${since}))
    ORDER BY a."screeningScore" DESC NULLS LAST, a.id ASC LIMIT ${Math.min(room, 25)}`);
  if (!rows.length) return 0;
  // When a contact provider is connected later, accounts looked up without one get another turn.
  const providers = (await chainFor(organizationId, 'CONTACT_DATA')).length + (await chainFor(organizationId, 'EMAIL_VERIFICATION')).length > 0 ? 'p' : 'w';
  const { enqueueJob } = await import('./jobs');
  let queued = 0;
  for (const row of rows) {
    // One automatic attempt per evidence version a month. Failures stay in the
    // durable queue for retry.
    const key = `contacts-backfill:${row.id}:v${row.researchVersion}:${now.toISOString().slice(0, 7)}:${providers}`;
    const job = await enqueueJob({ type: 'CONTACT_ENRICHMENT', organizationId, clientId: row.clientId, entityType: 'Account', entityId: row.id,
      payload: { resolve: true, limit: 3 }, idempotencyKey: key });
    if (job) queued++;
  }
  return queued;
}
