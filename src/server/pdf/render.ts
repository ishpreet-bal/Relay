import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { db } from '@/lib/db';
import { ProposalDocument, type ProposalPdfData } from './proposal-document';

/**
 * Renders a stored proposal to PDF. Everything comes from the database row, so
 * the PDF a prospect downloads is always the proposal that was approved — it
 * cannot drift from what the app shows.
 */
export async function renderProposalPdf(proposalId: string, organizationId: string): Promise<Buffer> {
  const proposal = await db.proposal.findFirstOrThrow({
    where: { id: proposalId, organizationId },
    include: {
      lead: { select: { companyName: true, city: true, region: true } },
      organization: { select: { brandName: true, name: true, brandPrimary: true } },
    },
  });

  const roi = (proposal.roiSummary ?? {}) as ProposalPdfData['roi'];

  const data: ProposalPdfData = {
    number: proposal.number,
    title: proposal.title,
    agencyName: proposal.organization.brandName ?? proposal.organization.name,
    accentColor: proposal.organization.brandPrimary,
    clientName: proposal.lead.companyName,
    clientCity: [proposal.lead.city, proposal.lead.region].filter(Boolean).join(', ') || null,
    preparedOn: proposal.createdAt.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
    validUntil: proposal.expiresAt?.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) ?? null,
    currency: proposal.currency,
    scope: (proposal.scope ?? []) as ProposalPdfData['scope'],
    lineItems: (proposal.lineItems ?? []) as ProposalPdfData['lineItems'],
    subtotalCents: proposal.subtotalCents,
    recurringMonthlyCents: proposal.recurringMonthlyCents,
    roi: {
      hoursSavedPerMonth: roi.hoursSavedPerMonth ?? 0,
      annualSavingsCents: roi.annualSavingsCents ?? 0,
      paybackMonths: roi.paybackMonths ?? null,
      assumptions: roi.assumptions ?? { note: '' },
      evidence: roi.evidence ?? [],
    },
    timeline: (proposal.timeline ?? { totalWeeks: 0 }) as ProposalPdfData['timeline'],
    terms: proposal.terms,
  };

  return renderToBuffer(
    createElement(ProposalDocument, { data }) as ReactElement<DocumentProps>,
  );
}
