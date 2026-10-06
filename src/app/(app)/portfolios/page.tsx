import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { pageSession } from '@/lib/page-auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Topbar } from '@/components/shell/topbar';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Demo sites' };

export default async function PortfoliosPage() {
  const session = await pageSession('portfolio:read');

  const sites = await db.portfolioSite.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: 'desc' },
    include: { account: { select: { id: true, name: true } } },
  });

  const root = env().PORTFOLIO_ROOT_DOMAIN;

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

          {sites.length === 0 ? (
            <div className="card p-12 text-center">
              <h2 className="font-display font-semibold mb-1">No demo sites yet</h2>
              <p className="text-sm text-muted">Demo sites belong to Relay&apos;s earlier automation-agency workflow. Existing sites keep working.</p>
            </div>
          ) : (
            <ul className="card divide-y divide-hairline">
              {sites.map((site) => (
                <li key={site.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/accounts/${site.account.id}`} className="text-[13px] font-medium hover:text-accent">
                      {site.account.name}
                    </Link>
                    <p className="num text-[11px] text-muted truncate">{site.subdomain}.{root}</p>
                  </div>
                  <div className="text-right">
                    <p className="num text-micro">{site.viewCount}</p>
                    <p className="text-[10px] text-muted">views</p>
                  </div>
                  <span className={cn('text-[11px] w-20 text-right',
                    site.isPublished ? 'text-cleared' : 'text-muted')}>
                    {site.isPublished ? 'Published' : 'Draft'}
                  </span>
                  {site.isPublished && (
                    <a href={`https://${site.subdomain}.${root}`} target="_blank" rel="noopener noreferrer"
                       className="btn-ghost size-7 p-0" aria-label="Open site">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
