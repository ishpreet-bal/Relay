import { db } from '@/lib/db';
import { renderProposalPdf } from '@/server/pdf/render';

/** Public PDF download. The share token is the credential; no session needed. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const proposal = await db.proposal.findUnique({
    where: { shareToken: token },
    select: { id: true, organizationId: true, number: true, expiresAt: true },
  });
  if (!proposal) return new Response('Not found', { status: 404 });
  if (proposal.expiresAt && proposal.expiresAt < new Date()) {
    return new Response('This proposal has expired.', { status: 410 });
  }

  const pdf = await renderProposalPdf(proposal.id, proposal.organizationId);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="proposal-${proposal.number}.pdf"`,
    },
  });
}
