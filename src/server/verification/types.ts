import type { ClaimKind, ClaimStatus, ClaimType, EvidenceStatus, VerificationStatus } from '@prisma/client';

/**
 * One statement a draft is allowed to make, with the evidence behind it.
 * The ledger is the only bridge between what Foundry knows and what a draft
 * says: if something is not in the ledger, the draft cannot claim it.
 */
export interface LedgerFact {
  id: string;
  kind: 'prospect' | 'sender';
  claimType: ClaimType | null;
  statement: string;
  sourceUrl: string | null;
  sourceQuote: string | null;
  evidenceStatus: EvidenceStatus;
  /** When the event happened, if the source says. */
  eventDate: Date | null;
  /** When Foundry found it. */
  detectedAt: Date | null;
  /** Firmographic facts (title, location, industry) are weak personalization. */
  firmographic: boolean;
  signalId?: string;
  proofPointId?: string;
}

/** What the model says it claimed, sentence by sentence. */
export interface ReportedClaim {
  sentence: string;
  factId: string | null;
  kind: 'PROSPECT' | 'SENDER';
}

export interface ClaimResult {
  text: string;
  kind: ClaimKind;
  claimType: ClaimType | null;
  status: ClaimStatus;
  supportScore: number;
  approvedType: boolean;
  factId: string | null;
  signalId: string | null;
  proofPointId: string | null;
  sourceUrl: string | null;
  sourceQuote: string | null;
  evidenceDate: Date | null;
  freshnessDays: number | null;
  reason: string | null;
}

export interface VerificationResult {
  status: VerificationStatus;
  score: number;
  claims: ClaimResult[];
  summary: {
    factual: number;
    supported: number;
    partial: number;
    unsupported: number;
    stale: number;
    contradicted: number;
    unapprovedTypes: number;
    reasons: string[];
  };
}
