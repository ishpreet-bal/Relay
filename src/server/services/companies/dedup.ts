import type { Prisma } from '@prisma/client';
import { normalizePhone } from '@/server/services/suppression';
import { emailDomain, normalizeLocality } from './normalize';
import { decide, scoreMatch, type CompanyIdentity, type MatchDecision } from './match';

/**
 * Finds the existing accounts an incoming company might be, within one
 * client. Candidates come from cheap indexed lookups (shared identifier,
 * domain, email domain, normalized name and its first word), then every
 * candidate is scored by match.ts.
 */

export interface IncomingCompany {
  normalizedName: string;
  domain: string | null;
  city: string | null;
  region: string | null;
  addressLine: string | null;
  phone: string | null;
  identifiers: Array<{ provider: string; externalId: string }>;
  contactEmails: string[];
}

export function identityOf(c: IncomingCompany): CompanyIdentity {
  return {
    normalizedName: c.normalizedName,
    domain: c.domain,
    city: c.city,
    region: c.region,
    address: c.addressLine ? normalizeLocality(c.addressLine) : null,
    phone: normalizePhone(c.phone),
    identifiers: c.identifiers,
    emailDomains: [...new Set(c.contactEmails.map(emailDomain).filter((d): d is string => !!d))],
  };
}

const CANDIDATE_SELECT = {
  id: true, name: true, normalizedName: true, domain: true, city: true, region: true, addressLine: true, phone: true,
  identifiers: { select: { provider: true, externalId: true } },
  contacts: { where: { deletedAt: null, email: { not: null } }, select: { email: true }, take: 25 },
} satisfies Prisma.AccountSelect;

type Candidate = Prisma.AccountGetPayload<{ select: typeof CANDIDATE_SELECT }>;

export async function findMatches(tx: Prisma.TransactionClient, clientId: string, incoming: IncomingCompany, excludeId?: string) {
  const identity = identityOf(incoming);
  const firstWord = incoming.normalizedName.split(' ')[0] ?? '';
  const base: Prisma.AccountWhereInput = { clientId, deletedAt: null, mergedIntoId: null, ...(excludeId ? { id: { not: excludeId } } : {}) };

  // Strong keys are looked up on their own, so a common first word ("Toronto
  // …", "Canadian …") can never crowd the exact match out of the candidates.
  // Each is its own indexed lookup returning account ids; one query OR-ing
  // them (with subqueries) would scan every account in the client.
  const strongIds = new Set<string>();
  const domains = [...new Set([incoming.domain, ...identity.emailDomains].filter((d): d is string => !!d))];
  const [byIdentifier, byDomain, byContact] = await Promise.all([
    incoming.identifiers.length
      ? tx.discoveryIdentifier.findMany({ where: { clientId, OR: incoming.identifiers.map((i) => ({ provider: i.provider, externalId: i.externalId })) }, select: { accountId: true }, take: 20 })
      : [],
    domains.length ? tx.account.findMany({ where: { clientId, domain: { in: domains } }, select: { id: true }, take: 20 }) : [],
    incoming.domain ? tx.contact.findMany({ where: { clientId, email: { endsWith: `@${incoming.domain}` } }, select: { accountId: true }, take: 20 }) : [],
  ]);
  byIdentifier.forEach((r) => strongIds.add(r.accountId));
  byDomain.forEach((r) => strongIds.add(r.id));
  byContact.forEach((r) => r.accountId && strongIds.add(r.accountId));

  const rows = new Map<string, Candidate>();
  const add = (list: Candidate[]) => list.forEach((r) => rows.set(r.id, r));
  if (strongIds.size) add(await tx.account.findMany({ where: { ...base, id: { in: [...strongIds] } }, select: CANDIDATE_SELECT, take: 20 }));
  if (incoming.normalizedName) add(await tx.account.findMany({ where: { ...base, normalizedName: incoming.normalizedName }, select: CANDIDATE_SELECT, take: 20 }));
  // Near-misses ("Acme Machining" vs "Acme Machine Works") sit next to each
  // other alphabetically: the 20 names on either side of this one, kept when
  // they share its first word. Two short index scans, however many accounts
  // share that word (a LIKE 'prefix%' lookup walks all of them). Weak signal: capped.
  if (firstWord.length >= 3 && incoming.normalizedName) {
    const near = { ...base, NOT: { normalizedName: incoming.normalizedName } };
    const [after, before] = await Promise.all([
      tx.account.findMany({ where: { ...near, normalizedName: { gt: incoming.normalizedName } }, orderBy: { normalizedName: 'asc' }, select: CANDIDATE_SELECT, take: 20 }),
      tx.account.findMany({ where: { ...near, normalizedName: { lt: incoming.normalizedName } }, orderBy: { normalizedName: 'desc' }, select: CANDIDATE_SELECT, take: 20 }),
    ]);
    add([...after, ...before].filter((r) => r.normalizedName?.split(' ')[0] === firstWord));
  }

  return [...rows.values()]
    .map((row) => ({
      item: row,
      score: scoreMatch(identity, identityOf({
        normalizedName: row.normalizedName ?? '',
        domain: row.domain,
        city: row.city,
        region: row.region,
        addressLine: row.addressLine,
        phone: row.phone,
        identifiers: row.identifiers,
        contactEmails: row.contacts.map((c) => c.email!).filter(Boolean),
      })),
    }))
    .filter((c) => c.score.score > 0)
    .sort((a, b) => b.score.score - a.score.score);
}

export async function matchCompany(tx: Prisma.TransactionClient, clientId: string, incoming: IncomingCompany): Promise<MatchDecision<Candidate>> {
  const decision = decide(await findMatches(tx, clientId, incoming));
  if (decision.action === 'match' || !incoming.domain) return decision;
  // One account per company domain within a client is a database rule; an
  // account already holding this domain is this company whatever else differs.
  const holder = await tx.account.findFirst({ where: { clientId, domain: incoming.domain, deletedAt: null }, select: CANDIDATE_SELECT });
  if (!holder) return decision;
  return {
    action: 'match',
    match: holder,
    score: { score: 0.98, reasons: [{ code: 'DOMAIN', label: `Same website (${incoming.domain})`, score: 0.98 }], conflict: null },
  };
}

/**
 * Serializes concurrent inserts of the same company within a client for the
 * rest of the transaction. Two discovery jobs, or an import and a job,
 * finding the same business at the same moment queue up here instead of
 * both passing the "does it exist?" check and inserting twice. The database
 * unique constraint on (clientId, domain) remains the final backstop.
 */
export async function lockCompanyKey(tx: Prisma.TransactionClient, clientId: string, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clientId}), hashtext(${key}))`;
}
