import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getPublicSite, recordSiteView } from '@/server/services/portfolio';
import { SolutionDemo } from '@/components/solutions/solution-demo';
import { solutionSpecSchema } from '@/server/services/templates/spec';
import { formatMoney } from '@/lib/utils';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Content {
  companyName: string;
  city: string | null;
  industry: string | null;
  summary: string | null;
  opportunities: Array<{ title: string; workflow: string; hoursPerWeek: number | null; sourceUrl: string | null }>;
  estimatedHoursSavedPerMonth: number | null;
  estimatedAnnualSavingsCents: number | null;
}

/**
 * The prospect microsite. Public, unauthenticated, and carrying someone else's
 * company name — so it says only what research verified, shows the industry
 * demo on sample data, and is explicit about which is which.
 */
export default async function PortfolioSitePage({ params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const site = await getPublicSite(subdomain);
  if (!site) notFound();

  const h = await headers();
  await recordSiteView({
    siteId: site.id,
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
    referrer: h.get('referer'),
    path: '/',
  });

  const content = site.content as unknown as Content;
  const agency = site.organization.brandName ?? site.organization.name;
  const accent = site.accentColor;

  const spec = site.template ? solutionSpecSchema.safeParse(site.template.spec) : null;

  const proposal = site.showProposal
    ? await db.proposal.findFirst({
        where: { leadId: site.leadId, status: { in: ['SENT', 'VIEWED', 'ACCEPTED'] } },
        orderBy: { createdAt: 'desc' },
        select: { shareToken: true, number: true },
      })
    : null;

  return (
    <main className="min-h-screen bg-canvas">
      <header className="border-b border-hairline bg-surface">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          {/* Only rendered when consent was explicitly recorded. */}
          {site.logoConsent && site.logoUrl && (
            <img src={site.logoUrl} alt={`${content.companyName} logo`} className="h-7 w-auto" />
          )}
          <span className="text-micro text-muted flex-1">Prepared by {agency}</span>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-14 pb-10">
        <p className="eyebrow mb-3" style={{ color: accent }}>
          {content.industry ?? 'Automation'}{content.city ? ` · ${content.city}` : ''}
        </p>
        <h1 className="text-4xl font-semibold tracking-display mb-4 max-w-2xl">{site.headline}</h1>
        {site.subheadline && <p className="text-lg text-muted max-w-2xl">{site.subheadline}</p>}

        {(content.estimatedAnnualSavingsCents || content.estimatedHoursSavedPerMonth) && (
          <div className="flex flex-wrap gap-8 mt-8">
            {content.estimatedHoursSavedPerMonth != null && (
              <div>
                <p className="num text-3xl font-medium" style={{ color: accent }}>
                  {content.estimatedHoursSavedPerMonth}
                </p>
                <p className="text-micro text-muted">hours a month, estimated</p>
              </div>
            )}
            {content.estimatedAnnualSavingsCents != null && (
              <div>
                <p className="num text-3xl font-medium">{formatMoney(content.estimatedAnnualSavingsCents)}</p>
                <p className="text-micro text-muted">a year, estimated</p>
              </div>
            )}
          </div>
        )}
      </section>

      {content.opportunities.length > 0 && (
        <section className="max-w-4xl mx-auto px-6 pb-12">
          <h2 className="eyebrow mb-4">What we noticed</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {content.opportunities.map((o, i) => (
              <article key={i} className="card p-4">
                <h3 className="text-[13px] font-medium mb-1.5">{o.title}</h3>
                <p className="text-micro text-muted leading-relaxed">{o.workflow}</p>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-hairline">
                  {o.hoursPerWeek != null && (
                    <span className="num text-[11px] text-muted">~{o.hoursPerWeek} hrs/week today</span>
                  )}
                  {o.sourceUrl && (
                    <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer"
                       className="text-[11px] hover:underline ml-auto" style={{ color: accent }}>
                      where we saw this
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3">
            These come from reading your public website. If we've read something wrong, tell us — it's
            a starting point for a conversation, not a diagnosis.
          </p>
        </section>
      )}

      {spec?.success && (
        <section className="max-w-4xl mx-auto px-6 pb-12">
          <h2 className="eyebrow mb-1">What the working system looks like</h2>
          <p className="text-micro text-muted mb-4">
            A real example built for {site.template!.industry.toLowerCase()} operations. The data below is
            sample data, not yours.
          </p>
          <SolutionDemo spec={spec.data} accent={accent} title={`${content.companyName} — operations`} />
        </section>
      )}

      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="card p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">Worth a conversation?</h2>
          <p className="text-sm text-muted mb-5 max-w-md mx-auto">
            Fifteen minutes to walk through what's above and find out whether any of it
            is worth building for you.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {site.showScheduler && site.schedulerUrl && (
              <a href={site.schedulerUrl} target="_blank" rel="noopener noreferrer"
                 className="btn-primary" style={{ background: accent }}>
                Book a time
              </a>
            )}
            {proposal && (
              <a href={`/p/${proposal.shareToken}`} className="btn-outline">
                View proposal {proposal.number}
              </a>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-wrap gap-3 justify-between text-[11px] text-muted">
          <span>Prepared by {agency} for {content.companyName}.</span>
          {site.expiresAt && <span>This page comes down on {site.expiresAt.toLocaleDateString('en-CA')}.</span>}
        </div>
      </footer>
    </main>
  );
}
