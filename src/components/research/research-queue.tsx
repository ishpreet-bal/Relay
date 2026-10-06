'use client';

import Link from 'next/link';
import { Loader2, Clock, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { cn } from '@/lib/utils';

export function ResearchQueue() {
  const { clientId } = useActiveClient();
  const queue = trpc.research.queue.useQuery({ clientId }, {
    // Cheap poll so a running batch visibly drains without a websocket.
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'RUNNING') ? 5_000 : 30_000),
  });

  if (queue.isPending) return <p className="text-micro text-muted">Loading queue…</p>;

  if (!queue.data?.length) {
    return (
      <div className="card p-10 text-center">
        <h2 className="font-display font-semibold mb-1">Nothing in the queue</h2>
        <p className="text-sm text-muted mb-4 max-w-sm mx-auto">
          Select accounts with a website and queue them for research. The worker reads
          each site and discards any finding it can&apos;t tie back to a quote.
        </p>
        <Link href="/accounts" className="btn-outline">Go to accounts</Link>
      </div>
    );
  }

  const running = queue.data.filter((r) => r.status === 'RUNNING');
  const queued = queue.data.filter((r) => r.status === 'QUEUED');
  const failed = queue.data.filter((r) => r.status === 'FAILED');

  return (
    <div className="space-y-6">
      <Group title="Running" items={running} tone="accent" icon={Loader2} spin />
      <Group title="Waiting" items={queued} tone="muted" icon={Clock} />
      <Group title="Needs attention" items={failed} tone="held" icon={AlertTriangle} />
    </div>
  );
}

type Item = {
  id: string; status: string; error: string | null; updatedAt: Date;
  account: { id: string; name: string; domain: string | null; industry: string | null };
  client: { name: string };
};

function Group({ title, items, tone, icon: Icon, spin }: {
  title: string; items: Item[]; tone: 'accent' | 'muted' | 'held'; icon: typeof Clock; spin?: boolean;
}) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="eyebrow mb-2">{title} <span className="num">({items.length})</span></h2>
      <ul className="card divide-y divide-hairline">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <Icon className={cn(
              'size-3.5 shrink-0',
              tone === 'accent' && 'text-accent', tone === 'held' && 'text-held', tone === 'muted' && 'text-muted',
              spin && 'animate-spin',
            )} strokeWidth={1.75} />
            <div className="flex-1 min-w-0">
              <Link href={`/accounts/${item.account.id}`} className="text-[13px] font-medium hover:text-accent">
                {item.account.name}
              </Link>
              {item.error
                ? <p className="text-[11px] text-held truncate">{item.error}</p>
                : <p className="num text-[11px] text-muted truncate">{item.account.domain ?? 'No website'}</p>}
            </div>
            <span className="text-[11px] text-muted capitalize shrink-0">{item.client.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
