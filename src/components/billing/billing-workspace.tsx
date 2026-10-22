'use client';

import { useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Kpi } from '@/components/ui/kpi';
import { Pill, type Tone } from '@/components/ui/pill';
import { Table, Td, Th } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { DateTime } from '@/components/ui/time';
import { cn, formatMoneyExact } from '@/lib/utils';

const SUB_TONE: Record<string, Tone> = { DRAFT: 'neutral', ACTIVE: 'positive', PAST_DUE: 'warning', CANCELLED: 'neutral' };
const INV_TONE: Record<string, Tone> = { DRAFT: 'neutral', OPEN: 'accent', PAID: 'positive', VOID: 'neutral', UNCOLLECTIBLE: 'negative' };
const money = (byCurrency: Record<string, number> | undefined) => {
  const entries = Object.entries(byCurrency ?? {});
  return entries.length ? entries.map(([c, v]) => formatMoneyExact(v, c)).join(' + ') : formatMoneyExact(0);
};
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Customer subscriptions, invoices, recurring revenue and margin, from recorded data. */
export function BillingWorkspace() {
  const { clientId } = useActiveClient();
  const [month, setMonth] = useState(thisMonth());
  const [creating, setCreating] = useState(false);
  const utils = trpc.useUtils();
  const refresh = () => utils.billing.invalidate();
  const mode = trpc.billing.mode.useQuery();
  const summary = trpc.billing.summary.useQuery({ month });
  const history = trpc.billing.mrrHistory.useQuery({ months: 6 });
  const subs = trpc.billing.subscriptions.useQuery({ clientId });
  const invoices = trpc.billing.invoices.useQuery({ clientId });
  const profit = trpc.billing.profitability.useQuery({ month });
  const authorize = trpc.billing.authorize.useMutation({ onSuccess: refresh });
  const cancel = trpc.billing.cancel.useMutation({ onSuccess: refresh });
  const paid = trpc.billing.markPaid.useMutation({ onSuccess: refresh });
  const voidInv = trpc.billing.void.useMutation({ onSuccess: refresh });
  const s = summary.data;

  return (
    <>
      <Topbar title="Billing"
              actions={<button type="button" className="btn-primary h-8 text-micro" onClick={() => setCreating(true)}><Plus className="size-3.5" /> New subscription</button>} />
      <PageBody width="wide" className="space-y-8">
        {mode.data && (
          <p className={cn('text-micro card p-3', mode.data.stripe === 'live' && !mode.data.liveChargesEnabled && 'border-held/50')}>
            Stripe: <strong>{mode.data.stripe === 'unconfigured' ? 'not configured' : `${mode.data.stripe} mode`}</strong>.{' '}
            {mode.data.stripe === 'unconfigured' && 'Ledger subscriptions work now (Relay issues the invoices; you record payment). Add a Stripe test key to try Stripe billing.'}
            {mode.data.stripe === 'test' && 'Stripe subscriptions use test mode; no real card is charged.'}
            {mode.data.stripe === 'live' && (mode.data.liveChargesEnabled ? 'Live charges are enabled for customer subscriptions.' : 'Live charges are switched off (CUSTOMER_BILLING_LIVE is not set); Stripe subscriptions will be refused.')}
            {' '}Nothing is invoiced until you authorise a subscription.
          </p>
        )}
        <ErrorNote error={authorize.error ?? cancel.error ?? paid.error ?? voidInv.error} />

        <div className="flex items-end gap-3">
          <Field label="Month">{(id) => <input id={id} type="month" className="input w-44" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} />}</Field>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="MRR" value={s ? money(s.mrrCents) : '—'} caption={s ? `ARR ${money(s.arrCents)}` : undefined} />
          <Kpi label="Active customers" value={s?.activeCustomers ?? '—'} caption={s ? `${s.activeSubscriptions} subscriptions · ${s.churnedSubscriptions} cancelled this month` : undefined} />
          <Kpi label="Invoiced" value={s ? money(s.invoicedCents) : '—'} caption={s ? `collected ${money(s.collectedCents)}` : undefined} />
          <Kpi label="Outstanding" value={s ? money(s.outstandingCents) : '—'} caption={s ? `overdue ${money(s.overdueCents)}` : undefined} tone={s && Object.values(s.overdueCents).some((v) => v > 0) ? 'warning' : undefined} />
        </div>
        <ErrorNote error={summary.error} />

        {history.data && (
          <Section title="MRR, last six months">
            <div className="card p-3 grid grid-cols-6 gap-2 text-micro">
              {history.data.map((h) => (
                <div key={h.month}><p className="text-muted">{h.month}</p><p className="num">{money(h.mrrCents)}</p></div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Subscriptions">
          <ErrorNote error={subs.error} />
          {subs.isPending ? <Loading /> : !subs.data?.length ? (
            <EmptyState icon={CreditCard} title="No subscriptions">Create one from a delivery project (its accepted price) or by hand.</EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Customer</Th><Th>Subscription</Th><Th>Status</Th><Th className="text-right">Monthly</Th><Th className="text-right">Runs this period</Th><Th>Period ends</Th><Th /></tr></thead>
              <tbody>
                {subs.data.map((x) => (
                  <tr key={x.id}>
                    <Td>{x.client.name}</Td>
                    <Td>{x.name} <span className="text-[11px] text-muted">· {x.provider}{x.livemode ? ' (live)' : ''}</span></Td>
                    <Td><Pill tone={SUB_TONE[x.status] ?? 'neutral'}>{x.status.toLowerCase().replace('_', ' ')}</Pill>{x.cancelAtPeriodEnd && x.status !== 'CANCELLED' && <span className="text-[11px] text-held"> · ends at period end</span>}</Td>
                    <Td className="text-right num">{formatMoneyExact(x.monthlyCents, x.currency)}{x.setupFeeCents ? <span className="text-[11px] text-muted"> + {formatMoneyExact(x.setupFeeCents, x.currency)} setup</span> : null}</Td>
                    <Td className="text-right num">{x.runsThisPeriod ?? '—'}<span className="text-[11px] text-muted"> / {x.includedRuns} incl.</span></Td>
                    <Td className="text-muted">{x.currentPeriodEnd ? <DateTime date={x.currentPeriodEnd} pattern="d MMM yyyy" /> : '—'}</Td>
                    <Td className="text-right whitespace-nowrap">
                      {x.status === 'DRAFT' && (
                        <button type="button" className="btn-primary h-7 text-[11px]" disabled={authorize.isPending}
                                onClick={() => { if (confirm(`Authorise billing ${x.client.name} ${formatMoneyExact(x.monthlyCents, x.currency)}/month${x.setupFeeCents ? ` plus ${formatMoneyExact(x.setupFeeCents, x.currency)} setup` : ''} via ${x.provider}?`)) authorize.mutate({ id: x.id }); }}>
                          Authorise
                        </button>
                      )}
                      {['ACTIVE', 'PAST_DUE'].includes(x.status) && !x.cancelAtPeriodEnd && (
                        <button type="button" className="btn-ghost h-7 text-[11px]" disabled={cancel.isPending} onClick={() => { if (confirm('Cancel at the end of the current period?')) cancel.mutate({ id: x.id, atPeriodEnd: true }); }}>Cancel at period end</button>
                      )}
                      {['ACTIVE', 'PAST_DUE', 'DRAFT'].includes(x.status) && (
                        <button type="button" className="btn-ghost h-7 text-[11px] text-blocked" disabled={cancel.isPending} onClick={() => { if (confirm('Cancel now? A final, prorated invoice is issued for the part-period.')) cancel.mutate({ id: x.id, atPeriodEnd: false }); }}>Cancel now</button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <Section title="Invoices" hint="Ledger invoices are issued by Relay and marked paid here; Stripe invoices are mirrored from Stripe.">
          <ErrorNote error={invoices.error} />
          {invoices.isPending ? <Loading /> : !invoices.data?.length ? <p className="card p-4 text-micro text-muted">No invoices yet.</p> : (
            <Table>
              <thead><tr><Th>Number</Th><Th>Subscription</Th><Th>Kind</Th><Th>Issued</Th><Th className="text-right">Total</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {invoices.data.map((i) => (
                  <tr key={i.id}>
                    <Td className="font-mono text-[12px]">{i.number}</Td>
                    <Td>{i.subscription.name}</Td>
                    <Td className="text-muted">{i.kind.toLowerCase()}</Td>
                    <Td className="text-muted"><DateTime date={i.issuedAt} pattern="d MMM yyyy" /></Td>
                    <Td className="text-right num">{formatMoneyExact(i.totalCents, i.currency)}</Td>
                    <Td><Pill tone={INV_TONE[i.status] ?? 'neutral'}>{i.status.toLowerCase()}</Pill></Td>
                    <Td className="text-right whitespace-nowrap">
                      {i.provider === 'ledger' && i.status === 'OPEN' && (
                        <>
                          <button type="button" className="btn-ghost h-7 text-[11px]" disabled={paid.isPending} onClick={() => paid.mutate({ id: i.id })}>Mark paid</button>
                          <button type="button" className="btn-ghost h-7 text-[11px]" disabled={voidInv.isPending} onClick={() => { if (confirm(`Void invoice ${i.number}?`)) voidInv.mutate({ id: i.id }); }}>Void</button>
                        </>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <Section title={`Customer margin, ${month}`} hint="Revenue invoiced that month, minus delivery time (at your internal hourly cost) and the template's infrastructure estimate. Provider costs are listed in their own currency and not converted.">
          <ErrorNote error={profit.error} />
          {profit.isPending ? <Loading /> : !profit.data?.length ? <p className="card p-4 text-micro text-muted">No billed customers.</p> : (
            <Table>
              <thead><tr><Th>Customer</Th><Th className="text-right">Revenue</Th><Th className="text-right">Delivery</Th><Th className="text-right">Infra (est.)</Th><Th className="text-right">Margin</Th><Th>Provider costs</Th></tr></thead>
              <tbody>
                {profit.data.map((p) => (
                  <tr key={p.clientId}>
                    <Td>{p.name}</Td>
                    <Td className="text-right num">{formatMoneyExact(p.revenueCents, p.currency)}</Td>
                    <Td className="text-right num">{formatMoneyExact(p.deliveryCostCents, p.currency)} <span className="text-[11px] text-muted">{p.deliveryHours} h</span></Td>
                    <Td className="text-right num text-muted">{formatMoneyExact(p.infraEstimateCents, p.currency)}</Td>
                    <Td className={cn('text-right num', p.marginCents < 0 && 'text-blocked')}>{formatMoneyExact(p.marginCents, p.currency)}{p.marginPct !== null && <span className="text-[11px] text-muted"> {p.marginPct}%</span>}</Td>
                    <Td className="text-muted text-[11px]">{p.providerCosts.length ? p.providerCosts.map((c) => formatMoneyExact(c.cents, c.currency)).join(', ') : '—'}{p.acquisitionResearchCents ? ` · research to win: ${formatMoneyExact(p.acquisitionResearchCents, 'USD')}` : ''}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      </PageBody>
      {creating && <NewSubscription onClose={() => setCreating(false)} onCreated={refresh} />}
    </>
  );
}

function NewSubscription({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { clients } = useActiveClient();
  const projects = trpc.delivery.projects.useQuery({});
  const [projectId, setProjectId] = useState('');
  const [form, setForm] = useState({ clientId: clients[0]?.id ?? '', name: '', monthly: '0', setup: '0', includedRuns: '1000', overagePerRun: '0', provider: 'ledger' as 'ledger' | 'stripe' });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const done = { onSuccess: () => { onCreated(); onClose(); } };
  const fromProject = trpc.billing.draftFromProject.useMutation(done);
  const create = trpc.billing.create.useMutation(done);
  const cents = (s: string) => Math.round(Number(s || 0) * 100);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="New subscription" description="Saved as a draft. Nothing is invoiced or sent to Stripe until you authorise it.">
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        const usage = { includedRuns: Number(form.includedRuns || 0), overageMillicentsPerRun: Math.round(Number(form.overagePerRun || 0) * 100_000), provider: form.provider };
        if (projectId) fromProject.mutate({ projectId, ...usage });
        else create.mutate({ clientId: form.clientId, name: form.name, monthlyCents: cents(form.monthly), setupFeeCents: cents(form.setup), ...usage });
      }}>
        <Field label="From a delivery project" hint="Uses the accepted proposal's setup and monthly price.">{(id) => (
          <select id={id} className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No, enter the terms</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatMoneyExact(p.priceSetupCents)} + {formatMoneyExact(p.priceMonthlyCents)}/mo)</option>)}
          </select>
        )}</Field>
        {!projectId && (
          <>
            <Field label="Customer">{(id) => (
              <select id={id} className="input" value={form.clientId} onChange={(e) => set('clientId', e.target.value)} required>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}</Field>
            <Field label="Name">{(id) => <input id={id} className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={120} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly ($)">{(id) => <input id={id} type="number" min={0} step={0.01} className="input" value={form.monthly} onChange={(e) => set('monthly', e.target.value)} />}</Field>
              <Field label="Setup fee ($)">{(id) => <input id={id} type="number" min={0} step={0.01} className="input" value={form.setup} onChange={(e) => set('setup', e.target.value)} />}</Field>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Runs included per month">{(id) => <input id={id} type="number" min={0} className="input" value={form.includedRuns} onChange={(e) => set('includedRuns', e.target.value)} />}</Field>
          <Field label="Price per extra run ($)">{(id) => <input id={id} type="number" min={0} step={0.001} className="input" value={form.overagePerRun} onChange={(e) => set('overagePerRun', e.target.value)} />}</Field>
        </div>
        <Field label="Billing through">{(id) => (
          <select id={id} className="input" value={form.provider} onChange={(e) => set('provider', e.target.value as 'ledger' | 'stripe')}>
            <option value="ledger">Relay ledger (you record payment)</option>
            <option value="stripe">Stripe (emailed invoices)</option>
          </select>
        )}</Field>
        <ErrorNote error={create.error ?? fromProject.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={create.isPending || fromProject.isPending}>Save draft</button></div>
      </form>
    </Dialog>
  );
}
