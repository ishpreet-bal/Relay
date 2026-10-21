import type { Prisma } from '@prisma/client';
import { normalizePhone } from '@/server/services/suppression';
import { emailDomain, normalizeLocality } from './normalize';
import { decide, scoreMatch, type CompanyIdentity, type MatchDecision } from './match';

/**
 * Finds the existing accounts an incoming company might be, within one
 * client. Candidates come from cheap indexed lookups (shared identifier,
 * domain, email domain, phone, normalized name and its first word), then
 * every candidate is scored by match.ts.
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
  const or: Prisma.AccountWhereInput[] = [];
  if (incoming.identifiers.length) {
    or.push({ identifiers: { some: { OR: incoming.identifiers.map((i) => ({ provider: i.provider, externalId: i.externalId })) } } });
  }
  if (incoming.domain) or.push({ domain: incoming.domain });
  if (identity.emailDomains.length) or.push({ domain: { in: identity.emailDomains } });
  if (incoming.domain) or.push({ contacts: { some: { email: { endsWith: `@${incoming.domain}` } } } });
  if (incoming.normalizedName) or.push({ normalizedName: incoming.normalizedName });
  // First word catches near-misses ("Acme Machining" vs "Acme Machine Works")
  // without scanning the client's whole list.
  if (firstWord.length >= 3) or.push({ normalizedName: { startsWith: firstWord } });
  if (!or.length) return [];

  const rows: Candidate[] = await tx.account.findMany({
    where: { clientId, deletedAt: null, mergedIntoId: null, ...(excludeId ? { id: { not: excludeId } } : {}), OR: or },
    select: CANDIDATE_SELECT,
    take: 60,
  });

  return rows
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
  return decide(await findMatches(tx, clientId, incoming));
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
