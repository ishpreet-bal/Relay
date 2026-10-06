import type { ClaimType, EvidenceStatus, SignalType } from '@prisma/client';
import { db } from '@/lib/db';
import type { VerifiedFact } from '@/server/ai/research';
import type { LedgerFact } from './types';

/**
 * Builds the fact ledger for one contact at one account: the complete list of
 * things a draft may say about them, and about the sender.
 *
 * Sources, in order of strength:
 *   - research facts that survived quote verification (VERIFIED);
 *   - signals, carrying their own evidence status and event date;
 *   - firmographics (title, location, industry) with the evidence status of
 *     the provider or person that supplied them;
 *   - the client's approved proof points, for claims about the sender.
 */

const SIGNAL_CLAIM: Record<SignalType, ClaimType> = {
  HIRING: 'HIRING',
  FUNDING: 'FUNDING',
  EXPANSION: 'EXPANSION',
  NEW_LOCATION: 'NEW_LOCATION',
  NEW_CONTRACT: 'NEW_CONTRACT',
  NEW_PRODUCT: 'NEW_PRODUCT',
  TECHNOLOGY_CHANGE: 'TECHNOLOGY_USED',
  LEADERSHIP_CHANGE: 'LEADERSHIP_CHANGE',
  REGULATORY_EVENT: 'REGULATORY_EVENT',
  CUSTOM_SIGNAL: 'OTHER_FACT',
};

export interface Ledger {
  facts: LedgerFact[];
  /** True when at least one non-firmographic prospect fact exists. */
  hasResearch: boolean;
  signalIds: string[];
}

export async function buildLedger(params: { accountId: string; contactId: string | null; clientId: string }): Promise<Ledger> {
  const [account, contact, proofPoints, provenance] = await Promise.all([
    db.account.findUniqueOrThrow({
      where: { id: params.accountId },
      include: {
        research: { select: { status: true, facts: true, refreshedAt: true } },
        signals: { where: { dismissedAt: null, evidenceStatus: { not: 'REJECTED' } }, orderBy: { detectedAt: 'desc' }, take: 10 },
      },
    }),
    params.contactId ? db.contact.findUnique({ where: { id: params.contactId } }) : null,
    db.proofPoint.findMany({
      where: { clientId: params.clientId, isActive: true, approvedForOutreach: true },
      orderBy: { createdAt: 'asc' },
      take: 8,
    }),
    db.dataProvenance.findMany({
      where: {
        isCurrent: true,
        OR: [
          { accountId: params.accountId, field: { in: ['city', 'region', 'industry'] } },
          ...(params.contactId ? [{ contactId: params.contactId, field: 'title' }] : []),
        ],
      },
    }),
  ]);

  const evidenceFor = (field: string, owner: 'account' | 'contact'): { status: EvidenceStatus; at: Date | null; url: string | null } => {
    const row = provenance.find((p) => p.field === field && (owner === 'contact' ? p.contactId : p.accountId));
    return { status: row?.status ?? 'UNVERIFIED', at: row?.retrievedAt ?? null, url: row?.sourceUrl ?? null };
  };

  const facts: LedgerFact[] = [];
  let n = 1;
  const nextId = () => `f${n++}`;

  if (account.research?.status === 'COMPLETED' && Array.isArray(account.research.facts)) {
    for (const f of account.research.facts as unknown as VerifiedFact[]) {
      const citation = f.citations?.[0];
      if (!citation) continue;
      facts.push({
        id: nextId(), kind: 'prospect', claimType: f.claimType, statement: f.statement,
        sourceUrl: citation.url, sourceQuote: citation.quote, evidenceStatus: 'VERIFIED',
        eventDate: null, detectedAt: account.research.refreshedAt, firmographic: false,
      });
    }
  }

  for (const s of account.signals) {
    facts.push({
      id: nextId(), kind: 'prospect', claimType: SIGNAL_CLAIM[s.type],
      statement: [s.title, s.summary].filter(Boolean).join('. '),
      sourceUrl: s.sourceUrl, sourceQuote: s.sourceQuote, evidenceStatus: s.evidenceStatus,
      eventDate: s.eventDate, detectedAt: s.detectedAt, firmographic: false, signalId: s.id,
    });
  }

  if (contact?.title) {
    const ev = evidenceFor('title', 'contact');
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'The contact';
    facts.push({
      id: nextId(), kind: 'prospect', claimType: 'JOB_TITLE',
      statement: `${name} is ${contact.title} at ${account.name}.`,
      sourceUrl: ev.url, sourceQuote: null, evidenceStatus: ev.status,
      eventDate: null, detectedAt: ev.at, firmographic: true,
    });
  }
  if (account.city || account.region) {
    const ev = evidenceFor(account.city ? 'city' : 'region', 'account');
    facts.push({
      id: nextId(), kind: 'prospect', claimType: 'COMPANY_LOCATION',
      statement: `${account.name} is based in ${[account.city, account.region].filter(Boolean).join(', ')}.`,
      sourceUrl: ev.url, sourceQuote: null, evidenceStatus: ev.status,
      eventDate: null, detectedAt: ev.at, firmographic: true,
    });
  }
  if (account.industry) {
    const ev = evidenceFor('industry', 'account');
    facts.push({
      id: nextId(), kind: 'prospect', claimType: 'COMPANY_INDUSTRY',
      statement: `${account.name} is in ${account.industry}.`,
      sourceUrl: ev.url, sourceQuote: null, evidenceStatus: ev.status,
      eventDate: null, detectedAt: ev.at, firmographic: true,
    });
  }

  let s = 1;
  for (const p of proofPoints) {
    facts.push({
      id: `s${s++}`, kind: 'sender', claimType: null, statement: p.statement,
      sourceUrl: p.sourceUrl, sourceQuote: null, evidenceStatus: 'VERIFIED',
      eventDate: null, detectedAt: p.approvedAt, firmographic: false, proofPointId: p.id,
    });
  }

  return {
    facts,
    hasResearch: facts.some((f) => f.kind === 'prospect' && !f.firmographic),
    signalIds: account.signals.map((sig) => sig.id),
  };
}
