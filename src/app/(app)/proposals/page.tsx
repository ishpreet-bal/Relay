import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { Topbar } from '@/components/shell/topbar';
import { cn, formatMoney } from '@/lib/utils';

export const metadata = { title: 'Proposals' };

const TONE: Record<string, string> = {
  DRAFT: 'text-muted', SENT: 'text-accent', VIEWED: 'text-held',
  ACCEPTED: 'text-cleared', DECLINED: 'text-blocked', EXPIRED: 'text-muted',
};

export default async function ProposalsPage() {
  const session = await requirePermission('proposal:read');

  const proposals = await db.proposal.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { account: { select: { id: true, name: true } } },
  });

  const outstanding = proposals
    .filter((p) => ['SENT', 'VIEWED'].includes(p.status))
    .reduce((sum, p) => sum + p.totalCents, 0);
  const won = proposals.filter((p) => p.status === 'ACCEPTED').reduce((sum, p) => sum + p.totalCents, 0);

  return (
    <>
      <Topbar title="Proposals" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            <Stat label="Out for decision" value={formatMoney(outstanding)} />
            <Stat label="Accepted" value={formatMoney(won)} tone="cleared" />
            <Stat label="Total proposals" value={String(proposals.length)} />
          </div>

          {proposals.length === 0 ? (
            <div className="card p-12 text-center">
              <h2 className="font-display font-semibold mb-1">No proposals yet</h2>
              <p className="text-sm text-muted max-w-md mx-auto">
                Proposals belong to Relay&apos;s earlier automation-agency workflow. Existing proposals stay
                here and their links keep working; new ones are no longer generated.
              </p>
            </div>
          ) : (
            <ul className="card divide-y divide-hairline">
              {proposals.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/accounts/${p.account.id}`} className="text-[13px] font-medium hover:text-accent">
                      {p.account.name}
                    </Link>
                    <p className="num text-[11px] text-muted">
                      {p.number} · {p.createdAt.toLocaleDateString('en-CA')}
                      {p.viewCount > 0 && ` · viewed ${p.viewCount}×`}
                    </p>
                  </div>
                  <span className="num text-micro">{formatMoney(p.totalCents, p.currency)}</span>
                  <span className={cn('text-[11px] capitalize w-20 text-right', TONE[p.status])}>
                    {p.status.toLowerCase()}
                  </span>
                  <a href={`/api/proposals/${p.id}/pdf`} target="_blank" rel="noopener noreferrer"
                     className="btn-ghost h-7 px-2 text-micro">PDF</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'cleared' }) {
  return (
    <div className="card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{label}</p>
      <p className={cn('num text-xl font-medium', tone === 'cleared' && 'text-cleared')}>{value}</p>
    </div>
  );
}
