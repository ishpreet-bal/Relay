import { db } from '@/lib/db';
import { subDays } from 'date-fns';
import type { PersonalizationTier } from '@prisma/client';

/**
 * Answers the question I could not answer when the contextual tier was built:
 * are industry-only emails actually worth sending?
 *
 * The naive version of this — "compare the two reply rates and pick the bigger
 * one" — is worse than useless at small volumes. With 12 sends and 1 reply
 * versus 15 sends and 2 replies, the difference is noise, and acting on it
 * means turning a feature on and off at random. So the comparison runs a
 * one-sided two-proportion z-test and refuses to make any recommendation until
 * both tiers clear a minimum sample.
 */

const MIN_SAMPLE_PER_TIER = 40;
const ALPHA = 0.05;

export interface TierStats {
  tier: PersonalizationTier;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  bounced: number;
  complained: number;
  replyRate: number;
  bounceRate: number;
  complaintRate: number;
}

export type Recommendation =
  | { kind: 'insufficient_data'; message: string; needed: number }
  | { kind: 'keep'; message: string; pValue: number }
  | { kind: 'no_difference'; message: string; pValue: number }
  | { kind: 'disable_contextual'; message: string; pValue: number };

export interface TierComparison {
  windowDays: number;
  stats: TierStats[];
  recommendation: Recommendation;
}

export async function compareTiers(organizationId: string, windowDays = 90): Promise<TierComparison> {
  const since = subDays(new Date(), windowDays);

  const rows = await db.message.groupBy({
    by: ['personalizationTier', 'status'],
    where: {
      organizationId,
      direction: 'OUTBOUND',
      sentAt: { gte: since },
      status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED'] },
    },
    _count: true,
  });

  const build = (tier: PersonalizationTier): TierStats => {
    const of = (statuses: string[]) =>
      rows.filter((r) => r.personalizationTier === tier && statuses.includes(r.status))
          .reduce((n, r) => n + r._count, 0);

    // Status is a ladder, so a replied message also counts as sent and opened.
    const sent = of(['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED']);
    const bounced = of(['BOUNCED']);
    const complained = of(['COMPLAINED']);
    const replied = of(['REPLIED']);
    const opened = of(['OPENED', 'CLICKED', 'REPLIED']);
    const delivered = of(['DELIVERED', 'OPENED', 'CLICKED', 'REPLIED']);

    return {
      tier, sent, delivered, opened, replied, bounced, complained,
      replyRate: delivered ? replied / delivered : 0,
      bounceRate: sent ? bounced / sent : 0,
      complaintRate: sent ? complained / sent : 0,
    };
  };

  const verified = build('VERIFIED');
  const contextual = build('CONTEXTUAL');

  return {
    windowDays,
    stats: [verified, contextual],
    recommendation: recommend(verified, contextual),
  };
}

function recommend(verified: TierStats, contextual: TierStats): Recommendation {
  const nA = verified.delivered;
  const nB = contextual.delivered;

  if (nA < MIN_SAMPLE_PER_TIER || nB < MIN_SAMPLE_PER_TIER) {
    const needed = Math.max(MIN_SAMPLE_PER_TIER - nA, MIN_SAMPLE_PER_TIER - nB);
    return {
      kind: 'insufficient_data',
      needed,
      message: `Not enough delivered mail to compare yet. About ${needed} more sends needed before this means anything.`,
    };
  }

  // A complaint rate above 0.1% is an independent reason to stop, regardless of
  // replies. Mailbox providers act on complaints long before you would notice
  // the reply rate sagging.
  if (contextual.complaintRate > 0.001 && contextual.complaintRate > verified.complaintRate * 2) {
    return {
      kind: 'disable_contextual',
      pValue: 0,
      message: `Industry-only emails are drawing spam complaints at ${(contextual.complaintRate * 100).toFixed(2)}% — more than double your researched emails. That threatens delivery for everything you send. Turn them off.`,
    };
  }

  const { z, pValue } = twoProportionZTest(verified.replied, nA, contextual.replied, nB);

  if (pValue < ALPHA && z > 0) {
    const drop = verified.replyRate - contextual.replyRate;
    return {
      kind: 'disable_contextual',
      pValue,
      message: `Researched emails reply at ${(verified.replyRate * 100).toFixed(1)}% versus ${(contextual.replyRate * 100).toFixed(1)}% for industry-only — a real gap, not noise (p=${pValue.toFixed(3)}). Those ${(drop * 100).toFixed(1)} points cost you sending reputation for very little return.`,
    };
  }

  if (contextual.replyRate >= verified.replyRate) {
    return {
      kind: 'keep',
      pValue,
      message: `Industry-only emails are replying at ${(contextual.replyRate * 100).toFixed(1)}%, on par with or better than researched ones. Worth keeping.`,
    };
  }

  return {
    kind: 'no_difference',
    pValue,
    message: `Industry-only emails reply slightly lower (${(contextual.replyRate * 100).toFixed(1)}% vs ${(verified.replyRate * 100).toFixed(1)}%), but the gap isn't statistically meaningful yet (p=${pValue.toFixed(3)}). Keep collecting data.`,
  };
}

/** One-sided two-proportion z-test: is rate A meaningfully higher than rate B? */
export function twoProportionZTest(successA: number, nA: number, successB: number, nB: number) {
  if (nA === 0 || nB === 0) return { z: 0, pValue: 1 };

  const pA = successA / nA;
  const pB = successB / nB;
  const pooled = (successA + successB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  if (se === 0) return { z: 0, pValue: 1 };

  const z = (pA - pB) / se;
  return { z, pValue: 1 - normalCdf(z) };
}

/** Abramowitz & Stegun 7.1.26 approximation; accurate to ~1e-7. */
function normalCdf(z: number) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Runs on a schedule. When the evidence is clear, this turns the contextual
 * tier off by itself and records why — so the decision gets made even if nobody
 * remembers to look at the dashboard in three months. It never turns it back
 * on; re-enabling is a human choice.
 */
export async function enforceContextualGuardrail(organizationId: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!org.allowContextual) return { changed: false, reason: 'Already off' };

  const comparison = await compareTiers(organizationId);
  if (comparison.recommendation.kind !== 'disable_contextual') {
    return { changed: false, reason: comparison.recommendation.message };
  }

  await db.$transaction([
    db.organization.update({
      where: { id: organizationId },
      data: {
        allowContextual: false,
        contextualPausedAt: new Date(),
        contextualPauseReason: comparison.recommendation.message,
      },
    }),
    db.campaign.updateMany({
      where: { organizationId, allowContextual: true },
      data: { allowContextual: false },
    }),
    // Pending industry-only drafts are cancelled rather than left to be
    // approved by someone who didn't see the notice.
    db.message.updateMany({
      where: {
        organizationId,
        personalizationTier: 'CONTEXTUAL',
        status: { in: ['DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED'] },
      },
      data: { status: 'CANCELLED', failureReason: 'Industry-only sending was turned off automatically' },
    }),
  ]);

  return { changed: true, reason: comparison.recommendation.message };
}
