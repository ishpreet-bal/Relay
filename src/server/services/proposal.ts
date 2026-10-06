import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { addDays } from 'date-fns';
import { estimateRoi } from './roi';
import { logActivity } from './activity';

/**
 * Proposal generation.
 *
 * Pricing is arithmetic on the organization's rate card and the effort
 * estimates that survived research verification. No model is asked to produce
 * a dollar figure. A proposal is a commercial commitment; a hallucinated number
 * in one is not an embarrassment, it is a contract dispute.
 */

export interface ScopePhase {
  phase: string;
  deliverables: string[];
  days: number;
  weeks: number;
}

export interface LineItem {
  label: string;
  detail?: string;
  qty: number;
  unitCents: number;
  recurring: boolean;
}

/** Effort multipliers per phase, applied to the total build estimate. */
const PHASE_SHAPE = [
  { phase: 'Discovery and mapping', share: 0.15, deliverables: ['Process walkthrough with your team', 'Current-state workflow map', 'Agreed success measures'] },
  { phase: 'Build', share: 0.55, deliverables: ['Automation built and connected to your systems', 'Test environment you can try before go-live'] },
  { phase: 'Rollout and training', share: 0.20, deliverables: ['Go-live with your team', 'Written runbook and short training session'] },
  { phase: 'Stabilization', share: 0.10, deliverables: ['Two weeks of monitoring and fixes', 'Handover or ongoing support agreement'] },
];

export async function buildProposal(params: {
  organizationId: string;
  accountId: string;
  userId: string | null;
  title?: string;
  /** Which researched opportunities to include, by index. Defaults to all. */
  includeOpportunities?: number[];
  overrides?: { dayRateCents?: number; discoveryFeeCents?: number; supportMonthlyCents?: number };
}) {
  const [org, lead] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: params.organizationId } }),
    db.account.findFirstOrThrow({
      where: { id: params.accountId, organizationId: params.organizationId, deletedAt: null },
      include: { research: true },
    }),
  ]);

  const research = lead.research;
  type Opportunity = {
    title: string; workflow?: string; tooling?: string[];
    hoursPerWeek?: number; effortDays?: number; confidence: number;
    citations?: Array<{ url: string; quote: string }>;
  };

  const all = (research?.opportunities ?? []) as unknown as Opportunity[];
  const selected = params.includeOpportunities?.length
    ? params.includeOpportunities.map((i) => all[i]).filter(Boolean) as Opportunity[]
    : all;

  if (!selected.length) {
    throw new Error('This lead has no verified automation opportunities to propose. Run research first.');
  }

  const dayRate = params.overrides?.dayRateCents ?? org.dayRateCents;
  const discoveryFee = params.overrides?.discoveryFeeCents ?? org.discoveryFeeCents;
  const supportMonthly = params.overrides?.supportMonthlyCents ?? org.supportMonthlyCents;

  // Effort comes from research; anything missing gets a conservative default
  // rather than a guess that looks precise.
  const buildDays = selected.reduce((sum, o) => sum + (o.effortDays ?? 5), 0);

  const scope: ScopePhase[] = PHASE_SHAPE.map((p) => {
    const days = Math.max(1, Math.round(buildDays * p.share));
    return { phase: p.phase, deliverables: p.deliverables, days, weeks: Math.max(1, Math.ceil(days / 4)) };
  });

  const totalDays = scope.reduce((sum, p) => sum + p.days, 0);

  const lineItems: LineItem[] = [
    ...(discoveryFee > 0
      ? [{ label: 'Discovery', detail: 'Process mapping and scoping', qty: 1, unitCents: discoveryFee, recurring: false }]
      : []),
    ...selected.map((o) => ({
      label: o.title,
      detail: o.workflow,
      qty: o.effortDays ?? 5,
      unitCents: dayRate,
      recurring: false,
    })),
    ...(supportMonthly > 0
      ? [{ label: 'Ongoing support and monitoring', detail: 'Monthly, cancel with 30 days notice', qty: 1, unitCents: supportMonthly, recurring: true }]
      : []),
  ];

  const subtotalCents = lineItems.filter((i) => !i.recurring).reduce((sum, i) => sum + i.qty * i.unitCents, 0);
  const recurringMonthlyCents = lineItems.filter((i) => i.recurring).reduce((sum, i) => sum + i.qty * i.unitCents, 0);

  const roi = estimateRoi(
    selected.map((o) => ({ title: o.title, hoursPerWeek: o.hoursPerWeek ?? 0, confidence: o.confidence })),
  );

  // Payback is the honest headline: how long before the build pays for itself
  // at the estimated savings rate. Null when savings are too small to matter.
  const monthlySavings = roi.annualSavingsCents / 12;
  const paybackMonths = monthlySavings > supportMonthly
    ? Math.ceil(subtotalCents / (monthlySavings - supportMonthly))
    : null;

  const number = await nextProposalNumber(params.organizationId);
  const shareToken = randomBytes(24).toString('base64url');

  const proposal = await db.proposal.create({
    data: {
      organizationId: params.organizationId,
      accountId: params.accountId,
      number,
      title: params.title ?? `Automation proposal for ${lead.name}`,
      status: 'DRAFT',
      scope: scope as never,
      lineItems: lineItems as never,
      subtotalCents,
      taxCents: 0,
      totalCents: subtotalCents,
      recurringMonthlyCents,
      currency: org.currency,
      timeline: {
        totalDays,
        totalWeeks: scope.reduce((sum, p) => sum + p.weeks, 0),
        phases: scope.map((p) => ({ phase: p.phase, weeks: p.weeks })),
      } as never,
      roiSummary: {
        hoursSavedPerMonth: roi.hoursSavedPerMonth,
        annualSavingsCents: roi.annualSavingsCents,
        paybackMonths,
        assumptions: roi.assumptions,
        perOpportunity: roi.perOpportunity,
        // Sources travel with the proposal, so a claim can be defended in the
        // meeting where it is questioned.
        evidence: selected.flatMap((o) => (o.citations ?? []).map((c) => ({ opportunity: o.title, url: c.url, quote: c.quote }))),
      } as never,
      diagram: (research?.opportunities ?? null) as never,
      terms: org.proposalTerms,
      shareToken,
      expiresAt: addDays(new Date(), org.proposalValidDays),
    },
  });

  await logActivity({
    organizationId: params.organizationId,
    accountId: params.accountId,
    userId: params.userId,
    type: 'SYSTEM',
    title: `Proposal ${number} drafted`,
    body: `${selected.length} workstreams, ${totalDays} days, ${(subtotalCents / 100).toLocaleString('en-CA', { style: 'currency', currency: org.currency })}.`,
  });

  return proposal;
}

