import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { recordProposalView } from '@/server/services/proposal';
import { ProposalAccept } from '@/components/proposals/proposal-accept';
import { formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * The public proposal. No login — a prospect should not need an account to read
 * something you sent them. The share token is the only credential, so it is
 * long, random, and single-purpose.
 */
export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const proposal = await db.proposal.findUnique({
    where: { shareToken: token },
    include: {
      account: { select: { name: true } },
      organization: { select: { brandName: true, name: true, brandPrimary: true, websiteUrl: true } },
    },
  });
  if (!proposal) notFound();

  await recordProposalView(token);

  const expired = proposal.expiresAt ? proposal.expiresAt < new Date() : false;
  const accent = proposal.organization.brandPrimary;
  const agency = proposal.organization.brandName ?? proposal.organization.name;
  const scope = (proposal.scope ?? []) as Array<{ phase: string; deliverables: string[]; weeks: number }>;
  const roi = (proposal.roiSummary ?? {}) as {
    hoursSavedPerMonth?: number; annualSavingsCents?: number; paybackMonths?: number | null;
    assumptions?: { note: string };
  };

  return (
    <main className="min-h-screen bg-canvas">
      <div className="max-w-2xl mx-auto px-6 py-14">
        <p className="eyebrow mb-2" style={{ color: accent }}>{agency}</p>
        <h1 className="text-3xl font-semibold mb-2">{proposal.title}</h1>
        <p className="text-muted mb-8">
          Prepared for {proposal.account.name} · Proposal {proposal.number}
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mb-10">
          <Stat label="Investment" value={formatMoney(proposal.subtotalCents, proposal.currency)} accent={accent}
                caption={proposal.recurringMonthlyCents > 0
                  ? `plus ${formatMoney(proposal.recurringMonthlyCents, proposal.currency)}/mo support` : undefined} />
          <Stat label="Estimated annual saving" value={formatMoney(roi.annualSavingsCents ?? 0, proposal.currency)}
                caption={roi.hoursSavedPerMonth ? `${roi.hoursSavedPerMonth} hours a month` : undefined} />
          <Stat label="Payback" value={roi.paybackMonths ? `${roi.paybackMonths} mo` : '—'} />
        </div>

        <section className="mb-10">
          <h2 className="eyebrow mb-4">What we would build</h2>
          <ol className="space-y-5">
            {scope.map((phase, i) => (
              <li key={i}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <h3 className="font-medium">{phase.phase}</h3>
                  <span className="num text-micro text-muted shrink-0">
                    ~{phase.weeks} week{phase.weeks > 1 ? 's' : ''}
                  </span>
                </div>
                <ul className="space-y-1">
                  {phase.deliverables.map((d) => (
                    <li key={d} className="text-sm text-muted flex gap-2">
                      <span style={{ color: accent }}>·</span>{d}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        {roi.assumptions?.note && (
          <section className="card p-4 mb-10">
            <h2 className="eyebrow mb-2">How the estimate was calculated</h2>
            <p className="text-micro text-muted leading-relaxed">{roi.assumptions.note}</p>
          </section>
        )}

        {proposal.terms && (
          <section className="mb-10">
            <h2 className="eyebrow mb-2">Terms</h2>
            <p className="text-sm text-muted whitespace-pre-wrap">{proposal.terms}</p>
          </section>
        )}

        <div className="flex flex-wrap gap-3 items-center mb-10">
          <a href={`/p/${token}/pdf`} className="btn-outline">Download PDF</a>
          {proposal.organization.websiteUrl && (
            <a href={proposal.organization.websiteUrl} target="_blank" rel="noopener noreferrer"
               className="btn-ghost">About {agency}</a>
          )}
        </div>

        {expired ? (
          <p className="card p-4 text-micro text-muted">
            This proposal expired on {proposal.expiresAt!.toLocaleDateString('en-CA')}. Reply to
            the email it came from and {agency} will send an updated version.
          </p>
        ) : proposal.status === 'ACCEPTED' ? (
          <p className="card p-4 text-micro">
            Accepted by {proposal.signatureName} on{' '}
            {proposal.acceptedAt?.toLocaleDateString('en-CA')}. {agency} will be in touch to schedule discovery.
          </p>
        ) : (
          <ProposalAccept token={token} accent={accent} agency={agency} />
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, caption, accent }: { label: string; value: string; caption?: string; accent?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{label}</p>
      <p className="num text-xl font-medium" style={accent ? { color: accent } : undefined}>{value}</p>
      {caption && <p className="text-[11px] text-muted mt-1">{caption}</p>}
    </div>
  );
}
