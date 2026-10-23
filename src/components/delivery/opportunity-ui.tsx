'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Lightbulb, Plus, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/types';
import { useActiveClient } from '@/components/shell/active-client';
import { Topbar } from '@/components/shell/topbar';
import { PageBody, Section } from '@/components/ui/page';
import { Pill, type Tone } from '@/components/ui/pill';
import { Dialog } from '@/components/ui/dialog';
import { Field, ListInput } from '@/components/ui/field';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/states';
import { Ago } from '@/components/ui/time';
import { cn, formatMoney } from '@/lib/utils';

export const OPP_STATUS_LABEL: Record<string, string> = {
  PROPOSED: 'To review', QUALIFIED: 'Qualified', DEMO: 'Demo built', PROPOSAL: 'Proposal', WON: 'Won', REJECTED: 'Rejected', LOST: 'Lost',
};
export const OPP_STATUS_TONE: Record<string, Tone> = { PROPOSED: 'neutral', QUALIFIED: 'accent', DEMO: 'accent', PROPOSAL: 'warning', WON: 'positive', REJECTED: 'neutral', LOST: 'neutral' };
export const REUSE_LABEL: Record<string, string> = { EXACT: 'Exact template', CONFIGURATION: 'Configuration', MODERATE: 'Moderate build', CUSTOM: 'Custom build', NOT_FEASIBLE: 'Not feasible' };
export const REUSE_TONE: Record<string, Tone> = { EXACT: 'positive', CONFIGURATION: 'positive', MODERATE: 'warning', CUSTOM: 'negative', NOT_FEASIBLE: 'neutral' };

const COLUMNS = ['PROPOSED', 'QUALIFIED', 'DEMO', 'PROPOSAL', 'WON'] as const;

export interface DeliveryCaps { write: boolean; review: boolean }

/** The opportunity board: every automation idea from research to won, with the reuse class and projected value on each card. */
export function OpportunityBoard({ caps }: { caps: DeliveryCaps }) {
  const { clientId } = useActiveClient();
  const [closed, setClosed] = useState(false);
  const list = trpc.delivery.opportunities.useQuery({ clientId, limit: 200 }, { refetchInterval: 30_000 });
  const items = list.data?.items ?? [];
  return (
    <>
      <Topbar title="Opportunities" />
      <PageBody width="full" className="space-y-4">
        <p className="text-micro text-muted max-w-3xl">
          Automation ideas from deep research or added by hand. Each is matched to a template, classified for reuse and estimated; a person qualifies it before any demo or proposal. Values are projections from stated inputs, not measured results.
        </p>
        <ErrorNote error={list.error} />
        {list.isPending ? <Loading /> : !items.length ? (
          <EmptyState icon={Lightbulb} title="No opportunities yet">
            Run deep research on an account, then use “Get opportunities from research” on the account page, or add one there by hand.
          </EmptyState>
        ) : (
          <>
            <div className="grid grid-flow-col auto-cols-[minmax(190px,1fr)] gap-3 overflow-x-auto pb-2">
              {COLUMNS.map((status) => {
                const col = items.filter((o) => o.status === status);
                return (
                  <section key={status} className="min-w-0">
                    <h2 className="eyebrow mb-2 flex items-center gap-2">{OPP_STATUS_LABEL[status]} <span className="num">{list.data?.counts[status] ?? 0}</span></h2>
                    <ul className="space-y-2">
                      {col.map((o) => <OpportunityCard key={o.id} o={o} />)}
                      {!col.length && <li className="text-[11px] text-muted card p-3">None</li>}
                    </ul>
                  </section>
                );
              })}
            </div>
            <button type="button" className="btn-ghost h-7 text-[11px]" onClick={() => setClosed((c) => !c)}>
              {closed ? 'Hide' : 'Show'} rejected and lost ({(list.data?.counts.REJECTED ?? 0) + (list.data?.counts.LOST ?? 0)})
            </button>
            {closed && (
              <ul className="grid md:grid-cols-3 xl:grid-cols-5 gap-2">
                {items.filter((o) => o.status === 'REJECTED' || o.status === 'LOST').map((o) => <OpportunityCard key={o.id} o={o} />)}
              </ul>
            )}
          </>
        )}
        {!caps.write && <p className="text-[11px] text-muted">You can view opportunities; adding and assessing them needs account edit rights.</p>}
      </PageBody>
    </>
  );
}

type Item = RouterOutputs['delivery']['opportunities']['items'][number];

/** The estimate priced at the rate card: setup plus the recurring fee. An estimate, not a quote. */
function PriceLine({ price }: { price: NonNullable<Item['price']> }) {
  return (
    <p className="text-[11px] text-muted mt-1" title="From the effort estimate and your rate card. A proposal is priced the same way once a person has assessed it.">
      Estimate at rate card: <span className="num">{formatMoney(price.setupCents, price.currency)}</span> setup
      {price.monthlyCents > 0 && <> + <span className="num">{formatMoney(price.monthlyCents, price.currency)}</span>/mo</>}
    </p>
  );
}

