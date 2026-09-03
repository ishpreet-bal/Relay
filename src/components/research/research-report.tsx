'use client';

import { useState } from 'react';
import {
  Loader2, RefreshCw, AlertTriangle, ShieldCheck, Clock, TrendingUp, Info,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn, formatMoney } from '@/lib/utils';
import { EvidenceDrawer } from './evidence-drawer';

interface Citation { pageId: string; quote: string; url: string; pageTitle: string; matchType: string; similarity: number }
interface Claim { title: string; rationale?: string; workflow?: string; tooling?: string[]; hoursPerWeek?: number; effortDays?: number; confidence: number; citations: Citation[] }

export function ResearchReport({ leadId, canRun }: { leadId: string; canRun: boolean }) {
  const [evidence, setEvidence] = useState<{ pageId: string; quote: string } | null>(null);
  const utils = trpc.useUtils();
  const research = trpc.research.byLead.useQuery({ leadId });
  const run = trpc.research.run.useMutation({
    onSettled: () => {
      utils.research.byLead.invalidate({ leadId });
      utils.leads.byId.invalidate({ id: leadId });
      utils.leads.timeline.invalidate({ leadId });
    },
  });

  const data = research.data;
  const running = run.isPending || data?.status === 'RUNNING';

  if (research.isPending) {
    return <p className="text-micro text-muted">Loading research…</p>;
  }

  if (!data || data.status === 'QUEUED' || (!data.companySummary && data.status !== 'FAILED')) {
    return (
      <div className="card p-5 text-center">
        <h3 className="font-display font-semibold mb-1">
          {running ? 'Reading their website' : 'Not researched yet'}
        </h3>
        <p className="text-micro text-muted mb-4 max-w-sm mx-auto">
          {running
            ? 'Fetching up to eight pages, then checking every finding against what the pages actually say. Takes about a minute.'
            : 'Research reads their site and identifies where manual work is likely costing them time. Every finding is tied to a quote from their own pages.'}
        </p>
        {canRun && (
          <button type="button" className="btn-primary" disabled={running}
                  onClick={() => run.mutate({ leadId })}>
            {running ? <><Loader2 className="size-3.5 animate-spin" /> Researching…</> : 'Research this company'}
          </button>
        )}
      </div>
    );
  }

  if (data.status === 'FAILED') {
    return (
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-4 text-held shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-[13px] font-medium mb-1">Research didn't finish</h3>
            <p className="text-micro text-muted mb-3">{data.error}</p>
            {canRun && (
              <button type="button" className="btn-outline h-8 text-micro" disabled={running}
                      onClick={() => run.mutate({ leadId })}>
                <RefreshCw className="size-3.5" /> Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const painPoints = (data.painPoints ?? []) as unknown as Claim[];
  const opportunities = (data.opportunities ?? []) as unknown as Claim[];
  const citations = data.citations as unknown as {
    report: { totalClaims: number; groundedClaims: number; groundingRate: number; rejectedClaims: Array<{ claim: string; reason: string }> };
  } | null;
  const roi = data.roiAssumptions as unknown as { note: string; perOpportunity: Array<{ title: string; hoursPerMonth: number; annualSavingsCents: number }> } | null;
  const pages = (data.pagesCrawled ?? []) as unknown as Array<{ id: string; url: string; title: string }>;

  return (
    <div className="space-y-5">
      {/* Provenance bar. Confidence and grounding are stated up front, not
          buried — the operator should know how much to trust this before
          reading a word of it. */}
      <div className="card p-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Stat icon={ShieldCheck} label="Findings verified"
              value={citations ? `${citations.report.groundedClaims}/${citations.report.totalClaims}` : '—'}
              tone={citations && citations.report.groundingRate >= 0.8 ? 'cleared' : 'held'} />
        <Stat icon={Info} label="Confidence"
              value={data.confidence != null ? `${Math.round(data.confidence * 100)}%` : '—'} />
        <Stat icon={Clock} label="Hours saved / month"
              value={data.estimatedHoursSavedPerMonth != null ? String(data.estimatedHoursSavedPerMonth) : '—'} />
        <Stat icon={TrendingUp} label="Est. annual savings"
              value={formatMoney(data.estimatedAnnualSavingsCents)} tone="cleared" />
        <div className="flex-1" />
        <span className="num text-[11px] text-muted">{pages.length} pages read</span>
        {canRun && (
          <button type="button" className="btn-ghost h-7 text-micro" disabled={running}
                  onClick={() => run.mutate({ leadId })}>
            <RefreshCw className={cn('size-3.5', running && 'animate-spin')} /> Refresh
          </button>
        )}
      </div>

      {citations && citations.report.rejectedClaims.length > 0 && (
        <details className="card p-3">
          <summary className="text-micro cursor-pointer text-held">
            {citations.report.rejectedClaims.length} unsupported findings were discarded
          </summary>
          <ul className="mt-2 space-y-1.5">
            {citations.report.rejectedClaims.map((r, i) => (
              <li key={i} className="text-[11px] text-muted">
                <span className="text-ink">{r.claim}</span> — {r.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section>
        <h3 className="eyebrow mb-2">Summary</h3>
        <p className="text-[13px] leading-relaxed">{data.companySummary}</p>
        {data.detectedSoftware.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {data.detectedSoftware.map((s) => (
              <span key={s} className="text-[11px] px-2 h-[20px] inline-flex items-center rounded-full bg-raised text-muted">
                {s}
              </span>
            ))}
          </div>
        )}
      </section>

      <ClaimList title="Where time is going" claims={painPoints} onCite={setEvidence} />
      <ClaimList title="Automation opportunities" claims={opportunities} onCite={setEvidence} showEffort />

      {roi && (
        <section>
          <h3 className="eyebrow mb-2">How the estimate is calculated</h3>
          <div className="card p-3">
            <ul className="space-y-1 mb-3">
              {roi.perOpportunity.map((o) => (
                <li key={o.title} className="flex justify-between gap-3 text-micro">
                  <span className="truncate">{o.title}</span>
                  <span className="num text-muted shrink-0">
                    {o.hoursPerMonth} hrs/mo · {formatMoney(o.annualSavingsCents)}/yr
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted leading-relaxed border-t border-hairline pt-2">{roi.note}</p>
          </div>
        </section>
      )}

      {data.talkingPoints.length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Talking points</h3>
          <ul className="space-y-1.5">
            {data.talkingPoints.map((t, i) => (
              <li key={i} className="text-[13px] flex gap-2">
                <span className="num text-muted shrink-0">{String(i + 1).padStart(2, '0')}</span>
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evidence && (
        <EvidenceDrawer leadId={leadId} pageId={evidence.pageId} quote={evidence.quote}
                        onClose={() => setEvidence(null)} />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: {
  icon: typeof Info; label: string; value: string; tone?: 'cleared' | 'held';
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn('size-3.5', tone === 'cleared' ? 'text-cleared' : tone === 'held' ? 'text-held' : 'text-muted')} strokeWidth={1.75} />
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
        <p className={cn('num text-[13px] font-medium', tone === 'cleared' && 'text-cleared', tone === 'held' && 'text-held')}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ClaimList({ title, claims, onCite, showEffort }: {
  title: string;
  claims: Claim[];
  onCite: (c: { pageId: string; quote: string }) => void;
  showEffort?: boolean;
}) {
  if (!claims.length) return null;
  return (
    <section>
      <h3 className="eyebrow mb-2">{title}</h3>
      <ul className="space-y-3">
        {claims.map((claim, i) => (
          <li key={i} className="card p-3.5">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <h4 className="text-[13px] font-medium">{claim.title}</h4>
              <span className={cn(
                'num text-[11px] shrink-0',
                claim.confidence >= 0.75 ? 'text-cleared' : claim.confidence >= 0.5 ? 'text-held' : 'text-muted',
              )}>
                {Math.round(claim.confidence * 100)}% confident
              </span>
            </div>

            <p className="text-micro text-muted leading-relaxed">{claim.rationale ?? claim.workflow}</p>

            {showEffort && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted">
                {claim.hoursPerWeek != null && <span className="num">{claim.hoursPerWeek} hrs/week today</span>}
                {claim.effortDays != null && <span className="num">~{claim.effortDays} days to build</span>}
                {claim.tooling?.length ? <span>{claim.tooling.join(' · ')}</span> : null}
              </div>
            )}

            {/* Citation chips. Clicking one opens the stored page text with the
                quote highlighted — the claim and its proof are one click apart. */}
            <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-hairline">
              {claim.citations.map((c, j) => (
                <button
                  key={j} type="button"
                  onClick={() => onCite({ pageId: c.pageId, quote: c.quote })}
                  title={`“${c.quote}” — ${c.pageTitle}`}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 h-[19px] rounded border border-hairline hover:border-accent hover:text-accent text-muted transition-colors"
                >
                  <span className="num">{c.pageId}</span>
                  <span className="max-w-[140px] truncate">{c.pageTitle}</span>
                  {c.matchType === 'fuzzy' && <span className="text-held" title="Close paraphrase match">~</span>}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
