'use client';

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { DraftCard } from './draft-card';
import type { PersonalizationTier } from '@prisma/client';

const TIERS: Array<{ value: PersonalizationTier; label: string }> = [
  { value: 'VERIFIED', label: 'Researched' },
  { value: 'CONTEXTUAL', label: 'Industry only' },
];

export function ReviewQueue({ canApprove, canSend }: { canApprove: boolean; canSend: boolean }) {
  const [tiers, setTiers] = useState<PersonalizationTier[]>([]);
  const summary = trpc.messages.queueSummary.useQuery();
  const queue = trpc.messages.reviewQueue.useQuery({
    status: ['DRAFT', 'NEEDS_EDIT'],
    tier: tiers.length ? tiers : undefined,
    limit: 25,
  });

  const countFor = (tier: PersonalizationTier) =>
    summary.data?.filter((s) => s.tier === tier).reduce((n, s) => n + s.count, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Filtering by tier is the whole point of tracking it: an operator can
          work all the researched drafts first, then decide separately whether
          the industry-only batch is worth sending at all. */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setTiers([])}
                aria-pressed={tiers.length === 0}
                className={cn('h-7 px-2.5 rounded-full text-micro border transition-colors',
                  tiers.length === 0 ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-muted hover:bg-raised')}>
          All
        </button>
        {TIERS.map((t) => {
          const active = tiers.includes(t.value);
          return (
            <button key={t.value} type="button" aria-pressed={active}
                    onClick={() => setTiers(active ? tiers.filter((x) => x !== t.value) : [...tiers, t.value])}
                    className={cn('h-7 px-2.5 rounded-full text-micro border transition-colors inline-flex items-center gap-1.5',
                      active ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-muted hover:bg-raised')}>
              {t.label}
              <span className="num opacity-60">{countFor(t.value)}</span>
            </button>
          );
        })}
      </div>

      {queue.isPending && <p className="text-micro text-muted">Loading drafts…</p>}

      {queue.data?.items.length === 0 && (
        <div className="card p-12 text-center">
          <Inbox className="size-7 mx-auto text-muted mb-3" strokeWidth={1.5} />
          <h2 className="font-display font-semibold mb-1">Nothing waiting for review</h2>
          <p className="text-sm text-muted max-w-sm mx-auto">
            Drafts appear here after they&apos;re generated. Nothing sends without passing
            through this screen first.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {queue.data?.items.map((m) => (
          <DraftCard key={m.id} message={m} canApprove={canApprove} canSend={canSend}
                     onDone={() => queue.refetch()} />
        ))}
      </div>
    </div>
  );
}
