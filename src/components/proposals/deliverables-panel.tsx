'use client';

import { useState } from 'react';
import { FileText, Globe, Copy, Check } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn, formatMoney } from '@/lib/utils';

/**
 * The two things you send after a good call, generated from the same verified
 * research. Both refuse to build if research found nothing — a proposal priced
 * off nothing is worse than no proposal.
 */
export function DeliverablesPanel({ leadId, canWrite, hasResearch }: {
  leadId: string; canWrite: boolean; hasResearch: boolean;
}) {
  const utils = trpc.useUtils();
  const proposals = trpc.proposals.byLead.useQuery({ leadId });
  const sites = trpc.proposals.sites.useQuery();

  const generate = trpc.proposals.generate.useMutation({
    onSuccess: () => { utils.proposals.byLead.invalidate({ leadId }); utils.leads.timeline.invalidate({ leadId }); },
  });
  const createSite = trpc.proposals.createSite.useMutation({
    onSuccess: () => { utils.proposals.sites.invalidate(); utils.leads.timeline.invalidate({ leadId }); },
  });
  const publish = trpc.proposals.publishSite.useMutation({ onSuccess: () => utils.proposals.sites.invalidate() });
  const markSent = trpc.proposals.markSent.useMutation({ onSuccess: () => utils.proposals.byLead.invalidate({ leadId }) });

  const leadSites = sites.data?.filter((s) => s.leadId === leadId) ?? [];

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="size-3.5 text-muted" strokeWidth={1.75} />
          <h3 className="text-[13px] font-medium flex-1">Proposals</h3>
          {canWrite && (
            <button type="button" className="btn-outline h-7 text-micro"
                    disabled={!hasResearch || generate.isPending}
                    title={hasResearch ? undefined : 'Research this lead first'}
                    onClick={() => generate.mutate({ leadId })}>
              {generate.isPending ? 'Building…' : 'Generate'}
            </button>
          )}
        </div>

        {!hasResearch && (
          <p className="text-[11px] text-muted">
            Pricing is calculated from the effort estimates in research. Run research first.
          </p>
        )}

        {proposals.data?.length === 0 && hasResearch && (
          <p className="text-[11px] text-muted">No proposal yet.</p>
        )}

        <ul className="space-y-2">
          {proposals.data?.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="num text-micro font-medium">{p.number}</p>
                <p className="text-[11px] text-muted">
                  {formatMoney(p.totalCents, p.currency)}
                  {p.viewCount > 0 && <> · viewed {p.viewCount}×</>}
                </p>
              </div>
              <span className={cn('text-[11px] capitalize',
                p.status === 'ACCEPTED' ? 'text-cleared' : p.status === 'VIEWED' ? 'text-held' : 'text-muted')}>
                {p.status.toLowerCase()}
              </span>
              <a href={`/api/proposals/${p.id}/pdf`} target="_blank" rel="noopener noreferrer"
                 className="btn-ghost h-7 px-2 text-micro">PDF</a>
              {p.status === 'DRAFT' && canWrite && (
                <button type="button" className="btn-outline h-7 text-micro" disabled={markSent.isPending}
                        onClick={() => markSent.mutate({ id: p.id })}>
                  Get link
                </button>
              )}
              {p.status !== 'DRAFT' && <CopyLink url={`/p/${p.shareToken}`} />}
            </li>
          ))}
        </ul>

        {generate.error && <p className="text-[11px] text-blocked mt-2">{generate.error.message}</p>}
        {markSent.data && (
          <p className="text-[11px] text-muted mt-2 num break-all">{markSent.data.url}</p>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="size-3.5 text-muted" strokeWidth={1.75} />
          <h3 className="text-[13px] font-medium flex-1">Demo site</h3>
          {canWrite && leadSites.length === 0 && (
            <button type="button" className="btn-outline h-7 text-micro"
                    disabled={createSite.isPending} onClick={() => createSite.mutate({ leadId })}>
              {createSite.isPending ? 'Creating…' : 'Create'}
            </button>
          )}
        </div>

        {leadSites.length === 0 ? (
          <p className="text-[11px] text-muted">
            A personalized page showing what automation would look like for them, on their
            own subdomain. Created unpublished so you can review it first.
          </p>
        ) : (
          <ul className="space-y-2">
            {leadSites.map((site) => (
              <li key={site.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="num text-micro truncate">{site.subdomain}</p>
                  <p className="text-[11px] text-muted">
                    {site.isPublished ? `${site.viewCount} views · ${site.uniqueVisitors} visitors` : 'Not published'}
                  </p>
                </div>
                {canWrite && (
                  <button type="button" className={site.isPublished ? 'btn-ghost h-7 text-micro' : 'btn-outline h-7 text-micro'}
                          disabled={publish.isPending}
                          onClick={() => publish.mutate({ id: site.id, publish: !site.isPublished })}>
                    {site.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {createSite.error && <p className="text-[11px] text-blocked mt-2">{createSite.error.message}</p>}
      </section>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn-ghost size-7 p-0" aria-label="Copy share link"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}${url}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}>
      {copied ? <Check className="size-3.5 text-cleared" /> : <Copy className="size-3.5" />}
    </button>
  );
}
