'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Kpi } from '@/components/ui/kpi';
import { Pill, type Tone } from '@/components/ui/pill';
import { Table, Td, Th } from '@/components/ui/table';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { cn, formatCompact } from '@/lib/utils';

type Stage = 'DISCOVERED' | 'SCREENED_OUT' | 'QUALIFIED' | 'ANALYZED' | 'DEEP_RESEARCHED';
type Settings = RouterOutputs['pipeline']['settings'];

export const STAGE_LABELS: Record<Stage, string> = {
  DISCOVERED: 'Discovered', SCREENED_OUT: 'Screened out', QUALIFIED: 'Qualified', ANALYZED: 'Analysed', DEEP_RESEARCHED: 'Deep researched',
};
export const TIER_TONE: Record<string, Tone> = { HOT: 'negative', WARM: 'warning', EXPLORATORY: 'accent', LOW: 'neutral', SUPPRESSED: 'neutral' };
const usd = (millicents: number) => `$${(millicents / 100_000).toFixed(2)}`;

/**
 * The research funnel: every stored company is screened cheaply; only the
 * promising get AI analysis, and only the best get deep research. This page
 * shows where accounts sit, why, what it costs, and the controls on each gate.
 */
export function PipelineWorkspace({ canRun, canConfigure, canOverride }: { canRun: boolean; canConfigure: boolean; canOverride: boolean }) {
  const { clientId } = useActiveClient();
  const metrics = trpc.pipeline.metrics.useQuery({ clientId }, { refetchInterval: 20_000 });
  const budgets = trpc.pipeline.budgets.useQuery(undefined, { refetchInterval: 30_000 });
  const alerts = trpc.pipeline.alerts.useQuery();
  const [stage, setStage] = useState<Stage>('QUALIFIED');
  const utils = trpc.useUtils();
  const screen = trpc.pipeline.screenPending.useMutation({ onSuccess: () => utils.pipeline.metrics.invalidate() });
  const ack = trpc.pipeline.acknowledgeAlert.useMutation({ onSuccess: () => utils.pipeline.alerts.invalidate() });
  const m = metrics.data;

  return (
    <>
      <Topbar title="Research funnel"
              actions={canRun && (
                <button type="button" className="btn-outline h-8 text-micro" disabled={screen.isPending || !m?.pendingScreening} onClick={() => screen.mutate()}>
                  <Filter className="size-3.5" /> {screen.isPending ? 'Queuing…' : `Screen ${m?.pendingScreening ?? 0} waiting`}
                </button>
              )} />
      <PageBody width="wide" className="space-y-8">
        <ErrorNote error={metrics.error ?? screen.error} />
        {screen.data && <p className="text-micro text-muted">{screen.data.queued} screening batch{screen.data.queued === 1 ? '' : 'es'} queued.</p>}

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Kpi label="Stored" value={m ? formatCompact(m.stored) : '—'} caption="companies on file" />
          <Kpi label="Discovered" value={m?.thisMonth.discovered ?? '—'} caption="this month" />
          <Kpi label="Refreshed" value={m?.thisMonth.refreshed ?? '—'} caption="this month" />
          <Kpi label="Analysed" value={m?.thisMonth.analysed ?? '—'} caption={m?.researchCost.perAnalysisMillicents ? `${usd(m.researchCost.perAnalysisMillicents)} each` : 'this month'} />
          <Kpi label="Deep researched" value={m?.thisMonth.deep ?? '—'} caption={m?.researchCost.perDeepMillicents ? `${usd(m.researchCost.perDeepMillicents)} each` : 'this month'} />
          <Kpi label="Awaiting screening" value={m?.pendingScreening ?? '—'} />
          <Kpi label="Due a refresh" value={m?.dueRefresh ?? '—'} />
        </div>

        <Section title="Stages" hint="Select a stage to see its accounts. Screened-out accounts are kept and screened again when a new signal arrives.">
          {!m ? <Loading /> : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {(Object.keys(STAGE_LABELS) as Stage[]).map((s) => {
                const n = m.stages[s];
                const share = m.stored ? n / m.stored : 0;
                return (
                  <button key={s} type="button" onClick={() => setStage(s)} aria-pressed={stage === s}
                          className={cn('card p-3 text-left transition-colors', stage === s ? 'border-accent bg-accent-soft/30' : 'hover:bg-raised/60')}>
                    <p className="eyebrow">{STAGE_LABELS[s]}</p>
                    <p className="num text-lg">{formatCompact(n)}</p>
                    <div className="h-1 rounded-full bg-raised mt-1 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${Math.max(share * 100, n ? 2 : 0)}%` }} /></div>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        <StageAccounts stage={stage} canRun={canRun} canOverride={canOverride} />

        <div className="grid xl:grid-cols-2 gap-6">
          <Section title="Budgets this month" hint="Enforced before money is spent. When a category is used up, its queued work waits; customer workflows and the dashboard carry on.">
            <ErrorNote error={budgets.error} />
            {budgets.isPending ? <Loading /> : (
              <ul className="card divide-y divide-hairline">
                {budgets.data?.map((b) => (
                  <li key={b.category} className="p-3 text-micro">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex-1 font-medium">{b.label}</span>
                      <span className="num">{b.estimated ? '~' : ''}{usd(b.spentMillicents)}</span>
                      <span className="text-muted">{b.limitCents === null ? 'no limit' : `of $${(b.limitCents / 100).toFixed(0)}`}</span>
                    </div>
                    {b.limitCents !== null && (
                      <div className="h-1.5 rounded-full bg-raised overflow-hidden" role="meter" aria-label={`${b.label} budget used`} aria-valuenow={Math.round((b.used ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
                        <div className={cn('h-full', b.level === 'reached' ? 'bg-blocked' : b.level === 'high' ? 'bg-held' : b.level === 'half' ? 'bg-held/60' : 'bg-accent')} style={{ width: `${Math.min(100, (b.used ?? 0) * 100)}%` }} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Alerts">
            <ErrorNote error={alerts.error ?? ack.error} />
            {alerts.isPending ? <Loading /> : !alerts.data?.length ? <p className="card p-4 text-micro text-muted">Nothing needs attention.</p> : (
              <ul className="card divide-y divide-hairline">
                {alerts.data.map((a) => (
                  <li key={a.id} className="p-3 text-micro flex items-start gap-2">
                    <Pill tone={a.severity === 'critical' ? 'negative' : a.severity === 'warning' ? 'warning' : 'neutral'}>{a.severity}</Pill>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{a.title}</p>
                      {a.detail && <p className="text-muted">{a.detail}</p>}
                      <p className="text-[11px] text-muted"><Ago date={a.lastSeenAt} />{a.occurrences > 1 ? ` · ${a.occurrences} times` : ''}{a.acknowledgedAt ? ' · acknowledged' : ''}</p>
                    </div>
                    {!a.acknowledgedAt && <button type="button" className="btn-ghost h-7 text-[11px]" disabled={ack.isPending} onClick={() => ack.mutate({ id: a.id })}>Acknowledge</button>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Forecast />
        {canConfigure && <SettingsForm />}
      </PageBody>
    </>
  );
}

function StageAccounts({ stage, canRun, canOverride }: { stage: Stage; canRun: boolean; canOverride: boolean }) {
  const { clientId } = useActiveClient();
  const [cursors, setCursors] = useState<string[]>([]);
  useEffect(() => setCursors([]), [stage, clientId]);
  const list = trpc.pipeline.stageAccounts.useQuery({ stage, clientId, cursor: cursors[cursors.length - 1], limit: 25 }, { placeholderData: (p) => p });
  const utils = trpc.useUtils();
  const refresh = () => { void utils.pipeline.stageAccounts.invalidate(); void utils.pipeline.metrics.invalidate(); };
  const analyze = trpc.pipeline.analyze.useMutation({ onSuccess: refresh });
  const deep = trpc.pipeline.deepResearch.useMutation({ onSuccess: refresh });
  const promote = trpc.pipeline.setStage.useMutation({ onSuccess: refresh });
  const release = trpc.pipeline.releaseStage.useMutation({ onSuccess: refresh });
  const rows = list.data?.items ?? [];

  return (
    <Section title={STAGE_LABELS[stage]} hint="Best screening score first. A pinned stage was set by a person and screening leaves it alone.">
      <ErrorNote error={list.error ?? analyze.error ?? deep.error ?? promote.error ?? release.error} />
      {(analyze.data || deep.data) && <p className="text-micro text-muted mb-2">Queued. Progress shows on the System page.</p>}
      {list.isPending ? <Loading /> : !rows.length ? (
        <EmptyState icon={Filter} title={`No accounts ${STAGE_LABELS[stage].toLowerCase()}`}>Accounts arrive here as they are screened and researched.</EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Account</Th><Th className="text-right">Score</Th><Th>Tier</Th><Th className="hidden lg:table-cell">Why</Th><Th className="hidden md:table-cell text-right">Research</Th>{(canRun || canOverride) && <Th />}</tr></thead>
          <tbody>
            {rows.map((a) => {
              const reasons = ((a.screeningReasons as { reasons?: Array<{ label: string; points: number; tone: string }> } | null)?.reasons ?? [])
                .filter((r) => r.points > 0 || r.tone === 'negative').slice(0, 3);
              return (
                <tr key={a.id}>
                  <Td className="max-w-[220px]">
                    <Link href={`/accounts/${a.id}`} className="font-medium hover:text-accent block truncate">{a.name}</Link>
                    <span className="block text-[11px] text-muted truncate">{[a.industry, a.city].filter(Boolean).join(' · ') || a.domain || '—'}{a.stagePinned && ' · pinned'}</span>
                  </Td>
                  <Td className="text-right num">{a.screeningScore ?? '—'}</Td>
                  <Td>{a.opportunityTier ? <Pill tone={TIER_TONE[a.opportunityTier]}>{a.opportunityTier.toLowerCase()}</Pill> : <span className="text-micro text-muted">—</span>}</Td>
                  <Td className="hidden lg:table-cell text-[11px] text-muted max-w-[320px]">
                    {reasons.map((r) => <span key={r.label} className={cn('block truncate', r.tone === 'negative' && 'text-blocked')}>{r.label}</span>)}
                    {a.promotionNote && <span className="block truncate text-accent">“{a.promotionNote}”</span>}
                  </Td>
                  <Td className="hidden md:table-cell text-right text-[11px] text-muted">
                    {a.researchVersion ? <>v{a.researchVersion} · <Ago date={a.lastResearchedAt} /></> : 'none'}
                    {a.researchCostMillicents > 0 && <span className="block">{usd(a.researchCostMillicents)}</span>}
                  </Td>
                  {(canRun || canOverride) && (
                    <Td className="whitespace-nowrap text-right">
                      {canRun && (stage === 'QUALIFIED' || stage === 'SCREENED_OUT' || stage === 'DISCOVERED') && (
                        <button type="button" className="btn-ghost h-7 text-[11px]" disabled={analyze.isPending} onClick={() => analyze.mutate({ accountId: a.id })}>Analyse</button>
                      )}
                      {canRun && stage === 'ANALYZED' && (
                        <button type="button" className="btn-ghost h-7 text-[11px]" disabled={deep.isPending} onClick={() => deep.mutate({ accountId: a.id })}>Deep research</button>
                      )}
                      {canOverride && stage === 'SCREENED_OUT' && (
                        <button type="button" className="btn-ghost h-7 text-[11px]" disabled={promote.isPending}
                                onClick={() => { const note = prompt('Why promote this account? (kept with the record)'); if (note !== null) promote.mutate({ accountId: a.id, stage: 'QUALIFIED', note: note || null }); }}>
                          Promote
                        </button>
                      )}
                      {canOverride && a.stagePinned && (
                        <button type="button" className="btn-ghost h-7 text-[11px]" disabled={release.isPending} onClick={() => release.mutate({ accountId: a.id })}>Unpin</button>
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {(cursors.length > 0 || list.data?.nextCursor) && (
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" className="btn-outline h-7 text-micro" disabled={!cursors.length} onClick={() => setCursors((c) => c.slice(0, -1))}>Previous</button>
          <button type="button" className="btn-outline h-7 text-micro" disabled={!list.data?.nextCursor} onClick={() => list.data?.nextCursor && setCursors((c) => [...c, list.data!.nextCursor!])}>Next</button>
        </div>
      )}
    </Section>
  );
}

function Forecast() {
  const [s, setS] = useState({ storedCompanies: 50_000, discoveredPerMonth: 5_000, refreshedPerMonth: 5_000, analysedPerMonth: 500, deepPerMonth: 50 });
  const [debounced, setDebounced] = useState(s);
  useEffect(() => { const t = setTimeout(() => setDebounced(s), 400); return () => clearTimeout(t); }, [s]);
  const f = trpc.pipeline.forecast.useQuery({ scenario: debounced }, { placeholderData: (p) => p });
  const num = (k: keyof typeof s, label: string) => (
    <label className="block text-[12px]">
      <span className="text-muted">{label}</span>
      <input type="number" min={0} className="input h-8 mt-1" value={s[k]} onChange={(e) => setS((x) => ({ ...x, [k]: Math.max(0, Number(e.target.value) || 0) }))} />
    </label>
  );
  return (
    <Section title="Cost forecast" hint="Stored companies don't drive AI cost; how many are discovered, analysed and deeply researched each month does. Unit costs are editable assumptions (below), not quotes.">
      <ErrorNote error={f.error} />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <p className="eyebrow mb-2">Standard sizes (10% discovered and refreshed, 2% analysed, 0.2% deep, per month)</p>
          {!f.data ? <Loading /> : (
            <Table>
              <thead><tr><Th>Stored</Th><Th className="text-right">Analysed/mo</Th><Th className="text-right">Deep/mo</Th><Th className="text-right">Storage</Th><Th className="text-right">Monthly</Th></tr></thead>
              <tbody>
                {f.data.standard.map((r) => (
                  <tr key={r.scenario.storedCompanies}>
                    <Td className="num">{formatCompact(r.scenario.storedCompanies)}</Td>
                    <Td className="num text-right">{formatCompact(r.scenario.analysedPerMonth)}</Td>
                    <Td className="num text-right">{formatCompact(r.scenario.deepPerMonth)}</Td>
                    <Td className="num text-right">{r.storageGb} GB</Td>
                    <Td className="num text-right font-medium">${r.totalUsd.toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <div className="card p-4">
          <p className="eyebrow mb-2">Your scenario</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {num('storedCompanies', 'Stored')}{num('discoveredPerMonth', 'Discovered/mo')}{num('refreshedPerMonth', 'Refreshed/mo')}
            {num('analysedPerMonth', 'Analysed/mo')}{num('deepPerMonth', 'Deep/mo')}
          </div>
          {f.data?.custom && (
            <ul className="text-micro divide-y divide-hairline">
              {f.data.custom.lines.map((l) => (
                <li key={l.label} className="py-1.5 flex gap-2"><span className="flex-1">{l.label}<span className="block text-[11px] text-muted">{l.formula}</span></span><span className="num">${l.usd.toLocaleString()}</span></li>
              ))}
              <li className="py-1.5 flex font-medium"><span className="flex-1">Total per month</span><span className="num">${f.data.custom.totalUsd.toLocaleString()}</span></li>
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

const SETTING_FIELDS: Array<{ key: keyof Settings; label: string; hint?: string; kind: 'int' | 'bool' | 'usd' }> = [
  { key: 'screeningThreshold', label: 'Screening threshold', hint: 'Score (0–100) to qualify for analysis', kind: 'int' },
  { key: 'deepThreshold', label: 'Deep research threshold', hint: 'Score after analysis', kind: 'int' },
  { key: 'autoScreen', label: 'Screen new and changed accounts automatically', kind: 'bool' },
  { key: 'autoAnalyze', label: 'Analyse qualified accounts automatically', hint: 'Uses the AI budget', kind: 'bool' },
  { key: 'autoDeep', label: 'Deep-research accounts above the threshold automatically', kind: 'bool' },
  { key: 'maxAnalysesPerDay', label: 'Automatic analyses per day', kind: 'int' },
  { key: 'maxDeepPerDay', label: 'Automatic deep research per day', kind: 'int' },
  { key: 'autoContacts', label: 'Look up contacts for qualified accounts automatically', hint: 'Does not wait for AI analysis; paid lookups use the enrichment budget', kind: 'bool' },
  { key: 'maxContactLookupsPerDay', label: 'Automatic contact lookups per day', kind: 'int' },
  { key: 'refreshDaysHot', label: 'Refresh hot accounts every (days)', kind: 'int' },
  { key: 'refreshDaysWarm', label: 'Refresh warm (days)', kind: 'int' },
  { key: 'refreshDaysExploratory', label: 'Refresh exploratory (days)', kind: 'int' },
  { key: 'refreshDaysLow', label: 'Refresh low (days)', kind: 'int' },
  { key: 'refreshDaysScreenedOut', label: 'Refresh screened-out (days)', kind: 'int' },
  { key: 'globalBudgetCents', label: 'Monthly budget, everything (US$)', hint: 'Blank for no limit', kind: 'usd' },
  { key: 'discoveryBudgetCents', label: 'Discovery (US$)', kind: 'usd' },
  { key: 'analysisBudgetCents', label: 'AI analysis (US$)', kind: 'usd' },
  { key: 'deepBudgetCents', label: 'Deep research (US$)', kind: 'usd' },
  { key: 'enrichmentBudgetCents', label: 'Contact enrichment (US$)', kind: 'usd' },
  { key: 'outreachBudgetCents', label: 'Outreach (US$)', kind: 'usd' },
];

function SettingsForm() {
  const settings = trpc.pipeline.settings.useQuery();
  const forecastQ = trpc.pipeline.forecast.useQuery({});
  const utils = trpc.useUtils();
  const save = trpc.pipeline.updateSettings.useMutation({ onSuccess: () => { void utils.pipeline.invalidate(); } });
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [assumptions, setAssumptions] = useState<Record<string, string>>({});
  if (settings.isPending || forecastQ.isPending) return <Loading />;
  if (!settings.data) return <ErrorNote error={settings.error} />;
  const s = settings.data;
  const value = (f: (typeof SETTING_FIELDS)[number]) => {
    if (f.key in draft) return draft[f.key as string]!;
    const v = s[f.key];
    if (f.kind === 'bool') return Boolean(v);
    if (f.kind === 'usd') return v === null ? '' : String((v as number) / 100);
    return String(v);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const out: Record<string, unknown> = {};
    for (const f of SETTING_FIELDS) {
      if (!(f.key in draft)) continue;
      const v = draft[f.key as string]!;
      out[f.key] = f.kind === 'bool' ? v : f.kind === 'usd' ? (v === '' ? null : Math.round(Number(v) * 100)) : Number(v);
    }
    const costAssumptions = Object.keys(assumptions).length
      ? Object.fromEntries(Object.entries({ ...(forecastQ.data?.assumptions ?? {}), ...Object.fromEntries(Object.entries(assumptions).map(([k, v]) => [k, Number(v)])) }))
      : undefined;
    save.mutate({ ...out, ...(costAssumptions ? { costAssumptions } : {}) } as never);
  };
  return (
    <Section title="Funnel settings" hint="Thresholds, daily caps, how often to check each tier, and spending limits. Changes apply from the next screening.">
      <form onSubmit={submit} className="card p-4 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SETTING_FIELDS.map((f) => f.kind === 'bool' ? (
            <label key={f.key} className="flex items-start gap-2 text-[12px]">
              <input type="checkbox" className="mt-0.5" checked={value(f) as boolean} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))} />
              <span>{f.label}{f.hint && <span className="block text-[11px] text-muted">{f.hint}</span>}</span>
            </label>
          ) : (
            <label key={f.key} className="block text-[12px]">
              <span className="font-medium">{f.label}</span>
              <input type="number" min={0} step={f.kind === 'usd' ? '1' : '1'} className="input h-8 mt-1" value={value(f) as string}
                     onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
              {f.hint && <span className="text-[11px] text-muted">{f.hint}</span>}
            </label>
          ))}
        </div>
        {forecastQ.data && (
          <details>
            <summary className="cursor-pointer text-micro text-muted">Cost assumptions for the forecast</summary>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              {Object.entries(forecastQ.data.assumptions).map(([k, v]) => (
                <label key={k} className="block text-[12px]">
                  <span className="text-muted">{k.replace(/([A-Z])/g, ' $1').replace(/Usd$/i, ' (US$)').toLowerCase()}</span>
                  <input type="number" min={0} step="any" className="input h-8 mt-1" value={assumptions[k] ?? String(v)} onChange={(e) => setAssumptions((a) => ({ ...a, [k]: e.target.value }))} />
                </label>
              ))}
            </div>
          </details>
        )}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          {save.isSuccess && <span className="text-micro text-cleared self-center">Saved.</span>}
          <button type="submit" className="btn-primary h-8 text-micro" disabled={save.isPending || (!Object.keys(draft).length && !Object.keys(assumptions).length)}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </Section>
  );
}
