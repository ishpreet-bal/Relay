'use client';

import { useState } from 'react';
import { Archive, Pencil, Play, Plus, Radar } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago, DateTime } from '@/components/ui/time';
import { Table, Td, Th } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ProfileDialog } from './profile-dialog';
import { RunPanel } from './run-panel';
import { FREQUENCY_LABELS, SOURCE_LABELS, usd } from './format';

type Profile = RouterOutputs['discovery']['profiles'][number];
type Source = RouterOutputs['discovery']['sources'][number];

/**
 * Discovery engine: profiles describe what to look for and where; runs
 * search the connected sources and turn results into accounts through the
 * same matching as manual entry and import.
 */
export function DiscoveryWorkspace({ canRun }: { canRun: boolean }) {
  const { clientId } = useActiveClient();
  const sources = trpc.discovery.sources.useQuery();
  const profiles = trpc.discovery.profiles.useQuery({ clientId });
  const runs = trpc.discovery.runs.useQuery({ clientId, limit: 25 }, { refetchInterval: 10_000 });
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);

  return (
    <>
      <Topbar title="Discovery"
              actions={canRun && (
                <button type="button" className="btn-primary h-8 text-micro" onClick={() => setEditing('new')}>
                  <Plus className="size-3.5" /> New profile
                </button>
              )} />
      <PageBody width="wide">
        <Section title="Sources" hint="Where discovery looks. A source is used only once its key is set and it passes its check under Connectors.">
          <div className="grid md:grid-cols-2 gap-3">
            {sources.isPending ? <Loading /> : sources.data?.map((s) => <SourceCard key={s.id} source={s} />)}
          </div>
          <ErrorNote error={sources.error} />
        </Section>

        <Section title="Profiles" className="mt-6"
                 hint="Each profile runs on its own schedule and monthly budget. Nothing is spent until you press Run now or a scheduled run comes due.">
          <ErrorNote error={profiles.error} />
          {profiles.isPending ? <Loading /> : !profiles.data?.length ? (
            <EmptyState icon={Radar} title="No discovery profiles yet"
                        action={canRun && <button type="button" className="btn-primary" onClick={() => setEditing('new')}>Create a profile</button>}>
              A profile says which businesses to look for (for example machine shops and tool-and-die makers) and where (the GTA by default).
            </EmptyState>
          ) : (
            <ul className="grid lg:grid-cols-2 gap-3">
              {profiles.data.map((p) => (
                <ProfileCard key={p.id} profile={p} canRun={canRun} onEdit={() => setEditing(p)} onOpenRun={setOpenRun} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent runs" className="mt-6">
          <ErrorNote error={runs.error} />
          {runs.isPending ? <Loading /> : !runs.data?.length ? (
            <p className="card p-4 text-micro text-muted">No runs yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Run</Th><Th>Status</Th><Th className="text-right">Found</Th><Th className="text-right">New</Th>
                  <Th className="text-right hidden md:table-cell">Enriched</Th><Th className="text-right hidden md:table-cell">On file</Th>
                  <Th className="text-right hidden md:table-cell">Skipped</Th><Th className="text-right hidden lg:table-cell">Review</Th>
                  <Th className="text-right">Cost</Th><Th className="hidden lg:table-cell">Started</Th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id} className="hover:bg-raised/60 cursor-pointer" onClick={() => setOpenRun(r.id)}>
                    <Td className="max-w-[260px]">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="text-[11px] text-muted">{r.trigger === 'SCHEDULE' ? 'scheduled' : 'manual'} · {r.sources.map((s) => SOURCE_LABELS[s] ?? s).join(', ')}</span>
                    </Td>
                    <Td><RunStatus status={r.status} /></Td>
                    <Td className="text-right num">{r.found}</Td>
                    <Td className="text-right num">{r.imported}</Td>
                    <Td className="text-right num hidden md:table-cell">{r.updated}</Td>
                    <Td className="text-right num hidden md:table-cell">{r.duplicates}</Td>
                    <Td className="text-right num hidden md:table-cell">{r.excluded}</Td>
                    <Td className="text-right num hidden lg:table-cell">{r.needsReview}</Td>
                    <Td className="text-right num">{usd(r.costMillicents, true)}</Td>
                    <Td className="hidden lg:table-cell text-micro text-muted"><Ago date={r.startedAt ?? r.createdAt} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="text-[11px] text-muted mt-2">Costs are estimates from list prices; your provider&apos;s invoice (after free allowances) is the actual figure.</p>
        </Section>
      </PageBody>

      {editing && <ProfileDialog profile={editing === 'new' ? null : editing} sources={sources.data ?? []} onClose={() => setEditing(null)} />}
      {openRun && <RunPanel runId={openRun} canRun={canRun} onClose={() => setOpenRun(null)} />}
    </>
  );
}

export function RunStatus({ status }: { status: string }) {
  const tone = status === 'COMPLETED' ? 'positive' : status === 'FAILED' ? 'negative' : status === 'CANCELLED' ? 'neutral' : 'accent';
  const label = { QUEUED: 'Queued', RUNNING: 'Running', RETRYING: 'Retrying', COMPLETED: 'Completed', FAILED: 'Failed', CANCELLED: 'Cancelled' }[status] ?? status;
  return <Pill tone={tone}>{label}</Pill>;
}

function SourceCard({ source: s }: { source: Source }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <p className="font-medium flex-1">{s.name}</p>
        {s.usable ? <Pill tone="positive">Connected</Pill> : s.configured && !s.enabled ? <Pill>Turned off</Pill> : <Pill tone="warning">Not configured</Pill>}
      </div>
      <p className="text-micro text-muted">{s.description}</p>
      <p className="text-[11px] text-muted mt-2">
        {s.storage === 'locate-only' ? 'Results only locate businesses; details come from their own websites.' : 'Results are stored under your subscription’s terms.'}
        {' '}About {usd(s.requestCostMillicents, s.costIsEstimate)} per {s.queryStyle === 'text' ? 'search page (up to 20 results)' : 'page'}.
      </p>
      {!s.configured && <p className="text-[11px] text-held mt-1">Set {s.missingEnv.join(', ')} in your deployment&apos;s environment, then run its check under Connectors.</p>}
      {s.lastError && <p className="text-[11px] text-blocked mt-1">Last error: {s.lastError}</p>}
    </div>
  );
}

function ProfileCard({ profile: p, canRun, onEdit, onOpenRun }: { profile: Profile; canRun: boolean; onEdit: () => void; onOpenRun: (id: string) => void }) {
  const utils = trpc.useUtils();
  const run = trpc.discovery.run.useMutation({
    onSuccess: (r) => { void utils.discovery.runs.invalidate(); void utils.discovery.profiles.invalidate(); onOpenRun(r.run.id); },
  });
  const archive = trpc.discovery.archiveProfile.useMutation({ onSuccess: () => utils.discovery.profiles.invalidate() });
  const last = p.runs[0];
  const budget = p.monthlyBudgetCents * 1000;
  const pct = budget > 0 ? Math.min(1, p.monthSpendMillicents / budget) : 1;
  const area = p.cities.length ? `${p.cities.slice(0, 4).join(', ')}${p.cities.length > 4 ? ` +${p.cities.length - 4}` : ''}` : p.regions.join(', ') || p.country;

  return (
    <li className="card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{p.name}</p>
          <p className="text-[11px] text-muted">{p.client.name} · {p.sources.map((s) => SOURCE_LABELS[s] ?? s).join(' + ')}</p>
        </div>
        {!p.isActive && <Pill>Paused</Pill>}
      </div>
      <p className="text-micro">
        <span className="text-ink">{[...p.industries, ...p.keywords].join(', ')}</span>
        <span className="text-muted"> in {area}</span>
        {(p.employeeMin !== null || p.employeeMax !== null) && <span className="text-muted"> · {p.employeeMin ?? 1}–{p.employeeMax ?? '∞'} employees</span>}
      </p>
      <div>
        <div className="flex justify-between text-[11px] text-muted mb-1">
          <span>This month {usd(p.monthSpendMillicents, true)} of {usd(budget)}</span>
          <span>{FREQUENCY_LABELS[p.frequency]}{p.nextRunAt && p.isActive && p.frequency !== 'MANUAL' ? <> · next <DateTime date={p.nextRunAt} /></> : ''}</span>
        </div>
        <div className="h-1.5 rounded-full bg-raised overflow-hidden" role="meter" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly budget used">
          <div className={cn('h-full', p.budgetLevel === 'reached' ? 'bg-blocked' : p.budgetLevel === 'high' ? 'bg-held' : p.budgetLevel === 'half' ? 'bg-held/60' : 'bg-accent')}
               style={{ width: `${pct * 100}%` }} />
        </div>
        {p.budgetLevel === 'reached' && <p className="text-[11px] text-blocked mt-1">Budget used up: runs are refused until next month or a higher budget.</p>}
        {p.budgetLevel === 'high' && <p className="text-[11px] text-held mt-1">Over 80% of this month&apos;s budget is used.</p>}
      </div>
      {last && (
        <button type="button" onClick={() => onOpenRun(last.id)} className="text-left text-[11px] text-muted hover:text-ink">
          Last run <Ago date={last.createdAt} />: <RunStatus status={last.status} /> {last.found} found, {last.imported} new
          {last.error && <span className="block text-blocked truncate">{last.error}</span>}
        </button>
      )}
      <ErrorNote error={run.error ?? archive.error} />
      {canRun && (
        <div className="flex flex-wrap gap-2 mt-auto">
          <button type="button" className="btn-primary h-8 text-micro" disabled={run.isPending || p.budgetLevel === 'reached'} onClick={() => run.mutate({ profileId: p.id })}>
            <Play className="size-3.5" /> {run.isPending ? 'Starting…' : 'Run now'}
          </button>
          <button type="button" className="btn-outline h-8 text-micro" onClick={onEdit}><Pencil className="size-3.5" /> Edit</button>
          <button type="button" className="btn-ghost h-8 text-micro" disabled={archive.isPending}
                  onClick={() => { if (confirm(`Archive "${p.name}"? Its runs and the accounts they found are kept.`)) archive.mutate({ id: p.id }); }}>
            <Archive className="size-3.5" /> Archive
          </button>
        </div>
      )}
    </li>
  );
}
