'use client';

import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import type { VerificationStatus } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { VERIFICATION_LABELS } from '@/lib/domain';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { DraftCard } from './draft-card';

const FILTERS: VerificationStatus[] = ['BLOCKED', 'UNSUPPORTED', 'PARTIALLY_VERIFIED', 'REVIEW_REQUIRED', 'VERIFIED'];

/**
 * Drafts that a person needs to look at, worst-verified first. Drafts that
 * met their campaign's policy were sent without coming here; everything in
 * this list says why it didn't.
 */
export function ReviewQueue({ canApprove, canSend, campaignId }: { canApprove: boolean; canSend: boolean; campaignId?: string }) {
  const { clientId } = useActiveClient();
  const [verification, setVerification] = useState<VerificationStatus[]>([]);
  const summary = trpc.messages.queueSummary.useQuery({ clientId });
  const queue = trpc.messages.reviewQueue.useQuery({
    clientId, campaignId, status: ['DRAFT', 'NEEDS_EDIT'], verification: verification.length ? verification : undefined, limit: 25,
  });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of summary.data ?? []) if (s.status === 'DRAFT' || s.status === 'NEEDS_EDIT') m.set(s.verification ?? 'NONE', (m.get(s.verification ?? 'NONE') ?? 0) + s.count);
    return m;
  }, [summary.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by verification">
        <Chip active={!verification.length} onClick={() => setVerification([])}>All</Chip>
        {FILTERS.map((v) => (
          <Chip key={v} active={verification.includes(v)} onClick={() => setVerification(verification.includes(v) ? verification.filter((x) => x !== v) : [...verification, v])}>
            {VERIFICATION_LABELS[v]} <span className="num opacity-60">{counts.get(v) ?? 0}</span>
          </Chip>
        ))}
      </div>

      <ErrorNote error={queue.error} />
      {queue.isPending ? <Loading label="Loading drafts…" /> : !queue.data?.items.length ? (
        <EmptyState icon={Inbox} title="Nothing waiting for review">
          Drafts land here when they need a person: a claim couldn&apos;t be verified, the campaign reviews everything, or the
          writer flagged something to fix.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {queue.data.items.map((m) => <DraftCard key={m.id} message={m} canApprove={canApprove} canSend={canSend} onDone={() => queue.refetch()} />)}
          {queue.data.nextCursor && <p className="text-micro text-muted text-center">Showing the 25 that most need attention. Clear these to see more.</p>}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
            className={cn('h-7 px-2.5 rounded-full text-micro border transition-colors inline-flex items-center gap-1.5',
              active ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-muted hover:bg-raised')}>
      {children}
    </button>
  );
}
