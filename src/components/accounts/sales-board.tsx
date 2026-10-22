'use client';

import Link from 'next/link';
import type { AccountStatus } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS } from '@/lib/domain';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';

/**
 * The sales pipeline as a board: one column per account status, the
 * highest-scoring accounts first. Moving a card is a status change with the
 * same rules and audit trail as on the account page.
 */
export function SalesBoard({ canMove }: { canMove: boolean }) {
  const { clientId } = useActiveClient();
  const utils = trpc.useUtils();
  const board = trpc.accounts.board.useQuery({ clientId }, { refetchInterval: 60_000 });
  const move = trpc.accounts.setStatus.useMutation({ onSuccess: () => utils.accounts.board.invalidate() });
  return (
    <>
      <Topbar title="Sales pipeline" />
      <PageBody width="full" className="space-y-3">
        <ErrorNote error={board.error ?? move.error} />
        {board.isPending ? <Loading /> : board.data && (
          <>
            <div className="grid grid-flow-col auto-cols-[minmax(200px,1fr)] gap-3 overflow-x-auto pb-2">
              {board.data.columns.map((col) => (
                <section key={col.status} className="min-w-0">
                  <h2 className="eyebrow mb-2 flex gap-2">{ACCOUNT_STATUS_LABELS[col.status]} <span className="num">{col.count}</span></h2>
                  <ul className="space-y-2">
                    {col.items.map((a) => (
                      <li key={a.id} className="card p-2.5 text-micro">
                        <Link href={`/accounts/${a.id}`} className="font-medium hover:underline leading-snug block">{a.name}</Link>
                        <p className="text-[11px] text-muted truncate">{[a.industry, a.city].filter(Boolean).join(' · ') || '—'}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <span className="num text-[11px]">{a.score}</span>
                          {a.temperature !== 'COLD' && <Pill tone={a.temperature === 'HOT' ? 'negative' : 'warning'}>{a.temperature.toLowerCase()}</Pill>}
                          {a.nextFollowUpAt && <span className="text-[10px] text-muted ml-auto">follow up <Ago date={a.nextFollowUpAt} /></span>}
                        </div>
                        {canMove && (
                          <select aria-label={`Move ${a.name}`} className="input h-7 text-[11px] mt-1.5" value={col.status} disabled={move.isPending}
                                  onChange={(e) => move.mutate({ id: a.id, status: e.target.value as AccountStatus })}>
                            {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{ACCOUNT_STATUS_LABELS[s]}</option>)}
                          </select>
                        )}
                      </li>
                    ))}
                    {col.count > col.items.length && <li className="text-[11px] text-muted px-1">+{col.count - col.items.length} more in <Link href="/accounts" className="underline">Accounts</Link></li>}
                    {!col.count && <li className="text-[11px] text-muted card p-2.5">None</li>}
                  </ul>
                </section>
              ))}
            </div>
            <p className="text-[11px] text-muted">Closed: {board.data.closed.LOST} lost, {board.data.closed.DISQUALIFIED} disqualified.</p>
          </>
        )}
      </PageBody>
    </>
  );
}
