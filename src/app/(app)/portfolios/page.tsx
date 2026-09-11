import Link from 'next/link';
import { ExternalLink, Eye, Globe, Settings2 } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Topbar } from '@/components/shell/topbar';
import { EligibleLeads } from '@/components/proposals/eligible-leads';
import { cn } from '@/lib/utils';
import { can } from '@/lib/rbac';

export const metadata = { title: 'Demo sites' };

/** Statuses that mean research has produced something worth building a demo on. */
const RESEARCHED_STATUSES = [
  'RESEARCHED', 'DRAFTED', 'APPROVED', 'CONTACTED',
  'ENGAGED', 'MEETING_BOOKED', 'PROPOSAL_SENT',
] as const;

export default async function PortfoliosPage() {
  const session = await requirePermission('portfolio:read');
  const root = env().PORTFOLIO_ROOT_DOMAIN;

  const [sites, eligible] = await Promise.all([
    db.portfolioSite.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: 'desc' },
      include: { lead: { select: { id: true, companyName: true } } },
    }),
    db.lead.findMany({
      where: {
        organizationId: session.organizationId,
        deletedAt: null,
        status: { in: [...RESEARCHED_STATUSES] },
        portfolios: { none: {} },
      },
      select: { id: true, companyName: true, industry: true, city: true, score: true },
      orderBy: { score: 'desc' },
      take: 12,
    }),
  ]);

  return (
    <>
      <Topbar title="Demo sites" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <p className="text-sm text-muted max-w-2xl mb-6">
            Personalized pages showing a prospect what automation would look like for them.
            Each one shows only what research verified, plus an industry demo clearly
            labelled as sample data.
          </p>

          {!root && (
            <div className="card p-4 mb-6 border-held/40 bg-held/5">
              <p className="text-[13px] font-medium flex items-center gap-2 mb-1">
                <Settings2 className="size-3.5 text-held" />
                Demo sites need a domain before they can go live
              </p>
              <p className="text-micro text-muted">
                Set <span className="num">PORTFOLIO_ROOT_DOMAIN</span> in your environment to a
                domain you control (for example <span className="num">demos.youragency.com</span>),
                and point a wildcard DNS record at this app. You can still create sites now — they
                just cannot be published until the domain is set.
              </p>
            </div>
          )}

          {sites.length > 0 && (
            <ul className="card divide-y divide-hairline mb-8">
              {sites.map((site) => (
                <li key={site.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/leads/${site.lead.id}`} className="text-[13px] font-medium hover:text-accent">
                      {site.lead.companyName}
                    </Link>
                    <p className="num text-[11px] text-muted truncate">
                      {site.subdomain}{root ? `.${root}` : ' · domain not configured'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-micro flex items-center gap-1 justify-end">
                      <Eye className="size-3 text-muted" />{site.viewCount}
                    </p>
                    <p className="text-[10px] text-muted">views</p>
                  </div>
                  <span className={cn('text-[11px] w-20 text-right',
                    site.isPublished ? 'text-cleared' : 'text-muted')}>
                    {site.isPublished ? 'Published' : 'Draft'}
                  </span>
                  {site.isPublished && root && (
                    <a href={`https://${site.subdomain}.${root}`} target="_blank" rel="noopener noreferrer"
                       className="btn-ghost size-7 p-0" aria-label={`Open ${site.subdomain}`}>
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          {sites.length === 0 && (
            <div className="card p-10 text-center mb-8">
              <Globe className="size-7 mx-auto text-muted mb-3" strokeWidth={1.5} />
              <h2 className="font-display font-semibold mb-1">No demo sites yet</h2>
              <p className="text-sm text-muted max-w-sm mx-auto">
                A demo site is built from what research verified about a company, so a lead has to
                be researched first. Researched leads appear below, ready to build.
              </p>
            </div>
          )}

          <section>
            <h2 className="eyebrow mb-1">Ready to build</h2>
            <p className="text-micro text-muted mb-3">
              Researched leads that do not have a demo site yet.
            </p>
            <EligibleLeads leads={eligible} canWrite={can(session.role, 'portfolio:write')} />
          </section>
        </div>
      </div>
    </>
  );
}
