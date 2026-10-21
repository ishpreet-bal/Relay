'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { JobStatus } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { humanize } from '@/lib/domain';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Kpi } from '@/components/ui/kpi';
import { Pill, type Tone } from '@/components/ui/pill';
import { Table, Th, Td } from '@/components/ui/table';
import { ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<JobStatus, Tone> = { QUEUED: 'neutral', RUNNING: 'accent', COMPLETED: 'positive', FAILED: 'negative', CANCELLED: 'neutral', RETRYING: 'warning' };
const dollars = (millicents: number) => `$${(millicents / 100_000).toFixed(2)}`;

/**
 * What the machinery is doing: background jobs, research that failed, model
 * calls, provider lookups, and what all of it cost. For Relay staff only.
 */
export function SystemPage({ canRetry }: { canRetry: boolean }) {
  const { clientId, clients } = useActiveClient();
  const [status, setStatus] = useState<JobStatus[] | undefined>(undefined);
  const summary = trpc.ops.jobSummary.useQuery(undefined, { refetchInterval: 15_000 });
  const jobs = trpc.ops.jobs.useQuery({ status, limit: 100 }, { refetchInterval: 15_000 });
  const failedResearch = trpc.ops.failedResearch.useQuery();
  const aiRuns = trpc.ops.aiRuns.useQuery({ limit: 30 });
  const providerLog = trpc.ops.providerLog.useQuery({ limit: 30 });
  const costs = trpc.ops.costs.useQuery({ clientId, days: 30 });
  const utils = trpc.useUtils();
  const retry = trpc.ops.retryJob.useMutation({ onSuccess: () => utils.ops.jobs.invalidate() });
  const cancel = trpc.ops.cancelJob.useMutation({ onSuccess: () => utils.ops.jobs.invalidate() });

  const jobCount = (s: JobStatus) => summary.data?.jobs.find((j) => j.status === s)?.count ?? 0;
  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? 'Archived client' : 'Workspace');

  return (
    <>
      <Topbar title="System" />
      <PageBody width="wide" className="space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Queued" value={jobCount('QUEUED') + jobCount('RETRYING')} />
          <Kpi label="Running" value={jobCount('RUNNING')} />
          <Kpi label="Failed (24h)" value={summary.data?.failedLast24h ?? '—'} tone={summary.data?.failedLast24h ? 'negative' : undefined} />
          <Kpi label="Research failed" value={summary.data?.research.find((r) => r.status === 'FAILED')?.count ?? 0} />
          <Kpi label="Spend (30d)" value={costs.data ? dollars(costs.data.totalMillicents) : '—'} caption={clientId ? 'this client' : 'all clients'} />
        </div>

        <Section title="Background jobs"
                 action={
                   <select aria-label="Filter jobs" className="input h-7 w-36 text-micro" value={status?.[0] ?? ''}
                           onChange={(e) => setStatus(e.target.value ? [e.target.value as JobStatus] : undefined)}>
                     <option value="">All statuses</option>
                     {(['QUEUED', 'RUNNING', 'RETRYING', 'FAILED', 'COMPLETED', 'CANCELLED'] as const).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                   </select>
                 }>
          <ErrorNote error={jobs.error ?? retry.error ?? cancel.error} />
          {jobs.isPending ? <Loading /> : !jobs.data?.length ? <p className="card p-4 text-micro text-muted">No jobs.</p> : (
            <Table>
              <thead><tr><Th>Job</Th><Th>Status</Th><Th className="text-right">Attempts</Th><Th>When</Th><Th>Error</Th>{canRetry && <Th />}</tr></thead>
              <tbody>
                {jobs.data.map((j) => (
                  <tr key={j.id}>
                    <Td className="text-micro">{humanize(j.type)}<span className="block text-[11px] text-muted">{clientName(j.clientId)}</span></Td>
                    <Td><Pill tone={STATUS_TONE[j.status]}>{j.status.toLowerCase()}</Pill></Td>
                    <Td className="num text-right">{j.attempts}/{j.maxAttempts}</Td>
                    <Td className="text-micro text-muted">{j.status === 'QUEUED' || j.status === 'RETRYING' ? <>runs <Ago date={j.runAt} /></> : <Ago date={j.finishedAt ?? j.updatedAt} />}</Td>
                    <Td className="text-[11px] text-blocked max-w-[320px] truncate" >{j.error}</Td>
                    {canRetry && (
                      <Td className="whitespace-nowrap">
                        {(j.status === 'FAILED' || j.status === 'CANCELLED') && <button type="button" className="btn-ghost h-7 text-[11px]" disabled={retry.isPending} onClick={() => retry.mutate({ id: j.id })}>Retry</button>}
                        {(j.status === 'QUEUED' || j.status === 'RETRYING' || j.status === 'FAILED') && <button type="button" className="btn-ghost h-7 text-[11px]" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: j.id })}>Cancel</button>}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <div className="grid xl:grid-cols-2 gap-6">
          <Section title="Costs, last 30 days" hint="Model calls, provider lookups and emails sent, as recorded at the time.">
            {costs.isPending ? <Loading /> : !costs.data || costs.data.totalMillicents === 0 ? <p className="card p-4 text-micro text-muted">No tracked spend yet.</p> : (
              <div className="grid sm:grid-cols-2 gap-3">
                <ul className="card divide-y divide-hairline text-micro">
                  {costs.data.byType.map((t) => <li key={t.type} className="p-2.5 flex"><span className="flex-1">{humanize(t.type)} <span className="text-muted">× {t.quantity}</span></span><span className="num">{dollars(t.costMillicents)}</span></li>)}
                </ul>
                <ul className="card divide-y divide-hairline text-micro">
                  {costs.data.byClient.map((c) => <li key={c.clientId ?? 'none'} className="p-2.5 flex"><span className="flex-1 truncate">{clientName(c.clientId)}</span><span className="num">{dollars(c.costMillicents)}</span></li>)}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Research that needs attention">
            {failedResearch.isPending ? <Loading /> : !failedResearch.data?.length ? <p className="card p-4 text-micro text-muted">Nothing failed.</p> : (
              <ul className="card divide-y divide-hairline">
                {failedResearch.data.map((r) => (
                  <li key={r.id} className="p-3 text-micro">
                    <Link href={`/accounts/${r.account.id}`} className="font-medium hover:text-accent">{r.account.name}</Link>
                    <span className="text-muted"> · {r.client.name} · <Ago date={r.updatedAt} /></span>
                    <p className="text-[11px] text-blocked">{r.error}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="grid xl:grid-cols-2 gap-6">
          <Section title="Recent model calls">
            {aiRuns.isPending ? <Loading /> : !aiRuns.data?.length ? <p className="card p-4 text-micro text-muted">None yet.</p> : (
              <Table>
                <thead><tr><Th>Kind</Th><Th>Model</Th><Th>Status</Th><Th className="text-right">Cost</Th><Th>When</Th></tr></thead>
                <tbody>
                  {aiRuns.data.map((r) => (
                    <tr key={r.id}>
                      <Td className="text-micro">{r.kind}</Td><Td className="text-[11px] text-muted">{r.model}</Td>
                      <Td><Pill tone={STATUS_TONE[r.status]}>{r.status.toLowerCase()}</Pill></Td>
                      <Td className="num text-right">${(r.costCents / 100).toFixed(2)}</Td><Td className="text-[11px] text-muted"><Ago date={r.createdAt} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Section>
          <Section title="Provider lookups" hint="Cached results are reused until they expire, so the same lookup is not paid for twice.">
            {providerLog.isPending ? <Loading /> : !providerLog.data?.length ? <p className="card p-4 text-micro text-muted">No provider calls yet.</p> : (
              <Table>
                <thead><tr><Th>Provider</Th><Th>Lookup</Th><Th>Result</Th><Th className="text-right">Cost</Th><Th>When</Th></tr></thead>
                <tbody>
                  {providerLog.data.map((p) => (
                    <tr key={p.id}>
                      <Td className="text-micro">{p.provider}<span className="block text-[11px] text-muted">{p.operation}</span></Td>
                      <Td className="text-[11px] text-muted max-w-[160px] truncate">{p.lookupKey}</Td>
                      <Td><span className={cn('text-[11px]', p.status === 'SUCCESS' ? 'text-cleared' : p.status === 'ERROR' ? 'text-blocked' : 'text-muted')}>{p.status.toLowerCase().replace('_', ' ')}</span></Td>
                      <Td className="num text-right">{dollars(p.costMillicents)}</Td><Td className="text-[11px] text-muted"><Ago date={p.requestedAt} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Section>
        </div>
      </PageBody>
    </>
  );
}
