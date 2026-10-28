import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { briefFacts, indicativePrice, recommendWorkflows } from './service-brief';
import { STARTING_PACKAGES } from './service-packages';

/** Derived from current evidence, so a failed refresh or changed contact cannot leave a green stale badge. */
export async function getAccountBrief(access: AccessContext, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, ...clientFilter(access), deletedAt: null },
    include: { research: true, contacts: { where: { deletedAt: null } }, client: { select: { kind: true, offers: { where: { isActive: true }, select: { name: true, summary: true } } } } } });
  if (!account) throw new NotFoundError('Account');
  const [org, packages, crawl, resolution, jobs] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: access.organizationId }, select: { internalHourlyCostCents: true, dayRateCents: true, currency: true } }),
    db.servicePackage.findMany({ where: { organizationId: access.organizationId, service: 'AUTOMATION' }, orderBy: { createdAt: 'asc' } }),
    db.providerRecord.findFirst({ where: { organizationId: access.organizationId, accountId, operation: 'website.crawl' }, orderBy: { requestedAt: 'desc' }, select: { normalized: true, requestedAt: true } }),
    db.providerRecord.findFirst({ where: { organizationId: access.organizationId, accountId, operation: 'contact.resolve' }, orderBy: { requestedAt: 'desc' }, select: { normalized: true, requestedAt: true } }),
    db.job.findMany({ where: { organizationId: access.organizationId, entityId: accountId, type: { in: ['CONTACT_ENRICHMENT', 'RESEARCH'] }, status: { in: ['QUEUED', 'RUNNING', 'RETRYING', 'FAILED'] } }, select: { type: true, status: true, error: true }, take: 5, orderBy: { createdAt: 'desc' } }),
  ]);
  const facts = briefFacts(account.research?.facts);
  const recent = account.research?.status === 'COMPLETED' && !!account.research.refreshedAt && Date.now() - account.research.refreshedAt.getTime() <= 30 * 86400_000;
  const contacts = account.contacts.map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Business contact', title: c.title,
    email: c.email, phone: c.directPhone ?? c.phone ?? c.mobilePhone, sourceUrl: c.sourceUrl, provider: c.sourceProvider,
    verified: c.emailVerification === 'VALID' && !!c.emailVerifiedAt && Date.now() - c.emailVerifiedAt.getTime() <= 30 * 86400_000,
    emailVerification: c.emailVerification, doNotEmail: c.doNotEmail, doNotCall: c.doNotCall, consentBasis: c.consentBasis, consentNote: c.consentNote }));
  const verifiedEmail = contacts.some((c) => c.email && c.verified && !c.doNotEmail);
  const phone = contacts.find((c) => c.phone && !c.doNotCall)?.phone ?? account.phone;
  const base = packages[0] ?? STARTING_PACKAGES.find((p) => p.service === 'AUTOMATION')!;
  const workflows = account.client.kind === 'INTERNAL' ? recommendWorkflows(facts).map((p) => ({ ...p,
    price: indicativePrice({ buildHours: p.buildHours, costs: base, internalHourlyCents: org.internalHourlyCostCents, dayRateCents: org.dayRateCents, currency: org.currency, planningDefaults: !packages.length }) })) : [];
  const issues: string[] = [];
  if (account.doNotContact) issues.push('Account is suppressed. Do not contact.');
  if (!recent) issues.push('Research is missing, failed or older than 30 days. Refresh before preparing outreach.');
  if (!facts.length) issues.push('No facts with exact or normalized source quotes are available.');
  if (verifiedEmail && !contacts.some((c) => c.email && c.verified && !c.doNotEmail && c.consentBasis !== 'UNKNOWN' && c.consentNote?.trim())) issues.push('Email is verified, but the applicable outreach basis still needs a person’s review and supporting evidence.');
  if (!verifiedEmail) issues.push(phone ? 'Phone route available; email still needs discovery or verification.' : 'No usable contact route. Resolve contacts or review the company contact page.');
  if (account.client.kind === 'INTERNAL' && !workflows.length) issues.push('No supported automation match. Review the service and process with a person.');
  return { accountId, name: account.name, websiteUrl: account.websiteUrl, suppressed: account.doNotContact,
    facts, workflows, offers: account.client.offers, contacts, phone,
    state: account.doNotContact ? 'SUPPRESSED' : !recent || !facts.length ? 'RESEARCH_REQUIRED' : !verifiedEmail ? phone ? 'PHONE_REVIEW' : 'CONTACT_REQUIRED' : account.client.kind === 'INTERNAL' && !workflows.length ? 'OFFER_REQUIRED' : 'READY_FOR_REVIEW',
    issues, researchedAt: account.research?.refreshedAt ?? null, coverage: crawl?.normalized ?? null, contactResolution: resolution?.normalized ?? null, jobs,
    unknowns: ['Actual bottlenecks, task volumes and time spent', 'System access, API permissions and data quality', 'Buyer, budget, scope and acceptance criteria'],
    nextStep: account.doNotContact ? 'Do not contact this account.' : 'Review the evidence and a contact route. Confirm the workflow with the business before offering a fixed scope. Human approval is required before email.' };
}
