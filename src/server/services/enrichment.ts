import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { runChain } from '@/server/connectors/registry';
import type { CompanyProfile, ContactCandidate } from '@/server/connectors/types';
import { recordProvenance } from './provenance';
import { createContactRecord } from './contacts';
import { advanceAccountStatus } from './accounts';
import { logActivity } from './activity';
import { rescoreAccount } from './scoring';
import { matchingTitle } from './scoring/text';

/**
 * Enrichment through connected providers. Relay does not keep its own
 * global contact database: it asks the configured providers in fallback
 * order, records every answer with its source and cost, reuses cached answers
 * instead of paying twice, and only fills fields a person has not already set.
 */

const COMPANY_TTL_DAYS = 90;
const CONTACT_SEARCH_TTL_DAYS = 30;
const EMAIL_TTL_DAYS = 60;

/** Fields a provider may fill on an account, and only when currently empty. */
const FILLABLE = [
  'websiteUrl', 'linkedinUrl', 'phone', 'industry', 'employeeCount', 'employeeRange', 'revenueRange',
  'description', 'foundedYear', 'city', 'region', 'country',
] as const satisfies ReadonlyArray<keyof CompanyProfile>;
type FillableField = (typeof FILLABLE)[number];

export async function enrichAccount(access: AccessContext, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, ...clientFilter(access), deletedAt: null } });
  if (!account) throw new NotFoundError('Account');
  if (!account.domain) throw new DomainError('Add a website first — enrichment looks companies up by domain.');

  await db.account.update({ where: { id: accountId }, data: { enrichmentStatus: 'PENDING' } });
  const outcome = await runChain<CompanyProfile>(
    { organizationId: account.organizationId, clientId: account.clientId, accountId },
    'COMPANY_DATA',
    { operation: 'company.enrich', lookupKey: account.domain, ttlDays: COMPANY_TTL_DAYS },
    (def) => def.company?.enrichCompany({ domain: account.domain!, name: account.name }, { organizationId: account.organizationId, clientId: account.clientId, accountId }) ?? null,
  );

  if (outcome.result.status !== 'SUCCESS' || !outcome.result.data) {
    await db.account.update({
      where: { id: accountId },
      data: { enrichmentStatus: outcome.result.status === 'ERROR' ? 'FAILED' : account.enrichmentStatus === 'PENDING' ? 'NOT_STARTED' : account.enrichmentStatus },
    });
    return { status: outcome.result.status, provider: outcome.provider, filled: [] as string[], cached: outcome.cached, error: outcome.result.error };
  }

  const profile = outcome.result.data;
  const patch: Prisma.AccountUpdateInput = {};
  const filled: FillableField[] = [];
  for (const field of FILLABLE) {
    const value = profile[field];
    if (value === null || value === undefined || value === '') continue;
    if (account[field] !== null && account[field] !== undefined) continue;
    (patch as Record<string, unknown>)[field] = value;
    filled.push(field);
  }
  if (profile.keywords.length) patch.keywords = [...new Set([...account.keywords, ...profile.keywords])].slice(0, 50);
  if (profile.techStack.length) patch.techStack = [...new Set([...account.techStack, ...profile.techStack])].slice(0, 50);

  await db.account.update({
    where: { id: accountId },
    data: { ...patch, enrichmentStatus: 'ENRICHED', enrichedAt: new Date(), sourceRef: account.sourceRef ?? outcome.result.externalId ?? null },
  });
  await recordProvenance(
    { organizationId: account.organizationId, accountId },
    Object.fromEntries(filled.map((f) => [f, profile[f]])),
    { source: 'PROVIDER', provider: outcome.provider, providerRecordId: outcome.providerRecordId, status: 'PROVIDER_REPORTED', confidence: outcome.result.confidence ?? null },
  );
  await advanceAccountStatus(accountId, 'ENRICHED');
  await logActivity({
    organizationId: account.organizationId, clientId: account.clientId, accountId, type: 'ENRICHMENT',
    title: `Company data from ${outcome.provider}${outcome.cached ? ' (cached)' : ''}`,
    body: filled.length ? `Filled: ${filled.join(', ')}.` : 'Nothing new — every field was already set.',
    metadata: { provider: outcome.provider, providerRecordId: outcome.providerRecordId, cached: outcome.cached },
  });
  await rescoreAccount(accountId);
  return { status: 'SUCCESS' as const, provider: outcome.provider, filled, cached: outcome.cached };
}

/**
 * Finds people at an account matching the client's ICP titles and
 * seniorities, and adds the ones not already there. Emails are revealed
 * separately (see revealEmail) because that costs credits.
 */
