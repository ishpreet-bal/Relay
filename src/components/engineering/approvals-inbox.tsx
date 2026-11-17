'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill, type Tone } from '@/components/ui/pill';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';

const TONE: Record<string, Tone> = { PENDING: 'warning', APPROVED: 'positive', REJECTED: 'negative', EXPIRED: 'neutral', CANCELLED: 'neutral' };

/** Every consequential action waiting on a person, and what was decided. */
export function ApprovalsInbox() {
  const [status, setStatus] = useState<'PENDING' | ''>('PENDING');
  const list = trpc.engineering.approvals.useQuery(status ? { status } : {});
  return (
    <>
      <Topbar title="Approvals" showClientSwitcher={false} />
      <PageBody className="space-y-4">
        <p className="text-micro text-muted max-w-2xl">Agents and teammates prepare deployments, customer emails, purchases, DNS changes and charges here. Nothing runs until someone with the right permission, other than the person who asked, approves it.</p>
        <div className="flex gap-2">
          <button type="button" className={status === 'PENDING' ? 'btn-primary h-8 text-micro' : 'btn-outline h-8 text-micro'} onClick={() => setStatus('PENDING')}>Waiting</button>
          <button type="button" className={status === '' ? 'btn-primary h-8 text-micro' : 'btn-outline h-8 text-micro'} onClick={() => setStatus('')}>All</button>
        </div>
        <ErrorNote error={list.error} />
        {list.isPending ? <Loading /> : !list.data?.length ? (
          <EmptyState icon={ShieldCheck} title={status ? 'Nothing waiting' : 'No requests yet'}>Requests appear here when an agent or a teammate prepares something that needs a decision.</EmptyState>
        ) : (
          <ul className="space-y-3">{list.data.map((a) => <ApprovalCard key={a.id} a={a} />)}</ul>
        )}
      </PageBody>
    </>
  );
}

type Row = RouterOutputs['engineering']['approvals'][number];

export function ApprovalCard({ a }: { a: Row }) {
  const [note, setNote] = useState('');
  const utils = trpc.useUtils();
  const decide = trpc.engineering.decide.useMutation({ onSuccess: () => { void utils.engineering.approvals.invalidate(); void utils.engineering.project.invalidate(); } });
  return (
    <li className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={TONE[a.status] ?? 'neutral'}>{a.status.toLowerCase()}</Pill>
        <span className="text-[11px] uppercase tracking-wide text-muted">{a.kindLabel}</span>
        <p className="font-medium text-[13px] flex-1 min-w-0">{a.title}</p>
        {a.projectId && <Link href={`/engineering/${a.projectId}`} className="text-micro text-accent">Open project</Link>}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{a.summary}</p>
      {a.payload ? <details><summary className="text-micro text-muted cursor-pointer">Exactly what would run</summary><pre className="mt-2 text-[11px] bg-raised rounded p-3 overflow-x-auto">{JSON.stringify(a.payload, null, 2)}</pre></details> : null}
      <p className="text-[11px] text-muted">Requested by {a.requestedBy.startsWith('agent:') ? `an agent (${a.requestedBy.split(':')[1]})` : 'a teammate'} · {new Date(a.createdAt).toLocaleString()}{a.expiresAt ? ` · expires ${new Date(a.expiresAt).toLocaleDateString()}` : ''}{a.decisionNote ? ` · note: ${a.decisionNote}` : ''}</p>
      {a.canDecide && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <input className="input h-8 text-micro flex-1 min-w-[200px]" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn-outline h-8 text-micro" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, decision: 'REJECTED', note })}>Reject</button>
          <button type="button" className="btn-primary h-8 text-micro" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, decision: 'APPROVED', note: note || null })}>Approve</button>
        </div>
      )}
      {a.status === 'PENDING' && !a.canDecide && <p className="text-[11px] text-muted">Waiting for someone with permission to decide it.</p>}
      <ErrorNote error={decide.error} />
    </li>
  );
}
