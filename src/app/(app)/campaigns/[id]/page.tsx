import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import { Topbar } from '@/components/shell/topbar';
import { SequenceDiagram } from '@/components/campaigns/sequence-diagram';
import { CampaignControls } from '@/components/campaigns/campaign-controls';
import { CampaignFunnel } from '@/components/campaigns/campaign-funnel';

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission('campaign:read');

  const campaign = await db.campaign.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { steps: { orderBy: { order: 'asc' } }, mailbox: true },
  });
  if (!campaign) notFound();

  const org = await db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { timezone: true },
  });

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <>
      <Topbar title={campaign.name} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-micro text-muted hover:text-ink mb-5">
            <ArrowLeft className="size-3.5" /> All campaigns
          </Link>

          <CampaignControls
            campaignId={campaign.id}
            status={campaign.status}
            canActivate={can(session.role, 'campaign:activate')}
          />

          <section className="mt-6">
            <h2 className="eyebrow mb-3">Sequence</h2>
            <SequenceDiagram steps={campaign.steps} />
          </section>

          <section className="mt-6">
            <h2 className="eyebrow mb-3">Performance</h2>
            <CampaignFunnel campaignId={campaign.id} />
          </section>

          <section className="mt-6 grid sm:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="eyebrow mb-2">Sending window</h2>
              <p className="text-micro">
                <span className="num">{String(campaign.sendStartHour).padStart(2, '0')}:00</span>
                {' – '}
                <span className="num">{String(campaign.sendEndHour).padStart(2, '0')}:00</span>
                {' '}<span className="text-muted">{org.timezone}</span>
              </p>
              <p className="text-micro text-muted mt-1">
                {campaign.sendDays.map((d) => dayNames[d - 1]).join(', ')}
              </p>
              <p className="text-[11px] text-muted mt-2">
                Drafts are only generated inside this window, so nothing can be approved
                and sent at 2am by accident.
              </p>
            </div>

            <div className="card p-4">
              <h2 className="eyebrow mb-2">Limits</h2>
              <ul className="text-micro space-y-1">
                <li className="flex justify-between">
                  <span className="text-muted">Daily send cap</span>
                  <span className="num">{campaign.dailyCap}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted">Industry-only cap</span>
                  <span className="num">
                    {campaign.allowContextual ? campaign.contextualDailyCap : 'off'}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted">Approval required</span>
                  <span>{campaign.requireApproval ? 'Yes' : 'No'}</span>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
