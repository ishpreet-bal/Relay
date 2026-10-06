'use client';

import Link from 'next/link';
import { AlertCircle, Briefcase, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill, type Tone } from '@/components/ui/pill';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';

const STATUS_TONE: Record<string, Tone> = { ONBOARDING: 'warning', ACTIVE: 'positive', PAUSED: 'neutral', CHURNED: 'negative' };

export function ClientsList({ canManage }: { canManage: boolean }) {
  const clients = trpc.clients.list.useQuery();
  return (
    <>
      <Topbar title="Clients" showClientSwitcher={false}
              actions={canManage && <Link href="/clients/new" className="btn-primary h-8 text-micro"><Plus className="size-3.5" /> New client</Link>} />
      <PageBody>
        <ErrorNote error={clients.error} />
        {clients.isPending ? <Loading /> : !clients.data?.length ? (
          <EmptyState icon={Briefcase} title="No clients yet"
                      action={canManage && <Link href="/clients/new" className="btn-primary">Set up the first client</Link>}>
            Each client gets its own offers, ideal customer profiles, playbooks, accounts and campaigns. Nothing is shared between clients.
          </EmptyState>
        ) : (
          <ul className="grid md:grid-cols-2 gap-3">
            {clients.data.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="card p-4 block hover:border-accent/50 transition-colors h-full">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-[15px] font-semibold flex-1 truncate">{c.name}</h2>
                    <Pill tone={STATUS_TONE[c.status]}>{c.status.toLowerCase()}</Pill>
                  </div>
                  <p className="text-micro text-muted line-clamp-2 min-h-[2.5em]">{c.description ?? 'No description yet.'}</p>
                  <dl className="grid grid-cols-4 gap-2 mt-3 text-center">
                    <Stat label="Accounts" value={c._count.accounts} />
                    <Stat label="Live campaigns" value={c._count.campaigns} />
                    <Stat label="Meetings (mo)" value={c.meetingsThisMonth} />
                    <Stat label="Upcoming" value={c.upcomingMeetings} />
                  </dl>
                  {c.setupGaps.length > 0 && (
                    <p className="flex items-center gap-1.5 text-[11px] text-held mt-3">
                      <AlertCircle className="size-3.5" /> Setup: {c.setupGaps.join(', ').toLowerCase()}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-raised py-1.5">
      <dd className="num text-[15px]">{value}</dd>
      <dt className="text-[10px] text-muted">{label}</dt>
    </div>
  );
}
