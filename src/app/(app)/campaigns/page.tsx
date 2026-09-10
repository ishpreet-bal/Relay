import Link from 'next/link';
import { Plus, AlertTriangle } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { Topbar } from '@/components/shell/topbar';
import { SequenceDiagram } from '@/components/campaigns/sequence-diagram';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Campaigns' };

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-raised text-muted',
  READY_FOR_REVIEW: 'bg-accent-soft text-accent',
  ACTIVE: 'bg-cleared/12 text-cleared',
  PAUSED: 'bg-held/12 text-held',
  COMPLETED: 'bg-raised text-muted',
};

export default async function CampaignsPage() {
  const session = await requirePermission('campaign:read');

  const campaigns = await db.campaign.findMany({
    where: { organizationId: session.organizationId, status: { not: 'ARCHIVED' } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      steps: { orderBy: { order: 'asc' } },
      mailbox: { select: { fromEmail: true, spfVerified: true, dkimVerified: true } },
      _count: { select: { enrollments: true } },
    },
  });

  return (
    <>
      <Topbar
        title="Campaigns"
        actions={
          <Link href="/campaigns/new" className="btn-primary h-8 text-micro">
            <Plus className="size-3.5" /> New campaign
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-4">
          {campaigns.length === 0 && (
            <div className="card p-12 text-center">
              <h2 className="font-display font-semibold mb-1">No campaigns yet</h2>
              <p className="text-sm text-muted max-w-md mx-auto mb-4">
                A campaign is a sequence of emails with a delay between each one. Drafts
                still land in your review queue — activating a campaign schedules the
                writing, not the sending.
              </p>
              <Link href="/campaigns/new" className="btn-primary">Create your first campaign</Link>
            </div>
          )}

          {campaigns.map((campaign) => {
            const domainUnverified = campaign.mailbox && (!campaign.mailbox.spfVerified || !campaign.mailbox.dkimVerified);
            return (
              <article key={campaign.id} className="card p-4">
                <header className="flex items-center gap-3 mb-3">
                  <Link href={`/campaigns/${campaign.id}`} className="text-[15px] font-medium hover:text-accent">
                    {campaign.name}
                  </Link>
                  <span className={cn('inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium',
                    STATUS_TONE[campaign.status] ?? 'bg-raised text-muted')}>
                    {campaign.status.toLowerCase().replace(/_/g, ' ')}
                  </span>
                  <div className="flex-1" />
                  <span className="num text-[11px] text-muted">
                    {campaign._count.enrollments} enrolled · {campaign.dailyCap}/day cap
                  </span>
                </header>

                {domainUnverified && (
                  <p className="flex items-center gap-1.5 text-[11px] text-held mb-3">
                    <AlertTriangle className="size-3" />
                    SPF or DKIM isn&apos;t verified for {campaign.mailbox!.fromEmail}. This campaign can&apos;t be activated until it is.
                  </p>
                )}

                <SequenceDiagram steps={campaign.steps} />
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
