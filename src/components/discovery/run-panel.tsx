'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Dialog } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { Table, Td, Th } from '@/components/ui/table';
import { RunStatus } from './discovery-workspace';
import { OUTCOME_LABELS, SOURCE_LABELS, usd } from './format';

type Outcome = keyof typeof OUTCOME_LABELS;
const ACTIVE = ['QUEUED', 'RUNNING', 'RETRYING'];

/**
 * One run: its numbers, what each source did, and every result with the
 * reason for its outcome. While the run is unfinished and this panel is
 * open, the page moves it forward itself, one step at a time, so a run
 * completes even where no background worker is deployed.
 */
export function RunPanel({ runId, canRun, onClose }: { runId: string; canRun: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const run = trpc.discovery.runById.useQuery({ id: runId }, { refetchInterval: (q) => (q.state.data && ACTIVE.includes(q.state.data.status) ? 3000 : false) });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [cursors, setCursors] = useState<string[]>([]);
  const results = trpc.discovery.results.useQuery({ runId, outcome, cursor: cursors[cursors.length - 1], limit: 50 }, { placeholderData: (p) => p });
  const step = trpc.discovery.step.useMutation();
  const cancel = trpc.discovery.cancel.useMutation({ onSuccess: () => { void run.refetch(); void utils.discovery.runs.invalidate(); } });
  const active = !!run.data && ACTIVE.includes(run.data.status);

  // Drive the run while it is open: one step at a time, never overlapping.
  const busy = useRef(false);
  useEffect(() => {
    if (!active || !canRun) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || busy.current || document.hidden) return;
      busy.current = true;
      try {
        const r = await step.mutateAsync({ runId });
        await Promise.all([run.refetch(), results.refetch()]);
        if (!ACTIVE.includes(r.status)) { void utils.discovery.runs.invalidate(); void utils.discovery.profiles.invalidate(); void utils.accounts.duplicateCount.invalidate(); }
      } catch { /* shown via step.error */ } finally { busy.current = false; }
    };
    void tick();
    const t = setInterval(tick, 4000);
    return () => { stopped = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, canRun, runId]);

  const r = run.data;
  const details = r?.parsedDetails;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={r?.name ?? 'Discovery run'} width="lg">
      {run.isPending ? <Loading /> : run.error ? <ErrorNote error={run.error} /> : r && details && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-micro">
            <RunStatus status={r.status} />
            <span className="text-muted">{r.trigger === 'SCHEDULE' ? 'Scheduled' : 'Manual'} · started <Ago date={r.startedAt ?? r.createdAt} /></span>
            <span className="flex-1" />
            {active && canRun && <button type="button" className="btn-ghost h-7 text-micro" disabled={cancel.isPending} onClick={() => cancel.mutate({ runId })}>Cancel run</button>}
          </div>
          {active && (
            <p className="text-[12px] text-muted">
              {canRun ? 'Working: this window moves the run forward while it is open. Closing it is safe; a deployed worker or the daily cron continues it.' : 'Running in the background.'}
            </p>
          )}
          {r.error && <p className="text-[12px] text-blocked">{r.error}</p>}
          {details.stopReason && <p className="text-[12px] text-held">{details.stopReason}</p>}
          {details.warnings.map((w) => <p key={w} className="text-[12px] text-held">{w}</p>)}
          <ErrorNote error={step.error ?? cancel.error} />

          <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {[['Found', r.found], ['New', r.imported], ['Enriched', r.updated], ['On file', r.duplicates], ['Skipped', r.excluded], ['Review', r.needsReview]].map(([k, v]) => (
              <div key={k} className="card p-2"><dt className="eyebrow">{k}</dt><dd className="num text-lg">{v}</dd></div>
            ))}
          </dl>

          <div className="card divide-y divide-hairline">
            {Object.entries(details.sources).map(([id, s]) => (
              <div key={id} className="p-3 text-micro flex flex-wrap gap-x-3 gap-y-1 items-center">
                <span className="font-medium">{SOURCE_LABELS[id] ?? id}</span>
                <Pill tone={s.status === 'DONE' ? 'positive' : s.status === 'FAILED' ? 'negative' : s.status === 'NOT_CONFIGURED' || s.status === 'STOPPED' ? 'warning' : 'neutral'}>
                  {s.status.toLowerCase().replace(/_/g, ' ')}
                </Pill>
                <span className="text-muted">{s.requests} requests · {s.results} results · {usd(s.costMillicents, details.costIsEstimate)}</span>
                {s.detail && <span className="w-full text-[11px] text-muted">{s.detail}</span>}
              </div>
            ))}
          </div>

          <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {([null, 'CREATED', 'NEEDS_REVIEW', 'UPDATED', 'DUPLICATE', 'EXCLUDED', 'FAILED'] as const).map((o) => (
                <button key={o ?? 'all'} type="button" aria-pressed={outcome === o} onClick={() => { setOutcome(o); setCursors([]); }}
                        className={`h-7 px-2.5 rounded-full text-micro border ${outcome === o ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-muted hover:bg-raised'}`}>
                  {o ? OUTCOME_LABELS[o] : 'All'}
                </button>
              ))}
            </div>
            {results.isPending ? <Loading /> : !results.data?.items.length ? <p className="text-micro text-muted">No results{outcome ? ' with this outcome' : ' yet'}.</p> : (
              <Table>
                <thead><tr><Th>Business</Th><Th>Outcome</Th><Th className="hidden sm:table-cell">Why</Th></tr></thead>
                <tbody>
                  {results.data.items.map((x) => {
                    const sourceUrl = (x.payload as { sourceUrl?: string | null } | null)?.sourceUrl;
                    return (
                      <tr key={x.id}>
                        <Td className="max-w-[220px]">
                          {x.accountId && x.name ? <Link href={`/accounts/${x.accountId}`} className="font-medium hover:text-accent block truncate">{x.name}</Link>
                            : <span className="block truncate text-muted">{x.name || (x.provider === 'google_places' ? 'Unconfirmed Google place' : 'Unnamed')}</span>}
                          <span className="text-[11px] text-muted flex items-center gap-1">
                            {x.domain ?? SOURCE_LABELS[x.provider] ?? x.provider}
                            {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent inline-flex" aria-label="Open the source listing"><ExternalLink className="size-3" /></a>}
                          </span>
                        </Td>
                        <Td><Pill tone={x.outcome === 'CREATED' ? 'positive' : x.outcome === 'NEEDS_REVIEW' ? 'warning' : x.outcome === 'FAILED' ? 'negative' : 'neutral'}>{OUTCOME_LABELS[x.outcome]}</Pill></Td>
                        <Td className="hidden sm:table-cell text-[11px] text-muted">{x.reason ?? '—'}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
            {(cursors.length > 0 || results.data?.nextCursor) && (
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" className="btn-outline h-7 text-micro" disabled={!cursors.length} onClick={() => setCursors((c) => c.slice(0, -1))}>Previous</button>
                <button type="button" className="btn-outline h-7 text-micro" disabled={!results.data?.nextCursor}
                        onClick={() => results.data?.nextCursor && setCursors((c) => [...c, results.data!.nextCursor!])}>Next</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
