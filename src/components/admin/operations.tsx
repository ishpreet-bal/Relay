'use client';

import { useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { humanize } from '@/lib/domain';
import { Section } from '@/components/ui/page';
import { Dialog } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { Table, Td, Th } from '@/components/ui/table';
import { ErrorNote, Loading } from '@/components/ui/states';
import { Ago, DateTime } from '@/components/ui/time';
import { cn } from '@/lib/utils';

type Queue = RouterOutputs['ops']['queues'][number];
type Provider = RouterOutputs['ops']['providers'][number];

const dollars = (millicents: number, estimate = false) => `${estimate ? '~' : ''}$${(millicents / 100_000).toFixed(2)}`;
const seconds = (ms: number | null | undefined) => (ms === null || ms === undefined ? '—' : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`);
const GROUP_LABELS = { intelligence: 'Intelligence', studio: 'Studio', platform: 'Platform' } as const;

/**
 * The job system at a glance: each queue's depth, age, speed, error rate and
 * cost, provider budgets and breakers, and which workers are alive. Owners
 * can pause a queue or change its limits; those apply to the whole deployment.
 */
export function QueuesPanel({ canControl, canRetry }: { canControl: boolean; canRetry: boolean }) {
  const utils = trpc.useUtils();
  const queues = trpc.ops.queues.useQuery(undefined, { refetchInterval: 10_000 });
  const setQueue = trpc.ops.setQueue.useMutation({ onSuccess: () => utils.ops.queues.invalidate() });
  const retryDead = trpc.ops.retryDeadLetters.useMutation({ onSuccess: () => { void utils.ops.queues.invalidate(); void utils.ops.jobs.invalidate(); } });
  const [editing, setEditing] = useState<Queue | null>(null);

  return (
    <Section title="Queues" hint="Each queue has its own limits, so a research backlog can't hold up customer workflows or billing. Figures are for this workspace; costs are the last 24 hours.">
      <ErrorNote error={queues.error ?? setQueue.error ?? retryDead.error} />
      {queues.isPending ? <Loading /> : (
        <Table>
          <thead>
            <tr>
              <Th>Queue</Th><Th className="text-right">Waiting</Th><Th className="text-right">Running</Th><Th className="text-right hidden md:table-cell">Oldest</Th>
              <Th className="text-right hidden md:table-cell">Done 24h</Th><Th className="text-right hidden lg:table-cell">Avg time</Th>
              <Th className="text-right hidden lg:table-cell">Errors 24h</Th><Th className="text-right">Dead</Th><Th className="text-right hidden md:table-cell">Cost 24h</Th>
              <Th className="hidden xl:table-cell">Limits</Th>{(canControl || canRetry) && <Th />}
            </tr>
          </thead>
          <tbody>
            {queues.data?.map((q) => {
              const s = q.stats;
              const waiting = (s?.queued ?? 0) + (s?.retrying ?? 0);
              const errorRate = s && s.attempts24h ? s.failures24h / s.attempts24h : 0;
              return (
                <tr key={q.name}>
                  <Td className="max-w-[220px]">
                    <span className="font-medium text-micro flex items-center gap-1.5">
                      {q.label}{q.paused && <Pill tone="warning">paused</Pill>}
                    </span>
                    <span className="block text-[11px] text-muted truncate">{GROUP_LABELS[q.group]} · {q.paused && q.pausedReason ? q.pausedReason : q.description}</span>
                  </Td>
                  <Td className="text-right num">{waiting}{s?.waiting ? <span className="block text-[11px] text-held">{s.waiting} held</span> : null}</Td>
                  <Td className="text-right num">{s?.running ?? 0}<span className="text-muted">/{q.concurrency}</span></Td>
                  <Td className="text-right text-[11px] text-muted hidden md:table-cell">{s?.oldestPendingAt ? <Ago date={s.oldestPendingAt} /> : '—'}</Td>
                  <Td className="text-right num hidden md:table-cell">{s?.completed24h ?? 0}</Td>
                  <Td className="text-right num hidden lg:table-cell">{seconds(s?.avgDurationMs)}</Td>
                  <Td className={cn('text-right num hidden lg:table-cell', errorRate > 0.2 && 'text-blocked')}>{s?.attempts24h ? `${Math.round(errorRate * 100)}%` : '—'}<span className="block text-[11px] text-muted">{s?.attempts24h ? `of ${s.attempts24h}` : ''}</span></Td>
                  <Td className={cn('text-right num', !!s?.deadLetters && 'text-blocked')}>{s?.deadLetters ?? 0}</Td>
                  <Td className="text-right num hidden md:table-cell">{dollars(s?.costMillicents24h ?? 0, s?.estimatedCost)}</Td>
                  <Td className="hidden xl:table-cell text-[11px] text-muted">
                    {q.perOrgConcurrency ? `${q.perOrgConcurrency}/workspace · ` : ''}{q.maxPerMinute ? `${q.maxPerMinute}/min · ` : ''}{seconds(q.timeoutMs)} · {q.maxAttempts} tries
                  </Td>
                  {(canControl || canRetry) && (
                    <Td className="whitespace-nowrap text-right">
                      {canControl && (
                        <button type="button" className="btn-ghost h-7 px-2" aria-label={q.paused ? `Resume ${q.label}` : `Pause ${q.label}`} title={q.paused ? 'Resume' : 'Pause'}
                                disabled={setQueue.isPending}
                                onClick={() => setQueue.mutate({ queue: q.name as never, paused: !q.paused, pausedReason: q.paused ? null : 'Paused by an operator' })}>
                          {q.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                        </button>
                      )}
                      {canControl && <button type="button" className="btn-ghost h-7 text-[11px]" onClick={() => setEditing(q)}>Limits</button>}
                      {canRetry && !!s?.deadLetters && (
                        <button type="button" className="btn-ghost h-7 text-[11px]" disabled={retryDead.isPending}
                                onClick={() => { if (confirm(`Retry ${s.deadLetters} dead letters in ${q.label}?`)) retryDead.mutate({ queue: q.name as never }); }}>
                          Retry dead
                        </button>
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {editing && <QueueLimitsDialog queue={editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function QueueLimitsDialog({ queue, onClose }: { queue: Queue; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({
    concurrency: String(queue.concurrency), perOrgConcurrency: queue.perOrgConcurrency?.toString() ?? '',
    maxPerMinute: queue.maxPerMinute?.toString() ?? '', timeoutSec: String(Math.round(queue.timeoutMs / 1000)), maxAttempts: String(queue.maxAttempts),
  });
  const save = trpc.ops.setQueue.useMutation({ onSuccess: () => { void utils.ops.queues.invalidate(); onClose(); } });
  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  const field = (key: keyof typeof f, label: string, hint?: string) => (
    <label className="block text-[12px]">
      <span className="font-medium">{label}</span>
      <input className="input mt-1" type="number" min={1} value={f[key]} onChange={(e) => setF((s) => ({ ...s, [key]: e.target.value }))} />
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${queue.label} limits`} description="Applies to every workspace on this deployment. Raise limits gradually, after watching error rates and provider allowances.">
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          queue: queue.name as never, concurrency: n(f.concurrency), perOrgConcurrency: n(f.perOrgConcurrency), maxPerMinute: n(f.maxPerMinute),
          timeoutMs: n(f.timeoutSec) === null ? null : Number(f.timeoutSec) * 1000, maxAttempts: n(f.maxAttempts),
        });
      }}>
        <div className="grid grid-cols-2 gap-3">
          {field('concurrency', 'Run at once', 'Across all workers')}
          {field('perOrgConcurrency', 'Per workspace', 'Blank for no share limit')}
          {field('maxPerMinute', 'Starts per minute', 'Blank for no rate limit')}
          {field('timeoutSec', 'Timeout (seconds)')}
          {field('maxAttempts', 'Attempts before dead letter')}
        </div>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save limits'}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function ProvidersPanel({ canControl }: { canControl: boolean }) {
  const utils = trpc.useUtils();
  const providers = trpc.ops.providers.useQuery(undefined, { refetchInterval: 15_000 });
  const set = trpc.ops.setProvider.useMutation({ onSuccess: () => utils.ops.providers.invalidate() });
  const open = (p: Provider) => !!p.circuitOpenUntil && new Date(p.circuitOpenUntil) > new Date();
  return (
    <Section title="Provider limits" hint="Requests per minute and a breaker per provider, shared by every worker. After repeated failures a provider pauses on its own; work that doesn't need it carries on.">
      <ErrorNote error={providers.error ?? set.error} />
      {providers.isPending ? <Loading /> : !providers.data?.length ? <p className="card p-4 text-micro text-muted">No provider has been called through the throttle yet.</p> : (
        <Table>
          <thead><tr><Th>Provider</Th><Th>State</Th><Th className="text-right">Limit/min</Th><Th className="text-right hidden md:table-cell">This minute</Th><Th className="text-right hidden md:table-cell">Failures</Th><Th className="hidden lg:table-cell">Last error</Th>{canControl && <Th />}</tr></thead>
          <tbody>
            {providers.data.map((p) => (
              <tr key={p.provider}>
                <Td className="text-micro font-medium">{p.provider}</Td>
                <Td>{open(p) ? <Pill tone="negative">paused until <DateTime date={p.circuitOpenUntil} pattern="h:mm a" /></Pill> : p.consecutiveFailures ? <Pill tone="warning">{p.consecutiveFailures} recent failures</Pill> : <Pill tone="positive">ok</Pill>}</Td>
                <Td className="text-right num">{p.maxPerMinute ?? '∞'}</Td>
                <Td className="text-right num hidden md:table-cell">{new Date(p.windowStart).getTime() > Date.now() - 60_000 ? p.windowCount : 0}</Td>
                <Td className="text-right num hidden md:table-cell">{p.totalFailures}<span className="text-muted">/{p.totalRequests}</span></Td>
                <Td className="hidden lg:table-cell text-[11px] text-blocked max-w-[280px] truncate">{p.lastError}{p.lastFailureAt && <span className="text-muted"> · <Ago date={p.lastFailureAt} /></span>}</Td>
                {canControl && (
                  <Td className="whitespace-nowrap text-right">
                    {(open(p) || p.consecutiveFailures > 0) && (
                      <button type="button" className="btn-ghost h-7 text-[11px]" disabled={set.isPending} onClick={() => set.mutate({ provider: p.provider, reset: true })}>
                        <RotateCcw className="size-3" /> Reset
                      </button>
                    )}
                    <button type="button" className="btn-ghost h-7 text-[11px]" disabled={set.isPending} onClick={() => {
                      const v = prompt(`Requests per minute for ${p.provider} (blank for no limit)`, p.maxPerMinute?.toString() ?? '');
                      if (v === null) return;
                      set.mutate({ provider: p.provider, maxPerMinute: v.trim() === '' ? null : Number(v) });
                    }}>Limit</button>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

export function WorkersPanel() {
  const workers = trpc.ops.workers.useQuery(undefined, { refetchInterval: 15_000 });
  const alive = (w: { lastSeenAt: Date | string }) => Date.now() - new Date(w.lastSeenAt).getTime() < 2 * 60_000;
  return (
    <Section title="Workers" hint="What has been running jobs. A long-running worker reports every cycle; the daily cron and open Discovery pages report when they run.">
      <ErrorNote error={workers.error} />
      {workers.isPending ? <Loading /> : !workers.data?.length ? (
        <p className="card p-4 text-micro text-muted">No worker has reported yet. Without a deployed worker, scheduled work runs only at the daily cron tick and while a Discovery run panel is open.</p>
      ) : (
        <ul className="card divide-y divide-hairline">
          {workers.data.map((w) => (
            <li key={w.workerId} className="p-3 text-micro flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={cn('size-2 rounded-full', alive(w) ? 'bg-cleared' : 'bg-muted')} aria-hidden />
              <span className="font-medium">{w.workerId}</span>
              <span className="text-muted">{w.group}{w.version ? ` · ${w.version}` : ''}</span>
              <span className="flex-1" />
              <span className="text-muted">seen <Ago date={w.lastSeenAt} /> · {w.jobsProcessed} jobs</span>
              {w.lastError && <span className="w-full text-[11px] text-blocked truncate">{w.lastError}</span>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** One job: payload, result, every attempt and what it cost. */
export function JobDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const job = trpc.ops.job.useQuery({ id });
  const j = job.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={j ? humanize(j.type) : 'Job'} width="lg">
      {job.isPending ? <Loading /> : job.error ? <ErrorNote error={job.error} /> : j && (
        <div className="space-y-4 text-micro">
          <dl className="grid grid-cols-[120px_1fr] gap-y-1">
            <dt className="text-muted">Queue</dt><dd>{j.queue}</dd>
            <dt className="text-muted">Status</dt><dd>{j.status.toLowerCase()}{j.deadLetteredAt && <> · dead letter ({j.failureKind?.toLowerCase().replace('_', ' ')})</>}</dd>
            <dt className="text-muted">Attempts</dt><dd>{j.attempts} of {j.maxAttempts}</dd>
            <dt className="text-muted">Created</dt><dd><DateTime date={j.createdAt} /></dd>
            <dt className="text-muted">Runs</dt><dd><DateTime date={j.runAt} /></dd>
            {j.provider && <><dt className="text-muted">Provider</dt><dd>{j.provider}</dd></>}
            {j.waitingReason && <><dt className="text-muted">Waiting</dt><dd className="text-held">{j.waitingReason}</dd></>}
            {j.idempotencyKey && <><dt className="text-muted">Idempotency key</dt><dd className="truncate">{j.idempotencyKey}</dd></>}
            <dt className="text-muted">Cost</dt><dd>{j.usage.records ? `${dollars(j.usage.costMillicents)} over ${j.usage.records} calls` : 'none recorded'}</dd>
            {j.error && <><dt className="text-muted">Error</dt><dd className="text-blocked whitespace-pre-wrap">{j.error}</dd></>}
          </dl>
          <div>
            <p className="eyebrow mb-1">Attempts</p>
            {!j.attemptLog.length ? <p className="text-muted">None yet.</p> : (
              <Table>
                <thead><tr><Th>#</Th><Th>Worker</Th><Th>Started</Th><Th className="text-right">Took</Th><Th>Outcome</Th></tr></thead>
                <tbody>
                  {j.attemptLog.map((a) => (
                    <tr key={a.id}>
                      <Td className="num">{a.attempt}</Td>
                      <Td className="text-[11px] text-muted max-w-[140px] truncate">{a.workerId}</Td>
                      <Td className="text-[11px]"><DateTime date={a.startedAt} pattern="d MMM, h:mm:ss a" /></Td>
                      <Td className="text-right num">{seconds(a.durationMs)}</Td>
                      <Td className="text-[11px]">
                        <span className={cn(a.outcome === 'SUCCEEDED' ? 'text-cleared' : a.outcome === 'CONTINUED' ? 'text-muted' : a.outcome ? 'text-blocked' : 'text-accent')}>{a.outcome?.toLowerCase().replace('_', ' ') ?? 'running'}</span>
                        {a.error && <span className="block text-muted truncate max-w-[220px]" title={a.error}>{a.error}</span>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          {j.payload !== null && (
            <details>
              <summary className="cursor-pointer text-muted">Payload</summary>
              <pre className="mt-1 p-2 rounded bg-raised overflow-x-auto text-[11px]">{JSON.stringify(j.payload, null, 2)}</pre>
            </details>
          )}
          {j.result !== null && (
            <details>
              <summary className="cursor-pointer text-muted">Result</summary>
              <pre className="mt-1 p-2 rounded bg-raised overflow-x-auto text-[11px]">{JSON.stringify(j.result, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </Dialog>
  );
}
