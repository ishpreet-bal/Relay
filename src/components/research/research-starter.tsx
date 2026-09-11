'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Microscope, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/**
 * Puts work into the research queue. The queue page could previously only show
 * jobs already in flight, which left no path from a new lead to a researched
 * one except opening each lead individually.
 */
export function ResearchStarter({ canRun }: { canRun: boolean }) {
  const ready = trpc.research.ready.useQuery({ limit: 50 });
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queueBatch = trpc.research.queueBatch.useMutation({
    onSuccess: () => {
      setSelected(new Set());
      utils.research.ready.invalidate();
      utils.research.queue.invalidate();
    },
  });

  const leads = ready.data ?? [];

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (ready.isPending) {
    return (
      <p className="text-micro text-muted flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin" /> Looking for leads to research…
      </p>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Microscope className="size-6 mx-auto text-muted mb-3" strokeWidth={1.5} />
        <h2 className="font-display font-semibold mb-1">Nothing waiting to be researched</h2>
        <p className="text-sm text-muted mb-4 max-w-sm mx-auto">
          Every lead with a website has already been researched. Add a lead with a website and it
          will appear here.
        </p>
        <Link href="/leads" className="btn-outline">
          <Plus className="size-3.5" /> Add a lead
        </Link>
      </div>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="eyebrow flex-1">
          Ready to research <span className="num">({leads.length})</span>
        </h2>
        <button type="button" className="btn-ghost h-7 text-micro"
                onClick={() => setSelected(new Set(leads.map((l) => l.id)))}>
          Select all
        </button>
        {canRun && (
          <button
            type="button"
            className="btn-primary h-8 text-micro"
            disabled={selected.size === 0 || queueBatch.isPending}
            onClick={() => queueBatch.mutate({ leadIds: [...selected] })}
          >
            {queueBatch.isPending
              ? <><Loader2 className="size-3.5 animate-spin" /> Queueing…</>
              : <><Microscope className="size-3.5" /> Queue {selected.size > 0 ? selected.size : ''}</>}
          </button>
        )}
      </div>

      <ul className="card divide-y divide-hairline">
        {leads.map((lead) => (
          <li key={lead.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <input
              type="checkbox"
              className="size-3.5 accent-[rgb(var(--accent))]"
              checked={selected.has(lead.id)}
              onChange={() => toggle(lead.id)}
              aria-label={`Select ${lead.companyName}`}
            />
            <div className="flex-1 min-w-0">
              <Link href={`/leads/${lead.id}`} className="text-[13px] font-medium hover:text-accent">
                {lead.companyName}
              </Link>
              <p className="num text-[11px] text-muted truncate">{lead.domain ?? 'No website'}</p>
            </div>
            {lead.research?.status === 'FAILED' && (
              <span className="text-[11px] text-held shrink-0" title={lead.research.error ?? undefined}>
                retry
              </span>
            )}
            <span className="text-[11px] text-muted capitalize shrink-0 hidden sm:inline">
              {lead.industry ?? '—'}
            </span>
            <span className="num text-[11px] text-muted w-14 text-right shrink-0">score {lead.score}</span>
          </li>
        ))}
      </ul>

      {queueBatch.data && (
        <p className="text-micro text-muted mt-2">
          Queued <span className="num">{queueBatch.data.queued}</span>
          {queueBatch.data.skipped > 0 && <> · skipped <span className="num">{queueBatch.data.skipped}</span> without a website</>}
        </p>
      )}
      {queueBatch.error && <p className="text-[11px] text-blocked mt-2">{queueBatch.error.message}</p>}
    </section>
  );
}