function OpportunityCard({ o }: { o: Item }) {
  return (
    <li>
      <Link href={`/opportunities/${o.id}`} className="card p-3 block hover:border-accent/50 transition-colors">
        <p className="text-micro font-medium leading-snug">{o.title}</p>
        <p className="text-[11px] text-muted mt-0.5 truncate">{o.account.name}{o.account.city ? ` · ${o.account.city}` : ''}</p>
        <div className="flex flex-wrap items-center gap-1 mt-2">
          {o.reusability && <Pill tone={REUSE_TONE[o.reusability] ?? 'neutral'}>{REUSE_LABEL[o.reusability]}</Pill>}
          {o.estimatedBuildHours !== null && <span className="text-[11px] text-muted num">~{o.estimatedBuildHours} h</span>}
        </div>
        {o.price && <PriceLine price={o.price} />}
        {o.projection && (
          <p className="text-[11px] text-muted mt-1">
            Projected <span className="num">{formatMoney(o.projection.low.monthlyValueCents)}–{formatMoney(o.projection.high.monthlyValueCents)}</span>/mo
          </p>
        )}
        <p className="text-[10px] text-muted mt-1">{o.source === 'DEEP_RESEARCH' ? 'From research' : 'Added by hand'} · <Ago date={o.updatedAt} /></p>
      </Link>
    </li>
  );
}

/** On the account page: this account's opportunities, and ways to add them. */
export function AccountOpportunities({ accountId, caps }: { accountId: string; caps: DeliveryCaps }) {
  const utils = trpc.useUtils();
  const list = trpc.delivery.opportunities.useQuery({ accountId, limit: 50 });
  const sync = trpc.delivery.syncFromResearch.useMutation({ onSuccess: () => utils.delivery.opportunities.invalidate() });
  const [adding, setAdding] = useState(false);
  const items = list.data?.items ?? [];
  return (
    <Section title="Automation opportunities"
             action={caps.write && (
               <div className="flex gap-1">
                 <button type="button" className="btn-ghost h-7 text-[11px]" disabled={sync.isPending} onClick={() => sync.mutate({ accountId })} title="From the latest deep research">
                   <RefreshCw className={cn('size-3', sync.isPending && 'animate-spin')} /> From research
                 </button>
                 <button type="button" className="btn-ghost h-7 text-[11px]" onClick={() => setAdding(true)}><Plus className="size-3" /> Add</button>
               </div>
             )}>
      <ErrorNote error={list.error ?? sync.error} />
      {sync.data && <p className="text-[11px] text-muted mb-1">{sync.data.created} new from research version {sync.data.researchVersion}.</p>}
      {list.isPending ? <Loading /> : !items.length ? <p className="text-micro text-muted">None yet.</p> : (
        <ul className="card divide-y divide-hairline">
          {items.map((o) => (
            <li key={o.id} className="p-3 text-micro">
              <Link href={`/opportunities/${o.id}`} className="font-medium hover:underline">{o.title}</Link>
              <div className="flex flex-wrap gap-1 mt-1">
                <Pill tone={OPP_STATUS_TONE[o.status] ?? 'neutral'}>{OPP_STATUS_LABEL[o.status] ?? o.status}</Pill>
                {o.reusability && <Pill tone={REUSE_TONE[o.reusability] ?? 'neutral'}>{REUSE_LABEL[o.reusability]}</Pill>}
              </div>
              {o.price && <PriceLine price={o.price} />}
            </li>
          ))}
        </ul>
      )}
      {adding && <AddOpportunity accountId={accountId} onClose={() => setAdding(false)} />}
    </Section>
  );
}

function AddOpportunity({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ title: '', problem: '', proposedAutomation: '', integrationBarriers: [] as string[] });
  const create = trpc.delivery.create.useMutation({ onSuccess: () => { utils.delivery.opportunities.invalidate(); onClose(); } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add an opportunity" description="It is matched to a template and estimated automatically; you can change both.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate({ accountId, ...form }); }}>
        <Field label="Title">{(id) => <input id={id} className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={200} />}</Field>
        <Field label="The problem today">{(id) => <textarea id={id} className="input h-20 py-2" value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} required minLength={3} />}</Field>
        <Field label="What would be automated">{(id) => <textarea id={id} className="input h-20 py-2" value={form.proposedAutomation} onChange={(e) => setForm({ ...form, proposedAutomation: e.target.value })} required minLength={3} />}</Field>
        <Field label="Integration barriers" hint="e.g. “ERP has no API”. Enter or comma adds.">{(id) => <ListInput id={id} value={form.integrationBarriers} onChange={(v) => setForm({ ...form, integrationBarriers: v })} max={10} />}</Field>
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={create.isPending}>Add</button></div>
      </form>
    </Dialog>
  );
}
