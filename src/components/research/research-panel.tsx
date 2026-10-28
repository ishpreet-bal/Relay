'use client';

import { useState } from 'react';
import type { ClaimType } from '@prisma/client';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Quote, RefreshCw, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { CLAIM_TYPE_LABELS } from '@/lib/domain';
import { Pill } from '@/components/ui/pill';
import { Ago } from '@/components/ui/time';
import { EvidenceDrawer } from './evidence-drawer';

interface Citation { pageId: string; quote: string; url: string; pageTitle: string; matchType: string; similarity: number }
interface Fact { id: string; claimType: ClaimType; statement: string; citations: Citation[] }
interface Angle { offer?: string | null; angle: string; reasoning: string; confidence: number; citations: Citation[] }
interface Attribute { attribute: string; assessment: 'MET' | 'NOT_MET' | 'UNKNOWN'; note: string; citations: Citation[] }
interface Report { totalClaims: number; groundedClaims: number; groundingRate: number; rejectedClaims: Array<{ claim: string; reason: string }> }

/**
 * Research, framed by the client's offer: what the company does, why it
 * might care, and how it measures against the ICP. Everything shown here
 * survived verification against the crawled pages, and every item opens
 * the passage it came from.
 */
export function ResearchPanel({ accountId, canRun, hasWebsite }: { accountId: string; canRun: boolean; hasWebsite: boolean }) {
  const [evidence, setEvidence] = useState<Citation | null>(null);
  const utils = trpc.useUtils();
  const research = trpc.research.byAccount.useQuery({ accountId });
  const run = trpc.research.run.useMutation({
    onSettled: () => {
      utils.research.byAccount.invalidate({ accountId });
      utils.accounts.byId.invalidate({ id: accountId });
      utils.accounts.brief.invalidate({ id: accountId });
      utils.accounts.timeline.invalidate({ accountId });
    },
  });

  const data = research.data;
  const running = run.isPending || data?.status === 'RUNNING';

  if (research.isPending) return <p className="text-micro text-muted">Loading research…</p>;

  const runButton = canRun && hasWebsite && (
    <button type="button" className="btn-outline h-8 text-micro" disabled={running} onClick={() => run.mutate({ accountId })}>
      {running ? <><Loader2 className="size-3.5 animate-spin" /> Researching…</> : <><RefreshCw className="size-3.5" /> {data?.status === 'COMPLETED' ? 'Refresh' : 'Research'}</>}
    </button>
  );

  if (!data || data.status === 'QUEUED' || (data.status !== 'FAILED' && data.status !== 'COMPLETED')) {
    return (
      <div className="card p-5 text-center">
        <h3 className="font-display font-semibold mb-1">{running ? 'Reading their website' : data?.status === 'QUEUED' ? 'Queued for research' : 'Not researched yet'}</h3>
        <p className="text-micro text-muted mb-4 max-w-sm mx-auto">
          {!hasWebsite
            ? 'This account has no website on file. Add one to research it, or work it from other sources.'
            : running
              ? 'Reading up to sixteen pages, then checking every finding against what the pages actually say. About a minute.'
              : 'Research reads their site for facts, signals and reasons they might need what this client sells. Anything that cannot be traced to a quote is discarded.'}
        </p>
        {runButton}
        {run.error && <p className="text-[12px] text-blocked mt-3">{run.error.message}</p>}
      </div>
    );
  }

  if (data.status === 'FAILED') {
    return (
      <div className="card p-5 flex items-start gap-3">
        <AlertTriangle className="size-4 text-held shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-[13px] font-medium mb-1">Research didn&apos;t finish</h3>
          <p className="text-micro text-muted mb-3">{data.error}</p>
          {runButton}
        </div>
      </div>
    );
  }

  const facts = (data.facts ?? []) as unknown as Fact[];
  const relevance = (data.relevance ?? {}) as unknown as { angles?: Angle[]; attributes?: Attribute[] };
  const report = (data.citations as unknown as { report?: Report } | null)?.report;
  const angles = relevance.angles ?? [];
  const attributes = relevance.attributes ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {data.companySummary && <p className="text-sm leading-relaxed">{data.companySummary}</p>}
          <p className="text-[11px] text-muted mt-1.5">
            Researched <Ago date={data.refreshedAt} />
            {report && <> · {report.groundedClaims} of {report.totalClaims} findings verified{report.rejectedClaims.length > 0 && `, ${report.rejectedClaims.length} discarded`}</>}
          </p>
        </div>
        {runButton}
      </div>

      {data.servicesOffered.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.servicesOffered.map((s) => <Pill key={s}>{s}</Pill>)}
        </div>
      )}

      {angles.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Why they might care</h3>
          <ul className="space-y-2">
            {angles.map((a, i) => (
              <li key={i} className="card p-3">
                <div className="flex items-start gap-2">
                  <p className="text-[13px] font-medium flex-1">{a.angle}</p>
                  {a.offer && <Pill>{a.offer}</Pill>}
                  <span className="num text-[11px] text-muted" title="Model confidence after verification">{Math.round(a.confidence * 100)}%</span>
                </div>
                <p className="text-micro text-muted mt-1">{a.reasoning}</p>
                <Citations citations={a.citations} onOpen={setEvidence} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {attributes.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">ICP checks</h3>
          <ul className="card divide-y divide-hairline">
            {attributes.map((a, i) => {
              const Icon = a.assessment === 'MET' ? CheckCircle2 : a.assessment === 'NOT_MET' ? XCircle : CircleDashed;
              const tone = a.assessment === 'MET' ? 'text-cleared' : a.assessment === 'NOT_MET' ? 'text-blocked' : 'text-muted';
              return (
                <li key={i} className="p-3 flex items-start gap-2.5">
                  <Icon className={`size-4 shrink-0 mt-0.5 ${tone}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px]">{a.attribute}</p>
                    {a.note && <p className="text-[11px] text-muted">{a.note}</p>}
                    {a.assessment === 'UNKNOWN' && !a.note && <p className="text-[11px] text-muted">Their site doesn&apos;t say. Worth asking on a call.</p>}
                    <Citations citations={a.citations} onOpen={setEvidence} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {facts.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Verified facts <span className="normal-case tracking-normal">· the only things a draft may say about them</span></h3>
          <ul className="card divide-y divide-hairline">
            {facts.map((f) => (
              <li key={f.id} className="p-3">
                <div className="flex items-start gap-2">
                  <p className="text-[13px] flex-1">{f.statement}</p>
                  <Pill>{CLAIM_TYPE_LABELS[f.claimType] ?? f.claimType}</Pill>
                </div>
                <Citations citations={f.citations} onOpen={setEvidence} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && report.rejectedClaims.length > 0 && (
        <details className="text-micro">
          <summary className="cursor-pointer text-muted">Discarded during verification ({report.rejectedClaims.length})</summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc text-muted">
            {report.rejectedClaims.map((r, i) => <li key={i}>{r.claim} — <span className="italic">{r.reason}</span></li>)}
          </ul>
        </details>
      )}

      {evidence && (
        <EvidenceDrawer accountId={accountId} pageId={evidence.pageId} quote={evidence.quote} onClose={() => setEvidence(null)} />
      )}
    </div>
  );
}

function Citations({ citations, onOpen }: { citations: Citation[]; onOpen: (c: Citation) => void }) {
  if (!citations.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {citations.map((c, i) => (
        <button key={i} type="button" onClick={() => onOpen(c)} title={`“${c.quote}”`}
                className="inline-flex items-center gap-1 h-6 px-2 rounded bg-raised text-[11px] text-muted hover:text-accent max-w-[260px]">
          <Quote className="size-3 shrink-0" />
          <span className="truncate">{c.pageTitle || c.url}</span>
        </button>
      ))}
    </div>
  );
}