export async function discoverContacts(access: AccessContext, accountId: string, limit = 5, opts: { provider?: string } = {}) {
  const account = await db.account.findFirst({
    where: { id: accountId, ...clientFilter(access), deletedAt: null },
    include: {
      icp: true,
      client: { include: { icps: { where: { isActive: true }, take: 1 } } },
      contacts: { where: { deletedAt: null }, select: { firstName: true, lastName: true, email: true, sourceRef: true, sourceProvider: true } },
    },
  });
  if (!account) throw new NotFoundError('Account');
  if (!account.domain) throw new DomainError('Add a website first — contact search looks people up by company domain.');

  const icp = account.icp ?? account.client.icps[0] ?? null;
  const titles = icp ? [...icp.targetTitles, ...icp.smallCompanyTitles] : [];
  const seniorities = icp?.targetSeniorities ?? [];
  const lookupKey = `${account.domain}|${[...titles].sort().join(',')}|${[...seniorities].sort().join(',')}`;

  const outcome = await runChain<ContactCandidate[]>(
    { organizationId: account.organizationId, clientId: account.clientId, accountId },
    'CONTACT_DATA',
    { operation: 'contact.search', lookupKey: `${lookupKey}|limit=${limit * 2}`, ttlDays: CONTACT_SEARCH_TTL_DAYS, providerIds: opts.provider ? [opts.provider] : undefined },
    (def) => def.contacts?.findContacts({ domain: account.domain!, titles, seniorities, limit: limit * 2 }, { organizationId: account.organizationId, clientId: account.clientId, accountId }) ?? null,
  );
  if (outcome.result.status !== 'SUCCESS' || !outcome.result.data?.length) {
    return { status: outcome.result.status, provider: outcome.provider, added: 0, error: outcome.result.error };
  }

  const known = new Set(account.contacts.map((c) => `${(c.firstName ?? '').toLowerCase()} ${(c.lastName ?? '').toLowerCase()}`.trim()));
  const knownRefs = new Set(account.contacts.filter((c) => c.sourceRef).map((c) => `${c.sourceProvider}:${c.sourceRef}`));
  const knownEmails = new Set(account.contacts.map((c) => c.email?.toLowerCase()).filter(Boolean));
  // Prefer exact title matches, then whatever order the provider ranked.
  const candidates = [...outcome.result.data].sort((a, b) => Number(!!matchingTitle(b.title, titles)) - Number(!!matchingTitle(a.title, titles)));

  let added = 0;
  for (const c of candidates) {
    if (added >= limit) break;
    const name = `${(c.firstName ?? '').toLowerCase()} ${(c.lastName ?? '').toLowerCase()}`.trim();
    if ((c.externalId && knownRefs.has(`${outcome.provider}:${c.externalId}`)) || (c.firstName && c.lastName && known.has(name)) || (c.email && knownEmails.has(c.email.toLowerCase()))) continue;
    if (!c.firstName && !c.email && !c.phone) continue;
    await db.$transaction((tx) => createContactRecord(tx, {
      organizationId: account.organizationId,
      clientId: account.clientId,
      accountId,
      input: {
        firstName: c.firstName, lastName: c.lastName, title: c.title, department: c.department,
        seniority: c.seniority ?? undefined, email: c.email, emailVerification: c.emailVerification ?? undefined,
        phone: c.phone, directPhone: c.directPhone, mobilePhone: c.mobilePhone, linkedinUrl: c.linkedinUrl,
        city: c.city, region: c.region, country: c.country,
        source: 'PROVIDER', sourceProvider: outcome.provider, sourceRef: c.externalId, sourceUrl: c.sourceUrl,
      },
      isPrimary: account.contacts.length === 0 && added === 0,
    }));
    known.add(name);
    if (c.email) knownEmails.add(c.email.toLowerCase());
    if (c.externalId) knownRefs.add(`${outcome.provider}:${c.externalId}`);
    added++;
  }
  await logActivity({
    organizationId: account.organizationId, clientId: account.clientId, accountId, type: 'ENRICHMENT',
    title: `${added} contact${added === 1 ? '' : 's'} found via ${outcome.provider}`,
    metadata: { provider: outcome.provider, providerRecordId: outcome.providerRecordId, cached: outcome.cached },
  });
  if (added) await rescoreAccount(accountId);
  return { status: 'SUCCESS' as const, provider: outcome.provider, added };
}

const VERIFY_TTL_DAYS = 30;

/**
 * Checks a contact's email with a connected verification provider (cached
 * for 30 days per address). Only a provider's VALID counts as verified;
 * "couldn't tell" stays unverified.
 */
