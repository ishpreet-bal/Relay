import { requirePermission } from '@/lib/auth';
import { renderProposalPdf } from '@/server/pdf/render';
import { db } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission('proposal:read');

  const proposal = await db.proposal.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { number: true },
  });
  if (!proposal) return new Response('Not found', { status: 404 });

  const pdf = await renderProposalPdf(id, session.organizationId);

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="proposal-${proposal.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
