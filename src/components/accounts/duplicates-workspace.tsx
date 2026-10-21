'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CopyCheck, GitMerge } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { cn } from '@/lib/utils';
import type { RouterOutputs } from '@/lib/trpc/types';

type Pair = RouterOutputs['accounts']['duplicates'][number];
type Side = Pair['account'];
interface Reason { code: string; label: string; score: number }

/**
 * Possible duplicates, side by side. A person picks which record to keep;
 * merging moves everything from the other one onto it. "Not a duplicate"
 * stops the pair from being suggested again.
 */
export function DuplicatesWorkspace({ canMerge, canDismiss }: { canMerge: boolean; canDismiss: boolean }) {
  const { clientId } = useActiveClient();
  const list = trpc.accounts.duplicates.useQuery({ clientId });
  const rows = list.data ?? [];

  return (
    <>
      <Topbar title="Duplicates" />
      <PageBody width="wide">
        <p className="text-micro text-muted mb-4 max-w-2xl">
          Records that might be the same company. Strong matches are merged automatically when they arrive (empty fields are
          filled, nothing is overwritten); these were close enough to check but not certain — often a second location of the
          same business.
        </p>
        <ErrorNote error={list.error} />
        {list.isPending ? <Loading /> : !rows.length ? (
          <EmptyState icon={CopyCheck} title="No possible duplicates">
            When an import, manual entry or discovery run finds a company that looks like one you already have, it shows up here.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {rows.map((pair) => <PairCard key={pair.id} pair={pair} canMerge={canMerge} canDismiss={canDismiss} />)}
          </ul>
        )}
      </PageBody>
    </>
  );
}

function PairCard({ pair, canMerge, canDismiss }: { pair: Pair; canMerge: boolean; canDismiss: boolean }) {
  const utils = trpc.useUtils();
  // Default to keeping the older record: it usually carries the history.
  const [keep, setKeep] = useState<'account' | 'candidate'>('candidate');
  const done = () => { void utils.accounts.duplicates.invalidate(); void utils.accounts.duplicateCount.invalidate(); };
  const merge = trpc.accounts.merge.useMutation({ onSuccess: done });
  const dismiss = trpc.accounts.dismissDuplicate.useMutation({ onSuccess: done });
  const reasons = (pair.reasons as unknown as Reason[] | null) ?? [];
  const keepSide = keep === 'account' ? pair.account : pair.candidate;
  const mergeSide = keep === 'account' ? pair.candidate : pair.account;

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Pill tone={pair.score >= 0.8 ? 'warning' : 'neutral'}>{Math.round(pair.score * 100)}% match</Pill>
        {reasons.map((r) => <span key={r.code} className="text-[11px] text-muted">{r.label}</span>)}
        <span className="flex-1" />
        <span className="text-[11px] text-muted">found <Ago date={pair.createdAt} />{pair.source && ` · ${pair.source}`}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <SideCard side={pair.candidate} label="Existing record" selected={keep === 'candidate'} onSelect={() => setKeep('candidate')} canMerge={canMerge} />
        <SideCard side={pair.account} label="New record" selected={keep === 'account'} onSelect={() => setKeep('account')} canMerge={canMerge} />
      </div>
      <ErrorNote error={merge.error ?? dismiss.error} className="mt-3" />
      <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
        {canDismiss && (
          <button type="button" className="btn-outline h-8 text-micro" disabled={dismiss.isPending || merge.isPending}
                  onClick={() => dismiss.mutate({ id: pair.id })}>
            Not a duplicate
          </button>
        )}
        {canMerge && (
          <button type="button" className="btn-primary h-8 text-micro" disabled={merge.isPending || dismiss.isPending}
                  onClick={() => merge.mutate({ keepId: keepSide.id, mergeId: mergeSide.id })}>
            <GitMerge className="size-3.5" /> {merge.isPending ? 'Merging…' : `Merge into ${keepSide.name}`}
          </button>
        )}
      </div>
    </li>
  );
}

function SideCard({ side, label, selected, onSelect, canMerge }: {
  side: Side; label: string; selected: boolean; onSelect: () => void; canMerge: boolean;
}) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Website', side.domain ?? side.websiteUrl ?? '—'],
    ['Phone', side.phone ?? '—'],
    ['Address', [side.addressLine, side.city, side.region].filter(Boolean).join(', ') || '—'],
    ['Industry', side.industry ?? '—'],
    ['History', `${side._count.contacts} contacts · ${side._count.messages} emails · ${side._count.calls} calls`],
    ['Source', side.source ?? '—'],
  ];
  return (
    <div className={cn('rounded-md border p-3', selected && canMerge ? 'border-accent bg-accent-soft/30' : 'border-hairline')}>
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="eyebrow">{label}</p>
          <Link href={`/accounts/${side.id}`} className="font-medium hover:text-accent block truncate">{side.name}</Link>
          <p className="text-[11px] text-muted">added <Ago date={side.createdAt} /></p>
        </div>
        {canMerge && (
          <label className="flex items-center gap-1.5 text-micro text-muted cursor-pointer">
            <input type="radio" checked={selected} onChange={onSelect} /> Keep
          </label>
        )}
      </div>
      <dl className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