export async function verifyContactEmail(access: AccessContext, contactId: string) {
  const contact = await db.contact.findFirst({ where: { id: contactId, ...clientFilter(access), deletedAt: null } });
  if (!contact) throw new NotFoundError('Contact');
  if (!contact.email) throw new DomainError('This contact has no email to verify.');
  const ctx = { organizationId: contact.organizationId, clientId: contact.clientId, accountId: contact.accountId, contactId };
  const outcome = await runChain<{ verification: 'UNVERIFIED' | 'VALID' | 'RISKY' | 'INVALID' | 'CATCH_ALL' }>(
    ctx,
    'EMAIL_VERIFICATION',
    { operation: 'email.verify', lookupKey: contact.email.toLowerCase(), ttlDays: VERIFY_TTL_DAYS, usageType: 'EMAIL_VERIFICATION' },
    (def) => def.emailVerification?.verifyEmail({ email: contact.email! }, ctx) ?? null,
  );
  if (outcome.result.status !== 'SUCCESS' || !outcome.result.data) {
    return { status: outcome.result.status, provider: outcome.provider, verification: contact.emailVerification, error: outcome.result.error ?? null };
  }
  const { verification } = outcome.result.data;
  await db.contact.update({ where: { id: contactId }, data: { emailVerification: verification, emailVerifiedAt: verification === 'VALID' ? outcome.observedAt : null } });
  await recordProvenance(
    { organizationId: contact.organizationId, contactId },
    { emailVerification: verification },
    { source: 'PROVIDER', provider: outcome.provider, providerRecordId: outcome.providerRecordId, status: verification === 'VALID' ? 'VERIFIED' : 'PROVIDER_REPORTED', confidence: outcome.result.confidence ?? null },
  );
  await rescoreAccount(contact.accountId);
  return { status: 'SUCCESS' as const, provider: outcome.provider, verification, error: null };
}

/** Looks up a work email for one contact. Costs provider credits; cached for reuse. */
export async function revealEmail(access: AccessContext, contactId: string) {
  const contact = await db.contact.findFirst({
    where: { id: contactId, ...clientFilter(access), deletedAt: null },
    include: { account: { select: { domain: true } } },
  });
  if (!contact) throw new NotFoundError('Contact');
  if (contact.email) throw new DomainError('This contact already has an email.');
  if (!contact.account.domain || (!(contact.sourceProvider === 'apollo' && contact.sourceRef) && (!contact.firstName || !contact.lastName))) {
    throw new DomainError('Need an Apollo person ID or a full name, plus a company domain, to look up an email.');
  }

  const ctx = { organizationId: contact.organizationId, clientId: contact.clientId, accountId: contact.accountId, contactId };
  const outcome = await runChain<{ email: string; verification: 'UNVERIFIED' | 'VALID' | 'RISKY' | 'INVALID' | 'CATCH_ALL'; firstName?: string | null; lastName?: string | null }>(
    ctx,
    'EMAIL_FINDER',
    { operation: 'email.find', lookupKey: contact.sourceRef ?? `${contact.firstName} ${contact.lastName}@${contact.account.domain}`, ttlDays: EMAIL_TTL_DAYS },
    (def) => def.emailFinder?.findEmail({ firstName: contact.firstName ?? '', lastName: contact.lastName ?? '', domain: contact.account.domain!, externalId: def.id === contact.sourceProvider ? contact.sourceRef : null }, ctx) ?? null,
  );
  if (outcome.result.status !== 'SUCCESS' || !outcome.result.data) {
    return { status: outcome.result.status, provider: outcome.provider, email: null };
  }
  const { email, verification } = outcome.result.data;
  await db.contact.update({
    where: { id: contactId },
    data: { email, ...(!contact.firstName && outcome.result.data.firstName ? { firstName: outcome.result.data.firstName } : {}), ...(!contact.lastName && outcome.result.data.lastName ? { lastName: outcome.result.data.lastName } : {}), emailVerification: verification, emailVerifiedAt: verification === 'VALID' ? outcome.observedAt : null },
  });
  await recordProvenance(
    { organizationId: contact.organizationId, contactId },
    { email },
    { source: 'PROVIDER', provider: outcome.provider, providerRecordId: outcome.providerRecordId, status: verification === 'VALID' ? 'VERIFIED' : 'PROVIDER_REPORTED', confidence: outcome.result.confidence ?? null },
  );
  await rescoreAccount(contact.accountId);
  return { status: 'SUCCESS' as const, provider: outcome.provider, email };
}
