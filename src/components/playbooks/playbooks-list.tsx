'use client';

import Link from 'next/link';
import { BookOpen, Download } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { SIGNAL_LABELS } from '@/lib/domain';

export function PlaybooksList({ canWrite }: { canWrite: boolean }) {
  const { clientId } = useActiveClient();
  const playbooks = trpc.playbooks.list.useQuery({ clientId });
  const utils = trpc.useUtils();
  const install = trpc.playbooks.installStarters.useMutation({ onSuccess: () => utils.playbooks.list.invalidate() });

  const templates = (playbooks.data ?? []).filter((p) => !p.clientId);
  const clientBooks = (playbooks.data ?? []).filter((p) => p.clientId);

  return (
    <>
      <Topbar title="Playbooks"
              actions={canWrite && (
                <button type="button" className="btn-outline h-8 text-micro" disabled={install.isPending} onClick={() => install.mutate()}>
                  <Download className="size-3.5" /> {install.isPending ? 'Installing…' : 'Install starter templates'}
                </button>
              )} />
      <PageBody>
        <p className="text-sm text-muted mb-6 max-w-2xl">
          Industry knowledge lives here, not in code: who to target, which signals matter, what to say, how the sequence runs, and
          how callers handle objections. Templates are shared; each client works from its own copy.
        </p>
        {install.data && <p className="text-[12px] text-muted mb-4">{install.data.installed} template{install.data.installed === 1 ? '' : 's'} installed{install.data.skipped ? `, ${install.data.skipped} already present` : ''}.</p>}
        <ErrorNote error={playbooks.error ?? install.error} />
        {playbooks.isPending ? <Loading /> : !playbooks.data?.length ? (
          <EmptyState icon={BookOpen} title="No playbooks yet"
                      action={canWrite && <button type="button" className="btn-primary" onClick={() => install.mutate()}>Install starter templates</button>}>
            Starter templates cover trucking, machine shops, commercial cleaning and industrial suppliers.
          </EmptyState>
        ) : (
          <div className="space-y-8">
            {clientBooks.length > 0 && (
              <Section title="Client playbooks">
                <Grid items={clientBooks} />
              </Section>
            )}
            {templates.length > 0 && (
              <Section title="Templates" hint="Copy a template to a client from the client's Playbooks tab.">
                <Grid items={templates} />
              </Section>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}

type Item = RouterOutputs['playbooks']['list'][number];

function Grid({ items }: { items: Item[] }) {
  return (
    <ul className="grid md:grid-cols-2 gap-3">
      {items.map((p) => (
        <li key={p.id}>
          <Link href={`/playbooks/${p.id}`} className="card p-4 block h-full hover:border-accent/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[14px] font-semibold flex-1">{p.name}</h3>
              {p.client ? <Pill tone="accent">{p.client.name}</Pill> : <Pill>template</Pill>}
            </div>
            <p className="text-micro text-muted line-clamp-2">{p.description}</p>
            <p className="text-[11px] text-muted mt-2">
              {p.targetTitles.slice(0, 3).join(', ')}{p.targetTitles.length > 3 && '…'}
              {p.usefulSignals.length > 0 && <> · signals: {p.usefulSignals.slice(0, 3).map((s) => SIGNAL_LABELS[s].toLowerCase()).join(', ')}</>}
              {p._count.campaigns > 0 && <> · {p._count.campaigns} campaign{p._count.campaigns === 1 ? '' : 's'}</>}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
