'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Section } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { ErrorNote } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { cn } from '@/lib/utils';
import { STAGE_LABELS, TIER_TONE } from './pipeline-workspace';

interface Props {
  account: {
    id: string; pipelineStage: keyof typeof STAGE_LABELS; opportunityTier: string | null; screeningScore: number | null;
    screeningReasons: unknown; stagePinned: boolean; promotionNote: string | null; researchVersion: number;
    lastResearchedAt: Date | string | null; nextRefreshAt: Date | string | null; researchCostMillicents: number;
  };
  canRun: boolean;
  canOverride: boolean;
}

interface Version { id: string; stage: string; version: number; trigger: string; createdAt: Date | string; costMillicents: number; changedFields: string[]; hypotheses: unknown; unknowns: unknown; facts: unknown }

/** Where this account sits in the research funnel, why, and what it has cost. */
export function AccountFunnel({ account: a, canRun, canOverride }: Props) {
  const utils = trpc.useUtils();
  const versions = trpc.pipeline.versions.useQuery({ accountId: a.id });
  const done = () => { void utils.accounts.byId.invalidate({ id: a.id }); void utils.pipeline.versions.invalidate({ accountId: a.id }); };
  const analyze = trpc.pipeline.analyze.useMutation({ onSuccess: done });
  const deep = trpc.pipeline.deepResearch.useMutation({ onSuccess: done });
  const release = trpc.pipeline.releaseStage.useMutation({ onSuccess: done });
  const rescreen = trpc.pipeline.rescreen.useMutation({ onSuccess: done });
  const [open, setOpen] = useState<string | null>(null);
  const reasons = ((a.screeningReasons as { reasons?: Array<{ label: string; points: number; tone: string }> } | null)?.reasons ?? []);

  return (
    <Section title="Research funnel" hint="Screening is free; analysis and deep research cost money and are gated.">
      <div className="card p-3 space-y-2 text-micro">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="accent">{STAGE_LABELS[a.pipelineStage]}</Pill>
          {a.opportunityTier && <Pill tone={TIER_TONE[a.opportunityTier]}>{a.opportunityTier.toLowerCase()}</Pill>}
          {a.stagePinned && <Pill>pinned</Pill>}
          <span className="flex-1" />
          <span className="num">{a.screeningScore ?? '—'}<span className="text-muted">/100</span></span>
        </div>
        {reasons.length > 0 && (
          <ul className="space-y-0.5">
            {reasons.map((r) => (
              <li key={r.label} className="flex gap-2"><span className={cn('flex-1', r.tone === 'negative' && 'text-blocked')}>{r.label}</span><span className="num text-muted">+{r.points}</span></li>
            ))}
          </ul>
        )}
        {a.promotionNote && <p className="text-accent">“{a.promotionNote}”</p>}
        <p className="text-[11px] text-muted">
          {a.researchVersion ? <>Researched <Ago date={a.lastResearchedAt} /> · v{a.researchVersion} · </> : 'Not researched · '}
          ${(a.researchCostMillicents / 100_000).toFixed(2)} spent{a.nextRefreshAt ? <> · next check <Ago date={a.nextRefreshAt} /></> : ''}
        </p>
        <ErrorNote error={analyze.error ?? deep.error ?? release.error ?? rescreen.error} />
        {(analyze.isSuccess || deep.isSuccess) && <p className="text-[11px] text-cleared">Queued.</p>}
        <div className="flex flex-wrap gap-1.5">
          {canRun && <button type="button" className="btn-outline h-7 text-[11px]" disabled={analyze.isPending} onClick={() => analyze.mutate({ accountId: a.id })}>{a.researchVersion ? 'Analyse again' : 'Analyse'}</button>}
          {canRun && a.researchVersion > 0 && <button type="button" className="btn-outline h-7 text-[11px]" disabled={deep.isPending} onClick={() => deep.mutate({ accountId: a.id })}>Deep research</button>}
          {canOverride && <button type="button" className="btn-ghost h-7 text-[11px]" disabled={rescreen.isPending} onClick={() => rescreen.mutate({ accountId: a.id })}>Screen again</button>}
          {canOverride && a.stagePinned && <button type="button" className="btn-ghost h-7 text-[11px]" disabled={release.isPending} onClick={() => release.mutate({ accountId: a.id })}>Unpin stage</button>}
        </div>
      </div>

      {!!versions.data?.length && (
        <ul className="card divide-y divide-hairline mt-2">
          {(versions.data as Version[]).map((v) => {
            const h = v.hypotheses as { opportunities?: Array<{ title: string; evidenceFactIds: string[]; howToValidate?: string }>; serviceFit?: Array<{ offer: string; fit: string; rationale: string; proposal: string }>; overallFit?: { score: number }; roi?: { low: { annualSavingsCents: number }; high: { annualSavingsCents: number } } | null } | Array<{ angle?: string }> | null;
            const opportunities = !Array.isArray(h) ? h?.opportunities ?? [] : [];
            const facts = Array.isArray(v.facts) ? v.facts.length : null;
            const unknowns = Array.isArray(v.unknowns) ? v.unknowns as Array<{ question: string }> : [];
            return (
              <li key={v.id} className="p-2.5 text-[11px]">
                <button type="button" className="w-full text-left flex gap-2" onClick={() => setOpen(open === v.id ? null : v.id)} aria-expanded={open === v.id}>
                  <span className="flex-1 font-medium">{v.stage === 'DEEP' ? 'Deep research' : 'Analysis'} v{v.version}<span className="text-muted font-normal"> · {v.trigger.toLowerCase()} · <Ago date={v.createdAt} /></span></span>
                  <span className="num text-muted">${(v.costMillicents / 100_000).toFixed(2)}</span>
                </button>
                {open === v.id && (
                  <div className="mt-1.5 space-y-1 text-muted">
                    {facts !== null && <p>{facts} verified facts{v.changedFields.length ? ` · changed: ${v.changedFields.join(', ')}` : ''}</p>}
                    {!Array.isArray(h) && h?.overallFit && <p>Fit {h.overallFit.score}/100 (hypothesis)</p>}
                    {!Array.isArray(h) && h?.serviceFit?.map((f) => (
                      <p key={f.offer}><span className="text-ink">{f.offer}</span>: {f.fit} fit (hypothesis). {f.rationale}{f.proposal ? <> <span className="text-ink">Could propose:</span> {f.proposal}</> : null}</p>
                    ))}
                    {opportunities.map((o) => <p key={o.title}>• <span className="text-ink">{o.title}</span> — hypothesis, cites {o.evidenceFactIds.join(', ')}{o.howToValidate ? `; validate: ${o.howToValidate}` : ''}</p>)}
                    {!Array.isArray(h) && h?.roi && <p>Scenario: ${Math.round(h.roi.low.annualSavingsCents / 100).toLocaleString()}–${Math.round(h.roi.high.annualSavingsCents / 100).toLocaleString()}/yr if the assumptions hold (not a measured result)</p>}
                    {unknowns.slice(0, 5).map((u, i) => <p key={i}>? {u.question}</p>)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
