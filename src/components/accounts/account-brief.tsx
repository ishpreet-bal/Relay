'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, ExternalLink, FileSearch, Phone, RefreshCw, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Pill } from '@/components/ui/pill';
import { ErrorNote } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';

export function AccountBrief({ accountId, canWrite }: { accountId: string; canWrite: boolean }) {
  const utils = trpc.useUtils();
  const brief = trpc.accounts.brief.useQuery({ id: accountId }, {
    refetchInterval: (query) => query.state.data?.jobs.some((j) => ['QUEUED', 'RUNNING', 'RETRYING'].includes(j.status)) ? 5000 : false,
  });
  const resolve = trpc.accounts.resolveContacts.useMutation({ onSuccess: () => { utils.accounts.brief.invalidate({ id: accountId }); utils.accounts.byId.invalidate({ id: accountId }); } });
  const b = brief.data;
  if (brief.error) return <ErrorNote error={brief.error} />;
  if (!b) return <p className="text-micro text-muted">Loading account brief…</p>;
  const money = (cents: number, currency: string) => new Intl.NumberFormat('en-CA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  const coverage = b.coverage as { coverage?: { visited: number; discovered: number; truncated: boolean }; errors?: Array<{ url: string; reason: string }> } | null;
  const resolution = b.contactResolution as { state?: string; issues?: string[] } | null;
  return (
    <section className="card overflow-hidden" aria-label="Account brief">
      <div className="bg-ink text-white p-5 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0"><p className="text-[10px] uppercase tracking-[0.18em] text-white/60">Prospect intelligence</p>
          <h2 className="text-lg font-semibold mt-1">The reason to reach out.</h2>
          <p className="text-micro text-white/70 mt-1">Evidence, contact routes and a concrete starting point.</p></div>
        <Pill tone={b.state === 'READY_FOR_REVIEW' ? 'positive' : b.suppressed ? 'negative' : 'warning'}>{b.state.toLowerCase().replaceAll('_', ' ')}</Pill>
      </div>
      <div className="p-4 sm:p-5 space-y-5">
        {b.issues.length > 0 && <div className="rounded-lg bg-held/10 p-3"><ul className="space-y-1 text-micro">{b.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
        <div className="grid xl:grid-cols-2 gap-5">
          <div><h3 className="eyebrow flex items-center gap-2"><FileSearch className="size-3.5" /> Who they are / what they do</h3>
            {b.facts.length ? <ul className="mt-2 space-y-2">{b.facts.slice(0, 4).map((f) => <li key={f.id} className="text-micro">
              <p>{f.statement}</p><a className="text-accent inline-flex items-center gap-1 mt-1" href={f.citations[0]!.url} target="_blank" rel="noopener noreferrer">Source <ExternalLink className="size-3" /></a>
            </li>)}</ul> : <p className="text-micro text-muted mt-2">Run research to establish the business facts.</p>}
          </div>
          <div><div className="flex flex-wrap items-center gap-2"><h3 className="eyebrow flex-1">How to contact them</h3>
            {canWrite && !b.suppressed && <button type="button" className="btn-outline h-8 text-micro" disabled={resolve.isPending || b.jobs.some((j) => j.type === 'CONTACT_ENRICHMENT' && ['QUEUED', 'RUNNING', 'RETRYING'].includes(j.status))} onClick={() => resolve.mutate({ id: accountId })}><RefreshCw className="size-3" />Resolve contacts</button>}</div>
            <ErrorNote error={resolve.error} />
            {b.contacts.length === 0 ? <p className="text-micro text-muted mt-2">No contact recorded. Resolve contacts, or check the published contact page.</p> : <ul className="mt-2 space-y-2">{b.contacts.slice(0, 5).map((c) => <li key={c.id} className="rounded-lg border border-hairline p-3 text-micro">
              <Link className="font-medium hover:text-accent" href={`/contacts/${c.id}`}>{c.name}</Link>
              <p className="text-muted">{c.title}</p>
              {c.email && <p className="break-all mt-1">{c.email} <span className={c.verified ? 'text-cleared' : 'text-held'}>· {c.doNotEmail ? 'suppressed' : c.verified ? 'verified recently' : 'verification required'}</span></p>}
              {c.phone && <p className="mt-1">{c.phone}{c.doNotCall && ' · do not call'}</p>}
              <p className="mt-1 text-[11px] text-muted">{c.consentBasis === 'UNKNOWN' ? 'Outreach basis needs review' : `Recorded basis: ${c.consentBasis.toLowerCase().replaceAll('_', ' ')}`} · {c.provider ?? 'manual'}</p>
              {c.sourceUrl && <a className="inline-flex items-center gap-1 mt-1 text-accent" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">Published source <ExternalLink className="size-3" /></a>}
            </li>)}</ul>}
            {b.phone && <p className="text-micro mt-2 flex items-center gap-2"><Phone className="size-3.5" /> Business line: {b.phone} · review before calling</p>}
            {resolution?.issues?.map((i) => <p className="text-[11px] text-muted mt-2" key={i}>{i}</p>)}
          </div>
        </div>
        {b.workflows.map((w) => <article key={w.key} className="rounded-xl border border-hairline overflow-hidden">
          <div className="p-4 bg-surface/60"><p className="eyebrow text-accent">Possible fit · confirm with the business</p><h3 className="font-semibold mt-1">{w.name}</h3><p className="text-micro text-muted mt-1">{w.question}</p></div>
          <div className="p-4 grid md:grid-cols-2 gap-5 text-micro">
            <div><p className="font-medium">Exactly what we would automate</p><p className="text-muted mt-1">Trigger: {w.trigger}</p>
              <ol className="mt-2 space-y-1 list-decimal pl-4">{w.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              <p className="mt-3"><span className="font-medium">Deliverable:</span> {w.output}</p>
              <Link href={`/demos/${w.demo}`} className="inline-flex items-center gap-1 text-accent mt-3">Try the sample workflow <ArrowRight className="size-3" /></Link>
            </div>
            <div><p className="font-medium">Planning price · {w.price.currency}</p>
              <p className="text-xl font-semibold num mt-1">{money(w.price.setupLowCents, w.price.currency)}–{money(w.price.setupHighCents, w.price.currency)}</p>
              <p className="text-muted">setup + {money(w.price.monthlyCents, w.price.currency)}/month estimated</p>
              <p className="text-[11px] text-muted mt-2">{w.price.label}. {w.buildHours[0]}–{w.buildHours[1]} build hours, {w.price.contingencyPct}% setup contingency. {w.price.planningDefaults && 'Uses starter cost assumptions; replace before quoting.'}</p>
              <details className="mt-3"><summary className="cursor-pointer font-medium">Inputs, scope and price assumptions</summary><ul className="list-disc pl-4 mt-2 space-y-1">{[...w.inputs, ...w.exclusions.map((s) => `Excluded: ${s}`), ...w.price.assumptions].map((s) => <li key={s}>{s}</li>)}</ul></details>
            </div>
            <div><p className="font-medium flex items-center gap-1"><ShieldCheck className="size-3.5" /> Human review and recovery</p><p className="mt-1">{w.humanReview}</p><p className="text-muted mt-2">{w.failurePlan}</p></div>
            <div><p className="font-medium">Ask before proposing</p><ul className="list-disc pl-4 mt-1 space-y-1">{w.validation.map((s) => <li key={s}>{s}</li>)}</ul></div>
          </div>
        </article>)}
        {b.offers.length > 0 && b.workflows.length === 0 && <div><h3 className="eyebrow">This client’s offers</h3><ul className="mt-2 space-y-2 text-micro">{b.offers.map((o) => <li key={o.name}><span className="font-medium">{o.name}:</span> {o.summary}</li>)}</ul><p className="text-[11px] text-muted mt-2">Use the sourced relevance angles below to choose which offer fits.</p></div>}
        <div className="border-t border-hairline pt-3 text-[11px] text-muted space-y-1">
          <p className="flex items-center gap-1"><CheckCircle2 className="size-3" />{b.nextStep}</p>
          <p>Research: <Ago date={b.researchedAt} />{coverage?.coverage && ` · ${coverage.coverage.visited} pages attempted of ${coverage.coverage.discovered} discovered${coverage.coverage.truncated ? ' · page limit reached' : ''}`}. Public pages cannot reveal private processes or every internal need.</p>
          {!!coverage?.errors?.length && <details><summary className="cursor-pointer">{coverage.errors.length} crawl limitations</summary><ul className="mt-1 space-y-1">{coverage.errors.map((e, i) => <li key={i} className="break-all">{e.url}: {e.reason}</li>)}</ul></details>}
          {b.jobs.map((j, i) => <p key={i}>{j.type.toLowerCase().replaceAll('_', ' ')}: {j.status.toLowerCase()}{j.error ? ` · ${j.error}` : ''}</p>)}
        </div>
      </div>
    </section>
  );
}
