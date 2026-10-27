import { z } from 'zod';
import { db } from '@/lib/db';
import { assertClientAccess, clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { detailsCost, placeListing, type PlaceListing } from '@/server/connectors/providers/google-places';
import { throttled } from '@/server/queues/throttle';
import { assertCategoryBudget } from '@/server/services/pipeline/budgets';
import { recordUsage } from '@/server/services/usage';
import { createAccount } from '@/server/services/accounts';

/**
 * The no-website call list. Each lead is a business discovery found without a
 * website of its own. Relay keeps only the place id, the search that found
 * it and what happened on the phone; the listing (name, phone, address) is
 * read live from Google when someone opens the lead and is never stored.
 *
 * Phoning businesses is outside the National Do Not Call List, but the
 * CRTC's Telemarketing Rules still apply, including keeping an internal
 * do-not-call list: DO_NOT_CALL is permanent, and discovery never brings a
 * lead back.
 */

export const LEAD_STATUSES = ['NEW', 'CALLBACK', 'CALLED', 'INTERESTED', 'NOT_INTERESTED', 'DO_NOT_CALL', 'CONVERTED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CALL_OUTCOMES = ['NO_ANSWER', 'LEFT_MESSAGE', 'CALLBACK', 'INTERESTED', 'NOT_INTERESTED', 'DO_NOT_CALL'] as const;

/** Where a call outcome leaves the lead. */
export function statusAfter(outcome: (typeof CALL_OUTCOMES)[number]): LeadStatus {
  switch (outcome) {
    case 'CALLBACK': return 'CALLBACK';
    case 'INTERESTED': return 'INTERESTED';
    case 'NOT_INTERESTED': return 'NOT_INTERESTED';
    case 'DO_NOT_CALL': return 'DO_NOT_CALL';
    default: return 'CALLED';
  }
}

export async function listCallLeads(access: AccessContext, opts: { clientId?: string | null; status?: LeadStatus | null; cursor?: string | null; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const scope = clientFilter(access, opts.clientId);
  const rows = await db.callLead.findMany({
    where: { ...scope, ...(opts.status ? { status: opts.status } : {}) },
    // Promised callbacks first, then the newest.
    orderBy: [{ callbackAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const counts = await db.callLead.groupBy({ by: ['status'], where: scope, _count: true });
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<LeadStatus, number>>,
  };
}

async function loadLead(access: AccessContext, id: string) {
  const lead = await db.callLead.findFirst({ where: { id, ...clientFilter(access) } });
  if (!lead) throw new NotFoundError('Lead');
  return lead;
}

/**
 * The business's current Google listing, looked up now and returned for
 * display only. Each lookup is a billed Google request within the discovery
 * budget.
 */
export async function leadListing(access: AccessContext, id: string, fetchImpl?: typeof fetch): Promise<{ listing: PlaceListing; attribution: string; costMillicents: number }> {
  const lead = await loadLead(access, id);
  if (lead.provider !== 'google_places') throw new DomainError('Only Google Places leads can be looked up.');
  if (lead.status === 'DO_NOT_CALL') throw new DomainError('This business asked not to be called.');
  const cost = detailsCost();
  await assertCategoryBudget(lead.organizationId, 'discovery', cost.millicents);
  const listing = await throttled('google_places', () => placeListing(lead.externalId, fetchImpl), () => ({ ok: true }));
  await recordUsage({
    organizationId: lead.organizationId, clientId: lead.clientId, provider: 'google_places', type: 'DISCOVERY_REQUEST',
    costMillicents: cost.millicents, isEstimate: cost.isEstimate, operation: 'google_places.details',
    metadata: { callLeadId: lead.id },
  });
  return { listing, attribution: 'Listing details from Google Maps', costMillicents: cost.millicents };
}

export const logCallSchema = z.object({
  outcome: z.enum(CALL_OUTCOMES),
  notes: z.string().trim().max(4000).optional().nullable(),
  callbackAt: z.coerce.date().optional().nullable(),
});

export async function logLeadCall(access: AccessContext, userId: string, id: string, raw: z.input<typeof logCallSchema>) {
  const lead = await loadLead(access, id);
  if (lead.status === 'CONVERTED') throw new DomainError('This lead is already an account; log calls there.');
  const input = logCallSchema.parse(raw);
  if (input.outcome === 'CALLBACK' && !input.callbackAt) throw new DomainError('Pick when to call back.');
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const note = input.notes ? `${stamp} ${input.outcome.toLowerCase().replace(/_/g, ' ')}: ${input.notes}` : null;
  return db.callLead.update({
    where: { id },
    data: {
      status: statusAfter(input.outcome),
      calls: { increment: 1 },
      lastCalledAt: new Date(),
      lastCalledById: userId,
      callbackAt: input.outcome === 'CALLBACK' ? input.callbackAt : null,
      ...(note ? { notes: lead.notes ? `${lead.notes}\n${note}` : note } : {}),
    },
  });
}

export const convertLeadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  contactFirstName: z.string().trim().max(80).optional().nullable(),
  contactLastName: z.string().trim().max(80).optional().nullable(),
  contactTitle: z.string().trim().max(160).optional().nullable(),
  contactEmail: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  /** They agreed on the call to receive email from Relay (express consent under CASL). */
  agreedToEmail: z.boolean().default(false),
});

/**
 * Turns an interested lead into an account from what the business said on
 * the call (typed in by the caller, not copied from Google). The place id
 * goes with it, so discovery recognises the business later.
 */
export async function convertLead(access: AccessContext, userId: string, id: string, raw: z.input<typeof convertLeadSchema>) {
  const lead = await loadLead(access, id);
  assertClientAccess(access, lead.clientId);
  if (lead.status === 'CONVERTED' && lead.accountId) return { accountId: lead.accountId, created: false };
  if (lead.status === 'DO_NOT_CALL') throw new DomainError('This business asked not to be called.');
  const input = convertLeadSchema.parse(raw);
  const hasContact = !!(input.contactFirstName || input.contactLastName || input.contactEmail);
  const today = new Date().toISOString().slice(0, 10);
  const result = await createAccount(access, userId, {
    clientId: lead.clientId,
    name: input.name,
    phone: input.phone ?? null,
    industry: input.industry ?? lead.searchTerm ?? null,
    city: lead.searchCity ?? null,
    region: lead.searchRegion ?? null,
    country: 'CA',
    source: 'MANUAL',
    notes: `From the no-website call list. Details confirmed with the business by phone on ${today}.${lead.notes ? `\n${lead.notes}` : ''}`,
    tags: ['no-website'],
    identifiers: [{ provider: lead.provider, externalId: lead.externalId }],
    contacts: hasContact ? [{
      firstName: input.contactFirstName ?? null,
      lastName: input.contactLastName ?? null,
      title: input.contactTitle ?? null,
      email: input.contactEmail ?? null,
      phone: input.phone ?? null,
      source: 'MANUAL',
      consentBasis: input.agreedToEmail ? 'EXPRESS' : 'UNKNOWN',
      consentNote: input.agreedToEmail ? `Agreed by phone on ${today} to receive email from Relay.` : null,
    }] : [],
  });
  if (result.status === 'excluded') throw new DomainError(result.reason);
  await db.callLead.update({ where: { id }, data: { status: 'CONVERTED', accountId: result.accountId } });
  return { accountId: result.accountId, created: result.status === 'created' };
}