/** Sequential per-organization numbering: ORG-2026-0042. */
async function nextProposalNumber(organizationId: string) {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;

  const latest = await db.proposal.findFirst({
    where: { organizationId, number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const next = latest ? Number(latest.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/** Records a view without storing raw visitor identifiers. */
export async function recordProposalView(shareToken: string) {
  const proposal = await db.proposal.findUnique({ where: { shareToken } });
  if (!proposal) return null;

  await db.proposal.update({
    where: { id: proposal.id },
    data: {
      viewCount: { increment: 1 },
      firstViewedAt: proposal.firstViewedAt ?? new Date(),
      status: proposal.status === 'SENT' ? 'VIEWED' : proposal.status,
    },
  });

  if (!proposal.firstViewedAt) {
    await logActivity({
      organizationId: proposal.organizationId,
      accountId: proposal.accountId,
      type: 'PROPOSAL_VIEWED',
      title: `Proposal ${proposal.number} opened`,
      body: 'The prospect opened the proposal for the first time.',
    });
  }

  return proposal;
}

/**
 * Records acceptance. This is a typed-name acknowledgement with a timestamp and
 * IP — enough to show intent and to move the deal forward, and NOT a qualified
 * electronic signature. For anything requiring one, route the PDF through a
 * dedicated e-signature provider; the share link is not a substitute.
 */
export async function acceptProposal(params: { shareToken: string; signatureName: string; ipAddress: string | null }) {
  const proposal = await db.proposal.findUnique({ where: { shareToken: params.shareToken } });
  if (!proposal) return null;
  if (proposal.expiresAt && proposal.expiresAt < new Date()) return { expired: true as const };
  if (proposal.status === 'ACCEPTED') return { alreadyAccepted: true as const, proposal };

  const updated = await db.proposal.update({
    where: { id: proposal.id },
    data: {
      status: 'ACCEPTED',
      acceptedAt: new Date(),
      signatureName: params.signatureName.trim().slice(0, 120),
      signatureIp: params.ipAddress,
    },
  });

  await db.account.update({
    where: { id: proposal.accountId },
    data: { status: 'WON', temperature: 'HOT' },
  });
  await logActivity({
    organizationId: proposal.organizationId,
    accountId: proposal.accountId,
    type: 'SYSTEM',
    title: `Proposal ${proposal.number} accepted`,
    body: `Accepted by ${params.signatureName}.`,
  });

  return { proposal: updated };
}
