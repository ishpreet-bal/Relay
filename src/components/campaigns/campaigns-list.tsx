'use client';

import Link from 'next/link';
import { AlertTriangle, Layers, Plus, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill, type Tone } from '@/components/ui/pill';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { SequenceDiagram } from './sequence-diagram';

const STATUS_TONE: Record<string, Tone> = { DRAFT: 'neutral', READY_FOR_REVIEW: 'accent', ACTIVE: 'positive', PAUSED: 'warning', COMPLETED: 'neutral' };

export function CampaignsList({ canWrite }: { canWrite: boolean }) {
  const { clientId } = useActiveClient();
  const campaigns = trpc.campaigns.list.useQuery({ clientId });
  return (
    <>
      <Topbar title="Campaigns" actions={canWrite && <Link href="/campaigns/new" className="btn-primary h-8 text-micro"><Plus className="size-3.5" /> New campaign</Link>} />
      <PageBody>
        <ErrorNote error={campaigns.error} />
        {campaigns.isPending ? <Loading /> : !campaigns.data?.length ? (
          <EmptyState icon={Layers} title="No campaigns yet" action={canWrite && <Link href="/campaigns/new" className="btn-primary">Create a campaign</Link>}>
            A campaign runs one client&apos;s offer to the accounts matching an ideal customer profile, as a short sequence of
            emails, with calls following up on the people who engage.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {campaigns.data.map((c) => {
              const unverified = c.mailbox && (!c.mailbox.spfVerified || !c.mailbox.dkimVerified);
              return (
                <article key={c.id} className="card p-4">
                  <header className="flex flex-wrap items-center gap-2 mb-1">
                    <Link href={`/campaigns/${c.id}`} className="text-[15px] font-medium hover:text-accent">{c.name}</Link>
                    <Pill tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status.toLowerCase().replace(/_/g, ' ')}</Pill>
                    <Pill tone="accent"><ShieldCheck className="size-3" /> human approval required</Pill>
                    <span className="flex-1" />
                    <span className="num text-[11px] text-muted">{c._count.enrollments} people · {c.dailyCap}/day</span>
                  </header>
                  <p className="text-micro text-muted mb-3">
                    {c.client.name}{c.offer && <> · {c.offer.name}</>}{c.icp && <> · {c.icp.name}</>}{c.playbook && <> · {c.playbook.name}</>}
                  </p>
                  {unverified && (
                    <p className="flex items-center gap-1.5 text-[11px] text-held mb-3">
                      <AlertTriangle className="size-3" /> SPF or DKIM isn&apos;t verified for {c.mailbox!.fromEmail}; this campaign can&apos;t be activated until it is.
                    </p>
                  )}
                  <SequenceDiagram steps={c.steps} />
                </article>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
