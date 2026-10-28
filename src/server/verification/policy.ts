import type { ApprovalMode, ClaimType, PersonalizationTier } from '@prisma/client';
import type { VerificationResult } from './types';

/**
 * The automation policy: "Relay automatically sends messages that satisfy
 * approved policies. Uncertain messages go into review."
 *
 * A draft is approved by policy only when every condition holds. Each failed
 * condition becomes a reason the reviewer sees, so "why wasn't this sent
 * automatically?" always has an answer. Approval by policy does not bypass
 * the send gate — suppression, caps, cooling-off and domain checks still run.
 */

export interface PolicyInput {
  mode: ApprovalMode;
  threshold: number;
  approvedClaimTypes: readonly ClaimType[];
  verification: VerificationResult;
  hasLintBlockers: boolean;
  tier: PersonalizationTier;
  campaignActive: boolean;
}

export interface PolicyDecision {
  autoApprove: boolean;
  reasons: string[];
  snapshot: {
    mode: ApprovalMode;
    threshold: number;
    approvedClaimTypes: ClaimType[];
    score: number;
    status: string;
    decidedAt: string;
  };
}

export function decideApproval(input: PolicyInput, now = new Date()): PolicyDecision {
  const reasons: string[] = ['A person must review every outreach message.'];

  if (input.mode !== 'AUTO_APPROVE_VERIFIED') reasons.push('This campaign reviews every message.');
  if (!input.campaignActive) reasons.push('The campaign is not active.');
  if (input.hasLintBlockers) reasons.push('The draft has issues that must be edited.');
  if (input.tier === 'NONE') reasons.push('The draft has no personalization at all.');
  if (input.verification.status !== 'VERIFIED') {
    reasons.push(`Verification is ${input.verification.status.toLowerCase().replace(/_/g, ' ')}.`);
  }
  if (input.verification.score < input.threshold) {
    reasons.push(`Verification score ${input.verification.score.toFixed(2)} is below the ${input.threshold.toFixed(2)} threshold.`);
  }

  return {
    autoApprove: false,
    reasons,
    snapshot: {
      mode: input.mode,
      threshold: input.threshold,
      approvedClaimTypes: [...input.approvedClaimTypes],
      score: input.verification.score,
      status: input.verification.status,
      decidedAt: now.toISOString(),
    },
  };
}

/** Sensible defaults: the claim types a careful reviewer would rarely reject. */
export const DEFAULT_APPROVED_CLAIM_TYPES: readonly ClaimType[] = [
  'JOB_TITLE', 'COMPANY_LOCATION', 'COMPANY_INDUSTRY', 'PRODUCTS_SERVICES', 'SERVICE_AREA',
];

export { CLAIM_TYPE_LABELS } from '@/lib/domain';
